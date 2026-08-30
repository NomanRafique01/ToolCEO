"""
JPG Convertor engine — ToolCEO
==================================

Convert JPG/JPEG images to other formats using Pillow (raster formats)
and pytesseract (OCR → TXT).

Public API
----------
convert_jpg(data, target_format, job_id) -> bytes
    Convert raw JPG bytes to *target_format*.
    Returns converted bytes (or UTF-8 text bytes for 'txt').

merge_jpgs_to_pdf(items, job_id) -> bytes
    Merge a list of (raw_bytes, stem) pairs into a single multi-page PDF.

MEDIA_TYPES  – dict mapping format key to Content-Type string.

Supported targets
-----------------
  png   → PNG
  webp  → WEBP (quality 90)
  pdf   → PDF  (resolution 100 dpi)
  bmp   → BMP
  tiff  → TIFF
  ico   → ICO  (sizes 256×256 … 16×16)
  gif   → GIF  (palette-quantised)
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
    "png":  "image/png",
    "webp": "image/webp",
    "pdf":  "application/pdf",
    "bmp":  "image/bmp",
    "tiff": "image/tiff",
    "ico":  "image/x-icon",
    "gif":  "image/gif",
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

def _open_jpg(data: bytes):
    """Open JPG bytes and return an RGB Pillow Image."""
    try:
        from PIL import Image
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install Pillow")

    buf = io.BytesIO(data)
    img = Image.open(buf)
    img.load()
    # Convert to RGB — JPEG source may be CMYK or L
    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def _guess_jpg_quality(data: bytes) -> int:
    """
    Estimate the source JPEG's quality (1-95) so lossy output formats
    can target a comparable file size instead of a fixed high quality.
    Falls back to 82 (a mid-range perceptual quality) if detection fails.
    """
    try:
        from PIL import Image
        buf = io.BytesIO(data)
        img = Image.open(buf)
        img.load()
        # Pillow stores the quantization tables; we use them to estimate quality
        qt = getattr(img, "quantization", None)
        if qt and 0 in qt:
            # Mean of the first quantization table values (lower = higher quality)
            mean_q = sum(qt[0]) / len(qt[0])
            # Empirical mapping: mean_q ~2 → quality 95, mean_q ~40 → quality 50
            quality = max(1, min(95, int(100 - mean_q * 1.25)))
            return quality
    except Exception:
        pass
    return 82


def _to_png(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_jpg(data)
    _report(job_id, 50)
    out = io.BytesIO()
    # Re-encode with a quality close to the source JPEG's quality so the PNG
    # output does not balloon to a full lossless size.
    # Strategy: save as JPEG at matched quality into a buffer, then re-open and
    # save as PNG — this gives a PNG whose pixel data has the same level of
    # detail (and similar file weight) as the original JPEG.
    try:
        quality = _guess_jpg_quality(data)
        mid = io.BytesIO()
        img.save(mid, "JPEG", quality=quality, optimize=True)
        mid.seek(0)
        from PIL import Image as _Image
        img2 = _Image.open(mid)
        img2.load()
        img2.save(out, "PNG", optimize=True, compress_level=9)
    except Exception:
        img.save(out, "PNG", optimize=True, compress_level=9)
    _report(job_id, 90)
    return out.getvalue()


def _to_webp(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_jpg(data)
    _report(job_id, 50)
    out = io.BytesIO()
    # Match source JPEG quality so output size is close to the original
    quality = _guess_jpg_quality(data)
    # method=6 → best WebP encoder pass for smaller files
    img.save(out, "WEBP", quality=quality, method=6)
    _report(job_id, 90)
    return out.getvalue()


def _to_pdf(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    # Embed the original JPEG bytes directly into the PDF instead of re-encoding.
    # This preserves the exact source quality and keeps the PDF close to the
    # original JPG size (no decode-then-re-encode bloat).
    try:
        from PIL import Image
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas as rl_canvas

        buf = io.BytesIO(data)
        img = Image.open(buf)
        img.load()
        w_px, h_px = img.size
        # Use 96 DPI as the display resolution → natural page size in points
        dpi = 96
        w_pt = w_px * 72 / dpi
        h_pt = h_px * 72 / dpi

        out = io.BytesIO()
        c = rl_canvas.Canvas(out, pagesize=(w_pt, h_pt))
        buf.seek(0)
        c.drawImage(ImageReader(buf), 0, 0, width=w_pt, height=h_pt)
        c.save()
        _report(job_id, 90)
        return out.getvalue()
    except ImportError:
        # reportlab not installed — fall back to Pillow (still works, slightly larger)
        pass

    _report(job_id, 20)
    img = _open_jpg(data)
    _report(job_id, 50)
    out = io.BytesIO()
    # resolution=0 lets Pillow read the DPI from the JPEG header (preserves sizing)
    dpi_info = img.info.get("dpi") or img.info.get("jfif_density")
    res = dpi_info[0] if isinstance(dpi_info, (tuple, list)) and dpi_info[0] > 0 else 96
    img.save(out, "PDF", resolution=res)
    _report(job_id, 90)
    return out.getvalue()


def _to_bmp(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_jpg(data)
    _report(job_id, 50)
    out = io.BytesIO()
    # BMP is inherently uncompressed — size is always width × height × 3 bytes
    img.save(out, "BMP")
    _report(job_id, 90)
    return out.getvalue()


def _to_tiff(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    img = _open_jpg(data)
    _report(job_id, 50)
    out = io.BytesIO()
    # Use JPEG compression inside TIFF at the source quality — gives output
    # sizes close to the original JPG. LZW on photographic content performs
    # poorly (often 5-10× larger than the source JPEG).
    quality = _guess_jpg_quality(data)
    img.save(out, "TIFF", compression="jpeg", quality=quality)
    _report(job_id, 90)
    return out.getvalue()


# ---------------------------------------------------------------------------
# ICO sizes — standard Windows icon resolutions
# ---------------------------------------------------------------------------

_ICO_SIZES = "256,128,64,48,32,24,16"


def _to_ico(data: bytes, job_id: Optional[str]) -> bytes:
    """
    Convert JPG → multi-resolution ICO using ImageMagick.

    Pipeline
    --------
    1. Write the source JPG to a temp file.
    2. Run ImageMagick (``magick``) with:
         -thumbnail 256x256>   — proportional fit, never upscale above 256
         -background none      — transparent fill colour
         -gravity center       — centre the image inside the square canvas
         -extent 256x256       — letter-box / pillar-box to a square with
                                  transparent padding (never crops the image)
         -define icon:auto-resize=256,128,64,48,32,24,16
                               — embed all 7 standard Windows icon sizes
    3. Read the resulting .ico back and return bytes.
    4. Fall back to a pure-Pillow implementation if ImageMagick is not found.

    ImageMagick stores each frame as a raw 32-bpp DIB inside the ICO container
    — the most compatible format, recognised by every Windows version, macOS,
    and modern browsers.

    Output: valid multi-resolution .ico, 7 sizes (16–256 px), 32-bpp.
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
        src  = os.path.join(tmp_dir, "input.jpg")
        dest = os.path.join(tmp_dir, "output.ico")

        with open(src, "wb") as fh:
            fh.write(data)

        _report(job_id, 15)

        # -thumbnail 256x256>   fit proportionally, never upscale past 256
        # -background none      transparent fill
        # -gravity center       centre the image in the square
        # -extent 256x256       expand canvas to square with transparent padding
        # icon:auto-resize      embed all 7 sizes in one pass
        result = subprocess.run(
            [
                magick, src,
                "-thumbnail", "256x256>",
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

        # Sanity-check: valid ICO magic and at least one frame
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
    """
    Pure-Pillow fallback ICO conversion.

    Used only when ImageMagick is not installed.  Produces a PNG-in-ICO file
    (32-bpp, 7 standard sizes) with proportional scaling and transparent
    padding for non-square sources.
    """
    try:
        from PIL import Image, ImageOps
    except ImportError:
        raise RuntimeError("Pillow is not installed.  Run: pip install Pillow")

    # Open and EXIF-correct
    img = Image.open(io.BytesIO(data))
    img.load()
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    _report(job_id, 15)

    # Pre-scale large sources to ≤512 px (largest ICO frame is 256 px)
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

    # Manually assemble ICO (PNG-in-ICO, 32-bpp)
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


def _to_gif(data: bytes, job_id: Optional[str]) -> bytes:
    _report(job_id, 20)
    try:
        from PIL import Image
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install Pillow")

    buf = io.BytesIO(data)
    img = Image.open(buf)
    img.load()
    _report(job_id, 50)
    out = io.BytesIO()
    img.convert("P", palette=Image.ADAPTIVE).save(out, "GIF")
    _report(job_id, 90)
    return out.getvalue()


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

    # Point pytesseract at the Tesseract binary explicitly (handles cases
    # where Tesseract is installed but not yet on the system PATH).
    import os
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
# Public: merge multiple JPGs into one multi-page PDF
# ---------------------------------------------------------------------------

def merge_jpgs_to_pdf(
    items:  list[tuple[bytes, str]],   # [(raw_jpg_bytes, stem), ...]
    job_id: Optional[str] = None,
) -> bytes:
    """
    Combine multiple JPG images into a single multi-page PDF.

    Each image becomes one page sized exactly to the image's pixel dimensions
    (at 96 DPI so the page is a natural display size).

    Returns the PDF as bytes.
    """
    _report(job_id, 5)
    n = len(items)
    if n == 0:
        raise ValueError("No images provided for merge")

    try:
        from PIL import Image
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas as rl_canvas

        # Pre-read all images so we know each page size up front
        pages: list[tuple[io.BytesIO, float, float]] = []
        for data, _stem in items:
            buf = io.BytesIO(data)
            img = Image.open(buf)
            img.load()
            w_px, h_px = img.size
            dpi  = 96
            w_pt = w_px * 72 / dpi
            h_pt = h_px * 72 / dpi
            buf.seek(0)
            pages.append((buf, w_pt, h_pt))

        out = io.BytesIO()
        # Create canvas sized to the first page
        c = rl_canvas.Canvas(out, pagesize=(pages[0][1], pages[0][2]))

        for i, (buf, w_pt, h_pt) in enumerate(pages):
            pct = 5 + int((i / n) * 85)
            _report(job_id, pct)
            # Set correct page size for this page, draw image, then commit the page
            c.setPageSize((w_pt, h_pt))
            c.drawImage(ImageReader(buf), 0, 0, width=w_pt, height=h_pt)
            c.showPage()

        c.save()
        _report(job_id, 95)
        return out.getvalue()

    except ImportError:
        # reportlab not available — fall back to Pillow's PDF save (single-page chunks stitched)
        pass

    # Pillow fallback: save first image as PDF, then append remaining as extra pages
    # Pillow's PDF writer supports multi-page via the append_images parameter
    from PIL import Image  # noqa: PLC0415 — safe re-import after ImportError above
    _report(job_id, 10)
    images = []
    for data, _stem in items:
        buf = io.BytesIO(data)
        img = Image.open(buf)
        img.load()
        if img.mode != "RGB":
            img = img.convert("RGB")
        images.append(img)

    out = io.BytesIO()
    images[0].save(
        out, "PDF",
        save_all=True,
        append_images=images[1:],
        resolution=96,
    )
    _report(job_id, 95)
    return out.getvalue()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_DISPATCH = {
    "png":  _to_png,
    "webp": _to_webp,
    "pdf":  _to_pdf,
    "bmp":  _to_bmp,
    "tiff": _to_tiff,
    "ico":  _to_ico,
    "gif":  _to_gif,
    "txt":  _to_txt,
}


def convert_jpg(
    data:          bytes,
    target_format: str,
    job_id:        Optional[str] = None,
) -> bytes:
    """
    Convert raw JPG *data* to *target_format*.

    Parameters
    ----------
    data          : raw bytes of the source JPG/JPEG image
    target_format : one of "png", "webp", "pdf", "bmp", "tiff", "ico", "gif", "txt"
    job_id        : optional SSE progress job id

    Returns
    -------
    bytes — converted file bytes (UTF-8 text bytes for 'txt')

    Raises
    ------
    ValueError   — unsupported target format
    RuntimeError — missing engine (Pillow / pytesseract)
    """
    fmt = target_format.lower().lstrip(".")
    _report(job_id, 10)

    fn = _DISPATCH.get(fmt)
    if fn is None:
        raise ValueError(
            f"Unsupported target format '{fmt}'. "
            f"Supported: {', '.join(_DISPATCH)}"
        )
    return fn(data, job_id)
