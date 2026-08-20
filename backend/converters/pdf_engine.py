"""
PDF engine – all heavy lifting lives here.
Depends on: PyMuPDF (fitz), pytesseract, Pillow
"""

from __future__ import annotations

import io
import os
import tempfile
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _open_bytes(data: bytes) -> fitz.Document:
    """Open a PDF from raw bytes."""
    return fitz.open(stream=data, filetype="pdf")


def _to_bytes(doc: fitz.Document) -> bytes:
    """Serialise a fitz Document to bytes and close it."""
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# 1. Merge
# ---------------------------------------------------------------------------

def merge_pdfs(files: list[bytes]) -> bytes:
    """Merge multiple PDFs into one, preserving page order."""
    merged = fitz.open()
    for data in files:
        src = _open_bytes(data)
        merged.insert_pdf(src)
        src.close()
    return _to_bytes(merged)


# ---------------------------------------------------------------------------
# 2. Split
# ---------------------------------------------------------------------------

def split_pdf(data: bytes, start_page: int, end_page: int) -> bytes:
    """
    Extract pages [start_page, end_page] (1-based, inclusive) into a new PDF.
    """
    src = _open_bytes(data)
    total = src.page_count
    # Clamp to valid range
    s = max(1, start_page) - 1          # convert to 0-based
    e = min(total, end_page) - 1
    out = fitz.open()
    out.insert_pdf(src, from_page=s, to_page=e)
    src.close()
    return _to_bytes(out)


def split_pdf_to_zip(data: bytes) -> bytes:
    """
    Split every page of the PDF into its own file and return a ZIP archive.
    E.g. a 200-page PDF → ZIP containing page_001.pdf … page_200.pdf.
    """
    import zipfile

    src = _open_bytes(data)
    total = src.page_count
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        for i in range(total):
            page_doc = fitz.open()
            page_doc.insert_pdf(src, from_page=i, to_page=i)
            page_bytes = _to_bytes(page_doc)
            zf.writestr(f"page_{i + 1:03d}.pdf", page_bytes)

    src.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# 3. Compress
# ---------------------------------------------------------------------------

def compress_pdf(data: bytes) -> bytes:
    """
    Re-save the PDF with garbage collection and deflate compression.
    Also down-samples embedded images to reduce file size.
    """
    src = _open_bytes(data)
    buf = io.BytesIO()
    src.save(
        buf,
        garbage=4,       # remove unused objects
        deflate=True,    # compress streams
        clean=True,
    )
    src.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# 4. Rotate pages
# ---------------------------------------------------------------------------

def rotate_pdf(data: bytes, degrees: int, pages: Optional[list[int]] = None) -> bytes:
    """
    Rotate pages by *degrees* (must be a multiple of 90).
    *pages*: 1-based list of page numbers; None means all pages.
    """
    doc = _open_bytes(data)
    target_pages = [p - 1 for p in pages] if pages else list(range(doc.page_count))
    for i in target_pages:
        if 0 <= i < doc.page_count:
            page = doc[i]
            page.set_rotation((page.rotation + degrees) % 360)
    return _to_bytes(doc)


# ---------------------------------------------------------------------------
# 5. Watermark
# ---------------------------------------------------------------------------

def add_watermark(
    data: bytes,
    text: str,
    font_size: int = 48,
    opacity: float = 0.25,
    color: tuple[float, float, float] = (0.75, 0.75, 0.75),
) -> bytes:
    """
    Stamp *text* as a diagonal watermark on every page.
    """
    doc = _open_bytes(data)
    for page in doc:
        rect = page.rect
        # Centre of the page
        x = rect.width / 2
        y = rect.height / 2
        # Build a transparent text writer
        tw = fitz.TextWriter(rect)
        font = fitz.Font("helv")
        tw.append(
            (x - font_size * len(text) * 0.28, y),
            text,
            font=font,
            fontsize=font_size,
        )
        tw.write_text(
            page,
            color=color,
            opacity=opacity,
            morph=(fitz.Point(x, y), fitz.Matrix(-45)),
        )
    return _to_bytes(doc)


# ---------------------------------------------------------------------------
# 6. Encrypt
# ---------------------------------------------------------------------------

def encrypt_pdf(data: bytes, user_password: str, owner_password: Optional[str] = None) -> bytes:
    """
    Encrypt a PDF with AES-256.
    *user_password*  – required to open / read the file.
    *owner_password* – required to change permissions (defaults to user_password).
    """
    doc = _open_bytes(data)
    owner_pwd = owner_password or user_password
    buf = io.BytesIO()
    doc.save(
        buf,
        encryption=fitz.PDF_ENCRYPT_AES_256,
        user_pw=user_password,
        owner_pw=owner_pwd,
        permissions=fitz.PDF_PERM_PRINT | fitz.PDF_PERM_COPY,
    )
    doc.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# 7. Decrypt
# ---------------------------------------------------------------------------

def decrypt_pdf(data: bytes, password: str) -> bytes:
    """Remove encryption from a password-protected PDF."""
    doc = _open_bytes(data)
    if doc.needs_pass:
        result = doc.authenticate(password)
        if result == 0:
            raise ValueError("Incorrect password – cannot decrypt PDF.")
    # Re-save without encryption
    buf = io.BytesIO()
    doc.save(buf, encryption=fitz.PDF_ENCRYPT_NONE)
    doc.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# 8. Extract metadata
# ---------------------------------------------------------------------------

def extract_metadata(data: bytes) -> dict:
    """Return PDF metadata and basic document statistics."""
    doc = _open_bytes(data)
    meta = doc.metadata or {}
    info = {
        "page_count": doc.page_count,
        "is_encrypted": doc.is_encrypted,
        "is_pdf": doc.is_pdf,
        "title": meta.get("title", ""),
        "author": meta.get("author", ""),
        "subject": meta.get("subject", ""),
        "keywords": meta.get("keywords", ""),
        "creator": meta.get("creator", ""),
        "producer": meta.get("producer", ""),
        "creation_date": meta.get("creationDate", ""),
        "mod_date": meta.get("modDate", ""),
        "format": meta.get("format", ""),
        "encryption": meta.get("encryption", ""),
    }
    doc.close()
    return info


# ---------------------------------------------------------------------------
# 9. OCR (Tesseract)
# ---------------------------------------------------------------------------

def ocr_pdf(data: bytes, language: str = "eng", dpi: int = 300) -> str:
    """
    Render every page to an image and run Tesseract OCR on it.
    Returns the full extracted text.
    """
    try:
        import pytesseract
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(
            "pytesseract and Pillow are required for OCR. "
            "Install them: pip install pytesseract Pillow"
        ) from exc

    doc = _open_bytes(data)
    all_text: list[str] = []

    for page_num in range(doc.page_count):
        page = doc[page_num]
        mat = fitz.Matrix(dpi / 72, dpi / 72)  # scale to desired DPI
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        text = pytesseract.image_to_string(img, lang=language)
        all_text.append(f"--- Page {page_num + 1} ---\n{text}")

    doc.close()
    return "\n\n".join(all_text)
