"""
create_test_pdf.py — Generate epub_conversion_test.pdf for acceptance testing.

Requires: reportlab
  pip install reportlab
"""

from pathlib import Path
import sys

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
        Image as RLImage,
    )
    from reportlab.lib.enums import TA_LEFT
except ImportError:
    print("reportlab not installed — skipping test PDF generation")
    sys.exit(0)

OUT = Path(__file__).parent / "epub_conversion_test.pdf"

MONO_STYLE = ParagraphStyle(
    "mono", fontName="Courier", fontSize=9, leading=12, spaceAfter=4,
)
NORMAL = getSampleStyleSheet()["Normal"]

def build():
    doc = SimpleDocTemplate(str(OUT), pagesize=A4,
                             rightMargin=2*cm, leftMargin=2*cm,
                             topMargin=2.5*cm, bottomMargin=2.5*cm)
    story = []
    styles = getSampleStyleSheet()
    H1 = styles["Heading1"]
    H2 = styles["Heading2"]
    H3 = styles["Heading3"]

    # ----- Section 1: Headings -----------------------------------------
    story += [
        Paragraph("Chapter 1: Semantic Headings", H1),
        Paragraph("1.1 Sub-Heading Level Two", H2),
        Paragraph("1.1.1 Sub-sub-heading Level Three", H3),
        Paragraph(
            "This is normal body text under a heading. "
            "It should be emitted as a &lt;p&gt; element.",
            NORMAL,
        ),
        Spacer(1, 0.3*cm),
    ]

    # ----- Section 2: Inline styles ------------------------------------
    story += [
        Paragraph("Chapter 2: Inline Styles", H1),
        Paragraph(
            "This paragraph contains <b>bold</b>, <i>italic</i>, "
            "<b><i>bold-italic</i></b>, and plain text.",
            NORMAL,
        ),
        Spacer(1, 0.3*cm),
    ]

    # ----- Section 3: Lists --------------------------------------------
    story += [
        Paragraph("Chapter 3: Lists", H1),
        Paragraph("Unordered list:", H2),
    ]
    for item in ["• Alpha item", "• Beta item", "• Gamma item"]:
        story.append(Paragraph(item, NORMAL))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Ordered list:", H2))
    for item in ["1. First ordered", "2. Second ordered", "3. Third ordered"]:
        story.append(Paragraph(item, NORMAL))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Nested list:", H2))
    for item in [
        "• Top level A",
        "    ◦ Nested A-1",
        "    ◦ Nested A-2",
        "• Top level B",
    ]:
        story.append(Paragraph(item, NORMAL))
    story.append(Spacer(1, 0.3*cm))

    # ----- Section 4: Table (simple) -----------------------------------
    story += [
        Paragraph("Chapter 4: Tables", H1),
        Paragraph("Simple table:", H2),
    ]
    simple_data = [
        ["Name",  "Age", "City"],
        ["Alice", "30",  "London"],
        ["Bob",   "25",  "Paris"],
        ["Carol", "35",  "Berlin"],
    ]
    t = Table(simple_data, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.whitesmoke),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.black),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
    ]))
    story += [t, Spacer(1, 0.3*cm)]

    # ----- Section 5: Table (merged cells / rowspan) -------------------
    story.append(Paragraph("Merged-cell table:", H2))
    merged_data = [
        ["Region", "Quarter", "Sales"],
        ["North",  "Q1",      "100"],
        ["North",  "Q2",      "150"],
        ["South",  "Q1",      "200"],
        ["South",  "Q2",      "130"],
    ]
    tm = Table(merged_data, hAlign="LEFT")
    tm.setStyle(TableStyle([
        ("GRID",     (0, 0), (-1, -1), 0.5, colors.black),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        # Simulate merged "North" cell across rows 1-2 (visual only in reportlab)
        ("SPAN",     (0, 1), (0, 2)),
        ("SPAN",     (0, 3), (0, 4)),
        ("VALIGN",   (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story += [tm, Spacer(1, 0.3*cm)]

    # ----- Section 6: Code block ---------------------------------------
    story += [
        Paragraph("Chapter 5: Code Block", H1),
        Paragraph("The following is a monospace code block:", NORMAL),
    ]
    code_lines = [
        "def greet(name):",
        '    """Greet a person by name."""',
        '    return f"Hello, {name}!"',
        "",
        "print(greet('World'))",
    ]
    for ln in code_lines:
        story.append(Paragraph(ln.replace(" ", "&nbsp;"), MONO_STYLE))
    story.append(Spacer(1, 0.3*cm))

    # ----- Section 7: Unicode -----------------------------------------
    story += [
        Paragraph("Chapter 6: Unicode", H1),
        Paragraph(
            "Symbols: © ® ™ € £ ¥ — ← → ↑ ↓ "
            "Emoji-free accented: café, naïve, résumé, über.",
            NORMAL,
        ),
        Spacer(1, 0.3*cm),
    ]

    # ----- Section 8: Sub/superscript ---------------------------------
    story += [
        Paragraph("Chapter 7: Sub and Superscript", H1),
        Paragraph(
            "Chemical formula: H<sub>2</sub>O. "
            "Power: E = mc<sup>2</sup>.",
            NORMAL,
        ),
        Spacer(1, 0.3*cm),
    ]

    # ----- Section 9: Hyperlink ----------------------------------------
    story += [
        Paragraph("Chapter 8: Hyperlinks", H1),
        Paragraph(
            'Visit <a href="https://example.com">example.com</a> for more.',
            NORMAL,
        ),
        Spacer(1, 0.3*cm),
    ]

    doc.build(story)
    print(f"Created: {OUT}")


if __name__ == "__main__":
    build()
