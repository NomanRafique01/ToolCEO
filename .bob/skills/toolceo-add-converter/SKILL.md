---
name: toolceo-add-converter
description: Use when adding a new file conversion tool to ToolCEO end-to-end — covers backend engine, router, main.py registration, frontend card (documents.js), shared base JS, thin wrappers, dropzone wiring, and progress.js cleanup.
---

# ToolCEO — Add a New Conversion Tool (End-to-End)

Follow these steps in order every time a new conversion tool needs to be integrated into ToolCEO.
No file scanning is needed — all locations are pinpointed below.

---

## Architecture Cheatsheet

```
backend/
  main.py                                  ← register every router here
  platform_tools.py                        ← find_libreoffice(), find_pandoc(), find_ghostscript()
  jobs.py                                  ← create_job / set_progress / set_done / set_error
  tools/documents/<family>/
    engine.py                              ← conversion logic (LibreOffice or Pandoc subprocess)
    router.py                              ← FastAPI routes: POST /api/<family>/<target>/convert
    __init__.py                            ← empty, required

frontend/
  scripts/
    dropzone.js                            ← imports, remove-on-reset, dispatch by tool.id
    documents.js                           ← DOC_FORMATS array + renderXxxTools() drill-down panel
  tools/
    documents/<family>/
      <family>_base.js  (OR single file)   ← all UX logic (scan→thumb→settings→SSE→download)
      <family>_<target>.js                 ← thin wrapper: exports handle+remove, calls base
    shared/
      progress.js                          ← resetZoneContent: add .dz-<family>-thumb-wrap selector
                                             + 'dz-has-<family>-thumb' class
  styles/
    documents.css                          ← .fmt-card--<family>-entry::after { display:none }
                                             (only needed if the family card drills down to a sub-grid)
```

**Backend engines:** LibreOffice (`soffice --headless --convert-to <fmt>`) or Pandoc (`pandoc -f <src> -t <dst>`).  
Both binaries are located by `platform_tools.find_libreoffice()` / `find_pandoc()` — never hardcode paths.

**SSE job flow (every tool uses the same pattern):**
1. Frontend `POST /api/<family>/<target>/convert` → backend returns `{ "job_id" }` (202)
2. Frontend opens `EventSource /api/progress/{jobId}`
3. Backend calls `job_store.set_progress(job_id, pct)` at milestones → SSE pushes `{ state, progress }`
4. On `state === "done"` frontend calls `showDownload(zone, filename, jobId, color, onReset)`
5. User clicks "Save As…" → frontend fetches `/api/download/{jobId}`

---

## Step 1 — Gather Requirements

Use `ask_followup_question` to confirm:
- Source format (e.g. DOCX) and list of target formats (e.g. PDF, HTML, TXT…)
- Which engine: LibreOffice for office/PDF formats; Pandoc for markup/ebook formats
- The tool IDs to use: `<src>-<dst>` (e.g. `docx-pdf`, `docx-md`) — all lowercase, hyphen-separated
- Whether a new Documents sub-grid card is needed or the tools hang off an existing one

---

## Step 2 — Backend: Engine

**File:** `backend/tools/documents/<src>_convertor/engine.py`  
Also create `backend/tools/documents/<src>_convertor/__init__.py` (empty).

Model it on `backend/tools/documents/docx_convertor/engine.py`.

Required sections:
```python
# 1. Constants
MEDIA_TYPES = { "pdf": "application/pdf", "html": "text/html; charset=utf-8", ... }
_LO_TARGETS     = {"pdf", "html", "odt"}   # whichever use LibreOffice
_PANDOC_TARGETS = {"txt", "epub", "md"}    # whichever use Pandoc

# 2. Progress helper (_report)
def _report(job_id, pct): job_store.set_progress(job_id, pct)

# 3. get_<src>_info(data) → { "file_size": int }
#    (add thumbnail logic if source is PDF, using fitz)

# 4. _convert_with_libreoffice(data, fmt, job_id) → bytes
#    soffice --headless --norestore --convert-to <fmt> --outdir <tmp> input.<src>
#    _report milestones: 10 → 20 → 40 → 85 → 90

# 5. _convert_with_pandoc(data, fmt, job_id) → bytes
#    pandoc input.<src> -f <src> -t <pandoc_fmt> -o output.<dst> --standalone
#    _report milestones: 10 → 20 → 40 → 90

# 6. convert_<src>(data, target_format, job_id) → bytes
#    dispatches to libreoffice or pandoc based on target
```

Use `platform_tools.find_libreoffice()` / `find_pandoc()` — raise `RuntimeError(install_message("libreoffice"))` if not found.

---

## Step 3 — Backend: Router

**File:** `backend/tools/documents/<src>_convertor/router.py`

Model it on `backend/tools/documents/docx_convertor/router.py`.

```python
router = APIRouter(prefix="/<src>", tags=["<SRC> Conversions"])
_pool  = ThreadPoolExecutor(max_workers=4)

# One @router.post("/<target>/convert") per target format
# Each calls: return await _enqueue(file, "<target>", output_filename)

async def _enqueue(file, target, output_filename):
    raw      = await file.read()
    stem     = (file.filename or "document").rsplit(".", 1)[0]
    out_name = (output_filename or "").strip() or stem
    if not out_name.lower().endswith(ext): out_name += ext
    job = job_store.create_job()
    _pool.submit(_run_job, job.id, raw, target, out_name)
    return JSONResponse({"job_id": job.id}, status_code=202)

def _run_job(job_id, data, target, filename):
    try:
        job_store.set_progress(job_id, 10)
        result = convert_<src>(data, target, job_id)
        job_store.set_progress(job_id, 95)
        job_store.set_done(job_id, result, filename, MEDIA_TYPES[target])
    except Exception as exc:
        job_store.set_error(job_id, f"Conversion error: {exc}")
```

---

## Step 4 — Backend: Register in main.py

**File:** `backend/main.py`

Add **two** lines — one import, one `include_router`:

```python
# Import (near the other converter imports, around line 23-25):
from tools.documents.<src>_convertor.router import router as <src>_convertor_router

# Registration (at the bottom, after ebooks_router):
app.include_router(<src>_convertor_router, prefix="/api")
```

Validate syntax: `python -c "import ast; ast.parse(open('backend/main.py').read()); print('OK')"`

---

## Step 5 — Frontend: Documents Card Grid

**File:** `frontend/scripts/documents.js`

### 5a — Mark the source-format entry card as a drill-down entry

In the `DOC_FORMATS` array, find the object with `id: '<src>'` and add:
```js
is<Src>Entry: true,
```

### 5b — Add a CONVERSIONS array

Above `DOC_FORMATS`, add a `<SRC>_CONVERSIONS` array. Each item:
```js
{
  id: '<src>-<dst>',
  label: '<SRC> to <DST>',
  desc: 'Convert <SRC> to <DST>',
  ext: '.<dst>',
  tag: 'Convert',
  color: '<hex>',
  bg: 'rgba(...)',
  icon: `<svg .../>`,
}
```
Use color/icon conventions: PDF=`#FF6B6B`, HTML=`#FB923C`, TXT=`#A78BFA`, ODT=`#2DD4BF`, EPUB=`#FBBF24`, Markdown=`#34D399`.

### 5c — Add a render function

```js
export function render<Src>Tools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', '<SRC>']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn">...</button>
      <div class="fmt-category-icon" style="background:<bg>;color:<color>">...</div>
      <span class="explore-title"><SRC> — Conversions</span>
    </div>
    <div class="pdf-zone-label">...</div>
    <div class="fmt-grid">
      ${<SRC>_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>`;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Documents'));

  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const item = <SRC>_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({ id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg, tag: item.tag });
        _scrollToDropZone();
      }
    });
  });
}
```

### 5d — Wire the drill-down in renderDocumentFormats

In `renderDocumentFormats`:
```js
// Grid template: assign CSS class for new entry
DOC_FORMATS.map((f) => {
  let extra = '';
  if (f.isPdfEntry)  extra = 'fmt-card--pdf-entry';
  else if (f.is<Src>Entry) extra = 'fmt-card--<src>-entry';
  return cardHTML(f, extra);
})

// After PDF card click listener, add:
const <src>Card = container.querySelector('.fmt-card--<src>-entry');
if (<src>Card) {
  <src>Card.addEventListener('click', () => render<Src>Tools(container, activateNav));
}

// In the general card listener selector:
container.querySelectorAll('.fmt-card:not(.fmt-card--pdf-entry):not(.fmt-card--<src>-entry)')
```

### 5e — Update documents.css

**File:** `frontend/styles/documents.css`

Add the new entry class to the existing `::after` suppression rule:
```css
.fmt-card--pdf-entry::after,
.fmt-card--<src>-entry::after {
  display: none !important;
}
```

---

## Step 6 — Frontend: Shared Base JS

**File:** `frontend/tools/documents/<src>_convertor/<src>_convertor.js`

Model it on `frontend/tools/documents/docx_convertor/docx_convertor.js`.

Key sections (every section is required):
```
1. Imports: getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob, pushNotification,
            showScanProgress, showProgress, updateProgress, resetZoneContent, showDownload, showError
2. _TARGET_EXT map: { '<src>-<dst>': '<dst>', ... }
3. _ROUTE map:      { '<src>-<dst>': '<dst>', ... }  (backend sub-path)
4. Module state:    _<src>File, _<src>BaseName, _<src>ToolId
5. removeDocxPanel() — removes #<src>-settings-panel, .dz-<src>-thumb-wrap, dz-has-<src>-thumb
6. _showThumb() — appends .dz-<src>-thumb-wrap to zone; includes "×" remove button
7. _showSettingsPanel() — appends #<src>-settings-panel (.pw-panel) to .hero-card
   Uses class pw-panel, pw-header, pw-actions, pw-filename-input, pw-filename-ext, pw-submit-btn
   These CSS classes already exist — do NOT create new ones.
8. handleDocxFilePicked(file, toolId) — validates extension, showScanProgress, short await, _showThumb + _showSettingsPanel
9. _submitConvert() — removes panel/thumb, showProgress, POST /api/<src>/<route>/convert,
   SSE loop (updateProgress → showDownload on done, showError on error), setBgJob/syncBgJobBar
```

**File validation check** (extension):
```js
if (!file || !file.name.toLowerCase().endsWith('.<src>')) {
  pushNotification({ type: 'warning', message: 'Invalid File Format. Please select a valid <SRC> file.' });
  return;
}
```

---

## Step 7 — Frontend: Thin Wrappers (one per target)

**Files:** `frontend/tools/documents/<src>_convertor/<src>_<dst>.js`

Each file is exactly 8 lines:
```js
/**
 * tools/documents/<src>_convertor/<src>_<dst>.js
 * Thin wrapper — delegates everything to <src>_convertor.js
 */
import { handle<Src>FilePicked, remove<Src>Panel } from './<src>_convertor.js';

export function handle<Src><Dst>FilePicked(file)  { return handle<Src>FilePicked(file, '<src>-<dst>'); }
export function remove<Src><Dst>Panel()            { return remove<Src>Panel(); }
```

---

## Step 8 — Frontend: Wire into dropzone.js

**File:** `frontend/scripts/dropzone.js`

### 8a — Add imports (after the existing pdf_convertor imports, before ebook imports)

```js
// ── <SRC> conversion tools ──
import { handle<Src><Dst1>FilePicked, remove<Src><Dst1>Panel } from '../tools/documents/<src>_convertor/<src>_<dst1>.js';
// ... one line per target
```

### 8b — Add removes to BOTH reset paths in _updateDropZone

Search for `// Clean up any active ebook panel` — there are **two** occurrences (reset path + tool-switch path). Add before each:
```js
// Clean up any active <SRC> conversion panel
remove<Src><Dst1>Panel(); remove<Src><Dst2>Panel(); // ... all targets
```

### 8c — Add dispatch in _submitFile

Find `// eBook conversion tools — dispatch via lookup table` and add **before** it:
```js
// <SRC> conversion tools — dispatch by tool id
if (tool.id === '<src>-<dst1>') { handle<Src><Dst1>FilePicked(files[0]); return; }
// ... one line per target
```

### 8d — Remove stale ENDPOINT_MAP entries

If `ENDPOINT_MAP` contains any `'<src>-<dst>'` entries that point to non-existent old routes, delete them — new tools are dispatched before `ENDPOINT_MAP` is ever reached.

---

## Step 9 — Update progress.js

**File:** `frontend/tools/shared/progress.js`

In `resetZoneContent`, add the new thumb selector and class:

```js
// Selector string — append:
', .dz-<src>-thumb-wrap'

// classList.remove array — append:
'dz-has-<src>-thumb'
```

---

## Step 10 — Validate

Run these checks before reporting done:

```powershell
# Python syntax check
python -c "import ast; ast.parse(open('backend/tools/documents/<src>_convertor/engine.py').read()); print('engine OK')"
python -c "import ast; ast.parse(open('backend/tools/documents/<src>_convertor/router.py').read()); print('router OK')"
python -c "import ast; ast.parse(open('backend/main.py').read()); print('main OK')"

# Confirm all frontend files exist
Get-ChildItem "frontend/tools/documents/<src>_convertor" | Select-Object Name

# Confirm dropzone wiring
Select-String -Path "frontend/scripts/dropzone.js" -Pattern "<src>" | Select-Object LineNumber, Line
```

All Python `ast.parse` calls must print `OK`. Every target must appear in the dropzone output in **3 places**: import, remove, and dispatch.

---

## Common Mistakes to Avoid

| Mistake | Fix |
|---|---|
| Missing `__init__.py` in backend tool directory | `New-Item backend/tools/documents/<src>_convertor/__init__.py` |
| Stale `ENDPOINT_MAP` entry for new tool id | Delete it — the dispatch block runs first |
| Only adding removes to one reset path in `_updateDropZone` | There are **two** places — search for `Clean up any active ebook panel` to find both |
| Using new CSS classes in the settings panel | Reuse `pw-panel`, `pw-header`, `pw-actions`, `pw-submit-btn` — they already exist |
| Hardcoding binary paths in engine.py | Always use `platform_tools.find_libreoffice()` / `find_pandoc()` |
| Forgetting to update `documents.css` for new entry card | Add `::after { display:none }` alongside existing entry card rules |
