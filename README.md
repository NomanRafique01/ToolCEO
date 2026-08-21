<p align="center">
  <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 1000 200">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00f5d4"/>
        <stop offset="50%" stop-color="#7209b7"/>
        <stop offset="100%" stop-color="#f77f00"/>
      </linearGradient>
      <filter id="shadow">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#00000066"/>
      </filter>
    </defs>
    <!-- Wave/banner shape using path -->
    <path d="M0,40 C250,120 750,-20 1000,40 L1000,200 L0,200 Z" fill="url(#bg)"/>
    <!-- ToolCEO text centered and floating -->
    <text x="500" y="145" font-family="'Arial Black', sans-serif" font-size="90" font-weight="900" fill="white" text-anchor="middle" letter-spacing="12" filter="url(#shadow)">ToolCEO</text>
  </svg>
</p>

<br>

**A privacy-first, 100% offline desktop toolkit for documents, audio, video & images.**
<br>
*No cloud. No uploads. No limits. Everything runs on your machine.*

<br>

<!-- ── Row 1 · Identity & Platform ───────────────────────────────────────── -->
<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20│%20macOS%20│%20Linux-00b4d8?style=for-the-badge&logo=windows&logoColor=white&labelColor=0A1F1C" alt="Platform"/>
  <img src="https://img.shields.io/badge/Framework-Electron-47848F?style=for-the-badge&logo=electron&logoColor=9FEF00&labelColor=0A1F1C" alt="Electron"/>
  <img src="https://img.shields.io/badge/Version-1.0.0-ff6b00?style=for-the-badge&logo=semver&logoColor=white&labelColor=0A1F1C" alt="Version"/>
  <img src="https://img.shields.io/badge/Privacy-100%25%20Offline-06d6a0?style=for-the-badge&logo=shield&logoColor=white&labelColor=0A1F1C" alt="Privacy"/>
  <img src="https://img.shields.io/badge/License-MIT-f72585?style=for-the-badge&logo=opensourceinitiative&logoColor=white&labelColor=0A1F1C" alt="License"/>
  <img src="https://img.shields.io/badge/Status-Active%20Dev-7209b7?style=for-the-badge&logo=statuspage&logoColor=white&labelColor=0A1F1C" alt="Status"/>
</p>

<!-- ── Row 2 · Core Tech Stack ───────────────────────────────────────────── -->
<p align="center">
  <img src="https://img.shields.io/badge/Backend-Python%203.x%20+%20FastAPI-3a86ff?style=for-the-badge&logo=fastapi&logoColor=white&labelColor=0A1F1C" alt="Backend"/>
  <img src="https://img.shields.io/badge/PDF%20Engine-PyMuPDF-e63946?style=for-the-badge&logo=adobeacrobatreader&logoColor=white&labelColor=0A1F1C" alt="PyMuPDF"/>
  <img src="https://img.shields.io/badge/Frontend-Vanilla%20JS%20+%20HTML%2FCSS-f8961e?style=for-the-badge&logo=javascript&logoColor=black&labelColor=0A1F1C" alt="Frontend"/>
  <img src="https://img.shields.io/badge/Streaming-SSE%20Real--Time-560bad?style=for-the-badge&logo=htmx&logoColor=white&labelColor=0A1F1C" alt="SSE Streaming"/>
</p>

<!-- ── Row 3 · Tool Suite Modules ────────────────────────────────────────── -->
<p align="center">
  <img src="https://img.shields.io/badge/Suite-PDF%20Tools-ff477e?style=for-the-badge&logo=adobe&logoColor=white&labelColor=0A1F1C" alt="PDF Tools"/>
  <img src="https://img.shields.io/badge/Suite-Doc%20Conversions-fb5607?style=for-the-badge&logo=googledocs&logoColor=white&labelColor=0A1F1C" alt="Doc Conversions"/>
  <img src="https://img.shields.io/badge/Suite-Audio%20Studio-4cc9f0?style=for-the-badge&logo=audioboom&logoColor=white&labelColor=0A1F1C" alt="Audio Suite"/>
  <img src="https://img.shields.io/badge/Suite-Image%20Studio-8338ec?style=for-the-badge&logo=googlephotos&logoColor=white&labelColor=0A1F1C" alt="Image Studio"/>
  <img src="https://img.shields.io/badge/Suite-Video%20Lab-4361ee?style=for-the-badge&logo=youtube&logoColor=white&labelColor=0A1F1C" alt="Video Lab"/>
</p>

</div>

---

<div align="center">
  <table>
    <tr>
      <td align="center" width="25%"><b>🔒 100% Offline</b><br/><sub>Zero internet required — your files never leave your machine</sub></td>
      <td align="center" width="25%"><b>⚡ Real-Time Progress</b><br/><sub>SSE-powered live progress bars for every background job</sub></td>
      <td align="center" width="25%"><b>🎯 Multi-Format</b><br/><sub>Documents · Audio · Images · Video — all in one app</sub></td>
      <td align="center" width="25%"><b>📂 Drag & Drop</b><br/><sub>Drop files directly into any tool — zero friction workflow</sub></td>
    </tr>
  </table>
  <br/>
  <i><b>Your files. Your machine. Your rules.</b></i>
  <br/><br/>
</div>

---

## 📋 Table of Contents

- [What is ToolCEO?](#-what-is-toolceo)
- [Core Architecture](#-core-architecture)
- [What We've Built So Far](#-whats-built-so-far)
  - [PDF Tools (Active ✅)](#-pdf-tools-active-)
  - [PDF Conversions (UI Ready)](#-pdf-conversions-ui-ready)
  - [Document Formats (UI Ready)](#-document-formats-ui-ready)
  - [Audio Formats (UI Ready)](#-audio-formats-ui-ready)
  - [Upcoming Categories](#-upcoming-categories)
- [Background Job System](#-background-job-system)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Roadmap](#-roadmap)

---

## 🚀 What is ToolCEO?

ToolCEO is a **fully offline Electron desktop application** that bundles every file utility you'll ever need — PDF manipulation, document conversion, audio transcoding, image processing, and video conversion — into a single, dark-mode-first, beautifully designed app.

Unlike web-based converters, **ToolCEO runs entirely on your machine**:
- No files are uploaded anywhere
- No internet connection required
- No watermarks, no limits, no subscriptions

The frontend is rendered by Electron and served as a local HTML/CSS/JS app. The backend is a Python FastAPI server (Uvicorn) running as a local process on `http://127.0.0.1:8000`. Communication between them happens via fetch + **Server-Sent Events** for real-time progress streaming.

---

## 🏗️ Core Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     Electron Shell                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Frontend (HTML / CSS / JS)            │   │
│  │                                                     │   │
│  │  Sidebar Nav → Category Panel → Tool Card           │   │
│  │       │                │              │             │   │
│  │       ▼                ▼              ▼             │   │
│  │  navigation.js   documents.js    dropzone.js        │   │
│  │                  audio.js        toolstate.js       │   │
│  │                                  notificationBanner │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │  fetch + SSE                      │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Python FastAPI Backend (Uvicorn)           │   │
│  │              http://127.0.0.1:8000                  │   │
│  │                                                     │   │
│  │  POST /api/pdf/...       ─── Tool Routers           │   │
│  │  GET  /api/progress/{id} ─── SSE Progress Stream    │   │
│  │  GET  /api/download/{id} ─── File Download          │   │
│  │                                                     │   │
│  │  tools/documents/pdf_tools/                         │   │
│  │    ├── splitter/  (engine + router)  ✅             │   │
│  │    ├── merger/    (engine + router)  ✅             │   │
│  │    └── compressor/(engine + router)  ✅             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Request Lifecycle

```text
User drops file onto DropZone
        │
        ▼
dropzone.js   →  POST /api/pdf/<tool>  →  FastAPI Router
                                              │
                          ┌───────────────────┘
                          │
                    jobs.py (in-memory job store)
                          │
                     engine.py (background task)
                          │
              ┌───────────┴───────────┐
              │                       │
    GET /api/progress/{id}   ←  SSE stream (0.25 s tick)
    (Frontend polls SSE)          progress: 0 → 100
              │
              ▼
    state == "done"
              │
              ▼
    GET /api/download/{id}  →  Binary file returned
              │
              ▼
    electron.saveFileAs()  →  Native Save dialog
```

---

## ✅ What's Built So Far

### 📄 PDF Tools (Active ✅)

These three tools are **fully implemented end-to-end** — working backend engine, FastAPI router, real-time SSE progress, and polished frontend UI.

| Tool | ID | Status | Description |
|------|----|--------|-------------|
| **Merge PDFs** | `merge` | ✅ Live | Combine multiple PDF files into one — drag multiple files, reorder, merge |
| **Split PDF** | `split` | ✅ Live | Extract pages into separate files — page range selector, thumbnail preview |
| **Compress PDF** | `compress` | ✅ Live | Reduce file size using PyMuPDF — configurable quality presets |

Each tool follows the **modular architecture pattern**:

```text
backend/tools/documents/pdf_tools/<tool>/
├── __init__.py    — module descriptor + exports
├── engine.py      — core processing logic (PyMuPDF)
└── router.py      — FastAPI router with job dispatch + SSE hookup

frontend/tools/documents/pdf_tools/<tool>/
├── <tool>.js      — UI panel (drag-zone, options, progress bar)
└── <tool>.css     — scoped styles for this tool panel
```

#### Compressor Pipeline
```text
  1. Open source PDF with PyMuPDF (fitz)
  2. Per-page: re-render at target DPI → compress images (JPEG quality)
  3. Font subsetting via fonttools (removes unused glyph data)
  4. Rebuild PDF with deflate stream compression
  5. Emit progress events at each page step → SSE stream
```

#### Merger Pipeline
```text
  1. Receive list of uploaded PDFs
  2. Open each with PyMuPDF
  3. Insert all pages into a single output document
  4. Emit progress per file processed
  5. Return merged PDF bytes
```

#### Splitter Pipeline
```text
  1. Open PDF, read page count + generate thumbnails
  2. Parse user-defined page ranges
  3. Extract each range into a new PDF document
  4. ZIP multiple outputs → stream back as download
  5. SSE progress per range extracted
```

---

### 🔄 PDF Conversions (UI Ready)

Cards exist in the UI, tool state integrates correctly. Backend engines **not yet implemented**.

| Conversion | ID | Description |
|------------|----|-------------|
| **PDF → DOCX** | `pdf-docx` | Convert PDF to editable Word document |
| **PDF → HTML** | `pdf-html` | Export PDF as a structured web page |
| **PDF → TXT** | `pdf-txt` | Extract plain text content from PDF |
| **PDF → Images** | `pdf-images` | Export each page as PNG/JPG |
| **DOCX → PDF** | `docx-pdf` | Convert Word document to PDF |
| **Images → PDF** | `images-pdf` | Bundle multiple images into a single PDF |

---

### 📁 Document Formats (UI Ready)

Format selection cards are visible in the Documents panel. Each will expose a full tool/conversion sub-panel.

| Format | Extension | Description |
|--------|-----------|-------------|
| **PDF** | `.pdf` | Portable Document Format → leads to PDF tools panel |
| **DOCX** | `.docx` | Microsoft Word Document |
| **XLSX** | `.xlsx` | Microsoft Excel Spreadsheet |
| **PPTX** | `.pptx` | Microsoft PowerPoint |
| **TXT** | `.txt` | Plain Text File |
| **RTF** | `.rtf` | Rich Text Format |
| **ODT** | `.odt` | OpenDocument Text |
| **CSV** | `.csv` | Comma-Separated Values |

---

### 🎵 Audio Formats (UI Ready)

The Audio category grid is rendered. Conversion backend engines **not yet implemented**.

| Format | Extension | Description |
|--------|-----------|-------------|
| **MP3** | `.mp3` | MPEG Audio Layer III |
| **WAV** | `.wav` | Waveform Audio File |
| **FLAC** | `.flac` | Free Lossless Audio Codec |
| **AAC** | `.aac` | Advanced Audio Coding |
| **OGG** | `.ogg` | Ogg Vorbis Audio |
| **WMA** | `.wma` | Windows Media Audio |
| **M4A** | `.m4a` | MPEG-4 Audio |
| **OPUS** | `.opus` | Opus Interactive Audio |

---

### 🗂️ Upcoming Categories

Sidebar nav items exist, panels pending:

| Category | Color | Planned Scope |
|----------|-------|---------------|
| **Images** | `#A78BFA` | PNG/JPG/WEBP/SVG/HEIC conversion, resize, crop, compress |
| **Video** | `#38BDF8` | MP4/AVI/MKV/MOV/WEBM conversion, trim, compress |

---

## ⚡ Background Job System

ToolCEO's async background job system lets users **navigate away from a tool while it's processing** and come back when done.

```text
┌─────────────────────────────────────────────────────────┐
│                    jobs.py (Job Store)                   │
│                                                          │
│  Job = { id, state, progress, result, filename, error }  │
│                                                          │
│  States:  "submitting" → "running" → "done" | "error"   │
│                                                          │
│  FastAPI background task updates the job in-memory      │
│  GET /api/progress/{id} polls it every 0.25 s via SSE   │
└─────────────────────────────────────────────────────────┘
```

### Frontend: Background Job Bar

When the user switches to a different tool while a job is running, a **sticky background job bar** appears at the bottom of the sidebar:

```text
┌─────────────────────────────────────────────────────┐
│  🗜 Compress PDF  ●  Executing in background  45%   │
│  document.pdf                        [View Tool] [×] │
│  ███████████████░░░░░░░░░░░░░░░░░░░░               │
└─────────────────────────────────────────────────────┘
        ↓ (on completion)
┌─────────────────────────────────────────────────────┐
│  🗜 Compress PDF  ✓ Completed  100%                 │
│  document_compressed.pdf         [Save As…]   [×]   │
│  ████████████████████████████████████████████       │
└─────────────────────────────────────────────────────┘
```

Features:
- **Live animated progress bar** (color-coded per tool accent color)
- **Status badges**: Uploading → Executing in background → ✓ Completed / Failed
- **"View Tool"** button — jumps back to the active tool panel
- **"Save As…"** button — triggers native Electron save dialog on completion
- **Toast notification** — fires on completion or failure via `notificationStore.js`
- **Dismiss (×)** — clears the banner

---

## 📁 Project Structure

```text
ToolCEO/
├── package.json                     Electron entry + devDependencies
├── .gitignore                       Python + Node + OS ignores
│
├── electron/
│   ├── main.js                      Electron main process + IPC handlers
│   └── preload.js                   Context bridge (window.toolceo API)
│
├── frontend/
│   ├── index.html                   App shell — sidebar, topbar, dropzone, explore-section
│   │
│   ├── styles/
│   │   ├── base.css                 CSS custom properties + global reset
│   │   ├── layout.css               Fixed structural shells (sidebar, topbar, main)
│   │   ├── sidebar.css              Logo, nav items, status card, bg-job bar
│   │   ├── dashboard.css            Dashboard panel components + hero card
│   │   ├── documents.css            Format grid cards + PDF tools panel
│   │   ├── audio.css                Audio format grid cards
│   │   └── notification-banner.css  Toast notification system
│   │
│   ├── scripts/
│   │   ├── main.js                  App bootstrap — wires all modules
│   │   ├── navigation.js            Sidebar nav, breadcrumb, explore-section swap
│   │   ├── documents.js             Document format grid + PDF tools/conversions panel
│   │   ├── audio.js                 Audio format grid renderer
│   │   ├── dropzone.js              Drag-and-drop handler + file upload + progress UI
│   │   ├── toolstate.js             Active tool state + background job bar sync
│   │   ├── notificationBanner.js    Toast notification renderer
│   │   ├── notificationStore.js     Notification queue + event bus
│   │   └── quickconvert.js          Quick-convert shortcut handler
│   │
│   └── tools/
│       └── documents/
│           └── pdf_tools/
│               ├── splitter/        splitter.js + splitter.css  ✅
│               ├── merger/          merger.js   + merger.css    ✅
│               └── compressor/      compressor.js + compressor.css  ✅
│
├── backend/
│   ├── main.py                      FastAPI app — middleware + router registration
│   ├── jobs.py                      In-memory job store (Job dataclass)
│   ├── requirements.txt             fastapi, uvicorn, PyMuPDF, Pillow, fonttools…
│   │
│   ├── routers/
│   │   ├── pdf_tools.py             Legacy monolithic PDF router (being retired)
│   │   ├── pdf_conversions.py       PDF conversion routes (stubs)
│   │   └── sse_progress.py          GET /api/progress/{id} + GET /api/download/{id}
│   │
│   └── tools/
│       └── documents/
│           └── pdf_tools/
│               ├── compressor/      engine.py + router.py  ✅
│               ├── merger/          engine.py + router.py  ✅
│               └── splitter/        engine.py + router.py  ✅
│
└── assets/
    └── icon.png                     App icon (sidebar logo)
```

---

## 🛠️ Tech Stack

```text
Electron (latest)
├── main.js           Native window creation, IPC, saveFileAs dialog
└── preload.js        Context bridge → exposes window.toolceo.saveFileAs()

Frontend — Vanilla Stack
├── HTML5                 App shell structure
├── Vanilla CSS           Design system (CSS custom properties, no framework)
├── ES Modules            Native import/export, no bundler
├── Google Fonts (Inter)  Typography
└── Inline SVG icons      Zero external icon dependencies

Backend — Python 3.x
├── FastAPI               REST API + SSE streaming endpoint
├── Uvicorn               ASGI server (local, port 8000)
├── PyMuPDF (fitz)        PDF read/write/render engine
├── Pillow                Image processing
├── fonttools             Font subsetting for PDF compression
├── python-multipart      Multipart form file upload parsing
└── pytesseract           OCR (reserved — future OCR PDF tool)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+) — for Electron
- **Python 3.x** + `pip` — for the FastAPI backend

### 1. Clone & Install Node Dependencies

```bash
git clone <repo-url>
cd ToolCEO
npm install
```

### 2. Set Up the Python Backend

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Start the Backend

```bash
# From backend/ directory with venv active
uvicorn main:app --reload --port 8000
```

### 4. Launch the Electron App

```bash
# From project root
npm start
```

The Electron window loads `frontend/index.html` and talks to the backend at `http://127.0.0.1:8000`.

> **Both processes must be running simultaneously.** The Electron app expects the backend on port 8000.

---

## 📡 API Reference

### Health

```
GET  /        → { "status": "ToolCEO backend running" }
GET  /health  → { "status": "ok" }
```

### PDF — Split

```
POST /api/pdf/split
  multipart:
    file    : <PDF file>
    ranges  : "1-3,5,7-9"   (page range string)
  → { job_id: "uuid" }
```

### PDF — Merge

```
POST /api/pdf/merger/merge
  multipart:
    files   : <PDF file>[]   (multiple files)
  → { job_id: "uuid" }
```

### PDF — Compress

```
POST /api/pdf/compressor/compress
  multipart:
    file    : <PDF file>
    quality : "low" | "medium" | "high"
  → { job_id: "uuid" }
```

### Progress Stream (SSE)

```
GET /api/progress/{job_id}
  Content-Type: text/event-stream

  data: {"state": "running", "progress": 45}
  data: {"state": "running", "progress": 80}
  data: {"state": "done",    "progress": 100, "filename": "out.pdf", "media_type": "application/pdf"}
  data: {"state": "error",   "progress": 0,   "error": "...message..."}
```

### Download

```
GET /api/download/{job_id}
  → binary file
    Content-Disposition: attachment; filename="<filename>"
```

---

## 🗺️ Roadmap

| Phase | Category | Tools / Features | Status |
|-------|----------|-----------------|--------|
| **Phase 1** | **PDF Tools** | Merge · Split · Compress | ✅ **Done** |
| **Phase 2** | **PDF Tools** | Rotate Pages · Encrypt/Decrypt · Watermark · OCR · Metadata editor | 🔜 Next |
| **Phase 3** | **PDF Conversions** | PDF↔DOCX · PDF→HTML · PDF→TXT · PDF→Images · Images→PDF · DOCX→PDF | 🔜 Planned |
| **Phase 4** | **Document Tools** | DOCX / XLSX / PPTX / RTF / ODT / CSV processing & cross-format conversion | 🔜 Planned |
| **Phase 5** | **Audio** | MP3 · WAV · FLAC · AAC · OGG · WMA · M4A · OPUS conversion & tools | 🔜 Planned |
| **Phase 6** | **Images** | PNG · JPG · WEBP · SVG · HEIC — convert · resize · crop · compress | 🔜 Planned |
| **Phase 7** | **Video** | MP4 · AVI · MKV · MOV · WEBM — convert · trim · compress | 🔜 Planned |

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00E5C0,50:7209b7,100:ff6b00&height=100&section=footer&text=&fontSize=0" width="100%"/>

**Built with 🔥 — Privacy first, always offline, zero compromise.**

<br>

<p align="center">
  <img src="https://img.shields.io/badge/Engine-Python%203.x-3a86ff?style=for-the-badge&logo=python&logoColor=white&labelColor=0A1F1C" alt="Python"/>
  <img src="https://img.shields.io/badge/Shell-Electron-47848F?style=for-the-badge&logo=electron&logoColor=9FEF00&labelColor=0A1F1C" alt="Electron"/>
  <img src="https://img.shields.io/badge/Security-100%25%20Local%20%26%20Private-06d6a0?style=for-the-badge&logo=shield&logoColor=white&labelColor=0A1F1C" alt="Privacy"/>
  <img src="https://img.shields.io/badge/Cloud-Zero%20External%20Calls-e63946?style=for-the-badge&logo=icloud&logoColor=white&labelColor=0A1F1C" alt="Zero Cloud"/>
</p>

</div>
