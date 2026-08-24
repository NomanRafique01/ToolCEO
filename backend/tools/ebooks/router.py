"""
eBook conversion router — ToolCEO
===================================

Endpoint
--------
POST /api/ebooks/convert
    Convert an eBook file from one format to another using Calibre.

    Form fields
    -----------
    file             : UploadFile  – the source eBook file
    target_format    : str         – desired output format
                                     (epub | mobi | pdf | azw3 | fb2 | txt | rtf)
    output_filename  : str | None  – desired filename (default: "<stem>.<target>")

    Response
    --------
    202 Accepted  →  { "job_id": "<uuid>" }

    The frontend polls /api/progress/{job_id} via SSE, then downloads from
    /api/download/{job_id} once the job reaches state "done".

All Calibre logic is delegated to :mod:`utils.calibre_engine`.
This file contains zero Calibre-specific implementation.
"""

from __future__ import annotations

import logging
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from tools.ebooks.utils.calibre_engine import (
    cleanup_temp_files,
    run_conversion,
    stream_progress,
    validate_formats,
)

router = APIRouter(prefix="/ebooks", tags=["eBooks"])
_pool  = ThreadPoolExecutor(max_workers=4)
_log   = logging.getLogger(__name__)

# MIME types for each supported output format
_MIME: dict[str, str] = {
    "epub": "application/epub+zip",
    "mobi": "application/x-mobipocket-ebook",
    "azw3": "application/vnd.amazon.ebook",
    "fb2":  "application/x-fictionbook+xml",
    "txt":  "text/plain",
    "rtf":  "application/rtf",
    "pdf":  "application/pdf",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run_job(
    job_id: str,
    raw: bytes,
    input_suffix: str,
    target_format: str,
    output_filename: str,
    original_stem: str = "",
) -> None:
    """
    Execute the Calibre conversion in a thread-pool worker.

    Workflow
    --------
    1. Write the uploaded bytes to a temp file.
    2. Call calibre_engine.run_conversion() to start ebook-convert.
    3. Stream progress updates via calibre_engine.stream_progress().
    4. Read the output file and mark the job done.
    5. Clean up all temp files via calibre_engine.cleanup_temp_files().
    """
    tmp_dir    = Path(tempfile.mkdtemp(prefix="toolceo_ebook_"))
    input_path  = tmp_dir / f"input.{input_suffix}"
    output_path = tmp_dir / output_filename

    try:
        # ── Write uploaded bytes to disk ──────────────────────────────────
        input_path.write_bytes(raw)
        job_store.set_progress(job_id, 5)

        # ── Launch Calibre ────────────────────────────────────────────────
        process = run_conversion(input_path, output_path, target_format, original_stem)

        # ── Stream progress ───────────────────────────────────────────────
        # Calibre emits a handful of sparse checkpoints (1%, 34%, 67%, 100%).
        # Between checkpoints a background tween thread creeps the bar forward
        # so it never freezes.
        #
        # Tween design to avoid the "stuck at 90%" problem on large PDFs:
        #   • Calibre's 0-100 is mapped into the 5-89 display range.
        #   • The tween ceiling is always 89 (never higher).
        #   • Tick interval grows as the bar approaches 89:
        #       <70 → 0.4 s/step   (fast, visible progress early on)
        #       70-79 → 0.8 s/step  (medium)
        #       80-84 → 1.5 s/step  (slow)
        #       85-88 → 3.0 s/step  (very slow — bar barely moves near ceiling)
        #     This means the bar keeps moving but takes ~50 s to cover the last
        #     few percent before 89, so it never truly freezes even on a 5-min PDF.
        #   • When Calibre's final 100% arrives, the bar jumps straight to 95
        #     and then set_done pushes it to 100.

        _TWEEN_CEIL = 89          # bar never auto-advances past this before done
        _MAP_SCALE  = 0.84        # Calibre 0-100 → display 5-89  (5 + x*0.84)

        mapped_prev: list[int] = [5]
        tween_stop:  list[bool] = [False]

        def _tick_interval(cur: int) -> float:
            """Return sleep duration (seconds) for the tween at position cur."""
            if cur < 70:
                return 0.4
            if cur < 80:
                return 0.8
            if cur < 85:
                return 1.5
            return 3.0

        def _tween(start: int, end: int) -> None:
            """Creep from start toward end-1 with a progressively slowing tick."""
            cur = start
            while not tween_stop[0] and cur < end - 1:
                time.sleep(_tick_interval(cur))
                if tween_stop[0]:
                    break
                cur = min(cur + 1, end - 1)
                job_store.set_progress(job_id, cur)

        tween_thread: list[threading.Thread | None] = [None]

        def _restart_tween(new_mapped: int) -> None:
            """Stop any running tween, then start a new one toward new_mapped."""
            tween_stop[0] = True
            if tween_thread[0] is not None:
                tween_thread[0].join(timeout=1)
            tween_stop[0] = False
            t = threading.Thread(
                target=_tween, args=(mapped_prev[0], new_mapped), daemon=True
            )
            tween_thread[0] = t
            t.start()

        for pct in stream_progress(process):
            mapped = 5 + int(pct * _MAP_SCALE)   # 0% → 5, 100% → 89
            # Stop current tween, snap to the real checkpoint, start next tween
            tween_stop[0] = True
            if tween_thread[0] is not None:
                tween_thread[0].join(timeout=1)
            job_store.set_progress(job_id, mapped)
            mapped_prev[0] = mapped
            if mapped < _TWEEN_CEIL:
                _restart_tween(_TWEEN_CEIL)

        # Ensure tween is fully stopped before finalising
        tween_stop[0] = True
        if tween_thread[0] is not None:
            tween_thread[0].join(timeout=1)

        # ── Read output and finalise job ──────────────────────────────────
        if not output_path.exists():
            raise RuntimeError(
                f"ebook-convert completed but the output file was not created. "
                f"Expected: {output_path.name}"
            )

        result_bytes = output_path.read_bytes()
        media_type   = _MIME.get(target_format.lower(), "application/octet-stream")
        job_store.set_done(job_id, result_bytes, output_filename, media_type)

    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        _log.exception("eBook conversion job %s failed", job_id)
        job_store.set_error(job_id, f"Conversion error: {exc}")
    finally:
        # Always clean up temp files regardless of success or failure.
        cleanup_temp_files(tmp_dir)


# ---------------------------------------------------------------------------
# POST /api/ebooks/convert  –  async conversion job
# ---------------------------------------------------------------------------

@router.post(
    "/convert",
    summary="Convert an eBook to a different format using Calibre",
)
async def ebook_convert(
    file:            UploadFile     = File(...),
    target_format:   str            = Form(...),
    output_filename: Optional[str]  = Form(None),
):
    """
    Accept an eBook upload and enqueue a Calibre conversion job.

    Returns 202 Accepted with ``{"job_id": "<uuid>"}`` immediately.
    """
    raw = await file.read()

    # Derive source format from the uploaded filename extension
    original_name = file.filename or "ebook"
    stem, _, ext  = original_name.rpartition(".")
    input_fmt     = ext.lower() if ext else ""
    target_fmt    = target_format.lower().lstrip(".")

    # Validate the conversion pair before spawning any work
    try:
        validate_formats(input_fmt, target_fmt)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Build the output filename
    out_stem = (output_filename or "").strip()
    if out_stem:
        # Strip any extension the caller may have included
        out_stem = out_stem.rpartition(".")[0] or out_stem
    else:
        out_stem = stem or "ebook"

    out_name = f"{out_stem}.{target_fmt}"

    # Create job and submit to thread pool
    job = job_store.create_job()
    _pool.submit(
        _run_job,
        job.id,
        raw,
        input_fmt,
        target_fmt,
        out_name,
        stem or "ebook",
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
