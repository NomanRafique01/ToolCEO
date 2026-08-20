"""
jobs.py
In-memory job registry.

Each job has:
  state   : "pending" | "running" | "done" | "error"
  progress: 0-100
  result  : bytes | None   (output file bytes, set when done)
  filename: str | None     (suggested download filename)
  error   : str | None
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
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
