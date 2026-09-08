"""
PDF image extractor router.

Endpoints
---------
POST /api/pdf/extractor/info
    Synchronous preview helper. Accepts one PDF and returns page count plus a
    first-page thumbnail.

POST /api/pdf/extractor/extract
    Async job. Extracts embedded images from all or selected pages and returns
    a ZIP through the shared progress/download endpoints.
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.pdf_tools.extractor.engine import (
    extract_images_zip,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/extractor", tags=["PDF Image Extractor"])
_pool = job_executor


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


def _base_name(filename: Optional[str]) -> str:
    stem = (filename or "document").rsplit(".", 1)[0].strip() or "document"
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in stem)
    return safe.strip("_") or "document"


def _parse_selected_pages(selected_pages: Optional[str]) -> Optional[list[int]]:
    if not selected_pages:
        return None

    try:
        parsed = json.loads(selected_pages)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="selected_pages must be a JSON array.") from exc

    if not isinstance(parsed, list):
        raise HTTPException(status_code=422, detail="selected_pages must be a JSON array.")

    pages: list[int] = []
    for value in parsed:
        try:
            pages.append(int(value))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="selected_pages must contain page numbers.") from exc

    return pages


def _run_extract_job(
    job_id: str,
    raw: bytes,
    pages: Optional[list[int]],
    password: Optional[str],
    source_filename: str,
    output_filename: str,
) -> None:
    try:
        job_store.set_progress(job_id, 10)

        def progress(pct: int) -> None:
            job_store.set_progress(job_id, pct)

        result = extract_images_zip(
            raw,
            pages=pages,
            password=password,
            source_filename=source_filename,
            progress=progress,
        )
        job_store.set_done(job_id, result, output_filename, "application/zip")
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Unexpected error: {exc}")


@router.post(
    "/info",
    summary="Return page count + first-page thumbnail for a PDF",
)
async def pdf_extractor_info(
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
    "/extract",
    summary="Extract embedded PDF images as PNG files in a ZIP",
)
async def extract(
    file: UploadFile = File(...),
    selected_pages: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    output_filename: Optional[str] = Form(None),
):
    _validate_pdf_upload(file)
    pages = _parse_selected_pages(selected_pages)
    raw = await _read(file)

    out_name = (output_filename or f"{_base_name(file.filename)}_images").strip()
    if not out_name.lower().endswith(".zip"):
        out_name += ".zip"

    job = job_store.create_job()
    _pool.submit(
        _run_extract_job,
        job.id,
        raw,
        pages,
        password or None,
        file.filename or "document.pdf",
        out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
