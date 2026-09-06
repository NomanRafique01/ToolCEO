import os
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DOCS_DIR = BASE_DIR / "docs"
MD_FILE = DOCS_DIR / "MODULE_SYSTEM_ARCHITECTURE.md"
HTML_FILE = DOCS_DIR / "MODULE_SYSTEM_ARCHITECTURE.html"
PDF_FILE = DOCS_DIR / "MODULE_SYSTEM_ARCHITECTURE.pdf"

# 1. Run pandoc to convert MD to HTML body
cmd = [
    "pandoc",
    str(MD_FILE),
    "-f", "gfm",
    "-t", "html",
    "--no-highlight"
]

res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
if res.returncode != 0:
    print("Pandoc failed:", res.stderr)
    sys.exit(1)

body_html = res.stdout

# Replace LaTeX math blocks with readable HTML if needed
body_html = body_html.replace(r"$$\text{Speed (B/s)} = \frac{\Delta \text{Bytes}}{\Delta \text{Time}}$$",
                              "<div class='formula'><strong>Speed (B/s)</strong> = &Delta;Bytes / &Delta;Time</div>")
body_html = body_html.replace(r"$$\text{ETA (seconds)} = \frac{\text{Total Bytes} - \text{Received Bytes}}{\text{Speed (B/s)}}$$",
                              "<div class='formula'><strong>ETA (seconds)</strong> = (Total Bytes - Received Bytes) / Speed (B/s)</div>")
body_html = body_html.replace(r"$$\text{Percent} = \min\left(99, \left\lfloor \frac{\text{Lines Extracted}}{\text{Total Files}} \times 100 \right\rfloor\right)$$",
                              "<div class='formula'><strong>Percent</strong> = min(99, floor((Lines Extracted / Total Files) &times; 100))</div>")

# 2. Build full HTML with professional print stylesheet
styled_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ToolCEO Engine Module System: Architecture & Extension Guide</title>
<style>
  @page {{
    size: A4;
    margin: 16mm 16mm 18mm 16mm;
    @bottom-right {{
      content: counter(page);
    }}
  }}

  * {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}

  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #1E293B;
    background: #FFFFFF;
    margin: 0;
    padding: 0;
  }}

  .doc-header {{
    border-bottom: 2px solid #0EA5E9;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }}

  .doc-badge {{
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #E0F2FE;
    color: #0369A1;
    margin-bottom: 8px;
  }}

  h1 {{
    font-size: 24px;
    font-weight: 800;
    color: #0F172A;
    margin: 0 0 8px 0;
    letter-spacing: -0.02em;
  }}

  h2 {{
    font-size: 17px;
    font-weight: 700;
    color: #0F172A;
    border-bottom: 1px solid #E2E8F0;
    padding-bottom: 6px;
    margin-top: 26px;
    margin-bottom: 12px;
    page-break-after: avoid;
  }}

  h3 {{
    font-size: 14px;
    font-weight: 600;
    color: #1E293B;
    margin-top: 18px;
    margin-bottom: 8px;
    page-break-after: avoid;
  }}

  p, ul, ol {{
    margin: 0 0 10px 0;
  }}

  ul, ol {{
    padding-left: 22px;
  }}

  li {{
    margin-bottom: 4px;
  }}

  blockquote {{
    margin: 12px 0;
    padding: 10px 14px;
    background: #F8FAFC;
    border-left: 4px solid #0EA5E9;
    color: #475569;
    font-size: 12.5px;
    border-radius: 0 6px 6px 0;
  }}

  blockquote p {{
    margin: 0;
  }}

  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 12px;
    page-break-inside: avoid;
  }}

  th {{
    background: #F1F5F9;
    color: #0F172A;
    font-weight: 700;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #CBD5E1;
  }}

  td {{
    padding: 7px 10px;
    border: 1px solid #E2E8F0;
    vertical-align: top;
  }}

  tr:nth-child(even) td {{
    background: #F8FAFC;
  }}

  code {{
    font-family: "Cascadia Code", "Fira Code", Consolas, Courier, monospace;
    font-size: 11.5px;
    background: #F1F5F9;
    color: #0F172A;
    padding: 2px 5px;
    border-radius: 4px;
    border: 1px solid #E2E8F0;
  }}

  pre {{
    font-family: "Cascadia Code", "Fira Code", Consolas, Courier, monospace;
    font-size: 11px;
    line-height: 1.45;
    background: #0F172A;
    color: #F8FAFC;
    padding: 12px 14px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 12px 0;
    page-break-inside: avoid;
  }}

  pre code {{
    background: transparent;
    color: inherit;
    padding: 0;
    border: none;
    font-size: inherit;
  }}

  .formula {{
    background: #F0FDF4;
    border: 1px solid #BBF7D0;
    color: #166534;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 12px;
    margin: 8px 0;
  }}

  hr {{
    border: none;
    border-top: 1px solid #E2E8F0;
    margin: 20px 0;
  }}

  .doc-footer {{
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #E2E8F0;
    font-size: 11px;
    color: #94A3B8;
    display: flex;
    justify-content: space-between;
  }}
</style>
</head>
<body>
<div class="doc-header">
  <div class="doc-badge">ToolCEO Engineering Specifications</div>
  <h1>ToolCEO Engine Module System: Architecture & Extension Guide</h1>
  <div style="color: #64748B; font-size: 12px;">Complete Technical Reference, State Machine, IPC Protocol & New Module Integration</div>
</div>

{body_html}

<div class="doc-footer">
  <span>ToolCEO v1.0 • Internal Engineering Guide</span>
  <span>Proprietary & Confidential</span>
</div>
</body>
</html>
"""

HTML_FILE.write_text(styled_html, encoding="utf-8")
print(f"Generated HTML report: {HTML_FILE}")

# 3. Print to PDF via Headless Chrome / Edge
chrome_candidates = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]

browser_exe = None
for c in chrome_candidates:
    if os.path.isfile(c):
        browser_exe = c
        break

if not browser_exe:
    print("No browser found for PDF printing.")
    sys.exit(1)

print(f"Printing PDF using: {browser_exe}")
pdf_cmd = [
    browser_exe,
    "--headless",
    "--disable-gpu",
    "--run-all-compositor-stages-before-draw",
    f"--print-to-pdf={str(PDF_FILE)}",
    "--no-pdf-header-footer",
    str(HTML_FILE)
]

pdf_res = subprocess.run(pdf_cmd, capture_output=True, text=True)
if os.path.isfile(PDF_FILE) and os.path.getsize(PDF_FILE) > 1000:
    print(f"Successfully generated PDF: {PDF_FILE} ({os.path.getsize(PDF_FILE):,} bytes)")
else:
    print("PDF generation failed:", pdf_res.stderr)
    sys.exit(1)

