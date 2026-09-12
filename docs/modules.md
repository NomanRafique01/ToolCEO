# Module System

ToolCEO uses an **on-demand downloadable module system** for tool categories that depend on large third-party engines (LibreOffice, 7-Zip, Calibre, Tesseract OCR).

Rather than bundling all engines in the initial installer, modules are downloaded once from GitHub Releases and installed into the `engines/` directory.

---

## Available Modules

Defined in [`modules.json`](../modules.json) at the project root.

| Module ID | Name | Required By | Engine |
|-----------|------|-------------|--------|
| `office` | Office Module | DOCX/PPTX/XLSX/ODT conversions | LibreOffice |
| `ocr` | OCR Module | PDF OCR, image-to-text | Tesseract OCR |
| `document` | Document Module | Advanced document processing | (bundled deps) |
| `ebook` | eBook Module | EPUB/MOBI/AZW3/FB2 conversions | Calibre |
| `media` | Media Module | Archive create/extract | 7-Zip |

---

## Module Status

Each module has one of two statuses stored in `modules.json`:

| Status | Meaning |
|--------|---------|
| `not_downloaded` | Module has not been downloaded; tools requiring it are locked |
| `installed` | Module is downloaded and extracted into `engines/`; tools are unlocked |

---

## Tool → Module Mapping

The `TOOL_MODULE_MAP` in `frontend/scripts/modulelock.js` maps every tool ID to its required module. Tools not listed in the map are **built-in** (always available — backed by PyMuPDF, Pillow, pikepdf, pandas, etc.).

Examples:

| Tool ID | Required Module |
|---------|----------------|
| `archive-files-zip` | `media` |
| `archive-extract-rar` | `media` |
| `docx-pdf` | `office` |
| `pptx-html` | `office` |
| `epub-mobi` | `ebook` |
| All eBook conversions | `ebook` |

---

## How Module Locking Works

When a user clicks on a tool card that requires a module:

1. `modulelock.js → getLockedModuleId(toolId)` checks the `TOOL_MODULE_MAP`
2. If the module status is not `"installed"`, the tool is **locked**
3. The UI shows a lock overlay on the tool card with a **"Download Module"** button
4. Clicking the button triggers the module download flow

```
User clicks locked tool card
        │
modulelock.getLockedModuleId(toolId)  →  "ebook"
        │
modules.json  →  status: "not_downloaded"
        │
Lock overlay rendered over tool panel
        │
User clicks "Download Module"
        │
moduleDownload.startModuleDownload("ebook", url)
        │
electron IPC: "download-module"
        │
main.js downloads ZIP from GitHub Releases
        │
Extracts to engines/ebook/
        │
modules.json updated: status → "installed"
        │
modulelock.invalidateModuleCache()
        │
Tool unlocked — lock overlay removed
```

---

## Download Flow (In-App)

The module download panel (`#mod-dl-panel`) appears as a floating overlay during the download/install:

```
┌─────────────────────────────────────────────────────────┐
│  📦  Downloading eBook Module                           │
│                                                         │
│  Downloading...                        64%              │
│  ████████████████████████░░░░░░░░░░░░                   │
│                                      [Pause]  [Cancel]  │
└─────────────────────────────────────────────────────────┘
```

Phases:
1. **Downloading** — streamed download from GitHub Releases, shows % progress
2. **Installing** — extraction of the ZIP into `engines/{module_id}/`
3. **Complete** — panel closes, module status updated, tools unlocked

If the connection drops during download, the panel shows a **paused** state and resumes when connectivity is restored.

---

## `modules.json` Schema

```json
{
  "modules": {
    "<module_id>": {
      "name": "Human-readable name",
      "status": "not_downloaded" | "installed",
      "downloadUrl": "https://github.com/.../releases/download/.../module.zip"
    }
  }
}
```

This file lives at the project root and is bundled into the installer as an `extraResource`. It is read at runtime by both the Electron main process and the frontend.

---

## `engines/` Directory Layout

After modules are installed:

```
engines/
├── python/        — Bundled Python runtime (Windows build only)
├── 7zip/          — 7-Zip engine (media module)
├── calibre/       — Calibre CLI (ebook module)
├── document/      — Document processing engine (document module)
├── ebook/         — eBook engine assets (ebook module)
├── ffmpeg/        — FFmpeg (media module — future audio/video)
├── media/         — Media engine assets
└── office/        — LibreOffice (office module)
```

---

## Frontend Module API (`modulelock.js`)

| Export | Description |
|--------|-------------|
| `loadModuleStatuses()` | Reads `modules.json` (via IPC) and caches statuses |
| `getModuleStatuses()` | Returns cached `{ office, ocr, document, ebook, media }` status map |
| `getLockedModuleId(toolId)` | Returns the required module ID if the tool is locked, else `null` |
| `invalidateModuleCache()` | Clears the cache so next call re-reads from disk |
| `TOOL_MODULE_MAP` | Full tool-id → module-id mapping (exported for reference) |

---

## Adding a New Module Requirement

If you create a new tool that depends on an external engine:

1. Add an entry to `modules.json`:
   ```json
   "my_engine": {
     "name": "My Engine Module",
     "status": "not_downloaded",
     "downloadUrl": "https://..."
   }
   ```

2. Add the tool → module mapping in `frontend/scripts/modulelock.js`:
   ```javascript
   export const TOOL_MODULE_MAP = {
     // ...existing entries...
     'my-tool-id': 'my_engine',
   };
   ```

3. In `frontend/scripts/moduleDownload.js`, add the display name:
   ```javascript
   const MODULE_NAMES = {
     // ...existing entries...
     my_engine: 'My Engine Module',
   };
   ```

4. In `electron/main.js`, handle the module extraction into `engines/my_engine/` in the download IPC handler.

The lock UI, download panel, and status tracking are all handled automatically by the existing infrastructure.
