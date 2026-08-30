"""
SVG Convertor engine — ToolCEO
==================================

Convert SVG vector graphics to other formats using cairosvg and Pillow.

Public API
----------
convert_svg(data, target_format, job_id) -> bytes
    Convert raw SVG bytes to *target_format*.
    Returns converted bytes.

merge_svgs_to_pdf(items, job_id) -> bytes
    Convert multiple SVGs and merge them into a single multi-page PDF.

MEDIA_TYPES  – dict mapping format key to Content-Type string.

Supported targets
-----------------
  png   → PNG  (lossless raster, 96 dpi)
  jpg   → JPEG (quality 95, RGB flattened)
  webp  → WEBP (quality 90, RGBA preserved)
  pdf   → PDF  (vector/raster PDF document)
"""

from __future__ import annotations

import io
import logging
import os
import sys
from typing import List, Optional, Tuple

_log = logging.getLogger(__name__)

# Ensure Cairo DLLs are discoverable on Windows
if sys.platform == "win32":
    for _candidate in [
        r"C:\Program Files\Tesseract-OCR",
        r"C:\Program Files (x86)\Tesseract-OCR",
        r"C:\Program Files\GTK3-Runtime\bin",
        r"C:\Program Files\Inkscape\bin",
    ]:
        if os.path.exists(_candidate):
            os.environ["PATH"] = _candidate + ";" + os.environ.get("PATH", "")
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(_candidate)
                except Exception:
                    pass

# ---------------------------------------------------------------------------
# Media types
# ---------------------------------------------------------------------------

MEDIA_TYPES: dict[str, str] = {
    "png":  "image/png",
    "jpg":  "image/jpeg",
    "webp": "image/webp",
    "pdf":  "application/pdf",
}

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


def _require_cairosvg():
    try:
        import cairosvg
        return cairosvg
    except ImportError:
        raise RuntimeError("cairosvg is not installed. Run: pip install cairosvg")
    except OSError as err:
        raise RuntimeError(
            f"cairo library could not be loaded: {err}. "
            "Please ensure libcairo-2.dll is installed and available."
        )


def _require_pillow():
    try:
        from PIL import Image
        return Image
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install Pillow")


# ---------------------------------------------------------------------------
# Target Conversion Functions
# ---------------------------------------------------------------------------

def _to_png(data: bytes, job_id: Optional[str] = None) -> bytes:
    """Convert SVG bytes to PNG (96 dpi)."""
    cairosvg = _require_cairosvg()
    _report(job_id, 30)
    png_data = cairosvg.svg2png(bytestring=data, dpi=96)
    _report(job_id, 90)
    return png_data


def _to_jpg(data: bytes, job_id: Optional[str] = None) -> bytes:
    """Convert SVG bytes to JPG (quality 95, flattened on white)."""
    cairosvg = _require_cairosvg()
    Image = _require_pillow()

    _report(job_id, 25)
    png_data = cairosvg.svg2png(bytestring=data, dpi=96)
    _report(job_id, 55)

    img = Image.open(io.BytesIO(png_data))
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        if img.mode in ("RGBA", "LA"):
            bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=95, optimize=True)
    _report(job_id, 90)
    return out.getvalue()


def _to_webp(data: bytes, job_id: Optional[str] = None) -> bytes:
    """Convert SVG bytes to WEBP (quality 90, method 6, RGBA)."""
    cairosvg = _require_cairosvg()
    Image = _require_pillow()

    _report(job_id, 25)
    png_data = cairosvg.svg2png(bytestring=data, dpi=96)
    _report(job_id, 55)

    img = Image.open(io.BytesIO(png_data)).convert("RGBA")
    out = io.BytesIO()
    img.save(out, format="WEBP", quality=90, method=6)
    _report(job_id, 90)
    return out.getvalue()


def _to_pdf(data: bytes, job_id: Optional[str] = None) -> bytes:
    """Convert SVG bytes to PDF."""
    cairosvg = _require_cairosvg()
    _report(job_id, 30)
    pdf_data = cairosvg.svg2pdf(bytestring=data)
    _report(job_id, 90)
    return pdf_data


def merge_svgs_to_pdf(
    items: List[Tuple[bytes, str]],
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert multiple SVGs to individual PDFs and merge them into a single PDF.
    """
    n = len(items)
    if n == 0:
        raise ValueError("No SVG files provided to merge")
    if n == 1:
        return _to_pdf(items[0][0], job_id)

    cairosvg = _require_cairosvg()
    pdf_buffers: list[bytes] = []

    for i, (raw, _stem) in enumerate(items):
        pct = 10 + int((i / n) * 60)
        _report(job_id, pct)
        pdf_bytes = cairosvg.svg2pdf(bytestring=raw)
        pdf_buffers.append(pdf_bytes)

    _report(job_id, 75)

    # Try PyMuPDF (fitz) first
    try:
        import fitz
        merged_doc = fitz.open()
        for b in pdf_buffers:
            part = fitz.open(stream=b, filetype="pdf")
            merged_doc.insert_pdf(part)
            part.close()
        out = merged_doc.tobytes()
        merged_doc.close()
        _report(job_id, 95)
        return out
    except ImportError:
        pass

    # Try pypdf next
    try:
        from pypdf import PdfMerger
        merger = PdfMerger()
        for b in pdf_buffers:
            merger.append(io.BytesIO(b))
        out_buf = io.BytesIO()
        merger.write(out_buf)
        merger.close()
        _report(job_id, 95)
        return out_buf.getvalue()
    except ImportError:
        pass

    # Fallback to Pillow
    Image = _require_pillow()
    images = []
    for b in pdf_buffers:
        png_data = cairosvg.svg2png(bytestring=items[len(images)][0], dpi=96)
        img = Image.open(io.BytesIO(png_data)).convert("RGB")
        images.append(img)

    out_buf = io.BytesIO()
    images[0].save(out_buf, "PDF", save_all=True, append_images=images[1:], resolution=96)
    _report(job_id, 95)
    return out_buf.getvalue()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_DISPATCH = {
    "png":  _to_png,
    "jpg":  _to_jpg,
    "webp": _to_webp,
    "pdf":  _to_pdf,
}


def convert_svg(
    data:          bytes,
    target_format: str,
    job_id:        Optional[str] = None,
) -> bytes:
    """
    Convert raw SVG *data* to *target_format*.

    Parameters
    ----------
    data          : raw bytes of the source SVG file
    target_format : one of "png", "jpg", "webp", "pdf"
    job_id        : optional SSE progress job id

    Returns
    -------
    Converted file as bytes.

    Raises
    ------
    ValueError   if target_format is not supported
    RuntimeError if required library is missing
    """
    fn = _DISPATCH.get(target_format.lower())
    if fn is None:
        raise ValueError(
            f"Unsupported target format '{target_format}'. "
            f"Supported: {', '.join(_DISPATCH)}"
        )
    return fn(data, job_id)
