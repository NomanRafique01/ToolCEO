"""
SSE progress router.

GET /api/progress/{job_id}  — streams Server-Sent Events:
  data: {"progress": 0-100, "state": "running"|"done"|"error", "error": "..."}

GET /api/download/{job_id}  — returns the finished file once state=="done".
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

from jobs import get_job

router = APIRouter(prefix="", tags=["Progress"])


@router.get("/progress/{job_id}")
async def stream_progress(job_id: str):
    """Stream SSE progress updates until the job finishes or errors."""

    async def event_gen():
        while True:
            job = get_job(job_id)
            if job is None:
                data = json.dumps({"state": "error", "error": "Job not found", "progress": 0})
                yield f"data: {data}\n\n"
                return

            payload = {"state": job.state, "progress": job.progress}
            if job.state == "done":
                payload["filename"]   = job.filename
                payload["media_type"] = job.media_type
            if job.state == "error":
                payload["error"] = job.error or "Unknown error"

            yield f"data: {json.dumps(payload)}\n\n"

            if job.state in ("done", "error"):
                return

            await asyncio.sleep(0.25)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/download/{job_id}")
def download_result(job_id: str):
    """Return the finished file bytes for a completed job."""
    job = get_job(job_id)
    if job is None or job.state != "done" or job.result is None:
        raise HTTPException(status_code=404, detail="Job not ready or not found.")
    return Response(
        content=job.result,
        media_type=job.media_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{job.filename}"'},
    )
