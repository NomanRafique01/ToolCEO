# Architecture

ToolCEO is structured as two cooperating processes launched together by the Electron shell.

---

## High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron Shell                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │             Frontend  (HTML / CSS / ES Modules)            │  │
│  │                                                            │  │
│  │  Sidebar Nav ──► Category Panel ──► Tool Panel             │  │
│  │       │                 │                  │               │  │
│  │  navigation.js    documents.js        dropzone.js          │  │
│  │  audio.js         images.js           toolstate.js         │  │
│  │  ebooks.js        archives.js         notificationBanner   │  │
│  └──────────────────────────┬───────────────────────────────┘  │
│                             │  fetch  +  SSE                    │
│                             ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │        Python FastAPI Backend  (Uvicorn · port 8000)       │  │
│  │                                                            │  │
│  │  POST /api/<tool>/convert  ──► Tool Routers                │  │
│  │  GET  /api/progress/{id}   ──► SSE Progress Stream         │  │
│  │  GET  /api/download/{id}   ──► Binary File Download        │  │
│  │  DELETE /api/jobs/{id}     ──► Job Cancellation            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Process Model

### Electron Main Process (`electron/main.js`)

- Creates the `BrowserWindow` and loads `frontend/index.html`
- Spawns the Python backend as a child process
- Exposes a **context bridge** (`electron/preload.js`) under `window.toolceo`
- Handles IPC channels for file save dialogs, module downloads, history DB, vault files (`.tceo`)
- Registers the `.tceo` file extension on Windows (HKCU registry), macOS, and Linux (xdg-mime)
- Enforces a single-instance lock — a second launch relays the file path to the running window

### Context Bridge (`electron/preload.js`)

Exposes safe wrappers to the renderer via `window.toolceo`:

| API | Description |
|-----|-------------|
| `saveFileAs(filename, base64)` | Opens native Save dialog and writes the file |
| `downloadModule(id, url, cb)` | Downloads + installs an optional engine module |
| `getModuleStatus(id)` | Returns the installed/not_downloaded status |
| `openExternal(url)` | Opens a URL in the system browser |
| `history.*` | CRUD for conversion history (SQLite) |
| `vaultOpen(path)` | Triggers vault file open flow |

### Python Backend (`backend/main.py`)

- A **FastAPI** application served by **Uvicorn** on `http://127.0.0.1:8000`
- CORS is wide-open (`allow_origins=["*"]`) because it only binds to localhost
- Each tool family owns its own router, registered at startup
- All heavy work is offloaded to background threads — the event loop stays free

---

## Request Lifecycle

```
User drops file onto DropZone
        │
        ▼
dropzone.js  ──►  POST /api/<tool>/convert  ──►  FastAPI Router
                                                       │
                                          jobs.create_job()
                                                       │
                               BackgroundThread(engine.run, job_id)
                                                       │
                         ┌─────────────────────────────┘
                         │
              GET /api/progress/{job_id}   ◄──  SSE poll (0.25 s)
              frontend listens on EventSource
                         │
                    state == "done"
                         │
              GET /api/download/{job_id}  ──►  Binary bytes
                         │
              window.toolceo.saveFileAs()  ──►  Native Save Dialog
```

Steps in detail:

1. **Upload** — `dropzone.js` sends a `multipart/form-data` POST with the file(s) and tool options.
2. **Job creation** — the router calls `jobs.create_job()` which returns a UUID-keyed `Job` object stored in-memory.
3. **Background thread** — the router spawns `threading.Thread(target=engine_function, args=(job_id, ...))` and immediately returns `{"job_id": "..."}` to the frontend.
4. **SSE stream** — the frontend opens an `EventSource` on `/api/progress/{job_id}`. The SSE router polls the in-memory job every 250 ms and streams JSON events.
5. **Smooth progress** — `jobs.smooth_progress()` context manager creeps the stored progress value between milestones so the ring never appears frozen.
6. **Completion** — the engine calls `jobs.set_done(job_id, result_bytes, filename, media_type)`. The SSE stream emits `state: done` and closes.
7. **Download** — the frontend calls `GET /api/download/{job_id}` which returns the stored bytes as an `application/octet-stream` response.
8. **Save** — `window.toolceo.saveFileAs()` triggers the native Electron save dialog.

---

## Frontend Module Map

```
frontend/scripts/
├── main.js               Bootstrap: imports and wires all modules
├── navigation.js         Sidebar nav click handlers, breadcrumb, panel swap
├── documents.js          Documents category — format grid, sub-panel loader
├── images.js             Images category — format grid renderer
├── audio.js              Audio category grid (UI only)
├── ebooks.js             eBooks category — format grid + tool loader
├── archives.js           Archives category — create/extract panels
├── dropzone.js           Drag-and-drop, file upload, progress ring UI
├── toolstate.js          Active tool state, background job bar sync
├── notificationBanner.js Toast notification renderer
├── notificationStore.js  Notification queue + event bus
├── toolFamily.js         Tool family routing helper
├── moduleDownload.js     Module download UI flow
├── modulelock.js         Locks tools behind required module checks
├── modules.js            Module registry queries
├── quickconvert.js       Quick-convert shortcut handler
├── favourites.js         Favourite tools persistence
├── recent.js             Recent conversions list
├── recentWidget.js       Sidebar recent-widget renderer
├── historyTracker.js     Conversion history IPC bridge
└── vaultFileHandler.js   .tceo vault file open/create flow
```

---

## Backend Module Map

```
backend/
├── main.py               FastAPI app — middleware + all router registrations
├── jobs.py               In-memory job store (Job dataclass + helpers)
├── job_executor.py       Bounded thread-pool worker queue
├── platform_tools.py     OS-level helpers (engine binary resolution)
│
├── routers/
│   ├── sse_progress.py   GET /api/progress/{id}  +  GET /api/download/{id}
│   ├── pdf_tools.py      Legacy monolithic PDF router (being retired)
│   └── pdf_conversions.py PDF conversion stub routes
│
└── tools/
    ├── documents/
    │   ├── pdf_tools/    compressor · merger · splitter · rotate · encrypt
    │   │                 editor · water_mark · extractor
    │   ├── pdf_convertor/ pdf_word · pdf_excel · pdf_html · pdf_txt
    │   │                  pdf_ppt · pdf_images · images_pdf
    │   ├── docx_convertor/
    │   ├── pptx_convertor/
    │   ├── xlsx_convertor/
    │   ├── txt_convertor/
    │   ├── odt_convertor/
    │   └── csv_convertor/
    ├── images/
    │   ├── image_compressor/
    │   ├── jpg_convertor/
    │   ├── png_convertor/
    │   ├── webp_convertor/
    │   └── svg_convertor/
    ├── ebooks/
    │   ├── router.py
    │   └── utils/  calibre_engine.py · pdf_epub_engine.py
    └── archives/
        ├── engine.py
        └── router.py
```

Every tool sub-package follows the same two-file convention:

| File | Responsibility |
|------|---------------|
| `engine.py` | Pure processing logic — reads input bytes, writes output bytes, emits `jobs.set_progress()` calls |
| `router.py` | FastAPI router — validates request, spawns background thread, returns `job_id` |
