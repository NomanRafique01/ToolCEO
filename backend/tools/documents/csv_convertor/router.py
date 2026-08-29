"""
CSV conversion router — ToolCEO
===================================

Endpoints (all under /api/csv/...)
-------------------------------------
POST /api/csv/{target}/convert
    Async job.  Accepts a single CSV file and enqueues conversion.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the CSV to convert
    output_filename  : str | None  – desired filename  (default "<stem>.<ext>")

Supported targets: json, xlsx, html, md, pdf, txt, xml, sql
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.csv_convertor.engine import (
    MEDIA_TYPES,
    convert_csv,
)

router = APIRouter(prefix="/csv", tags=["CSV Conversions"])
_pool  = ThreadPoolExecutor(max_workers=4)

_TARGETS = list(MEDIA_TYPES.keys())   # ["json", "xlsx", "html", "md", "pdf", "txt", "xml", "sql"]
_EXT_MAP = {
    "json": ".json",
    "xlsx": ".xlsx",
    "html": ".html",
    "md":   ".md",
    "pdf":  ".pdf",
    "txt":  ".txt",
    "xml":  ".xml",
    "sql":  ".sql",
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
    table_name: str,
) -> None:
    """Execute conversion in a thread-pool worker, updating job progress."""
    try:
        job_store.set_progress(job_id, 10)
        result = convert_csv(data, target, job_id, table_name)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# POST /api/csv/{target}/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/json/convert",
    summary="Convert a CSV file to JSON",
)
async def csv_to_json(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "json", output_filename)


@router.post(
    "/xlsx/convert",
    summary="Convert a CSV file to XLSX",
)
async def csv_to_xlsx(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "xlsx", output_filename)


@router.post(
    "/html/convert",
    summary="Convert a CSV file to HTML",
)
async def csv_to_html(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "html", output_filename)


@router.post(
    "/md/convert",
    summary="Convert a CSV file to Markdown",
)
async def csv_to_md(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "md", output_filename)


@router.post(
    "/pdf/convert",
    summary="Convert a CSV file to PDF",
)
async def csv_to_pdf(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "pdf", output_filename)


@router.post(
    "/txt/convert",
    summary="Convert a CSV file to TXT",
)
async def csv_to_txt(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "txt", output_filename)


@router.post(
    "/xml/convert",
    summary="Convert a CSV file to XML",
)
async def csv_to_xml(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "xml", output_filename)


@router.post(
    "/sql/convert",
    summary="Convert a CSV file to SQL",
)
async def csv_to_sql(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "sql", output_filename)


# ---------------------------------------------------------------------------
# Shared enqueue helper
# ---------------------------------------------------------------------------

async def _enqueue(
    file:            UploadFile,
    target:          str,
    output_filename: Optional[str],
) -> JSONResponse:
    raw = await _read(file)

    stem     = (file.filename or "data").rsplit(".", 1)[0]
    ext      = _EXT_MAP[target]
    out_name = (output_filename or "").strip() or stem
    if not out_name.lower().endswith(ext):
        out_name += ext

    job = job_store.create_job()
    _pool.submit(_run_job, job.id, raw, target, out_name, stem)

    return JSONResponse({"job_id": job.id}, status_code=202)
