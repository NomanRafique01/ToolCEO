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
    try:
        return _do_download(job_id)
    except HTTPException:
        raise
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("download_result(%s) failed", job_id)
        raise HTTPException(status_code=500, detail=f"Download error: {exc}") from exc


def _do_download(job_id: str):
    job = get_job(job_id)
    if job is None or job.state != "done" or job.result is None:
        raise HTTPException(status_code=404, detail="Job not ready or not found.")
    filename = (job.filename or "download").strip()
    if "." not in filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]:
        filename += ".zip" if job.media_type == "application/zip" else ".pdf"
    media_type = job.media_type or "application/pdf"

    # Build a safe Content-Disposition header.
    # The simple `filename="..."` form breaks if the name contains quotes,
    # backslashes, or non-ASCII characters (common with user-supplied filenames).
    # We provide both the ASCII-safe fallback and the RFC 5987 encoded form so
    # all browsers and download managers accept it correctly.
    try:
        # ASCII-only: safe to use in the plain filename="" token.
        ascii_name = filename.encode("ascii").decode("ascii")
        # Strip any embedded double-quotes that would break the header value.
        ascii_name = ascii_name.replace('"', "").replace("\\", "")
        content_disposition = f'attachment; filename="{ascii_name}"'
    except (UnicodeEncodeError, UnicodeDecodeError):
        # Non-ASCII filename: use RFC 5987 percent-encoding.
        from urllib.parse import quote
        encoded = quote(filename, safe="")
        content_disposition = f"attachment; filename*=UTF-8''{encoded}"

    return Response(
        content=bytes(job.result),   # ensure plain bytes, not memoryview/bytearray
        media_type=media_type,
        headers={"Content-Disposition": content_disposition},
    )
