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

def _normalize_image(img_bytes: bytes, idx: int) -> tuple[str, bytes, float, float]:
    """
    Safely normalizes image bytes and retrieves page dimensions.
    Returns (kind, data_bytes, width, height) where kind is 'image' or 'pdf'.
    """
    import fitz

    # Check for SVG
    head = img_bytes[:1024].lstrip().lower()
    if head.startswith(b"<?xml") or b"<svg" in head:
        try:
            svg_doc = fitz.open(stream=img_bytes, filetype="svg")
            pdf_bytes = svg_doc.convert_to_pdf()
            svg_doc.close()
            return ("pdf", pdf_bytes, 0.0, 0.0)
        except Exception:
            pass

    # Try PyMuPDF native image decode
    try:
        img_doc = fitz.open(stream=img_bytes, filetype="image")
        img_page = img_doc[0]
        w = float(img_page.rect.width)
        h = float(img_page.rect.height)
        img_doc.close()
        return ("image", img_bytes, w, h)
    except Exception:
        pass

    # Fallback to Pillow for formats fitz cannot decode directly (e.g. ICO, exotic TIFFs, CMYK)
    try:
        from PIL import Image, ImageOps
        im = Image.open(io.BytesIO(img_bytes))
        im.load()
        try:
            im = ImageOps.exif_transpose(im)
        except Exception:
            pass
        w_px, h_px = im.size
        buf = io.BytesIO()
        if im.mode in ("RGBA", "LA", "P"):
            im.convert("RGBA").save(buf, format="PNG")
        else:
            if im.mode != "RGB":
                im = im.convert("RGB")
            im.save(buf, format="JPEG", quality=95)
        norm_bytes = buf.getvalue()
        return ("image", norm_bytes, float(w_px), float(h_px))
    except Exception as exc:
        raise ValueError(f"Image {idx + 1}: could not decode — {exc}") from exc


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

    for idx, raw_bytes in enumerate(images):
        pct = 10 + int(80 * (idx / total))
        _report(job_id, pct)

        kind, data_bytes, w, h = _normalize_image(raw_bytes, idx)

        if kind == "pdf":
            # Direct PDF page insert for converted SVGs
            svg_pdf = fitz.open("pdf", data_bytes)
            doc.insert_pdf(svg_pdf)
            svg_pdf.close()
        else:
            # Insert a new page of exactly the image's dimensions
            page = doc.new_page(width=w, height=h)
            rect = fitz.Rect(0, 0, w, h)
            page.insert_image(rect, stream=data_bytes)

    _report(job_id, 95)

    pdf_bytes = doc.tobytes(garbage=4, deflate=True)
    doc.close()

    return pdf_bytes
