<h1 align="center">
  <img src="assets/icon-readme.png" width="150" height="150" alt="ToolCEO logo"/><br/>
  ToolCEO
</h1>

<p align="center">
  <strong>The all-in-one offline file conversion powerhouse for Windows.</strong><br/>
  <sub>172 tools for documents, images, eBooks, and archives — every conversion runs 100% locally. No uploads, no accounts, no limits.</sub>
</p>

<p align="center">
  <a href="https://github.com/NomanRafique01/ToolCEO/releases/latest">
    <img src="https://img.shields.io/github/v/release/NomanRafique01/ToolCEO?style=flat-square&color=00f5d4" alt="Latest release"/>
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078d4?style=flat-square&logo=windows&logoColor=white" alt="Platform: Windows x64"/>
  <img src="https://img.shields.io/badge/tools-172%20offline-10b981?style=flat-square" alt="172 offline tools"/>
  <img src="https://img.shields.io/badge/Electron-43-47848f?style=flat-square&logo=electron&logoColor=white" alt="Electron 43"/>
  <img src="https://img.shields.io/badge/FastAPI-backend-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/github/license/NomanRafique01/ToolCEO?style=flat-square" alt="MIT license"/>
  <img src="https://hits.sh/github.com/NomanRafique01/ToolCEO.svg?style=flat-square&label=Visitors&color=00E5C0&labelColor=1a1a24" alt="Repository visitor counter"/>
</p>

<p align="center">
  <a href="#download">
    <img src="https://img.shields.io/badge/Download-Latest%20Version-00f5d4?style=for-the-badge&logo=windows&logoColor=white&labelColor=1a1a24" alt="Download latest version"/>
  </a>
  <a href="#tool-catalog">
    <img src="https://img.shields.io/badge/Explore-172%20Tools-7209b7?style=for-the-badge&logo=toolbox&logoColor=white&labelColor=1a1a24" alt="Explore tools"/>
  </a>
</p>

---

## Table of Contents

- [Why ToolCEO](#why-toolceo)
- [Download](#download)
- [Features](#features)
- [Installation](#installation)
- [Tool Catalog](#tool-catalog)
- [Modular Engines](#modular-engines)
- [Development](#development)
- [Local API](#local-api)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Feedback](#feedback)
- [License](#license)

## Why ToolCEO

Web converters force you to upload private documents to someone else's server, queue behind paywalls, and accept file-size limits. ToolCEO takes the opposite approach:

| | Online converters | **ToolCEO** |
|---|---|---|
| Where files are processed | Remote servers | **Your own hardware** |
| Privacy | Files leave your machine | **Zero uploads, zero telemetry** |
| File size limits | Almost always | **None** |
| Internet required | Yes | **No** |
| Accounts / sign-ups | Usually | **Never** |
| Batch processing | Paid tiers | **Built in, free** |
| Cost | Subscriptions | **Free and open source (MIT)** |

## Download

<p align="center">
  <a href="https://github.com/NomanRafique01/ToolCEO/releases/latest/download/ToolCEO.Setup.1.0.0.exe">
    <img src="https://img.shields.io/badge/Download-Windows%20x64%20Installer-00f5d4?style=for-the-badge&logo=windows&logoColor=white&labelColor=1a1a24" alt="Download Windows installer"/>
  </a>
  <a href="https://github.com/NomanRafique01/ToolCEO/releases/latest">
    <img src="https://img.shields.io/badge/All%20Releases-GitHub-64748b?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a24" alt="All releases"/>
  </a>
</p>

The latest version is always available on the [releases page](https://github.com/NomanRafique01/ToolCEO/releases/latest). The Windows installer (`ToolCEO.Setup.*.exe`, ~206 MB) includes the full app with all 172 tools; optional conversion engines download on demand from inside the app.

## Features

### Privacy by design
- **100% local processing** — a bundled FastAPI service runs on `127.0.0.1` and never talks to the internet; source files and outputs stay on your workstation
- **Zero telemetry** — no analytics, no crash reporting, no phone-home of any kind
- **No file size limits** — the only ceiling is your own disk and RAM

### Power-user workflow
- **Drag & drop anywhere** — drop files onto the window to instantly load them into the active tool
- **Clipboard paste** — load files straight from the clipboard with one click
- **Batch queues** — convert many files at once with live per-file progress, drag-to-reorder support for image-to-PDF tools, and graceful handling of large queues
- **Background job engine** — conversions run in a worker pool with Server-Sent Events streaming frame-accurate progress from 0% to 100%, so the UI never freezes
- **Persistent state** — your selected files survive navigation between tools

### Organization
- **Instant search** — find any of the 172 tools from the header search bar, filtered by category
- **Favourites** — star the tools you use most for one-click access
- **Recent panel** — jump back into your last conversions
- **Dark native UI** — a polished Electron shell with a dashboard organized by tool family

### On-demand engines
- Heavy conversion engines (Office, OCR, eBook, and more) install only when you first need them, keeping the base installer lean — see [Modular Engines](#modular-engines)

## Installation

Pre-built packages are available for 64-bit Windows.

| Package | Description | Download |
|---|---|---|
| **Installer** (`.exe`) | Setup wizard with Start Menu entry, desktop shortcut, and uninstaller | [Download](https://github.com/NomanRafique01/ToolCEO/releases/latest/download/ToolCEO.Setup.1.0.0.exe) |

### System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| OS | Windows 10 (x64) | Windows 11 (x64) |
| Processor | Intel Core i3 / AMD Ryzen 3 | Any modern quad-core |
| Memory | 4 GB RAM | 8 GB RAM for large batches |
| Storage | 1 GB free | 3 GB free with all optional modules |
| Network | Not required | Not required |

## Tool Catalog

All 172 tools work offline out of the box. Tools that need a heavy engine are marked in-app and unlock automatically once the matching [module](#modular-engines) is installed.

| Category | Tools | Breakdown |
|---|:---:|---|
| **Documents** | 55 | PDF Tools (8), PDF Conversions (7), Word (6), Excel (6), PowerPoint (6), Text (7), OpenDocument (7), CSV (8) |
| **Images** | 27 | JPG (8), PNG (7), WebP (7), SVG (4), Smart Compressor (1) |
| **eBooks** | 42 | PDF, EPUB, MOBI, AZW3, FB2, TXT, RTF — 6 tools each |
| **Archives** | 48 | Create (10), Extract (12), ZIP / TAR / 7Z / TAR.GZ / RAR convert (4 each), Utilities (6) |
| **Total available** | **172** | |

### Documents — 55 tools
The complete PDF suite: merge, split, compress, rotate, watermark, encrypt, decrypt, OCR, metadata, page thumbnails, and reorder — plus two-way conversions between PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), HTML, Markdown, plain text, OpenDocument (ODT/ODS/ODP), and CSV.

### Images — 27 tools
Convert between JPG, PNG, WebP, and SVG in every direction, plus a smart batch compressor with quality control and a resizer for large queues.

### eBooks — 42 tools
Six tools for each of the seven major reading formats — PDF, EPUB, MOBI, AZW3, FB2, TXT, and RTF — covering conversion to and from every other format in the family.

### Archives — 48 tools
Create and extract ZIP, 7Z, TAR, TAR.GZ, and RAR archives; convert between archive formats; split and merge multi-part archives; and add password protection.

### Coming soon
- **Audio** — MP3, WAV, FLAC, AAC, OGG, WMA, M4A, OPUS conversions
- **Video** — transcoding between MP4, MKV, AVI, MOV, and more
- **Data** — CSV, JSON, XML, YAML, SQL transformations

## Modular Engines

Heavy processing engines are downloaded from the in-app **Modules** panel and cached locally for offline use. Each module installs with real-time percentage progress and is only fetched the first time a tool that needs it is used.

| Module | Purpose | Download size |
|---|---|---|
| **Office** | Advanced DOC/DOCX, XLS/XLSX, and PPT/PPTX conversion | ~318 MB |
| **OCR** | Text recognition for scanned PDFs and images | ~46 MB |
| **Document** | Pandoc-based Markdown, LaTeX, RTF, and EPUB compilation | ~43 MB |
| **eBook** | Calibre-based eBook transformation | ~281 MB |
| **Media** | Audio and video transcoding (coming soon) | ~43 MB |

Once downloaded, modules never need the internet again — everything stays cached on disk.

## Development

### Prerequisites

- Node.js 18.0 or later
- Python 3.10 or later
- npm and pip

### Setup

```bash
# Clone and install frontend dependencies
git clone https://github.com/NomanRafique01/ToolCEO.git
cd ToolCEO
npm install

# Set up the Python backend
cd backend
python -m venv venv
source venv/bin/activate        # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Launch the app
npm start
```

### Project structure

```
ToolCEO/
├── electron/        # Desktop shell: window, IPC bridge, module runtime
├── frontend/        # UI: dashboard, tool panels, dropzone, styles
│   ├── scripts/     # Category renderers, navigation, search, favourites
│   └── tools/       # Per-tool client logic (documents, images, ebooks, archives)
├── backend/         # Local FastAPI service: routers, job queue, converters
│   ├── routers/     # PDF tools, conversions, SSE progress endpoints
│   └── tools/       # Conversion engines per file family
├── scripts/         # Build pipeline: icons, manifests, packaging
└── assets/          # App icons and installer resources
```

### Build

```bash
npm run build        # Windows x64 installer (NSIS)
```

The build pipeline generates icons, writes `build-info.json`, and packages the Electron shell together with the Python backend into a single installer.

## Local API

The backend exposes the following endpoints on `http://127.0.0.1:8765`. Long-running operations return a `job_id`, which you can poll through the progress stream and then download.

| Endpoint | Method | Input | Output |
|---|---|---|---|
| `/health` | `GET` | None | `{ "status": "ok" }` |
| `/api/pdf/merger/merge` | `POST` | `files: UploadFile[]` | `{ "job_id": "<uuid>" }` |
| `/api/pdf/split` | `POST` | `file: UploadFile`, `ranges: string` | `{ "job_id": "<uuid>" }` |
| `/api/pdf/compress` | `POST` | `file: UploadFile`, `quality: string` | `{ "job_id": "<uuid>" }` |
| `/api/progress/{job_id}` | `GET` | `job_id` (path) | `text/event-stream` |
| `/api/download/{job_id}` | `GET` | `job_id` (path) | Binary file stream |

The API is bound to localhost only and exists to serve the desktop UI — it is not reachable from other machines.

## Roadmap

| Phase | Milestone | Status |
|---|---|---|
| 1 | Core architecture: Electron shell, FastAPI daemon, SSE progress, base UI | ✅ Completed |
| 2 | Professional PDF suite: split, merge, compress, rotate, encrypt/decrypt, OCR | ✅ Completed |
| 3 | Document and Office conversions: PDF, Word, Excel, PowerPoint, HTML, text | ✅ Completed |
| 4 | Image tools: multi-format conversion, batch compression, resizing | ✅ Completed |
| 5 | On-demand modular engine runtime: download, extraction, and caching | ✅ Completed |
| 6 | Audio, video, and data tools | 🚧 Coming soon |

## FAQ

<details>
<summary><b>Is it really 100% offline?</b></summary>
Yes. All conversion runs through a local FastAPI service bound to <code>127.0.0.1</code>. The only network access in the entire app is the optional one-time download of conversion engines from the Modules panel — and even that is cached for offline use afterwards.
</details>

<details>
<summary><b>Do I need to install the modules?</b></summary>
Only for the tools that need them. The app tells you which module a locked tool requires and installs it with one click, showing real-time progress.
</details>

<details>
<summary><b>Are there file size limits?</b></summary>
No artificial limits. Practical limits are your disk space and RAM; the job queue is built to keep the UI responsive even with large batches.
</details>

<details>
<summary><b>Is ToolCEO free?</b></summary>
Yes — free and open source under the MIT License.
</details>

<details>
<summary><b>Which Windows versions are supported?</b></summary>
Windows 10 and Windows 11, 64-bit only.
</details>

## Feedback

Found a bug or have a feature request? Please open an issue on the [GitHub repository](https://github.com/NomanRafique01/ToolCEO/issues).

## License

ToolCEO is released under the MIT License — free to use, modify, and redistribute. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built by <a href="https://github.com/NomanRafique01">Noman Rafique</a></sub>
</p>
