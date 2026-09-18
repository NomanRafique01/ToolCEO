<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:00f5d4,50:7209b7,100:f77f00&height=200&section=header&text=ToolCEO&fontSize=90&fontColor=ffffff&fontAlignY=65&animation=fadeIn&fontAlign=50" width="100%"/>
</p>

<p align="center">
  <a href="https://github.com/NomanRafique01/ToolCEO/releases/latest">
    <img src="https://img.shields.io/badge/Release-v1.0.0-00f5d4?style=flat-square&labelColor=1a1a24" alt="Release Version"/>
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
  <p><strong>A privacy-first, 100% offline desktop toolkit for document manipulation, format conversion, and media processing.</strong></p>
  <p><em>Zero cloud connectivity. Zero external telemetries. Zero file size limitations. Everything executes locally on your hardware.</em></p>
</div>

<br/>

<div align="center">
  <table>
    <tr>
      <td align="center" width="25%">
        <b>100% Offline & Private</b><br/>
        <sub>Zero network calls. Source files and processed outputs never leave the local workstation.</sub>
      </td>
      <td align="center" width="25%">
        <b>Real-Time Event Stream</b><br/>
        <sub>Server-Sent Events (SSE) deliver responsive, frame-accurate progress metrics to the UI.</sub>
      </td>
      <td align="center" width="25%">
        <b>Multi-Format Engine Suite</b><br/>
        <sub>Integrated pipelines for PDF, Office documents, eBooks, audio, video, and raster graphics.</sub>
      </td>
      <td align="center" width="25%">
        <b>Asynchronous Worker Queue</b><br/>
        <sub>Background processing pool allows continuous multitasking without interface locking.</sub>
      </td>
    </tr>
  </table>
</div>

<br/>

---

## Table of Contents

- [Overview](#overview)
- [Downloads & Installation](#downloads--installation)
- [Key Capabilities](#key-capabilities)
  - [PDF Tools](#pdf-tools)
  - [Document Conversions](#document-conversions)
  - [Audio & Media Processing](#audio--media-processing)
  - [Modular Engine Addons](#modular-engine-addons)
- [System Architecture](#system-architecture)
  - [Frontend Shell](#frontend-shell)
  - [Local Backend Daemon](#local-backend-daemon)
  - [Job Execution Lifecycle](#job-execution-lifecycle)
- [Getting Started](#getting-started)
- [Local API Reference](#local-api-reference)
- [Project Roadmap](#project-roadmap)

---

## Overview

ToolCEO is an enterprise-grade desktop utility suite designed to eliminate the security, privacy, and bandwidth liabilities associated with cloud-hosted file conversion portals. Built on Electron and powered by a local FastAPI background daemon, ToolCEO packages industrial processing libraries into an intuitive, dark-mode desktop interface.

Unlike web utilities that upload confidential files to external servers, ToolCEO processes every document, spreadsheet, audio track, and image strictly in memory and local storage.

---

## Downloads & Installation

Pre-compiled binary packages are available for 64-bit Windows environments.

| Distribution Package | Target Architecture | Description | Download Link |
|---|---|---|---|
| **Windows Installer** (`.exe`) | Windows 10 / 11 (x64) | Full setup wizard with desktop shortcut, start menu entry, and uninstaller. | [Download Setup (.exe)](https://github.com/NomanRafique01/ToolCEO/releases/latest/download/ToolCEO-Setup-1.0.0.exe) |
| **Portable Archive** (`.zip`) | Windows 10 / 11 (x64) | Standalone portable executable. Extract and run without administrative privileges. | [Download Portable (.zip)](https://github.com/NomanRafique01/ToolCEO/releases/latest/download/ToolCEO-Setup-1.0.0.zip) |
| **Windows App Package** (`.appx`) | Windows 10 / 11 (x64) | Signed Windows application bundle for standard enterprise deployment. | [Download AppX Package](https://github.com/NomanRafique01/ToolCEO/releases/latest) |

### System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit)
- **Processor:** Intel Core i3 / AMD Ryzen 3 or equivalent
- **Memory (RAM):** 4 GB minimum (8 GB recommended for large batch processing)
- **Disk Space:** 600 MB free storage for core application and runtime dependencies
- **Network:** None required. Operates completely disconnected from the internet

---

## Key Capabilities

### PDF Tools

Production-ready PDF manipulation powered by high-performance PyMuPDF (`fitz`) and `pikepdf` backends.

| Tool Name | Operation ID | Pipeline Implementation | Status |
|---|---|---|---|
| **Merge PDFs** | `merge` | Concatenates multiple PDF streams into a unified document with custom ordering. | Active |
| **Split PDF** | `split` | Parses page ranges, extracts selected sheets, and bundles outputs into single or ZIP formats. | Active |
| **Compress PDF** | `compress` | Performs page raster optimization, JPEG quality scaling, stream deflation, and font subsetting. | Active |
| **Rotate Pages** | `rotate` | Adjusts page orientation matrix across selected or all document pages. | Active |
| **Encrypt / Decrypt** | `security` | Manages 128/256-bit AES password encryption, document restrictions, and decryption. | Active |
| **OCR PDF** | `ocr` | Text-layer extraction from scanned documents using Tesseract OCR engine. | Module Enabled |

### Document Conversions

Seamless document transformation preserving layout, typography, and tabular data.

| Source Format | Target Format | Engine Pipeline | Status |
|---|---|---|---|
| PDF | Microsoft Word (`.docx`) | Semantic text layout reconstruction | Available |
| PDF | Plain Text (`.txt`) | Layout-aware text extraction | Available |
| PDF | Web Page (`.html`) | Structured HTML5 markup generator | Available |
| PDF | Raster Images (`.png`, `.jpg`) | High-DPI page rendering pipeline | Available |
| Office (`.docx`, `.xlsx`, `.pptx`) | PDF (`.pdf`) | Headless document compilation engine | Available |
| Markdown / Text | PDF / HTML | Pandoc document parser | Available |

### Audio & Media Processing

Local audio transcoding and extraction without third-party cloud intermediaries.

| Category | Supported Formats | Core Functionality |
|---|---|---|
| **Audio Transcoding** | MP3, WAV, FLAC, AAC, OGG, WMA, M4A, OPUS | Bitrate adaptation, channel mixing, container conversion. |
| **Media Extraction** | MP4, MKV, AVI, MOV, WEBM | Audio track extraction, batch stream demuxing. |
| **Image Processing** | PNG, JPEG, WEBP, SVG, HEIC, TIFF | Lossless compression, resizing, metadata stripping, format conversion. |

### Modular Engine Addons

To keep the initial application download lightweight, heavy specialized processing engines can be downloaded on-demand and cached locally:

- **Office Module:** Extended LibreOffice engine support for legacy and complex document representations.
- **OCR Module:** Tesseract OCR engine binaries and trained language models.
- **Document Module:** Extended Pandoc and markup transformation utilities.
- **eBook Module:** Calibre conversion engines for EPUB, MOBI, and AZW3 transformations.
- **Media Module:** FFmpeg toolchains for heavy media encoding workflows.

---

## System Architecture

ToolCEO operates using a decoupled desktop architecture: an Electron shell host for UI and native window controls, communicating with a lightweight local FastAPI microservice over loopback HTTP.

### Frontend Shell
- **Environment:** Electron 35+, Chromium runtime, Node.js integration.
- **Design System:** Custom CSS design system with CSS custom properties, responsive panels, and dark-mode styling.
- **IPC Layer:** Secure context bridge (`window.toolceo`) exposing native file dialogs and window state management.
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

## Getting Started

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

The local Python service exposes the following internal endpoints on `http://127.0.0.1:8000`:

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
| **Phase 1** | Core Architecture & PDF Baseline | Split, Merge, Compress, and UI Shell integration | Completed |
| **Phase 2** | Extended PDF Utilities | Page rotation, PDF encryption/decryption, metadata editing | Completed |
| **Phase 3** | Document & Office Transformations | PDF to Word, HTML, text conversions and Office compiling | Active |
| **Phase 4** | Audio & Media Toolchains | Local audio transcoding, format translation, and extraction | In Progress |
| **Phase 5** | Image & Raster Suite | Multi-format image conversion, batch compression, resize | In Progress |
| **Phase 6** | On-Demand Engine Manager | Automated module download and dynamic engine extraction | In Progress |

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00E5C0,50:7209b7,100:ff6b00&height=100&section=footer&text=&fontSize=0" width="100%"/>

<p><strong>ToolCEO Desktop Application</strong></p>
<p><em>Engineered for complete local privacy, zero cloud footprint, and uncompromised performance.</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Stable-10b981?style=flat-square&labelColor=1a1a24" alt="Status Stable"/>
  <img src="https://img.shields.io/badge/Architecture-x64-3b82f6?style=flat-square&labelColor=1a1a24" alt="Arch x64"/>
  <img src="https://img.shields.io/badge/Local%20Port-8000-6366f1?style=flat-square&labelColor=1a1a24" alt="Port 8000"/>
</p>

</div>
