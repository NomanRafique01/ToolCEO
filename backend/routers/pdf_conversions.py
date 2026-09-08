"""
PDF conversions router.
Each endpoint creates a job (202), runs conversion in a thread,
frontend tracks progress via SSE then downloads via /api/download/{job_id}.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import jobs as job_store
from job_executor import job_executor
from converters.pdf_converter import (
    docx_to_pdf,
    html_to_pdf,
    images_to_pdf,
    md_to_pdf,
    pdf_to_docx,
    pdf_to_html,
    pdf_to_images,
    pdf_to_txt,
)

router = APIRouter(prefix="/convert", tags=["PDF Conversions"])
_pool = job_executor

_PDF  = "application/pdf"
_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_HTML = "text/html; charset=utf-8"
_TXT  = "text/plain; charset=utf-8"
_ZIP  = "application/zip"


async def _read(upload: UploadFile) -> bytes:
    return await upload.read()


def _run(job_id: str, fn, *args, filename: str, media_type: str = _PDF):
    try:
        job_store.set_progress(job_id, 10)
        result = fn(*args)
        job_store.set_done(job_id, result, filename, media_type)
    except Exception as exc:
        job_store.set_error(job_id, str(exc))


# ---------------------------------------------------------------------------
# 1. PDF → DOCX
# ---------------------------------------------------------------------------

@router.post("/pdf-to-docx", summary="Convert PDF to DOCX (via Pandoc)")
async def route_pdf_to_docx(file: UploadFile = File(...)):
    raw = await _read(file)
    job = job_store.create_job()
    stem = (file.filename or "output").rsplit(".", 1)[0]
    _pool.submit(_run, job.id, pdf_to_docx, raw, filename=f"{stem}.docx", media_type=_DOCX)
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 2. PDF → HTML
# ---------------------------------------------------------------------------

@router.post("/pdf-to-html", summary="Convert PDF to standalone HTML (via Pandoc)")
async def route_pdf_to_html(file: UploadFile = File(...)):
    raw = await _read(file)
    job = job_store.create_job()
    stem = (file.filename or "output").rsplit(".", 1)[0]
    _pool.submit(_run, job.id, pdf_to_html, raw, filename=f"{stem}.html", media_type=_HTML)
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 3. PDF → TXT
# ---------------------------------------------------------------------------

@router.post("/pdf-to-txt", summary="Convert PDF to plain text (via Pandoc)")
async def route_pdf_to_txt(file: UploadFile = File(...)):
    raw = await _read(file)
    job = job_store.create_job()
    stem = (file.filename or "output").rsplit(".", 1)[0]
    _pool.submit(_run, job.id, pdf_to_txt, raw, filename=f"{stem}.txt", media_type=_TXT)
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 4. PDF → Images (ZIP)
# ---------------------------------------------------------------------------

@router.post("/pdf-to-images", summary="Render each PDF page to a JPEG and return a ZIP")
async def route_pdf_to_images(
    file: UploadFile = File(...),
    dpi: int = Form(150, ge=72, le=600),
):
    raw = await _read(file)
    job = job_store.create_job()
    stem = (file.filename or "output").rsplit(".", 1)[0]
    _pool.submit(_run, job.id, pdf_to_images, raw, dpi,
                 filename=f"{stem}_pages.zip", media_type="application/zip")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 5. DOCX → PDF
# ---------------------------------------------------------------------------

@router.post("/docx-to-pdf", summary="Convert DOCX to PDF (via LibreOffice)")
async def route_docx_to_pdf(file: UploadFile = File(...)):
    raw = await _read(file)
    job = job_store.create_job()
    stem = (file.filename or "output").rsplit(".", 1)[0]
    _pool.submit(_run, job.id, docx_to_pdf, raw, filename=f"{stem}.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 6. HTML → PDF
# ---------------------------------------------------------------------------

@router.post("/html-to-pdf", summary="Convert HTML to PDF (via LibreOffice)")
async def route_html_to_pdf(file: UploadFile = File(...)):
    raw = await _read(file)
    job = job_store.create_job()
    stem = (file.filename or "output").rsplit(".", 1)[0]
    _pool.submit(_run, job.id, html_to_pdf, raw, filename=f"{stem}.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 7. Markdown → PDF
# ---------------------------------------------------------------------------

@router.post("/md-to-pdf", summary="Convert Markdown to PDF (via Pandoc)")
async def route_md_to_pdf(file: UploadFile = File(...)):
    raw = await _read(file)
    job = job_store.create_job()
    stem = (file.filename or "output").rsplit(".", 1)[0]
    _pool.submit(_run, job.id, md_to_pdf, raw, filename=f"{stem}.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)


# ---------------------------------------------------------------------------
# 8. Images → PDF
# ---------------------------------------------------------------------------

@router.post("/images-to-pdf", summary="Combine images into a single PDF (via PyMuPDF)")
async def route_images_to_pdf(
    files: List[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(status_code=422, detail="At least one image file is required.")
    pairs = [(f.filename or f"image_{i}.jpg", await _read(f)) for i, f in enumerate(files)]
    job = job_store.create_job()
    _pool.submit(_run, job.id, images_to_pdf, pairs, filename="combined.pdf")
    return JSONResponse({"job_id": job.id}, status_code=202)
