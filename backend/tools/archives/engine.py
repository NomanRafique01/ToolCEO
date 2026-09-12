"""Offline archive creation through the installed Media Module's 7-Zip binary."""

from __future__ import annotations

import io
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable, Iterable

from platform_tools import find_rar, find_7zip

_IS_WIN   = sys.platform == "win32"
_IS_MAC   = sys.platform == "darwin"
_IS_LINUX = sys.platform.startswith("linux")

SUPPORTED_FORMATS = {
    "zip":     {"suffix": ".zip",     "media_type": "application/zip",                    "type_switch": "-tzip"},
    "tar":     {"suffix": ".tar",     "media_type": "application/x-tar",                  "type_switch": "-ttar"},
    "7z":      {"suffix": ".7z",      "media_type": "application/x-7z-compressed",         "type_switch": "-t7z"},
    "tar.gz":  {"suffix": ".tar.gz",  "media_type": "application/gzip",                   "type_switch": "-tgzip",  "wrapper": "tar"},
    "tar.bz2": {"suffix": ".tar.bz2", "media_type": "application/x-bzip2",                "type_switch": "-tbzip2", "wrapper": "tar"},
    "tar.xz":  {"suffix": ".tar.xz",  "media_type": "application/x-xz",                   "type_switch": "-txz",    "wrapper": "tar"},
    "wim":     {"suffix": ".wim",     "media_type": "application/x-ms-wim",               "type_switch": "-twim"},
    # ISO creation is handled separately via pycdlib — not via 7-Zip (7-Zip cannot create ISOs)
    "iso":     {"suffix": ".iso",     "media_type": "application/x-iso9660-image",         "type_switch": None},
    # RAR is handled separately via rar.exe — not via 7-Zip
    "rar":     {"suffix": ".rar",     "media_type": "application/vnd.rar",                "type_switch": None},
}

_PROGRESS_RE = re.compile(r"(?<!\d)(\d{1,3})%")
_MAX_FILES = 5000
_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024


class ArchiveCancelled(RuntimeError):
    """Raised when a running archive job is cancelled."""


class _PartialExtractionWarning(Exception):
    """Raised when 7-Zip exits with code 2 but may have extracted some content.
    Callers should check whether output files exist before re-raising as an error."""
    def __init__(self, output: str, code: int) -> None:
        super().__init__(output)
        self.output = output
        self.code = code


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
        # 7-Zip exit codes: 0 = OK, 1 = warning (partial), 2 = fatal error.
        # DMG/ISO/WIM files often cause exit code 1 or 2 because 7-Zip cannot parse
        # every internal sub-structure (e.g. HFS+ partitions), but it still extracts
        # the readable content. We only hard-fail on password errors or when the archive
        # cannot be opened at all — let the caller decide if useful output exists.
        if return_code != 0:
            output_lower = full_output.lower()
            if "wrong password" in output_lower or (
                "password" in output_lower and "no password" not in output_lower
            ):
                raise ValueError("Incorrect password or password required for this archive.")
            if "can not open the file as archive" in output_lower or "cannot open the file as" in output_lower:
                raise ValueError("Cannot open file as an archive. The file may be damaged or unsupported.")
            # For exit code 2+, raise only if nothing was extracted — checked by caller
            if return_code >= 2:
                raise _PartialExtractionWarning(full_output, return_code)
        return full_output
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def inspect_archive(archive_bytes: bytes, filename: str, password: str | None = None) -> dict:
    """Inspect archive contents, counts, uncompressed size, and encryption status."""
    executable = find_7zip()
    if not executable:
        raise RuntimeError("7-Zip is unavailable. Install the Media Module first.")
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
        compressed_size_total = 0
        archive_format = ""
        compression_method = ""
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

            # Pick up the archive-level Method field (first occurrence)
            if "Method" in props and not compression_method and "Path" not in props:
                compression_method = props["Method"]

            if "Path" in props and props.get("Path") != str(archive_path):
                is_folder = props.get("Folder") == "+"
                size = int(props.get("Size", 0)) if props.get("Size", "").isdigit() else 0
                packed = int(props.get("Packed Size", 0)) if props.get("Packed Size", "").isdigit() else 0
                method = props.get("Method", "")
                item_encrypted = props.get("Encrypted") == "+"
                if item_encrypted:
                    is_encrypted = True
                # Capture compression method from entries if not already found
                if method and not compression_method:
                    compression_method = method

                if is_folder:
                    folder_count += 1
                else:
                    file_count += 1
                    uncompressed_size += size
                    compressed_size_total += packed

                if len(entries) < 200:
                    entries.append({
                        "path": props["Path"],
                        "size": size,
                        "packed": packed,
                        "method": method,
                        "is_folder": is_folder,
                        "encrypted": item_encrypted,
                    })

        # Compute overall compression ratio (0–100 %)
        if uncompressed_size > 0 and compressed_size_total > 0:
            ratio = round(100.0 * (1.0 - compressed_size_total / uncompressed_size), 1)
        else:
            ratio = 0.0

        return {
            "file_count": file_count,
            "folder_count": folder_count,
            "uncompressed_size": uncompressed_size,
            "compressed_size": compressed_size_total,
            "compression_ratio": ratio,
            "compression_method": compression_method,
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
    if not executable:
        raise RuntimeError("7-Zip is unavailable. Install the Media Module first.")
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

            try:
                _run_7zip(cmd, lambda pct: progress(min(85, max(5, pct))), cancel_event, cwd=str(temp_dir))
            except _PartialExtractionWarning:
                # 7-Zip reported errors but may have extracted content anyway (common for DMG/ISO).
                # If dest_path has any content we treat extraction as successful.
                if not dest_path.exists() or not any(dest_path.iterdir()):
                    raise RuntimeError(
                        "7-Zip could not extract any files from this archive. "
                        "The file may be corrupted or use an unsupported format."
                    )
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

        try:
            _run_7zip(cmd, lambda pct: progress(min(80, max(5, pct))), cancel_event, cwd=str(temp_dir))
        except _PartialExtractionWarning:
            # 7-Zip reported errors but may have extracted content anyway (common for DMG/ISO).
            # If extract_dir has any content we treat extraction as successful.
            if not extract_dir.exists() or not any(extract_dir.iterdir()):
                raise RuntimeError(
                    "7-Zip could not extract any files from this archive. "
                    "The file may be corrupted or use an unsupported format."
                )
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


def split_archive(
    archive_bytes: bytes,
    original_filename: str,
    part_size_mb: int,
    output_stem: str,
    progress: Callable[[int], None],
    cancel_event=None,
) -> tuple[bytes, str, str]:
    """Split *archive_bytes* into equal-sized volume parts using 7-Zip's -v flag.

    Returns a ZIP file containing all split parts, its safe filename, and
    'application/zip' as the media type so the frontend can handle it the
    normal download way.
    """
    if not archive_bytes:
        raise ValueError("Selected archive file is empty.")

    executable = find_7zip()
    if not executable:
        raise RuntimeError("7-Zip is unavailable. Install the Media Module first.")

    part_size_bytes = max(1, part_size_mb) * 1024 * 1024

    safe_src = Path(original_filename).name or "archive.zip"
    safe_stem = output_stem or Path(safe_src).stem or "archive"
    # Ensure the stem has no archive extension
    for ext in (".tar.gz", ".tar.bz2", ".tar.xz", ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"):
        if safe_stem.lower().endswith(ext):
            safe_stem = safe_stem[: -len(ext)]
            break
    safe_stem = safe_stem or "archive"

    with tempfile.TemporaryDirectory(prefix="toolceo-split-") as tmp_name:
        tmp = Path(tmp_name)
        src_path = tmp / safe_src
        src_path.write_bytes(archive_bytes)
        progress(10)

        # Output pattern: 7-Zip appends .001, .002, … to the given output path
        out_base = tmp / "parts" / safe_stem
        out_base.parent.mkdir(parents=True, exist_ok=True)

        # Copy the archive to the parts directory using 7-Zip "a" with -v
        # We pass the archive directly (already compressed) and use "-v" to split it.
        # 7z a -v<size> output.zip input_archive  → produces output.zip.001 …
        cmd = [
            executable, "a",
            "-tzip",
            f"-v{part_size_bytes}b",
            "-bsp1", "-y",
            str(out_base) + ".zip",
            str(src_path),
        ]
        _run_7zip(cmd, lambda pct: progress(10 + int(pct * 0.7)), cancel_event, cwd=str(tmp))
        progress(82)

        # Gather all produced part files (*.001, *.002, …)
        parts_dir = out_base.parent
        part_files = sorted(parts_dir.glob("*.zip.*"))
        # Also handle case where 7-Zip produced exactly one file without suffix
        if not part_files:
            single = parts_dir / (safe_stem + ".zip")
            if single.is_file():
                part_files = [single]
        if not part_files:
            raise RuntimeError("7-Zip did not produce any split parts.")

        # Package all parts into a delivery ZIP so the user gets one download
        progress(85)
        delivery_name = f"{safe_stem}_parts.zip"
        delivery_path = tmp / delivery_name
        delivery_cmd = [
            executable, "a", "-tzip", "-bsp1", "-y",
            str(delivery_path),
            *[str(f) for f in part_files],
        ]
        _run_7zip(delivery_cmd, lambda pct: progress(85 + int(pct * 0.13)), cancel_event, cwd=str(parts_dir))
        progress(99)

        if not delivery_path.is_file() or delivery_path.stat().st_size == 0:
            raise RuntimeError("Failed to package split parts.")

        payload = delivery_path.read_bytes()
        progress(100)
        return payload, delivery_name, "application/zip"


def merge_archive(
    part_items: list[tuple[bytes, str]],
    output_stem: str,
    output_format: str,
    progress: Callable[[int], None],
    cancel_event=None,
) -> tuple[bytes, str, str]:
    """Merge multi-part archive files (.001/.002/… or .z01/.z02/… etc.) into one archive.

    *part_items* is a list of (bytes, filename) tuples — one per part file.
    The parts are sorted by filename before merging so they are joined in order.

    Returns merged archive bytes, safe filename, and media type.
    """
    if not part_items:
        raise ValueError("No archive parts provided.")

    executable = find_7zip()
    if not executable:
        raise RuntimeError("7-Zip is unavailable. Install the Media Module first.")

    safe_stem = output_stem or "merged_archive"
    spec = SUPPORTED_FORMATS.get(output_format, SUPPORTED_FORMATS["zip"])
    suffix = spec["suffix"]
    media_type = spec["media_type"]
    out_filename = f"{safe_stem}{suffix}"

    # Sort parts by filename so .001 < .002 < .003 …
    sorted_parts = sorted(part_items, key=lambda x: x[1].lower())

    with tempfile.TemporaryDirectory(prefix="toolceo-merge-") as tmp_name:
        tmp = Path(tmp_name)
        parts_dir = tmp / "parts"
        parts_dir.mkdir()

        # Write all parts to disk
        for idx, (raw, name) in enumerate(sorted_parts):
            safe_name = Path(name).name or f"part_{idx:03d}"
            (parts_dir / safe_name).write_bytes(raw)
            progress(5 + int(idx / len(sorted_parts) * 30))

        progress(36)

        # Locate the first part — the one 7-Zip should be pointed at
        part_names = sorted(parts_dir.iterdir(), key=lambda p: p.name.lower())
        first_part = part_names[0]
        progress(40)

        # Extract into a temp dir then re-pack into the requested format
        extract_dir = tmp / "extracted"
        extract_dir.mkdir()

        ext_cmd = [executable, "x", "-y", "-bsp1", f"-o{extract_dir}", str(first_part)]
        _run_7zip(ext_cmd, lambda pct: progress(40 + int(pct * 0.35)), cancel_event, cwd=str(parts_dir))
        progress(76)

        extracted_items = list(extract_dir.iterdir())
        if not extracted_items:
            raise RuntimeError("No files found after merging parts. Parts may be corrupted or incomplete.")

        # Re-pack into the requested output format
        output_path = tmp / out_filename
        pack_cmd = [
            executable, "a",
            spec["type_switch"] or "-tzip",
            "-bsp1", "-y",
            str(output_path),
            "*",
        ]
        _run_7zip(pack_cmd, lambda pct: progress(76 + int(pct * 0.22)), cancel_event, cwd=str(extract_dir))
        progress(99)

        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("Failed to create merged archive.")

        payload = output_path.read_bytes()
        progress(100)
        return payload, out_filename, media_type


def _create_iso_archive(
    materialized: list[tuple[bytes, str]],
    safe_output: str,
    progress: Callable[[int], None],
) -> tuple[bytes, str, str]:
    """Create an ISO 9660 image using pycdlib."""
    try:
        import pycdlib  # type: ignore
    except ImportError:
        raise RuntimeError(
            "pycdlib is unavailable. Please reinstall ToolCEO or contact support."
        )

    iso = pycdlib.PyCdlib()
    iso.new(interchange_level=4, joliet=3, rock_ridge="1.09", vol_ident="TOOLCEO")

    total = len(materialized)
    # Track directories already created (Joliet paths)
    created_dirs: set[str] = set()

    def _ensure_dirs(joliet_dir: str) -> None:
        """Recursively create all parent directories in the ISO."""
        if joliet_dir in created_dirs or joliet_dir == "/":
            return
        parent = "/".join(joliet_dir.rsplit("/", 1)[:-1]) or "/"
        _ensure_dirs(parent)
        rr_dir = joliet_dir  # rock-ridge path mirrors joliet path
        iso.add_directory(joliet_path=joliet_dir, rr_name=joliet_dir.rsplit("/", 1)[-1])
        created_dirs.add(joliet_dir)

    for idx, (raw, original_name) in enumerate(materialized):
        member = _safe_member_name(original_name)
        parts = member.split("/")
        filename = parts[-1]
        joliet_dir = ("/" + "/".join(parts[:-1])) if len(parts) > 1 else "/"
        _ensure_dirs(joliet_dir)
        iso.add_fp(
            io.BytesIO(raw),
            length=len(raw),
            joliet_path=joliet_dir.rstrip("/") + "/" + filename,
            rr_name=filename,
        )
        progress(max(1, min(95, int((idx + 1) / max(total, 1) * 95))))

    progress(97)
    buf = io.BytesIO()
    iso.write_fp(buf)
    iso.close()
    progress(100)
    return buf.getvalue(), safe_output, "application/x-iso9660-image"


def _create_rar_archive(
    materialized: list[tuple[bytes, str]],
    safe_output: str,
    progress: Callable[[int], None],
    cancel_event=None,
) -> tuple[bytes, str, str]:
    """Create a RAR archive using rar.exe (WinRAR CLI)."""
    executable = find_rar()
    if not executable:
        raise RuntimeError(
            "rar.exe is unavailable. The RAR engine could not be found in engines/rar/."
        )

    with tempfile.TemporaryDirectory(prefix="toolceo-rar-") as temp_name:
        temp_dir = Path(temp_name)
        input_dir = temp_dir / "input"
        input_dir.mkdir()
        used: set[str] = set()
        input_paths: list[str] = []
        for raw, original_name in materialized:
            member = _safe_member_name(original_name)
            if member in used:
                raise ValueError(f"Duplicate archive path: {member}")
            used.add(member)
            destination = input_dir.joinpath(*member.split("/"))
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(raw)
            input_paths.append(str(destination))

        output_path = temp_dir / safe_output
        # rar a -ep1 -m5 -y <output> <file1> <file2> ...
        # Note: rar.exe does NOT support 7-Zip flags like -bsp1.
        # Progress lines look like:  "Adding    filename.txt   20%  OK"
        command = [
            executable, "a",
            "-ep1",      # strip base path, keep relative names only
            "-m5",       # best compression
            "-y",        # assume yes to all prompts
            str(output_path),
            *input_paths,
        ]
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=False,
            cwd=str(input_dir),
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        captured: list[str] = []
        assert process.stdout is not None
        total = len(input_paths)
        done_count = 0
        for line in process.stdout:
            captured.append(line)
            if cancel_event is not None and cancel_event.is_set():
                process.terminate()
                raise ArchiveCancelled()
            # rar.exe progress: "Adding    filename   20%  OK"  or "Done"
            if line.strip().startswith("Adding") and "OK" in line:
                done_count += 1
                pct = max(1, min(99, int(done_count / max(total, 1) * 99)))
                progress(pct)
            else:
                # Fallback: parse any raw percentage on the line
                matches = _PROGRESS_RE.findall(line)
                if matches:
                    progress(max(1, min(99, int(matches[-1]))))
        return_code = process.wait()
        # rar.exe exits 0 on full success, 1 for warnings (e.g. trial notice) — both OK
        if return_code not in (0, 1):
            summary = "".join(captured[-6:]).strip() or "Unknown RAR error"
            raise RuntimeError(f"rar.exe process error: {summary}")

        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("rar.exe completed without producing an archive.")

        return output_path.read_bytes(), safe_output, "application/vnd.rar"


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

    safe_output = Path(output_name).name
    if not safe_output.lower().endswith(spec["suffix"]):
        safe_output += spec["suffix"]

    # RAR creation uses its own engine (rar.exe), not 7-Zip
    if archive_format == "rar":
        return _create_rar_archive(materialized, safe_output, progress, cancel_event)

    # ISO creation uses pycdlib, not 7-Zip (7-Zip cannot create ISO images)
    if archive_format == "iso":
        return _create_iso_archive(materialized, safe_output, progress)

    executable = find_7zip()
    if not executable:
        raise RuntimeError("7-Zip is unavailable. Install the Media Module first.")
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


# ── ARCHIVE CONVERSION (re-pack one format into another) ──────────────────────

#: Pairs supported for archive-to-archive conversion.
#: Key = (source_ext, target_fmt), value = target media-type
CONVERT_PAIRS: dict[tuple[str, str], str] = {
    ("zip",    "7z"):     "application/x-7z-compressed",
    ("zip",    "tar"):    "application/x-tar",
    ("zip",    "tar.gz"): "application/gzip",
    ("zip",    "rar"):    "application/vnd.rar",
    ("tar",    "zip"):    "application/zip",
    ("tar",    "7z"):     "application/x-7z-compressed",
    ("tar",    "gz"):     "application/gzip",
    ("tar",    "rar"):    "application/vnd.rar",
    ("7z",     "zip"):    "application/zip",
    ("7z",     "tar"):    "application/x-tar",
    ("7z",     "tar.gz"): "application/gzip",
    ("7z",     "rar"):    "application/vnd.rar",
    ("tar.gz", "zip"):    "application/zip",
    ("tar.gz", "7z"):     "application/x-7z-compressed",
    ("tar.gz", "tar"):    "application/x-tar",
    ("tar.gz", "rar"):    "application/vnd.rar",
    ("rar",    "zip"):    "application/zip",
    ("rar",    "7z"):     "application/x-7z-compressed",
    ("rar",    "tar"):    "application/x-tar",
    ("rar",    "tar.gz"): "application/gzip",
}

_CONVERT_SUFFIX: dict[str, str] = {
    "zip":    ".zip",
    "7z":     ".7z",
    "tar":    ".tar",
    "gz":     ".gz",
    "rar":    ".rar",
    "tar.gz": ".tar.gz",
    "tar.bz2": ".tar.bz2",
}

_CONVERT_TYPE_SWITCH: dict[str, str | None] = {
    "zip":    "-tzip",
    "7z":     "-t7z",
    "tar":    "-ttar",
    "gz":     "-tgzip",
    "rar":    None,    # handled separately via rar.exe
    "tar.gz": None,    # two-step: tar first, then gzip
    "tar.bz2": None,   # two-step: tar first, then bzip2
}


def convert_archive(
    archive_bytes: bytes,
    source_filename: str,
    target_format: str,
    output_name: str,
    progress: Callable[[int], None],
    cancel_event=None,
) -> tuple[bytes, str, str]:
    """Re-pack *archive_bytes* into *target_format*.

    Strategy:
      1. Extract the source archive into a temp directory.
      2. Re-pack the extracted files into the requested target format.
      3. Return the new archive bytes, a safe filename, and the media type.
    """
    src_name = Path(source_filename).name.lower()
    # Normalise multi-dot extensions
    src_ext = src_name
    for multi in (".tar.gz", ".tar.bz2", ".tar.xz"):
        if src_name.endswith(multi):
            src_ext = multi.lstrip(".")
            break
    else:
        src_ext = src_name.rsplit(".", 1)[-1] if "." in src_name else src_name

    media_type = CONVERT_PAIRS.get((src_ext, target_format))
    if media_type is None:
        raise ValueError(
            f"Unsupported conversion: {src_ext.upper()} to {target_format.upper()}. "
            "Please choose a supported pair."
        )

    executable = find_7zip()
    if not executable:
        raise RuntimeError("7-Zip is unavailable. Install the Media Module first.")

    suffix = _CONVERT_SUFFIX.get(target_format, f".{target_format}")

    # Build safe output stem by stripping all known archive extensions
    safe_stem = Path(source_filename).name
    for strip_ext in [".tar.gz", ".tar.bz2", ".tar.xz", ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"]:
        if safe_stem.lower().endswith(strip_ext):
            safe_stem = safe_stem[: -len(strip_ext)]
            break
    else:
        safe_stem = safe_stem.rsplit(".", 1)[0] if "." in safe_stem else safe_stem
    safe_stem = safe_stem or "archive"

    safe_output = Path(output_name).name if output_name else (safe_stem + suffix)
    if not safe_output.lower().endswith(suffix):
        safe_output += suffix

    with tempfile.TemporaryDirectory(prefix="toolceo-convert-") as tmp:
        tmp_dir     = Path(tmp)
        src_path    = tmp_dir / Path(source_filename).name
        src_path.write_bytes(archive_bytes)
        extract_dir = tmp_dir / "extracted"
        extract_dir.mkdir()

        progress(5)

        # ── Step 1: extract source archive ────────────────────────────────────
        cmd_x = [executable, "x", "-y", "-bsp1", f"-o{extract_dir}", "-p-", str(src_path)]
        try:
            _run_7zip(cmd_x, lambda pct: progress(5 + int(pct * 0.35)), cancel_event, cwd=str(tmp_dir))
        except _PartialExtractionWarning:
            if not extract_dir.exists() or not any(extract_dir.iterdir()):
                raise RuntimeError("Could not extract source archive for conversion.")

        progress(40)

        # Unwrap nested .tar (produced when extracting .tar.gz, .tar.bz2, etc.)
        items = list(extract_dir.iterdir())
        if len(items) == 1 and items[0].is_file() and items[0].suffix.lower() == ".tar":
            nested_tar = items[0]
            inner_dir  = tmp_dir / "inner"
            inner_dir.mkdir()
            tar_cmd = [executable, "x", "-y", "-bsp1", f"-o{inner_dir}", str(nested_tar)]
            _run_7zip(tar_cmd, lambda pct: progress(40 + int(pct * 0.10)), cancel_event, cwd=str(tmp_dir))
            extract_dir = inner_dir

        progress(50)

        # ── Step 2: re-pack into target format ────────────────────────────────
        out_path = tmp_dir / safe_output

        if target_format == "tar.gz":
            tar_path = tmp_dir / (safe_stem + ".tar")
            cmd_tar = [executable, "a", "-ttar", "-bsp1", "-y", str(tar_path), "."]
            _run_7zip(cmd_tar, lambda pct: progress(50 + int(pct * 0.25)), cancel_event, cwd=str(extract_dir))
            progress(75)
            cmd_gz = [executable, "a", "-tgzip", "-bsp1", "-y", str(out_path), str(tar_path)]
            _run_7zip(cmd_gz, lambda pct: progress(75 + int(pct * 0.20)), cancel_event, cwd=str(tmp_dir))

        elif target_format == "gz":
            tar_path = tmp_dir / (safe_stem + ".tar")
            cmd_tar = [executable, "a", "-ttar", "-bsp1", "-y", str(tar_path), "."]
            _run_7zip(cmd_tar, lambda pct: progress(50 + int(pct * 0.25)), cancel_event, cwd=str(extract_dir))
            progress(75)
            cmd_cmp = [executable, "a", "-tgzip", "-bsp1", "-y", str(out_path), str(tar_path)]
            _run_7zip(cmd_cmp, lambda pct: progress(75 + int(pct * 0.20)), cancel_event, cwd=str(tmp_dir))

        elif target_format == "rar":
            # Re-pack extracted files into RAR using rar.exe
            rar_exe = find_rar()
            if not rar_exe:
                raise RuntimeError(
                    "rar.exe is unavailable. The RAR engine could not be found in engines/rar/."
                )
            # Collect all extracted files
            input_paths: list[str] = []
            for root, dirs, files in os.walk(extract_dir):
                for fname in files:
                    input_paths.append(str(Path(root) / fname))
            if not input_paths:
                raise RuntimeError("No files found after extracting source archive.")
            command = [rar_exe, "a", "-ep1", "-m5", "-y", str(out_path), *input_paths]
            process = __import__("subprocess").Popen(
                command,
                stdout=__import__("subprocess").PIPE,
                stderr=__import__("subprocess").STDOUT,
                text=True, encoding="utf-8", errors="replace",
                shell=False, cwd=str(extract_dir),
                creationflags=getattr(__import__("subprocess"), "CREATE_NO_WINDOW", 0),
            )
            total = len(input_paths)
            done_count = 0
            assert process.stdout is not None
            for line in process.stdout:
                if cancel_event is not None and cancel_event.is_set():
                    process.terminate()
                    raise ArchiveCancelled()
                if line.strip().startswith("Adding") and "OK" in line:
                    done_count += 1
                    progress(50 + max(1, min(45, int(done_count / max(total, 1) * 45))))
                else:
                    matches = _PROGRESS_RE.findall(line)
                    if matches:
                        progress(50 + max(1, min(45, int(int(matches[-1]) * 0.45))))
            rc = process.wait()
            if rc not in (0, 1):
                raise RuntimeError(f"rar.exe exited with code {rc} during conversion.")

        else:
            type_sw = _CONVERT_TYPE_SWITCH.get(target_format, f"-t{target_format}")
            if type_sw is None:
                raise ValueError(f"No 7-Zip type switch for target format: {target_format}")
            cmd_a = [executable, "a", type_sw, "-bsp1", "-y", str(out_path), "."]
            _run_7zip(cmd_a, lambda pct: progress(50 + int(pct * 0.45)), cancel_event, cwd=str(extract_dir))

        progress(96)

        if not out_path.is_file() or out_path.stat().st_size == 0:
            raise RuntimeError(f"Conversion produced an empty or missing file: {safe_output}")

        progress(100)
        return out_path.read_bytes(), safe_output, media_type
