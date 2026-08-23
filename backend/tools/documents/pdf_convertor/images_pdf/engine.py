"""
Images → PDF conversion engine — ToolCEO
=========================================

Accepts one or more image files (PNG, JPEG, WEBP, BMP, GIF, TIFF) and
assembles them in order into a single PDF document.

Each image becomes one page.  The page size matches the image dimensions
exactly (no scaling, no margins) so the PDF is pixel-perfect.

Progress events (SSE-compatible)
----------------------------------
  10 %              – starting
  10 % → 90 %      – per-image insert
  95 %              – PDF assembled, writing bytes
  100 %             – done (set by router)

Public API
----------
convert_images_to_pdf(images: list[bytes], job_id)
    Returns PDF bytes.
"""

from __future__ import annotations

import io
import logging
from typing import Optional

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
# Main conversion
# ---------------------------------------------------------------------------

def convert_images_to_pdf(
    images: list[bytes],
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert a list of image byte payloads to a single PDF.

    Each image occupies one page sized to fit the image exactly.
    Returns PDF bytes.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise RuntimeError(
            "PyMuPDF (fitz) is not installed.  Run: pip install pymupdf"
        ) from exc

    if not images:
        raise ValueError("No images provided.")

    _report(job_id, 10)

    total  = len(images)
    doc    = fitz.open()          # blank PDF

    for idx, img_bytes in enumerate(images):
        pct = 10 + int(80 * (idx / total))
        _report(job_id, pct)

        # Open image as a fitz document to get its dimensions
        try:
            img_doc = fitz.open(stream=img_bytes, filetype="image")
        except Exception as exc:
            raise ValueError(f"Image {idx + 1}: could not decode — {exc}") from exc

        # Use the natural pixel size as the page size (72 DPI reference)
        img_page = img_doc[0]
        w        = img_page.rect.width
        h        = img_page.rect.height
        img_doc.close()

        # Insert a new page of exactly that size
        page  = doc.new_page(width=w, height=h)
        rect  = fitz.Rect(0, 0, w, h)

        # Insert image onto page
        page.insert_image(rect, stream=img_bytes)

    _report(job_id, 95)

    pdf_bytes = doc.tobytes(garbage=4, deflate=True)
    doc.close()

    return pdf_bytes
