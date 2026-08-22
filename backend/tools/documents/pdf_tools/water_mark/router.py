"""
PDF Watermark Router — ToolCEO
==============================

Endpoints
---------
POST /api/pdf/watermark/info
    Synchronous helper. Accepts one PDF (+ optional password) and returns page count,
    file size, and a high-definition (2x DPI) 1st page thumbnail image.

POST /api/pdf/watermark/process
    Async job. Accepts PDF upload + watermark settings (text, font_family, font_size,
    color, opacity, angle, spacing, x_pct, y_pct, output_filename) and enqueues the job.
    Returns { "job_id": ... } with 202 Accepted status.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.pdf_tools.water_mark.engine import (
    WatermarkOptions,
    apply_watermark,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/watermark", tags=["PDF Watermark"])
_pool = ThreadPoolExecutor(max_workers=4)


async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _validate_pdf_upload(file: UploadFile) -> None:
    name = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    if not (name.endswith(".pdf") or content_type == "application/pdf"):
        raise HTTPException(
            status_code=422,
            detail="Invalid File Format. Please select a valid PDF file.",
        )


def _run_job(
    job_id: str,
    fn,
    *args,
    filename: str,
    media_type: str = "application/pdf",
) -> None:
    """Execute fn(*args) in a thread worker, updating job status/progress."""
    try:
        job_store.set_progress(job_id, 10)
        result = fn(*args)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, media_type)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Unexpected watermark error: {exc}")


def _submit(
    job_id: str,
    fn,
    *args,
    filename: str,
    media_type: str = "application/pdf",
) -> None:
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


@router.post(
    "/info",
    summary="Return page count, file size, and 1st-page HD thumbnail for a PDF",
)
async def pdf_watermark_info(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
):
    _validate_pdf_upload(file)
    raw = await _read(file)
    try:
        info = get_pdf_info(raw, password or None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")
    return JSONResponse(info)


@router.post(
    "/process",
    summary="Apply customizable watermark to all pages of a PDF",
)
async def pdf_watermark_process(
    file: UploadFile = File(...),
    mode: str = Form("text"),
    text: str = Form(""),
    font_family: str = Form("helv"),
    font_size: float = Form(48.0),
    color: str = Form("#FF0000"),
    opacity: float = Form(0.5),
    angle: float = Form(-45.0),
    spacing: float = Form(0.0),
    x_pct: float = Form(50.0),
    y_pct: float = Form(50.0),
    signature_data_url: str = Form(""),
    sign_width_pct: float = Form(34.0),
    password: Optional[str] = Form(None),
    output_filename: Optional[str] = Form(None),
):
    _validate_pdf_upload(file)
    raw = await _read(file)

    opts = WatermarkOptions(
        mode=mode,
        text=text,
        font_family=font_family,
        font_size=font_size,
        color=color,
        opacity=opacity,
        angle=angle,
        spacing=spacing,
        x_pct=x_pct,
        y_pct=y_pct,
        signature_data_url=signature_data_url,
        sign_width_pct=sign_width_pct,
    )

    out_name = (output_filename or "watermarked").strip()
    if not out_name.lower().endswith(".pdf"):
        out_name += ".pdf"

    job = job_store.create_job()
    _submit(
        job.id,
        apply_watermark,
        raw,
        opts,
        password or None,
        job.id,
        filename=out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
