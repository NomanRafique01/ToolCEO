# ToolCEO Documentation

**A privacy-first, 100% offline desktop toolkit for documents, audio, video & images.**

> No cloud. No uploads. No limits. Everything runs on your machine.

---

## What is ToolCEO?

ToolCEO is a fully offline **Electron desktop application** that bundles every file utility you'll ever need — PDF manipulation, document conversion, audio transcoding, image processing, eBook conversion, and archive management — into a single, dark-mode-first application.

Unlike web-based converters:
- No files are uploaded anywhere
- No internet connection required after install
- No watermarks, no limits, no subscriptions
- Optional feature modules downloadable on-demand

The frontend is an HTML/CSS/JS app rendered by Electron. The backend is a Python FastAPI server (Uvicorn) running as a local process on `http://127.0.0.1:8000`. Communication happens via `fetch` + **Server-Sent Events** for real-time progress streaming.

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System diagram, Electron ↔ backend communication, request lifecycle |
| [Getting Started](./getting-started.md) | Prerequisites, installation, running in development |
| [API Reference](./api-reference.md) | All FastAPI endpoints, request/response shapes |
| [Tools Catalogue](./tools.md) | Every tool — PDF, Documents, Images, eBooks, Archives |
| [Background Job System](./job-system.md) | Async job lifecycle, SSE progress, cancellation |
| [Adding a Tool](./adding-a-tool.md) | Developer guide: backend engine + router + frontend panel |
| [Module System](./modules.md) | On-demand downloadable engine modules |

---

## Tech Stack at a Glance

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron (latest) |
| Frontend | Vanilla HTML5 / CSS3 / ES Modules (no bundler) |
| Backend | Python 3.x — FastAPI + Uvicorn |
| PDF engine | PyMuPDF (fitz), pikepdf, pdfplumber |
| Image engine | Pillow, pillow-heif, cairosvg, scour |
| Document engine | python-pptx, openpyxl, pandas, lxml |
| eBook engine | Calibre (CLI), custom pdf-epub engine |
| Archive engine | 7-Zip (bundled binary) |
| Crypto | pycryptodome, cryptography |
| Progress streaming | Server-Sent Events (SSE) |
| Persistence | SQLite via better-sqlite3 (history, favourites) |

---

## Current Feature Status

| Category | Tools | Status |
|----------|-------|--------|
| **PDF Tools** | Merge, Split, Compress, Rotate, Encrypt/Decrypt, Watermark, Editor, Extractor | ✅ Live |
| **PDF Conversions** | → Word, Excel, HTML, TXT, PPT, Images; Images → PDF | ✅ Live |
| **DOCX Conversions** | → PDF, HTML, ODT, TXT, EPUB, Markdown | ✅ Live |
| **PPTX Conversions** | → PDF, HTML, Images, ODP, TXT, Repair | ✅ Live |
| **XLSX Conversions** | → PDF, CSV, HTML, ODS, TXT, JSON | ✅ Live |
| **TXT Conversions** | → PDF, DOCX, HTML, Markdown, EPUB, ODT, RTF | ✅ Live |
| **ODT Conversions** | → PDF, DOCX, HTML, RTF, TXT, EPUB, Markdown | ✅ Live |
| **CSV Conversions** | → JSON, XLSX, HTML, Markdown, PDF, TXT, XML, SQL | ✅ Live |
| **Image Conversions** | JPG, PNG, WEBP, SVG ↔ multiple formats + Compressor | ✅ Live |
| **eBook Conversions** | EPUB, MOBI, AZW3, FB2, RTF, TXT, PDF ↔ multiple formats | ✅ Live |
| **Archives** | Create & Extract (ZIP, 7Z, TAR, RAR, GZ…) | ✅ Live |
| **Audio** | MP3, WAV, FLAC, AAC, OGG, WMA, M4A, OPUS | 🔜 Planned |
| **Video** | MP4, AVI, MKV, MOV, WEBM | 🔜 Planned |
