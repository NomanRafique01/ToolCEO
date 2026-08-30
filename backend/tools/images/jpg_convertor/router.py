"""
JPG Convertor router — ToolCEO
=====================================

Endpoints (all under /api/jpg/...)
----------------------------------------
POST /api/jpg/to-png/convert
POST /api/jpg/to-webp/convert
POST /api/jpg/to-pdf/convert
POST /api/jpg/to-bmp/convert
POST /api/jpg/to-tiff/convert
POST /api/jpg/to-ico/convert
POST /api/jpg/to-gif/convert
POST /api/jpg/to-txt/convert

Every endpoint accepts ONE OR MANY JPG/JPEG files:
  - 1 file  → returns the converted file directly
  - 2+ files → converts all and returns a .zip archive

Form fields (all endpoints)
----------------------------
files            : List[UploadFile]  – one or more JPG/JPEG images
output_filename  : str | None        – desired output base name (optional)
"""

from __future__ import annotations

import io
import zipfile
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.images.jpg_convertor.engine import (
    MEDIA_TYPES,
    convert_jpg,
    merge_jpgs_to_pdf,
)

router = APIRouter(prefix="/jpg", tags=["JPG Conversions"])
_pool  = ThreadPoolExecutor(max_workers=4)

# Extension for each target format
_EXT_MAP = {
    "png":  ".png",
    "webp": ".webp",
    "pdf":  ".pdf",
    "bmp":  ".bmp",
    "tiff": ".tiff",
    "ico":  ".ico",
    "gif":  ".gif",
    "txt":  ".txt",
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _enqueue_multi(
    files:           List[UploadFile],
    target:          str,
    output_filename: Optional[str],
    pdf_mode:        Optional[str] = None,
) -> JSONResponse:
    """Read all files, enqueue a batch conversion job, return job_id."""
    items: list[tuple[bytes, str]] = []
    for f in files:
        raw  = await f.read()
        stem = (f.filename or "image").rsplit(".", 1)[0]
        items.append((raw, stem))

    out_base = (output_filename or "").strip() or (items[0][1] if items else "converted")
    ext      = _EXT_MAP[target]

    job = job_store.create_job()
    _pool.submit(_run_batch_job, job.id, items, target, out_base, ext, pdf_mode)
    return JSONResponse({"job_id": job.id}, status_code=202)


def _run_batch_job(
    job_id:   str,
    items:    list[tuple[bytes, str]],   # [(raw_bytes, stem), ...]
    target:   str,
    out_base: str,
    ext:      str,
    pdf_mode: Optional[str] = None,
) -> None:
    try:
        job_store.set_progress(job_id, 5)
        n = len(items)

        if n == 1:
            # Single file — return directly (no zip overhead)
            raw, stem = items[0]
            result   = convert_jpg(raw, target, job_id)
            filename = out_base + ext
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
            return

        # Multiple files + jpg-pdf + single mode → merge into one PDF
        if target == "pdf" and pdf_mode == "single":
            merged = merge_jpgs_to_pdf(items, job_id)
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, merged, out_base + ".pdf", "application/pdf")
            return

        # Multiple files — convert each then pack into a zip
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (raw, stem) in enumerate(items):
                pct = 5 + int((i / n) * 85)
                job_store.set_progress(job_id, pct)
                converted = convert_jpg(raw, target, None)   # no per-file SSE noise
                zf.writestr(f"{stem}{ext}", converted)

        job_store.set_progress(job_id, 95)
        zip_bytes = buf.getvalue()
        zip_name  = out_base + ".zip"
        job_store.set_done(job_id, zip_bytes, zip_name, "application/zip")

    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# Per-target endpoints  (each accepts 1..N files)
# ---------------------------------------------------------------------------

@router.post("/to-png/convert", summary="Convert JPG(s) to PNG")
async def jpg_to_png(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "png", output_filename)


@router.post("/to-webp/convert", summary="Convert JPG(s) to WEBP")
async def jpg_to_webp(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "webp", output_filename)


@router.post("/to-pdf/convert", summary="Convert JPG(s) to PDF")
async def jpg_to_pdf(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
    pdf_mode:        Optional[str]   = Form(None),   # "single" | "individual"
):
    return await _enqueue_multi(files, "pdf", output_filename, pdf_mode)


@router.post("/to-bmp/convert", summary="Convert JPG(s) to BMP")
async def jpg_to_bmp(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "bmp", output_filename)


@router.post("/to-tiff/convert", summary="Convert JPG(s) to TIFF")
async def jpg_to_tiff(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "tiff", output_filename)


@router.post("/to-ico/convert", summary="Convert JPG(s) to ICO")
async def jpg_to_ico(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "ico", output_filename)


@router.post("/to-gif/convert", summary="Convert JPG(s) to GIF")
async def jpg_to_gif(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "gif", output_filename)


@router.post("/to-txt/convert", summary="Extract text from JPG(s) via OCR")
async def jpg_to_txt(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "txt", output_filename)
