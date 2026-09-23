"""Shared executor for long-running tool jobs."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor


def _default_max_workers() -> int:
    cpu_count = os.cpu_count() or 4
    configured = os.environ.get("TOOLCEO_MAX_PARALLEL_JOBS")
    if configured:
        try:
            return max(1, int(configured))
        except ValueError:
            pass

    # Most ToolCEO jobs spend meaningful time in native libraries or external
    # tools, so a tiny pool makes unrelated tools wait behind each other. Keep
    # enough lanes open for real background work while avoiding unbounded fanout.
    return max(4, min(8, cpu_count))


MAX_WORKERS = _default_max_workers()

job_executor = ThreadPoolExecutor(
    max_workers=MAX_WORKERS,
    thread_name_prefix="toolceo-job",
)
