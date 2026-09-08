"""
PDF → Excel (XLSX) router — ToolCEO
=====================================

Endpoints
---------
POST /api/pdf/excel/info
    Synchronous.  Accepts a single PDF and returns its page count, file size,
    and a base64 JPEG thumbnail of the first page.

    Form fields  : file, password
    Response     : { "page_count", "file_size", "thumbnail" }

POST /api/pdf/excel/convert
    Async job.  Accepts a single PDF and enqueues the PDF→XLSX conversion.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the PDF to convert
    password         : str | None  – unlock password for encrypted PDFs
    output_filename  : str | None  – desired filename (default "<stem>.xlsx")
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.pdf_convertor.pdf_excel.engine import (
    convert_pdf_to_excel,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/excel", tags=["PDF to Excel"])
_pool  = job_executor

_XLSX_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


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
    media_type: str = _XLSX_TYPE,
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


def _submit(
    job_id: str, fn, *args, filename: str, media_type: str = _XLSX_TYPE
) -> None:
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


# ---------------------------------------------------------------------------
# POST /api/pdf/excel/info  –  synchronous preview helper
# ---------------------------------------------------------------------------

@router.post(
    "/info",
    summary="Return page count, file size and first-page thumbnail for a PDF",
)
async def pdf_excel_info(
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
# POST /api/pdf/excel/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/convert",
    summary="Convert a PDF to an Excel spreadsheet (.xlsx)",
)
async def pdf_to_excel(
    file:            UploadFile       = File(...),
    password:        Optional[str]   = Form(None),
    output_filename: Optional[str]   = Form(None),
):
    raw = await _read(file)

    stem     = (file.filename or "spreadsheet").rsplit(".", 1)[0]
    out_name = (output_filename or "").strip() or f"{stem}"
    if not out_name.lower().endswith(".xlsx"):
        out_name += ".xlsx"

    job = job_store.create_job()
    _submit(
        job.id,
        convert_pdf_to_excel,
        raw,
        password or None,
        job.id,
        filename=out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
