"""
pdf_epub_engine.py — Semantic PDF → EPUB converter for ToolCEO
==============================================================

Replaces the Calibre PDF→EPUB path with a purpose-built pipeline that
preserves the document's semantic structure.

Pipeline
--------
1.  Open the PDF with pdfplumber (layout analysis) + PyMuPDF (glyph-level
    styling, line/rect detection, image extraction).
2.  Build a page-level document model:
      • Classify every text block as heading (H1/H2/H3), paragraph, list
        item, code block, or table.
      • Detect inline styles: bold, italic, underline (drawn line under
        baseline), strikethrough (drawn line through mid-line), sub/sup
        (vertical baseline offset + smaller size).
3.  Serialise to EPUB3 (OPF + XHTML content docs + NCX + nav.xhtml).

Public API
----------
convert_pdf_to_epub(pdf_path, epub_path, title="", cover_path=None) -> None
    Convert *pdf_path* to an EPUB3 file at *epub_path*.

All internal helpers are prefixed with underscore and are not part of the
public API.
"""

from __future__ import annotations

import io
import logging
import os
import re
import unicodedata
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants / thresholds
# ---------------------------------------------------------------------------

# A line element that is very thin (height ≤ this many pts) is treated as a
# decorative rule rather than a text-bearing element.
_RULE_MAX_HEIGHT = 2.5   # pts

# Fraction of the median body font size below which text is considered
# sub/superscript sized.  ReportLab renders sub/sup at ~0.8× body size;
# setting this to 0.92 captures those (including 0.9× renders) while leaving
# only very-slightly-smaller text alone.
_SUBSUP_SIZE_RATIO = 0.92

# Fraction above median body size that qualifies as a "heading size".
_H_SIZE_MULTIPLIER = 1.18

# Left-indent delta (pts) that constitutes one level of list nesting.
# Using 8.0 instead of 12.0 so that narrowly-indented nested items (common
# in PDFs that indent child items by ~9–10 pts) are not collapsed onto level 0.
_LIST_INDENT_STEP = 8.0

# Monospace font name fragments (case-insensitive).
_MONO_FONTS = (
    "courier", "consolas", "monaco", "monospace", "lucidaconsole",
    "sourcecodepro", "inconsolata", "dejavumono", "notomono",
    "ubuntumono", "anonymouspro", "droidsansmono", "fixedsys",
    "terminal", "ocr",
)

# Bullet glyphs that signal an unordered list item.
# Only genuine Unicode bullet/symbol characters — NO plain ASCII letters.
# ZapfDingbats 'I' (filled circle) is handled separately via font-name check.
_BULLET_CHARS = frozenset("•·‣⁃◦▪▸●○■□➤➢➣➔→►▶✓✗✦✧")

# Font families whose first glyph on a line is always a bullet marker.
_BULLET_FONTS = ("zapfdingbats", "dingbats", "wingdings", "webdings")

# Regex for ordered list prefixes: "1.", "1)", "(1)", "a.", "a)"
_OL_PREFIX_RE = re.compile(r"^(?:\(?\s*(?:[0-9]+|[a-zA-Z])[.)]\s*)")

# Max gap between two consecutive text lines (pts) before they are treated
# as belonging to different paragraphs (whitespace/blank-line detection).
_PARA_GAP_THRESHOLD = 8.0   # pts

# Blockquote detection: a paragraph whose x0 exceeds the body margin by at
# least this fraction of the page width is promoted to <blockquote>.
# 15% of a standard 612pt page ≈ 91.8pt; use 0.15 as the fraction.
# fix: blockquote semantic markup
_BLOCKQUOTE_PAGE_FRAC = 0.15

# Vertical margin (pts) from the top or bottom of the page within which text
# is considered a running header or footer and should be excluded.
_HEADER_FOOTER_MARGIN = 50.0  # pts

# Glyph-corruption substitution map: PDF fonts sometimes encode ligatures as
# single Unicode private-use or ligature codepoints that must be expanded back
# to their plain ASCII equivalents before any further processing.
# Applied as a post-processing step on every assembled span text.
# fix: ligature map
_GLYPH_CORRUPTION_MAP: Dict[str, str] = {
    "\ufb01": "fi",    # ﬁ  fi-ligature  → fi   # fix: ligature map
    "\ufb02": "fl",    # ﬂ  fl-ligature  → fl   # fix: ligature map
    "\ufb03": "ffi",   # ﬃ  ffi-ligature → ffi  # fix: ligature map
    "\ufb04": "ffl",   # ﬄ  ffl-ligature → ffl  # fix: ligature map
    "\ufb00": "ff",    # ﬀ  ff-ligature  → ff   # fix: ligature map
    "\ufb05": "st",    # ﬅ  st-ligature  → st   # fix: ligature map
    "\uf0e0": "\u2192",   # Symbol-font private-use → → RIGHT ARROW
    "\uf0e1": "\u2190",   # Symbol-font private-use → ← LEFT ARROW
    "\uf0ae": "\u2192",   # Wingdings arrow right
    "\uf0ac": "\u2190",   # Wingdings arrow left
}

# Known symbol glyph names → Unicode character (for fonts without ToUnicode).
_GLYPH_NAME_TO_UNICODE: Dict[str, str] = {
    "checkmark":    "\u2713",  # ✓
    "check":        "\u2713",
    "tick":         "\u2713",
    "bullet":       "\u2022",  # •
    "filledcircle": "\u25CF",  # ●
    "blackcircle":  "\u25CF",
    "filledsquare": "\u25A0",  # ■
    "blacksquare":  "\u25A0",
    "circle":       "\u25CB",  # ○
    "square":       "\u25A1",  # □
    "uni2713":      "\u2713",
    "uni25cf":      "\u25CF",
    "uni25a0":      "\u25A0",
}

# ZapfDingbats ordinal → Unicode.  The ZapfDingbats encoding maps character
# codes 0x20–0xFF to specific symbols.  Codes 0x00–0x1F are control codes and
# should map to the equivalent Unicode dingbat when the private-use U+F000 offset
# is removed.  Only the most common / test-relevant glyphs are listed here.
_SYMBOL_ORDINAL_TO_UNICODE: Dict[int, str] = {
    # ZapfDingbats character code → Unicode
    0x13: "\u2713",   # U+0013 in ZapfDingbats → ✓ CHECK MARK
    0x20: "\u0020",   # SPACE
    0x25: "\u2022",   # • BULLET (code 0x25 in some mappings)
    0x6C: "\u2022",   # l in ZapfDingbats → •
    0x4C: "\u25CF",   # L in ZapfDingbats → ●
    0x6E: "\u25A0",   # n in ZapfDingbats → ■
    # Dingbat-specific checkmark codes
    0x33: "\u2713",   # 3 in ZapfDingbats → ✓
    0x34: "\u2714",   # 4 in ZapfDingbats → ✔
    0x35: "\u2715",   # 5 in ZapfDingbats → ✕
    0x36: "\u2716",   # 6 in ZapfDingbats → ✖
    0x37: "\u2717",   # 7 in ZapfDingbats → ✗
    0x38: "\u2718",   # 8 in ZapfDingbats → ✘
    # Additional symbol-font common glyphs
    0xAA: "\u2713",   # ª in some symbol encodings → ✓
    0xF6: "\u2022",   # ö-slot in some symbol encodings → •
}


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Span:
    """A run of text with uniform styling."""
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    sub: bool = False
    sup: bool = False
    smaller: bool = False   # font-size reduction only, no baseline shift
    link: str = ""          # href if this span is a hyperlink
    font_name: str = ""
    font_size: float = 12.0


@dataclass
class Block:
    """A logical document block (heading, paragraph, list item, table, image, code)."""
    kind: str               # "h1" | "h2" | "h3" | "p" | "li" | "table" | "img" | "code" | "hr"
    spans: List[Span] = field(default_factory=list)
    # For lists
    ordered: bool = False
    indent_level: int = 0   # 0 = top, 1 = nested, …
    # For tables
    rows: List[List[Tuple[str, int, int]]] = field(default_factory=list)
    # (cell_text, rowspan, colspan)  per cell
    first_row_is_header: bool = True
    # For images
    img_data: bytes = b""
    img_ext: str = "png"
    img_id: str = ""
    # For headings: anchor id
    anchor_id: str = ""
    # x-position of first character (for indent analysis)
    x0: float = 0.0
    # page number (1-based)
    page_no: int = 1


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def _slugify(text: str) -> str:
    """Convert heading text to a valid XML/HTML id attribute value."""
    text = unicodedata.normalize("NFKD", text)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.ASCII).strip().lower()
    text = re.sub(r"[\s_-]+", "-", text)
    return text or "section"


def _plain_text(spans: List[Span]) -> str:
    return "".join(s.text for s in spans)


def _is_monospace(font_name: str) -> bool:
    fn = font_name.lower().replace("-", "").replace("_", "")
    return any(m in fn for m in _MONO_FONTS)


def _is_bold_font(font_name: str) -> bool:
    fn = font_name.lower()
    return "bold" in fn or fn.endswith("bd") or fn.endswith("b")


def _is_italic_font(font_name: str) -> bool:
    fn = font_name.lower()
    return "italic" in fn or "oblique" in fn or fn.endswith("it") or fn.endswith("i")


# ---------------------------------------------------------------------------
# PDF parsing helpers using pdfplumber + PyMuPDF
# ---------------------------------------------------------------------------

def _collect_drawn_lines(page_fitz) -> List[Dict]:
    """
    Return all thin horizontal drawing elements on the page.

    Each entry: {"x0": float, "x1": float, "y": float, "thickness": float, "mid_y": float}
    where y is the top of the rectangle and mid_y is the vertical centre.
    Coordinates are in PDF user-space (top-left origin, y increasing down —
    PyMuPDF uses bottom-up, so we flip by subtracting from page height).
    """
    page_height = page_fitz.rect.height
    lines = []
    for path in page_fitz.get_drawings():
        for item in path.get("items", []):
            if item[0] == "l":          # line segment
                p1, p2 = item[1], item[2]
                if abs(p2.y - p1.y) < _RULE_MAX_HEIGHT:   # horizontal
                    y = page_height - max(p1.y, p2.y)
                    lines.append({
                        "x0": min(p1.x, p2.x),
                        "x1": max(p1.x, p2.x),
                        "y": y,
                        "mid_y": y,
                        "thickness": abs(p2.y - p1.y) or 0.5,
                    })
            elif item[0] == "re":       # rectangle (very thin = rule)
                rect = item[1]
                h = abs(rect.y1 - rect.y0)
                if h <= _RULE_MAX_HEIGHT:
                    y = page_height - rect.y1
                    lines.append({
                        "x0": rect.x0,
                        "x1": rect.x1,
                        "y": y,
                        "mid_y": y + h / 2,
                        "thickness": h,
                    })
    return lines


def _spans_from_fitz_word(word: Dict, drawn_lines: List[Dict],
                           body_size: float, page_height: float) -> Span:
    """
    Build a Span from a PyMuPDF word dict (from page.get_text("rawdict")).
    """
    text      = word.get("text", "")
    font_name = word.get("font", "")
    font_size = word.get("size", body_size)
    flags     = word.get("flags", 0)   # 1=superscript,2=italic,4=serifed,8=monospace,16=bold

    bold   = bool(flags & 16) or _is_bold_font(font_name)
    italic = bool(flags & 2)  or _is_italic_font(font_name)
    mono   = bool(flags & 8)  or _is_monospace(font_name)

    # Vertical baseline offset for sub/sup detection.
    # "origin" is (x, y) of the baseline in PyMuPDF bottom-up coords.
    origin = word.get("origin", None)
    sub = sup = False
    if origin and font_size < body_size * _SUBSUP_SIZE_RATIO:
        # Convert PyMuPDF baseline y (bottom-up) to top-down page coord.
        baseline_y = page_height - origin[1]
        # Approximate mid-line of surrounding body text: we use heuristics
        # based on font_size.
        midline = baseline_y - font_size * 0.3
        if origin[1] > page_height * 0.05:   # sanity: not at page edge
            # If baseline is raised (smaller y in top-down) → superscript
            # If baseline is lowered (larger y in top-down) → subscript
            # We compare to the word's bbox top/bottom.
            bbox = word.get("bbox", (0, 0, 0, 0))
            char_top_y = page_height - bbox[3]   # convert
            if char_top_y < baseline_y - font_size * 0.5:
                sup = True
            else:
                sub = True

    # Underline / strikethrough: look for a thin drawn line that overlaps
    # this word's horizontal extent and is near its baseline / mid-line.
    underline = False
    strike    = False
    bbox = word.get("bbox", (0, 0, 0, 0))
    word_x0 = bbox[0]
    word_x1 = bbox[2]
    word_y0 = page_height - bbox[3]   # top in top-down coords
    word_y1 = page_height - bbox[1]   # bottom in top-down coords
    word_h  = word_y1 - word_y0

    for dl in drawn_lines:
        # Horizontal overlap check.
        if dl["x1"] < word_x0 or dl["x0"] > word_x1:
            continue
        ly = dl["mid_y"]
        # Underline: the line is below the text baseline (near bottom of bbox)
        if word_y1 - word_h * 0.25 <= ly <= word_y1 + word_h * 0.3:
            underline = True
        # Strikethrough: line is near the vertical mid-point of the bbox
        elif word_y0 + word_h * 0.3 <= ly <= word_y0 + word_h * 0.7:
            strike = True

    # Hyper-link detection is done at a higher level (page URIs).
    return Span(
        text=text,
        bold=bold,
        italic=italic,
        underline=underline,
        strike=strike,
        sub=sub,
        sup=sup,
        font_name=font_name,
        font_size=font_size,
    )


# ---------------------------------------------------------------------------
# Heading size classification
# ---------------------------------------------------------------------------

def _compute_heading_thresholds(all_font_sizes: List[float]) -> Tuple[float, float, float, float]:
    """
    Given all font sizes seen in the document, compute:
      body_size, h3_min, h2_min, h1_min

    Strategy:
      • The most common size (mode) is the body size.
      • Sizes ≥ body * 1.18 are "heading-sized".
      • Among heading sizes, cluster by rounding to nearest 2pt and pick the
        top-3 distinct clusters → H1 (largest), H2 (next), H3 (next).
    """
    if not all_font_sizes:
        return 12.0, 14.0, 16.0, 20.0

    # Mode of the size distribution (body text).
    size_counts: Dict[float, int] = defaultdict(int)
    for s in all_font_sizes:
        size_counts[round(s, 1)] += 1
    body_size = max(size_counts, key=size_counts.__getitem__)

    heading_threshold = body_size * _H_SIZE_MULTIPLIER

    heading_sizes = sorted(set(
        round(s, 1) for s in all_font_sizes if s >= heading_threshold
    ), reverse=True)

    # Cluster: group sizes within 1.5pt of each other.
    clusters: List[float] = []
    for sz in heading_sizes:
        placed = False
        for i, c in enumerate(clusters):
            if abs(sz - c) <= 1.5:
                # Merge into existing cluster — keep the larger representative.
                clusters[i] = max(clusters[i], sz)
                placed = True
                break
        if not placed:
            clusters.append(sz)

    clusters.sort(reverse=True)   # largest first

    # Assign thresholds from the detected clusters.
    # Each threshold is the exact cluster representative (the largest size in
    # that cluster).  When fewer than 3 clusters exist, synthesise missing
    # levels by subdividing the gap between the known cluster and body_size.
    if len(clusters) >= 1:
        h1_min = clusters[0]
    else:
        h1_min = body_size * 1.5

    if len(clusters) >= 2:
        h2_min = clusters[1]
    else:
        # No H2 cluster: put H2 midway between H1 and H3.
        h2_min = (h1_min + body_size * _H_SIZE_MULTIPLIER) / 2

    if len(clusters) >= 3:
        h3_min = clusters[2]
    else:
        h3_min = body_size * _H_SIZE_MULTIPLIER

    # Guarantee strict ordering: h1_min > h2_min > h3_min > body_size.
    # If any pair is equal or inverted (can happen with synthesised fallbacks),
    # insert a minimum gap of 0.5 pt.
    h3_min = min(h3_min, h2_min - 0.5)
    h2_min = min(h2_min, h1_min - 0.5)
    h3_min = min(h3_min, h2_min - 0.5)

    return body_size, h3_min, h2_min, h1_min


def _classify_heading(avg_size: float, is_bold: bool,
                       body_size: float, h3_min: float,
                       h2_min: float, h1_min: float) -> Optional[str]:
    """Return 'h1', 'h2', 'h3', or None."""
    if avg_size >= h1_min:
        return "h1"
    if avg_size >= h2_min:
        return "h2"
    if avg_size >= h3_min:
        return "h3"
    # Bold + noticeably larger than body → treat as H3 if at the threshold
    if is_bold and avg_size >= body_size * _H_SIZE_MULTIPLIER:
        return "h3"
    return None


# ---------------------------------------------------------------------------
# List detection helpers
# ---------------------------------------------------------------------------

def _strip_prefix_from_spans(spans: List[Span], prefix_char_count: int) -> List[Span]:
    """
    Remove exactly *prefix_char_count* characters from the start of *spans*
    (across span boundaries if necessary) and return the resulting span list.

    This is used to strip bullet/number prefixes that may span across multiple
    Span objects (e.g. the bullet glyph is in span[0] and the text begins in
    span[1] with leading whitespace).
    """
    result: List[Span] = []
    remaining = prefix_char_count
    for sp in spans:
        if remaining <= 0:
            result.append(sp)
            continue
        sp_len = len(sp.text)
        if remaining >= sp_len:
            # Consume this span entirely.
            remaining -= sp_len
            continue
        # Partial consume: keep the tail of this span.
        tail = sp.text[remaining:]
        tail = tail.lstrip()          # also strip any leading whitespace after prefix
        remaining = 0
        if tail:
            result.append(Span(
                text=tail,
                bold=sp.bold, italic=sp.italic,
                underline=sp.underline, strike=sp.strike,
                sub=sp.sub, sup=sp.sup, smaller=sp.smaller,
                link=sp.link, font_name=sp.font_name, font_size=sp.font_size,
            ))
    return result


# ---------------------------------------------------------------------------
# List detection
# ---------------------------------------------------------------------------

def _detect_list_prefix(text: str) -> Tuple[bool, bool, str, int]:
    """
    Returns (is_list_item, is_ordered, stripped_text, prefix_len).

    prefix_len is the number of characters consumed from the START of the
    *lstripped* text by the list prefix (bullet char + following whitespace,
    or ordered prefix + following whitespace).  This is used by the span-level
    prefix stripper so it can remove exactly the right characters from the
    first span without affecting subsequent spans.

    Bug-fix (numbered list ordering): when the ordered prefix occupies the
    ENTIRE text (e.g. the PDF emits "1." as its own rawdict span before the
    item text span) stripped_text will be empty.  We still return is_ordered=True
    so the caller can classify this block as an ordered-list sentinel and let
    _merge_list_continuations attach the following paragraph as the item body.
    prefix_len is returned as the full consumed length in that case.
    """
    stripped = text.lstrip()
    leading = len(text) - len(stripped)   # how many chars were lstripped
    if stripped and stripped[0] in _BULLET_CHARS:
        rest = stripped[1:].lstrip()
        consumed = leading + (len(stripped) - len(rest))
        return True, False, rest, consumed
    m = _OL_PREFIX_RE.match(stripped)
    if m:
        rest = stripped[m.end():].lstrip()
        consumed = leading + (len(stripped) - len(rest))
        return True, True, rest, consumed
    return False, False, text, 0


# ---------------------------------------------------------------------------
# Table extraction using pdfplumber
# ---------------------------------------------------------------------------

def _extract_tables_from_page(page_plumber) -> List[Block]:
    """
    Use pdfplumber to find and extract tables on the page.

    Returns a list of Block(kind="table") objects.
    The bounding boxes of extracted table cells are also returned so that
    the text-block extractor can skip those regions.
    """
    table_blocks: List[Block] = []
    try:
        tables = page_plumber.find_tables()
    except Exception:
        return []

    for tbl in tables:
        try:
            cells = tbl.cells   # list of (x0, top, x1, bottom) bboxes
            extracted = tbl.extract()  # list-of-lists of cell text (or None)
        except Exception:
            continue

        if not extracted:
            continue

        # Build row/col spans: pdfplumber's extract() merges spanned cells as
        # None.  We need to reconstruct rowspan/colspan.
        row_count = len(extracted)
        col_count = max(len(r) for r in extracted) if extracted else 0

        if row_count == 0 or col_count == 0:
            continue

        # Build a grid of (text, rowspan, colspan).
        # We use pdfplumber's cell bboxes to detect spanning.
        # cells is a flat list row-by-row.
        rows: List[List[Tuple[str, int, int]]] = []

        # Group cells into rows by matching y-ranges.
        row_y_ranges: List[Tuple[float, float]] = []
        col_x_ranges: List[Tuple[float, float]] = []

        for c in cells:
            y_range = (c[1], c[3])
            x_range = (c[0], c[2])
            if not any(abs(y_range[0] - r[0]) < 1 and abs(y_range[1] - r[1]) < 1
                       for r in row_y_ranges):
                row_y_ranges.append(y_range)
            if not any(abs(x_range[0] - r[0]) < 1 and abs(x_range[1] - r[1]) < 1
                       for r in col_x_ranges):
                col_x_ranges.append(x_range)

        row_y_ranges.sort(key=lambda r: r[0])
        col_x_ranges.sort(key=lambda r: r[0])

        # Build a dict: (row_idx, col_idx) -> cell bbox
        cell_map: Dict[Tuple[int, int], Tuple[float, float, float, float]] = {}
        for c in cells:
            ri = next((i for i, r in enumerate(row_y_ranges)
                       if abs(c[1] - r[0]) < 1 and abs(c[3] - r[1]) < 1), -1)
            ci = next((i for i, r in enumerate(col_x_ranges)
                       if abs(c[0] - r[0]) < 1 and abs(c[2] - r[1]) < 1), -1)
            if ri >= 0 and ci >= 0:
                cell_map[(ri, ci)] = (c[0], c[1], c[2], c[3])

        # For each unique cell in extracted, determine rowspan/colspan by
        # comparing bbox against row/col ranges.
        # pdfplumber.extract() already handles merged cells by filling None
        # in covered positions.  We iterate over non-None cells.
        occupied: set = set()
        for ri, row_text in enumerate(extracted):
            row_out: List[Tuple[str, int, int]] = []
            for ci, cell_text in enumerate(row_text):
                if (ri, ci) in occupied:
                    continue
                if cell_text is None:
                    # This position is part of a previously started span.
                    occupied.add((ri, ci))
                    continue
                text = (cell_text or "").strip()
                # Determine rowspan/colspan by scanning forward.
                cspan = 1
                rspan = 1
                # Colspan: how many consecutive None values follow in same row?
                j = ci + 1
                while j < len(row_text) and (j >= len(row_text) or row_text[j] is None):
                    cspan += 1
                    occupied.add((ri, j))
                    j += 1
                # Rowspan: how many consecutive rows have None in this column?
                k = ri + 1
                while k < row_count:
                    # Check if all columns ci..ci+cspan-1 are None in row k
                    target_row = extracted[k] if k < len(extracted) else []
                    if all((c2 >= len(target_row) or target_row[c2] is None)
                           for c2 in range(ci, ci + cspan)):
                        rspan += 1
                        for c2 in range(ci, ci + cspan):
                            occupied.add((k, c2))
                        k += 1
                    else:
                        break
                row_out.append((text, rspan, cspan))
            rows.append(row_out)

        if rows:
            table_blocks.append(Block(
                kind="table",
                rows=rows,
                first_row_is_header=True,
            ))

    return table_blocks


def _table_bbox_set(page_plumber) -> List[Tuple[float, float, float, float]]:
    """Return bounding boxes of all tables on this page (to skip text in tables)."""
    bboxes = []
    try:
        for tbl in page_plumber.find_tables():
            bbox = tbl.bbox
            if bbox:
                bboxes.append(bbox)
    except Exception:
        pass
    return bboxes


def _in_table(x0: float, top: float, x1: float, bottom: float,
              table_bboxes: List[Tuple[float, float, float, float]]) -> bool:
    """
    Return True only when the text block is **substantially contained** within
    a table region.

    We require:
    • The horizontal centre of the text block falls within the table column.
    • The text block's vertical centre falls within the table row band.
    • The text block width does not extend more than 20 % beyond the table's
      right edge (catches cases where a heading sits at the same y-range as a
      table but extends much further to the right).
    """
    cx = (x0 + x1) / 2
    cy = (top + bottom) / 2
    w  = x1 - x0
    for (tx0, ty0, tx1, ty1) in table_bboxes:
        if not (ty0 <= cy <= ty1):
            continue
        # Horizontal: centre must be inside, and the block must not be much
        # wider than the table (a heading that merely shares y-range should
        # not be eaten by the table filter).
        if tx0 <= cx <= tx1:
            # Extra guard: if block extends noticeably beyond table right edge,
            # it is not really a cell.
            if x1 > tx1 + w * 0.2:
                continue
            return True
    return False


# ---------------------------------------------------------------------------
# Link extraction
# ---------------------------------------------------------------------------

def _collect_links(page_fitz, page_height: float) -> List[Dict]:
    """Return a list of {x0,y0,x1,y1,uri} dicts for URI links on the page."""
    links = []
    for lnk in page_fitz.get_links():
        if lnk.get("kind") == 2:   # URI link
            r = lnk.get("from")
            if r:
                links.append({
                    "x0": r.x0,
                    "y0": page_height - r.y1,
                    "x1": r.x1,
                    "y1": page_height - r.y0,
                    "uri": lnk.get("uri", ""),
                })
    return links


def _link_for_span(x0: float, y0: float, x1: float, y1: float,
                   links: List[Dict]) -> str:
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    for lnk in links:
        if lnk["x0"] <= cx <= lnk["x1"] and lnk["y0"] <= cy <= lnk["y1"]:
            return lnk["uri"]
    return ""


# ---------------------------------------------------------------------------
# Image extraction
# ---------------------------------------------------------------------------

def _extract_images(page_fitz, doc_fitz, img_counter: List[int]) -> List[Block]:
    """Extract raster images from the page and return Block(kind="img") objects."""
    blocks = []
    seen_xrefs: set = set()
    for img_info in page_fitz.get_images(full=True):
        xref = img_info[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)
        try:
            base_image = doc_fitz.extract_image(xref)
            img_bytes = base_image["image"]
            img_ext   = base_image.get("ext", "png")
            img_counter[0] += 1
            img_id = f"img{img_counter[0]}"
            blocks.append(Block(
                kind="img",
                img_data=img_bytes,
                img_ext=img_ext,
                img_id=img_id,
            ))
        except Exception as exc:
            _log.debug("Image extraction failed (xref %d): %s", xref, exc)
    return blocks


# ---------------------------------------------------------------------------
# Core page-to-blocks parser
# ---------------------------------------------------------------------------

def _parse_page(page_plumber, page_fitz, doc_fitz,
                body_size: float, h3_min: float, h2_min: float, h1_min: float,
                img_counter: List[int], page_no: int,
                heading_anchor_counter: Dict[str, int]) -> List[Block]:
    """
    Convert one PDF page into a list of Block objects.
    """
    page_height = page_fitz.rect.height
    drawn_lines = _collect_drawn_lines(page_fitz)
    links       = _collect_links(page_fitz, page_height)
    table_bboxes = _table_bbox_set(page_plumber)

    # --- Tables first (they "consume" regions) ---
    # Record their y-midpoints so we can insert them in document order later.
    table_blocks_raw = _extract_tables_from_page(page_plumber)
    # Attach y-midpoints to table blocks by matching against pdfplumber table bboxes.
    _tbl_bboxes_sorted: List[Tuple[float, float, float, float]] = []
    try:
        for tbl in page_plumber.find_tables():
            bb = tbl.bbox
            if bb:
                _tbl_bboxes_sorted.append(bb)
    except Exception:
        pass
    # Pair each table block with its top y (converted to the same coord system
    # as line_top: distance from page bottom).
    # pdfplumber bbox is (x0, top, x1, bottom) in page-top-origin coords.
    # line_top = page_height - bbox[3] (fitz), but pdfplumber tops ≈ fitz tops
    # for a non-rotated page.  Convert: y_sorted = page_height - plumber_top.
    page_height_for_tbl = page_fitz.rect.height
    table_blocks_with_y: List[Tuple[float, Block]] = []
    for idx, tb in enumerate(table_blocks_raw):
        if idx < len(_tbl_bboxes_sorted):
            plumber_top = _tbl_bboxes_sorted[idx][1]
            ty = page_height_for_tbl - plumber_top
        else:
            ty = 0.0
        table_blocks_with_y.append((ty, tb))

    # --- Images ---
    image_blocks = _extract_images(page_fitz, doc_fitz, img_counter)

    # --- Text blocks ---
    raw_dict = page_fitz.get_text("rawdict", flags=7)
    # We track each text block with its top-y for interleaving with tables.
    # List of (y_top, Block)
    text_blocks_with_y: List[Tuple[float, Block]] = []

    for blk in raw_dict.get("blocks", []):
        if blk.get("type") != 0:   # 0 = text, 1 = image (handled separately)
            continue
        blk_bbox = blk.get("bbox", (0, 0, 0, 0))
        blk_x0   = blk_bbox[0]
        blk_top  = page_height - blk_bbox[3]
        blk_bot  = page_height - blk_bbox[1]

        # Skip text that falls inside a table region.
        # Use raw bbox coords (fitz/pdfplumber: top-left origin, y increases down)
        # to match the coordinate system of table_bboxes from pdfplumber.
        if _in_table(blk_bbox[0], blk_bbox[1], blk_bbox[2], blk_bbox[3], table_bboxes):
            continue

        # Gather all lines in this block.
        for line in blk.get("lines", []):
            line_bbox = line.get("bbox", (0, 0, 0, 0))
            line_x0   = line_bbox[0]
            line_top  = page_height - line_bbox[3]
            line_bot  = page_height - line_bbox[1]
            line_h    = line_bot - line_top

            if line_h <= 0:
                continue

            # ── Running header/footer filter ─────────────────────────────────
            # Exclude any line that sits within the header/footer margin at the
            # top or bottom of the page.  This must be checked BEFORE any style
            # classification so that small-font header text is never promoted to
            # <sup> or any other content block.
            if (line_top < _HEADER_FOOTER_MARGIN or
                    line_bot > page_height - _HEADER_FOOTER_MARGIN):
                continue

            # Also skip lines that fall inside a table region (belt-and-suspenders).
            # Use raw bbox coords (same system as table_bboxes from pdfplumber).
            if _in_table(line_bbox[0], line_bbox[1], line_bbox[2], line_bbox[3], table_bboxes):
                continue

            # Collect spans in this line.
            # ----------------------------------------------------------------
            # PyMuPDF rawdict layout (flags=7):
            #   block → lines[] → spans[] → chars[]
            #
            # Span-level attributes (read from span_dict):
            #   size, font, flags, color, alpha, ascender, descender, origin, bbox
            #
            # Char-level attributes (read from char_dict):
            #   c (character), origin (baseline point), bbox, synthetic
            #
            # IMPORTANT: font name, font size, and style flags are on the SPAN,
            # not on individual characters.  Chars carry only position + glyph.
            # ----------------------------------------------------------------
            spans: List[Span] = []
            line_sizes: List[float] = []
            line_bold_count = 0
            line_total_count = 0
            is_mono_line = True
            # Track right edge of the previous span so we can insert synthetic
            # space characters for code-block indentation reconstruction.
            prev_span_x1: float = -1.0

            for span_dict in line.get("spans", []):
                # ── Span-level styling attributes ───────────────────────────
                font_name = span_dict.get("font", "")
                font_size = span_dict.get("size", body_size)
                flags_val = span_dict.get("flags", 0)

                bold   = bool(flags_val & 16) or _is_bold_font(font_name)
                italic = bool(flags_val & 2)  or _is_italic_font(font_name)
                mono   = bool(flags_val & 8)  or _is_monospace(font_name)

                # Sub/sup: the entire span is smaller AND has a real vertical
                # baseline shift.  Monospace (code) fonts are never sub/sup.
                # A plain font-size reduction with no shift must NOT become
                # <sup>/<sub> — it maps to a <span style="font-size:smaller">.
                sub_span = sup_span = False
                smaller_span = False   # plain font-size reduction, no shift
                if font_size < body_size * _SUBSUP_SIZE_RATIO and not mono:
                    # Coordinate system: PyMuPDF rawdict spans do NOT carry an
                    # "origin" key — that field exists on individual chars only.
                    # We derive the vertical position from the span's bbox.
                    #
                    # PyMuPDF bbox is (x0, y0, x1, y1) with y increasing DOWNWARD
                    # from the page top (y0 = top of glyph box, y1 = bottom).
                    # line_top / line_bot are computed as page_height − bbox_y,
                    # which FLIPS to a BOTTOM-UP system where LARGER values mean
                    # HIGHER on the page:
                    #   line_top = page_height − line_bbox[3]  (visual top → large)
                    #   line_bot = page_height − line_bbox[1]  (visual bot → small)
                    #
                    # Applying the same flip to the span bbox:
                    #   sp_hi = page_height − sp_bbox[1]  (visual top of span → large)
                    #   sp_lo = page_height − sp_bbox[3]  (visual bot of span → small)
                    #   sp_ctr = (sp_hi + sp_lo) / 2      (vertical centre of span)
                    #
                    # mid_y = (line_top + line_bot) / 2   (vertical centre of line)
                    #
                    # Decision: compare span's vertical CENTRE to the line's
                    # vertical centre.  A threshold of 3% of line height avoids
                    # false positives from minor rounding in the PDF renderer
                    # while still catching typical sub/sup offsets (~9% shift):
                    #
                    #   superscript: span centre is ABOVE line centre →
                    #       sp_ctr > mid_y + threshold
                    #   subscript:   span centre is BELOW line centre →
                    #       sp_ctr < mid_y − threshold
                    #
                    # Additionally, PyMuPDF sets flags bit 0 (value 1) for
                    # superscript characters in some fonts — honour that as a
                    # tiebreaker when the positional shift is ambiguous.
                    sp_bbox_local = span_dict.get("bbox", line_bbox)
                    # In our bottom-up flipped system:
                    sp_hi  = page_height - sp_bbox_local[1]  # visual top (large = high)
                    sp_lo  = page_height - sp_bbox_local[3]  # visual bottom (small = low)
                    sp_ctr = (sp_hi + sp_lo) / 2
                    mid_y  = (line_top + line_bot) / 2
                    threshold = line_h * 0.03   # 3% of line height
                    if sp_ctr > mid_y + threshold:
                        # Span centre is above the line centre → superscript
                        sup_span = True
                    elif sp_ctr < mid_y - threshold:
                        # Span centre is below the line centre → subscript
                        sub_span = True
                    elif bool(flags_val & 1):
                        # PyMuPDF flags bit 0 = superscript marker
                        sup_span = True
                    else:
                        smaller_span = True   # size-only, no offset

                # Underline / strikethrough: check drawn lines vs span bbox.
                # Strikethrough: only mark this span if the drawn rule's x-range
                # substantially overlaps THIS span's x-range (not just any span
                # on the line).  This prevents a rule over one phrase from being
                # applied to the rest of the sentence.
                sp_bbox = span_dict.get("bbox", line_bbox)
                sp_x0 = sp_bbox[0]
                sp_x1 = sp_bbox[2]
                sp_y0 = page_height - sp_bbox[3]   # top in top-down coords
                sp_y1 = page_height - sp_bbox[1]   # bottom
                sp_h  = sp_y1 - sp_y0

                underline_span = False
                strike_span    = False
                for dl in drawn_lines:
                    # Require the drawn rule to overlap this span horizontally.
                    # Use a strict overlap: rule must cover at least 40% of the
                    # span's width OR the span must cover at least 40% of the
                    # rule's width — whichever is smaller wins.
                    overlap_x0 = max(dl["x0"], sp_x0)
                    overlap_x1 = min(dl["x1"], sp_x1)
                    if overlap_x1 <= overlap_x0:
                        continue   # no horizontal overlap at all
                    span_w = max(sp_x1 - sp_x0, 0.1)
                    rule_w = max(dl["x1"] - dl["x0"], 0.1)
                    overlap_w = overlap_x1 - overlap_x0
                    if overlap_w / span_w < 0.4 and overlap_w / rule_w < 0.4:
                        continue   # too little overlap
                    ly = dl["mid_y"]
                    if sp_y1 - sp_h * 0.25 <= ly <= sp_y1 + sp_h * 0.35:
                        underline_span = True
                    elif sp_y0 + sp_h * 0.3 <= ly <= sp_y0 + sp_h * 0.7:
                        strike_span = True

                # Link: check against the span's bbox centre.
                link_uri = _link_for_span(sp_x0, sp_y0, sp_x1, sp_y1, links)

                # ── Accumulate characters into a single Span object ──────────
                # For symbol fonts (ZapfDingbats, etc.) the ToUnicode map may be
                # absent or wrong.  Attempt to remap via glyph name lookup first;
                # fall back to the raw character from pdfminer/PyMuPDF.
                fn_lower = font_name.lower().replace("-", "").replace(" ", "")
                is_symbol_font = any(bf in fn_lower for bf in _BULLET_FONTS)
                chars_out: List[str] = []
                for ch in span_dict.get("chars", []):
                    raw_c = ch.get("c", "")
                    if is_symbol_font:
                        # Try glyph name first (PyMuPDF rawdict does not expose
                        # glyph names directly, but the char code for well-known
                        # symbol fonts can be remapped via ordinal lookup).
                        ordval = ord(raw_c) if raw_c else -1
                        # ZapfDingbats / Symbol ordinal remapping for common glyphs.
                        # U+F000 prefix: private-use remapped by pdfminer.
                        if 0xF000 <= ordval <= 0xF0FF:
                            ordval -= 0xF000
                        mapped = _SYMBOL_ORDINAL_TO_UNICODE.get(ordval, raw_c)
                        chars_out.append(mapped)
                    else:
                        chars_out.append(raw_c)
                span_text = "".join(chars_out)
                # fix: arrow and special character encoding — remap known
                # glyph-corruption sequences to their correct Unicode codepoints.
                for _corrupt, _correct in _GLYPH_CORRUPTION_MAP.items():
                    if _corrupt in span_text:
                        span_text = span_text.replace(_corrupt, _correct)
                if not span_text:
                    continue

                new_span = Span(
                    text=span_text,
                    bold=bold, italic=italic,
                    underline=underline_span, strike=strike_span,   # fix: underline preservation
                    sub=sub_span, sup=sup_span,                     # fix: superscript and subscript
                    smaller=smaller_span,
                    link=link_uri, font_name=font_name, font_size=font_size,
                )

                # For monospace (code) spans: if there is a visual gap between
                # the right edge of the previous span and the left edge of this
                # one, insert synthetic space characters to preserve indentation.
                # One monospace character ≈ font_size * 0.6 pts wide.
                if mono and spans and prev_span_x1 > 0:
                    gap = sp_x0 - prev_span_x1
                    char_width = max(font_size * 0.6, 1.0)
                    n_spaces = int(round(gap / char_width))
                    if n_spaces > 0:
                        # Add spaces to the previous span's text (same font).
                        spans[-1].text += " " * n_spaces

                # Update the right-edge tracker.
                prev_span_x1 = sp_x1

                # Merge with previous span if styling is identical (saves tags).
                # Do NOT merge across symbol/dingbat font boundaries — a bullet
                # glyph from ZapfDingbats must stay in its own span so font-based
                # bullet detection can strip it separately.
                prev_fn_lower = spans[-1].font_name.lower() if spans else ""
                prev_is_symbol = any(bf in prev_fn_lower for bf in _BULLET_FONTS)
                cur_fn_lower = font_name.lower()
                cur_is_symbol = any(bf in cur_fn_lower for bf in _BULLET_FONTS)
                if (spans and
                        spans[-1].bold == bold and
                        spans[-1].italic == italic and
                        spans[-1].underline == underline_span and
                        spans[-1].strike == strike_span and
                        spans[-1].sub == sub_span and
                        spans[-1].sup == sup_span and
                        spans[-1].smaller == smaller_span and
                        spans[-1].link == link_uri and
                        not mono and
                        not _is_monospace(spans[-1].font_name) and
                        not prev_is_symbol and
                        not cur_is_symbol):
                    spans[-1].text += span_text
                else:
                    spans.append(new_span)

                # Update line-level aggregates.
                char_count = max(1, len(span_dict.get("chars", [])))
                line_sizes.extend([font_size] * char_count)
                line_total_count += char_count
                if bold:
                    line_bold_count += char_count
                # Skip whitespace-only or zero-length spans when evaluating
                # whether the line is fully monospace.
                if not mono and span_text.strip():
                    is_mono_line = False

            if not spans:
                continue

            plain = _plain_text(spans).strip()
            if not plain:
                continue

            avg_size = sum(line_sizes) / len(line_sizes) if line_sizes else body_size
            is_bold  = line_bold_count / max(line_total_count, 1) >= 0.6

            # --- Code block detection --- fix: code block preservation
            # A line is a code line only when ALL spans are monospace.
            # The old size guard (avg_size >= body_size * _SUBSUP_SIZE_RATIO) is
            # removed: code fonts are often typeset at 9–10pt in a 12pt document,
            # which is below the sub/sup threshold.  Monospace spans are already
            # excluded from sub/sup detection (see `not mono` guard above), so
            # there is no ambiguity.
            if is_mono_line:
                text_blocks_with_y.append((line_top, Block(
                    kind="code",
                    spans=spans,
                    x0=line_x0,
                    page_no=page_no,
                )))
                continue

            # --- Heading detection --- fix: heading hierarchy detection
            heading_kind = _classify_heading(avg_size, is_bold, body_size,
                                              h3_min, h2_min, h1_min)
            if heading_kind:
                anchor_base = _slugify(plain)
                count = heading_anchor_counter.get(anchor_base, 0)
                heading_anchor_counter[anchor_base] = count + 1
                anchor_id = anchor_base if count == 0 else f"{anchor_base}-{count}"
                text_blocks_with_y.append((line_top, Block(
                    kind=heading_kind,
                    spans=spans,
                    anchor_id=anchor_id,
                    x0=line_x0,
                    page_no=page_no,
                )))
                continue

            # --- List item detection --- fix: unordered list structure, ordered list structure
            # Primary: text-based prefix detection.
            # Use _detect_list_prefix on the joined plain text; the returned
            # prefix_len lets us strip exactly those characters from the spans.
            is_li, is_ordered, stripped, prefix_len = _detect_list_prefix(plain)

            # Secondary: font-based bullet detection.
            # Some PDFs render bullets using ZapfDingbats/Symbol/Wingdings.
            # In rawdict these appear as separate spans before the text span.
            # Detect: first span is a known bullet font → unordered list item,
            # strip that span from the display text.
            if not is_li and spans:
                first_fn = spans[0].font_name.lower().replace("-","").replace(" ","")
                if any(bf in first_fn for bf in _BULLET_FONTS):
                    is_li, is_ordered = True, False
                    # The bullet glyph span is stripped; remaining spans are the text.
                    if len(spans) > 1:
                        spans = spans[1:]
                        # Also strip any leading whitespace from the new first span.
                        if spans and spans[0].text.startswith(" "):
                            sp0 = spans[0]
                            spans[0] = Span(
                                text=sp0.text.lstrip(),
                                bold=sp0.bold, italic=sp0.italic,
                                underline=sp0.underline, strike=sp0.strike,
                                sub=sp0.sub, sup=sp0.sup, smaller=sp0.smaller,
                                link=sp0.link, font_name=sp0.font_name,
                                font_size=sp0.font_size,
                            )
                    else:
                        # Only had the bullet span; no text content.
                        spans = []
                    stripped = _plain_text(spans).strip()
                    prefix_len = 0   # already stripped at span level

            if is_li:
                # Strip the bullet/number prefix from spans using exact character
                # counting so multi-span prefixes (number in one span, text in
                # another) are handled correctly.
                if prefix_len > 0 and spans:
                    spans = _strip_prefix_from_spans(spans, prefix_len)

                if not spans or not _plain_text(spans).strip():
                    # Bug-fix (numbered list ordering + bullet collapse):
                    # The prefix occupied the entire span — the item text will
                    # arrive as the very next rawdict line (a "p" block).
                    # Emit an empty sentinel li so _merge_list_continuations
                    # can attach that next paragraph as the item body.
                    # The sentinel carries ordered/x0 so ordering and indent
                    # levels are preserved; it is never rendered if it stays
                    # empty because _blocks_to_xhtml emits the spans verbatim.
                    text_blocks_with_y.append((line_top, Block(
                        kind="li",
                        spans=[],
                        ordered=is_ordered,
                        x0=line_x0,
                        page_no=page_no,
                    )))
                    continue

                text_blocks_with_y.append((line_top, Block(
                    kind="li",
                    spans=spans,
                    ordered=is_ordered,
                    x0=line_x0,
                    page_no=page_no,
                )))
                continue

            # --- Default paragraph ---
            text_blocks_with_y.append((line_top, Block(
                kind="p",
                spans=spans,
                x0=line_x0,
                page_no=page_no,
            )))

    # Merge text + table blocks into document (reading) order by y-coordinate.
    # Tables were extracted before text parsing and must NOT be hoisted to the top.
    # y-coordinates in our system are "distance from page bottom" (flipped from
    # PyMuPDF bbox coords), so DESCENDING order = top-to-bottom reading order.
    combined_with_y: List[Tuple[float, Block]] = (
        table_blocks_with_y + text_blocks_with_y
    )
    combined_with_y.sort(key=lambda t: t[0], reverse=True)
    text_blocks: List[Block] = [b for _, b in combined_with_y]

    # Coalesce consecutive code lines into single code blocks.
    text_blocks = _coalesce_code_blocks(text_blocks)
    # Merge consecutive paragraph lines into logical paragraphs.
    text_blocks = _merge_paragraph_lines(text_blocks, body_size)
    # Merge consecutive list-item continuation lines.
    text_blocks = _merge_list_continuations(text_blocks)
    # Assign list indent levels.
    _assign_list_indent_levels(text_blocks)
    # Merge adjacent headings of the same level that were split by PDF line breaks.
    text_blocks = _merge_adjacent_headings(text_blocks)
    # Promote indented paragraphs to blockquotes.  # fix: blockquote semantic markup
    page_width = page_fitz.rect.width
    _assign_blockquote_kinds(text_blocks, page_width)

    # Images go at the end of the page (no reliable y-coord from fitz image list).
    all_blocks = text_blocks + image_blocks
    return all_blocks


def _coalesce_code_blocks(blocks: List[Block]) -> List[Block]:
    """Merge consecutive code-kind blocks into a single block (preserving newlines).

    Each source line of code becomes one logical line separated by \\n.
    The accumulated text will later be placed inside <pre><code>...</code></pre>
    so whitespace must NOT be collapsed.

    Leading indentation is reconstructed from each line's x0 offset relative to
    the code block's leftmost x0 (= leftmost column of the block).  This restores
    the visual indentation that PDF rawdict strips from the first token of each line.
    """
    result: List[Block] = []
    for blk in blocks:
        if blk.kind == "code" and result and result[-1].kind == "code":
            acc = result[-1]
            # Compute leading indent for this line relative to block origin.
            # Use the first non-empty span's font size as the character width basis.
            first_sp = next((s for s in blk.spans if s.text.strip()), None)
            char_width = (first_sp.font_size * 0.6) if first_sp else 6.0
            char_width = max(char_width, 1.0)
            # acc.x0 holds the leftmost x0 seen so far; blk.x0 is this line's x0.
            leading_indent = max(0, int(round((blk.x0 - acc.x0) / char_width)))
            # Append newline then leading spaces then this line's spans.
            result[-1].spans.append(Span(text="\n" + " " * leading_indent,
                                         font_name="", font_size=0.0))
            result[-1].spans.extend(blk.spans)
            # Keep acc.x0 as the minimum (leftmost column).
            acc.x0 = min(acc.x0, blk.x0)
        else:
            result.append(blk)
    return result


def _merge_paragraph_lines(blocks: List[Block], body_size: float) -> List[Block]:
    """
    Merge consecutive paragraph-kind blocks that belong to the same logical
    paragraph into a single block.

    Two adjacent 'p' blocks are merged when ALL of the following hold:
    • Both have kind == 'p'
    • Their x0 positions are within a small tolerance (same left margin, i.e. not
      an indent that indicates a new paragraph)
    • The first block does not end with sentence-terminal punctuation followed by
      significant whitespace (heuristic for inter-sentence gap)
    • The font size of both blocks is within a small tolerance (same style)

    Inter-block gaps (blank lines / spacing) are NOT directly available after
    the line-by-line iteration, so we rely on x0 similarity as the primary
    paragraph-boundary signal, supplemented by a trailing-punctuation heuristic.
    """
    if not blocks:
        return blocks

    result: List[Block] = []
    for blk in blocks:
        if (blk.kind == "p" and
                result and
                result[-1].kind == "p"):
            prev = result[-1]
            prev_plain = _plain_text(prev.spans).strip()
            cur_plain  = _plain_text(blk.spans).strip()

            # Same left margin (within 4 pts)?
            same_margin = abs(blk.x0 - prev.x0) < 4.0

            # Does previous line end mid-sentence?  Sentence terminals are
            # '.', '!', '?' when followed by nothing (line ends).  A trailing
            # comma/semicolon/colon always means continuation.
            ends_sentence = bool(re.search(r'[.!?]["\')]?\s*$', prev_plain))

            # If previous line ends a sentence AND the new line starts with an
            # uppercase letter at the same margin, treat as a new paragraph.
            starts_new = (cur_plain and cur_plain[0].isupper()
                          and ends_sentence and same_margin)

            # Different left margin always means new paragraph.
            if not same_margin or starts_new:
                result.append(blk)
            else:
                # Merge: append a space then the new line's spans.
                if prev.spans and prev_plain and not prev_plain.endswith(" "):
                    prev.spans[-1].text += " "
                prev.spans.extend(blk.spans)
        else:
            result.append(blk)
    return result


def _merge_list_continuations(blocks: List[Block]) -> List[Block]:
    """
    Merge 'p' blocks that immediately follow a 'li' and are indented PAST the
    li's x0 into that list item's spans.

    A continuation line is an unwrapped second (or third…) visual line of the
    same bullet point — identified by:
    • The preceding block is a 'li'
    • The current block is a 'p'
    • The 'p' x0 is strictly greater than the 'li' x0 (indented past the bullet)
      OR within a small tolerance (≤ 4 pts) of the li's x0.

    Crucially: a 'p' at exactly the same x0 as a TOP-LEVEL list item is NOT a
    continuation — it is a new paragraph between list groups, or the text of a
    list item that happens to start at the left margin (e.g. the label of a
    two-level list like "Vegetables" following nested items).  We detect this by
    comparing against the minimum x0 of all li blocks on the page: if the 'p'
    x0 equals the minimum li x0, treat it as a new paragraph, not a continuation.
    """
    if not blocks:
        return blocks

    # Find the minimum li x0 on this page (= left edge of outermost list items).
    min_li_x0 = min((b.x0 for b in blocks if b.kind == "li"), default=None)

    result: List[Block] = []
    for blk in blocks:
        if (blk.kind == "p" and
                result and
                result[-1].kind == "li"):
            prev = result[-1]
            # A 'p' at exactly the leftmost list margin is NOT a continuation —
            # it's either a new paragraph or a second-level list label.
            at_list_margin = (
                min_li_x0 is not None and abs(blk.x0 - min_li_x0) < 4.0
            )
            # Bug-fix (numbered list ordering + bullet collapse):
            # An empty sentinel li (spans=[]) ALWAYS absorbs the next 'p' as its
            # body, regardless of x0 position — the sentinel was emitted precisely
            # because the prefix was a bare glyph/number with no text on that line.
            sentinel = not bool(_plain_text(prev.spans).strip())
            if sentinel or (not at_list_margin and blk.x0 >= prev.x0 - 4.0):
                # Append as continuation text.
                plain_prev = _plain_text(prev.spans).strip()
                if prev.spans and plain_prev and not plain_prev.endswith(" "):
                    prev.spans[-1].text += " "
                prev.spans.extend(blk.spans)
                continue
        result.append(blk)
    return result


def _assign_list_indent_levels(blocks: List[Block]) -> None:
    """Set indent_level on each 'li' block based on x0 relative to its peers."""
    li_x0s = [b.x0 for b in blocks if b.kind == "li"]
    if not li_x0s:
        return
    min_x0 = min(li_x0s)
    for blk in blocks:
        if blk.kind == "li":
            level = int((blk.x0 - min_x0) / _LIST_INDENT_STEP)
            blk.indent_level = max(0, level)


def _merge_adjacent_headings(blocks: List[Block]) -> List[Block]:
    """
    Merge consecutive heading blocks of the same kind/level that are separated
    only by a PDF line break (not by any intervening non-heading block).

    This fixes the case where a long heading is broken across two visual lines
    by the PDF layout engine — both lines are classified as headings at the same
    level and should be joined into a single heading element.

    Only merge when ALL of the following hold:
    • Both blocks are the same heading kind (h1, h2, or h3).
    • There is no intervening non-heading block between them.
    • The previous heading does NOT end with sentence-terminal punctuation.
    • The combined plain text of both lines does NOT exceed 120 characters —
      headings that would be longer than this are almost certainly two distinct
      headings (e.g. a document title followed immediately by a section heading)
      rather than a single heading wrapped across two PDF lines.
    """
    result: List[Block] = []
    _HEADING_KINDS = ("h1", "h2", "h3")
    _SENTENCE_END = re.compile(r'[.!?]\s*$')
    _MAX_MERGED_LEN = 120   # characters — longer than this → keep as separate headings

    for blk in blocks:
        if (blk.kind in _HEADING_KINDS and
                result and
                result[-1].kind == blk.kind):
            prev = result[-1]
            prev_plain = _plain_text(prev.spans).strip()
            cur_plain  = _plain_text(blk.spans).strip()
            # Guard 1: previous heading must not end a sentence.
            # Guard 2: the combined text must fit within a single-heading budget.
            if (not _SENTENCE_END.search(prev_plain) and
                    len(prev_plain) + 1 + len(cur_plain) <= _MAX_MERGED_LEN):
                # Join with a single space.
                if prev.spans and not prev_plain.endswith(" "):
                    prev.spans[-1].text += " "
                prev.spans.extend(blk.spans)
                continue
        result.append(blk)
    return result


def _assign_blockquote_kinds(blocks: List[Block], page_width: float) -> None:
    """
    Promote paragraph blocks that are indented significantly beyond the page
    body text margin to kind='blockquote'.  # fix: blockquote semantic markup

    Strategy:
    • Find the most common x0 among all 'p' blocks on this page — that is the
      body text left margin.
    • Any 'p' block whose x0 exceeds (body_margin + 15% of page_width) is
      promoted to 'blockquote'.  Code blocks (kind='code') and list items
      (kind='li') are never promoted.
    • We require at least two 'p' blocks at the normal margin before promoting
      anything, to avoid false positives on pages that are only indented content.
    """
    p_x0s = [b.x0 for b in blocks if b.kind == "p"]
    if len(p_x0s) < 2:
        return

    # Body margin = most common x0 among paragraphs (rounded to 1pt).
    x0_counts: Dict[float, int] = defaultdict(int)
    for x in p_x0s:
        x0_counts[round(x, 0)] += 1
    body_margin = max(x0_counts, key=x0_counts.__getitem__)

    # Threshold: 15% of page width beyond the body margin.
    indent_min = max(page_width * _BLOCKQUOTE_PAGE_FRAC, 12.0)  # floor at 12pt

    for blk in blocks:
        if blk.kind == "p":
            if blk.x0 >= body_margin + indent_min:
                blk.kind = "blockquote"


# ---------------------------------------------------------------------------
# First-pass: gather all font sizes for threshold computation
# ---------------------------------------------------------------------------

def _gather_font_sizes(doc_fitz) -> List[float]:
    """
    Collect all font sizes from the document.

    PyMuPDF rawdict structure:
        block → line → span → chars[]
    Font attributes (size, font name, flags) are on the **span** level.
    Individual chars only carry: origin, bbox, c, synthetic.
    """
    sizes = []
    for page in doc_fitz:
        raw = page.get_text("rawdict", flags=7)
        for blk in raw.get("blocks", []):
            if blk.get("type") != 0:
                continue
            for line in blk.get("lines", []):
                for span in line.get("spans", []):
                    sz = span.get("size", 0)
                    # Weight by number of characters so a single giant heading
                    # doesn't overwhelm; append once per span.
                    if sz > 2:
                        char_count = max(1, len(span.get("chars", [])))
                        sizes.extend([sz] * char_count)
    return sizes


# ---------------------------------------------------------------------------
# HTML serialiser
# ---------------------------------------------------------------------------

def _escape(text: str) -> str:
    return (text.replace("&", "&amp;")
               .replace("<", "&lt;")
               .replace(">", "&gt;")
               .replace('"', "&quot;"))


def _spans_to_html(spans: List[Span]) -> str:
    parts = []
    i = 0
    while i < len(spans):
        s = spans[i]
        txt = _escape(s.text)
        if not txt:
            i += 1
            continue

        # Wrap with decorators (innermost first so nesting is correct).
        if s.sub:
            txt = f"<sub>{txt}</sub>"
        elif s.sup:
            txt = f"<sup>{txt}</sup>"
        elif s.smaller:
            # Plain font-size reduction, no baseline shift → NOT <sup>/<sub>
            txt = f'<span style="font-size:smaller">{txt}</span>'

        if s.strike:
            txt = f"<s>{txt}</s>"
        if s.underline:
            txt = f"<u>{txt}</u>"
        if s.italic:
            txt = f"<em>{txt}</em>"
        if s.bold:
            txt = f"<strong>{txt}</strong>"
        if s.link:
            txt = f'<a href="{_escape(s.link)}">{txt}</a>'

        parts.append(txt)
        i += 1
    return "".join(parts)


def _blocks_to_xhtml(blocks: List[Block], img_dir_rel: str = "images") -> str:
    """Convert a list of Block objects to an XHTML body string."""
    lines = []
    i = 0
    # list_stack entries: [tag, indent_level]  (mutable so we can update them)
    list_stack: List[List] = []   # [[tag, indent_level], ...]

    def _close_lists_deeper_than(target_level: int) -> None:
        """Close all list levels strictly deeper than target_level."""
        while list_stack and list_stack[-1][1] > target_level:
            tag = list_stack.pop()[0]
            lines.append(f"</{tag}>")

    def _flush_lists() -> None:
        while list_stack:
            tag = list_stack.pop()[0]
            lines.append(f"</{tag}>")

    while i < len(blocks):
        blk = blocks[i]

        # Close any open list if we're not on a list item.
        if blk.kind != "li" and list_stack:
            _flush_lists()

        if blk.kind in ("h1", "h2", "h3"):
            tag = blk.kind
            aid = f' id="{_escape(blk.anchor_id)}"' if blk.anchor_id else ""
            lines.append(f"<{tag}{aid}>{_spans_to_html(blk.spans)}</{tag}>")

        elif blk.kind == "p":
            lines.append(f"<p>{_spans_to_html(blk.spans)}</p>")

        elif blk.kind == "blockquote":
            # Coalesce consecutive blockquote blocks into one <blockquote> element
            # so that attribution lines and multi-paragraph quotes stay together.
            # fix: blockquote semantic markup
            inner = [f"<p>{_spans_to_html(blk.spans)}</p>"]
            while i + 1 < len(blocks) and blocks[i + 1].kind == "blockquote":
                i += 1
                inner.append(f"<p>{_spans_to_html(blocks[i].spans)}</p>")
            lines.append(f"<blockquote>{''.join(inner)}</blockquote>")

        elif blk.kind == "code":
            # Reconstruct code text preserving every space and newline.
            # The spans list contains regular text spans interleaved with
            # newline-sentinel spans (text="\n") inserted by _coalesce_code_blocks.
            # We output them verbatim — _escape will turn '<'/'>' safe but must NOT
            # collapse spaces or newlines.
            code_text = "".join(s.text for s in blk.spans)
            lines.append(f"<pre><code>{_escape(code_text)}</code></pre>")

        elif blk.kind == "li":
            lvl = blk.indent_level
            needed_tag = "ol" if blk.ordered else "ul"

            # Step 1: close any levels deeper than the current item's level.
            _close_lists_deeper_than(lvl)

            # Step 2: if there is no open list at this level, open one.
            if not list_stack or list_stack[-1][1] < lvl:
                lines.append(f"<{needed_tag}>")
                list_stack.append([needed_tag, lvl])
            elif list_stack[-1][1] == lvl and list_stack[-1][0] != needed_tag:
                # Same level but wrong type (ul vs ol): close and re-open.
                lines.append(f"</{list_stack[-1][0]}>")
                list_stack.pop()
                lines.append(f"<{needed_tag}>")
                list_stack.append([needed_tag, lvl])

            # Bug-fix (numbered list ordering + bullet collapse):
            # A sentinel li (empty spans, body was merged by _merge_list_continuations)
            # should still be emitted — if spans are empty at this point, the item
            # was never followed by a continuation paragraph and the text is truly
            # absent; skip it rather than emitting a bare <li></li>.
            item_html = _spans_to_html(blk.spans)
            if item_html:
                lines.append(f"<li>{item_html}</li>")

        elif blk.kind == "table":
            lines.append("<table>")
            for ri, row in enumerate(blk.rows):
                if ri == 0 and blk.first_row_is_header:
                    lines.append("<thead><tr>")
                    cell_tag = "th"
                elif ri == 1 and blk.first_row_is_header:
                    lines.append("</thead><tbody><tr>")
                    cell_tag = "td"
                elif ri == 0:
                    lines.append("<tbody><tr>")
                    cell_tag = "td"
                else:
                    lines.append("<tr>")
                    cell_tag = "td"
                for (cell_text, rspan, cspan) in row:
                    attrs = ""
                    if rspan > 1:
                        attrs += f' rowspan="{rspan}"'
                    if cspan > 1:
                        attrs += f' colspan="{cspan}"'
                    lines.append(
                        f"<{cell_tag}{attrs}>{_escape(cell_text)}</{cell_tag}>"
                    )
                if ri == 0 and blk.first_row_is_header:
                    lines.append("</tr>")
                elif ri == len(blk.rows) - 1:
                    lines.append("</tr></tbody>")
                else:
                    lines.append("</tr>")
            lines.append("</table>")

        elif blk.kind == "img":
            src = f"{img_dir_rel}/{blk.img_id}.{blk.img_ext}"
            lines.append(
                f'<div class="img-wrap"><img src="{src}" alt="image"/></div>'
            )

        elif blk.kind == "hr":
            lines.append("<hr/>")

        i += 1

    _flush_lists()
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# EPUB3 packager
# ---------------------------------------------------------------------------

_EPUB_CSS = """\
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.6;
  margin: 0 auto;
  max-width: 42em;
  padding: 1em 1.5em;
}
h1, h2, h3 { font-weight: bold; margin-top: 1.4em; margin-bottom: 0.4em; }
h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.2em; }
p  { margin: 0.6em 0; text-align: justify; }
ul, ol { margin: 0.6em 0 0.6em 1.8em; }
li { margin: 0.3em 0; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.4em 0.6em;
  text-align: left;
  vertical-align: top;
}
th { background: #f4f4f4; font-weight: bold; }
pre {
  background: #f8f8f8;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.85em;
  line-height: 1.4;
  overflow-x: auto;
  padding: 0.8em 1em;
  white-space: pre;
}
code { font-family: "Courier New", Courier, monospace; font-size: 0.85em; }
blockquote {
  border-left: 3px solid #ccc;
  margin: 0.8em 0 0.8em 1.5em;
  padding: 0.4em 0 0.4em 1em;
  color: #555;
  font-style: italic;
}
blockquote p { margin: 0; }
.img-wrap { text-align: center; margin: 1em 0; }
img { max-width: 100%; height: auto; }
"""

_XHTML_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="../styles/main.css"/>
</head>
<body>
{body}
</body>
</html>"""

_NAV_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="../styles/main.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
{nav_items}
  </nav>
</body>
</html>"""

_NCX_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="{uid}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>{title}</text></docTitle>
  <navMap>
{nav_points}
  </navMap>
</ncx>"""

_OPF_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         version="3.0"
         unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">{uid}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    <item id="ncx"  href="toc.ncx"            media-type="application/x-dtbncx+xml"/>
    <item id="nav"  href="Text/nav.xhtml"      media-type="application/xhtml+xml"
          properties="nav"/>
    <item id="css"  href="styles/main.css"     media-type="text/css"/>
{cover_item}
    <item id="content" href="Text/content.xhtml" media-type="application/xhtml+xml"/>
{image_items}
  </manifest>
  <spine toc="ncx">
    <itemref idref="nav" linear="no"/>
    <itemref idref="content"/>
  </spine>
</package>"""


def _build_epub(
    blocks: List[Block],
    title: str,
    epub_path: str,
    cover_path: Optional[str] = None,
) -> None:
    """Assemble all blocks into an EPUB3 zip archive."""
    import datetime, uuid

    uid  = str(uuid.uuid4())
    mod  = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── Build nav/NCX entries from headings ─────────────────────────────
    # nav.xhtml uses a proper nested <ol> / <li> structure.
    #
    # We maintain a stack of (level, li_is_open) pairs where:
    #   level      = heading level (1, 2, or 3)
    #   li_is_open = True if the <li> for this level has been emitted but not
    #                yet closed with </li>
    #
    # Algorithm for a heading of level N:
    #   1. While the stack top has level > N: close </li> (if open) + </ol>, pop.
    #   2. If stack top has level == N: close </li> (the previous sibling).
    #   3. If stack is now empty or top level < N: open <ol>, push (N, False).
    #   4. Emit <li>, mark the top as li_is_open=True.
    nav_items_lines: List[str] = []
    nav_points_lines: List[str] = []
    play_order = 1
    # Stack entries: (heading_level: int, li_open: bool)
    nav_stack: List[List] = []   # mutable entries [level, li_open]

    def _nav_ind(depth: int) -> str:
        """Return indentation: 2 spaces per depth level, base 4 spaces."""
        return "    " + "  " * depth

    def _nav_pop_to(target_level: int) -> None:
        """Close all stack levels strictly above target_level."""
        while nav_stack and nav_stack[-1][0] > target_level:
            depth = len(nav_stack)
            if nav_stack[-1][1]:   # li is open
                nav_items_lines.append(f"{_nav_ind(depth)}</li>")
                nav_stack[-1][1] = False
            nav_items_lines.append(f"{_nav_ind(depth - 1)}</ol>")
            nav_stack.pop()

    for blk in blocks:
        if blk.kind not in ("h1", "h2", "h3"):
            continue
        label = _escape(_plain_text(blk.spans))
        src   = f"Text/content.xhtml#{blk.anchor_id}"
        level = int(blk.kind[1])   # 1, 2, or 3

        # Step 1: pop levels strictly deeper than current.
        _nav_pop_to(level)

        # Step 2: if the top is the same level, close the previous <li>.
        if nav_stack and nav_stack[-1][0] == level:
            depth = len(nav_stack)
            if nav_stack[-1][1]:
                nav_items_lines.append(f"{_nav_ind(depth)}</li>")
                nav_stack[-1][1] = False

        # Step 3: open a new <ol> if we need to go deeper or start fresh.
        if not nav_stack or nav_stack[-1][0] < level:
            depth = len(nav_stack)
            nav_items_lines.append(f"{_nav_ind(depth)}<ol>")
            nav_stack.append([level, False])

        # Step 4: emit the <li> and mark it open.
        depth = len(nav_stack)
        nav_items_lines.append(
            f'{_nav_ind(depth)}<li><a href="{src}">{label}</a>'
        )
        nav_stack[-1][1] = True   # li_open = True

        nav_points_lines.append(
            f'    <navPoint id="np{play_order}" playOrder="{play_order}">'
            f'<navLabel><text>{label}</text></navLabel>'
            f'<content src="{src}"/></navPoint>'
        )
        play_order += 1

    # Close everything remaining.
    _nav_pop_to(0)   # closes all levels + their open <li>s
    while nav_stack:
        depth = len(nav_stack)
        if nav_stack[-1][1]:
            nav_items_lines.append(f"{_nav_ind(depth)}</li>")
        nav_items_lines.append(f"{_nav_ind(depth - 1)}</ol>")
        nav_stack.pop()

    nav_items_str  = "\n".join(nav_items_lines)
    nav_points_str = "\n".join(nav_points_lines)

    # ── Build XHTML body ─────────────────────────────────────────────────
    body_html  = _blocks_to_xhtml(blocks, img_dir_rel="../images")
    content_xhtml = _XHTML_TEMPLATE.format(title=_escape(title), body=body_html)
    nav_xhtml     = _NAV_TEMPLATE.format(nav_items=nav_items_str)
    ncx_xml       = _NCX_TEMPLATE.format(uid=uid, title=_escape(title),
                                          nav_points=nav_points_str)

    # ── Image manifest entries ───────────────────────────────────────────
    image_items_lines: List[str] = []
    for blk in blocks:
        if blk.kind == "img":
            mime = "image/jpeg" if blk.img_ext in ("jpg", "jpeg") else f"image/{blk.img_ext}"
            image_items_lines.append(
                f'    <item id="{blk.img_id}" '
                f'href="images/{blk.img_id}.{blk.img_ext}" '
                f'media-type="{mime}"/>'
            )

    cover_item_str = ""
    if cover_path:
        cover_ext  = Path(cover_path).suffix.lstrip(".").lower() or "jpg"
        cover_mime = "image/jpeg" if cover_ext in ("jpg", "jpeg") else f"image/{cover_ext}"
        cover_item_str = (
            f'    <item id="cover-image" href="images/cover.{cover_ext}" '
            f'media-type="{cover_mime}" properties="cover-image"/>'
        )

    opf_xml = _OPF_TEMPLATE.format(
        uid=uid,
        title=_escape(title),
        modified=mod,
        cover_item=cover_item_str,
        image_items="\n".join(image_items_lines),
    )

    # ── Write EPUB zip ────────────────────────────────────────────────────
    with zipfile.ZipFile(epub_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # mimetype MUST be first and MUST be stored (not deflated).
        mime_info = zipfile.ZipInfo("mimetype")
        mime_info.compress_type = zipfile.ZIP_STORED
        zf.writestr(mime_info, "application/epub+zip")

        zf.writestr("META-INF/container.xml",
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
            '  <rootfiles>\n'
            '    <rootfile full-path="OEBPS/content.opf"'
            ' media-type="application/oebps-package+xml"/>\n'
            '  </rootfiles>\n'
            '</container>'
        )
        zf.writestr("OEBPS/content.opf",          opf_xml)
        zf.writestr("OEBPS/toc.ncx",               ncx_xml)
        zf.writestr("OEBPS/Text/nav.xhtml",        nav_xhtml)
        zf.writestr("OEBPS/Text/content.xhtml",    content_xhtml)
        zf.writestr("OEBPS/styles/main.css",       _EPUB_CSS)

        # Cover image.
        if cover_path and os.path.exists(cover_path):
            cover_ext = Path(cover_path).suffix.lstrip(".").lower() or "jpg"
            with open(cover_path, "rb") as f:
                zf.writestr(f"OEBPS/images/cover.{cover_ext}", f.read())

        # Inline images extracted from PDF.
        for blk in blocks:
            if blk.kind == "img" and blk.img_data:
                zf.writestr(
                    f"OEBPS/images/{blk.img_id}.{blk.img_ext}",
                    blk.img_data,
                )

    _log.info("EPUB written to %s (%d blocks)", epub_path, len(blocks))


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def convert_pdf_to_epub(
    pdf_path: str,
    epub_path: str,
    title: str = "",
    cover_path: Optional[str] = None,
    progress_cb=None,
) -> None:
    """
    Convert *pdf_path* to a semantically structured EPUB3 file at *epub_path*.

    Parameters
    ----------
    pdf_path:
        Absolute path to the source PDF.
    epub_path:
        Absolute path where the output .epub will be written.
    title:
        Human-readable document title.  Defaults to the PDF filename stem.
    cover_path:
        Optional path to a JPEG cover image.
    progress_cb:
        Optional callable ``(pct: int) -> None`` called at key pipeline stages
        so the caller can stream realistic progress to clients.  Values range
        from 5 to 95; the caller is responsible for emitting 100 on completion.

        Stage breakdown (approximate):
          5  – job started / file opened
         15  – font-size scan complete (Pass 1)
         15→75 – per-page parsing (Pass 2, spread evenly across page count)
         88  – HTML serialisation complete
         95  – EPUB zip assembled and written
    """
    import pdfplumber
    import fitz  # PyMuPDF

    def _cb(pct: int) -> None:
        if callable(progress_cb):
            try:
                progress_cb(int(pct))
            except Exception:
                pass   # never let a callback error kill the conversion

    if not title:
        title = Path(pdf_path).stem

    _log.info("pdf_epub_engine: converting %s → %s", pdf_path, epub_path)

    _cb(5)
    doc_fitz     = fitz.open(pdf_path)
    doc_plumber  = pdfplumber.open(pdf_path)

    try:
        # Pass 1: gather all font sizes to calibrate heading thresholds.
        all_sizes = _gather_font_sizes(doc_fitz)
        body_size, h3_min, h2_min, h1_min = _compute_heading_thresholds(all_sizes)
        _log.debug(
            "Font thresholds: body=%.1f  h3≥%.1f  h2≥%.1f  h1≥%.1f",
            body_size, h3_min, h2_min, h1_min,
        )
        _cb(15)

        # Pass 2: parse each page into blocks.
        # Progress advances evenly from 15 → 75 across all pages.
        all_blocks: List[Block] = []
        img_counter: List[int] = [0]
        heading_anchor_counter: Dict[str, int] = {}
        total_pages = len(doc_plumber.pages)
        _PAGE_START = 15
        _PAGE_END   = 75

        for page_no, (page_pl, page_fz) in enumerate(
            zip(doc_plumber.pages, doc_fitz), start=1
        ):
            page_blocks = _parse_page(
                page_pl, page_fz, doc_fitz,
                body_size, h3_min, h2_min, h1_min,
                img_counter, page_no, heading_anchor_counter,
            )
            all_blocks.extend(page_blocks)
            # Emit per-page progress only when total_pages > 1 so single-page
            # PDFs don't emit a flurry of identical callbacks.
            if total_pages > 1:
                page_pct = _PAGE_START + int(
                    (_PAGE_END - _PAGE_START) * page_no / total_pages
                )
                _cb(page_pct)

        _cb(75)

        # Pass 3a: serialise blocks to XHTML (CPU-bound, measurable on large docs).
        _cb(82)

        # Pass 3b: package into EPUB3.
        _build_epub(all_blocks, title, epub_path, cover_path=cover_path)
        _cb(95)

    finally:
        doc_fitz.close()
        doc_plumber.close()


# ---------------------------------------------------------------------------
# Public entry point — PDF → standalone HTML (for Calibre MOBI pipeline)
# ---------------------------------------------------------------------------

# Inline CSS that Calibre will carry into the MOBI output.  Mirrors the EPUB
# stylesheet but uses properties that Calibre / KF8 can honour.
_MOBI_HTML_CSS = """\
body { font-family: Georgia, serif; font-size: 1em; line-height: 1.6; margin: 0 auto; max-width: 42em; padding: 1em 1.5em; }
h1, h2, h3 { font-weight: bold; margin-top: 1.4em; margin-bottom: 0.4em; }
h1 { font-size: 2em; } h2 { font-size: 1.5em; } h3 { font-size: 1.2em; }
p { margin: 0.6em 0; }
ul, ol { margin: 0.6em 0 0.6em 1.8em; } li { margin: 0.3em 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #f4f4f4; font-weight: bold; }
pre { background: #f8f8f8; border: 1px solid #ddd; font-family: "Courier New", Courier, monospace; font-size: 0.85em; line-height: 1.4; padding: 0.8em 1em; white-space: pre-wrap; }
code { font-family: "Courier New", Courier, monospace; font-size: 0.85em; }
blockquote { border-left: 3px solid #ccc; margin: 0.8em 0 0.8em 1.5em; padding: 0.4em 0 0.4em 1em; color: #555; font-style: italic; }
.img-wrap { text-align: center; margin: 1em 0; }
img { max-width: 100%; height: auto; }
"""

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<style>{css}</style>
</head>
<body>
{body}
</body>
</html>"""


def convert_pdf_to_html(
    pdf_path: str,
    html_path: str,
    title: str = "",
    progress_cb=None,
) -> None:
    """
    Convert *pdf_path* to a semantically structured standalone HTML file.

    The HTML contains the same heading/table/code/list structure produced by
    the EPUB engine, but packaged as a single file with inline CSS.  Intended
    as an intermediate step for Calibre-based conversions (e.g. PDF → MOBI)
    where the intermediate HTML provides far better structure than feeding the
    raw PDF to Calibre directly.

    Parameters
    ----------
    pdf_path:
        Absolute path to the source PDF.
    html_path:
        Absolute path where the output .html will be written.
    title:
        Human-readable document title.
    progress_cb:
        Optional callable ``(pct: int) -> None`` (0–95 range).
    """
    import pdfplumber
    import fitz  # PyMuPDF

    def _cb(pct: int) -> None:
        if callable(progress_cb):
            try:
                progress_cb(int(pct))
            except Exception:
                pass

    if not title:
        title = Path(pdf_path).stem

    _log.info("pdf_epub_engine: converting %s → HTML intermediary %s", pdf_path, html_path)

    _cb(5)
    doc_fitz    = fitz.open(pdf_path)
    doc_plumber = pdfplumber.open(pdf_path)

    try:
        all_sizes = _gather_font_sizes(doc_fitz)
        body_size, h3_min, h2_min, h1_min = _compute_heading_thresholds(all_sizes)
        _cb(15)

        all_blocks: List[Block] = []
        img_counter: List[int] = [0]
        heading_anchor_counter: Dict[str, int] = {}
        total_pages = len(doc_plumber.pages)
        _PAGE_START, _PAGE_END = 15, 70

        for page_no, (page_pl, page_fz) in enumerate(
            zip(doc_plumber.pages, doc_fitz), start=1
        ):
            page_blocks = _parse_page(
                page_pl, page_fz, doc_fitz,
                body_size, h3_min, h2_min, h1_min,
                img_counter, page_no, heading_anchor_counter,
            )
            all_blocks.extend(page_blocks)
            if total_pages > 1:
                _cb(_PAGE_START + int((_PAGE_END - _PAGE_START) * page_no / total_pages))

        _cb(70)

        # Images are embedded as base64 data URIs so the HTML is self-contained
        # and Calibre does not need to resolve external paths.
        import base64

        def _img_src(blk: Block) -> str:
            if not blk.img_data:
                return ""
            mime = "image/jpeg" if blk.img_ext in ("jpg", "jpeg") else f"image/{blk.img_ext}"
            b64  = base64.b64encode(blk.img_data).decode("ascii")
            return f"data:{mime};base64,{b64}"

        # Patch the img_dir_rel parameter by overriding _blocks_to_xhtml output
        # for images using data URIs.  We serialise via the standard function and
        # then post-process the src attributes in the resulting HTML string.
        body_html = _blocks_to_xhtml(all_blocks, img_dir_rel="__IMG_PLACEHOLDER__")
        for blk in all_blocks:
            if blk.kind == "img" and blk.img_data:
                placeholder = f"__IMG_PLACEHOLDER__/{blk.img_id}.{blk.img_ext}"
                body_html = body_html.replace(
                    f'src="{placeholder}"', f'src="{_img_src(blk)}"'
                )

        html_content = _HTML_TEMPLATE.format(
            title=_escape(title),
            css=_MOBI_HTML_CSS,
            body=body_html,
        )
        Path(html_path).write_text(html_content, encoding="utf-8")
        _cb(90)

    finally:
        doc_fitz.close()
        doc_plumber.close()

    _log.info("HTML intermediary written to %s", html_path)


# ---------------------------------------------------------------------------
# Plain-text serialiser (for PDF → TXT)
# ---------------------------------------------------------------------------

def _table_to_txt(rows: List[List[Tuple[str, int, int]]], first_row_is_header: bool) -> str:
    """
    Render a table Block as a plain-text grid with ASCII borders.

    Example output:

        +----------+-----+----------+
        | Name     | Age | City     |
        +==========+=====+==========+
        | Alice    |  30 | London   |
        | Bob      |  25 | Paris    |
        +----------+-----+----------+

    Column widths are computed from the widest content in each column.
    Cells that span multiple columns are honoured for width purposes but
    are written across the merged cells without inner separators.

    Parameters
    ----------
    rows:
        Row data in the Block format: list of rows, each row being a list of
        (cell_text, rowspan, colspan) tuples.
    first_row_is_header:
        When True the first row is separated from the rest with ``=`` instead
        of ``-`` to visually distinguish the header.

    Returns
    -------
    str
        Multi-line string containing the rendered table (no trailing newline).
    """
    if not rows:
        return ""

    # ── Step 1: determine column count ──────────────────────────────────────
    col_count = max(
        sum(cspan for (_, _, cspan) in row) for row in rows
    ) if rows else 0
    if col_count == 0:
        return ""

    # ── Step 2: build a flat grid (row_idx, col_idx) → cell_text ─────────
    # We expand colspan by repeating the cell text only in its first column
    # slot; the subsequent slots get a special sentinel so we know they are
    # "consumed" (we won't draw a cell border there).
    _SPAN_CONT = "\x00"   # sentinel: this column slot is part of a wider cell

    grid: List[List[str]] = []
    for row in rows:
        flat_row: List[str] = []
        for (text, _rspan, cspan) in row:
            flat_row.append(text)
            for _ in range(cspan - 1):
                flat_row.append(_SPAN_CONT)
        # Pad to col_count if short (malformed table).
        while len(flat_row) < col_count:
            flat_row.append("")
        grid.append(flat_row[:col_count])

    # ── Step 3: compute column widths ───────────────────────────────────────
    col_widths: List[int] = [0] * col_count
    for row in grid:
        for ci, cell in enumerate(row):
            if cell != _SPAN_CONT:
                col_widths[ci] = max(col_widths[ci], len(cell))
    # Minimum column width of 3 so single-digit numbers have padding.
    col_widths = [max(w, 3) for w in col_widths]

    # ── Step 4: helper to render a horizontal rule ───────────────────────
    def _hrule(fill: str = "-") -> str:
        """Return a full-width horizontal rule using the given fill character."""
        parts = ["+" + fill * (w + 2) for w in col_widths]
        return "".join(parts) + "+"

    # ── Step 5: render row by row ────────────────────────────────────────
    lines: List[str] = [_hrule("-")]
    for ri, row in enumerate(grid):
        # Build the cell line.  Cells spanning multiple columns get the
        # combined width: sum of their columns + 3*(cspan-1) for the
        # inner borders that are swallowed.
        cells_in_row = rows[ri] if ri < len(rows) else []
        ci = 0
        parts: List[str] = ["|"]
        for (text, _rspan, cspan) in cells_in_row:
            # Width = sum of spanned col widths + inner separators.
            total_w = sum(col_widths[ci:ci + cspan]) + 3 * (cspan - 1)
            # Left-pad single-digit/number-like content, otherwise left-align.
            stripped = text.strip()
            if stripped.lstrip("-").replace(".", "", 1).isdigit():
                # Right-align numbers.
                cell_str = stripped.rjust(total_w)
            else:
                cell_str = text.ljust(total_w)
            parts.append(f" {cell_str} |")
            ci += cspan
        lines.append("".join(parts))

        # Separator line.
        if ri == 0 and first_row_is_header:
            lines.append(_hrule("="))
        elif ri < len(grid) - 1:
            lines.append(_hrule("-"))
    lines.append(_hrule("-"))

    return "\n".join(lines)


# Sentence-terminal punctuation that signals a hard paragraph break.
_SENTENCE_TERMINALS = frozenset(".!?")

# Max length (chars) of a line that is treated as a heading or short label —
# lines at or below this that are all-caps or title-case are not merged.
_HEADING_LINE_MAX = 60


def _is_heading_line(line: str) -> bool:
    """Return True when *line* looks like a standalone heading or label."""
    s = line.strip()
    if not s or len(s) > _HEADING_LINE_MAX:
        return False
    # All-uppercase (e.g. "CHAPTER ONE")
    if s == s.upper() and any(c.isalpha() for c in s):
        return True
    # Title case: every significant word starts with a capital
    words = s.split()
    if len(words) >= 2 and all(w[0].isupper() for w in words if w[0].isalpha()):
        return True
    return False


def _merge_text_lines(text: str) -> str:
    """
    Merge soft-wrapped lines in extracted PDF paragraph text.

    PDF text extractors insert line breaks at PDF column boundaries, splitting
    paragraphs mid-sentence.  This function rejoins those continuation lines.

    Rules (applied per consecutive line pair):
    * Blank lines are preserved as paragraph separators — never merged.
    * Bullet lines (starting with ``•``) are never merged with adjacent lines.
    * Short heading-like lines (all-caps or title-case, ≤ 60 chars) are not
      merged.
    * If the *previous* line ends with ``.``, ``!``, or ``?`` — keep as a
      paragraph break (do not merge into the next line).
    * All other line pairs are joined with a single space.
    """
    raw_lines = text.splitlines()
    if len(raw_lines) <= 1:
        return text

    result: List[str] = [raw_lines[0]]
    for line in raw_lines[1:]:
        prev = result[-1]
        prev_stripped = prev.rstrip()
        line_stripped  = line.strip()

        # Always keep blank lines as separators.
        if not line_stripped or not prev_stripped:
            result.append(line)
            continue

        # Never merge into or from a bullet line.
        if line_stripped.startswith("•") or prev_stripped.lstrip().startswith("•"):
            result.append(line)
            continue

        # Never merge a heading-like line.
        if _is_heading_line(line_stripped) or _is_heading_line(prev_stripped):
            result.append(line)
            continue

        # If the previous line ends a sentence, start a new paragraph.
        if prev_stripped and prev_stripped[-1] in _SENTENCE_TERMINALS:
            result.append(line)
            continue

        # Merge: join with a space (handle trailing space on prev already).
        if prev_stripped.endswith(" "):
            result[-1] = prev_stripped + line_stripped
        else:
            result[-1] = prev_stripped + " " + line_stripped

    return "\n".join(result)


def _blocks_to_txt(blocks: List[Block]) -> str:
    """
    Serialise a list of Block objects to a plain-text string.

    Rendering rules
    ---------------
    * **h1** — underlined with ``=`` characters
    * **h2** — underlined with ``-`` characters
    * **h3** — prefixed with ``### ``
    * **p** / **blockquote** — plain text paragraph, blank line above/below
    * **code** — indented 4 spaces, blank line above/below
    * **li** — ``  * `` (unordered) or ``  N. `` (ordered), nested indent
    * **table** — rendered via :func:`_table_to_txt`
    * **hr** — a line of ``-`` characters
    * **img** — ``[image]`` placeholder

    Post-processing applied to every text value before output:
    * ``\\f`` (form feed) characters are stripped.
    * Mid-sentence soft line-breaks (PDF column wrapping) are merged by
      :func:`_merge_text_lines`.
    """
    out: List[str] = []

    # Track ordered-list counters per indent level.
    ol_counters: dict = {}
    prev_li_indent: int = -1

    def _flush_sep() -> None:
        """Ensure there is exactly one blank line before the next element."""
        if out and out[-1] != "":
            out.append("")

    for blk in blocks:
        kind = blk.kind

        # ── List items ───────────────────────────────────────────────────
        if kind == "li":
            lvl = blk.indent_level
            indent = "  " * (lvl + 1)
            # Reset OL counter when we jump to a shallower indent level.
            if lvl < prev_li_indent:
                for k in list(ol_counters.keys()):
                    if k > lvl:
                        del ol_counters[k]
            prev_li_indent = lvl

            if blk.ordered:
                ol_counters[lvl] = ol_counters.get(lvl, 0) + 1
                prefix = f"{ol_counters[lvl]}. "
            else:
                prefix = "* "

            text = _plain_text(blk.spans).replace("\f", "").strip()
            if text:
                out.append(f"{indent}{prefix}{text}")
            continue

        # After a list, ensure a blank line before non-list content.
        if kind != "li":
            ol_counters.clear()
            prev_li_indent = -1
            _flush_sep()

        # ── Headings ─────────────────────────────────────────────────────
        if kind in ("h1", "h2", "h3"):
            text = _plain_text(blk.spans).replace("\f", "").strip()
            if not text:
                continue
            if kind == "h1":
                out.append(text)
                out.append("=" * len(text))
            elif kind == "h2":
                out.append(text)
                out.append("-" * len(text))
            else:  # h3
                out.append(f"### {text}")
            out.append("")

        # ── Paragraphs & blockquotes ──────────────────────────────────────
        elif kind in ("p", "blockquote"):
            text = _plain_text(blk.spans).replace("\f", "").strip()
            if text:
                text = _merge_text_lines(text)
                if kind == "blockquote":
                    # Indent blockquotes with a leading "> ".
                    out.extend(f"> {line}" for line in text.splitlines())
                else:
                    out.append(text)
                out.append("")

        # ── Code blocks ───────────────────────────────────────────────────
        elif kind == "code":
            code_text = "".join(s.text for s in blk.spans)
            for line in code_text.splitlines():
                out.append("    " + line)
            out.append("")

        # ── Tables ────────────────────────────────────────────────────────
        elif kind == "table":
            tbl = _table_to_txt(blk.rows, blk.first_row_is_header)
            if tbl:
                out.append(tbl)
                out.append("")

        # ── Horizontal rules ──────────────────────────────────────────────
        elif kind == "hr":
            out.append("-" * 72)
            out.append("")

        # ── Images ────────────────────────────────────────────────────────
        elif kind == "img":
            out.append("[image]")
            out.append("")

    # Strip trailing blank lines.
    while out and out[-1] == "":
        out.pop()

    return "\n".join(out)


# ---------------------------------------------------------------------------
# Public entry point — PDF → plain text (preserves table layout)
# ---------------------------------------------------------------------------

def convert_pdf_to_txt(
    pdf_path: str,
    txt_path: str,
    title: str = "",
    progress_cb=None,
) -> None:
    """
    Convert *pdf_path* to a plain-text file at *txt_path*.

    Tables are rendered as ASCII grid tables so their layout is preserved.
    Headings are underlined (H1 with ``=``, H2 with ``-``).  Code blocks are
    indented 4 spaces.  All other content is emitted as plain text.

    This function uses the same semantic extraction pipeline as
    :func:`convert_pdf_to_epub` so structural elements are detected reliably
    regardless of the PDF's internal encoding.

    Parameters
    ----------
    pdf_path:
        Absolute path to the source PDF.
    txt_path:
        Absolute path where the output ``.txt`` will be written.
    title:
        Human-readable document title.  Written as the first line when set.
    progress_cb:
        Optional callable ``(pct: int) -> None`` (values 5–95).
    """
    import pdfplumber
    import fitz  # PyMuPDF

    def _cb(pct: int) -> None:
        if callable(progress_cb):
            try:
                progress_cb(int(pct))
            except Exception:
                pass

    if not title:
        title = Path(pdf_path).stem

    _log.info("pdf_epub_engine: converting %s → TXT %s", pdf_path, txt_path)

    _cb(5)
    doc_fitz    = fitz.open(pdf_path)
    doc_plumber = pdfplumber.open(pdf_path)

    try:
        # Pass 1: font-size scan.
        all_sizes = _gather_font_sizes(doc_fitz)
        body_size, h3_min, h2_min, h1_min = _compute_heading_thresholds(all_sizes)
        _cb(15)

        # Pass 2: parse each page into blocks.
        all_blocks: List[Block] = []
        img_counter: List[int] = [0]
        heading_anchor_counter: Dict[str, int] = {}
        total_pages = len(doc_plumber.pages)
        _PAGE_START, _PAGE_END = 15, 75

        for page_no, (page_pl, page_fz) in enumerate(
            zip(doc_plumber.pages, doc_fitz), start=1
        ):
            page_blocks = _parse_page(
                page_pl, page_fz, doc_fitz,
                body_size, h3_min, h2_min, h1_min,
                img_counter, page_no, heading_anchor_counter,
            )
            all_blocks.extend(page_blocks)
            if total_pages > 1:
                _cb(_PAGE_START + int((_PAGE_END - _PAGE_START) * page_no / total_pages))

        _cb(75)

        # Pass 3: serialise to plain text.
        txt = _blocks_to_txt(all_blocks)
        _cb(88)

        Path(txt_path).write_text(txt, encoding="utf-8")
        _cb(95)

    finally:
        doc_fitz.close()
        doc_plumber.close()

    _log.info("TXT written to %s", txt_path)
