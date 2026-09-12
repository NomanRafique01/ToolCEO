# Getting Started

This guide walks through setting up ToolCEO for **local development** on Windows, macOS, or Linux.

---

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | v18 or higher | Electron shell + build tooling |
| **Python** | 3.10 or higher | FastAPI backend |
| **pip** | latest | Python package installer |
| **Git** | any | Clone the repository |

> **Windows note:** On Windows, the packaged build bundles its own Python interpreter inside `engines/python/`. In development mode you use your own system Python.

---

## 1. Clone the Repository

```bash
git clone https://github.com/NomanRafique01/ToolCEO.git
cd ToolCEO
```

---

## 2. Install Node Dependencies

```bash
npm install
```

This installs Electron, electron-builder, adm-zip, better-sqlite3, and jimp.

---

## 3. Set Up the Python Virtual Environment

```bash
cd backend
python -m venv venv
```

Activate it:

```bash
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (CMD)
.\venv\Scripts\activate.bat

# macOS / Linux
source venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Key packages installed:

| Package | Purpose |
|---------|---------|
| `fastapi` | REST API framework |
| `uvicorn` | ASGI server |
| `PyMuPDF` | PDF read / write / render |
| `pikepdf` | PDF encryption & low-level manipulation |
| `pdfplumber` | PDF text & table extraction |
| `Pillow` | Image processing |
| `pillow-heif` | HEIC image support |
| `cairosvg` | SVG → raster conversion |
| `scour` | SVG optimization |
| `python-pptx` | PPTX read / write |
| `openpyxl` | XLSX read / write |
| `pandas` | Data manipulation (CSV, Excel) |
| `lxml` | XML / HTML processing |
| `fonttools` | Font subsetting for PDF compression |
| `pycryptodome` | AES encryption for vault files |
| `cryptography` | Additional crypto primitives |
| `python-multipart` | Multipart file upload parsing |
| `pytesseract` | OCR (reserved — future tool) |

---

## 4. Start the Backend

The backend must be running before the Electron window tries to make API calls.

```bash
# From the backend/ directory with the venv active
uvicorn main:app --reload --port 8000
```

You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

Verify with a quick health check:

```bash
curl http://127.0.0.1:8000/health
# → {"status":"ok"}
```

---

## 5. Launch the Electron App

Open a **second terminal** in the project root (keep the backend terminal running):

```bash
npm start
```

`start.js` launches both processes — if you use `npm start` it handles the backend startup automatically. You can also start them separately as described above for more control during development.

The Electron window loads `frontend/index.html` and communicates with the backend at `http://127.0.0.1:8000`.

> **Both processes must be running simultaneously.** If the backend is not reachable on port 8000, conversion jobs will fail silently in the frontend.

---

## 6. Optional: Install Feature Modules

Some tool categories (Office, OCR, eBook, Media) depend on optional engine modules that are not bundled by default. You can download them from within the app via **Settings → Modules**, or manually:

```bash
# Example: download the eBook module
# (handled automatically by the in-app module manager)
```

See [Module System](./modules.md) for details.

---

## Building a Distributable (Windows)

```bash
npm run build
```

This runs `scripts/prebuild.js` (copies the Python runtime into `engines/python/`) then invokes electron-builder to produce a Windows NSIS installer in `dist/`.

The installer:
- Bundles the full Python runtime and all `pip` packages
- Bundles pre-compiled engine binaries (7-Zip, Calibre, FFmpeg, etc.) from `engines/`
- Creates desktop and Start Menu shortcuts
- Registers the `.tceo` vault file association

---

## Project Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Start (dev) | `npm start` | Launches backend + Electron together |
| Build | `npm run build` | Builds Windows installer via electron-builder |
| Dist | `npm run dist` | Alias for build |
| Pre-build | `npm run prebuild` | Runs `scripts/prebuild.js` — copies Python runtime |

---

## Development Tips

- **Hot-reload backend:** `uvicorn main:app --reload` watches Python files and restarts on change.
- **Frontend changes:** Just save the file — Electron serves directly from `frontend/`, no rebuild needed. Press `Ctrl+R` in the Electron window to reload the renderer.
- **DevTools:** In development mode, press `Ctrl+Shift+I` (or `F12`) inside the Electron window to open Chromium DevTools.
- **Backend logs:** All `print()` and `logging` output from the Python backend appears in the terminal where you ran `uvicorn`.
- **API explorer:** With the backend running, open `http://127.0.0.1:8000/docs` in a browser for the auto-generated FastAPI Swagger UI.
