# ZIP Extract Shortcut — Plan

## Top-Level Overview

When a tool finishes and its output is a `.zip` file, the download card shown in the drop zone should offer a second action button: **"Extract ZIP"**. Clicking it transfers the job's ZIP payload directly into the Archive Extract tool — no file save required — so the user can extract immediately without leaving the app or manually loading the file.

**Scope:** Only tools whose output filename ends in `.zip` are affected. All other tools are unchanged.  
**Non-goals:** No changes to any backend. No changes to individual tool JS files. No new routes.

---

## Affected Tools (ZIP-output tools — confirmed from codebase)

| Tool | Output filename pattern |
|---|---|
| PDF → Images | `*_images.zip` |
| PDF Splitter | `*_split_pdfs.zip` |
| PDF Extractor | `*_images.zip` |
| Image Compressor (multi) | `compressed_images.zip` |
| Image Converters — JPG/PNG/WebP/SVG (multi) | `*.zip` |
| PPTX → Images (multi) | `*_images.zip` |

All of these call `showDownload(zone, filename, jobId, color, onReset, toolId)` from `frontend/tools/shared/progress.js`. The fix lives **entirely** in that one shared function — no individual tool files need touching.

---

## Architecture Overview

```
showDownload(zone, filename, jobId, color, onReset, toolId)
      │
      ├─ filename ends with .zip?
      │       │
      │     YES → render dz-save-card with TWO buttons:
      │              [Save As…]   [Extract ZIP →]
      │                                │
      │                         fetch /api/download/{jobId}
      │                         → get Blob
      │                         → create in-memory File object
      │                         → call routeZipToExtractor(file, navigateFn)
      │                                │
      │                         activateNav('Archives')
      │                         renderCategory(Extract)
      │                         setActiveTool(archive-extract-zip)
      │                         handleArchiveFilePicked(file, tool)
      │
      └─ filename does NOT end with .zip → unchanged behaviour
```

---

## Sub-Tasks

---

### Sub-Task 1 — Export a public `routeZipToExtractor` function from `archives.js`

**Intent**  
`archives.js` already controls navigation to the Archives section and renders the Extract category. A new exported function will accept a `File` object and an `activateNav` reference, then programmatically navigate to Archives → Extract → ZIP Extract tool, and hand the file to the extract handler — exactly as if the user had dragged it in themselves.

**Expected Outcomes**  
- `frontend/scripts/archives.js` exports `routeZipToExtractor(file, activateNav)`.
- Calling it navigates the UI to the Archives → Extract category, selects the ZIP Extract tool, and feeds the file to the extraction handler.
- No visible changes to the existing Archives UI.

**Todo List**  
1. In `frontend/scripts/archives.js`, import `handleArchiveFilePicked` and `isArchiveExtractTool` from `archive_extract.js`.
2. Add exported function `routeZipToExtractor(file, activateNav)` that:
   a. Calls `activateNav('Archives')` to navigate the sidebar.
   b. After a short `setTimeout` (to let the DOM render), calls the internal `renderCategory` function passing the `extract` category to drill into the Extract tools panel.
   c. Finds the ZIP Extract tool object (id `archive-extract-zip`) from the `toolRecords` of the extract category.
   d. Calls `setActiveTool(tool)` and `handleArchiveFilePicked(file, tool)`.

**Relevant Context**  
- `frontend/scripts/archives.js` — `renderCategory`, `renderLanding`, `setActiveTool`, `CATEGORIES`, `toolRecords`, `scrollToDropZone` are all defined/used here.
- `frontend/tools/archives/archive_extract.js` — exports `handleArchiveFilePicked`, `ARCHIVE_EXTRACT_IDS`, `isArchiveExtractTool`.
- The `activateNav` function is passed into `renderArchives(container, activateNav)` and stored in the module; it can be captured in a module-level variable via the existing `setNavigateToModule` pattern or a new `setActivateNav` setter.

**Status:** [ ] pending

---

### Sub-Task 2 — Add "Extract ZIP" button to `showDownload` in `progress.js`

**Intent**  
The single shared `showDownload` function renders the download card for all tools. Add detection logic: if `filename` ends with `.zip`, inject an additional **"Extract ZIP →"** button below the "Save As…" button. Clicking it fetches the job blob, creates an in-memory `File`, then calls `routeZipToExtractor`.

**Expected Outcomes**  
- The download card for ZIP-output tools shows both "Save As…" and "Extract ZIP →" buttons.
- Clicking "Extract ZIP →" fetches the result, creates a `File` object, resets the zone, then calls `routeZipToExtractor(file, _activateNav)`.
- All non-ZIP tools see zero changes in their download card.
- `showDownloadBlobCard` also gets the same ZIP-detect treatment (used by PDF Rotate and PDF Editor — these don't output ZIP today, but for future safety no change is needed there since they never produce `.zip`; skip to keep scope tight).

**Todo List**  
1. In `frontend/tools/shared/progress.js`, import `routeZipToExtractor` from `../../scripts/archives.js`.
2. Add a module-level `_activateNav` variable and an exported `setProgressActivateNav(fn)` setter so `progress.js` can hold the `activateNav` reference.
3. In `showDownload`, after building the card HTML, detect `filename.toLowerCase().endsWith('.zip')`.
4. If true, append an "Extract ZIP →" `<button class="dz-extract-zip-btn">` to the `.dz-save-card` element.
5. Wire the button's `click` handler:
   a. Disable both buttons, change text to "Loading…".
   b. `fetch(/api/download/{jobId})`, convert to `Blob`.
   c. Create `new File([blob], filename, { type: 'application/zip' })`.
   d. `resetZoneContent(zone)` + `clearBgJob(jobId, true)` + `onReset?.()`.
   e. Call `routeZipToExtractor(file, _activateNav)`.
   f. On error, restore button states and show inline error.

**Relevant Context**  
- `frontend/tools/shared/progress.js` lines 212–361 — `showDownload` implementation.
- `BACKEND` constant is already defined at top of file (`http://127.0.0.1:8000`).
- `escHtml`, `clearBgJob`, `resetZoneContent`, `resetAfterSave` all in scope.

**Status:** [ ] pending

---

### Sub-Task 3 — Wire `activateNav` into `progress.js` from `navigation.js`

**Intent**  
`progress.js` is a shared utility module; it does not have direct access to the `activateNav` function that lives inside `navigation.js`'s closure. The call chain must be: `navigation.js` (which owns `activateNav`) → passes it to `progress.js` via `setProgressActivateNav(fn)`.

**Expected Outcomes**  
- `navigation.js` calls `setProgressActivateNav(activateNav)` once during app init.
- `archives.js` similarly receives `activateNav` via its existing `setNavigateToModule` pattern or a new setter so `routeZipToExtractor` can use it.
- No circular imports are introduced (progress.js → archives.js is a new dependency; verify it doesn't create a cycle).

**Todo List**  
1. In `frontend/scripts/navigation.js`, import `setProgressActivateNav` from `../tools/shared/progress.js`.
2. After `activateNav` is defined in the `initNavigation` function, call `setProgressActivateNav(activateNav)`.
3. In `frontend/scripts/archives.js`, add a module-level `_activateNav` variable and export `setActivateNavForArchives(fn)`.
4. In `frontend/scripts/navigation.js`, import `setActivateNavForArchives` from `./archives.js` and call it alongside the existing `setNavigateToModule` wiring.
5. Update `routeZipToExtractor` (from Sub-Task 1) to use the stored `_activateNav`.

**Relevant Context**  
- `frontend/scripts/navigation.js` lines 97–175 — where `activateNav` is defined; call the setters after line 97.
- `frontend/scripts/main.js` may also call `initNavigation`; check it doesn't need updating.
- Circular check: `navigation.js` imports from `archives.js` already (line 22). `archives.js` imports from `archive_extract.js`. `archive_extract.js` imports from `progress.js`. `progress.js` would import from `archives.js` — **this IS a cycle**. To avoid it, `progress.js` must NOT import `archives.js` directly. Instead, store `routeZipToExtractor` as an injectable callback via `setZipExtractRouter(fn)` in `progress.js`, and let `navigation.js` inject it by importing from `archives.js` and passing the function.

**Status:** [ ] pending

---

### Sub-Task 4 — Style the "Extract ZIP →" button in `dashboard.css`

**Intent**  
The new button must look polished and distinct from "Save As…". It should use the archive/lime-green accent colour and have a slightly different visual treatment (e.g. outlined/ghost style) so users can tell it apart from the primary save action.

**Expected Outcomes**  
- `.dz-extract-zip-btn` is styled: matches `dz-save-btn` sizing but uses `--arc-color` (`#84cc16`) border + text with transparent background (ghost style).
- Has hover state that fills with a low-opacity lime tint.
- Button is full-width like the Save button, slightly smaller font is acceptable.
- On narrow download cards the two-button layout stacks neatly.

**Todo List**  
1. In `frontend/styles/dashboard.css`, add a `.dz-extract-zip-btn` ruleset after the existing `.dz-save-btn` rules.
2. Style as ghost button: `border: 1.5px solid var(--arc-color, #84cc16)`, `color: var(--arc-color, #84cc16)`, transparent background, same border-radius and padding as `.dz-save-btn`.
3. Add `:hover` rule with `background: rgba(132,204,22,0.10)`.
4. Add `&:disabled` (or `.dz-extract-zip-btn:disabled`) to dim the button while loading.

**Relevant Context**  
- `frontend/styles/dashboard.css` — find the `.dz-save-btn` block and add new rules immediately after.
- Archive accent colour `#84cc16` is already established in `frontend/scripts/archives.js` (`FAMILY_COLORS.archive`).

**Status:** [ ] pending

---

## Implementation Order

Sub-Task 3 first (wiring), then Sub-Task 1 (router function), then Sub-Task 2 (button in card), then Sub-Task 4 (styles). In practice Sub-Tasks 1 and 3 are tightly coupled and should be done together.

## Files Changed Summary

| File | Change |
|---|---|
| `frontend/tools/shared/progress.js` | Add ZIP detection + "Extract ZIP" button + `setZipExtractRouter` setter |
| `frontend/scripts/archives.js` | Export `routeZipToExtractor` + `setActivateNavForArchives` |
| `frontend/scripts/navigation.js` | Wire `activateNav` into `progress.js` and `archives.js` |
| `frontend/styles/dashboard.css` | Style `.dz-extract-zip-btn` |
