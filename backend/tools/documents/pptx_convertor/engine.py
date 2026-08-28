"""
PPTX conversion engine — ToolCEO
==================================

Supported conversions
---------------------
  pptx → pdf    : LibreOffice headless  (soffice --convert-to pdf)
  pptx → html   : LibreOffice headless  (soffice --convert-to html)
  pptx → images : LibreOffice → PDF then pdftoppm rasterize → zip
  pptx → odp    : LibreOffice headless  (soffice --convert-to odp)
  pptx → txt    : LibreOffice headless  (soffice --convert-to txt)
  pptx → pptx   : LibreOffice headless  (open + re-save; repair/compress)

Public API
----------
convert_pptx(data, target_format, job_id)
    Returns the converted bytes.
    Raises RuntimeError if the required engine is unavailable.

get_pptx_info(data)
    Returns { "file_size": int }
"""

from __future__ import annotations

import io
import logging
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

from platform_tools import find_libreoffice, install_message

_log = logging.getLogger(__name__)

# Subprocess timeout for conversions (seconds)
_LO_TIMEOUT = 300

# Targets that use LibreOffice
_LO_TARGETS = {"pdf", "html", "odp", "txt", "pptx", "images"}

# LibreOffice --convert-to format strings
_LO_FORMAT_MAP = {
    "pdf":  "pdf",
    "html": "html",
    "odp":  "odp:impress8",
    "txt":  "txt",
    "pptx": "pptx",
}

# Media-type per target (used by router)
MEDIA_TYPES = {
    "pdf":    "application/pdf",
    "html":   "text/html; charset=utf-8",
    "images": "application/zip",
    "odp":    "application/vnd.oasis.opendocument.presentation",
    "txt":    "text/plain; charset=utf-8",
    "pptx":   "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


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
# Public info helper
# ---------------------------------------------------------------------------

def get_pptx_info(data: bytes) -> dict:
    """Returns basic file metadata — file_size only."""
    return {"file_size": len(data)}


# ---------------------------------------------------------------------------
# Internal: LibreOffice conversion helper
# ---------------------------------------------------------------------------

def _run_libreoffice(soffice: str, input_path: Path, out_dir: Path, fmt: str) -> None:
    """
    Call LibreOffice headless to convert input_path → <fmt> in out_dir.
    Raises RuntimeError with captured stderr on failure.
    """
    lo_fmt = _LO_FORMAT_MAP[fmt]
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--nofirststartwizard",
        "--convert-to", lo_fmt,
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
            f"LibreOffice timed out after {_LO_TIMEOUT} s."
        ) from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"LibreOffice exited with code {proc.returncode}."
            + (f" Details: {detail}" if detail else "")
        )


def _convert_with_libreoffice(data: bytes, fmt: str, job_id: Optional[str]) -> bytes:
    """Convert PPTX bytes to *fmt* using LibreOffice; return output bytes."""
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path   = Path(tmp)
        input_doc  = tmp_path / "input.pptx"
        input_doc.write_bytes(data)

        _report(job_id, 40)
        _run_libreoffice(soffice, input_doc, tmp_path, fmt)
        _report(job_id, 85)

        # LibreOffice names the output after the input stem.
        # For odp the format string includes a filter suffix; strip it.
        out_ext = fmt.split(":")[0]
        output_file = tmp_path / f"input.{out_ext}"
        if not output_file.exists():
            candidates = list(tmp_path.glob(f"*.{out_ext}"))
            if not candidates:
                raise RuntimeError(
                    f"LibreOffice did not produce a .{out_ext} output file."
                )
            output_file = candidates[0]

        _report(job_id, 90)
        return output_file.read_bytes()


# ---------------------------------------------------------------------------
# Internal: PPTX → Images (via PDF intermediate + pdftoppm)
# ---------------------------------------------------------------------------

def _convert_to_images(data: bytes, job_id: Optional[str]) -> bytes:
    """
    Convert PPTX → PDF (LibreOffice) → rasterize each page to PNG (pdftoppm)
    → zip all images → return zip bytes.
    """
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 10)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path  = Path(tmp)
        input_doc = tmp_path / "input.pptx"
        input_doc.write_bytes(data)

        # Step 1 — Convert PPTX → PDF with LibreOffice
        _report(job_id, 20)
        pdf_cmd = [
            soffice,
            "--headless",
            "--norestore",
            "--nofirststartwizard",
            "--convert-to", "pdf",
            "--outdir", str(tmp_path),
            str(input_doc),
        ]
        _log.debug("LibreOffice → PDF command: %s", " ".join(pdf_cmd))
        try:
            proc = subprocess.run(
                pdf_cmd,
                capture_output=True,
                text=True,
                timeout=_LO_TIMEOUT,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"LibreOffice timed out after {_LO_TIMEOUT} s.") from exc

        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(
                f"LibreOffice (PDF step) exited with code {proc.returncode}."
                + (f" Details: {detail}" if detail else "")
            )

        pdf_file = tmp_path / "input.pdf"
        if not pdf_file.exists():
            candidates = list(tmp_path.glob("*.pdf"))
            if not candidates:
                raise RuntimeError("LibreOffice did not produce a PDF for image conversion.")
            pdf_file = candidates[0]

        _report(job_id, 50)

        # Step 2 — Rasterize PDF pages → PNG using pdftoppm (from poppler-utils)
        img_dir = tmp_path / "slides"
        img_dir.mkdir()

        import shutil as _shutil
        pdftoppm = _shutil.which("pdftoppm")
        if pdftoppm:
            img_cmd = [
                pdftoppm,
                "-r", "150",
                "-png",
                str(pdf_file),
                str(img_dir / "slide"),
            ]
            _log.debug("pdftoppm command: %s", " ".join(img_cmd))
            try:
                proc2 = subprocess.run(
                    img_cmd,
                    capture_output=True,
                    text=True,
                    timeout=_LO_TIMEOUT,
                )
            except subprocess.TimeoutExpired as exc:
                raise RuntimeError("pdftoppm timed out.") from exc

            if proc2.returncode != 0:
                detail = (proc2.stderr or proc2.stdout or "").strip()
                raise RuntimeError(
                    f"pdftoppm exited with code {proc2.returncode}."
                    + (f" Details: {detail}" if detail else "")
                )
            image_files = sorted(img_dir.glob("*.png"))
        else:
            # Fallback: use PyMuPDF (fitz) if available, otherwise error
            try:
                import fitz  # type: ignore
            except ImportError:
                raise RuntimeError(
                    "Image extraction requires either pdftoppm (poppler-utils) or PyMuPDF.\n"
                    "Install: sudo apt install poppler-utils  OR  pip install pymupdf"
                )
            doc = fitz.open(str(pdf_file))
            for i, page in enumerate(doc):
                mat = fitz.Matrix(2.0, 2.0)  # 2x scale → ~144 dpi
                pix = page.get_pixmap(matrix=mat)
                out_img = img_dir / f"slide-{i + 1:03d}.png"
                pix.save(str(out_img))
            doc.close()
            image_files = sorted(img_dir.glob("*.png"))

        _report(job_id, 85)

        if not image_files:
            raise RuntimeError("No slide images were produced.")

        # Step 3 — Zip all PNG images
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for img in image_files:
                zf.write(img, img.name)

        _report(job_id, 90)
        return buf.getvalue()


# ---------------------------------------------------------------------------
# Main public conversion entry point
# ---------------------------------------------------------------------------

def convert_pptx(
    data: bytes,
    target_format: str,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert PPTX bytes to *target_format*.

    Parameters
    ----------
    data          : raw bytes of the .pptx file
    target_format : one of "pdf", "html", "images", "odp", "txt", "pptx"
    job_id        : optional SSE job id for progress reporting

    Returns
    -------
    bytes — the converted file content

    Raises
    ------
    ValueError   — unsupported target format
    RuntimeError — engine unavailable or conversion failure
    """
    fmt = target_format.lower().lstrip(".")

    if fmt not in _LO_TARGETS:
        raise ValueError(
            f"Unsupported target format '{fmt}'. "
            f"Supported: {', '.join(sorted(_LO_TARGETS))}"
        )

    _report(job_id, 10)

    if fmt == "images":
        return _convert_to_images(data, job_id)

    return _convert_with_libreoffice(data, fmt, job_id)
