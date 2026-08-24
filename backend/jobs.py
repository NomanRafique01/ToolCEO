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
from dataclasses import dataclass
from typing import Optional


@dataclass
class Job:
    id: str
    state: str = "pending"
    progress: int = 0
    result: Optional[bytes] = None
    filename: Optional[str] = None
    media_type: Optional[str] = None
    error: Optional[str] = None


_store: dict[str, Job] = {}


def create_job() -> Job:
    job = Job(id=str(uuid.uuid4()))
    _store[job.id] = job
    return job


def get_job(job_id: str) -> Optional[Job]:
    return _store.get(job_id)


def set_progress(job_id: str, pct: int) -> None:
    job = _store.get(job_id)
    if job:
        job.progress = pct
        job.state = "running"


def set_done(job_id: str, result: bytes, filename: str, media_type: str) -> None:
    job = _store.get(job_id)
    if job:
        job.state = "done"
        job.progress = 100
        job.result = result
        job.filename = filename
        job.media_type = media_type


def set_error(job_id: str, message: str) -> None:
    job = _store.get(job_id)
    if job:
        job.state = "error"
        job.error = message


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
