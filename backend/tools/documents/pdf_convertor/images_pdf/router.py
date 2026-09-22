"""
Images → PDF router — ToolCEO
================================

Endpoints
---------
POST /api/images/pdf/convert
    Async job.  Accepts one or more images in order, bundles them into a PDF
    (or a ZIP of individual PDFs when pdf_mode='individual').
    Returns { "job_id" } immediately (202 Accepted).
    The frontend polls /api/progress/{job_id} via SSE, then downloads
    from /api/download/{job_id}.

    Form fields
    -----------
    files            : List[UploadFile]  – images in desired page order
    output_filename  : str | None        – desired filename (default "images_converted")
    pdf_mode         : str | None        – 'single' (default) | 'individual'
                                           'individual' → each image becomes its own PDF,
                                           delivered as a .zip when multiple files are given.
"""

from __future__ import annotations

import io
import zipfile
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from tools.documents.pdf_convertor.images_pdf.engine import convert_images_to_pdf

router = APIRouter(prefix="/images/pdf", tags=["Images to PDF"])
_pool  = job_executor


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run_job(
    job_id:   str,
    images:   list[tuple[bytes, str]],   # (raw_bytes, original_stem)
    out_base: str,
    pdf_mode: str,
) -> None:
    """Worker that runs in the thread-pool executor."""
    try:
        job_store.set_progress(job_id, 5)

        n = len(images)

        # ── Single-mode (or single image) ──────────────────────────────────
        if pdf_mode != "individual" or n == 1:
            raw_list = [raw for raw, _ in images]
            result   = convert_images_to_pdf(raw_list, job_id=job_id)
            filename = out_base if out_base.lower().endswith(".pdf") else out_base + ".pdf"
            job_store.set_progress(job_id, 95)
            job_store.set_done(job_id, result, filename, "application/pdf")
            return

        # ── Individual-mode — convert each image to its own PDF ────────────
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (raw, stem) in enumerate(images):
                pct = 10 + int(80 * (i / n))
                job_store.set_progress(job_id, pct)

                # Wrap single image in a list for reuse of engine
                pdf_bytes = convert_images_to_pdf([raw])
                zf.writestr(f"{stem}.pdf", pdf_bytes)

        job_store.set_progress(job_id, 95)
        zip_bytes = buf.getvalue()
        zip_name  = (out_base.rstrip(".pdf") or "images_converted") + ".zip"
        job_store.set_done(job_id, zip_bytes, zip_name, "application/zip")

    except ValueError as exc:
        job_store.set_error(job_id, str(exc))
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")


# ---------------------------------------------------------------------------
# POST /api/images/pdf/convert
# ---------------------------------------------------------------------------

@router.post(
    "/convert",
    summary="Bundle one or more images into PDF(s)",
)
async def images_to_pdf(
    files:           List[UploadFile]  = File(...),
    output_filename: Optional[str]     = Form(None),
    pdf_mode:        Optional[str]     = Form(None),
):
    if not files:
        raise HTTPException(status_code=422, detail="At least one image is required.")

    images: list[tuple[bytes, str]] = []
    for f in files:
        raw  = await f.read()
        stem = (f.filename or "image").rsplit(".", 1)[0]
        images.append((raw, stem))

    out_base = (output_filename or "").strip() or "images_converted"
    mode     = (pdf_mode or "single").strip().lower()
    if mode not in ("single", "individual"):
        mode = "single"

    job = job_store.create_job()
    _pool.submit(_run_job, job.id, images, out_base, mode)

    return JSONResponse({"job_id": job.id}, status_code=202)
