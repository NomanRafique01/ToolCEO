"""
PPTX conversion engine — ToolCEO
==================================

Supported conversions
---------------------
  pptx → pdf    : LibreOffice headless  (soffice --convert-to pdf)
  pptx → html   : LibreOffice headless  (soffice --convert-to html)
  pptx → images : LibreOffice → PDF then pdftoppm rasterize → zip
  pptx → odp    : LibreOffice headless  (soffice --convert-to odp)
  pptx → txt    : Pandoc                (pandoc input.pptx -t plain -o output.txt)
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

from PIL import Image

from platform_tools import find_libreoffice, find_pandoc, install_message

_log = logging.getLogger(__name__)

# Subprocess timeout for conversions (seconds)
_LO_TIMEOUT     = 300
_PANDOC_TIMEOUT = 120

# Targets that use LibreOffice
_LO_TARGETS = {"pdf", "html", "odp", "pptx", "images"}

# Targets that use Pandoc
_PANDOC_TARGETS = {"txt"}

# LibreOffice --convert-to format strings
_LO_FORMAT_MAP = {
    "pdf":  "pdf",
    "html": "html",
    "odp":  "odp:impress8",
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



# ---------------------------------------------------------------------------
# Internal: PPTX compress — re-encode embedded images + repack ZIP
# ---------------------------------------------------------------------------

# JPEG quality for embedded slide images (mirrors PDF compressor's approach).
# 75 gives a strong size reduction while keeping slides readable on-screen.
_PPTX_JPEG_QUALITY = 75

# Media file extensions treated as raster images eligible for re-encoding.
_RASTER_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".gif"}


def _compress_pptx_zip(pptx_path: Path, job_id: Optional[str]) -> Path:
    """
    Re-encode every raster image inside *pptx_path* at JPEG quality
    _PPTX_JPEG_QUALITY, then repack the whole ZIP with compresslevel=9.

    Strategy (same as the PDF compressor engine):
      1. Open each media file in ppt/media/ that is a raster image.
      2. Re-encode it as JPEG (strip alpha, convert CMYK→RGB, skip tiny images).
      3. Write every entry — re-encoded or verbatim — into a new ZIP at
         compresslevel=9 so even XML/theme/font streams get maximum deflation.

    Returns the path of the new compressed file (sibling of *pptx_path*).
    """
    out_path = pptx_path.parent / "compressed.pptx"
    _report(job_id, 87)

    with zipfile.ZipFile(pptx_path, "r") as zin, \
         zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zout:

        entries = zin.infolist()
        total   = max(1, len(entries))

        for idx, item in enumerate(entries):
            raw = zin.read(item.filename)
            name_lower = item.filename.lower()
            ext = "." + name_lower.rsplit(".", 1)[-1] if "." in name_lower else ""

            # Only attempt re-encode for raster media files
            if ext in _RASTER_EXTS and name_lower.startswith("ppt/media/"):
                try:
                    img = Image.open(io.BytesIO(raw))

                    # Flatten alpha channel (JPEG has no alpha)
                    if img.mode in ("RGBA", "LA", "P"):
                        bg = Image.new("RGB", img.size, (255, 255, 255))
                        bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                        img = bg
                    elif img.mode == "CMYK":
                        img = img.convert("RGB")
                    elif img.mode != "RGB":
                        img = img.convert("RGB")

                    # Skip images too small to benefit
                    if img.width * img.height >= 32 * 32:
                        enc = io.BytesIO()
                        img.save(enc, format="JPEG", quality=_PPTX_JPEG_QUALITY, optimize=True)
                        reencoded = enc.getvalue()
                        # Only use re-encoded version if it actually shrinks the entry.
                        # Keep the original filename — .rels XML references it by name,
                        # so renaming would break slide relationships.
                        if len(reencoded) < len(raw):
                            new_item = zipfile.ZipInfo(item.filename)
                            new_item.compress_type = zipfile.ZIP_DEFLATED
                            zout.writestr(new_item, reencoded)
                            continue
                except Exception as exc:
                    _log.debug("Skipped re-encoding %s: %s", item.filename, exc)

            # Verbatim copy for everything else (XML, fonts, themes, rels…)
            new_item = zipfile.ZipInfo(item.filename)
            new_item.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(new_item, raw)

    return out_path


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

        # For the repair/compress target, re-encode embedded images then repack.
        if fmt == "pptx":
            output_file = _compress_pptx_zip(output_file, job_id)

        _report(job_id, 90)
        return output_file.read_bytes()


# ---------------------------------------------------------------------------
# Internal: Pandoc conversion (txt only)
# ---------------------------------------------------------------------------

def _convert_with_pandoc(data: bytes, job_id: Optional[str]) -> bytes:
    """Convert PPTX bytes to plain text using Pandoc; return output bytes."""
    pandoc = find_pandoc()
    if not pandoc:
        raise RuntimeError(install_message("pandoc"))

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path    = Path(tmp)
        input_doc   = tmp_path / "input.pptx"
        output_file = tmp_path / "output.txt"
        input_doc.write_bytes(data)

        _report(job_id, 40)

        cmd = [
            pandoc,
            str(input_doc),
            "-t", "plain",
            "-o", str(output_file),
        ]
        _log.debug("Pandoc command: %s", " ".join(cmd))
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=_PANDOC_TIMEOUT,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Pandoc timed out after {_PANDOC_TIMEOUT} s.") from exc

        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(
                f"Pandoc exited with code {proc.returncode}."
                + (f" Details: {detail}" if detail else "")
            )

        _report(job_id, 90)

        if not output_file.exists():
            raise RuntimeError("Pandoc did not produce a .txt output file.")

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

    _all_targets = _LO_TARGETS | _PANDOC_TARGETS
    if fmt not in _all_targets:
        raise ValueError(
            f"Unsupported target format '{fmt}'. "
            f"Supported: {', '.join(sorted(_all_targets))}"
        )

    _report(job_id, 10)

    if fmt == "images":
        return _convert_to_images(data, job_id)

    if fmt in _PANDOC_TARGETS:
        return _convert_with_pandoc(data, job_id)

    return _convert_with_libreoffice(data, fmt, job_id)
