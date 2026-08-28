"""
XLSX conversion engine — ToolCEO
==================================

Supported conversions
---------------------
  xlsx → pdf   : LibreOffice headless  (soffice --convert-to pdf)
  xlsx → csv   : Python (openpyxl)     — per-sheet CSV; ZIP if multiple sheets
  xlsx → html  : LibreOffice headless  (soffice --convert-to html)
  xlsx → ods   : LibreOffice headless  (soffice --convert-to ods)
  xlsx → txt   : LibreOffice headless  (soffice --convert-to txt:Text)
  xlsx → json  : Python (openpyxl)     — all sheets → JSON array of objects

Public API
----------
convert_xlsx(data, target_format, job_id)
    Returns the converted bytes.
    Raises RuntimeError if the required engine is unavailable.

convert_xlsx_csv(data, stem, job_id)
    Returns (bytes, media_type, filename) — single CSV or ZIP of CSVs.

get_xlsx_info(data)
    Returns { "file_size": int }
"""

from __future__ import annotations

import csv
import io
import json
import logging
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Optional, Tuple

from platform_tools import find_libreoffice, install_message

_log = logging.getLogger(__name__)

# Subprocess timeout for conversions (seconds)
_LO_TIMEOUT = 300

# Targets that use LibreOffice
_LO_TARGETS = {"pdf", "html", "ods"}

# Targets that use Python/openpyxl
_PY_TARGETS = {"json", "csv"}

# LibreOffice --convert-to format strings
_LO_FORMAT_MAP = {
    "pdf":  "pdf",
    "html": "html",
    "ods":  "ods",
}

# Media-type per target (used by router for non-CSV targets)
MEDIA_TYPES = {
    "pdf":  "application/pdf",
    "csv":  "text/csv; charset=utf-8",          # single-sheet fallback
    "html": "text/html; charset=utf-8",
    "ods":  "application/vnd.oasis.opendocument.spreadsheet",
    "json": "application/json; charset=utf-8",
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

def get_xlsx_info(data: bytes) -> dict:
    """Returns basic file metadata — file_size only."""
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
    """Convert XLSX bytes to *fmt* using LibreOffice; return output bytes."""
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path  = Path(tmp)
        input_doc = tmp_path / "input.xlsx"
        input_doc.write_bytes(data)

        _report(job_id, 40)
        _run_libreoffice(soffice, input_doc, tmp_path, fmt)
        _report(job_id, 85)

        # LibreOffice names the output after the input stem
        # For txt the format string includes a filter suffix; strip it for extension
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
# Internal: Python/openpyxl CSV conversion (per-sheet, ZIP if multiple)
# ---------------------------------------------------------------------------

def _convert_to_csv(
    data: bytes,
    stem: str,
    job_id: Optional[str],
) -> Tuple[bytes, str, str]:
    """
    Convert XLSX bytes to CSV using openpyxl.

    Returns
    -------
    (content_bytes, media_type, filename)
      • Single sheet  → (csv_bytes,  "text/csv; charset=utf-8",        "<stem>.csv")
      • Multiple sheets → (zip_bytes, "application/zip", "<stem>_csv.zip")
    """
    try:
        import openpyxl
    except ImportError as exc:
        raise RuntimeError(
            "openpyxl is required for XLSX → CSV conversion. "
            "Install it with: pip install openpyxl"
        ) from exc

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        input_doc = Path(tmp) / "input.xlsx"
        input_doc.write_bytes(data)

        _report(job_id, 40)

        wb = openpyxl.load_workbook(str(input_doc), read_only=True, data_only=True)
        sheet_names = wb.sheetnames

        # Collect CSV bytes per sheet
        csvs: list[Tuple[str, bytes]] = []
        for sheet_name in sheet_names:
            ws = wb[sheet_name]
            buf = io.StringIO()
            writer = csv.writer(buf)
            for row in ws.iter_rows(values_only=True):
                writer.writerow([("" if v is None else v) for v in row])
            csvs.append((sheet_name, buf.getvalue().encode("utf-8")))

        wb.close()

    _report(job_id, 85)

    if len(csvs) == 1:
        # Single sheet — deliver as plain CSV
        _report(job_id, 90)
        return (
            csvs[0][1],
            "text/csv; charset=utf-8",
            f"{stem}.csv",
        )

    # Multiple sheets — ZIP all CSVs
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for sheet_name, csv_bytes in csvs:
            # Sanitise sheet name for use as a filename
            safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in sheet_name).strip()
            if not safe_name:
                safe_name = "sheet"
            zf.writestr(f"{stem}_{safe_name}.csv", csv_bytes)

    _report(job_id, 90)
    return (
        zip_buf.getvalue(),
        "application/zip",
        f"{stem}_csv.zip",
    )


# ---------------------------------------------------------------------------
# Internal: Python/openpyxl JSON conversion
# ---------------------------------------------------------------------------

def _convert_to_json(data: bytes, job_id: Optional[str]) -> bytes:
    """Convert XLSX bytes to JSON using openpyxl; return UTF-8 bytes."""
    try:
        import openpyxl
    except ImportError as exc:
        raise RuntimeError(
            "openpyxl is required for XLSX → JSON conversion. "
            "Install it with: pip install openpyxl"
        ) from exc

    _report(job_id, 20)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        input_doc = tmp_path / "input.xlsx"
        input_doc.write_bytes(data)

        _report(job_id, 40)

        wb = openpyxl.load_workbook(str(input_doc), read_only=True, data_only=True)
        result: dict = {}

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                result[sheet_name] = []
                continue

            headers = [str(h) if h is not None else f"col_{i}" for i, h in enumerate(rows[0])]
            records = []
            for row in rows[1:]:
                record = {}
                for header, cell in zip(headers, row):
                    record[header] = cell
                records.append(record)
            result[sheet_name] = records

        wb.close()

    _report(job_id, 90)
    return json.dumps(result, ensure_ascii=False, default=str, indent=2).encode("utf-8")


# ---------------------------------------------------------------------------
# Main public conversion entry point
# ---------------------------------------------------------------------------

def convert_xlsx(
    data: bytes,
    target_format: str,
    job_id: Optional[str] = None,
) -> bytes:
    """
    Convert XLSX bytes to *target_format* (non-CSV targets only).

    For CSV use convert_xlsx_csv() which returns the correct filename too.

    Parameters
    ----------
    data          : raw bytes of the .xlsx file
    target_format : one of "pdf", "html", "ods", "txt", "json"
    job_id        : optional SSE job id for progress reporting

    Returns
    -------
    bytes — the converted file content

    Raises
    ------
    ValueError   — unsupported target format or "csv" (use convert_xlsx_csv)
    RuntimeError — engine unavailable or conversion failure
    """
    fmt = target_format.lower().lstrip(".")

    if fmt == "csv":
        raise ValueError(
            "Use convert_xlsx_csv() for CSV conversion — it returns the "
            "correct filename (single CSV or ZIP for multi-sheet files)."
        )

    if fmt not in (_LO_TARGETS | _PY_TARGETS):
        raise ValueError(
            f"Unsupported target format '{fmt}'. "
            f"Supported: {', '.join(sorted(_LO_TARGETS | _PY_TARGETS))}"
        )

    _report(job_id, 10)

    if fmt in _LO_TARGETS:
        return _convert_with_libreoffice(data, fmt, job_id)
    else:
        return _convert_to_json(data, job_id)


def convert_xlsx_csv(
    data: bytes,
    stem: str,
    job_id: Optional[str] = None,
) -> Tuple[bytes, str, str]:
    """
    Convert XLSX bytes to CSV, handling multi-sheet files automatically.

    Parameters
    ----------
    data   : raw bytes of the .xlsx file
    stem   : base filename without extension (used to name the output files)
    job_id : optional SSE job id for progress reporting

    Returns
    -------
    (content_bytes, media_type, filename)
      Single sheet  → plain CSV  — ("text/csv; charset=utf-8",  "<stem>.csv")
      Multiple sheets → ZIP      — ("application/zip",          "<stem>_csv.zip")
    """
    _report(job_id, 10)
    return _convert_to_csv(data, stem, job_id)
