"""
PDF Compressor router.

Endpoints
---------
POST /api/pdf/compressor/info
    Synchronous.  Accepts a single PDF (+ optional password) and returns its
    page count, file size in bytes, and a base64 JPEG thumbnail of the first
    page.  Used by the frontend to populate the preview card.

    Form fields
    -----------
    file      : UploadFile  – the PDF
    password  : str | None  – unlock password for encrypted PDFs

    Response  : {
        "page_count": int,
        "file_size":  int,
        "thumbnail":  "data:image/jpeg;base64,..."
    }

POST /api/pdf/compressor/compress
    Async job.  Accepts a single PDF plus all compression options and enqueues
    the work.  Returns a job ID immediately (202 Accepted); the frontend polls
    /api/progress/{job_id} via SSE, then downloads from /api/download/{job_id}.

    Form fields
    -----------
    file             : UploadFile  – the PDF to compress
    password         : str | None  – unlock password

    # Image settings
    image_quality    : int  (1–100, default 75)
    dpi              : int  (72 | 150 | 300, default 150)
    grayscale        : bool (default false)

    # Content removal
    remove_metadata    : bool (default false)
    remove_annotations : bool (default false)
    remove_bookmarks   : bool (default false)
    remove_thumbnails  : bool (default false)

    # Font
    subset_fonts     : bool (default false)

    # Preset  — if not "custom" it overrides image_quality / dpi / grayscale
    preset           : str  ("screen" | "ebook" | "printer" | "custom",
                              default "custom")

    # Output
    flatten_forms    : bool      (default false)
    max_file_size    : int | None  – target max bytes (default None = no limit)
    output_filename  : str | None  – desired filename  (default "compressed.pdf")

    Response  : { "job_id": "..." }  – 202 Accepted

Job lifecycle (standard pattern, shared with Merger and Splitter)
-----------------------------------------------------------------
  pending → running (progress 10–90) → done | error
  Frontend subscribes via SSE at /api/progress/{job_id},
  then downloads the result from /api/download/{job_id}.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.documents.pdf_tools.compressor.engine import (
    CompressOptions,
    compress_pdf,
    get_pdf_info,
)

router = APIRouter(prefix="/pdf/compressor", tags=["PDF Compressor"])
_pool  = ThreadPoolExecutor(max_workers=4)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _run_job(
    job_id: str,
    fn,
    *args,
    filename: str,
    media_type: str = "application/pdf",
) -> None:
    """Execute *fn(*args)* in a thread-pool worker, updating job progress."""
    try:
        job_store.set_progress(job_id, 10)
        result = fn(*args)
        job_store.set_progress(job_id, 90)
        job_store.set_done(job_id, result, filename, media_type)
    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Unexpected error: {exc}")


def _submit(
    job_id: str,
    fn,
    *args,
    filename: str,
    media_type: str = "application/pdf",
) -> None:
    _pool.submit(_run_job, job_id, fn, *args, filename=filename, media_type=media_type)


# ---------------------------------------------------------------------------
# POST /api/pdf/compressor/info  –  synchronous preview helper
# ---------------------------------------------------------------------------

@router.post(
    "/info",
    summary="Return page count, file size and first-page thumbnail for a PDF",
)
async def pdf_compressor_info(
    file:     UploadFile       = File(...),
    password: Optional[str]   = Form(None),
):
    """
    Quick scan of a single PDF.  Called once when the user selects a file so
    the frontend can show the preview card (thumbnail + page count + file size).
    """
    raw = await _read(file)
    try:
        info = get_pdf_info(raw, password or None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")
    return JSONResponse(info)


# ---------------------------------------------------------------------------
# POST /api/pdf/compressor/compress  –  async compression job
# ---------------------------------------------------------------------------

@router.post(
    "/compress",
    summary="Compress a PDF with fine-grained options (async job)",
)
async def compress(
    file:    UploadFile       = File(...),
    password: Optional[str]  = Form(None),

    # ── Image settings ──────────────────────────────────────────────────────
    image_quality:    int           = Form(75),
    dpi:              int           = Form(150),
    grayscale:        bool          = Form(False),

    # ── Content removal ─────────────────────────────────────────────────────
    remove_metadata:    bool = Form(False),
    remove_annotations: bool = Form(False),
    remove_bookmarks:   bool = Form(False),
    remove_thumbnails:  bool = Form(False),

    # ── Font ────────────────────────────────────────────────────────────────
    subset_fonts: bool = Form(False),

    # ── Preset ──────────────────────────────────────────────────────────────
    preset: str = Form("custom"),

    # ── Output ──────────────────────────────────────────────────────────────
    flatten_forms:   bool          = Form(False),
    max_file_size:   Optional[int] = Form(None),
    output_filename: Optional[str] = Form(None),
):
    """
    Enqueue a compression job for the uploaded PDF.

    All image / content / font options are optional; defaults produce a
    balanced compression suitable for most documents.  When *preset* is one of
    screen | ebook | printer the image_quality / dpi / grayscale values sent
    by the client are ignored and replaced by the preset's own values.
    """
    # ── Validate image_quality ────────────────────────────────────────────
    if not (1 <= image_quality <= 100):
        raise HTTPException(
            status_code=422,
            detail="image_quality must be between 1 and 100.",
        )

    # ── Validate DPI ─────────────────────────────────────────────────────
    if dpi not in (72, 150, 300):
        raise HTTPException(
            status_code=422,
            detail="dpi must be 72, 150, or 300.",
        )

    # ── Validate preset ───────────────────────────────────────────────────
    allowed_presets = {"screen", "ebook", "printer", "custom"}
    if preset not in allowed_presets:
        raise HTTPException(
            status_code=422,
            detail=f"preset must be one of: {', '.join(sorted(allowed_presets))}.",
        )

    # ── Build options object ──────────────────────────────────────────────
    opts = CompressOptions(
        image_quality=image_quality,
        dpi=dpi,
        grayscale=grayscale,
        remove_metadata=remove_metadata,
        remove_annotations=remove_annotations,
        remove_bookmarks=remove_bookmarks,
        remove_thumbnails=remove_thumbnails,
        subset_fonts=subset_fonts,
        preset=preset,
        flatten_forms=flatten_forms,
        max_file_size=max_file_size if max_file_size and max_file_size > 0 else None,
    )

    # ── Read file into memory ─────────────────────────────────────────────
    raw = await _read(file)

    # ── Determine output filename ─────────────────────────────────────────
    out_name = (output_filename or "compressed").strip()
    if not out_name.lower().endswith(".pdf"):
        out_name += ".pdf"

    # ── Create job and submit to thread pool ──────────────────────────────
    job = job_store.create_job()
    _submit(
        job.id,
        compress_pdf,
        raw,
        opts,
        password or None,
        filename=out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
