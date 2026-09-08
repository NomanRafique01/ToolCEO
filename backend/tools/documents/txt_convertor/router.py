"""
TXT conversion router — ToolCEO
===================================

Endpoints (all under /api/txt/...)
-------------------------------------
POST /api/txt/{target}/convert
    Async job.  Accepts a single TXT file and enqueues conversion.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the TXT to convert
    output_filename  : str | None  – desired filename  (default "<stem>.<ext>")

Supported targets: pdf, docx, html, md, epub, odt, rtf
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.txt_convertor.engine import (
    MEDIA_TYPES,
    convert_txt,
)

router = APIRouter(prefix="/txt", tags=["TXT Conversions"])
_pool  = job_executor

_TARGETS = list(MEDIA_TYPES.keys())   # ["pdf", "docx", "html", "md", "epub", "odt", "rtf"]
_EXT_MAP = {
    "pdf":  ".pdf",
    "docx": ".docx",
    "html": ".html",
    "md":   ".md",
    "epub": ".epub",
    "odt":  ".odt",
    "rtf":  ".rtf",
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
        result = convert_txt(data, target, job_id)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# POST /api/txt/{target}/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/pdf/convert",
    summary="Convert a TXT file to PDF",
)
async def txt_to_pdf(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "pdf", output_filename)


@router.post(
    "/docx/convert",
    summary="Convert a TXT file to DOCX",
)
async def txt_to_docx(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "docx", output_filename)


@router.post(
    "/html/convert",
    summary="Convert a TXT file to HTML",
)
async def txt_to_html(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "html", output_filename)


@router.post(
    "/md/convert",
    summary="Convert a TXT file to Markdown",
)
async def txt_to_md(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "md", output_filename)


@router.post(
    "/epub/convert",
    summary="Convert a TXT file to EPUB",
)
async def txt_to_epub(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "epub", output_filename)


@router.post(
    "/odt/convert",
    summary="Convert a TXT file to ODT",
)
async def txt_to_odt(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "odt", output_filename)


@router.post(
    "/rtf/convert",
    summary="Convert a TXT file to RTF",
)
async def txt_to_rtf(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "rtf", output_filename)


# ---------------------------------------------------------------------------
# Shared enqueue helper
# ---------------------------------------------------------------------------

async def _enqueue(
    file:            UploadFile,
    target:          str,
    output_filename: Optional[str],
) -> JSONResponse:
    raw = await _read(file)

    stem     = (file.filename or "document").rsplit(".", 1)[0]
    ext      = _EXT_MAP[target]
    out_name = (output_filename or "").strip() or stem
    if not out_name.lower().endswith(ext):
        out_name += ext

    job = job_store.create_job()
    _pool.submit(_run_job, job.id, raw, target, out_name)

    return JSONResponse({"job_id": job.id}, status_code=202)
