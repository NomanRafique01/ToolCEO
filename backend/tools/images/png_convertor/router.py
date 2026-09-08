"""
PNG Convertor router — ToolCEO
=====================================

Endpoints (all under /api/png/...)
----------------------------------------
POST /api/png/to-jpg/convert
POST /api/png/to-webp/convert
POST /api/png/to-pdf/convert
POST /api/png/to-bmp/convert
POST /api/png/to-tiff/convert
POST /api/png/to-ico/convert
POST /api/png/to-txt/convert

Every endpoint accepts ONE OR MANY PNG files:
  - 1 file  → returns the converted file directly
  - 2+ files → converts all and returns a .zip archive

Form fields (all endpoints)
----------------------------
files            : List[UploadFile]  – one or more PNG images
output_filename  : str | None        – desired output base name (optional)
"""

from __future__ import annotations

import io
import zipfile
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.images.png_convertor.engine import (
    MEDIA_TYPES,
    convert_png,
    merge_pngs_to_pdf,
)

router = APIRouter(prefix="/png", tags=["PNG Conversions"])
_pool  = job_executor

# Extension for each target format
_EXT_MAP = {
    "jpg":  ".jpg",
    "webp": ".webp",
    "pdf":  ".pdf",
    "bmp":  ".bmp",
    "tiff": ".tiff",
    "ico":  ".ico",
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
    items:    list[tuple[bytes, str]],
    target:   str,
    out_base: str,
    ext:      str,
    pdf_mode: Optional[str] = None,
) -> None:
    try:
        job_store.set_progress(job_id, 5)
        n = len(items)

        if n == 1:
            raw, stem = items[0]
            result   = convert_png(raw, target, job_id)
            filename = out_base + ext
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
            return

        # Multiple files + png-pdf + single mode → merge into one PDF
        if target == "pdf" and pdf_mode == "single":
            merged = merge_pngs_to_pdf(items, job_id)
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, merged, out_base + ".pdf", "application/pdf")
            return

        # Multiple files — convert each then pack into a zip
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (raw, stem) in enumerate(items):
                pct = 5 + int((i / n) * 85)
                job_store.set_progress(job_id, pct)
                converted = convert_png(raw, target, None)
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

@router.post("/to-jpg/convert", summary="Convert PNG(s) to JPG")
async def png_to_jpg(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "jpg", output_filename)


@router.post("/to-webp/convert", summary="Convert PNG(s) to WEBP")
async def png_to_webp(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "webp", output_filename)


@router.post("/to-pdf/convert", summary="Convert PNG(s) to PDF")
async def png_to_pdf(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
    pdf_mode:        Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "pdf", output_filename, pdf_mode)


@router.post("/to-bmp/convert", summary="Convert PNG(s) to BMP")
async def png_to_bmp(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "bmp", output_filename)


@router.post("/to-tiff/convert", summary="Convert PNG(s) to TIFF")
async def png_to_tiff(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "tiff", output_filename)


@router.post("/to-ico/convert", summary="Convert PNG(s) to ICO")
async def png_to_ico(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "ico", output_filename)


@router.post("/to-txt/convert", summary="Extract text from PNG(s) via OCR")
async def png_to_txt(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "txt", output_filename)
