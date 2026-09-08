"""
PPTX conversion router — ToolCEO
===================================

Endpoints (all under /api/pptx/...)
-------------------------------------
POST /api/pptx/{target}/convert
    Async job.  Accepts a single PPTX file and enqueues conversion.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the PPTX to convert
    output_filename  : str | None  – desired filename  (default "<stem>.<ext>")

Supported targets: pdf, html, images, odp, txt, pptx
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.pptx_convertor.engine import (
    MEDIA_TYPES,
    convert_pptx,
)

router = APIRouter(prefix="/pptx", tags=["PPTX Conversions"])
_pool  = job_executor

_EXT_MAP = {
    "pdf":    ".pdf",
    "html":   ".html",
    "images": ".zip",
    "odp":    ".odp",
    "txt":    ".txt",
    "pptx":   ".pptx",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _run_job(
    job_id: str,
    data: bytes,
    target: str,
    filename: str,
) -> None:
    """Execute conversion in a thread-pool worker, updating job progress."""
    try:
        job_store.set_progress(job_id, 10)
        result = convert_pptx(data, target, job_id)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# POST /api/pptx/{target}/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/pdf/convert",
    summary="Convert a PPTX file to PDF",
)
async def pptx_to_pdf(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "pdf", output_filename)


@router.post(
    "/html/convert",
    summary="Convert a PPTX file to HTML",
)
async def pptx_to_html(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "html", output_filename)


@router.post(
    "/images/convert",
    summary="Convert a PPTX file to images (PNG slides as ZIP)",
)
async def pptx_to_images(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "images", output_filename)


@router.post(
    "/odp/convert",
    summary="Convert a PPTX file to ODP",
)
async def pptx_to_odp(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "odp", output_filename)


@router.post(
    "/txt/convert",
    summary="Convert a PPTX file to plain text",
)
async def pptx_to_txt(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "txt", output_filename)


@router.post(
    "/repair/convert",
    summary="Repair / compress a PPTX file (open + re-save via LibreOffice)",
)
async def pptx_repair(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "pptx", output_filename)


# ---------------------------------------------------------------------------
# Shared enqueue helper
# ---------------------------------------------------------------------------

async def _enqueue(
    file:            UploadFile,
    target:          str,
    output_filename: Optional[str],
) -> JSONResponse:
    raw = await _read(file)

    stem     = (file.filename or "presentation").rsplit(".", 1)[0]
    ext      = _EXT_MAP[target]

    # For images: append "_images" suffix to the stem
    if target == "images":
        out_name = (output_filename or "").strip() or f"{stem}_images"
        if not out_name.lower().endswith(ext):
            out_name += ext
    else:
        out_name = (output_filename or "").strip() or stem
        if not out_name.lower().endswith(ext):
            out_name += ext

    job = job_store.create_job()
    _pool.submit(_run_job, job.id, raw, target, out_name)

    return JSONResponse({"job_id": job.id}, status_code=202)
