"""
PDF Compressor router — ToolCEO
================================

Endpoints
---------
POST /api/pdf/compressor/info
    Synchronous.  Accepts a single PDF (+ optional password) and returns its
    page count, file size in bytes, and a base64 JPEG thumbnail of the first
    page.  Used by the frontend to populate the preview card.

    Form fields  : file, password
    Response     : { "page_count", "file_size", "thumbnail" }

POST /api/pdf/compressor/compress
    Async job.  Accepts a single PDF plus compression options and enqueues
    the work.  Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the PDF to compress
    password         : str | None  – unlock password for encrypted PDFs
    max_file_size    : int | None  – target output size in bytes (None = structural only)
    output_filename  : str | None  – desired filename  (default "compressed.pdf")
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.pdf_tools.compressor.engine import (
    CompressOptions,
    compress_pdf,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/compressor", tags=["PDF Compressor"])
_pool  = ThreadPoolExecutor(max_workers=4)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _run_job(
    job_id: str,
    fn,
    *args,
    filename: str,
    media_type: str = "application/pdf",
) -> None:
    """Execute *fn(*args)* in a thread-pool worker, updating job progress."""
    try:
        job_store.set_progress(job_id, 10)
        result = fn(*args)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, media_type)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Unexpected error: {exc}")


def _submit(
    job_id: str,
    fn,
    *args,
    filename: str,
    media_type: str = "application/pdf",
) -> None:
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


# ---------------------------------------------------------------------------
# POST /api/pdf/compressor/info  –  synchronous preview helper
# ---------------------------------------------------------------------------

@router.post(
    "/info",
    summary="Return page count, file size and first-page thumbnail for a PDF",
)
async def pdf_compressor_info(
    file:     UploadFile       = File(...),
    password: Optional[str]   = Form(None),
):
    raw = await _read(file)
    try:
        info = get_pdf_info(raw, password or None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")
    return JSONResponse(info)


# ---------------------------------------------------------------------------
# POST /api/pdf/compressor/compress  –  async compression job
# ---------------------------------------------------------------------------

@router.post(
    "/compress",
    summary="Compress a PDF (structural + optional adaptive JPEG quality)",
)
async def compress(
    file:            UploadFile       = File(...),
    password:        Optional[str]   = Form(None),
    max_file_size:   Optional[int]   = Form(None),
    output_filename: Optional[str]   = Form(None),
):
    opts = CompressOptions(
        max_file_size=max_file_size if max_file_size and max_file_size > 0 else None,
    )

    raw = await _read(file)

    out_name = (output_filename or "compressed").strip()
    if not out_name.lower().endswith(".pdf"):
        out_name += ".pdf"

    job = job_store.create_job()
    _submit(
        job.id,
        compress_pdf,
        raw,
        opts,
        password or None,
        job.id,
        filename=out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
