"""
TXT conversion engine — ToolCEO
==================================

Supported conversions
---------------------
  txt → pdf    : LibreOffice headless  (soffice --convert-to pdf)
  txt → docx   : Pandoc                (pandoc -f plain -t docx)
  txt → html   : Pandoc                (pandoc -f plain -t html5)
  txt → md     : Pandoc                (pandoc -f plain -t markdown)
  txt → epub   : Pandoc                (pandoc -f plain -t epub)
  txt → odt    : Pandoc                (pandoc -f plain -t odt)
  txt → rtf    : Pandoc                (pandoc -f plain -t rtf)

Public API
----------
convert_txt(data, target_format, job_id)
    Returns the converted bytes.
    Raises RuntimeError if the required engine is unavailable.

get_txt_info(data)
    Returns { "file_size": int }
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from platform_tools import find_libreoffice, find_pandoc, install_message

_log = logging.getLogger(__name__)

# Subprocess timeout for conversions (seconds)
_LO_TIMEOUT     = 300
_PANDOC_TIMEOUT = 120

# Targets that use LibreOffice
_LO_TARGETS = {"pdf"}

# Targets that use Pandoc
_PANDOC_TARGETS = {"docx", "html", "md", "epub", "odt", "rtf"}

# LibreOffice --convert-to format strings
_LO_FORMAT_MAP = {
    "pdf": "pdf",
}

# Pandoc output format strings
_PANDOC_FORMAT_MAP = {
    "docx": "docx",
    "html": "html5",
    "md":   "markdown",
    "epub": "epub",
    "odt":  "odt",
    "rtf":  "rtf",
}

# Media-type per target (used by router)
MEDIA_TYPES = {
    "pdf":  "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "html": "text/html; charset=utf-8",
    "md":   "text/markdown; charset=utf-8",
    "epub": "application/epub+zip",
    "odt":  "application/vnd.oasis.opendocument.text",
    "rtf":  "application/rtf",
}


# ---------------------------------------------------------------------------
# Progress helper
# ---------------------------------------------------------------------------

def _report(job_id: Optional[str], pct: int) -> None:
    if not job_id:
        return
    try:
        import jobs as job_store
        job_store.set_progress(job_id, pct)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Public info helper
# ---------------------------------------------------------------------------

def get_txt_info(data: bytes) -> dict:
    """Returns basic file metadata — file_size only."""
    return {"file_size": len(data)}


# ---------------------------------------------------------------------------
# Internal: LibreOffice conversion
# ---------------------------------------------------------------------------

def _run_libreoffice(soffice: str, input_path: Path, out_dir: Path, fmt: str) -> None:
    lo_fmt = _LO_FORMAT_MAP[fmt]
    cmd = [
        soffice,
        "--headless",
        "--norestore",
        "--nofirststartwizard",
        "--convert-to", lo_fmt,
        "--outdir", str(out_dir),
        str(input_path),
    ]
    _log.debug("LibreOffice command: %s", " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_LO_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"LibreOffice timed out after {_LO_TIMEOUT} s.") from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"LibreOffice exited with code {proc.returncode}."
            + (f" Details: {detail}" if detail else "")
        )


def _convert_with_libreoffice(data: bytes, fmt: str, job_id: Optional[str]) -> bytes:
    """Convert TXT bytes to *fmt* using LibreOffice; return output bytes."""
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path  = Path(tmp)
        input_doc = tmp_path / "input.txt"
        input_doc.write_bytes(data)

        _report(job_id, 40)
        _run_libreoffice(soffice, input_doc, tmp_path, fmt)
        _report(job_id, 85)

        out_ext = fmt.split(":")[0]
        output_file = tmp_path / f"input.{out_ext}"
        if not output_file.exists():
            candidates = list(tmp_path.glob(f"*.{out_ext}"))
            if not candidates:
                raise RuntimeError(
                    f"LibreOffice did not produce a .{out_ext} output file."
                )
            output_file = candidates[0]

        _report(job_id, 90)
        return output_file.read_bytes()


# ---------------------------------------------------------------------------
# Internal: Pandoc conversion
# ---------------------------------------------------------------------------

def _run_pandoc(pandoc: str, input_path: Path, output_path: Path, fmt: str) -> None:
    pandoc_fmt = _PANDOC_FORMAT_MAP[fmt]
    cmd = [
        pandoc,
        str(input_path),
        "-f", "markdown",
        "-t", pandoc_fmt,
        "-o", str(output_path),
        "--standalone",
    ]
    _log.debug("Pandoc command: %s", " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_PANDOC_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Pandoc timed out after {_PANDOC_TIMEOUT} s.") from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"Pandoc exited with code {proc.returncode}."
            + (f" Details: {detail}" if detail else "")
        )


def _convert_with_pandoc(data: bytes, fmt: str, job_id: Optional[str]) -> bytes:
    """Convert TXT bytes to *fmt* using Pandoc; return output bytes."""
    pandoc = find_pandoc()
    if not pandoc:
        raise RuntimeError(install_message("pandoc"))

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path    = Path(tmp)
        input_doc   = tmp_path / "input.txt"
        output_file = tmp_path / f"output.{fmt}"

        # All Pandoc targets: markdown reader treats "\" as an escape character,
        # which destroys Windows paths (e.g. C:\Users → C:Users).
        # Double every backslash so they survive Pandoc's markdown parsing.
        if fmt in _PANDOC_TARGETS:
            try:
                text = data.decode("utf-8", errors="replace")
            except Exception:
                text = data.decode("latin-1", errors="replace")
            input_doc.write_text(text.replace("\\", "\\\\"), encoding="utf-8")
        else:
            input_doc.write_bytes(data)

        _report(job_id, 40)
        _run_pandoc(pandoc, input_doc, output_file, fmt)
        _report(job_id, 90)

        if not output_file.exists():
            raise RuntimeError(f"Pandoc did not produce a .{fmt} output file.")

        return output_file.read_bytes()


# ---------------------------------------------------------------------------
# Main public conversion entry point
# ---------------------------------------------------------------------------

def convert_txt(
    data: bytes,
    target_format: str,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert TXT bytes to *target_format*.

    Parameters
    ----------
    data          : raw bytes of the .txt file
    target_format : one of "pdf", "docx", "html", "md", "epub", "odt", "rtf"
    job_id        : optional SSE job id for progress reporting

    Returns
    -------
    bytes — the converted file content

    Raises
    ------
    ValueError   — unsupported target format
    RuntimeError — engine unavailable or conversion failure
    """
    fmt = target_format.lower().lstrip(".")

    if fmt not in (_LO_TARGETS | _PANDOC_TARGETS):
        raise ValueError(
            f"Unsupported target format '{fmt}'. "
            f"Supported: {', '.join(sorted(_LO_TARGETS | _PANDOC_TARGETS))}"
        )

    _report(job_id, 10)

    if fmt in _LO_TARGETS:
        return _convert_with_libreoffice(data, fmt, job_id)
    else:
        return _convert_with_pandoc(data, fmt, job_id)
