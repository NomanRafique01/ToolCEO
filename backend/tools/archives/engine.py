"""Offline archive creation through the installed Media Module's 7-Zip binary."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Iterable

from platform_tools import get_engine_path

SUPPORTED_FORMATS = {
    "zip": {"suffix": ".zip", "media_type": "application/zip", "type_switch": "-tzip"},
    "tar": {"suffix": ".tar", "media_type": "application/x-tar", "type_switch": "-ttar"},
    "7z": {"suffix": ".7z", "media_type": "application/x-7z-compressed", "type_switch": "-t7z"},
    "tar.gz": {"suffix": ".tar.gz", "media_type": "application/gzip", "type_switch": "-tgzip", "wrapper": "tar"},
    "tar.bz2": {"suffix": ".tar.bz2", "media_type": "application/x-bzip2", "type_switch": "-tbzip2", "wrapper": "tar"},
}

_PROGRESS_RE = re.compile(r"(?<!\d)(\d{1,3})%")
_MAX_FILES = 5000
_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024


class ArchiveCancelled(RuntimeError):
    """Raised when a running archive job is cancelled."""


def find_7zip() -> str:
    bundled = get_engine_path("7zip/7z.exe") or get_engine_path("7zip/7zz")
    candidate = bundled or shutil.which("7z") or shutil.which("7zz")
    if not candidate:
        raise RuntimeError("7-Zip is unavailable. Install the Media Module first.")
    return candidate


def _safe_member_name(name: str) -> str:
    normalized = name.replace("\\", "/").strip("/")
    if not normalized or normalized == ".":
        raise ValueError("An input file has an empty relative path.")
    if "\x00" in normalized or normalized.startswith("/"):
        raise ValueError("Input contains an unsafe archive path.")
    parts = normalized.split("/")
    if any(part in ("", ".", "..") for part in parts) or (len(parts[0]) == 2 and parts[0][1] == ":"):
        raise ValueError("Input contains an unsafe archive path.")
    return "/".join(parts)


def _run_7zip(command: list[str], progress: Callable[[int], None], cancel_event, cwd: str | None = None) -> None:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=False,
        cwd=cwd,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    try:
        assert process.stdout is not None
        for line in process.stdout:
            if cancel_event is not None and cancel_event.is_set():
                process.terminate()
                raise ArchiveCancelled()
            matches = _PROGRESS_RE.findall(line)
            if matches:
                progress(max(1, min(99, int(matches[-1]))))
        return_code = process.wait()
        if return_code != 0:
            raise RuntimeError("7-Zip could not create the archive.")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def create_archive(
    items: Iterable[tuple[bytes, str]],
    archive_format: str,
    output_name: str,
    progress: Callable[[int], None],
    cancel_event=None,
) -> tuple[bytes, str, str]:
    """Create one archive and return bytes, safe filename, and media type."""
    spec = SUPPORTED_FORMATS.get(archive_format)
    if spec is None:
        raise ValueError(f"Unsupported archive format: {archive_format}")

    materialized = list(items)
    if not materialized:
        raise ValueError("Select at least one file.")
    if len(materialized) > _MAX_FILES:
        raise ValueError(f"A maximum of {_MAX_FILES} files can be archived at once.")
    if sum(len(raw) for raw, _ in materialized) > _MAX_TOTAL_BYTES:
        raise ValueError("The selected files exceed the 2 GB archive limit.")

    executable = find_7zip()
    safe_output = Path(output_name).name
    if not safe_output.lower().endswith(spec["suffix"]):
        safe_output += spec["suffix"]

    with tempfile.TemporaryDirectory(prefix="toolceo-archive-") as temp_name:
        temp_dir = Path(temp_name)
        input_dir = temp_dir / "input"
        input_dir.mkdir()
        used: set[str] = set()
        input_paths: list[str] = []
        for index, (raw, original_name) in enumerate(materialized):
            member = _safe_member_name(original_name)
            if member in used:
                raise ValueError(f"Duplicate archive path: {member}")
            used.add(member)
            destination = input_dir.joinpath(*member.split("/"))
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(raw)
            input_paths.append(str(destination.relative_to(input_dir)))

        output_path = temp_dir / safe_output
        source_dir = input_dir
        if spec.get("wrapper"):
            tar_path = temp_dir / "payload.tar"
            tar_command = [executable, "a", "-ttar", str(tar_path), *input_paths]
            _run_7zip(tar_command, lambda pct: progress(min(75, pct)), cancel_event, cwd=str(input_dir))
            source_dir = temp_dir
            input_paths = [tar_path.name]

        command = [executable, "a", spec["type_switch"], "-bsp1", "-y", str(output_path), *input_paths]
        _run_7zip(command, lambda pct: progress(75 + int(pct * 0.24)), cancel_event, cwd=str(source_dir))
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("7-Zip completed without producing an archive.")
        return output_path.read_bytes(), safe_output, spec["media_type"]
