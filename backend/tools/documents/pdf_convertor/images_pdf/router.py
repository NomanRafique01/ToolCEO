"""
Images → PDF router — ToolCEO
================================

Endpoints
---------
POST /api/images/pdf/convert
    Async job.  Accepts one or more images in order, bundles them into a PDF.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads
    from /api/download/{job_id}.

    Form fields
    -----------
    files            : List[UploadFile]  – images in desired page order
    output_filename  : str | None        – desired filename (default "images_converted.pdf")
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.pdf_convertor.images_pdf.engine import convert_images_to_pdf

router = APIRouter(prefix="/images/pdf", tags=["Images to PDF"])
_pool  = job_executor


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run_job(job_id: str, images: list[bytes], filename: str) -> None:
    try:
        job_store.set_progress(job_id, 10)
        result = convert_images_to_pdf(images, job_id=job_id)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, "application/pdf")
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# POST /api/images/pdf/convert
# ---------------------------------------------------------------------------

@router.post(
    "/convert",
    summary="Bundle one or more images into a single PDF, one image per page",
)
async def images_to_pdf(
    files:           List[UploadFile]  = File(...),
    output_filename: Optional[str]     = Form(None),
):
    if not files:
        raise HTTPException(status_code=422, detail="At least one image is required.")

    images = [await f.read() for f in files]

    out_name = (output_filename or "").strip() or "images_converted"
    if not out_name.lower().endswith(".pdf"):
        out_name += ".pdf"

    job = job_store.create_job()
    _pool.submit(_run_job, job.id, images, out_name)

    return JSONResponse({"job_id": job.id}, status_code=202)
