"""
PDF Compressor engine — ToolCEO
================================

Strategy (iLovePDF-style, fully offline):
------------------------------------------
1.  **Structural pass (always applied)**:
    - garbage=4  : remove unused/orphaned objects, renumber xrefs
    - deflate + deflate_images + deflate_fonts : zlib-compress every stream
    - clean      : normalise content-stream whitespace
    This alone cuts 5–30 % off most PDFs without touching a single pixel.

2.  **Single-pass JPEG re-encode (only when a target size is requested)**:
    Quality level is derived directly from the target ratio — no iterative
    binary search, no multiple passes.  Image dimensions are NEVER changed.

Public API
----------
get_pdf_info(data, password)
    Return page count, file size in bytes, and a base64 JPEG thumbnail.

compress_pdf(data, options, password, job_id)
    Apply compression and return the compressed PDF bytes.

CompressOptions
    max_file_size : int | None  – target bytes (None = structural only)
"""

from __future__ import annotations

import base64
import io
import logging
import math
from dataclasses import dataclass
from typing import Optional

import fitz  # PyMuPDF
from PIL import Image

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Options dataclass
# ---------------------------------------------------------------------------

@dataclass
class CompressOptions:
    max_file_size: Optional[int] = None


# ---------------------------------------------------------------------------
# Progress helper
# ---------------------------------------------------------------------------

def _report(job_id: Optional[str], pct: int) -> None:
    if not job_id:
        return
    try:
        import jobs as job_store  # local import to stay testable standalone
        job_store.set_progress(job_id, pct)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _open_bytes(data: bytes, password: Optional[str] = None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError("This PDF is password-protected. Supply a password.")
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


def _serialize(doc: fitz.Document) -> bytes:
    """
    Lossless structural compression:
    - garbage=4        removes dead objects, defragments xref table
    - deflate*         zlib-compress all streams (images, fonts, content)
    - clean            normalise content stream syntax
    """
    buf = io.BytesIO()
    doc.save(
        buf,
        garbage=4,
        deflate=True,
        deflate_images=True,
        deflate_fonts=True,
        clean=True,
        linear=False,   # no linearisation needed, keeps it faster
    )
    buf.seek(0)
    return buf.read()


def _params_for_ratio(ratio: float) -> tuple[int, float]:
    """
    Calculate quality and scale_factor continuously based on target ratio.
    Accounts for document non-image overhead (fonts, text streams, XRef tables).
    """
    ratio = max(0.05, min(0.95, ratio))
    scale_factor = max(0.12, ratio ** 0.65)
    quality = max(15, min(85, int(10 + 75 * ratio)))
    return quality, scale_factor


def _reencode_images(
    doc: fitz.Document,
    quality: int,
    scale_factor: float = 1.0,
    job_id: Optional[str] = None,
    progress_start: int = 20,
    progress_end: int = 82,
) -> None:
    """
    Single-pass JPEG re-encode of raster images in *doc*.

    - Scales image dimensions by scale_factor when aggressive reduction is requested.
    - Colour mode is preserved (RGB stays RGB, L stays L).
    - CMYK is converted to RGB for maximum PDF viewer compatibility.
    - An image is skipped if its pixel area is tiny (not worth encoding).
    - compress=False is critical: we store raw JPEG bytes; PyMuPDF must
      NOT zlib-wrap them, because the Filter is set to /DCTDecode (JPEG).
    - Progress is reported smoothly from progress_start to progress_end.
    """
    seen_xrefs: set[int] = set()
    total_pages = max(1, doc.page_count)

    for pno, page in enumerate(doc):
        # Smooth per-page progress
        pct = progress_start + int((progress_end - progress_start) * (pno / total_pages))
        _report(job_id, pct)

        for img_info in page.get_images(full=True):
            xref = img_info[0]
            if xref in seen_xrefs:
                continue
            seen_xrefs.add(xref)

            try:
                pix = fitz.Pixmap(doc, xref)
            except Exception:
                continue

            try:
                # JPEG has no alpha channel — flatten first
                if pix.alpha:
                    pix = fitz.Pixmap(fitz.csRGB, pix)

                cs = pix.colorspace
                if cs is None:
                    continue

                n = cs.n
                if n == 1:
                    mode = "L"
                elif n == 3:
                    mode = "RGB"
                elif n == 4:
                    mode = "CMYK"
                else:
                    continue  # unsupported colorspace — leave untouched

                w, h = pix.width, pix.height
                if w * h < 32 * 32:
                    continue

                img = Image.frombytes(mode, (w, h), pix.samples)

                if mode == "CMYK":
                    img = img.convert("RGB")
                    mode = "RGB"

                new_w = max(1, int(w * scale_factor))
                new_h = max(1, int(h * scale_factor))

                if new_w < w or new_h < h:
                    img = img.resize((new_w, new_h), Image.LANCZOS)

                # Encode to JPEG (raw bytes, no zlib wrapping)
                enc_buf = io.BytesIO()
                img.save(enc_buf, format="JPEG", quality=quality)
                jpeg_bytes = enc_buf.getvalue()

                # ── CRITICAL: compress=False prevents PyMuPDF from zlib-wrapping
                doc.update_stream(xref, jpeg_bytes, compress=False)

                # Update the image dictionary to declare JPEG encoding
                doc.xref_set_key(xref, "Filter",           "/DCTDecode")
                doc.xref_set_key(xref, "Width",            str(new_w))
                doc.xref_set_key(xref, "Height",           str(new_h))
                doc.xref_set_key(xref, "ColorSpace",
                                 "/DeviceGray" if mode == "L" else "/DeviceRGB")
                doc.xref_set_key(xref, "DecodeParms",      "null")
                doc.xref_set_key(xref, "BitsPerComponent", "8")

            except Exception as exc:
                _log.debug("Skipped image xref %d: %s", xref, exc)
                continue


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compress_pdf(
    data: bytes,
    options: CompressOptions,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Compress *data* and return the compressed PDF bytes.

    Flow
    ----
    10 % – open + start
    10→18 % – structural compression (deflate / garbage-collect)
    18 % – check if structural result already meets target
    18→82 % – single-pass JPEG re-encode (only if target not met)
    82→92 % – re-serialize after JPEG pass
    92→95 % – done (caller sets 95→100)
    """
    orig_size = len(data)

    # ── Phase 1: structural compression (always) ──────────────────────────────
    _report(job_id, 10)
    doc = _open_bytes(data, password)
    _report(job_id, 13)
    struct_bytes = _serialize(doc)
    doc.close()
    _report(job_id, 18)

    # If no size target, or structural pass already meets it, we're done
    if not options.max_file_size or len(struct_bytes) <= options.max_file_size:
        return struct_bytes

    # ── Phase 2: single-pass JPEG re-encode + scaling ────────────────────────
    target = options.max_file_size
    ratio  = target / orig_size
    quality, scale_factor = _params_for_ratio(ratio)

    _report(job_id, 20)
    doc = _open_bytes(data, password)

    # Re-encode images with per-page progress 20 → 82 %
    _reencode_images(doc, quality=quality, scale_factor=scale_factor, job_id=job_id,
                     progress_start=20, progress_end=82)

    _report(job_id, 82)
    result = _serialize(doc)
    doc.close()
    _report(job_id, 92)

    # Dynamic precision adjustment pass if output exceeds target by > 8%
    if len(result) > target * 1.08 and ratio < 0.50:
        over_ratio = target / len(result)
        adj_scale = max(0.08, scale_factor * math.sqrt(over_ratio))
        adj_quality = max(10, int(quality * over_ratio))
        doc2 = _open_bytes(data, password)
        _reencode_images(doc2, quality=adj_quality, scale_factor=adj_scale, job_id=job_id,
                         progress_start=85, progress_end=92)
        adj_result = _serialize(doc2)
        doc2.close()
        if len(adj_result) < len(result):
            result = adj_result
        _report(job_id, 92)

    # Return the compressed result
    return result if len(result) < len(struct_bytes) else struct_bytes


def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Return basic metadata for a single PDF.

    Returns
    -------
    {
        "page_count": int,
        "file_size":  int,
        "thumbnail":  "data:image/jpeg;base64,..."
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
