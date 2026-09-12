"""Archive creation API backed by the local 7-Zip Media Module."""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.archives.engine import ArchiveCancelled, create_archive, extract_archive, inspect_archive, convert_archive, split_archive, merge_archive, CONVERT_PAIRS, _CONVERT_SUFFIX, SUPPORTED_FORMATS

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


@router.post("/inspect", summary="Full archive inspection — contents, sizes, methods")
async def inspect(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
):
    """Read-only deep inspection endpoint used by the Archive Inspector tool.
    Returns file tree, per-entry compressed/uncompressed size, method, and totals.
    """
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


# ── ARCHIVE CONVERSION ROUTES ─────────────────────────────────────────────────

def _run_convert_job(
    job_id: str,
    archive_bytes: bytes,
    source_filename: str,
    target_format: str,
    output_name: str,
) -> None:
    try:
        job_store.set_progress(job_id, 5)
        job = job_store.get_job(job_id)
        result, filename, media_type = convert_archive(
            archive_bytes,
            source_filename,
            target_format,
            output_name,
            lambda pct: job_store.set_progress(job_id, pct),
            job.cancel_event if job else None,
        )
        if job_store.is_cancelled(job_id):
            return
        job_store.set_done(job_id, result, filename, media_type)
    except ArchiveCancelled:
        job_store.set_cancelled(job_id)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Archive conversion failed: {exc}")


def _make_convert_route(source_ext: str, target_fmt: str):
    """Factory: return an async endpoint for source_ext to target_fmt."""
    async def _endpoint(
        file: UploadFile = File(...),
        output_filename: Optional[str] = Form(None),
    ):
        content = await file.read()
        stem = (file.filename or f"archive.{source_ext}").rsplit(".", 1)[0]
        suffix = _CONVERT_SUFFIX.get(target_fmt, f".{target_fmt}")
        out_name = (output_filename or "").strip() or stem
        if not out_name.lower().endswith(suffix):
            out_name += suffix
        job = job_store.create_job()
        job_executor.submit(
            _run_convert_job,
            job.id,
            content,
            file.filename or f"archive.{source_ext}",
            target_fmt,
            out_name,
        )
        return JSONResponse({"job_id": job.id}, status_code=202)
    return _endpoint


# Register all conversion routes programmatically
for (_src, _tgt), _ in CONVERT_PAIRS.items():
    _tgt_path = _tgt.replace(".", "-")   # "tar.gz" -> "tar-gz" in URL
    _endpoint_fn = _make_convert_route(_src, _tgt)
    _endpoint_fn.__name__ = f"convert_{_src.replace('.','_')}_to_{_tgt_path.replace('-','_')}"
    router.add_api_route(
        f"/convert/{_src}-to-{_tgt_path}",
        _endpoint_fn,
        methods=["POST"],
        summary=f"Convert {_src.upper()} to {_tgt.upper()}",
    )


# ── ARCHIVE SPLITTER ──────────────────────────────────────────────────────────

def _run_split_job(
    job_id: str,
    archive_bytes: bytes,
    original_filename: str,
    part_size_mb: int,
    output_stem: str,
) -> None:
    try:
        job_store.set_progress(job_id, 5)
        result, filename, media_type = split_archive(
            archive_bytes,
            original_filename,
            part_size_mb,
            output_stem,
            lambda pct: job_store.set_progress(job_id, pct),
        )
        job_store.set_done(job_id, result, filename, media_type)
    except ArchiveCancelled:
        job_store.set_cancelled(job_id)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Split failed: {exc}")


@router.post("/split", summary="Split an archive into equal-sized parts")
async def split(
    file: UploadFile = File(...),
    part_size_mb: int = Form(10),
    output_filename: Optional[str] = Form(None),
):
    """Split the uploaded archive into volume parts of *part_size_mb* MB each.
    Returns a ZIP containing all parts so the frontend receives a single download.
    """
    content = await file.read()
    stem = (output_filename or file.filename or "archive").rsplit(".", 1)[0]
    job = job_store.create_job()
    job_executor.submit(_run_split_job, job.id, content, file.filename or "archive", part_size_mb, stem)
    return JSONResponse({"job_id": job.id}, status_code=202)


# ── ARCHIVE MERGER ────────────────────────────────────────────────────────────

def _run_merge_job(
    job_id: str,
    part_items: list[tuple[bytes, str]],
    output_stem: str,
    output_format: str,
) -> None:
    try:
        job_store.set_progress(job_id, 5)
        result, filename, media_type = merge_archive(
            part_items,
            output_stem,
            output_format,
            lambda pct: job_store.set_progress(job_id, pct),
        )
        job_store.set_done(job_id, result, filename, media_type)
    except ArchiveCancelled:
        job_store.set_cancelled(job_id)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Merge failed: {exc}")


@router.post("/merge", summary="Merge multi-part archive files into one archive")
async def merge(
    files: List[UploadFile] = File(...),
    output_filename: Optional[str] = Form(None),
    output_format: Optional[str] = Form("zip"),
):
    """Accept all parts of a split archive and reassemble them into a single archive."""
    if not files:
        return JSONResponse({"error": "No files provided."}, status_code=400)

    valid_formats = set(SUPPORTED_FORMATS.keys())
    fmt = (output_format or "zip").lower()
    if fmt not in valid_formats:
        fmt = "zip"

    part_items: list[tuple[bytes, str]] = []
    for upload in files:
        raw = await upload.read()
        part_items.append((raw, upload.filename or "part"))

    stem_src = (output_filename or files[0].filename or "merged_archive")
    # Strip any numeric part suffix (.001, .002) and known archive extensions
    stem = stem_src
    for sfx in (".tar.gz", ".tar.bz2", ".tar.xz", ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"):
        if stem.lower().endswith(sfx):
            stem = stem[: -len(sfx)]
            break
    import re as _re
    stem = _re.sub(r"\.\d{3}$", "", stem)
    stem = stem or "merged_archive"

    job = job_store.create_job()
    job_executor.submit(_run_merge_job, job.id, part_items, stem, fmt)
    return JSONResponse({"job_id": job.id}, status_code=202)
