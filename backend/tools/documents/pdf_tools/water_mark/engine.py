"""
PDF Watermark Engine — ToolCEO
==============================
Applies custom text watermarks to all pages of a PDF document using PyMuPDF.
Supports font selection, color, opacity (alpha), rotation angle, spacing,
and precise (x, y) percentage positioning.

Positioning matches the frontend preview: (x_pct, y_pct) is the CENTER of the
watermark text (same as CSS left/top % + translate(-50%, -50%)).
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Optional

import fitz  # PyMuPDF
import jobs as job_store


# Values MUST be PyMuPDF Base-14 short names (see fitz.Base14_fontdict).
# Times-Roman is "tiro", not "times" — "times" raises: need font file or buffer.
FONT_MAP = {
    "helvetica": "helv",
    "arial": "helv",
    "sans-serif": "helv",
    "helv": "helv",
    "times": "tiro",
    "times-roman": "tiro",
    "times new roman": "tiro",
    "serif": "tiro",
    "tiro": "tiro",
    "courier": "cour",
    "courier new": "cour",
    "monospace": "cour",
    "cour": "cour",
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


def _resolve_font(font_family: str) -> str:
    """Map UI / CSS family names to a PyMuPDF Base-14 short name."""
    norm = (font_family or "helv").lower().strip()
    resolved = FONT_MAP.get(norm, "helv")
    # Guard against unknown aliases that are not in Base-14
    try:
        if hasattr(fitz, "Base14_fontdict") and resolved.lower() not in fitz.Base14_fontdict:
            return "helv"
    except Exception:
        pass
    return resolved


def _text_width(text: str, font_name: str, font_size: float, spacing: float) -> float:
    """Width of text in PDF points, including letter-spacing between characters."""
    if not text:
        return 0.0
    try:
        base = fitz.get_text_length(text, fontname=font_name, fontsize=font_size)
    except Exception:
        base = font_size * 0.5 * len(text)
    extra = max(0.0, float(spacing)) * max(0, len(text) - 1)
    return base + extra


def _insert_centered_watermark(
    page: fitz.Page,
    text: str,
    font_name: str,
    font_size: float,
    rgb: tuple[float, float, float],
    opacity: float,
    angle: float,
    spacing: float,
    x_pct: float,
    y_pct: float,
) -> None:
    """
    Draw watermark centered on (x_pct, y_pct) of the page, matching the editor preview.

    Frontend places the label with left/top = % and transform: translate(-50%, -50%)
    rotate(angle), so the visual center of the text sits on that point.
    PyMuPDF insert_text uses baseline-left, so we offset before rotating around center.
    """
    rect = page.rect
    cx = (max(0.0, min(100.0, x_pct)) / 100.0) * rect.width
    cy = (max(0.0, min(100.0, y_pct)) / 100.0) * rect.height

    tw = _text_width(text, font_name, font_size, spacing)
    # Vertical: CSS centers the line box (~font_size tall); PDF baseline ≈ mid + 0.35*size
    baseline_y = cy + font_size * 0.35
    insert_x = cx - (tw / 2.0)

    pivot = fitz.Point(cx, cy)
    # CSS positive rotate is clockwise; PyMuPDF Matrix(deg) is counter-clockwise → negate
    morph = (pivot, fitz.Matrix(-angle)) if abs(angle) > 0.01 else None

    common = dict(
        fontname=font_name,
        fontsize=font_size,
        color=rgb,
        fill_opacity=opacity,
    )

    # Letter-spacing: draw glyph-by-glyph so output matches the preview
    if abs(spacing) > 0.01 and len(text) > 1:
        x_cursor = insert_x
        for ch in text:
            try:
                ch_w = fitz.get_text_length(ch, fontname=font_name, fontsize=font_size)
            except Exception:
                ch_w = font_size * 0.5
            page.insert_text(
                fitz.Point(x_cursor, baseline_y),
                ch,
                morph=morph,
                **common,
            )
            x_cursor += ch_w + spacing
        return

    page.insert_text(
        fitz.Point(insert_x, baseline_y),
        text,
        morph=morph,
        **common,
    )


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
    Overlays text watermark onto all pages of the PDF at the same relative
    (x_pct, y_pct) center position shown in the page-1 drag preview.
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

    font_name = _resolve_font(opts.font_family)
    rgb = _parse_color(opts.color or "#FF0000")
    opacity = max(0.01, min(1.0, float(opts.opacity)))
    font_size = max(6.0, min(200.0, float(opts.font_size)))
    angle = float(opts.angle)
    spacing = float(opts.spacing or 0.0)
    text = (opts.text or "WATERMARK").strip() or "WATERMARK"
    x_pct = float(opts.x_pct)
    y_pct = float(opts.y_pct)

    if job_id:
        job_store.set_progress(job_id, 15)

    for idx, page in enumerate(doc):
        try:
            _insert_centered_watermark(
                page,
                text=text,
                font_name=font_name,
                font_size=font_size,
                rgb=rgb,
                opacity=opacity,
                angle=angle,
                spacing=spacing,
                x_pct=x_pct,
                y_pct=y_pct,
            )
        except Exception:
            # Last-resort: plain centered insert with Base-14 Helvetica
            safe_font = "helv"
            rect = page.rect
            cx = (x_pct / 100.0) * rect.width
            cy = (y_pct / 100.0) * rect.height
            tw = _text_width(text, safe_font, font_size, 0.0)
            page.insert_text(
                fitz.Point(cx - tw / 2.0, cy + font_size * 0.35),
                text,
                fontname=safe_font,
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
