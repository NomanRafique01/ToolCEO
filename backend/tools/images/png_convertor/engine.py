"""
PNG Convertor engine — ToolCEO
==================================

Convert PNG images to other formats using Pillow (raster formats),
ImageMagick (ICO), and pytesseract (OCR → TXT).

Public API
----------
convert_png(data, target_format, job_id) -> bytes
    Convert raw PNG bytes to *target_format*.
    Returns converted bytes (or UTF-8 text bytes for 'txt').

MEDIA_TYPES  – dict mapping format key to Content-Type string.

Supported targets
-----------------
  jpg   → JPEG (quality 95)
  webp  → WEBP (quality 90)
  pdf   → PDF  (resolution 100 dpi)
  bmp   → BMP  (uncompressed)
  tiff  → TIFF
  ico   → ICO  (sizes 256×256 … 16×16, via ImageMagick)
  txt   → Plain text via Tesseract OCR
"""

from __future__ import annotations

import io
import logging
import os
import shutil
import struct
import subprocess
import tempfile
from typing import Optional

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Media types
# ---------------------------------------------------------------------------

MEDIA_TYPES: dict[str, str] = {
    "jpg":  "image/jpeg",
    "webp": "image/webp",
    "pdf":  "application/pdf",
    "bmp":  "image/bmp",
    "tiff": "image/tiff",
    "ico":  "image/x-icon",
    "txt":  "text/plain; charset=utf-8",
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
# Internal: Pillow-based conversions
# ---------------------------------------------------------------------------

def _open_png(data: bytes):
    """Open PNG bytes as a Pillow Image."""
    try:
        from PIL import Image
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install Pillow")

    buf = io.BytesIO(data)
    img = Image.open(buf)
    img.load()
    return img


def _to_jpg(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_png(data)
    _report(job_id, 50)
    # PNG may have an alpha channel — JPEG does not support it
    if img.mode in ("RGBA", "LA", "P"):
        # Flatten transparency onto white background
        bg = __import__("PIL.Image", fromlist=["Image"]).new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        if img.mode in ("RGBA", "LA"):
            bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, "JPEG", quality=95, optimize=True)
    _report(job_id, 90)
    return out.getvalue()


def _to_webp(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_png(data)
    _report(job_id, 50)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=90)
    _report(job_id, 90)
    return out.getvalue()


def _to_pdf(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_png(data)
    _report(job_id, 50)
    # PDF does not support transparency — convert to RGB
    if img.mode != "RGB":
        if img.mode in ("RGBA", "LA", "P"):
            bg = __import__("PIL.Image", fromlist=["Image"]).new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            if img.mode in ("RGBA", "LA"):
                bg.paste(img, mask=img.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, "PDF", resolution=100)
    _report(job_id, 90)
    return out.getvalue()


def _to_bmp(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_png(data)
    _report(job_id, 50)
    # BMP does not support alpha in all viewers — convert to RGB
    if img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, "BMP")
    _report(job_id, 90)
    return out.getvalue()


def _to_tiff(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_png(data)
    _report(job_id, 50)
    out = io.BytesIO()
    img.save(out, "TIFF", compression="tiff_lzw", predictor=2)
    _report(job_id, 90)
    return out.getvalue()


# ---------------------------------------------------------------------------
# ICO sizes — standard Windows icon resolutions
# ---------------------------------------------------------------------------

_ICO_SIZES = "256,128,64,48,32,24,16"


def _to_ico(data: bytes, job_id: Optional[str]) -> bytes:
    """
    Convert PNG → multi-resolution ICO using ImageMagick (primary path)
    with a pure-Pillow fallback if ImageMagick is not installed.
    """
    _report(job_id, 5)

    magick = shutil.which("magick")
    if magick:
        return _to_ico_magick(data, job_id, magick)
    _log.warning("ImageMagick (magick) not found — falling back to Pillow ICO")
    return _to_ico_pillow(data, job_id)


def _to_ico_magick(data: bytes, job_id: Optional[str], magick: str) -> bytes:
    """ImageMagick-based ICO conversion (primary path)."""
    tmp_dir = tempfile.mkdtemp(prefix="toolceo_ico_")
    try:
        src  = os.path.join(tmp_dir, "input.png")
        dest = os.path.join(tmp_dir, "output.ico")

        with open(src, "wb") as fh:
            fh.write(data)

        _report(job_id, 15)

        result = subprocess.run(
            [
                magick, src,
                "-resize", "256x256>",
                "-background", "none",
                "-gravity",    "center",
                "-extent",     "256x256",
                "-define",     f"icon:auto-resize={_ICO_SIZES}",
                dest,
            ],
            capture_output=True,
            timeout=60,
        )

        if result.returncode != 0:
            err = result.stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(f"ImageMagick ICO conversion failed: {err}")

        _report(job_id, 80)

        with open(dest, "rb") as fh:
            ico_bytes = fh.read()

        if len(ico_bytes) < 6 or ico_bytes[:4] != b"\x00\x00\x01\x00":
            raise RuntimeError("ImageMagick produced an invalid ICO file (bad magic bytes)")
        frame_count = struct.unpack_from("<H", ico_bytes, 4)[0]
        if frame_count == 0:
            raise RuntimeError("ImageMagick produced an ICO with zero frames")

        _report(job_id, 90)
        return ico_bytes

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _to_ico_pillow(data: bytes, job_id: Optional[str]) -> bytes:
    """Pure-Pillow fallback ICO conversion."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install Pillow")

    img = Image.open(io.BytesIO(data))
    img.load()
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    _report(job_id, 15)

    src_w, src_h = img.size
    if max(src_w, src_h) > 512:
        s = 512 / max(src_w, src_h)
        img = img.resize((max(1, round(src_w * s)), max(1, round(src_h * s))), Image.LANCZOS)
        src_w, src_h = img.size

    _report(job_id, 25)

    ICO_SIZES = [256, 128, 64, 48, 32, 24, 16]
    frames = []
    for i, size in enumerate(ICO_SIZES):
        scale = min(size / src_w, size / src_h)
        nw = max(1, round(src_w * scale))
        nh = max(1, round(src_h * scale))
        if size <= 48 and (src_w >= size * 4 or src_h >= size * 4):
            mid = img.resize((max(nw, round(src_w * 0.5)), max(nh, round(src_h * 0.5))), Image.BOX)
            resized = mid.resize((nw, nh), Image.LANCZOS)
        else:
            resized = img.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
        frames.append(canvas)
        _report(job_id, 25 + round((i + 1) / len(ICO_SIZES) * 55))

    def _png(frame):
        b = io.BytesIO()
        frame.save(b, format="PNG", compress_level=6)
        return b.getvalue()

    png_chunks = [_png(f) for f in frames]
    n = len(frames)
    header  = struct.pack("<HHH", 0, 1, n)
    offset  = 6 + n * 16
    entries = b""
    for frame, png in zip(frames, png_chunks):
        w, h = frame.size
        entries += struct.pack(
            "<BBBBHHII",
            0 if w >= 256 else w,
            0 if h >= 256 else h,
            0, 0, 1, 32, len(png), offset,
        )
        offset += len(png)

    ico_bytes = header + entries + b"".join(png_chunks)
    _report(job_id, 90)
    return ico_bytes


def _to_txt(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    try:
        from PIL import Image
        import pytesseract
    except ImportError as exc:
        pkg = "pytesseract" if "pytesseract" in str(exc) else "Pillow"
        raise RuntimeError(
            f"{pkg} is not installed. Run: pip install {pkg}\n"
            "Also ensure Tesseract OCR is installed: https://github.com/tesseract-ocr/tesseract"
        )

    _tess_default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.isfile(_tess_default):
        pytesseract.pytesseract.tesseract_cmd = _tess_default

    buf = io.BytesIO(data)
    img = Image.open(buf)
    img.load()
    _report(job_id, 40)
    text = pytesseract.image_to_string(img, lang="eng", config="--oem 3 --psm 6")
    _report(job_id, 90)
    return text.encode("utf-8")


# ---------------------------------------------------------------------------
# Public: merge multiple PNGs into one multi-page PDF
# ---------------------------------------------------------------------------

def merge_pngs_to_pdf(
    items:  list[tuple[bytes, str]],
    job_id: Optional[str] = None,
) -> bytes:
    """Combine multiple PNG images into a single multi-page PDF."""
    _report(job_id, 5)
    n = len(items)
    if n == 0:
        raise ValueError("No images provided for merge")

    def _rgb(data: bytes):
        from PIL import Image as _I
        buf = io.BytesIO(data)
        img = _I.open(buf)
        img.load()
        if img.mode != "RGB":
            if img.mode in ("RGBA", "LA", "P"):
                bg = _I.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                if img.mode in ("RGBA", "LA"):
                    bg.paste(img, mask=img.split()[-1])
                img = bg
            else:
                img = img.convert("RGB")
        return img

    try:
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas as rl_canvas
        pages = []
        for data, _stem in items:
            img = _rgb(data)
            w_px, h_px = img.size
            w_pt, h_pt = w_px * 72 / 96, h_px * 72 / 96
            jbuf = io.BytesIO()
            img.save(jbuf, "JPEG", quality=95)
            jbuf.seek(0)
            pages.append((jbuf, w_pt, h_pt))
        out = io.BytesIO()
        c = rl_canvas.Canvas(out, pagesize=(pages[0][1], pages[0][2]))
        for i, (buf, w_pt, h_pt) in enumerate(pages):
            _report(job_id, 5 + int((i / n) * 85))
            c.setPageSize((w_pt, h_pt))
            c.drawImage(ImageReader(buf), 0, 0, width=w_pt, height=h_pt)
            c.showPage()
        c.save()
        _report(job_id, 95)
        return out.getvalue()
    except ImportError:
        pass

    images = [_rgb(data) for data, _ in items]
    out = io.BytesIO()
    images[0].save(out, "PDF", save_all=True, append_images=images[1:], resolution=96)
    _report(job_id, 95)
    return out.getvalue()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_DISPATCH = {
    "jpg":  _to_jpg,
    "webp": _to_webp,
    "pdf":  _to_pdf,
    "bmp":  _to_bmp,
    "tiff": _to_tiff,
    "ico":  _to_ico,
    "txt":  _to_txt,
}


def convert_png(
    data:          bytes,
    target_format: str,
    job_id:        Optional[str] = None,
) -> bytes:
    """
    Convert raw PNG *data* to *target_format*.

    Parameters
    ----------
    data          : raw bytes of the source PNG image
    target_format : one of "jpg", "webp", "pdf", "bmp", "tiff", "ico", "txt"
    job_id        : optional SSE progress job id

    Returns
    -------
    Converted file as bytes.

    Raises
    ------
    ValueError   if target_format is not supported
    RuntimeError if a required dependency is missing
    """
    fn = _DISPATCH.get(target_format)
    if fn is None:
        raise ValueError(
            f"Unsupported target format '{target_format}'. "
            f"Supported: {', '.join(_DISPATCH)}"
        )
    return fn(data, job_id)
