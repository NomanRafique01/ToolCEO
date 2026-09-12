"""Archive creation API backed by the local 7-Zip Media Module."""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.archives.engine import ArchiveCancelled, create_archive, extract_archive, inspect_archive

router = APIRouter(prefix="/archives", tags=["Archives"])


def _run_job(job_id: str, items, archive_format: str, output_name: str) -> None:
    try:
        job_store.set_progress(job_id, 5)
        job = job_store.get_job(job_id)
        result, filename, media_type = create_archive(
            items,
            archive_format,
            output_name,
            lambda pct: job_store.set_progress(job_id, pct),
            job.cancel_event if job else None,
        )
        if job_store.is_cancelled(job_id):
            return
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, media_type)
    except ArchiveCancelled:
        job_store.set_cancelled(job_id)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Archive creation failed: {exc}")


def _run_extract_job(
    job_id: str,
    archive_bytes: bytes,
    original_filename: str,
    output_name: str | None,
    password: str | None,
    destination_dir: str | None = None,
) -> None:
    try:
        job_store.set_progress(job_id, 5)
        job = job_store.get_job(job_id)
        if job and destination_dir:
            job.destination_dir = destination_dir
        result, filename, media_type = extract_archive(
            archive_bytes,
            original_filename,
            output_name,
            password,
            lambda pct: job_store.set_progress(job_id, pct),
            job.cancel_event if job else None,
            destination_dir=destination_dir,
        )
        if job_store.is_cancelled(job_id):
            return
        job_store.set_progress(job_id, 98)
        job_store.set_progress(job_id, 100)
        job_store.set_done(job_id, result, filename, media_type)
        if job and destination_dir:
            job.destination_dir = destination_dir
    except ArchiveCancelled:
        job_store.set_cancelled(job_id)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Archive extraction failed: {exc}")


@router.post("/create", summary="Create a local archive")
async def create(
    files: List[UploadFile] = File(...),
    archive_format: str = Form(...),
    output_filename: Optional[str] = Form(None),
    relative_paths: Optional[str] = Form(None),
):
    try:
        paths = json.loads(relative_paths) if relative_paths else []
        if not isinstance(paths, list):
            paths = []
    except (TypeError, json.JSONDecodeError):
        paths = []

    items: list[tuple[bytes, str]] = []
    for index, upload in enumerate(files):
        name = paths[index] if index < len(paths) and isinstance(paths[index], str) else (upload.filename or f"file-{index + 1}")
        items.append((await upload.read(), name))

    job = job_store.create_job()
    filename = output_filename or f"archive.{archive_format}"
    job_executor.submit(_run_job, job.id, items, archive_format, filename)
    return JSONResponse({"job_id": job.id}, status_code=202)


@router.post("/extract/info", summary="Inspect archive metadata and contents")
async def extract_info(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
):
    try:
        content = await file.read()
        info = inspect_archive(content, file.filename or "archive.bin", password=password)
        return JSONResponse(info)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:
        return JSONResponse({"error": f"Failed to inspect archive: {exc}"}, status_code=500)


@router.post("/extract", summary="Extract a local archive")
async def extract(
    file: UploadFile = File(...),
    output_filename: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    destination_dir: Optional[str] = Form(None),
):
    content = await file.read()
    job = job_store.create_job()
    if destination_dir:
        job.destination_dir = destination_dir
    job_executor.submit(
        _run_extract_job,
        job.id,
        content,
        file.filename or "archive.bin",
        output_filename,
        password,
        destination_dir,
    )
    return JSONResponse({"job_id": job.id}, status_code=202)
        
@router.post("/cancel/{job_id}", summary="Cancel an archive job")
def cancel(job_id: str):
    if not job_store.cancel_job(job_id):
        return JSONResponse({"detail": "Job is not running."}, status_code=409)
    return JSONResponse({"ok": True})
