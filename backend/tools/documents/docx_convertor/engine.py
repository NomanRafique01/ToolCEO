"""
DOCX conversion engine — ToolCEO
==================================

Supported conversions
---------------------
  docx → pdf   : LibreOffice headless  (soffice --convert-to pdf)
  docx → html  : LibreOffice headless  (soffice --convert-to html)
  docx → odt   : LibreOffice headless  (soffice --convert-to odt)
  docx → txt   : Pandoc                (pandoc -f docx -t plain)
  docx → epub  : Pandoc                (pandoc -f docx -t epub)
  docx → md    : Pandoc                (pandoc -f docx -t markdown)

Public API
----------
convert_docx(data, target_format, job_id)
    Returns the converted bytes.
    Raises RuntimeError if the required engine is unavailable.

get_docx_info(data)
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
_LO_TARGETS = {"pdf", "html", "odt"}

# Targets that use Pandoc
_PANDOC_TARGETS = {"txt", "epub", "md"}

# LibreOffice --convert-to format strings
_LO_FORMAT_MAP = {
    "pdf":  "pdf",
    "html": "html",
    "odt":  "odt:writer8",
}

# Pandoc output format strings
_PANDOC_FORMAT_MAP = {
    "txt":  "plain",
    "epub": "epub",
    "md":   "markdown",
}

# Media-type per target (used by router)
MEDIA_TYPES = {
    "pdf":  "application/pdf",
    "html": "text/html; charset=utf-8",
    "odt":  "application/vnd.oasis.opendocument.text",
    "txt":  "text/plain; charset=utf-8",
    "epub": "application/epub+zip",
    "md":   "text/markdown; charset=utf-8",
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

def get_docx_info(data: bytes) -> dict:
    """Returns basic file metadata — file_size only (no DOCX thumbnail support)."""
    return {"file_size": len(data)}


# ---------------------------------------------------------------------------
# Internal: LibreOffice conversion
# ---------------------------------------------------------------------------

def _run_libreoffice(soffice: str, input_path: Path, out_dir: Path, fmt: str) -> None:
    """
    Call LibreOffice headless to convert input_path → <fmt> in out_dir.
    Raises RuntimeError with captured stderr on failure.
    """
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
        raise RuntimeError(
            f"LibreOffice timed out after {_LO_TIMEOUT} s."
        ) from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(
            f"LibreOffice exited with code {proc.returncode}."
            + (f" Details: {detail}" if detail else "")
        )


def _convert_with_libreoffice(data: bytes, fmt: str, job_id: Optional[str]) -> bytes:
    """Convert DOCX bytes to *fmt* using LibreOffice; return output bytes."""
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path  = Path(tmp)
        input_doc = tmp_path / "input.docx"
        input_doc.write_bytes(data)

        _report(job_id, 40)
        _run_libreoffice(soffice, input_doc, tmp_path, fmt)
        _report(job_id, 85)

        # LibreOffice names the output after the input stem
        # For odt the format string includes a filter suffix; strip it for extension
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
    """
    Call Pandoc to convert input_path (DOCX) → output_path.
    Raises RuntimeError on failure.
    """
    pandoc_fmt = _PANDOC_FORMAT_MAP[fmt]
    cmd = [
        pandoc,
        str(input_path),
        "-f", "docx",
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
    """Convert DOCX bytes to *fmt* using Pandoc; return output bytes."""
    pandoc = find_pandoc()
    if not pandoc:
        raise RuntimeError(install_message("pandoc"))

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path    = Path(tmp)
        input_doc   = tmp_path / "input.docx"
        output_file = tmp_path / f"output.{fmt}"
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

def convert_docx(
    data: bytes,
    target_format: str,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert DOCX bytes to *target_format*.

    Parameters
    ----------
    data          : raw bytes of the .docx file
    target_format : one of "pdf", "html", "odt", "txt", "epub", "md"
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
