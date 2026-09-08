"""
Image Compressor router — ToolCEO
=====================================

Endpoint
--------
POST /api/images/compress/convert

Accepts one or many image files (any Pillow-supported raster format)
plus a compression level preset.  Returns:
  { "job_id": "<uuid>" }  (202 Accepted)

Form fields
-----------
files             : List[UploadFile]  – one or more images
compression_level : str               – maximum | high | medium | low (default: maximum)

Output
------
  1 file  → compressed image (same format when useful; BMP/ICO/HEIC fall back)
  2+ files → all compressed images in a .zip archive
"""

from __future__ import annotations

import io
import zipfile
from typing import List

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.images.image_compressor.engine import (
    VALID_LEVELS,
    compress_image,
)

router = APIRouter(prefix="/images/compress", tags=["Image Compressor"])
_pool  = job_executor

_EXT_MAP = {
    "jpg":  ".jpg",
    "jpeg": ".jpg",
    "png":  ".png",
    "webp": ".webp",
    "gif":  ".gif",
    "bmp":  ".bmp",
    "tiff": ".tiff",
    "ico":  ".ico",
    "avif": ".avif",
    "heic": ".heic",
    "heif": ".heic",
    "svg":  ".svg",
}


def _output_name(stem: str, out_fmt: str) -> str:
    ext = _EXT_MAP.get(out_fmt, f".{out_fmt}")
    base = stem.rsplit(".", 1)[0] if "." in stem else stem
    name = f"{base}_compressed"
    if not name.lower().endswith(ext):
        name += ext
    return name


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _enqueue(
    files:             List[UploadFile],
    compression_level: str,
    max_dimension:     Optional[int] = None,
) -> JSONResponse:
    if compression_level not in VALID_LEVELS:
        return JSONResponse(
            {"detail": f"Invalid compression_level '{compression_level}'"},
            status_code=422,
        )

    items: list[tuple[bytes, str]] = []
    for f in files:
        raw  = await f.read()
        stem = (f.filename or "image").rsplit(".", 1)[0]
        items.append((raw, stem))

    if not items:
        return JSONResponse({"detail": "No files provided"}, status_code=422)

    job = job_store.create_job()
    _pool.submit(_run_batch_job, job.id, items, compression_level, max_dimension)
    return JSONResponse({"job_id": job.id}, status_code=202)


def _run_batch_job(
    job_id:            str,
    items:             list[tuple[bytes, str]],
    compression_level: str,
    max_dimension:     Optional[int] = None,
) -> None:
    try:
        job_store.set_progress(job_id, 5)
        n = len(items)

        if n == 1:
            raw, stem = items[0]
            result, out_fmt, media_type = compress_image(raw, compression_level, job_id, max_dimension)
            filename = _output_name(stem, out_fmt)
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, result, filename, media_type)
            return

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (raw, stem) in enumerate(items):
                pct = 5 + int((i / n) * 85)
                job_store.set_progress(job_id, pct)
                result, out_fmt, _ = compress_image(raw, compression_level, None, max_dimension)
                zf.writestr(_output_name(stem, out_fmt), result)

        job_store.set_progress(job_id, 95)
        zip_name = "compressed_images.zip"
        job_store.set_done(job_id, buf.getvalue(), zip_name, "application/zip")

    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Compression error: {exc}")


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/convert", summary="Compress one or more images")
async def compress_images(
    files:             List[UploadFile] = File(...),
    compression_level: str              = Form("maximum"),
    max_dimension:     Optional[int]    = Form(None),
):
    return await _enqueue(files, compression_level, max_dimension)
