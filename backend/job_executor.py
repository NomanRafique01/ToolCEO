"""Shared, bounded executor for long-running tool jobs."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor


# Keep conversion work bounded so one background operation cannot saturate the
# CPU and starve requests for the tool the user is currently using.
_MAX_WORKERS = max(1, min(2, (os.cpu_count() or 2) // 2))

job_executor = ThreadPoolExecutor(
    max_workers=_MAX_WORKERS,
    thread_name_prefix="toolceo-job",
)