# Background Job System

ToolCEO's async job system lets users navigate away from a tool while it processes and come back when done — no page lock, no frozen UI.

---

## Overview

```
┌───────────────────────────────────────────────────────────────┐
│                    jobs.py  (Job Store)                       │
│                                                               │
│  Job = {                                                      │
│    id             : UUID string                               │
│    state          : "pending" | "running" | "done" | "error"  │
│    progress       : 0 – 100                                   │
│    result         : bytes | None   (output file)              │
│    filename       : str | None     (suggested save name)      │
│    media_type     : str | None     (MIME type)                │
│    error          : str | None                                │
│    cancel_event   : threading.Event                           │
│    cancelled      : bool                                      │
│  }                                                            │
│                                                               │
│  In-memory dict: { job_id → Job }                             │
└───────────────────────────────────────────────────────────────┘
          │
          │  job_executor.submit(fn, job_id, ...)
          ▼
┌───────────────────────────────────────────────────────────────┐
│              job_executor.py  (Bounded Thread Pool)           │
│                                                               │
│  max_workers = 2  (prevents CPU/memory saturation)            │
│  Uses Python concurrent.futures.ThreadPoolExecutor            │
└───────────────────────────────────────────────────────────────┘
```

---

## Job Lifecycle

```
Router receives POST request
        │
        ▼
jobs.create_job()  →  Job(state="pending", progress=0)
        │
        ▼
job_executor.submit(engine_fn, job_id, ...)
        │
        ▼ (in background thread)
jobs.set_progress(job_id, 10)   →  state="running"
        │
     [work ...]
        │
jobs.set_progress(job_id, 50)   →  progress=50
        │
     [work ...]
        │
jobs.set_done(job_id, result_bytes, filename, media_type)
        │        →  state="done", progress=100, result=bytes
        ▼
SSE stream emits  state="done"  →  frontend downloads result
```

Error path:
```
Exception raised in engine_fn
        │
jobs.set_error(job_id, message)  →  state="error"
        │
SSE stream emits  state="error"  →  frontend shows toast
```

---

## jobs.py API

### `create_job() → Job`

Creates a new `Job` with a fresh UUID, stores it in the in-memory dict, and returns it.

```python
job = jobs.create_job()
# job.id is the UUID string to return to the frontend
```

### `get_job(job_id) → Job | None`

Retrieves a job by ID. Returns `None` if not found.

### `set_progress(job_id, pct)`

Updates the job's progress (0–100) and sets `state = "running"`.

### `set_done(job_id, result, filename, media_type)`

Marks the job complete. Sets `state = "done"`, `progress = 100`, stores the result bytes and suggested filename.

### `set_error(job_id, message)`

Marks the job failed. Sets `state = "error"`, stores the error message string.

### `cancel_job(job_id) → bool`

Signals the job's `cancel_event` threading.Event. The engine function should poll `jobs.is_cancelled(job_id)` periodically and return early if true. Returns `False` if the job is already done or errored.

### `is_cancelled(job_id) → bool`

Returns `True` if `cancel_event` has been set for this job.

### `smooth_progress(job_id, start, ceiling, interval=0.35)`

Context manager that slowly increments the stored progress from `start` toward `ceiling - 1` while the wrapped block executes. Prevents the progress ring from appearing frozen during a long single-step operation.

```python
jobs.set_progress(job_id, 10)
with jobs.smooth_progress(job_id, 10, 90):
    result = slow_conversion(data)   # ring creeps 10 → 89
jobs.set_progress(job_id, 90)       # snap to real value
```

- Runs a daemon thread that increments by 1 every `interval` seconds
- Never reaches `ceiling` itself — the caller snaps to the real value after the `with` block
- Thread is joined (max 2 s) when the context exits

---

## SSE Progress Stream

The `/api/progress/{job_id}` endpoint streams `text/event-stream` events:

```
GET /api/progress/550e8400-...
Content-Type: text/event-stream

data: {"state": "running",  "progress": 10}
data: {"state": "running",  "progress": 35}
data: {"state": "running",  "progress": 72}
data: {"state": "done",     "progress": 100, "filename": "output.pdf", "media_type": "application/pdf"}
```

- Poll interval: **250 ms**
- The stream closes automatically once state reaches `done` or `error`
- Extra fields on `done` for image/archive tools: `original_size`, `compressed_size`, `saved_percent`, `destination_dir`

### Frontend: EventSource

```javascript
const es = new EventSource(`http://127.0.0.1:8000/api/progress/${jobId}`);
es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateProgressRing(data.progress);
    if (data.state === 'done') {
        es.close();
        triggerDownload(jobId, data.filename);
    }
    if (data.state === 'error') {
        es.close();
        showErrorToast(data.error);
    }
};
```

---

## Background Job Bar (Frontend)

When the user navigates to a different tool while a job is running, `toolstate.js` shows a sticky bar at the bottom of the sidebar:

```
┌─────────────────────────────────────────────────────────┐
│  🗜 Compress PDF  ●  Executing in background  45%       │
│  document.pdf                        [View Tool]  [×]   │
│  ███████████████░░░░░░░░░░░░░░░░░░░░                    │
└─────────────────────────────────────────────────────────┘
```

On completion:

```
┌─────────────────────────────────────────────────────────┐
│  🗜 Compress PDF  ✓  Completed  100%                    │
│  document_compressed.pdf         [Save As…]  [×]        │
│  ████████████████████████████████████████████           │
└─────────────────────────────────────────────────────────┘
```

Features:
- **Live animated progress bar** (color-coded per tool accent color)
- **Status badges:** `Uploading` → `Executing in background` → `✓ Completed` / `✗ Failed`
- **View Tool** button — navigates back to the tool panel
- **Save As…** button — triggers `window.toolceo.saveFileAs()` on completion
- **Toast notification** — fires on `done` or `error` via `notificationStore.js`
- **Dismiss (×)** — clears the bar

---

## Bounded Worker Queue

`job_executor.py` wraps a `concurrent.futures.ThreadPoolExecutor` with `max_workers=2`.

This means:
- At most **2 heavy conversion jobs** run simultaneously
- A third submission will queue and wait for a slot to open
- Prevents one long job from starving the machine of CPU/memory
- PDF preview operations (synchronous endpoints) bypass the queue entirely and run directly on the FastAPI thread pool

---

## Cancellation

Jobs can be cancelled while running:

```
DELETE /api/jobs/{job_id}
```

This calls `jobs.cancel_job(job_id)` which sets the `cancel_event`. Engine functions that support cancellation poll `jobs.is_cancelled(job_id)` between processing steps and call `jobs.set_cancelled(job_id)` to mark the job as errored with the message `"Operation cancelled."`.

Not all engines implement cancellation polling — for short-running jobs it is generally omitted.
