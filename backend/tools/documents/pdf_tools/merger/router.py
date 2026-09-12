"""
PDF Merger router.

Endpoints
---------
POST /api/pdf/merger/info
    Synchronous.  Accepts a single PDF (+ optional password) and returns its
    page count and a base64 JPEG thumbnail of the first page.
    Used by the frontend to populate each file card in the merge queue.

    Form fields
    -----------
    file      : UploadFile  – the PDF
    password  : str | None  – unlock password for encrypted PDFs

    Response  : { "page_count": int, "thumbnail": "data:image/jpeg;base64,..." }

POST /api/pdf/merger/merge
    Async job.  Accepts 2–20 PDFs in order and merges them into one.
    Returns a job ID immediately (202 Accepted); the frontend polls
    /api/progress/{job_id} via SSE, then fetches /api/download/{job_id}.

    Form fields
    -----------
    files[]         : list[UploadFile]  – PDFs in merge order (min 2, max 20)
    passwords[]     : list[str] | None  – per-file passwords (same length as
                                          files[], use empty string for none)
    output_filename : str | None        – desired name for the merged PDF
                                          (default: "merged.pdf")

    Response  : { "job_id": "..." }  – 202 Accepted

Job lifecycle (standard pattern, shared with Splitter)
-------------------------------------------------------
  pending → running (progress 10–90) → done | error
  Frontend subscribes via SSE at /api/progress/{job_id},
  then downloads the result from /api/download/{job_id}.
"""

from __future__ import annotations

import asyncio
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.pdf_tools.merger.engine import (
    get_pdf_info,
    merge_pdf_pages,
    merge_pdfs_ordered,
)

router = APIRouter(prefix="/pdf/merger", tags=["PDF Merger"])
_pool  = job_executor

# ---------------------------------------------------------------------------
# Internal helpers  (mirror the pattern used in splitter/router.py)
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
        with job_store.smooth_progress(job_id, 10, 95):
            result = fn(*args)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, media_type)
    except ValueError as exc:
        # Engine raises ValueError for bad passwords / too few files etc.
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
# POST /api/pdf/merger/info  –  synchronous preview helper
# ---------------------------------------------------------------------------

@router.post(
    "/info",
    summary="Return page count + first-page thumbnail for a single PDF",
)
async def pdf_merger_info(
    file:     UploadFile       = File(...),
    password: Optional[str]   = Form(None),
):
    """
    Quick scan of a single PDF.  Called once per file as the user adds files
    to the merge queue so the UI can show a thumbnail and page count.
    """
    raw = await _read(file)
    try:
        info = await run_in_threadpool(get_pdf_info, raw, password or None)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")
    return JSONResponse(info)


# ---------------------------------------------------------------------------
# POST /api/pdf/merger/merge  –  async merge job
# ---------------------------------------------------------------------------

@router.post(
    "/merge",
    summary="Merge 2–20 PDFs into one (async job)",
)
async def merge(
    files:           List[UploadFile]  = File(...),
    passwords:       Optional[str]    = Form(None),
    output_filename: Optional[str]    = Form(None),
):
    """
    Merge all supplied PDFs in the order they are sent.

    *passwords* is a JSON-encoded list of strings (one per file, empty string
    means no password).  Example: '["", "secret", ""]'
    The frontend sends it as a single form string to stay multipart-compatible.
    """
    # ── Validation ────────────────────────────────────────────────────────────
    if len(files) < 2:
        raise HTTPException(
            status_code=422,
            detail="At least two PDF files are required to merge.",
        )
    if len(files) > 20:
        raise HTTPException(
            status_code=422,
            detail="Maximum 20 PDF files per merge request.",
        )

    # ── Parse per-file passwords ──────────────────────────────────────────────
    pwd_list: list[Optional[str]] = [None] * len(files)
    if passwords:
        import json as _json
        try:
            parsed = _json.loads(passwords)
            if isinstance(parsed, list) and len(parsed) == len(files):
                pwd_list = [p if p else None for p in parsed]
        except (_json.JSONDecodeError, TypeError):
            pass  # ignore malformed passwords field; treat all as unprotected

    # ── Read all files into memory ────────────────────────────────────────────
    raw_files: list[bytes] = []
    for upload in files:
        raw_files.append(await _read(upload))

    # ── Determine output filename ─────────────────────────────────────────────
    out_name = (output_filename or "merged").strip()
    if not out_name.lower().endswith(".pdf"):
        out_name += ".pdf"

    # ── Create job and submit to thread pool ──────────────────────────────────
    job = job_store.create_job()
    _submit(
        job.id,
        merge_pdfs_ordered,
        raw_files,
        pwd_list,
        filename=out_name,
    )

    return JSONResponse({"job_id": job.id}, status_code=202)
