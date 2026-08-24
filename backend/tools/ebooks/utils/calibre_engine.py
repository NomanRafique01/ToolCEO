"""
calibre_engine.py — Shared Calibre utility for ToolCEO eBook conversions
=========================================================================

All Calibre logic lives here.  Route files must not contain any Calibre-
specific code; they only call the public API exposed by this module.

Public API
----------
get_calibre_binary()
    Resolve the ebook-convert binary for the current OS.
    Priority:  bundled binary  →  system PATH.

validate_formats(input_fmt, output_fmt)
    Raise ValueError if the conversion pair is not supported.

run_conversion(input_path, output_path, target_format, original_stem="")
    Run ``ebook-convert`` and return the subprocess.Popen handle so the
    caller can stream progress via stream_progress().

stream_progress(process)
    Parse Calibre stdout and yield integer progress percentages (0-100).
    For EPUB output, calls fix_epub_html_titles() after conversion completes.

fix_epub_html_titles(epub_path, clean_title)
    Post-process an EPUB zip, replacing leaked temp paths in every HTML/XHTML
    <title> tag with the clean original filename stem.

extract_pdf_cover(pdf_path, dest_dir)
    Render the first page of a PDF as a JPEG and return the path.
    Returns None if PyMuPDF is not available or extraction fails.

cleanup_temp_files(*paths)
    Silently delete each path (file or directory) if it exists.

Binary locations (bundled)
--------------------------
  Windows : resources/calibre/win/ebook-convert.exe
  Linux   : resources/calibre/linux/ebook-convert
  macOS   : resources/calibre/mac/ebook-convert

OS detection is done via platform.system() — never hardcoded.
"""

from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Generator, Optional

# ---------------------------------------------------------------------------
# Sentinel object returned by run_conversion for the PDF→EPUB fast-path
# ---------------------------------------------------------------------------

class _AlreadyDoneProcess:
    """
    Mimics the subset of subprocess.Popen that stream_progress() requires,
    but for conversions that have already completed synchronously.

    stream_progress() will immediately yield 100 and skip all Calibre-specific
    post-processing (title patching is not needed — our engine builds correct
    <title> tags directly).
    """
    returncode: int = 0
    stdout = None

    # Attributes normally set by run_conversion on real Popen objects.
    _toolceo_clean_input: Optional[str] = None
    _toolceo_cover_path:  Optional[str] = None
    _toolceo_output_path: str = ""
    _toolceo_target_fmt:  str = ""
    _toolceo_title:       str = ""
    _toolceo_already_done: bool = True   # sentinel flag

    def wait(self) -> int:
        return 0

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supported conversion matrix
# ---------------------------------------------------------------------------

# Maps each source format to the set of valid target formats.
_SUPPORTED: dict[str, set[str]] = {
    "pdf":  {"epub", "mobi", "azw3", "fb2", "txt", "rtf"},
    "epub": {"pdf",  "mobi", "azw3", "fb2", "txt", "rtf"},
    "mobi": {"pdf",  "epub", "azw3", "fb2", "txt", "rtf"},
    "azw3": {"pdf",  "epub", "mobi", "fb2", "txt"},
    "fb2":  {"pdf",  "epub", "mobi", "txt", "rtf"},
    "txt":  {"pdf",  "epub", "mobi", "rtf"},
    "rtf":  {"pdf",  "epub", "mobi", "txt"},
}

# Subprocess timeout for Calibre conversion (seconds).
_CALIBRE_TIMEOUT = 300

# Regex that matches Calibre's progress lines where the percentage appears at
# the START of the line (with optional leading whitespace), e.g.:
#   "1% Converting input to HTML..."
#   "  34% Running transforms..."
# This intentionally does NOT match mid-line occurrences such as
#   "Detected input encoding as ascii with a confidence of 100%"
# which would otherwise cause the progress to jump to 99 immediately.
_PROGRESS_RE = re.compile(r"^\s*(\d{1,3})\s*%")


# ---------------------------------------------------------------------------
# Binary resolution
# ---------------------------------------------------------------------------

def get_calibre_binary() -> Optional[str]:
    """
    Return the absolute path to the ``ebook-convert`` binary.

    Search order:
    1. Bundled binary shipped alongside the app under ``resources/calibre/``.
    2. System PATH (useful for developer machines / server installs).

    Returns None when Calibre cannot be found on this host.
    """
    system = platform.system()

    # Locate the project root so bundled paths stay relative regardless of
    # the working directory the server is started from.
    _here = Path(__file__).resolve().parent.parent.parent  # repo root

    if system == "Windows":
        bundled = _here / "resources" / "calibre" / "win" / "ebook-convert.exe"
        path_name = "ebook-convert.exe"
    elif system == "Darwin":
        bundled = _here / "resources" / "calibre" / "mac" / "ebook-convert"
        path_name = "ebook-convert"
    else:
        # Linux and any other POSIX system
        bundled = _here / "resources" / "calibre" / "linux" / "ebook-convert"
        path_name = "ebook-convert"

    if bundled.exists():
        _log.debug("Using bundled Calibre binary: %s", bundled)
        return str(bundled)

    found = shutil.which(path_name)
    if found:
        _log.debug("Using system Calibre binary: %s", found)
        return found

    _log.warning("ebook-convert not found (bundled path: %s)", bundled)
    return None


# ---------------------------------------------------------------------------
# Format validation
# ---------------------------------------------------------------------------

def validate_formats(input_fmt: str, output_fmt: str) -> None:
    """
    Raise ValueError if *input_fmt* → *output_fmt* is not a supported pair.

    Both arguments are normalised to lower-case before the check.
    """
    src = input_fmt.lower().lstrip(".")
    dst = output_fmt.lower().lstrip(".")

    if src not in _SUPPORTED:
        raise ValueError(
            f"Unsupported source format '{src}'. "
            f"Supported sources: {sorted(_SUPPORTED)}"
        )
    if dst not in _SUPPORTED[src]:
        raise ValueError(
            f"Cannot convert '{src}' → '{dst}'. "
            f"Allowed targets for '{src}': {sorted(_SUPPORTED[src])}"
        )


# ---------------------------------------------------------------------------
# Conversion runner
# ---------------------------------------------------------------------------

def run_conversion(
    input_path: Path,
    output_path: Path,
    target_format: str,
    original_stem: str = "",
):
    """
    Launch the appropriate conversion process and return a handle that
    :func:`stream_progress` can consume.

    For all conversions **except PDF → EPUB** this launches Calibre's
    ``ebook-convert`` as a subprocess and returns the ``Popen`` handle.

    For **PDF → EPUB** the custom semantic engine
    (:mod:`tools.ebooks.utils.pdf_epub_engine`) is used instead, which
    preserves headings, tables, lists, inline styles, and code blocks.
    In this case the conversion runs synchronously and an
    :class:`_AlreadyDoneProcess` sentinel is returned so that
    :func:`stream_progress` sees a completed process and simply yields 100.

    Raises RuntimeError if Calibre is required but cannot be found.
    """
    input_fmt  = Path(input_path).suffix.lstrip(".").lower()
    output_fmt = target_format.lower()

    title = original_stem if original_stem else os.path.splitext(
        os.path.basename(str(input_path))
    )[0]

    # ── PDF → EPUB: use our custom semantic engine ────────────────────────
    if input_fmt == "pdf" and output_fmt == "epub":
        from tools.ebooks.utils.pdf_epub_engine import convert_pdf_to_epub

        # Extract cover image from first page (best-effort).
        cover_dir  = tempfile.gettempdir()
        cover_path = extract_pdf_cover(str(input_path), cover_dir)

        try:
            convert_pdf_to_epub(
                pdf_path=str(input_path),
                epub_path=str(output_path),
                title=title,
                cover_path=cover_path,
            )
        finally:
            if cover_path:
                cleanup_temp_files(cover_path)

        proc = _AlreadyDoneProcess()
        proc._toolceo_output_path = str(output_path)
        proc._toolceo_target_fmt  = "epub"
        proc._toolceo_title       = title
        return proc

    # ── All other conversions: delegate to Calibre ────────────────────────
    binary = get_calibre_binary()
    if not binary:
        raise RuntimeError(
            "Calibre's ebook-convert was not found on this system. "
            "Please install Calibre (https://calibre-ebook.com/download) "
            "or place the bundled binary under resources/calibre/<platform>/."
        )

    # Copy the input to a clean, neutral filename so that Calibre does not
    # embed the random temp path (e.g. toolceo_ebook_oqf4acxy\input.pdf) into
    # the converted output.
    input_ext = Path(input_path).suffix  # includes the leading dot, e.g. ".pdf"
    clean_input_path = os.path.join(tempfile.gettempdir(), f"input{input_ext}")
    shutil.copy(str(input_path), clean_input_path)
    _log.debug("Copied input to clean path: %s", clean_input_path)

    cmd = [
        binary,
        clean_input_path,
        str(output_path),
        "--title", title,
        "--authors", "Unknown",
    ]

    cmd.append("-v")
    _log.debug("Calibre command: %s", " ".join(cmd))

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,   # merge stderr into stdout for unified parsing
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    # Attach context so stream_progress can perform post-processing and cleanup
    # after conversion completes, without changing the public function signature.
    process._toolceo_clean_input  = clean_input_path   # type: ignore[attr-defined]
    process._toolceo_cover_path   = None                # type: ignore[attr-defined]
    process._toolceo_output_path  = str(output_path)   # type: ignore[attr-defined]
    process._toolceo_target_fmt   = target_format.lower()  # type: ignore[attr-defined]
    process._toolceo_title        = title               # type: ignore[attr-defined]
    return process


# ---------------------------------------------------------------------------
# Progress streaming
# ---------------------------------------------------------------------------

def stream_progress(process) -> Generator[int, None, None]:
    """
    Read *process* stdout line by line, parse Calibre's ``NN%`` markers and
    yield integer progress values (0-100).

    When *process* is an :class:`_AlreadyDoneProcess` (PDF→EPUB fast-path),
    there is no subprocess to read — this function simply yields 100
    immediately.

    Calibre only emits a handful of sparse checkpoints (e.g. 1%, 34%, 67%).
    Each real checkpoint is yielded immediately; the caller is responsible for
    filling in smooth intermediate ticks between checkpoints (see router.py).

    Waits for the process to finish and raises RuntimeError if the exit code
    is non-zero.
    """
    # Fast-path: custom engine already produced the output synchronously.
    if getattr(process, "_toolceo_already_done", False):
        yield 100
        return

    last_pct = 0

    if process.stdout:
        for line in process.stdout:
            line = line.rstrip()
            if line:
                _log.debug("calibre: %s", line)
            match = _PROGRESS_RE.search(line)
            if match:
                pct = min(int(match.group(1)), 99)  # reserve 100 for completion
                if pct > last_pct:
                    last_pct = pct
                    yield pct

    process.wait()

    # Clean up the neutral-named input copy and any extracted cover image.
    clean_input = getattr(process, "_toolceo_clean_input", None)
    if clean_input:
        cleanup_temp_files(clean_input)
    cover_path = getattr(process, "_toolceo_cover_path", None)
    if cover_path:
        cleanup_temp_files(cover_path)

    if process.returncode != 0:
        raise RuntimeError(
            f"ebook-convert exited with code {process.returncode}. "
            "Check that the input file is a valid eBook and not corrupted."
        )

    # Post-process EPUB output to scrub any residual temp paths from HTML titles.
    # (Only needed for Calibre output — our custom engine sets titles correctly.)
    if getattr(process, "_toolceo_target_fmt", "") == "epub":
        fix_epub_html_titles(
            getattr(process, "_toolceo_output_path", ""),
            getattr(process, "_toolceo_title", ""),
        )

    yield 100


# ---------------------------------------------------------------------------
# PDF cover extractor
# ---------------------------------------------------------------------------

def extract_pdf_cover(pdf_path: str, dest_dir: str) -> Optional[str]:
    """
    Render the first page of *pdf_path* as a JPEG and save it in *dest_dir*.

    Uses PyMuPDF (``import fitz``) which is already a dependency of this
    project.  Returns the absolute path to the cover JPEG on success, or
    ``None`` if extraction fails for any reason (missing library, encrypted
    PDF, etc.).  Failures are logged at DEBUG level and never propagate.
    """
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(pdf_path)
        page = doc.load_page(0)
        # Render at 2× scale for a sharp cover image (≈ 1240×1754 for A4)
        mat  = fitz.Matrix(2.0, 2.0)
        pix  = page.get_pixmap(matrix=mat, alpha=False)
        doc.close()

        cover_path = os.path.join(dest_dir, "cover.jpg")
        pix.save(cover_path)
        _log.debug("Extracted PDF cover to %s (%dx%d)", cover_path, pix.width, pix.height)
        return cover_path
    except Exception as exc:  # noqa: BLE001
        _log.debug("extract_pdf_cover: failed for %s: %s", pdf_path, exc)
        return None


# ---------------------------------------------------------------------------
# EPUB HTML title post-processor
# ---------------------------------------------------------------------------

def fix_epub_html_titles(epub_path: str, clean_title: str) -> None:
    """
    Post-process a Calibre-produced EPUB to remove leaked temp file paths.

    Calibre correctly sets the EPUB metadata title (``content.opf``) when
    ``--title`` is supplied, but still writes the raw input file path into the
    ``<title>`` tag of every generated HTML/XHTML section file.  This function
    rewrites those tags in-place using a zip-swap so the original file is only
    replaced on success.

    Parameters
    ----------
    epub_path:
        Absolute path to the ``.epub`` file produced by Calibre.
    clean_title:
        The stem to write into every ``<title>`` tag
        (e.g. ``"Weekly_Assignment"``).

    Raises
    ------
    Exception
        Any error that occurs during rewriting is re-raised after the
        temporary zip is deleted so no corrupt file is ever left on disk.
    """
    if not epub_path or not os.path.exists(epub_path):
        _log.debug("fix_epub_html_titles: epub not found at %s — skipping", epub_path)
        return

    temp_epub = epub_path + "_patching.epub"
    try:
        with zipfile.ZipFile(epub_path, "r") as zin:
            with zipfile.ZipFile(temp_epub, "w", zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    if item.filename.endswith(".html") or item.filename.endswith(".xhtml"):
                        text = data.decode("utf-8", errors="replace")
                        text = re.sub(
                            r"<title>[^<]*</title>",
                            f"<title>{clean_title}</title>",
                            text,
                        )
                        data = text.encode("utf-8")
                    zout.writestr(item, data)
        os.replace(temp_epub, epub_path)
        _log.debug("fix_epub_html_titles: patched %s with title %r", epub_path, clean_title)
    except Exception:
        if os.path.exists(temp_epub):
            os.remove(temp_epub)
        raise


# ---------------------------------------------------------------------------
# Temp file cleanup
# ---------------------------------------------------------------------------

def cleanup_temp_files(*paths: Path | str) -> None:
    """
    Silently remove each supplied path.

    Accepts both file paths and directories.  Never raises — failures are
    logged at DEBUG level so they do not interrupt the response.
    """
    import shutil as _shutil

    for p in paths:
        target = Path(p)
        try:
            if target.is_dir():
                _shutil.rmtree(target, ignore_errors=True)
            elif target.exists():
                target.unlink(missing_ok=True)
        except Exception as exc:  # noqa: BLE001
            _log.debug("cleanup_temp_files: could not remove %s: %s", target, exc)
