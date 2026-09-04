"""
XLSX conversion router — ToolCEO
===================================

Endpoints (all under /api/xlsx/...)
-------------------------------------
POST /api/xlsx/{target}/convert
    Async job.  Accepts a single XLSX file and enqueues conversion.
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the XLSX to convert
    output_filename  : str | None  – desired filename  (default "<stem>.<ext>")

Supported targets: pdf, csv, html, ods, txt, json
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.xlsx_convertor.engine import (
    MEDIA_TYPES,
    convert_xlsx,
    convert_xlsx_csv,
)

router = APIRouter(prefix="/xlsx", tags=["XLSX Conversions"])
_pool  = ThreadPoolExecutor(max_workers=4)

_TARGETS = list(MEDIA_TYPES.keys())   # ["pdf", "csv", "html", "ods", "txt", "json"]
_EXT_MAP = {
    "pdf":  ".pdf",
    "csv":  ".csv",
    "html": ".html",
    "ods":  ".ods",
    "json": ".json",
    "txt":  ".txt",
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
        result = convert_xlsx(data, target, job_id)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


def _run_csv_job(
    job_id: str,
    data: bytes,
    stem: str,
) -> None:
    """
    CSV-specific job runner.  Uses convert_xlsx_csv() which returns the
    correct filename and media-type (plain CSV or ZIP for multi-sheet files).
    """
    try:
        content, media_type, filename = convert_xlsx_csv(data, stem, job_id)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, content, filename, media_type)
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# POST /api/xlsx/{target}/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/pdf/convert",
    summary="Convert an XLSX file to PDF",
)
async def xlsx_to_pdf(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "pdf", output_filename)


@router.post(
    "/csv/convert",
    summary="Convert an XLSX file to CSV (ZIP if multiple sheets)",
)
async def xlsx_to_csv(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue_csv(file, output_filename)


@router.post(
    "/html/convert",
    summary="Convert an XLSX file to HTML",
)
async def xlsx_to_html(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "html", output_filename)


@router.post(
    "/ods/convert",
    summary="Convert an XLSX file to ODS",
)
async def xlsx_to_ods(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "ods", output_filename)


@router.post(
    "/json/convert",
    summary="Convert an XLSX file to JSON (all sheets, array of objects per sheet)",
)
async def xlsx_to_json(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "json", output_filename)


@router.post(
    "/txt/convert",
    summary="Convert an XLSX file to TXT",
)
async def xlsx_to_txt(
    file:            UploadFile     = File(...),
    output_filename: Optional[str] = Form(None),
):
    return await _enqueue(file, "txt", output_filename)


# ---------------------------------------------------------------------------
# Shared enqueue helpers
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


async def _enqueue_csv(
    file:            UploadFile,
    output_filename: Optional[str],
) -> JSONResponse:
    """
    CSV enqueue — passes the stem to _run_csv_job so the engine can build
    the correct output filename (single CSV or ZIP) at conversion time.
    """
    raw  = await _read(file)
    stem = (output_filename or "").strip() or (file.filename or "document").rsplit(".", 1)[0]
    # Strip any trailing .csv the user may have typed
    if stem.lower().endswith(".csv"):
        stem = stem[:-4]

    job = job_store.create_job()
    _pool.submit(_run_csv_job, job.id, raw, stem)

    return JSONResponse({"job_id": job.id}, status_code=202)
