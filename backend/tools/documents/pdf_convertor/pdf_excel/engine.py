"""
PDF → Excel (XLSX) conversion engine — ToolCEO
================================================

Engine: pdfplumber  (pure Python, no JVM, no Ghostscript)
----------------------------------------------------------
pdfplumber wraps pdfminer.six and provides a clean API for extracting
text, tables, and character-level position data from text-layer PDFs.

Extraction strategy
-------------------
There are three very different PDF table layouts, handled separately:

A. RULED / LATTICE tables  (line objects separate every cell)
   → pdfplumber.extract_tables() with its default "lines" strategy.

B. RECT-BACKGROUND tables  (filled rectangles colour-code cells — e.g.
   attendance sheets where P=green rect, A=red rect, no ruled borders)
   → pdfplumber's default finder treats rects as wide spanning lines,
     merging several single-char cells into one.  We must NOT use it.
   → Use extract_words() with tight tolerances to get word-level bounding
     boxes, cluster word x0 positions into column bands, then build the
     table from (row_band, col_band) buckets.
   → Because student-name words land at many different x0 positions (each
     name is different) while the attendance/numeric columns have highly
     consistent x0 values across all rows, we identify the structured zone
     (x0 > STRUCTURED_X_THRESHOLD) vs the free-text zone (x0 ≤ threshold)
     and handle them differently:
       • Free-text zone: for each logical row, concatenate all words
         sorted by x0 into as many leading cells as needed (Roll + Name).
       • Structured zone: assign each word to its column band.

C. PURE WHITESPACE tables  (no lines, no rects)
   → pdfplumber text-strategy with tight tolerances as a final fallback.

Detection order per page
------------------------
1. Count real line objects.   If lines present  → strategy A.
2. Count filled rect objects. If rects ≥ 4     → strategy B.
3. Fallback                                    → strategy C.

Row grouping
------------
Words are grouped into logical rows by clustering their `top` values.
A gap of ROW_GAP_THRESHOLD=8pt separates adjacent students; names that
sit ~2pt below their roll number on the same PDF row cluster together.

Self-check
----------
After extraction, if >60% of data cells are empty OR any cell contains
multiple single-letter attendance tokens separated by spaces ("P P P"),
a warning is logged — the data is still emitted.

Scanned / image-only PDFs
--------------------------
Detected via PyMuPDF text check.  If scanned and Tesseract is available,
OCR pre-pass converts to searchable PDF first.  Otherwise a warning note
is written to the output sheet.

Progress milestones (SSE-compatible)
--------------------------------------
 10 %  opened / scanned-check done
 15-45% OCR pre-pass (scanned PDFs only, when Tesseract present)
 50 %  pdfplumber extraction started
 90 %  building Excel workbook
 95 %  done (router bumps to 100 via set_done)

Public API
----------
get_pdf_info(data, password)  →  dict
convert_pdf_to_excel(data, password, job_id)  →  bytes
"""

from __future__ import annotations

import base64
import io
import logging
import re
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Optional

import fitz          # PyMuPDF  (already bundled)
import pdfplumber
import pandas as pd

from platform_tools import find_tesseract

_log = logging.getLogger(__name__)

# Maximum pages to process (safety guard for huge PDFs)
_MAX_PAGES = 200

# ── Strategy B clustering constants ─────────────────────────────────────────
# Column gap for word x0 clustering in the structured zone.
# Attendance columns are ~21pt wide, gap between them ~17pt → 8pt is safe.
COL_GAP_THRESHOLD = 8.0

# Row gap: students are ~14pt apart; same-row name baseline drift is ~2pt.
ROW_GAP_THRESHOLD = 8.0

# Minimum filled-rect count to trigger strategy B.
RECT_COUNT_THRESHOLD = 4

# Word x_tolerance for extract_words (tight: don't join words across gaps)
WORD_X_TOL = 2

# When the natural gap in x0 between the free-text zone and structured
# zone is large (>= this), we split the page there and handle each zone
# differently.  Set to 0 to disable zone splitting.
FREE_TEXT_GAP_THRESHOLD = 10.0


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
# PDF info helper (shared shape with other tools)
# ---------------------------------------------------------------------------

def get_pdf_info(data: bytes, password: Optional[str] = None) -> dict:
    """Return page_count, file_size, and a base64 JPEG thumbnail of page 0."""
    doc = _open_fitz(data, password)
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

def _open_fitz(data: bytes, password: Optional[str] = None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password:
            raise ValueError("This PDF is password-protected. Supply a password.")
        if not doc.authenticate(password):
            raise ValueError("Incorrect password for encrypted PDF.")
    return doc


def _is_scanned(doc: fitz.Document) -> bool:
    """Return True if no extractable text exists on any page."""
    for page in doc:
        if page.get_text("text").strip():
            return False
    return True


def _ocr_to_searchable_pdf(
    doc: fitz.Document,
    job_id: Optional[str],
) -> Optional[bytes]:
    """
    Run Tesseract OCR on each page and return a searchable PDF bytes object.
    Returns None if Tesseract is not available or fails.
    """
    tesseract_cmd = find_tesseract()
    if not tesseract_cmd:
        _log.warning("Tesseract not found — skipping OCR pre-pass")
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
        ocr_pct = 15 + int(28 * (pno / total))
        _report(job_id, ocr_pct)

        page      = doc[pno]
        mat       = fitz.Matrix(300 / 72, 300 / 72)
        pix       = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB, alpha=False)
        img_bytes = pix.tobytes("png")
        img       = Image.open(io.BytesIO(img_bytes))

        page_pdf = pytesseract.image_to_pdf_or_hocr(img, extension="pdf", lang="eng")
        page_pdfs.append(page_pdf)

    merged = fitz.open()
    for ppdf in page_pdfs:
        tmp = fitz.open("pdf", ppdf)
        merged.insert_pdf(tmp)
        tmp.close()

    buf = io.BytesIO()
    merged.save(buf)
    merged.close()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Numeric coercion
# ---------------------------------------------------------------------------

_CURRENCY_RE = re.compile(r"""
    ^               # start of string
    \s*             # optional leading whitespace
    [+\-]?          # optional sign
    [$\u20ac\u00a3\u00a5\u20b9\u20a9\u20ab\u20ba\u20b4\u20a6\u20b2\u20b1\u0e3f]?
    \s*             # optional space after symbol
    [\d,. ]+        # digits, commas, periods, spaces (thousands separators)
    \s*$            # optional trailing whitespace
""", re.VERBOSE)


def _try_numeric(val: object) -> object:
    """
    Coerce to int/float where unambiguous.
    Leaves attendance marks (P/A/L), dates, and mixed strings alone.
    """
    if val is None or val == "":
        return val
    if isinstance(val, (int, float)):
        return val
    s = str(val).strip()
    if not s:
        return val

    # Leave date strings alone
    if re.search(r"\d{4}-\d{2}-\d{2}", s):
        return val
    if re.search(r"\d{1,2}/\d{1,2}/\d{2,4}", s):
        return val

    if not _CURRENCY_RE.match(s):
        return val

    cleaned = re.sub(r"[^\d.\-+]", "", s.replace(",", ""))
    if not cleaned or cleaned in (".", "-", "+"):
        return val
    try:
        f = float(cleaned)
        if f == int(f) and "." not in cleaned:
            return int(f)
        return f
    except (ValueError, OverflowError):
        return val


def _coerce_row(row: list) -> list:
    return [_try_numeric(cell) for cell in row]


# ---------------------------------------------------------------------------
# Clustering utilities
# ---------------------------------------------------------------------------

def _cluster_sorted(values: list[float], gap: float) -> list[list[float]]:
    """
    Cluster a sorted list of distinct floats by gap threshold.
    Returns list of clusters (each cluster is a sorted list of values).
    """
    if not values:
        return []
    clusters: list[list[float]] = [[values[0]]]
    for v in values[1:]:
        if v - clusters[-1][-1] <= gap:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return clusters


def _cluster_positions(positions: list[float], gap: float) -> list[tuple[float, float]]:
    """
    Cluster a list of float positions into (band_min, band_max) tuples.
    """
    if not positions:
        return []
    sorted_pos = sorted(set(positions))
    clusters = _cluster_sorted(sorted_pos, gap)
    return [(min(c), max(c)) for c in clusters]


def _assign_band(value: float, bands: list[tuple[float, float]]) -> int:
    """
    Return index of nearest band.  Returns -1 if bands is empty.
    """
    if not bands:
        return -1
    best_idx = 0
    best_dist = float("inf")
    for i, (lo, hi) in enumerate(bands):
        if lo <= value <= hi:
            return i
        mid = (lo + hi) / 2.0
        d = abs(value - mid)
        if d < best_dist:
            best_dist = d
            best_idx = i
    return best_idx


# ---------------------------------------------------------------------------
# Strategy detection
# ---------------------------------------------------------------------------

def _page_strategy(page: pdfplumber.page.Page) -> str:
    """Returns 'lines' | 'rects' | 'text'."""
    if len(page.lines or []) > 0:
        return "lines"
    if len(page.rects or []) >= RECT_COUNT_THRESHOLD:
        return "rects"
    return "text"


# ---------------------------------------------------------------------------
# Strategy A — ruled table
# ---------------------------------------------------------------------------

def _extract_lines_strategy(page: pdfplumber.page.Page) -> list[list[list]]:
    tables = page.extract_tables()
    return [t for t in (tables or []) if t and any(any(c for c in row) for row in t)]


# ---------------------------------------------------------------------------
# Strategy B — rect-background table (word-position reconstruction)
# ---------------------------------------------------------------------------

def _find_free_text_boundary(words: list[dict]) -> float:
    """
    Find the x0 boundary that separates the free-text zone (roll numbers,
    names — arbitrary x0 per cell) from the structured data zone (attendance
    marks, totals, percentages — a small fixed set of x0 values each repeated
    consistently across every data row).

    Algorithm:
    1. Count word occurrences at each rounded x0.  "Structured" x0 values
       are those appearing >= FREQ_THRESHOLD times.
    2. Among structured x0 values, find every gap >= MIN_GAP between
       consecutive values.  For each, score it: a gap qualifies if the
       cluster immediately following the gap has a max internal spacing
       <= CLUSTER_MAX_GAP (i.e. it's a tight data-grid cluster).
    3. Among all qualifying gaps, pick the LARGEST one.  The large gap
       before the data grid is always larger than the inter-column gaps
       inside the grid.
    4. Fallback: largest natural gap across all word x0 values.
    """
    if not words:
        return 0.0

    from collections import Counter

    x0_counts = Counter(round(w["x0"]) for w in words)

    FREQ_THRESHOLD  = 5    # x0 must appear this many times to be "structured"
    MIN_GAP         = 15.0 # minimum gap to be a candidate boundary
    CLUSTER_MAX_GAP = 25.0 # max gap inside the data-grid cluster (attendance cols are ~17-18pt apart)

    structured_x0s = sorted(x for x, cnt in x0_counts.items() if cnt >= FREQ_THRESHOLD)

    if len(structured_x0s) >= 3:
        # Collect all qualifying gaps (large enough AND followed by a tight cluster)
        qualifying: list[tuple[float, int]] = []  # (gap_size, right_idx)

        for i in range(len(structured_x0s) - 1):
            g = structured_x0s[i + 1] - structured_x0s[i]
            if g < MIN_GAP:
                continue
            right_start = i + 1
            cluster_end = min(right_start + 5, len(structured_x0s))
            cluster_vals = structured_x0s[right_start:cluster_end]
            if len(cluster_vals) < 2:
                continue
            max_internal = max(
                cluster_vals[j + 1] - cluster_vals[j]
                for j in range(len(cluster_vals) - 1)
            )
            if max_internal <= CLUSTER_MAX_GAP:
                qualifying.append((g, right_start))

        if qualifying:
            # Pick the LARGEST qualifying gap — that's the one before the data grid
            _, best_right_start = max(qualifying, key=lambda t: t[0])
            best_left  = float(structured_x0s[best_right_start - 1])
            best_right = float(structured_x0s[best_right_start])
            return (best_left + best_right) / 2.0

        # No qualifying gap found — use the largest gap among structured x0s >= MIN_GAP
        all_large = [
            (structured_x0s[i + 1] - structured_x0s[i], i + 1)
            for i in range(len(structured_x0s) - 1)
            if structured_x0s[i + 1] - structured_x0s[i] >= MIN_GAP
        ]
        if all_large:
            _, best_right_idx = max(all_large, key=lambda t: t[0])
            best_left  = float(structured_x0s[best_right_idx - 1])
            best_right = float(structured_x0s[best_right_idx])
            return (best_left + best_right) / 2.0

    # Fallback: largest natural gap across all unique x0 values
    sorted_x0 = sorted(set(round(w["x0"], 1) for w in words))
    if len(sorted_x0) < 2:
        return 0.0

    best_gap = best_mid = 0.0
    for i in range(len(sorted_x0) - 1):
        g = sorted_x0[i + 1] - sorted_x0[i]
        if g > best_gap:
            best_gap = g
            best_mid = (sorted_x0[i] + sorted_x0[i + 1]) / 2.0

    return best_mid if best_gap >= FREE_TEXT_GAP_THRESHOLD else 0.0


def _group_words_by_row(words: list[dict]) -> dict[int, list[dict]]:
    """
    Group words into logical row buckets by clustering their `top` values.
    Returns {row_index: [word, ...]} sorted by row_index (ascending top).
    """
    if not words:
        return {}

    top_vals = [w["top"] for w in words]
    row_bands = _cluster_positions(top_vals, ROW_GAP_THRESHOLD)

    row_map: dict[int, list[dict]] = defaultdict(list)
    for w in words:
        ri = _assign_band(w["top"], row_bands)
        row_map[ri].append(w)

    return dict(sorted(row_map.items()))


def _extract_rects_strategy(page: pdfplumber.page.Page) -> list[list[list]]:
    """
    Strategy B: reconstruct table from word positions.

    Splits each page into a free-text zone (Roll + Name columns, where
    word x0 values are arbitrary) and a structured zone (attendance marks,
    totals, percentages, where x0 values repeat consistently across rows).

    Free-text zone  → all words in a logical row are concatenated in x0
                      order, separated by a single space, and placed in
                      one cell (the Name cell carries roll+name together).
    Structured zone → words are assigned to column bands by their x0.

    This avoids the 'P P P P' merge bug (which arose from char-level
    clustering) while correctly assembling multi-word names.
    """
    words = page.extract_words(x_tolerance=WORD_X_TOL, y_tolerance=3)
    if not words:
        return []

    # ── Find the boundary between free-text zone and structured zone ─────────
    boundary_x = _find_free_text_boundary(words)

    # ── Build column bands from high-frequency x0 positions right of boundary ─
    # "High frequency" (>= 5 appearances) means the x0 is a column repeated
    # across many data rows.  We only use positions that are right of the
    # detected boundary_x, so that roll-number/name columns (which also repeat
    # at high frequency) don't create spurious bands in the structured zone.
    from collections import Counter as _Counter
    x0_counter = _Counter(round(w["x0"]) for w in words)
    FREQ_THRESHOLD_BANDS = 5

    if boundary_x > 0.0:
        # Use only high-freq x0s that are at or right of boundary_x
        high_freq_x0s = sorted(
            x for x, cnt in x0_counter.items()
            if cnt >= FREQ_THRESHOLD_BANDS and x >= boundary_x
        )
    else:
        # No boundary detected — use all high-freq x0s
        high_freq_x0s = sorted(x for x, cnt in x0_counter.items() if cnt >= FREQ_THRESHOLD_BANDS)

    col_bands = _cluster_positions([float(x) for x in high_freq_x0s], COL_GAP_THRESHOLD)

    if boundary_x <= 0.0 or not col_bands:
        # No clear boundary or no structured columns found — treat entire page as structured
        has_free = False
        effective_boundary = -1.0
        # Rebuild col_bands from all words if we have no structured zone info
        if not col_bands:
            col_bands = _cluster_positions([w["x0"] for w in words], COL_GAP_THRESHOLD)
    else:
        # Effective boundary: left edge of the first structured column minus 1pt.
        # This absorbs any stray word (e.g. a long name fragment) whose x0 falls
        # between the gap midpoint and the first actual data column.
        effective_boundary = col_bands[0][0] - 1.0
        has_free = True

    if has_free:
        free_words  = [w for w in words if w["x0"] <  effective_boundary]
        struc_words = [w for w in words if w["x0"] >= effective_boundary]
    else:
        free_words  = []
        struc_words = words

    # ── Group ALL words into logical rows ─────────────────────────────────────
    all_row_map = _group_words_by_row(words)

    if not all_row_map:
        return []

    n_cols_struc = len(col_bands)

    n_output_cols = (1 if has_free else 0) + n_cols_struc

    table: list[list] = []

    for ri in sorted(all_row_map.keys()):
        row_words = all_row_map[ri]

        # ── Free-text cell: all words left of effective_boundary ─────────────
        if has_free:
            free_in_row = sorted(
                [w for w in row_words if w["x0"] < effective_boundary],
                key=lambda w: w["x0"]
            )
            free_cell = " ".join(w["text"] for w in free_in_row).strip() or None
        else:
            free_cell = None

        # ── Structured cells: words at or right of effective_boundary ─────────
        # Words are only accepted into a column bucket if they fall within
        # COL_GAP_THRESHOLD of a known high-frequency column band.  Anything
        # farther away (e.g. a name word that drifted right of the boundary)
        # is treated as free-text overflow and appended to free_cell.
        struc_cells: list[Optional[str]] = [None] * n_cols_struc
        overflow_words: list[dict] = []
        struc_in_row = [w for w in row_words if w["x0"] >= effective_boundary] if has_free else row_words

        col_buckets: list[list[tuple]] = [[] for _ in range(n_cols_struc)]
        for w in struc_in_row:
            ci = _assign_band(w["x0"], col_bands)
            if 0 <= ci < n_cols_struc:
                # Accept only if the word's x0 is within COL_GAP_THRESHOLD of
                # the column band's range — rejects stray name words that fall
                # between the free-text boundary and the first real data column.
                band_lo, band_hi = col_bands[ci]
                if w["x0"] >= band_lo - COL_GAP_THRESHOLD and w["x0"] <= band_hi + COL_GAP_THRESHOLD:
                    col_buckets[ci].append((w["x0"], w["text"]))
                else:
                    overflow_words.append(w)
            else:
                overflow_words.append(w)

        for ci, bucket in enumerate(col_buckets):
            if bucket:
                struc_cells[ci] = " ".join(t for _, t in sorted(bucket)).strip() or None

        # Append overflow words to the free-text cell
        if overflow_words and has_free:
            overflow_text = " ".join(w["text"] for w in sorted(overflow_words, key=lambda w: w["x0"]))
            if free_cell:
                free_cell = free_cell + " " + overflow_text
            else:
                free_cell = overflow_text

        # ── Assemble output row ───────────────────────────────────────────────
        if has_free:
            out_row = [free_cell] + struc_cells
        else:
            out_row = struc_cells

        # Only emit rows that have at least one non-None cell
        if any(c is not None for c in out_row):
            table.append(out_row)

    if not table:
        return []

    _check_table_confidence(table)
    return [table]


def _check_table_confidence(table: list[list]) -> None:
    """Log warnings if the table shows signs of merged or mostly-empty cells."""
    merged_cell_re = re.compile(r"^([A-Za-z] ){2,}[A-Za-z]$")

    total = merged = empty = 0
    for row in table:
        for cell in row:
            total += 1
            s = str(cell).strip() if cell is not None else ""
            if not s:
                empty += 1
            elif merged_cell_re.match(s):
                merged += 1

    if total == 0:
        return
    if empty / total > 0.60:
        _log.warning(
            "Table quality: %.0f%% cells empty — column detection may be off.",
            empty / total * 100
        )
    if merged / total > 0.05:
        _log.warning(
            "Table quality: %.0f%% cells have merged tokens (e.g. 'P P P').",
            merged / total * 100
        )


# ---------------------------------------------------------------------------
# Strategy C — whitespace/text table
# ---------------------------------------------------------------------------

_TEXT_STRATEGY_SETTINGS = {
    "vertical_strategy":      "text",
    "horizontal_strategy":    "text",
    "snap_tolerance":         3,
    "join_tolerance":         3,
    "edge_min_length":        3,
    "min_words_vertical":     1,
    "min_words_horizontal":   1,
    "intersection_tolerance": 3,
}


def _extract_text_strategy(page: pdfplumber.page.Page) -> list[list[list]]:
    try:
        tables = page.extract_tables(_TEXT_STRATEGY_SETTINGS)
        return [t for t in (tables or []) if t and any(any(c for c in row) for row in t)]
    except Exception as exc:
        _log.debug("Text-strategy extraction failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Top-level dispatcher
# ---------------------------------------------------------------------------

def _extract_tables_from_page(page: pdfplumber.page.Page) -> list[list[list]]:
    """Dispatch to the correct strategy and return list of raw tables."""
    strategy = _page_strategy(page)
    _log.debug(
        "Page strategy: %s  (lines=%d, rects=%d)",
        strategy, len(page.lines or []), len(page.rects or [])
    )

    if strategy == "lines":
        tables = _extract_lines_strategy(page)
        if tables:
            return tables
        if len(page.rects or []) >= RECT_COUNT_THRESHOLD:
            tables = _extract_rects_strategy(page)
            if tables:
                return tables
        return _extract_text_strategy(page)

    if strategy == "rects":
        tables = _extract_rects_strategy(page)
        if tables:
            return tables
        return _extract_text_strategy(page)

    return _extract_text_strategy(page)


# ---------------------------------------------------------------------------
# Main conversion
# ---------------------------------------------------------------------------

def convert_pdf_to_excel(
    data: bytes,
    password: Optional[str] = None,
    job_id: Optional[str] = None,
) -> bytes:
    """Convert PDF bytes → XLSX bytes using pdfplumber."""
    _report(job_id, 10)

    doc = _open_fitz(data, password)
    scanned = _is_scanned(doc)
    pdf_to_convert = data
    scanned_no_ocr = False

    if scanned:
        _log.info("Scanned PDF detected — attempting OCR pre-pass")
        _report(job_id, 15)
        ocr_pdf_bytes = _ocr_to_searchable_pdf(doc, job_id)
        if ocr_pdf_bytes:
            pdf_to_convert = ocr_pdf_bytes
        else:
            scanned_no_ocr = True
            _log.warning("OCR unavailable; output may be empty.")

    doc.close()
    _report(job_id, 50)

    workbook_sheets: list[tuple[str, list[list]]] = []

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf_file:
        tmp_path = Path(tmp_pdf_file.name)
        tmp_path.write_bytes(pdf_to_convert)

    try:
        with pdfplumber.open(str(tmp_path), password=password or "") as pdf:
            total_pages = min(len(pdf.pages), _MAX_PAGES)
            for pno in range(total_pages):
                extract_pct = 50 + int(38 * ((pno + 1) / total_pages))
                _report(job_id, extract_pct)

                page   = pdf.pages[pno]
                tables = _extract_tables_from_page(page)
                if not tables:
                    _log.debug("Page %d: no tables found", pno + 1)
                    continue

                for tidx, raw_table in enumerate(tables):
                    sheet_name = f"Page {pno + 1}" if len(tables) == 1 else f"Page {pno + 1} T{tidx + 1}"
                    sheet_name = sheet_name[:31]
                    coerced = [_coerce_row(row) for row in raw_table]
                    workbook_sheets.append((sheet_name, coerced))
    finally:
        try:
            tmp_path.unlink()
        except Exception:
            pass

    _report(job_id, 90)

    buf = io.BytesIO()

    if not workbook_sheets:
        _log.warning("No tables detected in PDF; writing notes sheet")
        if scanned_no_ocr:
            note_rows = [
                ["Scanned PDF — no text layer found."],
                ["Install Tesseract OCR and retry."],
            ]
        else:
            note_rows = [
                ["No tables detected in this PDF."],
                ["The PDF may have no structured tables, may be scanned, or columns may be too irregular."],
            ]
        df_empty = pd.DataFrame(note_rows, columns=["Note"])
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df_empty.to_excel(writer, index=False, sheet_name="Notes")
    else:
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            for sheet_name, rows in workbook_sheets:
                if not rows:
                    continue
                raw_header = rows[0]
                header = [
                    (str(h) if h is not None and str(h).strip() != "" else f"Col{i+1}")
                    for i, h in enumerate(raw_header)
                ]
                body = rows[1:]
                df = pd.DataFrame(body, columns=header)
                df.to_excel(writer, index=False, sheet_name=sheet_name)

    buf.seek(0)
    xlsx_bytes = buf.read()

    if scanned_no_ocr:
        _log.warning("Converted scanned PDF without OCR.")

    _report(job_id, 95)
    return xlsx_bytes
