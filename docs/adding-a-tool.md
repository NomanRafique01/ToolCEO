# Adding a New Tool

This guide walks through adding a new conversion tool end-to-end — backend engine, FastAPI router, frontend panel, and wiring everything together.

We'll use a hypothetical **RTF → DOCX** converter as the running example.

---

## Overview of the Pattern

Every tool in ToolCEO follows this structure:

```
backend/tools/<category>/<tool_name>/
├── __init__.py     — package marker + optional exports
├── engine.py       — pure processing logic
└── router.py       — FastAPI router (job dispatch + SSE hookup)

frontend/tools/<category>/<tool_name>/
├── <tool_name>.js  — UI panel (dropzone options, progress, download)
└── <tool_name>.css — scoped styles for this panel
```

The frontend communicates with the backend only through the job system:
1. POST to start a job → receives `job_id`
2. EventSource on `/api/progress/{job_id}` → polls progress
3. GET `/api/download/{job_id}` → retrieves result bytes
4. `window.toolceo.saveFileAs()` → native save dialog

---

## Step 1 — Backend: `engine.py`

Create `backend/tools/documents/rtf_convertor/engine.py`:

```python
"""
RTF → DOCX engine — ToolCEO
"""
from __future__ import annotations
import jobs


def rtf_to_docx(data: bytes, job_id: str) -> bytes:
    """
    Convert RTF bytes to DOCX bytes.
    Updates job progress via jobs.set_progress().
    Returns output DOCX bytes.
    """
    jobs.set_progress(job_id, 10)

    # --- your conversion logic here ---
    # e.g. use striprtf + python-docx, or call LibreOffice CLI
    from striprtf.striprtf import rtf_to_text
    from docx import Document
    import io

    jobs.set_progress(job_id, 40)
    text = rtf_to_text(data.decode("utf-8", errors="replace"))

    jobs.set_progress(job_id, 70)
    doc = Document()
    for line in text.splitlines():
        doc.add_paragraph(line)

    jobs.set_progress(job_id, 90)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
```

**Rules for engine functions:**
- Accept `data: bytes` (the uploaded file) and `job_id: str`
- Call `jobs.set_progress(job_id, N)` at meaningful milestones (0–100)
- Return the output as `bytes`
- Raise `ValueError` for expected failures (bad input, unsupported format)
- Let unexpected exceptions propagate — the router catches them

For long single-step operations, wrap with `jobs.smooth_progress()` to keep the ring moving:

```python
with jobs.smooth_progress(job_id, 20, 80):
    result = slow_library_call(data)
jobs.set_progress(job_id, 80)
```

---

## Step 2 — Backend: `router.py`

Create `backend/tools/documents/rtf_convertor/router.py`:

```python
"""
RTF Converter router — ToolCEO
POST /api/rtf/to-docx/convert
"""
from __future__ import annotations

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse
from typing import Optional

import jobs as job_store
from job_executor import job_executor
from tools.documents.rtf_convertor.engine import rtf_to_docx

router = APIRouter(prefix="/rtf", tags=["RTF Converter"])


@router.post("/to-docx/convert")
async def convert_rtf_to_docx(
    file: UploadFile = File(...),
    output_filename: Optional[str] = Form(None),
):
    data = await file.read()

    out_name = (output_filename or file.filename or "output").rsplit(".", 1)[0]
    out_name += ".docx"

    job = job_store.create_job()

    def _run():
        try:
            result = rtf_to_docx(data, job.id)
            job_store.set_done(
                job.id, result, out_name,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
        except ValueError as exc:
            job_store.set_error(job.id, str(exc))
        except Exception as exc:
            job_store.set_error(job.id, f"Unexpected error: {exc}")

    job_executor.submit(_run)
    return JSONResponse({"job_id": job.id}, status_code=202)
```

**Rules for routers:**
- Use `APIRouter(prefix="/your-prefix", tags=["..."])` — never hardcode full paths in decorators
- Read the file with `await file.read()` **before** spawning the thread (UploadFile is not thread-safe)
- Always return `{"job_id": job.id}` with `status_code=202`
- Submit work with `job_executor.submit(_run)` — never `threading.Thread` directly
- Catch `ValueError` (user error) and generic `Exception` (unexpected) in the thread

---

## Step 3 — Register the Router in `main.py`

Open `backend/main.py` and add two lines:

```python
# at the top with the other imports
from tools.documents.rtf_convertor.router import router as rtf_convertor_router

# at the bottom with the other app.include_router() calls
app.include_router(rtf_convertor_router, prefix="/api")
```

---

## Step 4 — Frontend: `<tool>.js`

Create `frontend/tools/documents/rtf_convertor/rtf_convertor.js`:

```javascript
/**
 * RTF → DOCX Converter panel
 *
 * Exports:
 *   buildRtfConvertorPanel(container)  — renders the panel into container
 */

import { setBgJob, syncBgJobBar } from '../../../../scripts/toolstate.js';
import { pushNotification }        from '../../../../scripts/notificationStore.js';
import {
  showProgress, updateProgress,
  showDownload, showError, resetZoneContent,
} from '../../../shared/progress.js';

const BACKEND = 'http://127.0.0.1:8000';

export function buildRtfConvertorPanel(container) {
  container.innerHTML = `
    <div class="tool-panel">
      <h2 class="tool-title">RTF → DOCX</h2>
      <p class="tool-subtitle">Convert Rich Text Format to Microsoft Word</p>

      <div id="drop-zone" class="drop-zone">
        <p>Drop your .rtf file here or <label class="dz-browse">
          <input type="file" id="rtf-file-input" accept=".rtf" hidden>
          browse
        </label></p>
      </div>
    </div>
  `;

  const input = container.querySelector('#rtf-file-input');
  const zone  = container.querySelector('#drop-zone');

  // ── file pick ──────────────────────────────────────────────────────────────
  input.addEventListener('change', () => {
    if (input.files[0]) _startConversion(input.files[0], zone);
  });

  // ── drag-and-drop ──────────────────────────────────────────────────────────
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dz-hover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dz-hover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dz-hover');
    const file = e.dataTransfer.files[0];
    if (file) _startConversion(file, zone);
  });
}

async function _startConversion(file, zone) {
  showProgress(zone, file.name);

  const form = new FormData();
  form.append('file', file);
  form.append('output_filename', file.name.replace(/\.rtf$/i, '.docx'));

  let jobId;
  try {
    const res = await fetch(`${BACKEND}/api/rtf/to-docx/convert`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ({ job_id: jobId } = await res.json());
  } catch (err) {
    showError(zone, `Upload failed: ${err.message}`);
    return;
  }

  // ── SSE progress ───────────────────────────────────────────────────────────
  const es = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  es.onmessage = ({ data }) => {
    const ev = JSON.parse(data);
    updateProgress(zone, ev.progress);

    if (ev.state === 'done') {
      es.close();
      showDownload(zone, ev.filename, jobId);
      pushNotification({ type: 'success', title: 'RTF → DOCX', message: ev.filename });
    }
    if (ev.state === 'error') {
      es.close();
      showError(zone, ev.error);
      pushNotification({ type: 'error', title: 'RTF → DOCX', message: ev.error });
    }
  };
  es.onerror = () => { es.close(); showError(zone, 'Connection lost.'); };
}
```

**Key conventions:**
- Always import `showProgress`, `updateProgress`, `showDownload`, `showError` from `../../../shared/progress.js`
- Always call `pushNotification` on completion and error
- Use `syncBgJobBar` / `setBgJob` from `toolstate.js` if you want the sidebar background job bar
- `BACKEND` constant must be `http://127.0.0.1:8000`

---

## Step 5 — Frontend: `<tool>.css`

Create `frontend/tools/documents/rtf_convertor/rtf_convertor.css`:

```css
/* RTF Convertor — scoped styles */

.tool-panel {
  padding: 1.5rem;
}

.tool-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.tool-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 1.5rem;
}
```

Reuse CSS custom properties from `frontend/styles/base.css` (`--text-primary`, `--text-muted`, `--accent`, `--surface`, `--border`, etc.).

---

## Step 6 — Wire into the Category Panel

Open the relevant category script (e.g. `frontend/scripts/documents.js`) and register the new tool so it appears in the tool grid and its panel loads on click:

```javascript
// In the tool definitions array / switch-case that maps tool IDs to panel loaders:
import { buildRtfConvertorPanel } from '../tools/documents/rtf_convertor/rtf_convertor.js';

// Inside the tool card definitions:
{ id: 'rtf-docx', label: 'RTF → DOCX', icon: '📄', accent: '#a78bfa' }

// Inside the panel loader switch:
case 'rtf-docx':
  buildRtfConvertorPanel(panelContainer);
  break;
```

---

## Step 7 — Add the `__init__.py`

Create `backend/tools/documents/rtf_convertor/__init__.py` (can be empty):

```python
```

---

## Checklist

Before submitting a new tool, verify:

- [ ] `engine.py` — processes in a background thread, no async, returns bytes
- [ ] `engine.py` — calls `jobs.set_progress()` at multiple points (not just 0 and 100)
- [ ] `router.py` — reads file bytes with `await file.read()` **before** `submit()`
- [ ] `router.py` — returns `{"job_id": ...}` with `status_code=202`
- [ ] `router.py` — catches both `ValueError` and bare `Exception` in the thread
- [ ] `main.py` — router imported and registered with `app.include_router(..., prefix="/api")`
- [ ] Frontend — `showProgress` / `updateProgress` / `showDownload` / `showError` used correctly
- [ ] Frontend — `pushNotification` called on success and error
- [ ] Frontend — tool card registered in the category panel script
- [ ] `__init__.py` added to the new backend package

---

## Shared Frontend Utilities

| Module | Path | Exports |
|--------|------|---------|
| Progress helpers | `frontend/tools/shared/progress.js` | `showProgress`, `updateProgress`, `showDownload`, `showError`, `resetZoneContent`, `showScanProgress` |
| PDF renderer | `frontend/tools/shared/pdfRenderer.js` | `getOfflinePdfInfo` (client-side thumbnail) |
| Tool state | `frontend/scripts/toolstate.js` | `getActiveTool`, `setBgJob`, `getBgJob`, `syncBgJobBar`, `clearBgJob` |
| Notifications | `frontend/scripts/notificationStore.js` | `pushNotification` |
| Module lock | `frontend/scripts/modulelock.js` | `requireModule(id)` — gates tools behind installed modules |
