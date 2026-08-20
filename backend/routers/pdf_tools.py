"""
PDF tools router – POST endpoints for every PDF operation.
All endpoints accept multipart/form-data file uploads and return
the processed file as an inline download (application/pdf or text/plain).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from converters.pdf_engine import (
    add_watermark,
    compress_pdf,
    decrypt_pdf,
    encrypt_pdf,
    extract_metadata,
    merge_pdfs,
    ocr_pdf,
    rotate_pdf,
    split_pdf,
)

router = APIRouter(prefix="/pdf", tags=["PDF Tools"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PDF_MEDIA = "application/pdf"


def _pdf_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type=PDF_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


# ---------------------------------------------------------------------------
# 1. Merge
# ---------------------------------------------------------------------------

@router.post("/merge", summary="Merge multiple PDFs into one")
async def merge(files: List[UploadFile] = File(..., description="Two or more PDF files to merge")):
    if len(files) < 2:
        raise HTTPException(status_code=422, detail="At least two PDF files are required.")
    raw = [await _read(f) for f in files]
    try:
        result = merge_pdfs(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _pdf_response(result, "merged.pdf")


# ---------------------------------------------------------------------------
# 2. Split
# ---------------------------------------------------------------------------

@router.post("/split", summary="Extract a page range into a new PDF")
async def split(
    file: UploadFile = File(..., description="Source PDF"),
    start_page: int = Form(..., ge=1, description="First page to include (1-based)"),
    end_page: int = Form(..., ge=1, description="Last page to include (1-based)"),
):
    if end_page < start_page:
        raise HTTPException(status_code=422, detail="end_page must be >= start_page.")
    raw = await _read(file)
    try:
        result = split_pdf(raw, start_page, end_page)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _pdf_response(result, f"split_{start_page}-{end_page}.pdf")


# ---------------------------------------------------------------------------
# 3. Compress
# ---------------------------------------------------------------------------

@router.post("/compress", summary="Compress a PDF to reduce file size")
async def compress(file: UploadFile = File(..., description="PDF to compress")):
    raw = await _read(file)
    try:
        result = compress_pdf(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _pdf_response(result, "compressed.pdf")


# ---------------------------------------------------------------------------
# 4. Rotate
# ---------------------------------------------------------------------------

@router.post("/rotate", summary="Rotate pages in a PDF")
async def rotate(
    file: UploadFile = File(..., description="PDF to rotate"),
    degrees: int = Form(..., description="Rotation angle: 90, 180, or 270"),
    pages: Optional[str] = Form(
        None,
        description="Comma-separated 1-based page numbers to rotate. Omit for all pages.",
    ),
):
    if degrees % 90 != 0:
        raise HTTPException(status_code=422, detail="degrees must be a multiple of 90.")
    page_list: Optional[list[int]] = None
    if pages:
        try:
            page_list = [int(p.strip()) for p in pages.split(",") if p.strip()]
        except ValueError:
            raise HTTPException(status_code=422, detail="pages must be comma-separated integers.")
    raw = await _read(file)
    try:
        result = rotate_pdf(raw, degrees, page_list)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _pdf_response(result, "rotated.pdf")


# ---------------------------------------------------------------------------
# 5. Watermark
# ---------------------------------------------------------------------------

@router.post("/watermark", summary="Add a diagonal text watermark to every page")
async def watermark(
    file: UploadFile = File(..., description="PDF to watermark"),
    text: str = Form(..., description="Watermark text"),
    font_size: int = Form(48, ge=8, le=200, description="Font size in points"),
    opacity: float = Form(0.25, ge=0.0, le=1.0, description="Opacity between 0 and 1"),
):
    raw = await _read(file)
    try:
        result = add_watermark(raw, text, font_size=font_size, opacity=opacity)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _pdf_response(result, "watermarked.pdf")


# ---------------------------------------------------------------------------
# 6. Encrypt
# ---------------------------------------------------------------------------

@router.post("/encrypt", summary="Encrypt a PDF with a password (AES-256)")
async def encrypt(
    file: UploadFile = File(..., description="PDF to encrypt"),
    user_password: str = Form(..., description="Password required to open the file"),
    owner_password: Optional[str] = Form(
        None, description="Password for owner permissions (defaults to user_password)"
    ),
):
    raw = await _read(file)
    try:
        result = encrypt_pdf(raw, user_password, owner_password)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _pdf_response(result, "encrypted.pdf")


# ---------------------------------------------------------------------------
# 7. Decrypt
# ---------------------------------------------------------------------------

@router.post("/decrypt", summary="Remove password protection from an encrypted PDF")
async def decrypt(
    file: UploadFile = File(..., description="Password-protected PDF"),
    password: str = Form(..., description="Current password"),
):
    raw = await _read(file)
    try:
        result = decrypt_pdf(raw, password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _pdf_response(result, "decrypted.pdf")


# ---------------------------------------------------------------------------
# 8. Extract metadata
# ---------------------------------------------------------------------------

@router.post("/metadata", summary="Extract PDF metadata and document statistics")
async def metadata(file: UploadFile = File(..., description="PDF to inspect")):
    raw = await _read(file)
    try:
        info = extract_metadata(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return info


# ---------------------------------------------------------------------------
# 9. OCR
# ---------------------------------------------------------------------------

@router.post("/ocr", summary="Extract text from a scanned PDF using Tesseract OCR")
async def ocr(
    file: UploadFile = File(..., description="Scanned PDF to OCR"),
    language: str = Form("eng", description="Tesseract language code, e.g. eng, fra, deu"),
    dpi: int = Form(300, ge=72, le=600, description="Render DPI; higher = better quality but slower"),
):
    raw = await _read(file)
    try:
        text = ocr_pdf(raw, language=language, dpi=dpi)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=text,
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="ocr_output.txt"'},
    )
