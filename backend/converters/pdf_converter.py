"""
PDF conversion engine.

External tools required (must be on PATH):
  - LibreOffice CLI  (soffice / libreoffice)   – DOCX↔PDF, HTML→PDF
  - Pandoc           (pandoc)                  – PDF→DOCX, PDF→HTML, PDF→TXT, MD→PDF
  - PyMuPDF          (pip install PyMuPDF)      – PDF→images, images→PDF
"""

from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Callable

import fitz  # PyMuPDF
from platform_tools import (
    find_libreoffice,
    find_pandoc,
    install_message,
    require_binary,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _which(cmd: str) -> str:
    """Return full path of *cmd* or raise RuntimeError if not found."""
    if cmd == "pandoc":
        path = find_pandoc()
        if path is None:
            raise RuntimeError(install_message("pandoc"))
        return path

    path = shutil.which(cmd)
    if path is None:
        raise RuntimeError(
            f"Required external tool '{cmd}' was not found on PATH. "
            f"Please install it and make sure it is accessible."
        )
    return path


def _run(args: list[str], cwd: str | None = None) -> None:
    """Run a subprocess, raising RuntimeError on non-zero exit."""
    result = subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Command {args[0]!r} failed (exit {result.returncode}):\n"
            f"{result.stderr.strip() or result.stdout.strip()}"
        )


def _soffice() -> str:
    return require_binary("libreoffice", find_libreoffice())


def _with_tmp(suffix: str, data: bytes, fn: Callable[[Path], bytes]) -> bytes:
    """Write *data* to a temp file, call *fn(path)*, return its bytes result."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"input{suffix}"
        src.write_bytes(data)
        return fn(src)


# ---------------------------------------------------------------------------
# 1. PDF → DOCX  (Pandoc)
# ---------------------------------------------------------------------------

def pdf_to_docx(data: bytes) -> bytes:
    """Convert PDF to DOCX using Pandoc."""
    pandoc = _which("pandoc")

    def _convert(src: Path) -> bytes:
        out = src.with_suffix(".docx")
        _run([pandoc, str(src), "-o", str(out)])
        return out.read_bytes()

    return _with_tmp(".pdf", data, _convert)


# ---------------------------------------------------------------------------
# 2. PDF → HTML  (Pandoc)
# ---------------------------------------------------------------------------

def pdf_to_html(data: bytes) -> bytes:
    """Convert PDF to standalone HTML using Pandoc."""
    pandoc = _which("pandoc")

    def _convert(src: Path) -> bytes:
        out = src.with_suffix(".html")
        _run([pandoc, str(src), "--standalone", "-o", str(out)])
        return out.read_bytes()

    return _with_tmp(".pdf", data, _convert)


# ---------------------------------------------------------------------------
# 3. PDF → TXT  (Pandoc)
# ---------------------------------------------------------------------------

def pdf_to_txt(data: bytes) -> bytes:
    """Convert PDF to plain text using Pandoc."""
    pandoc = _which("pandoc")

    def _convert(src: Path) -> bytes:
        out = src.with_suffix(".txt")
        _run([pandoc, str(src), "-t", "plain", "-o", str(out)])
        return out.read_bytes()

    return _with_tmp(".pdf", data, _convert)


# ---------------------------------------------------------------------------
# 4. PDF → Images  (PyMuPDF – one JPG per page)
# ---------------------------------------------------------------------------

def pdf_to_images(data: bytes, dpi: int = 150) -> bytes:
    """
    Render every page to a JPEG and return a ZIP archive containing them.
    The archive contains: page_001.jpg, page_002.jpg, …
    """
    doc = fitz.open(stream=data, filetype="pdf")
    mat = fitz.Matrix(dpi / 72, dpi / 72)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i in range(doc.page_count):
            pix = doc[i].get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            img_bytes = pix.tobytes("jpeg")
            zf.writestr(f"page_{i + 1:03d}.jpg", img_bytes)

    doc.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# 5. DOCX → PDF  (LibreOffice)
# ---------------------------------------------------------------------------

def docx_to_pdf(data: bytes) -> bytes:
    """Convert DOCX to PDF using LibreOffice headless."""
    soffice = _soffice()

    def _convert(src: Path) -> bytes:
        _run([
            soffice,
            "--headless",
            "--convert-to", "pdf",
            "--outdir", str(src.parent),
            str(src),
        ])
        out = src.with_suffix(".pdf")
        return out.read_bytes()

    return _with_tmp(".docx", data, _convert)


# ---------------------------------------------------------------------------
# 6. HTML → PDF  (LibreOffice)
# ---------------------------------------------------------------------------

def html_to_pdf(data: bytes) -> bytes:
    """Convert HTML to PDF using LibreOffice headless."""
    soffice = _soffice()

    def _convert(src: Path) -> bytes:
        _run([
            soffice,
            "--headless",
            "--convert-to", "pdf",
            "--outdir", str(src.parent),
            str(src),
        ])
        out = src.with_suffix(".pdf")
        return out.read_bytes()

    return _with_tmp(".html", data, _convert)


# ---------------------------------------------------------------------------
# 7. Markdown → PDF  (Pandoc)
# ---------------------------------------------------------------------------

def md_to_pdf(data: bytes) -> bytes:
    """
    Convert Markdown to PDF using Pandoc.
    Pandoc will use its built-in PDF engine (pdflatex / weasyprint / wkhtmltopdf).
    If none is available Pandoc falls back to HTML→PDF via LibreOffice.
    """
    pandoc = _which("pandoc")

    def _convert(src: Path) -> bytes:
        out = src.with_suffix(".pdf")
        _run([pandoc, str(src), "-o", str(out)])
        return out.read_bytes()

    return _with_tmp(".md", data, _convert)


# ---------------------------------------------------------------------------
# 8. Images → PDF  (PyMuPDF)
# ---------------------------------------------------------------------------

def images_to_pdf(files: list[tuple[str, bytes]]) -> bytes:
    """
    Combine a list of images into a single PDF.
    *files*: list of (original_filename, raw_bytes) pairs – order is preserved.
    Supported formats: JPEG, PNG, BMP, TIFF, GIF, WebP (anything fitz can open).
    """
    doc = fitz.open()

    for filename, img_bytes in files:
        ext = Path(filename).suffix.lower().lstrip(".")
        # fitz can open most raster formats directly
        img_doc = fitz.open(stream=img_bytes, filetype=ext or "png")
        pdfbytes = img_doc.convert_to_pdf()
        img_doc.close()
        tmp = fitz.open("pdf", pdfbytes)
        doc.insert_pdf(tmp)
        tmp.close()

    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    buf.seek(0)
    return buf.read()
