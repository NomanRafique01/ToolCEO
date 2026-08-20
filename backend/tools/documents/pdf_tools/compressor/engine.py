"""
PDF Compressor engine.

All compression logic lives here, fully offline using PyMuPDF (fitz).

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
    subset_fonts : bool  – subset embedded fonts to only the used glyphs

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
* Pure PyMuPDF – no Ghostscript or other binary dependency.
* All functions work entirely in memory (bytes in, bytes out).
* Image resampling: for each page we iterate embedded XObjects of subtype Image,
  decode them with Pixmap, optionally convert to grayscale, scale down if over
  the DPI cap, and re-encode as JPEG at the requested quality.  The new stream
  replaces the old one in-place using doc.xref_set_key / replace_image so the
  PDF structure (cross-references, annotation targets, etc.) stays intact.
* Font subsetting is delegated to PyMuPDF's own subset_fonts() method which was
  added in PyMuPDF ≥ 1.18.1 and is available in the project's installed version.
* Form flattening: we iterate all Widget annotations and stamp their appearance
  streams onto the page canvas before removing them.
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass, field
from typing import Optional

import fitz  # PyMuPDF


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
    Re-encode every raster image in the document.

    For each unique image XObject we:
      1. Decode it into a Pixmap.
      2. Optionally convert to grayscale.
      3. Scale it down if its effective DPI exceeds *max_dpi*.
      4. Re-encode as JPEG at *quality* and replace the XObject stream.
    """
    seen_xrefs: set[int] = set()

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

            # Drop alpha channel – JPEG does not support transparency
            if pix.alpha:
                pix = fitz.Pixmap(fitz.csRGB, pix)

            # Convert to grayscale if requested
            if grayscale and pix.colorspace and pix.colorspace.n > 1:
                pix = fitz.Pixmap(fitz.csGRAY, pix)

            # Scale down to DPI cap
            # PyMuPDF Pixmap has no DPI metadata, so we approximate:
            # the image is rendered at 72 DPI by default in PDF user-space.
            # If the pixmap is wider than the page's pointwidth * (max_dpi/72)
            # we scale it down so it would render at exactly max_dpi.
            # In practice we just limit total pixels to avoid inflating files:
            # cap each dimension so that neither exceeds max_dpi * 11 (letter).
            max_dim = max_dpi * 11  # A4/Letter worst-case
            if pix.width > max_dim or pix.height > max_dim:
                scale = min(max_dim / pix.width, max_dim / pix.height)
                new_w = max(1, int(pix.width * scale))
                new_h = max(1, int(pix.height * scale))
                pix = pix.scale_pixmap(new_w, new_h)

            # Re-encode as JPEG
            jpeg_bytes = pix.tobytes("jpeg", jpg_quality=quality)

            # Replace the image stream in the PDF
            try:
                doc.replace_image(xref, stream=jpeg_bytes)
            except Exception:
                # replace_image may fail for mask images or corrupted entries; skip
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
        try:
            doc.subset_fonts()
        except Exception:
            pass  # Older build or no subsettable fonts — silently skip


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
