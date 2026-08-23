"""
PDF → Images router — ToolCEO
================================

Endpoints
---------
POST /api/pdf/images/info
    Synchronous.  Accepts a single PDF, returns page_count, file_size,
    and a base64 JPEG thumbnail of page 1.

    Form fields  : file, password
    Response     : { "page_count", "file_size", "thumbnail" }

POST /api/pdf/images/convert
    Async job.  Converts PDF pages to PNGs bundled in a ZIP.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads
    from /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the PDF to convert
    password         : str | None  – unlock password for encrypted PDFs
    output_filename  : str | None  – desired ZIP stem (default "<stem>_images")
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.pdf_convertor.pdf_images.engine import (
    convert_pdf_to_images,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/images", tags=["PDF to Images"])
_pool  = ThreadPoolExecutor(max_workers=4)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _run_job(job_id: str, fn, *args, filename: str, media_type: str) -> None:
    try:
        job_store.set_progress(job_id, 10)
        result = fn(*args)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, media_type)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


def _submit(job_id: str, fn, *args, filename: str, media_type: str) -> None:
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


# ---------------------------------------------------------------------------
# POST /api/pdf/images/info
# ---------------------------------------------------------------------------

@router.post(
    "/info",
    summary="Return page count, file size and first-page thumbnail for a PDF",
)
async def pdf_images_info(
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
# POST /api/pdf/images/convert
# ---------------------------------------------------------------------------

@router.post(
    "/convert",
    summary="Convert a PDF to PNG images bundled in a ZIP archive",
)
async def pdf_to_images(
    file:            UploadFile       = File(...),
    password:        Optional[str]   = Form(None),
    output_filename: Optional[str]   = Form(None),
):
    raw = await _read(file)

    stem     = (file.filename or "document").rsplit(".", 1)[0]
    out_name = (output_filename or "").strip() or f"{stem}_images"
    if not out_name.lower().endswith(".zip"):
        out_name += ".zip"

    job = job_store.create_job()
    _submit(
        job.id,
        convert_pdf_to_images,
        raw,
        password or None,
        job.id,
        filename=out_name,
        media_type="application/zip",
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
