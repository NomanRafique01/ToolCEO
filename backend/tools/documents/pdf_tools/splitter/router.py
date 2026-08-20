"""
PDF Splitter router.

Endpoints:
  POST /api/pdf/page-count  – synchronous, returns {"page_count": N} immediately
  POST /api/pdf/thumbnail   – synchronous, returns base64 JPEG thumbnail of first page
  POST /api/pdf/split       – async job: range → single PDF, no range → auto-chunked ZIP

Each async endpoint:
  1. Creates a job and returns its ID immediately (202 Accepted).
  2. Runs the engine function in a thread, emitting progress via the job store.
  3. Frontend polls /api/progress/{job_id} via SSE then fetches /api/download/{job_id}.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.pdf_tools.splitter.engine import (
    _auto_chunk_size,
    split_pdf,
    split_pdf_chunked,
    split_pdf_to_zip,
)

router = APIRouter(prefix="/pdf", tags=["PDF Splitter"])
_pool = ThreadPoolExecutor(max_workers=4)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _run_job(job_id: str, fn, *args, filename: str, media_type: str = "application/pdf"):
    """Execute fn(*args) in the thread pool, updating job progress."""
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


# ---------------------------------------------------------------------------
# 0a. Page count  (synchronous – no job, no SSE)
# ---------------------------------------------------------------------------

@router.post("/page-count", summary="Return the page count of a PDF without processing it")
async def page_count(file: UploadFile = File(...)):
    import fitz  # PyMuPDF
    raw = await _read(file)
    try:
        doc = fitz.open(stream=raw, filetype="pdf")
        count = doc.page_count
        doc.close()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")
    return JSONResponse({"page_count": count})


# ---------------------------------------------------------------------------
# 0b. First-page thumbnail  (synchronous – returns base64 JPEG data URI)
# ---------------------------------------------------------------------------

@router.post("/thumbnail", summary="Render first page of a PDF as a base64 JPEG thumbnail")
async def pdf_thumbnail(file: UploadFile = File(...)):
    import fitz  # PyMuPDF
    import base64
    raw = await _read(file)
    try:
        doc = fitz.open(stream=raw, filetype="pdf")
        page = doc[0]
        mat = fitz.Matrix(2.0, 2.0)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        jpeg_bytes = pix.tobytes("jpeg", jpg_quality=82)
        doc.close()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not render thumbnail: {exc}")
    b64 = base64.b64encode(jpeg_bytes).decode()
    return JSONResponse({"thumbnail": f"data:image/jpeg;base64,{b64}"})


# ---------------------------------------------------------------------------
# Split  (async job)
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
