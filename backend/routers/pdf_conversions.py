"""
PDF conversions router.

POST endpoints for every format conversion.
All inputs are multipart/form-data file uploads; outputs are returned as
file downloads with the appropriate Content-Type header.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from converters.pdf_converter import (
    docx_to_pdf,
    html_to_pdf,
    images_to_pdf,
    md_to_pdf,
    pdf_to_docx,
    pdf_to_html,
    pdf_to_images,
    pdf_to_txt,
)

router = APIRouter(prefix="/convert", tags=["PDF Conversions"])

# ---------------------------------------------------------------------------
# Media-type constants
# ---------------------------------------------------------------------------

_PDF   = "application/pdf"
_DOCX  = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_HTML  = "text/html; charset=utf-8"
_TXT   = "text/plain; charset=utf-8"
_ZIP   = "application/zip"
_MD    = "text/markdown; charset=utf-8"


def _resp(content: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


# ---------------------------------------------------------------------------
# 1. PDF → DOCX
# ---------------------------------------------------------------------------

@router.post(
    "/pdf-to-docx",
    summary="Convert PDF to DOCX (via Pandoc)",
)
async def route_pdf_to_docx(
    file: UploadFile = File(..., description="PDF file to convert"),
):
    raw = await _read(file)
    try:
        result = pdf_to_docx(raw)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    stem = file.filename.rsplit(".", 1)[0] if file.filename else "output"
    return _resp(result, _DOCX, f"{stem}.docx")


# ---------------------------------------------------------------------------
# 2. PDF → HTML
# ---------------------------------------------------------------------------

@router.post(
    "/pdf-to-html",
    summary="Convert PDF to standalone HTML (via Pandoc)",
)
async def route_pdf_to_html(
    file: UploadFile = File(..., description="PDF file to convert"),
):
    raw = await _read(file)
    try:
        result = pdf_to_html(raw)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    stem = file.filename.rsplit(".", 1)[0] if file.filename else "output"
    return _resp(result, _HTML, f"{stem}.html")


# ---------------------------------------------------------------------------
# 3. PDF → TXT
# ---------------------------------------------------------------------------

@router.post(
    "/pdf-to-txt",
    summary="Convert PDF to plain text (via Pandoc)",
)
async def route_pdf_to_txt(
    file: UploadFile = File(..., description="PDF file to convert"),
):
    raw = await _read(file)
    try:
        result = pdf_to_txt(raw)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    stem = file.filename.rsplit(".", 1)[0] if file.filename else "output"
    return _resp(result, _TXT, f"{stem}.txt")


# ---------------------------------------------------------------------------
# 4. PDF → Images (ZIP of JPEGs)
# ---------------------------------------------------------------------------

@router.post(
    "/pdf-to-images",
    summary="Render each PDF page to a JPEG and return a ZIP archive",
)
async def route_pdf_to_images(
    file: UploadFile = File(..., description="PDF file to render"),
    dpi: int = Form(150, ge=72, le=600, description="Render DPI (default 150)"),
):
    raw = await _read(file)
    try:
        result = pdf_to_images(raw, dpi=dpi)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    stem = file.filename.rsplit(".", 1)[0] if file.filename else "output"
    return _resp(result, _ZIP, f"{stem}_pages.zip")


# ---------------------------------------------------------------------------
# 5. DOCX → PDF
# ---------------------------------------------------------------------------

@router.post(
    "/docx-to-pdf",
    summary="Convert DOCX to PDF (via LibreOffice)",
)
async def route_docx_to_pdf(
    file: UploadFile = File(..., description="DOCX file to convert"),
):
    raw = await _read(file)
    try:
        result = docx_to_pdf(raw)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    stem = file.filename.rsplit(".", 1)[0] if file.filename else "output"
    return _resp(result, _PDF, f"{stem}.pdf")


# ---------------------------------------------------------------------------
# 6. HTML → PDF
# ---------------------------------------------------------------------------

@router.post(
    "/html-to-pdf",
    summary="Convert HTML to PDF (via LibreOffice)",
)
async def route_html_to_pdf(
    file: UploadFile = File(..., description="HTML file to convert"),
):
    raw = await _read(file)
    try:
        result = html_to_pdf(raw)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    stem = file.filename.rsplit(".", 1)[0] if file.filename else "output"
    return _resp(result, _PDF, f"{stem}.pdf")


# ---------------------------------------------------------------------------
# 7. Markdown → PDF
# ---------------------------------------------------------------------------

@router.post(
    "/md-to-pdf",
    summary="Convert Markdown to PDF (via Pandoc)",
)
async def route_md_to_pdf(
    file: UploadFile = File(..., description="Markdown (.md) file to convert"),
):
    raw = await _read(file)
    try:
        result = md_to_pdf(raw)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    stem = file.filename.rsplit(".", 1)[0] if file.filename else "output"
    return _resp(result, _PDF, f"{stem}.pdf")


# ---------------------------------------------------------------------------
# 8. Images → PDF
# ---------------------------------------------------------------------------

@router.post(
    "/images-to-pdf",
    summary="Combine one or more images into a single PDF (via PyMuPDF)",
)
async def route_images_to_pdf(
    files: List[UploadFile] = File(..., description="Image files (JPEG, PNG, BMP, TIFF, WebP …)"),
):
    if not files:
        raise HTTPException(status_code=422, detail="At least one image file is required.")
    pairs = [(f.filename or f"image_{i}.jpg", await _read(f)) for i, f in enumerate(files)]
    try:
        result = images_to_pdf(pairs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _resp(result, _PDF, "combined.pdf")
