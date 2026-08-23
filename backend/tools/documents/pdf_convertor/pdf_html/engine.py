"""
PDF → HTML conversion engine — ToolCEO
=======================================

Conversion engine: LibreOffice headless
-----------------------------------------
Uses ``soffice --headless --convert-to html <input.pdf> --outdir <outdir>``

LibreOffice reads the PDF's layout via its built-in PDF import filter and
produces a single self-contained HTML file.  No extra binary needed — the
same LibreOffice already used by pdf_word is reused here.

Post-processing (html_postprocess)
------------------------------------
Because LibreOffice's PDF import filter has no knowledge of semantic
structure, the raw HTML output needs several cleanup passes:

  1. Heading detection   — <p><b>N. Text</b></p> → <h2>, <p><b>N.M …</b></p> → <h3>
  2. Table reconstruction — grids of consecutive same-width <p> rows → <table>
  3. Short-fragment merge — consecutive very-short <p> tags that belong to
     one logical inline flow (e.g. "PDF ", "→", " Word") → merged <p>
  4. Paragraph join       — consecutive continuation lines that are
     really one paragraph → joined into a single <p>

Cross-platform binary resolution
----------------------------------
Delegates entirely to :func:`platform_tools.find_libreoffice`, which handles
all three platforms (Windows, macOS, Linux) — same as pdf_word.

Scanned / image-only PDFs
---------------------------
Before conversion every page is checked for extractable text via PyMuPDF.
If the PDF has no text layer:

  1. If Tesseract OCR is available, each page is run through OCR to produce a
     searchable PDF with an invisible text overlay, then that is fed into
     LibreOffice.
  2. If Tesseract is NOT available the original PDF is still converted but a
     ``scanned_warning`` is logged so the caller can surface a message.

Progress events (SSE-compatible)
---------------------------------
  10 %  starting / scanned-PDF detection
  20-48% OCR pre-pass (scanned PDFs only, when Tesseract is available)
  50 %  LibreOffice conversion started
  90 %  reading + post-processing HTML
  95 %  done (router bumps to 100 via set_done)

Public API
----------
get_pdf_info(data, password)
    Returns page_count, file_size, and a base64 JPEG thumbnail.

convert_pdf_to_html(data, password, job_id)
    Returns the cleaned HTML bytes (UTF-8).
"""

from __future__ import annotations

import base64
import io
import logging
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

from platform_tools import find_libreoffice, find_tesseract, install_message

_log = logging.getLogger(__name__)

# Subprocess timeout for LibreOffice conversion (seconds).
_LO_TIMEOUT = 300


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
# PDF info (same shape as other tools)
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


def _is_scanned(doc: fitz.Document) -> bool:
    """Return True if the PDF has no extractable text on any page."""
    for page in doc:
        if page.get_text("text").strip():
            return False
    return True


def _ocr_to_searchable_pdf(
    doc: fitz.Document,
    job_id: Optional[str],
) -> Optional[bytes]:
    """
    Render every page to PNG, run Tesseract, return a searchable PDF.
    Returns None if Tesseract is unavailable.
    """
    tesseract_cmd = find_tesseract()
    if not tesseract_cmd:
        _log.warning("Tesseract not found — skipping OCR pre-pass for scanned PDF")
        return None

    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        _log.warning("pytesseract/Pillow not importable — skipping OCR pre-pass")
        return None

    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    total = max(1, doc.page_count)
    page_pdfs: list[bytes] = []

    for pno in range(total):
        # Report OCR progress: 20 % → 48 %
        ocr_pct = 20 + int(28 * (pno / total))
        _report(job_id, ocr_pct)

        page = doc[pno]
        mat  = fitz.Matrix(300 / 72, 300 / 72)
        pix  = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
        img  = Image.open(io.BytesIO(pix.tobytes("png")))

        page_pdf = pytesseract.image_to_pdf_or_hocr(img, extension="pdf", lang="eng")
        page_pdfs.append(page_pdf)

    merged = fitz.open()
    for ppdf in page_pdfs:
        tmp_doc = fitz.open("pdf", ppdf)
        merged.insert_pdf(tmp_doc)
        tmp_doc.close()

    buf = io.BytesIO()
    merged.save(buf)
    merged.close()
    buf.seek(0)
    return buf.read()


def _run_libreoffice_html(soffice: str, input_path: Path, out_dir: Path) -> None:
    """
    Call LibreOffice headless to convert input_path → HTML in out_dir.
    Raises RuntimeError with captured stderr on failure.
    """
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--nofirststartwizard",
        "--convert-to", "html",
        "--outdir", str(out_dir),
        str(input_path),
    ]
    _log.debug("LibreOffice HTML command: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_LO_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"LibreOffice timed out after {_LO_TIMEOUT} s. "
            "The PDF may be very large or damaged."
        ) from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"LibreOffice exited with code {proc.returncode}. "
            + (f"Details: {detail}" if detail else "No details captured.")
        )


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_pdf_to_html(
    data: bytes,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert PDF bytes → HTML bytes via LibreOffice headless.

    Progress milestones
    -------------------
    10 %   starting / scanned-PDF detection
    20-48% OCR pre-pass (scanned PDFs only, when Tesseract available)
    50 %   LibreOffice conversion started
    90 %   reading output HTML
    95 %   done (router bumps to 100 via set_done)
    """
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 10)

    doc = _open(data, password)
    scanned = _is_scanned(doc)
    pdf_to_convert = data
    scanned_no_ocr = False

    if scanned:
        _log.info("Scanned/image-only PDF detected — attempting OCR pre-pass")
        _report(job_id, 20)
        ocr_pdf_bytes = _ocr_to_searchable_pdf(doc, job_id)
        if ocr_pdf_bytes:
            pdf_to_convert = ocr_pdf_bytes
            _log.info("OCR pre-pass complete; feeding searchable PDF to LibreOffice")
        else:
            scanned_no_ocr = True
            _log.warning(
                "OCR unavailable; proceeding with original scanned PDF. "
                "Output may be incomplete."
            )

    doc.close()

    _report(job_id, 50)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        input_pdf = tmp_path / "input.pdf"
        input_pdf.write_bytes(pdf_to_convert)

        _run_libreoffice_html(soffice, input_pdf, tmp_path)

        # LibreOffice names the output after the input stem
        output_html = tmp_path / "input.html"
        if not output_html.exists():
            candidates = list(tmp_path.glob("*.html"))
            if not candidates:
                raise RuntimeError(
                    "LibreOffice did not produce an .html output file. "
                    "Check that the PDF is not corrupted or password-protected."
                )
            output_html = candidates[0]

        _report(job_id, 90)
        raw_html = output_html.read_bytes().decode("utf-8", errors="replace")

    if scanned_no_ocr:
        _log.warning(
            "Converted scanned PDF without OCR. Text content may be missing. "
            "Install Tesseract OCR for full text extraction from scanned PDFs."
        )

    cleaned_html = html_postprocess(raw_html)
    _report(job_id, 95)
    return cleaned_html.encode("utf-8")


# ---------------------------------------------------------------------------
# HTML post-processing
# ---------------------------------------------------------------------------

def html_postprocess(html: str) -> str:
    """
    Clean up LibreOffice's raw PDF→HTML output.

    Passes (in order):
      1. Heading promotion       — numbered all-bold <p> → <h2>/<h3>
      2. Table reconstruction    — grid runs of same-width <p> rows → <table>
         (must run BEFORE the merge passes so table cells aren't merged away)
      3. Short-fragment merge    — inline flow split across short <p> tags → one <p>
      4. Paragraph join          — continuation lines in a paragraph → one <p>
    """
    try:
        from bs4 import BeautifulSoup, NavigableString, Tag
    except ImportError:
        _log.warning("beautifulsoup4 not installed — skipping HTML post-processing")
        return html

    soup = BeautifulSoup(html, "lxml")
    body = soup.body or soup

    # ── Pass 1: Heading promotion ─────────────────────────────────────────────
    # Promote <p><b>N. …</b></p> to <h2> and <p><b>N.M …</b></p> to <h3>.
    # Only fires when the ENTIRE non-whitespace content of the <p> is bold.
    _H2_RE = re.compile(r"^\d+\.\s+\S")
    _H3_RE = re.compile(r"^\d+\.\d+\s+\S")

    for p in list(body.find_all("p")):
        sig_children = [
            c for c in p.children
            if not (isinstance(c, NavigableString) and not c.strip())
        ]
        if not sig_children:
            continue
        all_bold = all(
            isinstance(c, Tag) and c.name in ("b", "strong")
            for c in sig_children
        )
        if not all_bold:
            continue
        text = p.get_text(strip=True)
        if _H3_RE.match(text):
            p.name = "h3"
        elif _H2_RE.match(text):
            p.name = "h2"
        else:
            continue
        # Unwrap inner <b>/<strong> — heading tag conveys the weight
        for b in p.find_all(["b", "strong"]):
            b.unwrap()

    # ── Pass 2: Table reconstruction ─────────────────────────────────────────
    # Must run BEFORE the merge passes.  LibreOffice emits every table cell as
    # an individual <p> when the source PDF has no tagged table structure.
    # We detect a "grid run": a consecutive block of <p> tags whose total count
    # is a multiple of a consistent column count.  The leading bold cells
    # identify the header row and imply the column count.

    def _cell_is_bold(tag: Tag) -> bool:
        """True when the <p>'s first non-whitespace child is <b> or <strong>."""
        for child in tag.children:
            if isinstance(child, NavigableString):
                if child.strip():
                    return False  # bare text first → not bold
                continue
            return child.name in ("b", "strong")
        return False

    def _build_table(run: list, cols: int) -> Optional[Tag]:
        """Build a <table> from a flat list of <p> cells at *cols* columns."""
        usable = (len(run) // cols) * cols
        if usable < cols * 2:        # need at least header + one data row
            return None
        rows = [run[i : i + cols] for i in range(0, usable, cols)]
        tbl = soup.new_tag(
            "table", border="1",
            style="border-collapse:collapse;width:100%;margin:1em 0",
        )
        for r_idx, row_cells in enumerate(rows):
            tr = soup.new_tag("tr")
            cell_tag = "th" if r_idx == 0 else "td"
            for cell_p in row_cells:
                cell_el = soup.new_tag(
                    cell_tag,
                    style="padding:4px 8px;border:1px solid #ccc;vertical-align:top",
                )
                for child in list(cell_p.children):
                    cell_el.append(child.extract())
                tr.append(cell_el)
            tbl.append(tr)
        return tbl

    def _reconstruct_tables_in(container) -> None:
        children = list(container.children)
        i = 0
        while i < len(children):
            node = children[i]
            if isinstance(node, Tag) and node.name in ("div", "section", "article"):
                _reconstruct_tables_in(node)
                i += 1
                continue
            if not (isinstance(node, Tag) and node.name == "p"):
                i += 1
                continue

            # Collect the maximal consecutive run of <p> siblings
            run: list = []
            j = i
            while j < len(children) and isinstance(children[j], Tag) and children[j].name == "p":
                run.append(children[j])
                j += 1

            if len(run) < 4:
                i += 1
                continue

            # Infer column count from leading bold-header cells
            header_len = 0
            for cell in run:
                if _cell_is_bold(cell):
                    header_len += 1
                else:
                    break

            # Build candidate column counts: bold-header length first, then 2/3/4
            col_candidates: list[int] = []
            if 2 <= header_len <= len(run) // 2:
                col_candidates.append(header_len)
            for c in (2, 3, 4):
                if c not in col_candidates and len(run) >= c * 2:
                    col_candidates.append(c)

            table_tag = None
            chosen_cols = 0
            for cols in col_candidates:
                t = _build_table(run, cols)
                if t is not None:
                    table_tag = t
                    chosen_cols = cols
                    break

            if table_tag is None:
                i += 1
                continue

            usable = (len(run) // chosen_cols) * chosen_cols
            consumed, leftover = run[:usable], run[usable:]

            consumed[0].insert_before(table_tag)
            for cell_p in consumed:
                cell_p.decompose()
            for lp in reversed(leftover):
                table_tag.insert_after(lp)

            children = list(container.children)
            i = children.index(table_tag) + 1

    _reconstruct_tables_in(body)

    # ── Pass 3: Short-fragment merge ──────────────────────────────────────────
    # Merge consecutive short <p> fragments that form one logical inline flow
    # (e.g. "PDF ", "→", " Word" each in their own <p>).
    # A fragment qualifies when: stripped length ≤ 20 AND no sentence-end punct.
    # We stop merging when the next sibling is a heading or a table.
    _SHORT = 20

    def _is_short_frag(tag: Tag) -> bool:
        if tag.name != "p":
            return False
        txt = tag.get_text()
        return (
            len(txt.strip()) <= _SHORT
            and not re.search(r"[.!?:]\s*$", txt.rstrip())
        )

    changed = True
    while changed:
        changed = False
        for p in body.find_all("p"):
            if not _is_short_frag(p):
                continue
            nxt = p.find_next_sibling()
            if nxt is None or nxt.name not in ("p",):
                continue
            p.append(NavigableString(" "))
            for child in list(nxt.children):
                p.append(child.extract())
            nxt.decompose()
            changed = True
            break

    # ── Pass 4: Paragraph join (continuation lines) ───────────────────────────
    # Join two consecutive <p> tags when all of these hold:
    #   • neither is a heading
    #   • first does NOT end with .!?: (sentence boundary)
    #   • second does NOT start with a capital word (new sentence)
    #   • combined text is ≤ 400 chars
    _SENT_END = re.compile(r"[.!?:]\s*$")
    _NEW_SENT = re.compile(r"^[A-Z][a-z]")

    changed = True
    while changed:
        changed = False
        blocks = body.find_all(["p", "h2", "h3", "table"])
        for i, p in enumerate(blocks[:-1]):
            nxt = blocks[i + 1]
            if p.name != "p" or nxt.name != "p":
                continue
            p_text = p.get_text()
            n_text = nxt.get_text()
            if _SENT_END.search(p_text.rstrip()):
                continue
            if _NEW_SENT.match(n_text.lstrip()):
                continue
            if len(p_text) + len(n_text) > 400:
                continue
            p.append(NavigableString(" "))
            for child in list(nxt.children):
                p.append(child.extract())
            nxt.decompose()
            changed = True
            break

    return str(soup)
