"""
WEBP Convertor router — ToolCEO
=====================================

Endpoints (all under /api/webp/...)
----------------------------------------
POST /api/webp/to-jpg/convert
POST /api/webp/to-png/convert
POST /api/webp/to-pdf/convert
POST /api/webp/to-bmp/convert
POST /api/webp/to-tiff/convert
POST /api/webp/to-ico/convert
POST /api/webp/to-txt/convert

Every endpoint accepts ONE OR MANY WEBP files:
  - 1 file  → returns the converted file directly
  - 2+ files → converts all and returns a .zip archive

Form fields (all endpoints)
----------------------------
files            : List[UploadFile]  – one or more WEBP images
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
from tools.images.webp_convertor.engine import (
    MEDIA_TYPES,
    convert_webp,
    merge_webps_to_pdf,
)

router = APIRouter(prefix="/webp", tags=["WEBP Conversions"])
_pool  = ThreadPoolExecutor(max_workers=4)

# Extension for each target format
_EXT_MAP = {
    "jpg":  ".jpg",
    "png":  ".png",
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
            result   = convert_webp(raw, target, job_id)
            filename = out_base + ext
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
            return

        # Multiple files + webp-pdf + single mode → merge into one PDF
        if target == "pdf" and pdf_mode == "single":
            merged = merge_webps_to_pdf(items, job_id)
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, merged, out_base + ".pdf", "application/pdf")
            return

        # Multiple files — convert each then pack into a zip
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (raw, stem) in enumerate(items):
                pct = 5 + int((i / n) * 85)
                job_store.set_progress(job_id, pct)
                converted = convert_webp(raw, target, None)
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

@router.post("/to-jpg/convert", summary="Convert WEBP(s) to JPG")
async def webp_to_jpg(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "jpg", output_filename)


@router.post("/to-png/convert", summary="Convert WEBP(s) to PNG")
async def webp_to_png(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "png", output_filename)


@router.post("/to-pdf/convert", summary="Convert WEBP(s) to PDF")
async def webp_to_pdf(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
    pdf_mode:        Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "pdf", output_filename, pdf_mode)


@router.post("/to-bmp/convert", summary="Convert WEBP(s) to BMP")
async def webp_to_bmp(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "bmp", output_filename)


@router.post("/to-tiff/convert", summary="Convert WEBP(s) to TIFF")
async def webp_to_tiff(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "tiff", output_filename)


@router.post("/to-ico/convert", summary="Convert WEBP(s) to ICO")
async def webp_to_ico(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "ico", output_filename)


@router.post("/to-txt/convert", summary="Extract text from WEBP(s) via OCR")
async def webp_to_txt(
    files:           List[UploadFile] = File(...),
    output_filename: Optional[str]   = Form(None),
):
    return await _enqueue_multi(files, "txt", output_filename)
