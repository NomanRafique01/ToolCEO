"""
Edit PDF preview loader.

Validates a PDF with pikepdf, keeps the original bytes in memory for the
next editor steps, and renders page thumbnails with PyMuPDF.
"""

from __future__ import annotations

import base64
import io
import uuid
from typing import Iterable

import fitz  # PyMuPDF
import pikepdf
from PIL import Image


_PDF_SESSIONS: dict[str, bytes] = {}


def _looks_like_pdf(data: bytes) -> bool:
    return bool(data) and b"%PDF-" in data[:1024]


def _validate_with_pikepdf(data: bytes) -> int:
    if not _looks_like_pdf(data):
        raise ValueError("Invalid File Format. Please select a valid PDF file.")

    try:
        with pikepdf.open(io.BytesIO(data)) as pdf:
            page_count = len(pdf.pages)
    except pikepdf.PasswordError as exc:
        raise ValueError("This PDF is password-protected and cannot be edited yet.") from exc
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc

    if page_count < 1:
        raise ValueError("PDF has no pages to edit.")

    return page_count


def _render_page_images(page: fitz.Page) -> tuple[str, str, int, int]:
    source_rect = page.rect
    source_width = max(float(source_rect.width), 1.0)
    source_height = max(float(source_rect.height), 1.0)
    page_scale = min(1400.0 / source_width, 1800.0 / source_height, 2.0)

    page_pix = page.get_pixmap(matrix=fitz.Matrix(page_scale, page_scale), alpha=False)
    page_b64 = base64.b64encode(page_pix.tobytes("png")).decode("ascii")

    thumb_scale = min(200.0 / source_width, 280.0 / source_height)
    thumb_pix = page.get_pixmap(matrix=fitz.Matrix(thumb_scale, thumb_scale), alpha=False)
    image = Image.open(io.BytesIO(thumb_pix.tobytes("png"))).convert("RGB")
    image.thumbnail((200, 280), Image.LANCZOS)
    thumb = Image.new("RGB", (200, 280), "white")
    left = (200 - image.width) // 2
    top = (280 - image.height) // 2
    thumb.paste(image, (left, top))

    out = io.BytesIO()
    thumb.save(out, format="PNG")
    b64 = base64.b64encode(out.getvalue()).decode("ascii")
    return b64, page_b64, page_pix.width, page_pix.height


def load_pages(data: bytes) -> dict:
    page_count = _validate_with_pikepdf(data)

    session_id = str(uuid.uuid4())
    _PDF_SESSIONS[session_id] = data

    doc = fitz.open(stream=data, filetype="pdf")
    pages = []
    try:
        for index in range(doc.page_count):
            thumbnail, page_image, width, height = _render_page_images(doc[index])
            pages.append(
                {
                    "page_number": index + 1,
                    "thumbnail": thumbnail,
                    "image": page_image,
                    "width": width,
                    "height": height,
                }
            )
    finally:
        doc.close()

    return {
        "page_count": page_count,
        "pages": pages,
        "session_id": session_id,
    }


def get_session_pdf(session_id: str) -> bytes | None:
    return _PDF_SESSIONS.get(session_id)


def _decode_image_payload(payload: str) -> bytes:
    if not payload:
        raise ValueError("Edited page image is missing.")
    raw = payload.split(",", 1)[1] if "," in payload else payload
    try:
        return base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValueError("Edited page image is not valid base64 data.") from exc


def save_edited_pdf(data: bytes, edits: Iterable[dict]) -> bytes:
    """
    Export edited pages by painting each edited page preview back over its PDF page.

    The browser editor works on full-page raster previews, so the export keeps
    unedited pages untouched and replaces only edited pages with their edited
    visual representation.
    """
    _validate_with_pikepdf(data)
    edit_list = list(edits or [])
    if not edit_list:
        raise ValueError("No edited pages were provided.")

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        for edit in edit_list:
            page_number = int(edit.get("page_number", 0))
            if page_number < 1 or page_number > doc.page_count:
                raise ValueError(f"Edited page {page_number} is outside this PDF.")

            image_bytes = _decode_image_payload(str(edit.get("image") or ""))
            page = doc[page_number - 1]
            rect = page.rect
            page.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1), overlay=True)
            page.insert_image(rect, stream=image_bytes, keep_proportion=False, overlay=True)

        out = io.BytesIO()
        doc.save(out, garbage=4, deflate=True, clean=True)
        out.seek(0)
        return out.read()
    finally:
        doc.close()
