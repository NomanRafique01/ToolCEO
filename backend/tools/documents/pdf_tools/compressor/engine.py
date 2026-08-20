"""
PDF Compressor engine.

All compression logic lives here, fully offline using PyMuPDF (fitz) and
fontTools (for proper font subsetting).

Public API
----------
get_pdf_info(data, password)
    Return page count + first-page thumbnail (same contract as merger/engine.py,
    reused by the compressor frontend to show a preview card).

compress_pdf(data, options, password)
    Apply every requested compression operation and return the compressed bytes.
    Raises ValueError for password errors or invalid inputs.

CompressOptions
    Pydantic-style dataclass that carries every frontend setting:

    Image Settings
    ~~~~~~~~~~~~~~
    image_quality  : int   1–100  – JPEG re-encode quality for raster images
    dpi            : int   72 | 150 | 300  – maximum DPI cap for raster images
    grayscale      : bool  – convert all raster images to grayscale before saving

    Content Removal
    ~~~~~~~~~~~~~~~
    remove_metadata    : bool  – strip all document metadata
    remove_annotations : bool  – delete annotations and comments on every page
    remove_bookmarks   : bool  – clear the outline (bookmark tree)
    remove_thumbnails  : bool  – delete embedded page thumbnails

    Font
    ~~~~
    subset_fonts : bool  – subset embedded fonts to only the used glyphs.
        Implemented with fontTools: each embedded TTF/OTF/CFF font stream is
        extracted, subsetted to the exact Unicode codepoints present in the
        document, and the stream is replaced in-place.  The font name is
        updated with the mandatory 6-character uppercase prefix
        (e.g. ABCDEF+Helvetica) that signals subsetting has been applied.

    Compression Preset
    ~~~~~~~~~~~~~~~~~~
    preset : str  "screen" | "ebook" | "printer" | "custom"
        screen  → quality=30,  dpi=72,  grayscale=False
        ebook   → quality=60,  dpi=150, grayscale=False
        printer → quality=90,  dpi=300, grayscale=False
        custom  → use the individual fields above verbatim

    Output
    ~~~~~~
    flatten_forms   : bool        – flatten all AcroForm fields into page content
    max_file_size   : int | None  – target max bytes; engine will iteratively
                                    lower image_quality until the target is met
                                    or quality reaches the hard floor (10).

Design notes
------------
* Pure Python – no Ghostscript or other external binary dependency.
* All functions work entirely in memory (bytes in, bytes out).
* Image resampling: for each page we iterate embedded XObjects of subtype Image,
  decode them with Pixmap, optionally convert to grayscale, scale down if over
  the DPI cap, and re-encode as JPEG at the requested quality.  The new stream
  replaces the old one in-place using doc.replace_image so the PDF structure
  (cross-references, annotation targets, etc.) stays intact.
* Font subsetting: fontTools is used instead of PyMuPDF's subset_fonts(), which
  only subsets fonts it has embedded itself and cannot touch pre-existing fonts.
  For each embedded font we:
    1. Collect every Unicode codepoint used across all document pages.
    2. Load the raw font stream with TTFont and run fontTools.subset.Subsetter.
    3. Replace the FontFile stream in the PDF with the subsetted bytes.
    4. Rename the font (FontName, BaseFont) with XXXXXX+ prefix per PDF spec.
* Form flattening: we iterate all Widget annotations and stamp their appearance
  streams onto the page canvas before removing them.
"""

from __future__ import annotations

import base64
import io
import logging
import random
import re
import string
from dataclasses import dataclass
from typing import Optional

import fitz  # PyMuPDF
from PIL import Image


# ---------------------------------------------------------------------------
# Preset definitions
# ---------------------------------------------------------------------------

_PRESETS: dict[str, dict] = {
    "screen":  {"image_quality": 30,  "dpi": 72,  "grayscale": False},
    "ebook":   {"image_quality": 60,  "dpi": 150, "grayscale": False},
    "printer": {"image_quality": 90,  "dpi": 300, "grayscale": False},
    "custom":  {},  # use caller-supplied values verbatim
}


# ---------------------------------------------------------------------------
# Options dataclass
# ---------------------------------------------------------------------------

@dataclass
class CompressOptions:
    # Image settings
    image_quality: int = 75          # 1–100
    dpi: int = 150                   # 72 | 150 | 300
    grayscale: bool = False

    # Content removal
    remove_metadata: bool = False
    remove_annotations: bool = False
    remove_bookmarks: bool = False
    remove_thumbnails: bool = False

    # Font
    subset_fonts: bool = False

    # Preset
    preset: str = "custom"

    # Output
    flatten_forms: bool = False
    max_file_size: Optional[int] = None   # bytes; None means no limit

    def resolved(self) -> "CompressOptions":
        """Return a copy where preset values override individual fields."""
        if self.preset in _PRESETS and self.preset != "custom":
            overrides = _PRESETS[self.preset]
            return CompressOptions(
                image_quality=overrides["image_quality"],
                dpi=overrides["dpi"],
                grayscale=overrides["grayscale"],
                remove_metadata=self.remove_metadata,
                remove_annotations=self.remove_annotations,
                remove_bookmarks=self.remove_bookmarks,
                remove_thumbnails=self.remove_thumbnails,
                subset_fonts=self.subset_fonts,
                preset=self.preset,
                flatten_forms=self.flatten_forms,
                max_file_size=self.max_file_size,
            )
        return self


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _open_bytes(data: bytes, password: Optional[str] = None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError(
                "This PDF is password-protected. Supply a password to compress it."
            )
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


def _serialize(doc: fitz.Document, *, garbage: int = 4, deflate: bool = True, clean: bool = True) -> bytes:
    """Serialise *doc* to bytes without closing it."""
    buf = io.BytesIO()
    doc.save(buf, garbage=garbage, deflate=deflate, clean=clean, deflate_images=True, deflate_fonts=True)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Image processing helpers
# ---------------------------------------------------------------------------

def _process_images(doc: fitz.Document, quality: int, max_dpi: int, grayscale: bool) -> None:
    """
    Re-encode every raster image in the document using PIL for resize + encode.

    For each unique image XObject we:
      1. Decode it into a fitz.Pixmap then hand off to PIL.
      2. Optionally convert to grayscale.
      3. Scale it down if either dimension exceeds max_dpi * 11 (A4/Letter cap).
      4. Re-encode as JPEG at *quality* and replace the XObject stream.
    """
    seen_xrefs: set[int] = set()
    max_dim = max_dpi * 11  # A4/Letter worst-case pixel cap per dimension

    for page in doc:
        image_list = page.get_images(full=True)
        for img_info in image_list:
            xref = img_info[0]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)

            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:
                continue  # skip images we cannot decode (e.g. JBIG2, CCITT)

            try:
                # Flatten alpha channel before conversion — JPEG has no alpha
                if pix.alpha:
                    pix = fitz.Pixmap(fitz.csRGB, pix)

                # Determine PIL mode from colorspace
                cs = pix.colorspace
                if cs is None:
                    continue  # mask/stencil — skip
                n = cs.n
                if n == 1:
                    mode = "L"
                elif n == 3:
                    mode = "RGB"
                elif n == 4:
                    mode = "CMYK"
                else:
                    continue  # unsupported colorspace

                # Build PIL Image from raw pixmap samples
                img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)

                # Convert CMYK → RGB (JPEG encoder prefers RGB over CMYK)
                if mode == "CMYK":
                    img = img.convert("RGB")

                # Convert to grayscale if requested
                if grayscale:
                    img = img.convert("L")

                # Scale down if over the DPI cap
                w, h = img.size
                if w > max_dim or h > max_dim:
                    scale = min(max_dim / w, max_dim / h)
                    new_w = max(1, int(w * scale))
                    new_h = max(1, int(h * scale))
                    img = img.resize((new_w, new_h), Image.LANCZOS)

                # Re-encode as JPEG
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=quality, optimize=True)
                jpeg_bytes = buf.getvalue()

                # Replace the image stream in the PDF
                doc.replace_image(xref, stream=jpeg_bytes)

            except Exception:
                # Silently skip any image that cannot be processed
                continue


# ---------------------------------------------------------------------------
# Form flattening helper
# ---------------------------------------------------------------------------

def _flatten_forms(doc: fitz.Document) -> None:
    """
    Flatten all AcroForm widget annotations: stamp appearance onto the page
    canvas and remove the widget annotation, leaving static visual content.
    """
    for page in doc:
        widgets = list(page.widgets())
        if not widgets:
            continue
        for widget in widgets:
            # Render the widget's Normal appearance stream onto the page
            ap = widget.ap_n  # Normal appearance pixmap
            if ap is not None:
                rect = widget.rect
                page.insert_image(rect, pixmap=ap, overlay=True)
            # Remove the widget annotation
            page.delete_annot(widget)


# ---------------------------------------------------------------------------
# Thumbnail removal helper
# ---------------------------------------------------------------------------

def _remove_thumbnails(doc: fitz.Document) -> None:
    """Delete /Thumb entries from every page dictionary."""
    for page in doc:
        xref = page.xref
        try:
            # Check if Thumb key exists and remove it
            thumb = doc.xref_get_key(xref, "Thumb")
            if thumb and thumb[0] != "null":
                doc.xref_set_key(xref, "Thumb", "null")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Font subsetting helper (fontTools)
# ---------------------------------------------------------------------------

_log = logging.getLogger(__name__)


def _pdf_name_decode(raw: str) -> str:
    """Decode a PDF name token (e.g. /Arial#20Regular → Arial Regular)."""
    return re.sub(r"#([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), raw.lstrip("/"))


def _pdf_name_encode(name: str) -> str:
    """Encode a Python string as a PDF name token, escaping non-ASCII and spaces."""
    return "/" + re.sub(r"([ #\x00-\x1f\x7f-\xff])", lambda m: f"#{ord(m.group(1)):02X}", name)


def _indirect_xref(raw_value: str) -> Optional[int]:
    """Parse an indirect reference string like '10 0 R' → 10, or None."""
    m = re.search(r"(\d+)\s+0\s+R", raw_value)
    return int(m.group(1)) if m else None


def _collect_unicodes_per_xref(doc: fitz.Document) -> dict[int, set[int]]:
    """
    Return a mapping of font-object xref → set of Unicode codepoints used in
    the document.  Only codepoints > 0x1F (printable) are included.

    Strategy
    --------
    * ``page.get_text("rawdict")`` yields spans with a ``font`` field whose
      value can be either:
        - the PDF resource alias (``refname`` from ``get_page_fonts``), OR
        - the CIDFont's ``/BaseFont`` name (for Type0/CID fonts PyMuPDF
          sometimes reports the CIDFont name rather than the resource alias).
    * We build both mappings so either naming convention is handled.
    * Characters are collected per xref across all pages so fonts shared
      across pages accumulate their full glyph set.
    """
    # Build name → xref for both resource alias and CIDFont BaseFont names.
    name_to_xref: dict[str, int] = {}
    for pno in range(doc.page_count):
        for entry in doc.get_page_fonts(pno, full=True):
            xref, _, ftype, basefont, refname, _, _ = entry
            # Resource alias (e.g. /TimesFont)
            if refname:
                name_to_xref.setdefault(refname, xref)
            # For Type0 fonts the CIDFont BaseFont is what MuPDF reports in spans
            if ftype == "Type0" and "DescendantFonts" in doc.xref_get_keys(xref):
                cid_raw = doc.xref_get_key(xref, "DescendantFonts")
                cid_xref = _indirect_xref(cid_raw[1])
                if cid_xref is not None:
                    cid_bf_raw = doc.xref_get_key(cid_xref, "BaseFont")
                    if cid_bf_raw and cid_bf_raw[1]:
                        cid_name = _pdf_name_decode(cid_bf_raw[1])
                        name_to_xref.setdefault(cid_name, xref)

    xref_unicodes: dict[int, set[int]] = {}
    for pno in range(doc.page_count):
        page = doc[pno]
        raw = page.get_text("rawdict")
        for block in raw.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    font_name = span.get("font", "")
                    xref = name_to_xref.get(font_name)
                    if xref is None:
                        continue
                    for ch in span.get("chars", []):
                        c = ch.get("c", "")
                        if c and ord(c) > 0x1F:
                            xref_unicodes.setdefault(xref, set()).add(ord(c))

    return xref_unicodes


def _find_fontfile_xref(doc: fitz.Document, type0_xref: int) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """
    Walk the font object hierarchy starting from *type0_xref* to locate:
      - the CIDFont (or None for simple fonts)
      - the FontDescriptor xref
      - the FontFile stream xref (FontFile, FontFile2, or FontFile3)

    Returns (cidfont_xref, descriptor_xref, fontfile_xref).
    Any element may be None if not found.
    """
    cidfont_xref: Optional[int] = None
    descriptor_xref: Optional[int] = None

    # Type0 fonts have DescendantFonts; simple fonts have FontDescriptor directly
    keys = doc.xref_get_keys(type0_xref)

    if "DescendantFonts" in keys:
        raw = doc.xref_get_key(type0_xref, "DescendantFonts")
        cidfont_xref = _indirect_xref(raw[1])

    # FontDescriptor lives on the CIDFont (or directly on a simple font)
    search_xref = cidfont_xref if cidfont_xref is not None else type0_xref
    desc_keys = doc.xref_get_keys(search_xref) if search_xref is not None else []
    if "FontDescriptor" in desc_keys:
        raw = doc.xref_get_key(search_xref, "FontDescriptor")
        descriptor_xref = _indirect_xref(raw[1])

    if descriptor_xref is None:
        return cidfont_xref, None, None

    # FontFile / FontFile2 (TTF) / FontFile3 (CFF/OTF)
    for ff_key in ("FontFile2", "FontFile3", "FontFile"):
        if ff_key in doc.xref_get_keys(descriptor_xref):
            raw = doc.xref_get_key(descriptor_xref, ff_key)
            ff_xref = _indirect_xref(raw[1])
            if ff_xref is not None:
                return cidfont_xref, descriptor_xref, ff_xref

    return cidfont_xref, descriptor_xref, None


def _make_subset_prefix() -> str:
    """Generate a random 6-character uppercase prefix (PDF spec §9.6.4)."""
    return "".join(random.choices(string.ascii_uppercase, k=6))


def _subset_fonts_fonttools(doc: fitz.Document) -> None:
    """
    Subset every embedded font in *doc* to only the glyphs actually used,
    using fontTools.  The font stream is replaced in-place and the font name
    is updated with a 6-character uppercase prefix (e.g. ABCDEF+Helvetica)
    as required by the PDF specification.

    Fonts with no extractable binary data (Type1 name references, non-embedded
    fonts) are silently skipped.
    """
    try:
        from fontTools import subset as ft_subset
        from fontTools.ttLib import TTFont, TTLibFileIsCollectionError
    except ImportError:
        _log.warning("fontTools not installed – font subsetting skipped.")
        return

    # Silence the noisy "meta NOT subset; don't know how to subset; dropped" message
    logging.getLogger("fontTools.subset").setLevel(logging.ERROR)

    unicodes_per_xref = _collect_unicodes_per_xref(doc)

    # Deduplicate: one font xref may appear on multiple pages
    processed: set[int] = set()

    for pno in range(doc.page_count):
        for entry in doc.get_page_fonts(pno, full=True):
            type0_xref, ext, ftype, basefont, refname, _, _ = entry

            if type0_xref in processed:
                continue
            processed.add(type0_xref)

            # Only fonts with an actual embedded stream can be subsetted
            font_info = doc.extract_font(type0_xref)
            if not font_info or not font_info[3] or len(font_info[3]) < 64:
                continue  # no embedded data

            unicodes = unicodes_per_xref.get(type0_xref, set())
            if not unicodes:
                continue  # font is embedded but never renders visible text

            # Locate the FontFile stream xref
            cidfont_xref, descriptor_xref, fontfile_xref = _find_fontfile_xref(doc, type0_xref)
            if fontfile_xref is None or descriptor_xref is None:
                continue

            # Read current font stream
            try:
                font_bytes = doc.xref_stream(fontfile_xref)
            except Exception:
                continue

            if not font_bytes or len(font_bytes) < 64:
                continue

            # Load font with fontTools
            try:
                tt = TTFont(io.BytesIO(font_bytes))
            except (TTLibFileIsCollectionError, Exception):
                continue  # TTC or unrecognised format – skip

            # Run subsetter
            try:
                opts = ft_subset.Options()
                opts.layout_features = ["*"]   # keep all OpenType features
                opts.notdef_outline = True      # keep .notdef glyph outline

                subsetter = ft_subset.Subsetter(options=opts)
                subsetter.populate(unicodes=unicodes)
                subsetter.subset(tt)
            except Exception as exc:
                _log.debug("fontTools subsetting failed for xref %d: %s", type0_xref, exc)
                continue

            # Serialise subsetted font
            out_buf = io.BytesIO()
            try:
                tt.save(out_buf)
            except Exception as exc:
                _log.debug("fontTools save failed for xref %d: %s", type0_xref, exc)
                continue

            new_font_bytes = out_buf.getvalue()
            if not new_font_bytes:
                continue

            # Build the new prefixed font name: XXXXXX+OriginalName
            prefix = _make_subset_prefix()
            old_name_raw = doc.xref_get_key(descriptor_xref, "FontName")
            old_name = _pdf_name_decode(old_name_raw[1]) if old_name_raw[1] else (basefont or "Font")
            # Strip any existing subset prefix before prepending a new one
            old_name = re.sub(r"^[A-Z]{6}\+", "", old_name)
            new_name = f"{prefix}+{old_name}"

            # Replace the FontFile stream
            try:
                doc.update_stream(fontfile_xref, new_font_bytes, compress=True)
            except Exception as exc:
                _log.debug("stream update failed for xref %d: %s", fontfile_xref, exc)
                continue

            # Update FontName in FontDescriptor
            doc.xref_set_key(descriptor_xref, "FontName", _pdf_name_encode(new_name))

            # Update BaseFont on CIDFont (if present)
            if cidfont_xref is not None:
                doc.xref_set_key(cidfont_xref, "BaseFont", _pdf_name_encode(new_name))

            # Update BaseFont on the Type0 (or simple font) dict
            doc.xref_set_key(type0_xref, "BaseFont", _pdf_name_encode(new_name))

            _log.debug(
                "Subsetted font %r → %r (%d → %d bytes)",
                old_name, new_name, len(font_bytes), len(new_font_bytes),
            )


# ---------------------------------------------------------------------------
# Core compress function
# ---------------------------------------------------------------------------

def _compress_once(doc: fitz.Document, opts: CompressOptions) -> None:
    """
    Apply all compression operations to *doc* in-place (doc is mutated).
    """
    # ── 1. Metadata ────────────────────────────────────────────────────────
    if opts.remove_metadata:
        doc.set_metadata({})
        # Also remove XMP metadata stream if present
        try:
            doc.del_xml_metadata()
        except Exception:
            pass

    # ── 2. Bookmarks / outline ─────────────────────────────────────────────
    if opts.remove_bookmarks:
        doc.set_toc([])

    # ── 3. Annotations ─────────────────────────────────────────────────────
    if opts.remove_annotations:
        for page in doc:
            for annot in list(page.annots()):
                page.delete_annot(annot)

    # ── 4. Flatten forms ───────────────────────────────────────────────────
    if opts.flatten_forms:
        _flatten_forms(doc)

    # ── 5. Embedded thumbnails ─────────────────────────────────────────────
    if opts.remove_thumbnails:
        _remove_thumbnails(doc)

    # ── 6. Image resampling ────────────────────────────────────────────────
    _process_images(doc, opts.image_quality, opts.dpi, opts.grayscale)

    # ── 7. Font subsetting ─────────────────────────────────────────────────
    if opts.subset_fonts:
        _subset_fonts_fonttools(doc)


def compress_pdf(
    data: bytes,
    options: CompressOptions,
    password: Optional[str] = None,
) -> bytes:
    """
    Compress *data* according to *options* and return the compressed PDF bytes.

    If *options.max_file_size* is set the engine will iteratively lower
    image_quality (by 10 per step, floor = 10) until the output fits.

    Parameters
    ----------
    data     : Raw PDF bytes.
    options  : CompressOptions instance (already resolved if preset-based).
    password : Unlock password for encrypted PDFs.

    Returns
    -------
    Compressed PDF as raw bytes.
    """
    opts = options.resolved()
    floor_quality = 10
    quality = max(floor_quality, min(100, opts.image_quality))

    while True:
        # Re-open a fresh document for each iteration so mutations don't stack
        doc = _open_bytes(data, password)
        current_opts = CompressOptions(
            image_quality=quality,
            dpi=opts.dpi,
            grayscale=opts.grayscale,
            remove_metadata=opts.remove_metadata,
            remove_annotations=opts.remove_annotations,
            remove_bookmarks=opts.remove_bookmarks,
            remove_thumbnails=opts.remove_thumbnails,
            subset_fonts=opts.subset_fonts,
            preset="custom",
            flatten_forms=opts.flatten_forms,
            max_file_size=None,  # don't recurse
        )
        _compress_once(doc, current_opts)
        result = _serialize(doc)
        doc.close()

        # Check if max_file_size constraint is satisfied
        if opts.max_file_size and len(result) > opts.max_file_size:
            if quality <= floor_quality:
                # Can't compress further — return best effort
                return result
            quality = max(floor_quality, quality - 10)
            continue

        return result


# ---------------------------------------------------------------------------
# Preview helper (mirrors merger/engine.py contract)
# ---------------------------------------------------------------------------

def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Return basic metadata for a single PDF so the frontend can show a
    preview card.

    Returns
    -------
    {
        "page_count": int,
        "file_size":  int,   (bytes of the input)
        "thumbnail":  "data:image/jpeg;base64,..."  (first page, 3× JPEG)
    }
    """
    doc = _open_bytes(data, password)
    page_count = doc.page_count

    page = doc[0]
    mat  = fitz.Matrix(3.0, 3.0)
    pix  = page.get_pixmap(matrix=mat, alpha=False)
    jpeg = pix.tobytes("jpeg", jpg_quality=92)
    doc.close()

    b64 = base64.b64encode(jpeg).decode()
    return {
        "page_count": page_count,
        "file_size":  len(data),
        "thumbnail":  f"data:image/jpeg;base64,{b64}",
    }
