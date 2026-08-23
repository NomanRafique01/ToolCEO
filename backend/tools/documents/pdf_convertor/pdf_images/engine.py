"""
PDF → Images conversion engine — ToolCEO
=========================================

Each page of the input PDF is rendered as a PNG image at 150 DPI and packed
into a ZIP archive delivered as a single download.

Image naming: page_001.png, page_002.png, … (zero-padded to the total count).

Progress events (SSE-compatible)
----------------------------------
  10 %              – PDF opened
  10 % → 90 %      – per-page render (evenly spread)
  95 %              – ZIP assembled, writing bytes
  100 %             – done (set by router)

Public API
----------
get_pdf_info(data, password)
    Returns page_count, file_size, and a base64 JPEG thumbnail of the first page.

convert_pdf_to_images(data, password, job_id)
    Returns ZIP bytes containing one PNG per page.
"""

from __future__ import annotations

import base64
import io
import zipfile
import logging
from typing import Optional

import fitz  # PyMuPDF

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Progress helper
# ---------------------------------------------------------------------------

def _report(job_id: Optional[str], pct: int) -> None:
    if not job_id:
        return
    try:
        import jobs as job_store
        job_store.set_progress(job_id, pct)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# PDF info
# ---------------------------------------------------------------------------

def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """Return page_count, file_size, and a base64 JPEG thumbnail of page 1."""
    doc = _open(data, password)
    page_count = doc.page_count

    page = doc[0]
    mat  = fitz.Matrix(3.0, 3.0)
    pix  = page.get_pixmap(matrix=mat, alpha=False)
    jpeg = pix.tobytes("jpeg", jpg_quality=90)
    doc.close()

    b64 = base64.b64encode(jpeg).decode()
    return {
        "page_count": page_count,
        "file_size":  len(data),
        "thumbnail":  f"data:image/jpeg;base64,{b64}",
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _open(data: bytes, password: Optional[str] = None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError("This PDF is password-protected. Supply a password.")
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_pdf_to_images(
    data: bytes,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Render every PDF page to PNG at 150 DPI and bundle them in a ZIP.

    Returns ZIP bytes.
    """
    _report(job_id, 10)

    doc   = _open(data, password)
    total = doc.page_count
    if total == 0:
        doc.close()
        raise ValueError("The PDF has no pages.")

    width  = len(str(total))   # digit width for zero-padding
    scale  = 150 / 72.0
    mat    = fitz.Matrix(scale, scale)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for pno in range(total):
            pct = 10 + int(80 * (pno / total))
            _report(job_id, pct)

            page = doc[pno]
            pix  = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)
            png  = pix.tobytes("png")

            name = f"page_{str(pno + 1).zfill(width)}.png"
            zf.writestr(name, png)

    doc.close()
    _report(job_id, 95)

    return zip_buf.getvalue()
