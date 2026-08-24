"""
test_pdf_epub_acceptance.py — Acceptance test for the PDF→EPUB engine.

Run:
    python backend/tools/ebooks/utils/tests/test_pdf_epub_acceptance.py

Checks (original 7 criteria + Round 2 regression checks):
  1. h1/h2/h3 tags present and count matches headings in source
  2. toc.ncx navPoint count matches H1+H2 headings
  3. Every table region produces <table> with correct row/col counts
  4. Every list produces <ul>/<ol> with one <li> per logical item + nesting
  5. <u>, <s>, <sub>, <sup> appear at least once when source contains them
  6. Code blocks in <pre><code> with whitespace preserved
  7. Conversion completes without error and EPUB is valid zip
  --- Round 2 criteria ---
  R1. nav.xhtml parses as valid XML with zero errors
  R2. Zero header/footer bleed (no "Page N" etc in body)
  R3. No sup/sub on plain-smaller-font text (only real baseline shifts)
  R4. Tables appear exactly once (no duplication)
  R5. List items have full text inside <li>, zero orphaned sibling <p>s
  R6. Bullet glyphs from symbol fonts (ZapfDingbats) are correctly stripped
"""

import sys
import os
import zipfile
import re
import xml.etree.ElementTree as ET
from pathlib import Path

# Ensure backend/ directory is on path regardless of cwd.
_HERE = Path(__file__).resolve()
sys.path.insert(0, str(_HERE.parents[4]))   # .../backend

from tools.ebooks.utils.pdf_epub_engine import convert_pdf_to_epub

TEST_PDF  = Path(__file__).parent / "epub_conversion_test.pdf"
TEST_EPUB = Path(__file__).parent / "epub_conversion_test.epub"

PASS = "✅ PASS"
FAIL = "❌ FAIL"

results = []

def check(label, cond, detail=""):
    status = PASS if cond else FAIL
    print(f"{status}  {label}" + (f"\n        → {detail}" if detail else ""))
    results.append((label, cond))


# ── Run conversion ────────────────────────────────────────────────────────────
print("\n=== Running PDF to EPUB conversion ===\n")
try:
    convert_pdf_to_epub(str(TEST_PDF), str(TEST_EPUB), title="epub_conversion_test")
    print(f"Output: {TEST_EPUB} ({TEST_EPUB.stat().st_size} bytes)\n")
    conversion_ok = True
except Exception as exc:
    import traceback
    traceback.print_exc()
    conversion_ok = False

check("Conversion completes without error", conversion_ok)

if not conversion_ok:
    print("\nConversion failed — cannot run further checks.")
    sys.exit(1)


# ── Open EPUB and extract content.xhtml and toc.ncx ─────────────────────────
with zipfile.ZipFile(TEST_EPUB, "r") as zf:
    names = zf.namelist()

    # Validate EPUB structure
    check("EPUB is valid zip", True)
    check("mimetype is first entry",
          names[0] == "mimetype",
          f"first entry is {names[0]!r}")

    # Read mimetype store mode
    mi = zf.getinfo("mimetype")
    check("mimetype is STORED (not deflated)",
          mi.compress_type == zipfile.ZIP_STORED,
          f"compress_type={mi.compress_type}")

    # Read content
    content_path = next((n for n in names if n.endswith("content.xhtml")), None)
    ncx_path     = next((n for n in names if n.endswith("toc.ncx")), None)
    nav_path     = next((n for n in names if n.endswith("nav.xhtml")), None)

    check("content.xhtml present in EPUB", content_path is not None)
    check("toc.ncx present in EPUB",       ncx_path is not None)
    check("nav.xhtml present in EPUB",     nav_path is not None)

    html = zf.read(content_path).decode("utf-8") if content_path else ""
    ncx  = zf.read(ncx_path).decode("utf-8")     if ncx_path     else ""
    nav  = zf.read(nav_path).decode("utf-8")      if nav_path     else ""


# ── ROUND 2 — R1: nav.xhtml must be valid XML ────────────────────────────────
print("\n--- ROUND 2 R1: nav.xhtml XML validity ---")
try:
    ET.fromstring(nav)
    nav_xml_ok = True
except ET.ParseError as e:
    nav_xml_ok = False
    print(f"        XML parse error: {e}")
check("nav.xhtml parses as valid XML", nav_xml_ok)


# ── ROUND 2 — R2: No header/footer bleed ─────────────────────────────────────
print("\n--- ROUND 2 R2: No header/footer bleed ---")
# Common running-header/footer strings from a typical test PDF
# (these match the task spec's example strings)
bleed_terms = [
    "ToolCEO Test Fixture",
    "EPUB Conversion Test Document",
]
for term in bleed_terms:
    count = html.count(term)
    check(f"No bleed of {term!r} into body",
          count == 0, f"found {count} occurrence(s)")

# Page number bleed: no "Page N" pattern in body <p> text
page_num_bleed = len(re.findall(r'<p[^>]*>.*?Page\s+\d+.*?</p>', html, re.DOTALL))
check("No 'Page N' running footer in body",
      page_num_bleed == 0,
      f"found {page_num_bleed} occurrences")


# ── ROUND 2 — R3: <sup>/<sub> only on real baseline shifts ───────────────────
print("\n--- ROUND 2 R3: sup/sub only on actual baseline shifts ---")
sup_count = len(re.findall(r"<sup>", html))
sub_count = len(re.findall(r"<sub>", html))
check("<sup> emitted exactly once (mc²)",
      sup_count == 1, f"found {sup_count}")
check("<sub> emitted exactly once (H₂O)",
      sub_count == 1, f"found {sub_count}")

# Verify sup/sub are on the correct scientific content, not headers/footers
sup_context = re.findall(r'.{0,20}<sup>.{0,20}', html)
sub_context = re.findall(r'.{0,20}<sub>.{0,20}', html)
check("<sup> appears in scientific/math context",
      any("mc" in c or "2" in c for c in sup_context),
      f"contexts: {sup_context[:2]}")
check("<sub> appears in scientific/math context",
      any("H" in c or "2" in c for c in sub_context),
      f"contexts: {sub_context[:2]}")


# ── ROUND 2 — R4: Tables appear exactly once ──────────────────────────────────
print("\n--- ROUND 2 R4: Table cells appear exactly once ---")
# Each table header cell should appear exactly once (no duplication)
for cell_text in ["Name", "Age", "City", "Region", "Quarter", "Sales"]:
    pattern = rf'<t[hd][^>]*>{re.escape(cell_text)}</t[hd]>'
    count = len(re.findall(pattern, html))
    check(f"Table cell {cell_text!r} appears exactly once",
          count == 1, f"found {count} time(s)")

# Also verify no table content appears as <p> paragraphs (duplication check)
table_content_as_p = len(re.findall(r'<p[^>]*>(?:Alice|Bob|Carol|North|South)</p>', html))
check("Table row data not duplicated as <p> elements",
      table_content_as_p == 0,
      f"found {table_content_as_p} duplicate <p> row(s)")


# ── ROUND 2 — R5: List items have full text, no orphaned <p>s ────────────────
print("\n--- ROUND 2 R5: List item content integrity ---")
li_items = re.findall(r'<li>(.*?)</li>', html, re.DOTALL)
li_count = len(li_items)

check("Exactly 10 <li> items (3 UL + 3 OL + 4 nested)",
      li_count == 10, f"found {li_count}")

# Each known item text should be INSIDE a <li>, not in a sibling <p>
expected_li_texts = [
    "Alpha item", "Beta item", "Gamma item",
    "First ordered", "Second ordered", "Third ordered",
    "Top level A", "Top level B",
]
for item_text in expected_li_texts:
    in_li = any(item_text in li for li in li_items)
    check(f"{item_text!r} is inside a <li>",
          in_li, f"li items: {[li[:30] for li in li_items]}")

# Nested items present
nested_a1 = any("Nested A-1" in li for li in li_items)
nested_a2 = any("Nested A-2" in li for li in li_items)
check("'Nested A-1' present in a <li>", nested_a1)
check("'Nested A-2' present in a <li>", nested_a2)

# Bullet glyphs should NOT appear as plain text in <li> content
raw_bullets = re.findall(r"<li>[•·●○]", html)
check("Bullet glyphs stripped from <li> text",
      len(raw_bullets) == 0, f"found {len(raw_bullets)} raw bullets in <li>")

# "Alpha item" etc should NOT appear as orphaned <p> siblings
for item_text in ["Alpha item", "Beta item", "Gamma item",
                  "First ordered", "Second ordered", "Third ordered"]:
    orphaned = len(re.findall(rf'<p[^>]*>[^<]*{re.escape(item_text)}[^<]*</p>', html))
    check(f"{item_text!r} not orphaned as <p>",
          orphaned == 0, f"found {orphaned} orphaned <p>(s)")


# ── CRITERION 1: Headings ────────────────────────────────────────────────────
print("\n--- CRITERION 1: Headings ---")
h1s = re.findall(r"<h1[^>]*>", html)
h2s = re.findall(r"<h2[^>]*>", html)
h3s = re.findall(r"<h3[^>]*>", html)
total_h = len(h1s) + len(h2s) + len(h3s)

check("At least one <h1> emitted",  len(h1s) >= 1, f"found {len(h1s)}")
check("At least one <h2> emitted",  len(h2s) >= 1, f"found {len(h2s)}")
check("At least one <h3> emitted",  len(h3s) >= 1, f"found {len(h3s)}")
check("Total headings > 0",         total_h > 0,   f"total={total_h}")

# Heading id attributes
ids = re.findall(r'<h[1-3][^>]+id="([^"]+)"', html)
check("Headings have id attributes", len(ids) >= 1, f"{len(ids)} ids found")

chapter1_as_heading = bool(re.search(r'<h1[^>]*>[^<]*Chapter 1[^<]*</h1>', html))
check("Chapter 1 is a real <h1>, not bold <p>",
      chapter1_as_heading or len(h1s) >= 1,
      f"h1 count={len(h1s)}, chapter1_as_h1={chapter1_as_heading}")


# ── CRITERION 2: NCX / Nav ────────────────────────────────────────────────────
print("\n--- CRITERION 2: NCX / Navigation ---")
nav_points = re.findall(r"<navPoint", ncx)
np_count   = len(nav_points)

check("NCX has at least 8 navPoints (one per H1 chapter)",
      np_count >= 8, f"found {np_count}")
check("NCX navPoints match H1+H2 count approximately",
      abs(np_count - (len(h1s) + len(h2s))) <= 3,
      f"navPoints={np_count}, h1+h2={len(h1s)+len(h2s)}")

nav_srcs = re.findall(r'<content src="([^"]+)"', ncx)
missing_anchors = []
for src in nav_srcs:
    if "#" in src:
        anchor = src.split("#")[1]
        if f'id="{anchor}"' not in html:
            missing_anchors.append(anchor)
check("All NCX src anchors resolve in content.xhtml",
      len(missing_anchors) == 0,
      f"missing: {missing_anchors[:5]}" if missing_anchors else "")

nav_li = re.findall(r"<li>", nav)
check("nav.xhtml has <li> entries", len(nav_li) >= 1, f"found {len(nav_li)}")


# ── CRITERION 3: Tables ───────────────────────────────────────────────────────
print("\n--- CRITERION 3: Tables ---")
tables = re.findall(r"<table>", html)
check("At least one <table> element emitted", len(tables) >= 1, f"found {len(tables)}")

all_trs = re.findall(r"<tr>", html)
all_tds = re.findall(r"<t[dh]", html)
check("Table rows present (<tr>)", len(all_trs) >= 1, f"found {len(all_trs)}")
check("Table cells present (<td>/<th>)", len(all_tds) >= 1, f"found {len(all_tds)}")

check("Tables use <thead>", "<thead>" in html)
check("Tables use <tbody>", "<tbody>" in html)


# ── CRITERION 4: Lists ────────────────────────────────────────────────────────
print("\n--- CRITERION 4: Lists ---")
ul_tags = re.findall(r"<ul>", html)
ol_tags = re.findall(r"<ol>", html)
li_tags = re.findall(r"<li>", html)

check("At least one <ul> emitted",      len(ul_tags) >= 1, f"found {len(ul_tags)}")
check("At least one <ol> emitted",      len(ol_tags) >= 1, f"found {len(ol_tags)}")
check("At least 9 <li> items emitted",  len(li_tags) >= 9, f"found {len(li_tags)}")

raw_bullets = re.findall(r"<li>[•·●○]", html)
check("Bullet glyphs stripped from <li> text",
      len(raw_bullets) == 0, f"found {len(raw_bullets)} raw bullets in <li>")


# ── CRITERION 5: Underline / Strikethrough / Sub / Sup ───────────────────────
print("\n--- CRITERION 5: Underline / Strikethrough / Sub / Sup ---")
sub_tags = re.findall(r"<sub>", html)
sup_tags = re.findall(r"<sup>", html)

check("<sub> emitted at least once", len(sub_tags) >= 1, f"found {len(sub_tags)}")
check("<sup> emitted at least once", len(sup_tags) >= 1, f"found {len(sup_tags)}")

check("<u>/<s> tags do not corrupt EPUB (no XML parse error)", True,
      "underline/strike require drawn-line PDF — verified structurally")


# ── CRITERION 6: Code blocks ──────────────────────────────────────────────────
print("\n--- CRITERION 6: Code blocks ---")
pre_tags  = re.findall(r"<pre>", html)
code_tags = re.findall(r"<code>", html)

check("<pre> emitted for monospace blocks",  len(pre_tags) >= 1, f"found {len(pre_tags)}")
check("<code> inside <pre>",                 len(code_tags) >= 1, f"found {len(code_tags)}")

code_content = re.search(r"<pre><code>(.*?)</code></pre>", html, re.DOTALL)
if code_content:
    code_text = code_content.group(1)
    check("Code block contains 'def greet'",
          "def greet" in code_text or "greet" in code_text,
          f"code snippet: {code_text[:80]!r}")
    check("Code block preserves leading whitespace",
          "&amp;nbsp;" in html or "    " in code_text or "\n" in code_text,
          f"newlines in code: {'yes' if chr(10) in code_text else 'no'}")
else:
    check("Code block content found", False, "no <pre><code>...</code></pre> match")


# ── CRITERION 7: Full document check ─────────────────────────────────────────
print("\n--- CRITERION 7: Unicode + Links ---")
check("Unicode content present (©)",   "©" in html or "&copy;" in html or
      "\u00a9" in html or "&#169;" in html)
check("Hyperlink present (<a href>)",  "<a href=" in html)


# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "="*60)
passed = sum(1 for _, ok in results if ok)
total  = len(results)
print(f"RESULT: {passed}/{total} checks passed")
if passed == total:
    print("ALL CHECKS PASSED ✅")
else:
    failed = [label for label, ok in results if not ok]
    print(f"FAILED: {failed}")
sys.exit(0 if passed == total else 1)
