"""
PDF Watermark Engine — ToolCEO
==============================
Applies custom text watermarks to all pages of a PDF document using PyMuPDF.
Supports font selection, color, opacity (alpha), rotation angle, spacing,
and precise (x, y) percentage positioning.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Optional

import fitz  # PyMuPDF
import jobs as job_store


FONT_MAP = {
    "helvetica": "helv",
    "arial": "helv",
    "sans-serif": "helv",
    "times": "times",
    "times new roman": "times",
    "serif": "times",
    "courier": "cour",
    "courier new": "cour",
    "monospace": "cour",
    "helvetica-bold": "hebo",
    "times-bold": "tibo",
    "courier-bold": "cobo",
}


@dataclass
class WatermarkOptions:
    text: str = "CONFIDENTIAL"
    font_family: str = "helv"
    font_size: float = 36.0
    color: str = "#FF0000"
    opacity: float = 0.5
    angle: float = -45.0
    spacing: float = 0.0
    x_pct: float = 50.0
    y_pct: float = 50.0


def _parse_color(hex_str: str) -> tuple[float, float, float]:
    """Convert hex color (#RRGGBB) to normalized float RGB tuple (0.0-1.0)."""
    clean = hex_str.lstrip("#")
    if len(clean) == 3:
        clean = "".join(c * 2 for c in clean)
    if len(clean) != 6:
        return (0.0, 0.0, 0.0)
    try:
        r = int(clean[0:2], 16) / 255.0
        g = int(clean[2:4], 16) / 255.0
        b = int(clean[4:6], 16) / 255.0
        return (r, g, b)
    except Exception:
        return (0.0, 0.0, 0.0)


def get_pdf_info(raw_bytes: bytes, password: Optional[str] = None) -> dict:
    """
    Synchronous preview helper. Returns page count, original file size,
    and a high-definition (2x scale) base64 JPEG thumbnail of the 1st page.
    """
    if not raw_bytes:
        raise ValueError("Uploaded file is empty.")

    try:
        doc = fitz.open(stream=raw_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Could not parse PDF document: {exc}") from exc

    if doc.is_encrypted:
        if not password or not doc.authenticate(password):
            raise ValueError("PDF is password protected. Please provide a valid password.")

    page_count = len(doc)
    if page_count == 0:
        raise ValueError("PDF contains no pages.")

    # High definition 1st page preview rendering (2.0 scale)
    page0 = doc[0]
    rect = page0.rect
    matrix = fitz.Matrix(2.0, 2.0)
    pix = page0.get_pixmap(matrix=matrix, alpha=False)
    img_bytes = pix.tobytes("jpeg")
    b64_img = base64.b64encode(img_bytes).decode("ascii")
    data_uri = f"data:image/jpeg;base64,{b64_img}"

    return {
        "page_count": page_count,
        "file_size": len(raw_bytes),
        "thumbnail": data_uri,
        "width": rect.width,
        "height": rect.height,
    }


def apply_watermark(
    raw_bytes: bytes,
    opts: WatermarkOptions,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Overlays text watermark onto all pages of the PDF.
    Updates job progress if job_id is supplied.
    """
    if not raw_bytes:
        raise ValueError("Empty PDF file.")

    doc = fitz.open(stream=raw_bytes, filetype="pdf")
    if doc.is_encrypted:
        if not password or not doc.authenticate(password):
            raise ValueError("PDF password authentication failed.")

    total_pages = len(doc)
    if total_pages == 0:
        raise ValueError("PDF contains no pages.")

    # Font lookup
    norm_font = (opts.font_family or "helv").lower().strip()
    font_name = FONT_MAP.get(norm_font, "helv")

    # Color parsing
    rgb = _parse_color(opts.color or "#FF0000")
    opacity = max(0.01, min(1.0, float(opts.opacity)))
    font_size = max(6.0, min(200.0, float(opts.font_size)))
    angle = float(opts.angle)

    if job_id:
        job_store.set_progress(job_id, 15)

    for idx, page in enumerate(doc):
        rect = page.rect
        x_pt = (opts.x_pct / 100.0) * rect.width
        y_pt = (opts.y_pct / 100.0) * rect.height
        point = fitz.Point(x_pt, y_pt)

        # Apply rotation transform matrix matching frontend CSS rotation
        morph_matrix = fitz.Matrix(-angle)

        try:
            page.insert_text(
                point,
                opts.text,
                fontname=font_name,
                fontsize=font_size,
                color=rgb,
                fill_opacity=opacity,
                morph=(point, morph_matrix),
            )
        except Exception as exc:
            # Fallback without morph matrix if transformation fails
            page.insert_text(
                point,
                opts.text,
                fontname=font_name,
                fontsize=font_size,
                color=rgb,
                fill_opacity=opacity,
            )

        if job_id:
            pct = 15 + int(((idx + 1) / total_pages) * 75)
            job_store.set_progress(job_id, pct)

    output_bytes = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    return output_bytes
