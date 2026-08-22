"""
PDF image extractor engine.

Runs fully offline with PyMuPDF:
  get_pdf_info       - validate PDF bytes and render a first-page thumbnail
  extract_images_zip - extract embedded images from all or selected pages as PNGs
"""

from __future__ import annotations

import base64
import io
import zipfile
from typing import Callable, Optional, Sequence

import fitz  # PyMuPDF
from PIL import Image, ImageStat


ProgressCallback = Callable[[int], None]
MIN_IMAGE_EDGE = 48
MIN_IMAGE_PIXELS = 4096
MIN_SHARPNESS_VARIANCE = 18.0
MAX_QUALITY_SAMPLES = 20


def _looks_like_pdf(data: bytes) -> bool:
    return bool(data) and b"%PDF-" in data[:1024]


def _open_bytes(data: bytes, password: Optional[str] = None) -> fitz.Document:
    if not _looks_like_pdf(data):
        raise ValueError("Invalid File Format. Please select a valid PDF file.")

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc

    if doc.page_count < 1:
        doc.close()
        raise ValueError("PDF has no pages to extract images from.")

    if doc.needs_pass:
        if not password:
            doc.close()
            raise ValueError("This PDF is password-protected. Supply a password to extract images.")
        if not doc.authenticate(password):
            doc.close()
            raise ValueError("Incorrect password for encrypted PDF.")

    return doc


def _normalize_pages(page_count: int, pages: Optional[Sequence[int]]) -> list[int]:
    if not pages:
        return list(range(page_count))

    normalized: list[int] = []
    seen: set[int] = set()
    for page in pages:
        page_num = int(page)
        if page_num < 1 or page_num > page_count:
            raise ValueError(f"Page {page_num} is out of range. PDF has {page_count} pages.")
        index = page_num - 1
        if index not in seen:
            seen.add(index)
            normalized.append(index)

    if not normalized:
        raise ValueError("Select at least one page to extract images from.")

    return normalized


def _pixmap_to_png(doc: fitz.Document, xref: int) -> bytes:
    pix = fitz.Pixmap(doc, xref)
    try:
        try:
            return pix.tobytes("png")
        except (RuntimeError, ValueError) as original_exc:
            converted = None
            try:
                converted = fitz.Pixmap(fitz.csRGB, pix)
                return converted.tobytes("png")
            except Exception:
                png = _pixmap_to_png_with_pillow(pix)
                if png is not None:
                    return png
                raise ValueError(f"Could not convert embedded image {xref} to PNG: {original_exc}") from original_exc
            finally:
                converted = None
    finally:
        pix = None


def _pixmap_to_png_with_pillow(pix: fitz.Pixmap) -> Optional[bytes]:
    cs = pix.colorspace
    components = pix.n - int(bool(pix.alpha))

    if cs is None or components < 1:
        return None

    if components == 1:
        mode = "L"
    elif components == 3:
        mode = "RGB"
    elif components == 4:
        mode = "CMYK"
    else:
        return None

    raw = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
    if mode == "CMYK":
        raw = raw.convert("RGB")
    elif mode == "L":
        raw = raw.convert("RGB")

    out = io.BytesIO()
    raw.save(out, format="PNG")
    return out.getvalue()


def _pixmap_to_pil_image(doc: fitz.Document, xref: int) -> Optional[Image.Image]:
    pix = fitz.Pixmap(doc, xref)
    converted = None
    try:
        src = pix
        if pix.alpha or pix.colorspace is None or pix.n not in (1, 3):
            converted = fitz.Pixmap(fitz.csRGB, pix)
            src = converted

        mode = "L" if src.n == 1 else "RGB"
        return Image.frombytes(mode, (src.width, src.height), src.samples)
    except Exception:
        return None
    finally:
        pix = None
        converted = None


def _sharpness_variance(image: Image.Image) -> float:
    sample = image.convert("L")
    sample.thumbnail((256, 256))
    return float(ImageStat.Stat(sample).var[0])


def _inspect_image_quality(doc: fitz.Document) -> dict:
    seen: set[int] = set()
    image_count = 0
    small_count = 0
    blurry_count = 0
    checked_count = 0

    for page in doc:
        for image_info in page.get_images(full=True):
            xref = int(image_info[0])
            if xref in seen:
                continue
            seen.add(xref)
            image_count += 1

            width = int(image_info[2] or 0)
            height = int(image_info[3] or 0)
            if min(width, height) < MIN_IMAGE_EDGE or (width * height) < MIN_IMAGE_PIXELS:
                small_count += 1
                continue

            image = _pixmap_to_pil_image(doc, xref)
            if image is None:
                continue

            checked_count += 1
            if _sharpness_variance(image) < MIN_SHARPNESS_VARIANCE:
                blurry_count += 1
                if checked_count >= MAX_QUALITY_SAMPLES:
                    break
                continue

            return {
                "has_usable_images": True,
                "image_count": image_count,
                "reason": None,
                "message": None,
            }
        if checked_count >= MAX_QUALITY_SAMPLES:
            break

    if image_count == 0:
        reason = "no_images"
        message = "No embedded images were found in this PDF."
    elif small_count == image_count:
        reason = "no_usable_images"
        message = "Only tiny embedded images were found, so there is nothing useful to extract."
    elif checked_count > 0 and blurry_count >= checked_count:
        reason = "images_too_blurry"
        message = "The embedded images are too blurry or low quality to extract cleanly."
    else:
        reason = "no_usable_images"
        message = "No usable embedded images were found in this PDF."

    return {
        "has_usable_images": False,
        "image_count": image_count,
        "reason": reason,
        "message": message,
    }


def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Return page count and first-page thumbnail for preview flows.

    Response shape mirrors the other PDF tool info endpoints.
    """
    doc = _open_bytes(data, password)
    page_count = doc.page_count
    image_status = _inspect_image_quality(doc)

    page = doc[0]
    mat = fitz.Matrix(3.0, 3.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    jpeg = pix.tobytes("jpeg", jpg_quality=92)
    doc.close()

    b64 = base64.b64encode(jpeg).decode("ascii")
    return {
        "page_count": page_count,
        "thumbnail": f"data:image/jpeg;base64,{b64}",
        "image_status": image_status,
    }


def extract_images_zip(
    data: bytes,
    pages: Optional[Sequence[int]] = None,
    password: Optional[str] = None,
    source_filename: Optional[str] = None,
    progress: Optional[ProgressCallback] = None,
) -> bytes:
    """
    Extract all embedded images referenced by all or selected 1-based pages.

    The returned ZIP contains PNG files named:
      image_<n>.png
    """
    doc = _open_bytes(data, password)
    page_indices = _normalize_pages(doc.page_count, pages)

    out = io.BytesIO()
    image_total = 0

    try:
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            total_pages = len(page_indices)
            for pos, page_index in enumerate(page_indices, start=1):
                page = doc[page_index]
                page_images = page.get_images(full=True)

                for image_info in page_images:
                    xref = int(image_info[0])
                    png = _pixmap_to_png(doc, xref)
                    image_total += 1
                    zf.writestr(
                        f"image_{image_total}.png",
                        png,
                    )

                if progress:
                    pct = 10 + int((pos / total_pages) * 85)
                    progress(min(95, max(10, pct)))

            if image_total == 0:
                raise ValueError("No embedded images were found in the selected PDF pages.")
    finally:
        doc.close()

    out.seek(0)
    return out.read()
