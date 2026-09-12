# Tools Catalogue

Every tool available in ToolCEO, organized by category.

---

## PDF Tools

Found under **Documents → PDF → PDF Tools** in the sidebar.

| Tool | Description | Backend Path |
|------|-------------|-------------|
| **Merge PDFs** | Combine multiple PDF files into one. Drag in multiple files, reorder them, then merge. | `tools/documents/pdf_tools/merger/` |
| **Split PDF** | Extract pages or page ranges into separate PDF files. Results are returned as a ZIP. | `tools/documents/pdf_tools/splitter/` |
| **Compress PDF** | Reduce PDF file size using structural optimization and adaptive JPEG quality. Supports target-size mode. | `tools/documents/pdf_tools/compressor/` |
| **Rotate PDF** | Rotate all pages or a selection by 90°, 180°, or 270°. | `tools/documents/pdf_tools/rotate/` |
| **Encrypt / Decrypt PDF** | Add or remove password protection (AES-256 via pikepdf). Supports owner + user password. | `tools/documents/pdf_tools/encrypt/` |
| **Watermark PDF** | Overlay configurable text watermarks (opacity, angle, font size). | `tools/documents/pdf_tools/water_mark/` |
| **PDF Editor** | Apply inline text and annotation edits to a PDF. | `tools/documents/pdf_tools/editor/` |
| **PDF Extractor** | Extract all text or all embedded images from a PDF. | `tools/documents/pdf_tools/extractor/` |

### Compressor Pipeline

```
1. Open source PDF with PyMuPDF (fitz)
2. Structural pass: remove duplicate objects, compress streams (deflate)
3. If max_file_size set: adaptive JPEG quality loop
   a. Re-render each page at target DPI
   b. Recompress embedded images at JPEG quality Q
   c. If result > target, lower Q and repeat
4. Font subsetting via fonttools (removes unused glyph data)
5. Return compressed PDF bytes
```

### Merger Pipeline

```
1. Receive ordered list of uploaded PDFs
2. Open each with PyMuPDF
3. Insert all pages sequentially into a single output document
4. Emit progress per file processed
5. Return merged PDF bytes
```

### Splitter Pipeline

```
1. Open PDF, read page count + generate base64 thumbnail per page
2. Parse user-defined page ranges (e.g. "1-3,5,7-9")
3. Extract each range into a new PDF document
4. If multiple ranges → ZIP the output files
5. SSE progress per range extracted
```

---

## PDF Conversions

Found under **Documents → PDF → Convert** in the sidebar.

| Conversion | Input | Output | Engine |
|------------|-------|--------|--------|
| **PDF → Word** | `.pdf` | `.docx` | pdfplumber + python-docx |
| **PDF → Excel** | `.pdf` | `.xlsx` | pdfplumber (table extraction) + openpyxl |
| **PDF → HTML** | `.pdf` | `.html` | PyMuPDF page rendering + HTML wrapper |
| **PDF → TXT** | `.pdf` | `.txt` | pdfplumber text extraction |
| **PDF → PowerPoint** | `.pdf` | `.pptx` | PyMuPDF page-as-image + python-pptx |
| **PDF → Images** | `.pdf` | `.zip` of PNGs/JPGs | PyMuPDF page rendering |
| **Images → PDF** | `images[]` | `.pdf` | Pillow + PyMuPDF |

---

## Document Converters

Found under **Documents → [Format]** in the sidebar.

### DOCX Converter

Input: `.docx` Microsoft Word documents.

| Target | Format | Notes |
|--------|--------|-------|
| PDF | `.pdf` | Layout-preserving via LibreOffice or python-docx |
| HTML | `.html` | Structured HTML with inline styles |
| ODT | `.odt` | OpenDocument Text |
| TXT | `.txt` | Plain text extraction |
| EPUB | `.epub` | eBook format via Calibre |
| Markdown | `.md` | Markdown representation |

### PPTX Converter

Input: `.pptx` Microsoft PowerPoint presentations.

| Target | Format | Notes |
|--------|--------|-------|
| PDF | `.pdf` | Slide-by-slide PDF |
| HTML | `.html` | Web presentation |
| Images | `.zip` | Each slide as a PNG/JPG |
| ODP | `.odp` | OpenDocument Presentation |
| TXT | `.txt` | Text content extraction |
| Repair | `.pptx` | Re-saves the file to fix corrupt PPTX |

### XLSX Converter

Input: `.xlsx` Microsoft Excel spreadsheets.

| Target | Format | Notes |
|--------|--------|-------|
| PDF | `.pdf` | Tabular layout via openpyxl |
| CSV | `.csv` | First sheet as CSV |
| HTML | `.html` | Table as styled HTML |
| ODS | `.ods` | OpenDocument Spreadsheet |
| TXT | `.txt` | Tab-separated values |
| JSON | `.json` | Rows as JSON array |

### TXT Converter

Input: `.txt` plain text files.

| Target | Format |
|--------|--------|
| PDF | `.pdf` |
| DOCX | `.docx` |
| HTML | `.html` |
| Markdown | `.md` |
| EPUB | `.epub` |
| ODT | `.odt` |
| RTF | `.rtf` |

### ODT Converter

Input: `.odt` OpenDocument Text files.

| Target | Format |
|--------|--------|
| PDF | `.pdf` |
| DOCX | `.docx` |
| HTML | `.html` |
| RTF | `.rtf` |
| TXT | `.txt` |
| EPUB | `.epub` |
| Markdown | `.md` |

### CSV Converter

Input: `.csv` comma-separated value files.

| Target | Format |
|--------|--------|
| JSON | `.json` |
| XLSX | `.xlsx` |
| HTML | `.html` |
| Markdown | `.md` |
| PDF | `.pdf` |
| TXT | `.txt` |
| XML | `.xml` |
| SQL | `.sql` (INSERT statements) |

---

## Image Tools

Found under **Images** in the sidebar.

### Image Compressor

Compresses images with configurable quality. Reports original size, compressed size, and savings percentage in the SSE completion event.

| Input Format | Notes |
|-------------|-------|
| JPG / JPEG | JPEG quality slider |
| PNG | PNG optimization |
| WEBP | Lossy or lossless quality |
| GIF | Palette reduction |
| BMP | Convert to compact form |
| TIFF | LZW / deflate compression |
| SVG | Scour optimization (removes metadata, whitespace) |

### JPG Converter

Input: `.jpg` / `.jpeg`

| Target | Format |
|--------|--------|
| PNG | `.png` |
| WEBP | `.webp` |
| PDF | `.pdf` |
| BMP | `.bmp` |
| TIFF | `.tiff` |
| ICO | `.ico` (multi-resolution) |
| GIF | `.gif` |
| TXT | `.txt` (OCR via pytesseract) |

### PNG Converter

Input: `.png`

| Target | Format |
|--------|--------|
| JPG | `.jpg` |
| WEBP | `.webp` |
| PDF | `.pdf` |
| BMP | `.bmp` |
| TIFF | `.tiff` |
| ICO | `.ico` |
| TXT | `.txt` (OCR) |

### WEBP Converter

Input: `.webp`

| Target | Format |
|--------|--------|
| JPG | `.jpg` |
| PNG | `.png` |
| PDF | `.pdf` |
| BMP | `.bmp` |
| TIFF | `.tiff` |
| ICO | `.ico` |

### SVG Converter

Input: `.svg`

| Target | Notes |
|--------|-------|
| PNG | rasterized via cairosvg |
| JPG | rasterized via cairosvg |
| WEBP | rasterized via cairosvg |
| PDF | vector-preserving via cairosvg |

---

## eBook Conversions

Found under **eBooks** in the sidebar. Requires the **eBook Module** (Calibre).

Supported source + target formats:

| Format | Extension | Source | Target |
|--------|-----------|--------|--------|
| EPUB | `.epub` | ✅ | ✅ |
| MOBI | `.mobi` | ✅ | ✅ |
| AZW3 | `.azw3` | ✅ | ✅ |
| FB2 | `.fb2` | ✅ | ✅ |
| RTF | `.rtf` | ✅ | ✅ |
| TXT | `.txt` | ✅ | ✅ |
| PDF | `.pdf` | ✅ | ✅ |

The engine selects between:
- **Calibre CLI** (`ebook-convert`) — for format pairs that Calibre handles well (EPUB/MOBI/AZW3/FB2)
- **Native pdf-epub engine** (`tools/ebooks/utils/pdf_epub_engine.py`) — for direct PDF↔EPUB handling without Calibre

---

## Archive Tools

Found under **Archives** in the sidebar. Backed by the bundled **7-Zip** engine.

### Create Archive

Compress one or more files/folders into an archive.

| Format | Extension | Notes |
|--------|-----------|-------|
| ZIP | `.zip` | Universal, no compression method required |
| 7Z | `.7z` | High compression ratio |
| TAR | `.tar` | No compression, POSIX-compatible |
| TAR.GZ | `.tar.gz` | GZip-compressed TAR |
| TAR.BZ2 | `.tar.bz2` | BZip2-compressed TAR |

### Extract Archive

Extract contents from an archive. Supported input formats:

ZIP, 7Z, RAR, TAR, TAR.GZ, TAR.BZ2, GZ, BZ2, XZ, CAB, ISO, ARJ, LZMA, and more (7-Zip format support).

Results are delivered as a ZIP download containing the extracted files, or directly as the extracted content when a single file is extracted.

---

## Vault (`.tceo` Files)

ToolCEO includes a **Vault** feature for storing files in an encrypted container with the `.tceo` file extension.

- Files are AES-encrypted using pycryptodome
- The `.tceo` extension is registered with the OS on install (Windows registry, macOS plist, Linux xdg-mime)
- Double-clicking a `.tceo` file opens it directly in ToolCEO
- Access via `frontend/scripts/vaultFileHandler.js` and `electron/main.js` IPC channel `vault-file-open`
