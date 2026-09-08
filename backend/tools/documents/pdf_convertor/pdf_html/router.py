"""
PDF → HTML router — ToolCEO
==============================

Endpoints
---------
POST /api/pdf/html/info
    Synchronous.  Accepts a single PDF and returns its page count, file size,
    and a base64 JPEG thumbnail of the first page.

    Form fields  : file, password
    Response     : { "page_count", "file_size", "thumbnail" }

POST /api/pdf/html/convert
    Async job.  Accepts a single PDF and enqueues the PDF→HTML conversion.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the PDF to convert
    password         : str | None  – unlock password for encrypted PDFs
    output_filename  : str | None  – desired filename (default "<stem>.html")
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.pdf_convertor.pdf_html.engine import (
    convert_pdf_to_html,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/html", tags=["PDF to HTML"])
_pool  = job_executor

_HTML_TYPE = "text/html"


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
    media_type: str = _HTML_TYPE,
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
        job_store.set_error(job_id, f"Conversion error: {exc}")


def _submit(job_id: str, fn, *args, filename: str, media_type: str = _HTML_TYPE) -> None:
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


# ---------------------------------------------------------------------------
# POST /api/pdf/html/info  –  synchronous preview helper
# ---------------------------------------------------------------------------

@router.post(
    "/info",
    summary="Return page count, file size and first-page thumbnail for a PDF",
)
async def pdf_html_info(
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
# POST /api/pdf/html/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/convert",
    summary="Convert a PDF to an HTML web page",
)
async def pdf_to_html(
    file:            UploadFile       = File(...),
    password:        Optional[str]   = Form(None),
    output_filename: Optional[str]   = Form(None),
):
    raw = await _read(file)

    stem     = (file.filename or "document").rsplit(".", 1)[0]
    out_name = (output_filename or "").strip() or f"{stem}"
    if not out_name.lower().endswith(".html"):
        out_name += ".html"

    job = job_store.create_job()
    _submit(
        job.id,
        convert_pdf_to_html,
        raw,
        password or None,
        job.id,
        filename=out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
