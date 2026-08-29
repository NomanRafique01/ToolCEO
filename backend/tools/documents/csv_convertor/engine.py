"""
CSV conversion engine — ToolCEO
==================================

Supported conversions
---------------------
  csv → json  : pandas   df.to_json(orient='records', indent=2)
  csv → xlsx  : pandas + openpyxl   df.to_excel(index=False)
  csv → html  : pandas   df.to_html(index=False, border=1)
  csv → md    : pandas + tabulate   df.to_markdown(index=False)
  csv → pdf   : pandas + LibreOffice  (xlsx intermediate, then soffice --convert-to pdf)
  csv → txt   : plain Python   write CSV content as-is to .txt
  csv → xml   : pandas   df.to_xml(index=False)
  csv → sql   : pandas   generate CREATE TABLE + INSERT INTO statements

Public API
----------
convert_csv(data, target_format, job_id, source_filename)
    Returns the converted bytes.
    Raises RuntimeError if the required engine is unavailable.

get_csv_info(data)
    Returns { "file_size": int }
"""

from __future__ import annotations

import io
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from platform_tools import find_libreoffice, install_message

_log = logging.getLogger(__name__)

# Subprocess timeout for LibreOffice conversions (seconds)
_LO_TIMEOUT = 300

# Targets dispatched to LibreOffice (via XLSX intermediate)
_LO_TARGETS = {"pdf"}

# Targets handled by pandas directly
_PANDAS_TARGETS = {"json", "xlsx", "html", "md", "txt", "xml", "sql"}

# Media-type per target (used by router)
MEDIA_TYPES = {
    "json": "application/json; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "html": "text/html; charset=utf-8",
    "md":   "text/markdown; charset=utf-8",
    "pdf":  "application/pdf",
    "txt":  "text/plain; charset=utf-8",
    "xml":  "application/xml; charset=utf-8",
    "sql":  "text/plain; charset=utf-8",
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

def get_csv_info(data: bytes) -> dict:
    """Returns basic file metadata — file_size only."""
    return {"file_size": len(data)}


# ---------------------------------------------------------------------------
# Internal: read CSV bytes into a DataFrame
# ---------------------------------------------------------------------------

def _read_csv(data: bytes):
    """
    Parse CSV bytes into a pandas DataFrame.
    Falls back from utf-8 to latin-1 on decode errors.
    """
    import pandas as pd  # local import — pandas may not be installed everywhere

    try:
        return pd.read_csv(io.BytesIO(data), encoding="utf-8")
    except UnicodeDecodeError:
        return pd.read_csv(io.BytesIO(data), encoding="latin-1")


# ---------------------------------------------------------------------------
# Internal: pandas-based conversions
# ---------------------------------------------------------------------------

def _convert_with_pandas(data: bytes, fmt: str, job_id: Optional[str], table_name: str) -> bytes:
    """Convert CSV bytes to *fmt* using pandas; return output bytes."""
    _report(job_id, 20)
    df = _read_csv(data)
    _report(job_id, 50)

    if fmt == "json":
        result = df.to_json(orient="records", indent=2)
        _report(job_id, 90)
        return result.encode("utf-8")

    if fmt == "xlsx":
        buf = io.BytesIO()
        df.to_excel(buf, index=False, engine="openpyxl")
        _report(job_id, 90)
        return buf.getvalue()

    if fmt == "html":
        result = df.to_html(index=False, border=1)
        _report(job_id, 90)
        return result.encode("utf-8")

    if fmt == "md":
        try:
            result = df.to_markdown(index=False) or ""
        except ImportError:
            raise RuntimeError(
                "The 'tabulate' package is required for Markdown export. "
                "Install it with: pip install tabulate"
            )
        _report(job_id, 90)
        return (result or "").encode("utf-8")

    if fmt == "txt":
        _report(job_id, 90)
        return data  # write CSV content as-is to .txt

    if fmt == "xml":
        result = df.to_xml(index=False)
        _report(job_id, 90)
        return result.encode("utf-8")

    if fmt == "sql":
        sql_lines = _generate_sql(df, table_name)
        _report(job_id, 90)
        return sql_lines.encode("utf-8")

    raise ValueError(f"Unsupported pandas target format: {fmt}")


def _generate_sql(df, table_name: str) -> str:
    """Generate CREATE TABLE + INSERT INTO SQL statements from a DataFrame."""
    import pandas as pd

    # Build column type map
    def _sql_type(dtype) -> str:
        if pd.api.types.is_integer_dtype(dtype):
            return "INTEGER"
        if pd.api.types.is_float_dtype(dtype):
            return "REAL"
        return "TEXT"

    safe_table = _quote_ident(table_name)
    col_defs = ", ".join(
        f"{_quote_ident(str(col))} {_sql_type(dtype)}"
        for col, dtype in zip(df.columns, df.dtypes)
    )
    lines = [f"CREATE TABLE IF NOT EXISTS {safe_table} ({col_defs});", ""]

    for _, row in df.iterrows():
        vals = []
        for v in row:
            if v is None or (isinstance(v, float) and __import__("math").isnan(v)):
                vals.append("NULL")
            elif isinstance(v, (int, float)):
                vals.append(str(v))
            else:
                escaped = str(v).replace("'", "''")
                vals.append(f"'{escaped}'")
        col_names = ", ".join(_quote_ident(str(c)) for c in df.columns)
        lines.append(f"INSERT INTO {safe_table} ({col_names}) VALUES ({', '.join(vals)});")

    return "\n".join(lines) + "\n"


def _quote_ident(name: str) -> str:
    """Double-quote an SQL identifier, escaping embedded double quotes."""
    return '"' + name.replace('"', '""') + '"'


# ---------------------------------------------------------------------------
# Internal: LibreOffice-based PDF conversion (via XLSX intermediate)
# ---------------------------------------------------------------------------

def _convert_to_pdf(data: bytes, job_id: Optional[str]) -> bytes:
    """Convert CSV → XLSX → PDF using LibreOffice; return PDF bytes."""
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError(install_message("libreoffice"))

    _report(job_id, 20)

    # Step 1: CSV → XLSX (pandas) with landscape + fit-to-page tuning
    df = _read_csv(data)
    xlsx_buf = io.BytesIO()
    df.to_excel(xlsx_buf, index=False, engine="openpyxl")

    # Re-open with openpyxl to apply print layout so LibreOffice renders it correctly
    import openpyxl
    from openpyxl.styles import Font
    from openpyxl.worksheet.page import PageMargins

    xlsx_buf.seek(0)
    wb = openpyxl.load_workbook(xlsx_buf)
    ws = wb.active

    # Landscape orientation + fit all columns onto one page wide
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToPage   = True
    ws.page_setup.fitToWidth  = 1   # fit all columns on 1 page wide
    ws.page_setup.fitToHeight = 0   # allow as many rows as needed
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    # Tight margins so more content fits
    ws.page_margins = PageMargins(
        left=0.4, right=0.4, top=0.5, bottom=0.5, header=0.2, footer=0.2
    )

    # Reduce font size to 8pt so wide tables fit without truncation
    small_font = Font(size=8)
    for row in ws.iter_rows():
        for cell in row:
            cell.font = small_font

    # Auto-size each column based on content (capped at 30 chars)
    for col_cells in ws.columns:
        max_len = max(
            (len(str(cell.value)) if cell.value is not None else 0)
            for cell in col_cells
        )
        ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 2, 30)

    tuned_buf = io.BytesIO()
    wb.save(tuned_buf)
    xlsx_bytes = tuned_buf.getvalue()
    _report(job_id, 40)

    # Step 2: XLSX → PDF (LibreOffice)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path   = Path(tmp)
        input_xlsx = tmp_path / "input.xlsx"
        input_xlsx.write_bytes(xlsx_bytes)

        cmd = [
            soffice,
            "--headless",
            "--norestore",
            "--nofirststartwizard",
            "--convert-to", "pdf",
            "--outdir", str(tmp_path),
            str(input_xlsx),
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

        _report(job_id, 85)

        output_pdf = tmp_path / "input.pdf"
        if not output_pdf.exists():
            candidates = list(tmp_path.glob("*.pdf"))
            if not candidates:
                raise RuntimeError("LibreOffice did not produce a .pdf output file.")
            output_pdf = candidates[0]

        _report(job_id, 90)
        return output_pdf.read_bytes()


# ---------------------------------------------------------------------------
# Main public conversion entry point
# ---------------------------------------------------------------------------

def convert_csv(
    data: bytes,
    target_format: str,
    job_id: Optional[str] = None,
    source_filename: str = "data",
) -> bytes:
    """
    Convert CSV bytes to *target_format*.

    Parameters
    ----------
    data            : raw bytes of the .csv file
    target_format   : one of "json", "xlsx", "html", "md", "pdf", "txt", "xml", "sql"
    job_id          : optional SSE job id for progress reporting
    source_filename : original filename stem, used as the SQL table name

    Returns
    -------
    bytes — the converted file content

    Raises
    ------
    ValueError   — unsupported target format
    RuntimeError — engine unavailable or conversion failure
    """
    fmt = target_format.lower().lstrip(".")

    if fmt not in (_LO_TARGETS | _PANDAS_TARGETS):
        raise ValueError(
            f"Unsupported target format '{fmt}'. "
            f"Supported: {', '.join(sorted(_LO_TARGETS | _PANDAS_TARGETS))}"
        )

    _report(job_id, 10)

    if fmt in _LO_TARGETS:
        return _convert_to_pdf(data, job_id)
    else:
        return _convert_with_pandas(data, fmt, job_id, source_filename)
