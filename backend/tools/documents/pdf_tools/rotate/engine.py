"""
PDF Rotate engine.

All rotate-specific PDF work lives here, fully offline using PyMuPDF:

  get_pdf_info       - validate PDF bytes and render a first-page thumbnail
  rotate_pdf_pages   - apply per-page cumulative rotations

The router owns HTTP payloads; this module works only with raw bytes so it is
easy to test and keeps file data in memory.
"""

from __future__ import annotations

import base64
import io
from typing import Optional, Sequence

import fitz  # PyMuPDF


VALID_ROTATIONS = {0, 90, 180, 270}


def _looks_like_pdf(data: bytes) -> bool:
    """Return True when bytes contain a PDF header near the start of the file."""
    return bool(data) and b"%PDF-" in data[:1024]


def _open_bytes(data: bytes, password: Optional[str] = None) -> fitz.Document:
    """Open PDF bytes and reject non-PDF or locked encrypted files clearly."""
    if not _looks_like_pdf(data):
        raise ValueError("Invalid File Format. Please select a valid PDF file.")

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc

    if doc.page_count < 1:
        doc.close()
        raise ValueError("PDF has no pages to rotate.")

    if doc.needs_pass:
        if not password:
            doc.close()
            raise ValueError("This PDF is password-protected. Supply a password to rotate it.")
        if not doc.authenticate(password):
            doc.close()
            raise ValueError("Incorrect password for encrypted PDF.")

    return doc


def _to_bytes(doc: fitz.Document) -> bytes:
    """Serialize a document with safe cleanup and stream compression."""
    buf = io.BytesIO()
    doc.save(
        buf,
        garbage=4,
        deflate=True,
        clean=True,
    )
    doc.close()
    buf.seek(0)
    return buf.read()


def _normalize_rotation(angle: int) -> int:
    """Convert any integer angle to a supported PDF rotation value."""
    normalized = int(angle) % 360
    if normalized not in VALID_ROTATIONS:
        raise ValueError("Rotations must be one of 0, 90, 180 or 270 degrees.")
    return normalized


def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Return page count and first-page thumbnail for preview flows.

    Response shape mirrors the merge/compress info endpoints:
    {"page_count": int, "thumbnail": "data:image/jpeg;base64,..."}
    """
    doc = _open_bytes(data, password)
    page_count = doc.page_count

    page = doc[0]
    mat = fitz.Matrix(3.0, 3.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    jpeg = pix.tobytes("jpeg", jpg_quality=92)
    doc.close()

    b64 = base64.b64encode(jpeg).decode("ascii")
    return {
        "page_count": page_count,
        "thumbnail": f"data:image/jpeg;base64,{b64}",
    }


def rotate_pdf_pages(
    data: bytes,
    rotations: Sequence[int],
    deleted_pages: Optional[Sequence[int]] = None,
    password: Optional[str] = None,
) -> bytes:
    """
    Apply per-page rotations and optional page deletions to a PDF.

    rotations is zero-based by original page index and must have exactly one value per
    page. Values are absolute cumulative rotations: 0, 90, 180 or 270.
    deleted_pages is an optional sequence of zero-based original page indices to remove.
    """
    doc = _open_bytes(data, password)
    page_count = doc.page_count

    if len(rotations) != page_count:
        doc.close()
        raise ValueError(
            f"Rotation count must match PDF page count ({page_count})."
        )

    deleted_set = {int(idx) for idx in (deleted_pages or []) if 0 <= int(idx) < page_count}
    if len(deleted_set) >= page_count:
        doc.close()
        raise ValueError("Cannot delete all pages in the PDF. At least one page must remain.")

    for index in range(page_count):
        if index not in deleted_set:
            doc[index].set_rotation(_normalize_rotation(rotations[index]))

    for index in sorted(deleted_set, reverse=True):
        doc.delete_page(index)

    return _to_bytes(doc)
