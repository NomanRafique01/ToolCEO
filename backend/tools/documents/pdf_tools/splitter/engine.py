"""
PDF Splitter engine.

All splitting logic lives here:
  - split_pdf         : extract a page range into a single PDF
  - split_pdf_chunked : split into equal-size chunks and return a ZIP
  - split_pdf_to_zip  : split every page into its own PDF and return a ZIP
  - _auto_chunk_size  : choose a sensible chunk size based on total page count
"""

from __future__ import annotations

import io
import zipfile

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
# Public API
# ---------------------------------------------------------------------------

def _auto_chunk_size(total_pages: int) -> int:
    """Return the default chunk size based on total page count."""
    if total_pages <= 100:
        return 10
    elif total_pages <= 400:
        return 25
    else:
        return 50


def split_pdf(data: bytes, start_page: int, end_page: int) -> bytes:
    """
    Extract pages [start_page, end_page] (1-based, inclusive) into a new PDF.
    """
    src = _open_bytes(data)
    total = src.page_count
    s = max(1, start_page) - 1          # convert to 0-based
    e = min(total, end_page) - 1
    out = fitz.open()
    out.insert_pdf(src, from_page=s, to_page=e)
    src.close()
    return _to_bytes(out)


def split_pdf_chunked(data: bytes, chunk_size: int) -> bytes:
    """
    Split a PDF into sequential chunks of *chunk_size* pages each and return
    a ZIP archive.  The final chunk may be smaller than chunk_size.
    E.g. 35-page PDF with chunk_size=10 → parts_001-010.pdf, parts_011-020.pdf,
         parts_021-030.pdf, parts_031-035.pdf.
    """
    src = _open_bytes(data)
    total = src.page_count
    buf = io.BytesIO()

    with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
        start = 0  # 0-based
        chunk_num = 1
        while start < total:
            end = min(start + chunk_size, total) - 1  # 0-based inclusive
            chunk_doc = fitz.open()
            chunk_doc.insert_pdf(src, from_page=start, to_page=end)
            chunk_bytes = _to_bytes(chunk_doc)
            label = f"pdf{chunk_num}_{start + 1}-{end + 1}.pdf"
            zf.writestr(label, chunk_bytes)
            start = end + 1
            chunk_num += 1

    src.close()
    buf.seek(0)
    return buf.read()


def split_pdf_to_zip(data: bytes) -> bytes:
    """
    Split every page of the PDF into its own file and return a ZIP archive.
    E.g. a 200-page PDF → ZIP containing page_001.pdf … page_200.pdf.
    """
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
