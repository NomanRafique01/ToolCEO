"""
jobs.py
In-memory job registry.

Each job has:
  state   : "pending" | "running" | "done" | "error"
  progress: 0-100
  result  : bytes | None   (output file bytes, set when done)
  filename: str | None     (suggested download filename)
  error   : str | None

Also provides smooth_progress() — a context manager that tweens the stored
progress value from a start value toward a target ceiling while the wrapped
block executes, so the ring never appears frozen at a single value.
"""

from __future__ import annotations

import contextlib
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Job:
    id: str
    state: str = "pending"
    progress: int = 0
    result: Optional[bytes] = None
    filename: Optional[str] = None
    media_type: Optional[str] = None
    destination_dir: Optional[str] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.monotonic)
    updated_at: float = field(default_factory=time.monotonic)
    cancel_event: threading.Event = field(default_factory=threading.Event, repr=False)
    cancelled: bool = False


_store: dict[str, Job] = {}
_lock = threading.RLock()
_monitor_started = False


def _start_monitor_once() -> None:
    global _monitor_started
    with _lock:
        if _monitor_started:
            return
        _monitor_started = True

    thread = threading.Thread(target=_progress_monitor, name="toolceo-job-monitor", daemon=True)
    thread.start()


def _progress_monitor() -> None:
    """
    Keep visible progress alive for long native/subprocess phases that cannot
    report granular milestones. This is deliberately central so every tool gets
    the same non-freezing background behaviour.
    """
    while True:
        time.sleep(0.75)
        now = time.monotonic()
        with _lock:
            for job in _store.values():
                if job.state != "running" or job.cancelled:
                    continue
                if job.progress <= 0 or job.progress >= 94:
                    continue
                if now - job.updated_at < 0.7:
                    continue
                job.progress = min(job.progress + 1, 94)
                job.updated_at = now


def create_job() -> Job:
    _start_monitor_once()
    job = Job(id=str(uuid.uuid4()))
    with _lock:
        _store[job.id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    with _lock:
        return _store.get(job_id)


def get_job_snapshot(job_id: str, *, include_result: bool = False) -> Optional[dict[str, Any]]:
    with _lock:
        job = _store.get(job_id)
        if not job:
            return None

        snapshot: dict[str, Any] = {
            "id": job.id,
            "state": job.state,
            "progress": job.progress,
            "filename": job.filename,
            "media_type": job.media_type,
            "destination_dir": job.destination_dir,
            "error": job.error,
            "cancelled": job.cancelled,
        }
        if include_result:
            snapshot["result"] = job.result

        for name in ("original_size", "compressed_size", "saved_percent"):
            if hasattr(job, name):
                snapshot[name] = getattr(job, name)

        return snapshot


def set_job_metadata(job_id: str, **metadata: Any) -> None:
    allowed = {
        "destination_dir",
        "original_size",
        "compressed_size",
        "saved_percent",
    }
    with _lock:
        job = _store.get(job_id)
        if not job:
            return
        for key, value in metadata.items():
            if key in allowed:
                setattr(job, key, value)
        job.updated_at = time.monotonic()


def set_progress(job_id: str, pct: int) -> None:
    with _lock:
        job = _store.get(job_id)
        if job:
            job.progress = max(job.progress, max(0, min(100, int(pct))))
            job.state = "running"
            job.updated_at = time.monotonic()


def set_done(job_id: str, result: bytes, filename: str, media_type: str) -> None:
    with _lock:
        job = _store.get(job_id)
        if job:
            job.state = "done"
            job.progress = 100
            job.result = result
            job.filename = filename
            job.media_type = media_type
            job.updated_at = time.monotonic()


def set_error(job_id: str, message: str) -> None:
    with _lock:
        job = _store.get(job_id)
        if job:
            job.state = "error"
            job.error = message
            job.updated_at = time.monotonic()


def is_cancelled(job_id: str) -> bool:
    with _lock:
        job = _store.get(job_id)
        return bool(job and job.cancel_event.is_set())


def set_cancelled(job_id: str) -> None:
    with _lock:
        job = _store.get(job_id)
        if job:
            job.cancelled = True
            job.state = "error"
            job.error = "Operation cancelled."
            job.updated_at = time.monotonic()


def cancel_job(job_id: str) -> bool:
    with _lock:
        job = _store.get(job_id)
        if not job or job.state in ("done", "error"):
            return False
        job.cancel_event.set()
        job.updated_at = time.monotonic()
        return True


@contextlib.contextmanager
def smooth_progress(job_id: str, start: int, ceiling: int, interval: float = 0.35):
    """
    Context manager that increments job progress by 1 every *interval* seconds
    from *start* toward *ceiling - 1* while the wrapped block executes.

    Usage::

        set_progress(job_id, 10)
        with smooth_progress(job_id, 10, 95):
            result = slow_conversion(...)   # progress creeps 10→11→…→94
        set_progress(job_id, 95)            # snap to real value after work done

    The tween never reaches *ceiling* itself — the caller sets the final value
    after the ``with`` block, so the ring never overshoots the real milestone.
    """
    stop = threading.Event()

    def _tick() -> None:
        cur = start
        while not stop.is_set() and cur < ceiling - 1:
            time.sleep(interval)
            if stop.is_set():
                break
            cur = min(cur + 1, ceiling - 1)
            set_progress(job_id, cur)

    t = threading.Thread(target=_tick, daemon=True)
    t.start()
    try:
        yield
    finally:
        stop.set()
        t.join(timeout=2)
