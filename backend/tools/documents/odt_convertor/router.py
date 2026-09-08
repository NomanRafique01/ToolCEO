"""
ODT conversion router — ToolCEO
===================================

Endpoints (all under /api/odt/...)
-------------------------------------
POST /api/odt/{target}/convert
    Async job.  Accepts a single ODT file and enqueues conversion.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the ODT to convert
    output_filename  : str | None  – desired filename  (default "<stem>.<ext>")

Supported targets: pdf, docx, html, rtf, txt, epub, md
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.odt_convertor.engine import (
    MEDIA_TYPES,
    convert_odt,
)

router = APIRouter(prefix="/odt", tags=["ODT Conversions"])
_pool  = job_executor

_TARGETS = list(MEDIA_TYPES.keys())   # ["pdf", "docx", "html", "rtf", "txt", "epub", "md"]
_EXT_MAP = {
    "pdf":  ".pdf",
    "docx": ".docx",
    "html": ".html",
    "rtf":  ".rtf",
    "txt":  ".txt",
    "epub": ".epub",
    "md":   ".md",
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
        result = convert_odt(data, target, job_id)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# POST /api/odt/{target}/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/pdf/convert",
    summary="Convert an ODT file to PDF",
)
async def odt_to_pdf(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "pdf", output_filename)


@router.post(
    "/docx/convert",
    summary="Convert an ODT file to DOCX",
)
async def odt_to_docx(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "docx", output_filename)


@router.post(
    "/html/convert",
    summary="Convert an ODT file to HTML",
)
async def odt_to_html(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "html", output_filename)


@router.post(
    "/rtf/convert",
    summary="Convert an ODT file to RTF",
)
async def odt_to_rtf(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "rtf", output_filename)


@router.post(
    "/txt/convert",
    summary="Convert an ODT file to plain text",
)
async def odt_to_txt(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "txt", output_filename)


@router.post(
    "/epub/convert",
    summary="Convert an ODT file to EPUB",
)
async def odt_to_epub(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "epub", output_filename)


@router.post(
    "/md/convert",
    summary="Convert an ODT file to Markdown",
)
async def odt_to_md(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "md", output_filename)


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
