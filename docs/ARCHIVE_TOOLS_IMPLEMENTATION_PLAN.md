# Archive Compress/Create Tools Implementation Plan

## Goal

Turn the existing Archives > Compress / Create cards into real offline tools. Each tool will use the installed Media Module's bundled 7-Zip engine, follow the existing module-lock behavior, and use the same background-job, SSE progress, cancellation, download, history, notification, and error UX as the other ToolCEO tools.

The first release covers:

- Files to ZIP
- Files to TAR
- Files to TAR.GZ
- Files to TAR.BZ2
- Files to 7Z
- Folder to ZIP
- Folder to 7Z

RAR extraction remains compatible with 7-Zip. RAR creation is not included in the executable implementation because 7-Zip does not create RAR archives.

## Findings and constraints

- `frontend/scripts/archives.js` already declares the Compress / Create cards, but routes every archive tool to `renderPlaceholder()`.
- The normal tool flow is owned by `frontend/scripts/dropzone.js`: tool selection, file picking, tool-specific dispatch, background job registration, SSE progress, result download, cancellation, and restoration after navigation.
- `frontend/tools/documents/pdf_tools/merger/merger.js` is the closest UI model for multi-file uploads, queue cards, remove actions, add-more behavior, and drag reordering.
- The backend job contract is already established by `backend/jobs.py`, `backend/job_executor.py`, and `backend/routers/sse_progress.py`: create a job, return `202` with `job_id`, update progress in a worker, then expose the completed output through `/api/download/{job_id}`.
- The current engine mapping in `backend/platform_tools.py` maps `7zip` to the `media` module. The repository contains `engines/media/7zip` and `engines/media/ffmpeg`.
- `package.json` already includes `adm-zip`, but it is not a substitute for 7-Zip archive creation across ZIP/TAR/compression formats. It should not become the production archive engine.
- All input processing and output generation will remain local. The only network operation is optional module installation, not archive execution.

## Engine and format policy

The backend will resolve 7-Zip through `get_engine_path()` and invoke it with a controlled argument list. It must never trust a client-provided executable path.

Supported create operations use 7-Zip commands equivalent to:

- ZIP: `7z a -tzip output.zip inputs...`
- TAR: `7z a -ttar output.tar inputs...`
- TAR.GZ: create TAR, then gzip it, or use the 7-Zip-supported combined format after validating behavior with fixtures.
- TAR.BZ2: create TAR, then BZIP2 it, or use the 7-Zip-supported combined format after validating behavior with fixtures.
- 7Z: `7z a -t7z output.7z inputs...`

The exact command construction will be centralized in one engine adapter so format-specific switches are tested in one place. Output names, archive roots, compression level, overwrite behavior, and password options will be explicit request fields rather than string concatenation.

RAR creation must not silently pretend to work. The UI should either omit the card or show it as extraction-only/unsupported with a clear explanation. Adding RAR creation later requires a separately licensed-compatible engine and a product/legal decision.

## Proposed architecture

### Backend

Create `backend/tools/archives/` with:

- `__init__.py`
- `engine.py`: 7-Zip discovery, safe command construction, process execution, progress parsing, cancellation hooks, output validation, and format metadata.
- `router.py`: archive create endpoints and optional archive info/listing endpoint.
- `tests/`: unit tests for command construction, format validation, path safety, and mocked process progress.

Register the archive router in `backend/main.py` under `/api/archives`.

Recommended endpoint contract:

- `POST /api/archives/create`
  - multipart `files[]` for selected files
  - optional relative path metadata for folder contents
  - `format`: `zip | tar | tar.gz | tar.bz2 | 7z`
  - `output_filename`
  - optional `compression_level`
  - optional `password` only for formats and 7-Zip modes that support it
  - returns `202 {"job_id": "..."}`
- `POST /api/archives/inspect`
  - synchronous lightweight listing/metadata for an existing archive if needed by the archive inspector phase; keep separate from create.
- `POST /api/archives/cancel/{job_id}` only if the existing job cancellation contract cannot be extended cleanly; otherwise add cancellation support to the shared job executor.

The create router will read uploads into controlled temporary input storage rather than relying on unbounded in-memory concatenation. It will submit work to the existing executor and set progress from parsed 7-Zip output. It will return a safe output filename and media type through the existing job registry.

### Job lifecycle

1. Validate format, file count, filenames, total size, and output name.
2. Create a job and return `202` immediately.
3. Worker creates a per-job temporary directory.
4. Worker writes inputs using sanitized relative paths.
5. Worker starts 7-Zip without a shell and reads machine-readable progress output.
6. Worker updates `jobs.py` from 0 through 99; on success stores the output bytes and calls `set_done()`.
7. On failure, calls `set_error()` with a user-safe message and logs diagnostic detail locally.
8. Always removes temporary input/output files in a `finally` block.

Extend the shared job state only if required for real cancellation, for example with a cancellation event and a process handle. Cancellation must terminate the child process, mark the job as cancelled, clean temporary files, and prevent a late worker completion from exposing a partial archive.

### Frontend tool model

Create one shared module such as `frontend/tools/archives/archive_create.js` plus a small format configuration map. It will own:

- queue state
- multiple file selection
- folder selection where Electron exposes directory metadata
- thumbnail/icon rendering
- drag reordering
- remove and add-more actions
- output filename and compression settings
- submission and job wiring
- cleanup when changing tools

Use the PDF Merger interaction pattern, but adapt the visual preview:

- show file-type thumbnails/icons and filename/size, not fake PDF page thumbnails
- show an optional archive preview/listing mode after files are selected
- show ordinal position and relative path for folder inputs
- retain add-more, clear-all, remove, and reorder controls
- enforce sensible limits and show validation inline

Add archive tool IDs to `dropzone.js` dispatch and cleanup. Each archive card must become a real active tool object with `mainText`, `subText`, `accept`, `multi`, `color`, and `moduleId` metadata. Do not create separate implementations for ZIP/TAR/7Z; select a format from configuration and submit through the shared panel.

The normal result path must call the existing shared progress helpers and `toolstate.js` APIs so that:

- progress is visible in the drop zone while the tool is active
- the job moves to the background job bar when the user navigates away
- returning to the tool restores running or completed state
- completion produces the standard Save As/download card
- cancellation clears the job and resets the queue
- errors use the existing notification and inline error conventions
- successful output is recorded by the existing history tracker

### Module lock and installation

Map all archive create IDs to `media` in `frontend/scripts/modulelock.js`. Before file selection or submission, the existing locked-tool navigation must take the user to Modules when Media is not installed. The Modules page remains the source of installation state.

The installed Media Module must contain the 7-Zip executable in the path expected by `get_engine_path("7zip/...")`. Add a startup/health check endpoint or diagnostic helper that reports whether the executable exists and can return its version. Installation success alone must not be treated as engine readiness until this check passes.

## UX requirements

### Selection state

- File picker accepts multiple files for all file-based create tools.
- Folder tools accept one or more folders if the Electron picker supports it; otherwise implement a folder picker through the existing IPC bridge and preserve relative paths.
- Duplicate selections are rejected or de-duplicated deterministically.
- The queue shows count, total size, and selected output format.
- Output filename defaults to a sanitized name based on the first input or `archive.<ext>`.

### Progress and background behavior

- 7-Zip progress is parsed from stdout/stderr without blocking the main process.
- Progress is throttled to avoid excessive UI updates but remains visibly active.
- The standard circular progress ring is shown in the active drop zone.
- The existing background job bar shows the job after navigation away.
- The cancel control terminates the worker process and removes partial output.
- Completion offers Save As and records the result in Recent/History.
- Errors distinguish missing Media Module/7-Zip, invalid input, password/format limitations, cancellation, and generic engine failure.

### Thumbnails

Archive inputs do not have page thumbnails like PDFs. The archive queue will use:

- existing file icons for ordinary files
- folder icons for folder entries
- extension-specific colors/icons where available
- optional local text/list preview for archive contents in a later archive-inspector phase

No network thumbnail service or online preview dependency is needed.

## Safety and correctness requirements

- Invoke 7-Zip with `shell=False`/argument arrays; never interpolate a complete command string.
- Sanitize archive member names and reject absolute paths, drive-letter paths, `..` traversal, and unsafe null bytes.
- Decide and test symlink handling; do not follow links outside the selected input root.
- Prevent output collision with an input file and never overwrite an input by default.
- Enforce configurable file-count and total-size limits before creating a job.
- Avoid exposing passwords in logs, job errors, notifications, or history.
- Validate the produced archive before marking the job done.
- Clean temporary directories on success, error, cancellation, and application shutdown where practical.
- Ensure archive extraction, when added later, uses the same path traversal protections.

## Implementation sequence

### Phase 1: engine proof and contracts

1. Confirm the exact 7-Zip executable path and command switches on Windows with small fixtures.
2. Add the archive engine adapter and unit tests with a mocked subprocess layer.
3. Add the create router and register it in `backend/main.py`.
4. Manually verify `202`, SSE progress, download response, media type, and cleanup.

### Phase 2: first vertical slice

5. Implement Files to ZIP end to end.
6. Add the shared archive queue UI with multi-file selection, icons, reorder, remove, and output naming.
7. Wire ZIP into `archives.js`, `dropzone.js`, `toolstate.js`, history, and module locking.
8. Run backend tests and a renderer smoke test for selection, progress, cancel, navigation away, return, and save.

### Phase 3: remaining create formats

9. Add Files to TAR, TAR.GZ, TAR.BZ2, Files to 7Z using the same engine and configuration map.
10. Add Folder to ZIP and Folder to 7Z with preserved relative paths.
11. Add compression-level/password controls only where supported and test each combination.
12. Replace/remove the placeholder RAR creation card and document RAR extraction support.

### Phase 4: polish and validation

13. Add archive-specific CSS while reusing existing drop-zone and queue conventions.
14. Add notifications, missing-engine diagnostics, and robust error translations.
15. Test large files, Unicode names, nested folders, duplicate names, empty files, cancellation, and output collisions.
16. Test packaged Electron behavior, including Media Module installation and engine discovery.
17. Update README/module documentation and add a release checklist for the Media Module contents.

## Test matrix

### Engine/backend

- one file and many files
- nested folder paths
- Unicode filenames
- empty files
- duplicate basenames in different folders
- invalid/traversal paths
- each supported format
- compression levels
- missing executable
- non-zero 7-Zip exit code
- cancellation during a large job
- output validation and cleanup

### Frontend

- locked Media Module redirects to Modules
- installed Media Module allows selection
- multi-file queue add/remove/reorder
- folder selection and relative paths
- thumbnails/icons render without layout shifts
- validation prevents empty/invalid submission
- active progress ring updates
- navigating away preserves background progress
- returning restores progress/result
- cancel resets UI
- completed output saves and enters history
- errors are visible and retryable

### Packaged app

- fresh install with no Media Module
- module installation completes and engine health check passes
- archive creation works offline after installation
- no archive operation attempts network access
- packaged resource path resolves correctly on Windows

## Offline engine answer

No additional offline engine is required for ZIP, TAR, TAR.GZ, TAR.BZ2, and 7Z creation if the Media Module ships a working 7-Zip executable. The existing Python standard library or `adm-zip` should not replace 7-Zip for this feature.

Additional software is needed only for product features outside that scope:

- RAR creation: a separate compatible/licensed RAR-capable engine.
- Advanced archive repair or proprietary formats: a format-specific engine may be required.
- Archive thumbnails based on document contents: local format renderers would be needed; ordinary archive file icons need none.

The implementation should therefore ship and validate exactly one archive engine dependency: 7-Zip inside the installed Media Module.

## Definition of done

- Every supported Compress / Create card opens a real tool panel.
- Multi-file and folder workflows preserve order and relative paths.
- All archive work runs locally after Media Module installation.
- Progress, background jobs, cancel, errors, save/download, history, and notifications match existing tool behavior.
- The app never claims RAR creation support without a real RAR-capable engine.
- Backend and frontend tests cover the supported formats and lifecycle states.
- Packaged Windows builds locate 7-Zip from the installed Media Module.
