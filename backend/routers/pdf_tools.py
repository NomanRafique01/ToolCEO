"""
PDF tools router – POST endpoints for every PDF operation.
Each endpoint:
  1. Creates a job and returns its ID immediately (202 Accepted).
  2. Runs the engine function in a thread, emitting progress via the job store.
  3. Frontend polls /api/progress/{job_id} via SSE then fetches /api/download/{job_id}.

Also provides a synchronous helper:
  POST /api/pdf/page-count  – returns {"page_count": N} immediately (no job).
"""

from __future__ import annotations

import asyncio
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from converters.pdf_engine import (
    add_watermark,
    compress_pdf,
    decrypt_pdf,
    encrypt_pdf,
    extract_metadata,
    merge_pdfs,
    ocr_pdf,
    rotate_pdf,
)
# Splitter functions now live in the dedicated tool sub-module.
from tools.documents.pdf_tools.splitter.engine import (
    _auto_chunk_size,
    split_pdf,
    split_pdf_chunked,
    split_pdf_to_zip,
)

router = APIRouter(prefix="/pdf", tags=["PDF Tools"])
_pool = job_executor

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _run_job(job_id: str, fn, *args, filename: str, media_type: str = "application/pdf"):
    """Execute *fn(*args)* in the thread pool, updating job progress."""
    loop = asyncio.new_event_loop()
    try:
        job_store.set_progress(job_id, 10)
        result = fn(*args)
        job_store.set_done(job_id, result, filename, media_type)
    except Exception as exc:
        job_store.set_error(job_id, str(exc))
    finally:
        loop.close()


def _submit(job_id: str, fn, *args, filename: str, media_type: str = "application/pdf"):
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


def _page_count(raw: bytes) -> int:
    import fitz

    doc = fitz.open(stream=raw, filetype="pdf")
    try:
        return doc.page_count
    finally:
        doc.close()


def _thumbnail(raw: bytes) -> str:
    import base64
    import fitz

    doc = fitz.open(stream=raw, filetype="pdf")
    try:
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(3.0, 3.0), alpha=False)
        jpeg_bytes = pix.tobytes("jpeg", jpg_quality=92)
    finally:
        doc.close()
    b64 = base64.b64encode(jpeg_bytes).decode()
    return f"data:image/jpeg;base64,{b64}"


# ---------------------------------------------------------------------------
# 0a. Page count  (synchronous – no job, no SSE)
# ---------------------------------------------------------------------------

@router.post("/page-count", summary="Return the page count of a PDF without processing it")
async def page_count(file: UploadFile = File(...)):
    raw = await _read(file)
    try:
        count = await run_in_threadpool(_page_count, raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")
    return JSONResponse({"page_count": count})


# ---------------------------------------------------------------------------
# 0b. First-page thumbnail  (synchronous – returns base64 JPEG data URI)
# ---------------------------------------------------------------------------

@router.post("/thumbnail", summary="Render first page of a PDF as a base64 JPEG thumbnail")
async def pdf_thumbnail(file: UploadFile = File(...)):
    raw = await _read(file)
    try:
        thumbnail = await run_in_threadpool(_thumbnail, raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not render thumbnail: {exc}")
    return JSONResponse({"thumbnail": thumbnail})


# ---------------------------------------------------------------------------
# 1. Merge
# ---------------------------------------------------------------------------

@router.post("/merge", summary="Merge multiple PDFs into one")
async def merge(files: List[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=422, detail="At least two PDF files are required.")
    raw = [await _read(f) for f in files]
    job = job_store.create_job()
    _submit(job.id, merge_pdfs, raw, filename="merged.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 2. Split
# ---------------------------------------------------------------------------

@router.post("/split", summary="Split a PDF: range → single PDF, no range → auto-chunked ZIP")
async def split(
    file: UploadFile = File(...),
    start_page: Optional[int] = Form(None, ge=1),
    end_page:   Optional[int] = Form(None, ge=1),
    chunk_size:  Optional[int] = Form(None, ge=1),
):
    raw = await _read(file)
    job = job_store.create_job()

    # No range provided → auto-chunk split into a ZIP
    if start_page is None and end_page is None:
        import fitz as _fitz
        _src = _fitz.open(stream=raw, filetype="pdf")
        total_pages = _src.page_count
        _src.close()

        effective_chunk = chunk_size if chunk_size else _auto_chunk_size(total_pages)
        _submit(job.id, split_pdf_chunked, raw, effective_chunk,
                filename="split_pdfs.zip", media_type="application/zip")
    else:
        s = start_page or 1
        e = end_page   or 99999
        if e < s:
            raise HTTPException(status_code=422, detail="end_page must be >= start_page.")
        _submit(job.id, split_pdf, raw, s, e,
                filename=f"split_{s}-{e}.pdf")

    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 3. Compress
# ---------------------------------------------------------------------------

@router.post("/compress", summary="Compress a PDF to reduce file size")
async def compress(file: UploadFile = File(...)):
    raw = await _read(file)
    job = job_store.create_job()
    _submit(job.id, compress_pdf, raw, filename="compressed.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 4. Rotate
# ---------------------------------------------------------------------------

@router.post("/rotate", summary="Rotate pages in a PDF")
async def rotate(
    file: UploadFile = File(...),
    degrees: int = Form(...),
    pages: Optional[str] = Form(None),
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
    job = job_store.create_job()
    _submit(job.id, rotate_pdf, raw, degrees, page_list, filename="rotated.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 5. Watermark
# ---------------------------------------------------------------------------

@router.post("/watermark", summary="Add a diagonal text watermark to every page")
async def watermark(
    file: UploadFile = File(...),
    text: str = Form(...),
    font_size: int = Form(48, ge=8, le=200),
    opacity: float = Form(0.25, ge=0.0, le=1.0),
):
    raw = await _read(file)
    job = job_store.create_job()
    _pool.submit(_run_job_kwargs, job.id, add_watermark, raw,
                 kw=dict(text=text, font_size=font_size, opacity=opacity),
                 filename="watermarked.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 6. Encrypt
# ---------------------------------------------------------------------------

@router.post("/encrypt", summary="Encrypt a PDF with a password (AES-256)")
async def encrypt(
    file: UploadFile = File(...),
    user_password: str = Form(...),
    owner_password: Optional[str] = Form(None),
):
    raw = await _read(file)
    job = job_store.create_job()
    _pool.submit(_run_job, job.id, encrypt_pdf, raw, user_password, owner_password,
                 filename="encrypted.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 7. Decrypt
# ---------------------------------------------------------------------------

@router.post("/decrypt", summary="Remove password protection from an encrypted PDF")
async def decrypt(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    raw = await _read(file)
    job = job_store.create_job()
    _pool.submit(_run_job, job.id, decrypt_pdf, raw, password,
                 filename="decrypted.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 8. Extract metadata  (returns JSON, not a file)
# ---------------------------------------------------------------------------

@router.post("/metadata", summary="Extract PDF metadata and document statistics")
async def metadata(file: UploadFile = File(...)):
    import json as _json
    raw = await _read(file)
    job = job_store.create_job()

    def _meta_fn(data):
        info = extract_metadata(data)
        return _json.dumps(info, indent=2).encode()

    _pool.submit(_run_job, job.id, _meta_fn, raw,
                 filename="metadata.json", media_type="application/json")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 9. OCR
# ---------------------------------------------------------------------------

@router.post("/ocr", summary="Extract text from a scanned PDF using Tesseract OCR")
async def ocr(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    dpi: int = Form(300, ge=72, le=600),
):
    raw = await _read(file)
    job = job_store.create_job()

    def _ocr_fn(data):
        text = ocr_pdf(data, language=language, dpi=dpi)
        return text.encode("utf-8")

    _pool.submit(_run_job, job.id, _ocr_fn, raw,
                 filename="ocr_output.txt", media_type="text/plain")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# Internal: job runner that accepts keyword args
# ---------------------------------------------------------------------------

def _run_job_kwargs(job_id: str, fn, *args, kw: dict, filename: str,
                    media_type: str = "application/pdf"):
    try:
        job_store.set_progress(job_id, 10)
        result = fn(*args, **kw)
        job_store.set_done(job_id, result, filename, media_type)
    except Exception as exc:
        job_store.set_error(job_id, str(exc))
