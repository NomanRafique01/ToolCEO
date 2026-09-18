<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:00f5d4,50:7209b7,100:f77f00&height=200&section=header&text=ToolCEO&fontSize=90&fontColor=ffffff&fontAlignY=65&animation=fadeIn&fontAlign=50" width="100%"/>
</p>

<p align="center">
  <a href="https://github.com/NomanRafique01/ToolCEO/releases/latest">
    <img src="https://img.shields.io/badge/Release-v1.0.0-00f5d4?style=flat-square&labelColor=1a1a24" alt="Release Version"/>
  </a>
  <a href="https://github.com/NomanRafique01/ToolCEO/releases/latest">
    <img src="https://img.shields.io/badge/Tools-172%20Offline%20Available-10b981?style=flat-square&logo=shield&logoColor=white&labelColor=1a1a24" alt="172 Offline Tools"/>
  </a>
  <a href="https://github.com/NomanRafique01/ToolCEO/releases/latest">
    <img src="https://img.shields.io/badge/Platform-Windows%20x64-0078d4?style=flat-square&logo=windows&logoColor=white&labelColor=1a1a24" alt="Platform Windows"/>
  </a>
  <img src="https://img.shields.io/badge/Engine-Python%203.13%20%7C%20FastAPI-3776ab?style=flat-square&logo=python&logoColor=white&labelColor=1a1a24" alt="Python & FastAPI"/>
  <img src="https://img.shields.io/badge/Shell-Electron%2035-47848f?style=flat-square&logo=electron&logoColor=white&labelColor=1a1a24" alt="Electron"/>
  <img src="https://img.shields.io/badge/Privacy-100%25%20Offline%20Local-10b981?style=flat-square&logo=shield&logoColor=white&labelColor=1a1a24" alt="Offline & Local"/>
  <img src="https://img.shields.io/badge/License-Proprietary-64748b?style=flat-square&labelColor=1a1a24" alt="License"/>
</p>

<div align="center">
  <h3>⚡ 172 Production Tools Available 100% Offline</h3>
  <p><strong>An enterprise-grade, privacy-first desktop utility suite for document manipulation, office conversions, raster processing, and data transformations.</strong></p>
  <p><em>Zero cloud connectivity • Zero external telemetries • Zero file size restrictions • Pure hardware-accelerated local execution.</em></p>
</div>

<br/>

<div align="center">
  <table>
    <tr>
      <td align="center" width="25%">
        <b>🔒 100% Offline & Private</b><br/>
        <sub>Zero network telemetry. Confidential documents, spreadsheets, and files never leave your workstation.</sub>
      </td>
      <td align="center" width="25%">
        <b>⚡ 172 Offline Tools</b><br/>
        <sub>Comprehensive suite covering PDF, Word, PowerPoint, Excel, Images, eBooks, Archives, and Data.</sub>
      </td>
      <td align="center" width="25%">
        <b>📡 Real-Time Event Stream</b><br/>
        <sub>Server-Sent Events (SSE) provide frame-accurate progress percentages and stage telemetry directly to the UI.</sub>
      </td>
      <td align="center" width="25%">
        <b>🧩 Modular Engine Runtime</b><br/>
        <sub>Heavy specialized backends (LibreOffice, Tesseract OCR, Calibre) are downloaded on-demand and cached locally.</sub>
      </td>
    </tr>
  </table>
</div>

<br/>

---

## Table of Contents

- [Overview](#overview)
- [Downloads & Installation](#downloads--installation)
- [Tool Ecosystem (172 Offline Utilities)](#tool-ecosystem-172-offline-utilities)
  - [Documents Family (PDF, Word, PPT, Excel, Text)](#-documents-family-accent-ff6b6b)
  - [Images Family (Raster, Vector & Compression)](#-images-family-accent-a78bfa)
  - [eBooks Family (EPUB, MOBI, Kindle)](#-ebooks-family-accent-fbbf24)
  - [Archives Family (ZIP, 7-Zip, TAR, Multi-Volume)](#-archives-family-accent-84cc16)
  - [Data Family (CSV, JSON, XML, SQL)](#-data-family-accent-f472b6)
  - [Audio & Media Processing](#-audio--media-processing-accent-fb923c)
- [Modular Engine Addons](#modular-engine-addons)
- [System Architecture](#system-architecture)
  - [Frontend Shell](#frontend-shell)
  - [Local Backend Daemon](#local-backend-daemon)
  - [Job Execution Lifecycle](#job-execution-lifecycle)
- [Getting Started & Development](#getting-started--development)
- [Local API Reference](#local-api-reference)
- [Project Roadmap](#project-roadmap)

---

## Overview

**ToolCEO** is an industrial-strength desktop application engineered to eliminate the security vulnerabilities, privacy leaks, and upload delays typical of web-based file conversion sites. Built on Electron and driven by a high-throughput local FastAPI daemon on `127.0.0.1:8000`, ToolCEO bundles industrial processing libraries into an intuitive, polished dark-mode interface.

With **172 tools available 100% offline**, ToolCEO handles your sensitive contracts, financial spreadsheets, internal slide decks, and creative assets directly inside system memory and local disk storage.

---

## Downloads & Installation

Official binary builds are compiled for 64-bit Windows environments.

| Distribution Package | Target Architecture | Description | Download Link |
|---|---|---|---|
| **Windows Installer** (`.exe`) | Windows 10 / 11 (x64) | Standard setup wizard with desktop shortcut, Start Menu registration, and uninstaller. | [Download Setup (.exe)](https://github.com/NomanRafique01/ToolCEO/releases/latest/download/ToolCEO-Setup-1.0.0.exe) |
| **Portable Archive** (`.zip`) | Windows 10 / 11 (x64) | Zero-installation standalone package. Unpack and launch without administrative privileges. | [Download Portable (.zip)](https://github.com/NomanRafique01/ToolCEO/releases/latest/download/ToolCEO-Setup-1.0.0.zip) |
| **Windows App Package** (`.appx`) | Windows 10 / 11 (x64) | Signed modern Windows application package tailored for enterprise deployment. | [Download AppX Package](https://github.com/NomanRafique01/ToolCEO/releases/latest) |

### System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit)
- **Processor:** Intel Core i3 / AMD Ryzen 3 or equivalent
- **Memory (RAM):** 4 GB minimum (8 GB recommended for large batch processing)
- **Disk Space:** 600 MB free storage for core application and base runtimes
- **Network:** None required. Operates completely disconnected from the internet

---

## Tool Ecosystem (172 Offline Utilities)

ToolCEO organizes its 172 offline tools into unified, color-coded functional families:

```
ToolCEO Suite (172 Offline Tools)
 ├── 🔴 Documents Family      (PDF Tools, PDF Conversions, Word, Excel, PowerPoint, OpenDocument, Text)
 ├── 🟣 Images Family         (Image Compressor, JPG, PNG, WEBP, SVG, Multi-Format Conversions)
 ├── 🟡 eBooks Family         (EPUB, MOBI, Kindle AZW3, FB2, E-Reader Cross-Conversions)
 ├── 🟢 Archives Family       (ZIP, 7-Zip, TAR, GZ, Multi-Volume Split & Extraction, Encryption)
 ├── 🌸 Data Family           (CSV, JSON, XML, YAML, SQL Data Transformers)
 └── 🟠 Audio & Media Family  (Transcoding, Format Translation, Audio Demuxing)
```

---

### 🔴 Documents Family (Accent: `#FF6B6B`)

A comprehensive, production-grade document workshop powered by PyMuPDF (`fitz`), `pikepdf`, `python-docx`, `openpyxl`, `python-pptx`, and headless LibreOffice.

#### 1. PDF Tools & Utilities
- **Merge PDFs (`merge`):** Combine multiple PDF documents into a unified output with custom ordering.
- **Split PDF (`split`):** Extract page ranges, burst pages into individual documents, or download as a structured ZIP archive.
- **Compress PDF (`compress`):** Lossless stream deflation, raster downsampling, and font subsetting to shrink document size.
- **Rotate Pages (`rotate`):** 90°, 180°, and 270° orientation matrix adjustments across selected sheets or entire books.
- **Encrypt / Decrypt (`security`):** Standard 128-bit and 256-bit AES password encryption, permission restrictions, and decryption.
- **OCR PDF (`ocr`):** Local optical character recognition using the Tesseract engine to extract text layers from scanned pages.
- **Extract Images:** Isolate and export all embedded raster images from PDF pages in their original resolution.
- **Watermark PDF:** Stamp custom text or transparent image overlays with angle and opacity controls.
- **Flatten PDF:** Merge form fields, annotations, signatures, and layers into an immutable rasterized vector layer.
- **Metadata Editor:** Inspect and update document author, title, creation date, and indexing properties.

#### 2. PDF Transformation Suite
- **PDF → Microsoft Word (`.docx`):** Semantic paragraph, table, and typography reconstruction.
- **PDF → Microsoft Excel (`.xlsx`):** Multi-table boundary detection and structured spreadsheet generation.
- **PDF → Microsoft PowerPoint (`.pptx`):** Slide deck compilation preserving graphic layouts.
- **PDF → Plain Text (`.txt`):** Layout-aware plain text extraction for AI or indexing pipelines.
- **PDF → HTML5 (`.html`):** Clean, responsive single-page web document rendering.
- **PDF → High-DPI Images (`.png`, `.jpg`):** Page-by-page rendering at 150/300 DPI for publishing.
- **PDF → eBook (`.epub`):** Reflowable electronic publication generator.

#### 3. Microsoft Word Suite (`.docx`, `.doc`)
- **Word → PDF (`.pdf`):** High-fidelity document compilation preserving headers, footnotes, and margins.
- **Word → Plain Text (`.txt`):** Rapid text extraction stripping formatting artifacts.
- **Word → HTML5 (`.html`):** Semantic web article generator with embedded images.
- **Word → OpenDocument (`.odt`):** Standards-compliant cross-platform document export.
- **Word → Markdown (`.md`):** Clean Markdown generator for technical documentation.
- **Word → eBook (`.epub`):** Chapter-structured digital book creation.

#### 4. Microsoft PowerPoint Suite (`.pptx`, `.ppt`)
- **PowerPoint → PDF (`.pdf`):** Pixel-perfect slide deck export for print and presentation sharing.
- **PowerPoint → OpenDocument Presentation (`.odp`):** Open-source presentation interoperability.
- **PowerPoint → Slide Images (`.png`, `.jpg`):** Batch export of every individual presentation slide.
- **PowerPoint → HTML Presentation:** Web-ready slide deck viewer.

#### 5. Microsoft Excel & Spreadsheet Suite (`.xlsx`, `.xls`, `.csv`)
- **Excel → PDF (`.pdf`):** Print-ready sheet compilation with gridlines and page budgeting.
- **Excel → CSV (`.csv`):** Delimited text export with configurable separators.
- **Excel → HTML5 Table (`.html`):** Stylized web data table markup.
- **Excel → OpenDocument Spreadsheet (`.ods`):** LibreOffice Calc compatibility export.
- **Excel → JSON / XML:** Structured data serialization for database ingestion.
- **CSV → Excel (`.xlsx`):** Convert raw tabular data into styled workbooks.
- **CSV → JSON / XML / PDF:** Multi-format programmatic data interchange.

#### 6. OpenDocument & Text Suite (`.odt`, `.rtf`, `.txt`, `.md`)
- **ODT → PDF / DOCX / HTML:** OpenDocument Text multi-target conversion pipeline.
- **ODS → XLSX / PDF:** OpenDocument Spreadsheet interchange.
- **ODP → PPTX / PDF:** OpenDocument Presentation interchange.
- **Markdown (`.md`) → PDF / DOCX / HTML:** Full Pandoc markdown compiler.
- **RTF → PDF / DOCX:** Legacy Rich Text Format modernization.

---

### 🟣 Images Family (Accent: `#A78BFA`)

High-performance image manipulation powered by Pillow, ImageMagick, and local vector processors.

- **Smart Image Compressor:** Intelligent lossy and lossless compression reducing payload sizes by up to 80% without perceptible quality loss.
- **JPG Suite:** Convert JPG to PNG, WEBP, PDF, SVG, BMP, TIFF, AVIF, and ICO.
- **PNG Suite:** Convert PNG to JPG, WEBP, PDF, SVG, ICO, BMP, TIFF, and AVIF.
- **WEBP Suite:** Modern web graphic conversions to and from PNG, JPG, PDF, GIF, and TIFF.
- **SVG Vector Suite:** Vector rendering into raster formats (PNG, JPG, PDF, WEBP) at arbitrary resolutions.
- **Batch Image Utilities:** Dimension resizing, aspect-ratio scaling, EXIF metadata stripping, and format transmutations.

---

### 🟡 eBooks Family (Accent: `#FBBF24`)

Unified eBook workshop powered by Calibre and EbookLib for e-readers and cross-publishing.

- **EPUB Suite:** Convert EPUB to PDF, MOBI, Kindle AZW3, Plain Text, and RTF.
- **MOBI Suite:** Convert MOBI to EPUB, PDF, AZW3, and Plain Text.
- **Kindle AZW3 Suite:** Convert modern Kindle formats to EPUB, PDF, MOBI, and TXT.
- **FictionBook FB2 Suite:** Convert FB2 to EPUB, PDF, and MOBI.
- **eBook Publishing:** Direct transformations from Word (`.docx`), PDF, and Markdown into compliant `.epub` packages.

---

### 🟢 Archives Family (Accent: `#84CC16`)

High-ratio compression and container utilities built upon 7-Zip, py7zr, and native archival streams.

- **Archive Creation:** Package folders and multi-file collections into ZIP, 7Z, TAR, GZ, and BZ2 formats.
- **Archive Extraction:** Fast decompression of ZIP, RAR, 7Z, TAR, GZ, BZ2, XZ, and ZST containers.
- **Multi-Volume Archiver:** Split massive files and datasets into segmented volumes (`.z01`, `.part1.rar`).
- **Archive Encryption:** Secure archives with AES-256 password protection and encrypted file header tables.

---

### 🌸 Data Family (Accent: `#F472B6`)

Developer and analyst tabular converters for rapid format serialization.

- **CSV ↔ JSON:** Bi-directional tabular-to-object serialization.
- **CSV ↔ XML:** Schema-validated XML tree generation and flattening.
- **CSV ↔ SQL:** Automatic database `INSERT` query generation with typed columns.
- **YAML ↔ JSON:** Configuration file transformation and validation.

---

### 🟠 Audio & Media Processing (Accent: `#FB923C`)

Local multimedia toolchain for local audio extraction and container conversions.

- **Audio Transcoding:** High-fidelity conversion across MP3, WAV, FLAC, AAC, OGG, WMA, M4A, and OPUS.
- **Video Audio Extraction:** Extract uncompressed and AAC audio tracks from MP4, MKV, AVI, MOV, and WEBM video files.
- **Bitrate & Channel Adaptation:** Resample audio, downmix stereo to mono, and optimize sampling rates for podcasts or voice memos.

---

## Modular Engine Addons

To keep the initial ToolCEO download lightweight (~70 MB installer), heavy external binaries are decoupled into on-demand modules managed via the built-in **Modules** manager:

| Module Name | Backend Engine | Included Utilities | Download Size |
|---|---|---|---|
| **Office Module** | Headless LibreOffice Portable | Advanced DOC/DOCX, XLS/XLSX, PPT/PPTX formatting preservation | ~180 MB |
| **OCR Module** | Tesseract OCR + Language Models | Optical character recognition for scanned PDFs and image text | ~45 MB |
| **Document Module** | Pandoc & LaTeX Toolchain | Advanced Markdown, LaTeX, RTF, and EPUB typography compilers | ~65 MB |
| **eBook Module** | Calibre Ebook Tools | Proprietary Kindle AZW3, MOBI, and EPUB binary conversions | ~90 MB |
| **Media Module** | FFmpeg Static Suite | Heavy media encoding, audio demuxing, and transcode toolchains | ~85 MB |

*Modules are downloaded once, verified, and extracted into the local runtime directory for permanent offline availability.*

---

## System Architecture

ToolCEO utilizes a decoupled local client-server architecture: an Electron shell host provides the native desktop UI and operating system hooks, communicating with a private FastAPI background daemon over the loopback interface (`127.0.0.1:8000`).

```
┌─────────────────────────────────────────────────────────────────┐
│                    ToolCEO Electron Shell                       │
│  Chromium UI • Dark Mode Design System • Secure Context Bridge  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / Server-Sent Events (SSE)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Local FastAPI Daemon (Port 8000)              │
│  Job Queue • ThreadPoolExecutor • 100% Offline Processing Engine │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
                ▼                               ▼
    Core Native Engines             Modular On-Demand Engines
   PyMuPDF • PikePDF • Pillow       LibreOffice • Tesseract • FFmpeg
```

### Frontend Shell
- **Environment:** Electron 35+, Chromium runtime, Node.js integration.
- **Design System:** Custom CSS design system with CSS custom properties, responsive panels, and dark-mode styling.
- **IPC Layer:** Secure context bridge (`window.toolceo`) exposing native file dialogs, directory exploration, and window state management.
- **Real-Time Client:** Persistent EventSource connection streaming live progress percentages and execution stages from the backend.

### Local Backend Daemon
- **Framework:** FastAPI running on Uvicorn, bound exclusively to `127.0.0.1:8000`.
- **Concurrency Model:** Thread pool executor ensuring processor-intensive conversions do not block UI interactions or API requests.
- **Job Store:** In-memory tracking layer managing job states (`submitting`, `running`, `done`, `error`) and result artifacts.
- **Resource Guard:** Bounded concurrency controls prevent system memory exhaustion during batch operations.

### Job Execution Lifecycle

1. **Ingestion:** User selects or drops files onto the application interface.
2. **Dispatch:** Frontend dispatches a `multipart/form-data` POST request to the local API router and receives a unique `job_id`.
3. **Queueing:** The local daemon assigns the job to an asynchronous worker thread.
4. **Telemetry:** The engine emits progressive completion percentages (0% to 100%) streamed to the client via Server-Sent Events (`/api/progress/{job_id}`).
5. **Retrieval:** Upon reaching `done` state, the frontend issues a fetch to `/api/download/{job_id}` and Electron triggers the native operating system save dialog.

---

## Getting Started & Development

### Prerequisites

- **Node.js:** v18.0.0 or higher
- **Python:** v3.10 to v3.13
- **Package Managers:** `npm` and `pip`

### Installation & Local Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/NomanRafique01/ToolCEO.git
   cd ToolCEO
   ```

2. **Install Node Dependencies**
   ```bash
   npm install
   ```

3. **Configure Python Virtual Environment**
   ```bash
   cd backend
   python -m venv venv
   
   # Windows
   .\venv\Scripts\activate
   
   # macOS / Linux
   source venv/bin/activate
   
   pip install -r requirements.txt
   cd ..
   ```

4. **Launch Application**
   ```bash
   npm start
   ```

The boot script coordinates launching the local FastAPI service on port 8000 and opening the Electron desktop shell.

---

## Local API Reference

The local Python service exposes internal endpoints on `http://127.0.0.1:8000`:

| Endpoint | Method | Input Parameters | Output |
|---|---|---|---|
| `/health` | `GET` | None | `{ "status": "ok" }` |
| `/api/pdf/merger/merge` | `POST` | `files: UploadFile[]` | `{ "job_id": "<uuid>" }` |
| `/api/pdf/split` | `POST` | `file: UploadFile`, `ranges: string` | `{ "job_id": "<uuid>" }` |
| `/api/pdf/compressor/compress` | `POST` | `file: UploadFile`, `quality: string` | `{ "job_id": "<uuid>" }` |
| `/api/progress/{job_id}` | `GET` | Path parameter `job_id` | `text/event-stream` progress feed |
| `/api/download/{job_id}` | `GET` | Path parameter `job_id` | Binary file attachment stream |

---

## Project Roadmap

| Phase | Milestone | Scope & Deliverables | Status |
|---|---|---|---|
| **Phase 1** | Core Architecture & Baseline Daemon | Electron shell, FastAPI local service, SSE progress streaming, and base UI integration | Completed |
| **Phase 2** | Professional PDF Suite | Split, Merge, Compress, Rotate, Encrypt/Decrypt, and OCR scanning baseline | Completed |
| **Phase 3** | Document & Office Transformations | PDF to Word, Excel, PowerPoint, HTML, Text, and LibreOffice compilation | Completed |
| **Phase 4** | Image & Raster Suite | Multi-format image conversion (JPG, PNG, WEBP, SVG), batch compression, and resizing | Completed |
| **Phase 5** | On-Demand Modular Engine Runtime | Automated module download, dynamic extraction, and offline caching (Office, OCR, Calibre) | Completed |
| **Phase 6** | Audio & Media Processing Toolchains | Local audio transcoding, format translation, and batch media extraction | Pending |

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00E5C0,50:7209b7,100:ff6b00&height=100&section=footer&text=&fontSize=0" width="100%"/>

<p><strong>ToolCEO Desktop Application</strong></p>
<p><em>Engineered for complete local privacy, zero cloud footprint, and uncompromised performance.</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Stable-10b981?style=flat-square&labelColor=1a1a24" alt="Status Stable"/>
  <img src="https://img.shields.io/badge/Tools-172%20Offline-00E5C0?style=flat-square&labelColor=1a1a24" alt="172 Tools"/>
  <img src="https://img.shields.io/badge/Architecture-x64-3b82f6?style=flat-square&labelColor=1a1a24" alt="Arch x64"/>
  <img src="https://img.shields.io/badge/Local%20Port-8000-6366f1?style=flat-square&labelColor=1a1a24" alt="Port 8000"/>
</p>

</div>
