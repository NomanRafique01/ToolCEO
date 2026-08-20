"""
PDF Merger engine.

All merging logic lives here, fully offline using PyMuPDF (fitz):

  merge_pdfs_ordered   – merge a list of PDFs in the supplied order into one PDF
  merge_pdf_pages      – merge specific page ranges from multiple PDFs into one PDF
  get_pdf_info         – return page count + first-page thumbnail for one PDF (used
                         by the frontend to preview each file in the merge queue)

Design notes
------------
* Pure PyMuPDF – zero external dependencies beyond what is already installed.
* All functions accept / return raw bytes so the router never touches the
  filesystem; everything lives in memory.
* Encrypted PDFs that require a password raise ValueError with a human-readable
  message so the router can surface it to the frontend as a 422 detail.
"""

from __future__ import annotations

import base64
import io
from typing import Optional


import fitz  # PyMuPDF


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _open_bytes(data: bytes, password: Optional[str] = None) -> fitz.Document:
    """Open a PDF from raw bytes, optionally unlocking it with *password*."""
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError(
                "This PDF is password-protected. Supply a password to include it."
            )
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


def _to_bytes(doc: fitz.Document) -> bytes:
    """Serialise a fitz Document to bytes, then close it."""
    buf = io.BytesIO()
    doc.save(
        buf,
        garbage=4,      # remove orphaned objects produced during insert_pdf
        deflate=True,   # compress content streams → smaller output
        clean=True,
    )
    doc.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Return basic metadata for a single PDF so the frontend can show a
    live preview card before the user triggers the merge.

    Returns
    -------
    {
        "page_count": int,
        "thumbnail":  "data:image/jpeg;base64,..."  (first page, 3× JPEG)
    }
    """
    doc = _open_bytes(data, password)
    page_count = doc.page_count

    # Render first page at 3× scale — large enough source for the browser
    # to downsample cleanly into the small thumbnail frame (~72 px wide).
    page = doc[0]
    mat  = fitz.Matrix(3.0, 3.0)
    pix  = page.get_pixmap(matrix=mat, alpha=False)
    jpeg = pix.tobytes("jpeg", jpg_quality=92)
    doc.close()

    b64 = base64.b64encode(jpeg).decode()
    return {
        "page_count": page_count,
        "thumbnail":  f"data:image/jpeg;base64,{b64}",
    }


def merge_pdfs_ordered(
    files: list[bytes],
    passwords: Optional[list[Optional[str]]] = None,
) -> bytes:
    """
    Concatenate *files* in the supplied order into a single PDF.

    Parameters
    ----------
    files:     List of raw PDF bytes.  Must contain at least 2 items.
    passwords: Optional per-file passwords (same length as *files*).
               Use None for unprotected files.

    Returns
    -------
    Raw bytes of the merged PDF.
    """
    if len(files) < 2:
        raise ValueError("At least two PDF files are required to merge.")

    pwds = passwords or [None] * len(files)
    merged = fitz.open()

    for i, (data, pwd) in enumerate(zip(files, pwds)):
        src = _open_bytes(data, pwd)
        merged.insert_pdf(src)
        src.close()

    return _to_bytes(merged)


def merge_pdf_pages(
    files: list[bytes],
    page_ranges: list[Optional[tuple[int, int]]],
    passwords: Optional[list[Optional[str]]] = None,
) -> bytes:
    """
    Merge specific page ranges from each file into one PDF.

    Parameters
    ----------
    files:        List of raw PDF bytes.
    page_ranges:  Per-file (start_page, end_page) tuples (1-based, inclusive).
                  Pass None for a given file to include all its pages.
    passwords:    Optional per-file passwords.

    Returns
    -------
    Raw bytes of the merged PDF.
    """
    if len(files) < 2:
        raise ValueError("At least two PDF files are required to merge.")
    if len(page_ranges) != len(files):
        raise ValueError("page_ranges must have the same length as files.")

    pwds   = passwords or [None] * len(files)
    merged = fitz.open()

    for data, rng, pwd in zip(files, page_ranges, pwds):
        src   = _open_bytes(data, pwd)
        total = src.page_count

        if rng is None:
            from_p, to_p = 0, total - 1          # all pages (0-based)
        else:
            start, end = rng
            from_p = max(0, start - 1)            # convert to 0-based
            to_p   = min(total - 1, end - 1)

        merged.insert_pdf(src, from_page=from_p, to_page=to_p)
        src.close()

    return _to_bytes(merged)
