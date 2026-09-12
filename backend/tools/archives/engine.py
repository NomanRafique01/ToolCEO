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


def _run_7zip(command: list[str], progress: Callable[[int], None], cancel_event, cwd: str | None = None) -> str:
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
    captured_lines: list[str] = []
    try:
        assert process.stdout is not None
        for line in process.stdout:
            captured_lines.append(line)
            if cancel_event is not None and cancel_event.is_set():
                process.terminate()
                raise ArchiveCancelled()
            matches = _PROGRESS_RE.findall(line)
            if matches:
                progress(max(1, min(99, int(matches[-1]))))
        return_code = process.wait()
        full_output = "".join(captured_lines)
        if return_code != 0:
            if "wrong password" in full_output.lower() or "password" in full_output.lower():
                raise ValueError("Incorrect password or password required for this archive.")
            if "can not open the file as archive" in full_output.lower() or "cannot open" in full_output.lower():
                raise ValueError("Cannot open file as an archive. The file may be damaged or unsupported.")
            summary = "\n".join(captured_lines[-4:]).strip() if captured_lines else "Unknown error"
            raise RuntimeError(f"7-Zip process error: {summary}")
        return full_output
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def inspect_archive(archive_bytes: bytes, filename: str, password: str | None = None) -> dict:
    """Inspect archive contents, counts, uncompressed size, and encryption status."""
    executable = find_7zip()
    safe_name = Path(filename).name or "archive.bin"
    with tempfile.TemporaryDirectory(prefix="toolceo-inspect-") as temp_name:
        temp_dir = Path(temp_name)
        archive_path = temp_dir / safe_name
        archive_path.write_bytes(archive_bytes)

        cmd = [executable, "l", "-slt"]
        if password:
            cmd.append(f"-p{password}")
        else:
            cmd.append("-p-")
        cmd.append(str(archive_path))

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=False,
            cwd=str(temp_dir),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        stdout, _ = process.communicate()
        return_code = process.returncode

        is_encrypted = "Encrypted = +" in stdout or "wrong password" in stdout.lower() or "password" in stdout.lower()

        if return_code != 0:
            if is_encrypted:
                return {
                    "file_count": 0,
                    "folder_count": 0,
                    "uncompressed_size": 0,
                    "format": Path(filename).suffix.lstrip(".").lower() or "archive",
                    "is_encrypted": True,
                    "needs_password": True,
                    "entries": [],
                }
            if "can not open" in stdout.lower() or "cannot open" in stdout.lower():
                raise ValueError("File is not a supported or valid archive.")
            raise RuntimeError("Could not read archive contents.")

        file_count = 0
        folder_count = 0
        uncompressed_size = 0
        archive_format = ""
        entries: list[dict] = []

        blocks = stdout.split("\n\n")
        for block in blocks:
            lines = [b.strip() for b in block.splitlines() if b.strip()]
            props = {}
            for line in lines:
                if " = " in line:
                    k, v = line.split(" = ", 1)
                    props[k.strip()] = v.strip()

            if "Type" in props and not archive_format:
                archive_format = props["Type"]

            if "Path" in props and props.get("Path") != str(archive_path):
                is_folder = props.get("Folder") == "+"
                size = int(props.get("Size", 0)) if props.get("Size", "").isdigit() else 0
                item_encrypted = props.get("Encrypted") == "+"
                if item_encrypted:
                    is_encrypted = True

                if is_folder:
                    folder_count += 1
                else:
                    file_count += 1
                    uncompressed_size += size

                if len(entries) < 60:
                    entries.append({
                        "path": props["Path"],
                        "size": size,
                        "is_folder": is_folder,
                        "encrypted": item_encrypted,
                    })

        return {
            "file_count": file_count,
            "folder_count": folder_count,
            "uncompressed_size": uncompressed_size,
            "format": archive_format or Path(filename).suffix.lstrip(".").lower() or "archive",
            "is_encrypted": is_encrypted,
            "needs_password": False,
            "entries": entries,
        }


def extract_archive(
    archive_bytes: bytes,
    original_filename: str,
    output_name: str | None,
    password: str | None,
    progress: Callable[[int], None],
    cancel_event=None,
    destination_dir: str | None = None,
) -> tuple[bytes, str, str]:
    """Extract an archive and return payload bytes, safe filename, and media type."""
    if not archive_bytes:
        raise ValueError("Selected archive file is empty.")
    if len(archive_bytes) > _MAX_TOTAL_BYTES:
        raise ValueError("The selected archive exceeds the 2 GB limit.")

    executable = find_7zip()
    safe_name = Path(original_filename).name or "archive.bin"

    # If destination_dir is provided, extract directly into the chosen folder on disk
    if destination_dir:
        dest_path = Path(destination_dir).resolve()
        dest_path.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="toolceo-extract-") as temp_name:
            temp_dir = Path(temp_name)
            archive_path = temp_dir / safe_name
            archive_path.write_bytes(archive_bytes)

            cmd = [executable, "x", "-y", "-bsp1", f"-o{dest_path}"]
            if password:
                cmd.append(f"-p{password}")
            else:
                cmd.append("-p-")
            cmd.append(str(archive_path))

            _run_7zip(cmd, lambda pct: progress(min(85, max(5, pct))), cancel_event, cwd=str(temp_dir))
            progress(88)

            # Check if it was a nested single tarball like .tar.gz
            tar_candidates = [f for f in dest_path.iterdir() if f.is_file() and f.suffix.lower() == ".tar"]
            if len(tar_candidates) == 1 and len(list(dest_path.iterdir())) == 1:
                nested_tar = tar_candidates[0]
                tar_cmd = [executable, "x", "-y", "-bsp1", f"-o{dest_path}", str(nested_tar)]
                _run_7zip(tar_cmd, lambda pct: progress(88 + int(pct * 0.10)), cancel_event, cwd=str(dest_path))
                try:
                    nested_tar.unlink()
                except Exception:
                    pass

            progress(96)

            # Path traversal security check
            for root, dirs, files in os.walk(dest_path):
                for f in files:
                    full_p = Path(root, f).resolve()
                    if not str(full_p).startswith(str(dest_path)):
                        raise ValueError("Security violation: archive contains unsafe traversal paths.")

            progress(99)
            progress(100)
            return b"", str(dest_path), "inode/directory"

    with tempfile.TemporaryDirectory(prefix="toolceo-extract-") as temp_name:
        temp_dir = Path(temp_name)
        archive_path = temp_dir / safe_name
        archive_path.write_bytes(archive_bytes)

        extract_dir = temp_dir / "extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)

        cmd = [executable, "x", "-y", "-bsp1", f"-o{extract_dir}"]
        if password:
            cmd.append(f"-p{password}")
        else:
            cmd.append("-p-")
        cmd.append(str(archive_path))

        _run_7zip(cmd, lambda pct: progress(min(80, max(5, pct))), cancel_event, cwd=str(temp_dir))
        progress(88)

        # Check for nested single tarball (e.g. .tar.gz, .tar.bz2, .tar.xz)
        extracted_items = list(extract_dir.iterdir())
        if len(extracted_items) == 1 and extracted_items[0].is_file() and extracted_items[0].suffix.lower() == ".tar":
            nested_tar = extracted_items[0]
            sub_extract_dir = temp_dir / "tar_extracted"
            sub_extract_dir.mkdir(parents=True, exist_ok=True)
            tar_cmd = [executable, "x", "-y", "-bsp1", f"-o{sub_extract_dir}", str(nested_tar)]
            _run_7zip(tar_cmd, lambda pct: progress(88 + int(pct * 0.08)), cancel_event, cwd=str(temp_dir))
            extract_dir = sub_extract_dir
            extracted_items = list(extract_dir.iterdir())
            progress(89)

        # Path traversal security check
        extract_root = extract_dir.resolve()
        for root, dirs, files in os.walk(extract_dir):
            for f in files:
                full_p = Path(root, f).resolve()
                if not str(full_p).startswith(str(extract_root)):
                    raise ValueError("Security violation: archive contains unsafe traversal paths.")

        if not extracted_items:
            raise RuntimeError("The archive is empty or no files were extracted.")

        # If exactly 1 file was extracted (e.g. single decompressed file), return it directly
        if len(extracted_items) == 1 and extracted_items[0].is_file():
            single_file = extracted_items[0]
            out_filename = Path(output_name).name if output_name else single_file.name
            payload = single_file.read_bytes()
            progress(99)
            progress(100)
            return payload, out_filename, "application/octet-stream"

        # Multiple files or folders: package into a clean .zip archive
        progress(90)
        clean_stem = Path(original_filename).name
        for ext in [".tar.gz", ".tar.bz2", ".tar.xz", ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".cab", ".iso", ".dmg"]:
            if clean_stem.lower().endswith(ext):
                clean_stem = clean_stem[:-len(ext)]
                break
        clean_stem = clean_stem or "archive"

        final_zip_name = (Path(output_name).name if output_name else f"{clean_stem}_extracted.zip")
        if not final_zip_name.lower().endswith(".zip"):
            final_zip_name += ".zip"

        final_zip_path = temp_dir / final_zip_name
        zip_cmd = [executable, "a", "-tzip", "-bsp1", "-y", str(final_zip_path), "*"]
        _run_7zip(zip_cmd, lambda pct: progress(90 + int(pct * 0.09)), cancel_event, cwd=str(extract_dir))

        if not final_zip_path.is_file() or final_zip_path.stat().st_size == 0:
            raise RuntimeError("Failed to package extracted files into ZIP archive.")

        payload = final_zip_path.read_bytes()
        progress(99)
        progress(100)
        return payload, final_zip_name, "application/zip"


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
