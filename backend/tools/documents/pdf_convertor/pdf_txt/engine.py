"""
PDF → TXT conversion engine — ToolCEO
=======================================

Conversion engine: pdfminer.six  (pure Python, no binary, fully offline)
--------------------------------------------------------------------------
Uses PDFPageInterpreter + LAParams with tuned settings for better multi-column
reading order preservation:
  - line_margin=0.5   (tighter line grouping — avoids merging adjacent columns)
  - char_margin=2.0   (wider character grouping — joins chars into words properly)

For standard single-column PDFs ``high_level.extract_text()`` would suffice, but
these LAParams settings handle multi-column layouts significantly better.

Scanned / image-only PDFs
---------------------------
Before extraction every page is checked for extractable text via PyMuPDF.
If the PDF has no text layer:

  1. If Tesseract OCR is available, each page is run through OCR to produce a
     searchable PDF, then pdfminer extracts text from that.
  2. If Tesseract is NOT available the PDF is still processed but will return
     an empty or near-empty string.  The caller surfaces a warning.

Progress events (SSE-compatible)
---------------------------------
  10 %   starting / scanned-PDF detection
  20-48% OCR pre-pass (scanned PDFs only, when Tesseract available)
  50 %   pdfminer extraction started
  90 %   text ready
  95 %   done (router bumps to 100 via set_done)

Public API
----------
get_pdf_info(data, password)
    Returns page_count, file_size, and a base64 JPEG thumbnail.

convert_pdf_to_txt(data, password, job_id)
    Returns the extracted text as UTF-8 bytes.
"""

from __future__ import annotations

import base64
import io
import logging
import tempfile
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from platform_tools import find_tesseract

_log = logging.getLogger(__name__)


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
# PDF info (same shape as other tools)
# ---------------------------------------------------------------------------

def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Returns:
        { "page_count": int, "file_size": int, "thumbnail": "data:image/jpeg;base64,..." }
    """
    doc = _open_fitz(data, password)
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

def _open_fitz(data: bytes, password: Optional[str] = None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError("This PDF is password-protected. Supply a password.")
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


def _is_scanned(doc: fitz.Document) -> bool:
    """Return True if the PDF has no extractable text on any page."""
    for page in doc:
        if page.get_text("text").strip():
            return False
    return True


def _ocr_to_searchable_pdf(
    doc: fitz.Document,
    job_id: Optional[str],
) -> Optional[bytes]:
    """
    Render every page to PNG, run Tesseract, return a searchable PDF.
    Returns None if Tesseract is unavailable.
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
        mat  = fitz.Matrix(300 / 72, 300 / 72)
        pix  = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
        img  = Image.open(io.BytesIO(pix.tobytes("png")))

        page_pdf = pytesseract.image_to_pdf_or_hocr(img, extension="pdf", lang="eng")
        page_pdfs.append(page_pdf)

    merged = fitz.open()
    for ppdf in page_pdfs:
        tmp_doc = fitz.open("pdf", ppdf)
        merged.insert_pdf(tmp_doc)
        tmp_doc.close()

    buf = io.BytesIO()
    merged.save(buf)
    merged.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Known bad CID → correct Unicode replacements
# pdfminer.six sometimes maps glyphs to wrong codepoints when a PDF embeds
# a font with a non-standard encoding (e.g. ReportLab's built-in ligature
# handling can map U+FB01 "ﬁ" for what should be U+2192 "→").
# We also handle the raw "(cid:N)" fallback strings pdfminer emits for
# completely unmapped glyphs.
# ---------------------------------------------------------------------------

_CID_REPLACEMENTS: list[tuple[str, str]] = [
    # ligature / wrong-unicode → correct character
    ("\ufb01", "→"),   # ﬁ  (fi ligature slot reused for arrow)
    ("\ufb02", "→"),   # ﬂ  (fl ligature slot — some fonts map arrow here)
    # raw CID strings emitted when pdfminer cannot map the glyph at all
    ("(cid:127)", "•"),
    ("(cid:176)", "°"),
    ("(cid:183)", "·"),
    ("(cid:226)", "→"),
    ("(cid:224)", "←"),
    ("(cid:225)", "↑"),
    ("(cid:228)", "↓"),
]


def _fix_encoding(text: str) -> str:
    """Apply known CID / bad-unicode corrections to extracted text."""
    for bad, good in _CID_REPLACEMENTS:
        text = text.replace(bad, good)
    return text


def _extract_text_pdfminer(pdf_bytes: bytes, password: Optional[str] = None) -> str:
    """
    Extract text from PDF bytes using pdfminer.six with LAParams tuned for
    multi-column layout (line_margin=0.5, char_margin=2.0).
    """
    from pdfminer.layout import LAParams
    from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
    from pdfminer.converter import TextConverter
    from pdfminer.pdfpage import PDFPage

    laparams = LAParams(line_margin=0.5, char_margin=2.0, detect_vertical=False)

    output_buf = io.StringIO()
    rsrcmgr = PDFResourceManager()
    device  = TextConverter(rsrcmgr, output_buf, codec="utf-8", laparams=laparams)
    interp  = PDFPageInterpreter(rsrcmgr, device)

    pdf_stream = io.BytesIO(pdf_bytes)
    pw_bytes = (password or "").encode("utf-8")

    try:
        for page in PDFPage.get_pages(pdf_stream, password=pw_bytes, check_extractable=False):
            interp.process_page(page)
    finally:
        device.close()

    return _fix_encoding(output_buf.getvalue())


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_pdf_to_txt(
    data: bytes,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert PDF bytes → UTF-8 text bytes via pdfminer.six.

    Progress milestones
    -------------------
    10 %   starting / scanned-PDF detection
    20-48% OCR pre-pass (scanned PDFs only, when Tesseract available)
    50 %   pdfminer extraction started
    90 %   text ready
    95 %   done (router bumps to 100 via set_done)
    """
    _report(job_id, 10)

    doc = _open_fitz(data, password)
    scanned = _is_scanned(doc)
    pdf_to_extract = data
    scanned_no_ocr = False

    if scanned:
        _log.info("Scanned/image-only PDF detected — attempting OCR pre-pass")
        _report(job_id, 20)
        ocr_pdf_bytes = _ocr_to_searchable_pdf(doc, job_id)
        if ocr_pdf_bytes:
            pdf_to_extract = ocr_pdf_bytes
            _log.info("OCR pre-pass complete; extracting text from searchable PDF")
        else:
            scanned_no_ocr = True
            _log.warning(
                "OCR unavailable; proceeding with original scanned PDF. "
                "Output may be empty."
            )

    doc.close()

    _report(job_id, 50)

    text = _extract_text_pdfminer(pdf_to_extract, password)

    _report(job_id, 90)

    if scanned_no_ocr and not text.strip():
        text = (
            "Scanned PDF — no text layer found.\n"
            "Install Tesseract OCR and retry for full text extraction.\n"
        )
        _log.warning(
            "Converted scanned PDF without OCR. Text content is empty. "
            "Install Tesseract OCR for full text extraction from scanned PDFs."
        )

    _report(job_id, 95)
    return text.encode("utf-8")
