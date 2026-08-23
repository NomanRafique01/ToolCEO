"""
PDF → PPT (PowerPoint) conversion engine — ToolCEO
====================================================

Conversion strategy: PyMuPDF image rendering + python-pptx slide assembly
---------------------------------------------------------------------------
Each PDF page is rendered as a high-resolution raster image (150–200 DPI)
using PyMuPDF (fitz), then inserted as a full-bleed image onto a matching
PowerPoint slide using python-pptx.

Slide dimensions
-----------------
Slide size is determined from the first PDF page aspect ratio:
  - If the page is roughly 16:9 (landscape, ±10 %) → use widescreen  (13.333 × 7.5 in)
  - If the page is roughly 4:3  (landscape, ±10 %) → use standard    (10 × 7.5 in)
  - Otherwise → exact match to the PDF page aspect ratio at 10 in wide

This avoids black bars on most document types.

DPI
----
Each page is rendered at 150 DPI by default (good quality, reasonable size).
200 DPI is used when the PDF page is small (< 400 pt on the long side) to ensure
slide images look crisp on high-DPI displays.

docProps/thumbnail.jpeg — intentionally removed
------------------------------------------------
python-pptx embeds a blank placeholder thumbnail at ``docProps/thumbnail.jpeg``
by default.  We strip that entry from the ZIP entirely so the OS shell
(Windows Explorer, macOS Finder) falls back to the **registered application
icon** for ``.pptx`` files — the PowerPoint icon on systems with MS Office,
the LibreOffice Impress icon on systems with LibreOffice, etc.  This matches
exactly what the PDF → Word tool produces (LibreOffice DOCX output has no
embedded thumbnail either).

Progress events (SSE-compatible, same as other tools)
------------------------------------------------------
  10 %              – starting / opening PDF
  10 % → 90 %      – per-page render+insert (evenly distributed across pages)
  95 %              – PPTX assembled, thumbnail stripped, writing bytes
  100 %             – done (set_done called by router)

Public API
----------
get_pdf_info(data, password)
    Returns page_count, file_size, and a base64 JPEG thumbnail of the first page.

convert_pdf_to_ppt(data, password, job_id)
    Returns PPTX bytes with no embedded thumbnail so the OS shows the default
    application icon for .pptx files.
"""

from __future__ import annotations

import base64
import io
import logging
import zipfile
from typing import Optional

# Entry name python-pptx always writes; we strip it so the OS falls back
# to the registered application icon for .pptx files.
_THUMB_ENTRY = "docProps/thumbnail.jpeg"

import fitz  # PyMuPDF

_log = logging.getLogger(__name__)

# Inches per PDF point  (1 pt = 1/72 in)
_PT_TO_IN = 1.0 / 72.0

# Standard widescreen 16:9 slide dimensions (inches)
_WIDE_W = 13.333
_WIDE_H = 7.5

# Standard 4:3 slide dimensions (inches)
_STD_W = 10.0
_STD_H = 7.5


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
# PDF info (same shape as other tools — reused by frontend)
# ---------------------------------------------------------------------------

def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """
    Returns:
        { "page_count": int, "file_size": int, "thumbnail": "data:image/jpeg;base64,..." }
    """
    doc = _open(data, password)
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

def _open(data: bytes, password: Optional[str] = None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError("This PDF is password-protected. Supply a password.")
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


def _slide_dims(page_w_pt: float, page_h_pt: float) -> tuple[float, float]:
    """
    Return (width_in, height_in) for the PowerPoint slide that best matches
    the PDF page aspect ratio.

    Matching rules (applied to the PDF page, regardless of orientation):
      1. If aspect ≈ 16/9  (±12 %)  → widescreen  13.333 × 7.5 in
      2. If aspect ≈ 4/3   (±12 %)  → standard    10.0   × 7.5 in
      3. Otherwise → exact match at 10 in wide (landscape) or 7.5 in tall (portrait)
    """
    if page_h_pt == 0:
        return _WIDE_W, _WIDE_H

    aspect = page_w_pt / page_h_pt
    WIDE_RATIO = 16 / 9   # ≈ 1.778
    STD_RATIO  = 4  / 3   # ≈ 1.333
    TOL = 0.12

    if abs(aspect - WIDE_RATIO) / WIDE_RATIO <= TOL:
        return _WIDE_W, _WIDE_H
    if abs(aspect - STD_RATIO) / STD_RATIO <= TOL:
        return _STD_W, _STD_H

    # Exact match: constrain longest side to 10 in
    if aspect >= 1.0:
        # landscape
        slide_w = 10.0
        slide_h = 10.0 / aspect
    else:
        # portrait
        slide_h = 10.0
        slide_w = 10.0 * aspect

    return slide_w, slide_h


def _render_page(page: fitz.Page, dpi: int = 150) -> bytes:
    """Render a single PDF page to JPEG bytes at the requested DPI."""
    scale = dpi / 72.0
    mat   = fitz.Matrix(scale, scale)
    pix   = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)
    return pix.tobytes("jpeg", jpg_quality=92)


def _strip_thumbnail(pptx_bytes: bytes) -> bytes:
    """
    Remove ``docProps/thumbnail.jpeg`` from the PPTX ZIP.

    python-pptx always writes a blank placeholder thumbnail.  Stripping it
    causes the OS shell to fall back to the registered application icon for
    ``.pptx`` files — PowerPoint icon with MS Office installed, LibreOffice
    Impress icon with LibreOffice installed.  This is the same behaviour as
    LibreOffice-produced DOCX files (no embedded thumbnail → app icon shown).

    Also removes the relationship entry that references the thumbnail so the
    file remains strictly valid and opens cleanly in all applications.
    """
    THUMB = _THUMB_ENTRY  # "docProps/thumbnail.jpeg"

    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(pptx_bytes), "r") as zin:
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == THUMB:
                    continue  # drop the thumbnail entry entirely
                data = zin.read(item.filename)
                # Also scrub the thumbnail relationship from _rels/.rels so
                # the PPTX is structurally clean (no dangling rel reference).
                if item.filename == "_rels/.rels":
                    data = _remove_thumb_rel(data)
                zout.writestr(item, data)
    return out.getvalue()


def _remove_thumb_rel(rels_xml: bytes) -> bytes:
    """
    Strip the Relationship element that points to ``docProps/thumbnail.jpeg``
    (with or without a leading ``../``) from the package-level ``_rels/.rels``
    XML bytes.

    Uses a simple regex approach (no XML parser dependency) that is safe for
    the well-known format python-pptx produces.
    """
    import re
    # Match the full <Relationship ... Target="[../]docProps/thumbnail.jpeg" ... />
    # covering any attribute ordering and optional ../ prefix.
    pattern = (
        rb'<Relationship\s[^>]*?'
        rb'Target=["\'](?:\.\.\/)?docProps\/thumbnail\.jpeg["\'][^>]*?/?>'
    )
    cleaned = re.sub(pattern, b"", rels_xml, flags=re.DOTALL)
    return cleaned


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_pdf_to_ppt(
    data: bytes,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert PDF bytes → PPTX bytes.

    Each PDF page becomes one PowerPoint slide.  The slide size is chosen to
    match the first page's aspect ratio.  Every page is rendered at 150–200 DPI
    and placed as a full-bleed image with no margins.

    Progress milestones
    -------------------
    10 %       – PDF opened
    10 % → 90 % – per-page render + slide insert
    95 %       – PPTX buffer written (router bumps to 100 via set_done)
    """
    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
    except ImportError as exc:
        raise RuntimeError(
            "python-pptx is not installed.  "
            "Run: pip install python-pptx"
        ) from exc

    _report(job_id, 10)

    doc = _open(data, password)
    total = doc.page_count
    if total == 0:
        doc.close()
        raise ValueError("The PDF has no pages.")

    # ── Determine slide dimensions from the first page ────────────────────────
    first_page = doc[0]
    rect       = first_page.rect           # fitz.Rect in PDF points
    page_w_pt  = rect.width
    page_h_pt  = rect.height
    slide_w_in, slide_h_in = _slide_dims(page_w_pt, page_h_pt)

    # ── Decide render DPI ─────────────────────────────────────────────────────
    # Small pages (e.g. slides originally at 720×540 pt = 10×7.5 in) get 200 DPI
    long_side_pt = max(page_w_pt, page_h_pt)
    dpi = 200 if long_side_pt < 500 else 150

    # ── Build the Presentation ────────────────────────────────────────────────
    prs = Presentation()
    prs.slide_width  = Inches(slide_w_in)
    prs.slide_height = Inches(slide_h_in)

    # Use the completely blank layout (no placeholders)
    blank_layout = prs.slide_layouts[6]

    for pno in range(total):
        # Progress: spread 10 % → 90 % evenly across pages
        pct = 10 + int(80 * (pno / total))
        _report(job_id, pct)

        page      = doc[pno]
        img_bytes = _render_page(page, dpi)

        slide = prs.slides.add_slide(blank_layout)
        pic   = slide.shapes.add_picture(
            io.BytesIO(img_bytes),
            left   = 0,
            top    = 0,
            width  = prs.slide_width,
            height = prs.slide_height,
        )
        # Ensure the image is at the back (z-order 0)
        slide.shapes._spTree.remove(pic._element)
        slide.shapes._spTree.insert(2, pic._element)

    doc.close()

    _report(job_id, 95)

    # ── Serialise, then strip the blank thumbnail python-pptx embeds ─────────
    buf = io.BytesIO()
    prs.save(buf)
    pptx_bytes = buf.getvalue()

    # Remove docProps/thumbnail.jpeg so the OS falls back to the registered
    # application icon (.pptx → PowerPoint or LibreOffice Impress icon).
    try:
        pptx_bytes = _strip_thumbnail(pptx_bytes)
    except Exception as exc:
        _log.warning("Could not strip thumbnail from PPTX: %s", exc)

    return pptx_bytes
