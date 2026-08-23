"""
PDF → TXT router — ToolCEO
============================

Endpoints
---------
POST /api/pdf/txt/info
    Synchronous.  Accepts a single PDF and returns its page count, file size,
    and a base64 JPEG thumbnail of the first page.

    Form fields  : file, password
    Response     : { "page_count", "file_size", "thumbnail" }

POST /api/pdf/txt/convert
    Async job.  Accepts a single PDF and enqueues the PDF→TXT extraction.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the PDF to extract
    password         : str | None  – unlock password for encrypted PDFs
    output_filename  : str | None  – desired filename (default "<stem>.txt")
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.pdf_convertor.pdf_txt.engine import (
    convert_pdf_to_txt,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/txt", tags=["PDF to TXT"])
_pool  = ThreadPoolExecutor(max_workers=4)

_TXT_TYPE = "text/plain; charset=utf-8"


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
    media_type: str = _TXT_TYPE,
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
        job_store.set_error(job_id, f"Extraction error: {exc}")


def _submit(job_id: str, fn, *args, filename: str, media_type: str = _TXT_TYPE) -> None:
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


# ---------------------------------------------------------------------------
# POST /api/pdf/txt/info  –  synchronous preview helper
# ---------------------------------------------------------------------------

@router.post(
    "/info",
    summary="Return page count, file size and first-page thumbnail for a PDF",
)
async def pdf_txt_info(
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
# POST /api/pdf/txt/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/convert",
    summary="Extract plain text from a PDF",
)
async def pdf_to_txt(
    file:            UploadFile       = File(...),
    password:        Optional[str]   = Form(None),
    output_filename: Optional[str]   = Form(None),
):
    raw = await _read(file)

    stem     = (file.filename or "document").rsplit(".", 1)[0]
    out_name = (output_filename or "").strip() or f"{stem}"
    if not out_name.lower().endswith(".txt"):
        out_name += ".txt"

    job = job_store.create_job()
    _submit(
        job.id,
        convert_pdf_to_txt,
        raw,
        password or None,
        job.id,
        filename=out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
