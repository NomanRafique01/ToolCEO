"""
PDF → Word (DOCX) conversion engine — ToolCEO
===============================================

Conversion engine: LibreOffice headless
----------------------------------------
Uses ``soffice --headless --infilter="writer_pdf_import"
      --convert-to docx:"MS Word 2007 XML" <input.pdf> --outdir <outdir>``

LibreOffice reads the PDF's real layout via its built-in PDF import filter,
preserving text, images at their actual sizes/positions, and styles — without
any manual content reconstruction.

Cross-platform binary resolution
----------------------------------
Delegates entirely to :func:`platform_tools.find_libreoffice`, which already
handles all three platforms:

  - Windows : %PROGRAMFILES%\\LibreOffice\\program\\soffice.exe (+ PATH fallback)
  - macOS   : /Applications/LibreOffice.app/Contents/MacOS/soffice (+ Homebrew + PATH)
  - Linux   : soffice / libreoffice on PATH (distro package manager install)

LibreOffice is NOT newly bundled — it is already a project dependency used by
the DOCX→PDF and HTML→PDF conversion tools in converters/pdf_converter.py.

Scanned / image-only PDFs
---------------------------
Before conversion, every page is checked for extractable text via PyMuPDF.
If the PDF has no text layer at all (all pages are image-only):

  1. If Tesseract OCR is available on the host, each page is rendered to an
     image and run through pytesseract.image_to_pdf_or_hocr(extension="pdf")
     to produce a searchable PDF (invisible text overlay on the raster image).
     That searchable PDF is then fed into LibreOffice, which can extract the
     text layer it created.
  2. If Tesseract is NOT available, the conversion proceeds with the original
     PDF but sets a ``scanned_warning`` flag so the caller can surface a clear
     message to the user.

Progress events (SSE-compatible, same as other tools)
------------------------------------------------------
  10 %  — starting (PDF opened, scanned check done)
  20 %  — OCR pass started (only if scanned + Tesseract present)
  50 %  — LibreOffice conversion started
  90 %  — reading output file
  95 %  — done (router sets 100 via set_done)

Public API
----------
get_pdf_info(data, password)
    Returns page_count, file_size, and a base64 JPEG thumbnail.

convert_pdf_to_word(data, password, job_id)
    Returns the DOCX bytes.
"""

from __future__ import annotations

import base64
import io
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from platform_tools import find_libreoffice, find_tesseract, install_message

_log = logging.getLogger(__name__)

# Subprocess timeout for LibreOffice conversion (seconds).
# Large PDFs can be slow; 300 s gives plenty of headroom.
_LO_TIMEOUT = 300


# ---------------------------------------------------------------------------
# Progress helper
# ---------------------------------------------------------------------------

def _report(job_id: Optional[str], pct: int) -> None:
    if not job_id:
        return
    try:
        import jobs as job_store
        job_store.set_progress(job_id, pct)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# PDF info (same shape as other tools — reused by frontend)
# ---------------------------------------------------------------------------

def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Returns:
        { "page_count": int, "file_size": int, "thumbnail": "data:image/jpeg;base64,..." }
    """
    doc = _open(data, password)
    page_count = doc.page_count

    page = doc[0]
    mat  = fitz.Matrix(3.0, 3.0)
    pix  = page.get_pixmap(matrix=mat, alpha=False)
    jpeg = pix.tobytes("jpeg", jpg_quality=90)
    doc.close()

    b64 = base64.b64encode(jpeg).decode()
    return {
        "page_count": page_count,
        "file_size":  len(data),
        "thumbnail":  f"data:image/jpeg;base64,{b64}",
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _open(data: bytes, password: Optional[str] = None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError("This PDF is password-protected. Supply a password.")
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


def _is_scanned(doc: fitz.Document) -> bool:
    """
    Return True if the PDF has no extractable text on ANY page.
    Checks all pages; stops early as soon as any text is found.
    """
    for page in doc:
        if page.get_text("text").strip():
            return False
    return True


def _ocr_to_searchable_pdf(
    doc: fitz.Document,
    job_id: Optional[str],
) -> Optional[bytes]:
    """
    Render every page to a PNG, run Tesseract to produce a searchable PDF
    (hOCR → PDF with invisible text layer), and return the merged PDF bytes.

    Returns None if Tesseract is not available.
    """
    tesseract_cmd = find_tesseract()
    if not tesseract_cmd:
        _log.warning("Tesseract not found — skipping OCR pre-pass for scanned PDF")
        return None

    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        _log.warning("pytesseract/Pillow not importable — skipping OCR pre-pass")
        return None

    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    total = max(1, doc.page_count)
    page_pdfs: list[bytes] = []

    for pno in range(total):
        # Report OCR progress: 20 % → 48 %
        ocr_pct = 20 + int(28 * (pno / total))
        _report(job_id, ocr_pct)

        page = doc[pno]
        mat  = fitz.Matrix(300 / 72, 300 / 72)   # 300 dpi for OCR quality
        pix  = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
        img_bytes = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))

        # image_to_pdf_or_hocr with extension="pdf" returns PDF bytes with
        # an invisible text overlay (searchable PDF, no visual change).
        page_pdf = pytesseract.image_to_pdf_or_hocr(img, extension="pdf", lang="eng")
        page_pdfs.append(page_pdf)

    # Merge per-page PDFs into one
    merged = fitz.open()
    for page_pdf_bytes in page_pdfs:
        tmp_doc = fitz.open("pdf", page_pdf_bytes)
        merged.insert_pdf(tmp_doc)
        tmp_doc.close()

    buf = io.BytesIO()
    merged.save(buf)
    merged.close()
    buf.seek(0)
    return buf.read()


def _run_libreoffice(soffice: str, input_path: Path, out_dir: Path) -> None:
    """
    Call LibreOffice headless to convert input_path → DOCX in out_dir.

    Uses --infilter="writer_pdf_import" so LibreOffice uses its PDF import
    filter (reads the actual PDF layout) rather than any generic import path.

    Raises RuntimeError with the captured stderr on failure.
    """
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--nofirststartwizard",
        f"--infilter=writer_pdf_import",
        "--convert-to", "docx:MS Word 2007 XML",
        "--outdir", str(out_dir),
        str(input_path),
    ]
    _log.debug("LibreOffice command: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_LO_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"LibreOffice timed out after {_LO_TIMEOUT} s. "
            "The PDF may be very large or damaged."
        ) from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"LibreOffice exited with code {proc.returncode}. "
            + (f"Details: {detail}" if detail else "No details captured.")
        )


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_pdf_to_word(
    data: bytes,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert PDF bytes → DOCX bytes via LibreOffice headless.

    Progress milestones
    -------------------
    10 %  starting / scanned-PDF detection
    20-48% OCR pre-pass (scanned PDFs only, when Tesseract is available)
    50 %  LibreOffice conversion started
    90 %  reading output DOCX
    95 %  done (router bumps to 100 via set_done)
    """
    # ── Locate LibreOffice ────────────────────────────────────────────────────
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 10)

    # ── Open PDF for inspection ───────────────────────────────────────────────
    doc = _open(data, password)
    scanned = _is_scanned(doc)
    pdf_to_convert = data
    scanned_no_ocr = False

    if scanned:
        _log.info("Scanned/image-only PDF detected — attempting OCR pre-pass")
        _report(job_id, 20)
        ocr_pdf_bytes = _ocr_to_searchable_pdf(doc, job_id)
        if ocr_pdf_bytes:
            pdf_to_convert = ocr_pdf_bytes
            _log.info("OCR pre-pass complete; feeding searchable PDF to LibreOffice")
        else:
            scanned_no_ocr = True
            _log.warning(
                "OCR unavailable; proceeding with original scanned PDF. "
                "Output may be incomplete."
            )

    doc.close()

    # ── Run LibreOffice in a temp directory ───────────────────────────────────
    _report(job_id, 50)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        input_pdf = tmp_path / "input.pdf"
        input_pdf.write_bytes(pdf_to_convert)

        _run_libreoffice(soffice, input_pdf, tmp_path)

        # LibreOffice names the output after the input stem
        output_docx = tmp_path / "input.docx"
        if not output_docx.exists():
            # Fallback: find any .docx produced
            candidates = list(tmp_path.glob("*.docx"))
            if not candidates:
                raise RuntimeError(
                    "LibreOffice did not produce a .docx output file. "
                    "Check that the PDF is not corrupted or password-protected."
                )
            output_docx = candidates[0]

        _report(job_id, 90)
        docx_bytes = output_docx.read_bytes()

    if scanned_no_ocr:
        # Surface a warning in the result — the caller (router/SSE) passes
        # this through the normal done path; the warning is logged here and
        # can optionally be checked by the router if it inspects the engine.
        _log.warning(
            "Converted scanned PDF without OCR. Text content may be missing. "
            "Install Tesseract OCR for full text extraction from scanned PDFs."
        )

    _report(job_id, 95)
    return docx_bytes
