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

    Special fast-paths (bypass Calibre entirely):
      PDF → EPUB  — custom semantic engine (pdf_epub_engine)
      PDF → TXT   — custom semantic engine with ASCII table rendering
      PDF → MOBI/AZW3 — semantic HTML intermediary fed to Calibre

stream_progress(process)
    Parse Calibre stdout and yield integer progress percentages (0-100).
    For EPUB output, calls fix_epub_html_titles() after conversion completes.
    For MOBI/AZW3 → EPUB, also calls fix_mobi_html_in_epub() to repair
    structural artefacts left by Calibre's MOBI extractor.

fix_epub_html_titles(epub_path, clean_title)
    Post-process an EPUB zip, replacing leaked temp paths in every HTML/XHTML
    <title> tag with the clean original filename stem.

fix_mobi_extracted_html(html)
    Fix structural HTML artefacts that Calibre's MOBI extractor commonly
    produces:
      1. Merged title+heading in a single <p>/<b> tag → split into <h1>/<h2>.
      2. <tt>/<code> wrapped in <font size="1"> → remove the font-size wrapper.

fix_mobi_html_in_epub(epub_path)
    Apply fix_mobi_extracted_html() to every HTML/XHTML entry inside the
    EPUB zip in-place.

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
import zipfile
from pathlib import Path
from typing import Generator, Optional
from xml.sax.saxutils import escape as _xml_escape

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
    _toolceo_source_fmt:  str = ""
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
    "azw3": {"pdf",  "epub", "mobi", "fb2", "txt", "rtf"},
    "fb2":  {"pdf",  "epub", "mobi", "txt", "rtf", "azw3"},
    "txt":  {"pdf",  "epub", "mobi", "rtf", "fb2", "azw3"},
    "rtf":  {"pdf",  "epub", "mobi", "txt", "fb2", "azw3"},
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
# Calibre process environment
# ---------------------------------------------------------------------------

def _repo_runtime_dir() -> Path:
    """Return ToolCEO's repo-local runtime directory."""
    return Path(__file__).resolve().parents[4] / ".runtime" / "ebooks"


def get_ebook_runtime_dir() -> Path:
    """Return the writable repo-local runtime directory for ebook jobs."""
    root = _repo_runtime_dir()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _calibre_work_dir(output_path: Path) -> Path:
    """Return a writable per-job directory for Calibre temp/config/cache files."""
    try:
        output_parent = Path(output_path).resolve().parent
        output_parent.mkdir(parents=True, exist_ok=True)
        probe = output_parent / ".toolceo_write_probe"
        probe.write_text("", encoding="utf-8")
        probe.unlink(missing_ok=True)
        base = output_parent / ".calibre-runtime"
    except OSError:
        base = _repo_runtime_dir() / ".calibre-runtime"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _calibre_env(output_path: Path) -> dict[str, str]:
    """
    Build an environment that keeps Calibre writes inside the conversion folder.

    The bundled Windows Calibre can fail with PermissionError when it tries to
    create temp/config files in the user profile.  Pointing all Calibre runtime
    locations at the job temp directory keeps conversions portable in Electron,
    tests, and restricted worker environments.
    """
    work_dir = _calibre_work_dir(output_path)
    env = os.environ.copy()
    env.update(
        {
            "CALIBRE_CONFIG_DIRECTORY": str(work_dir / "config"),
            "CALIBRE_CACHE_DIRECTORY": str(work_dir / "cache"),
            "TMP": str(work_dir / "tmp"),
            "TEMP": str(work_dir / "tmp"),
        }
    )
    for key in ("CALIBRE_CONFIG_DIRECTORY", "CALIBRE_CACHE_DIRECTORY", "TMP"):
        Path(env[key]).mkdir(parents=True, exist_ok=True)
    return env


def _write_simple_epub_from_text(txt_path: Path, epub_path: Path, title: str) -> None:
    """Create a small valid EPUB3 from a plain text file without Calibre."""
    raw = txt_path.read_text(encoding="utf-8", errors="replace")
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", raw) if p.strip()]
    if not paragraphs:
        paragraphs = [raw.strip() or title]

    body = "\n".join(f"    <p>{_xml_escape(p)}</p>" for p in paragraphs)
    title_xml = _xml_escape(title or txt_path.stem)
    content = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>{title_xml}</title>
  <link rel="stylesheet" type="text/css" href="../styles/main.css"/>
</head>
<body>
  <h1>{title_xml}</h1>
{body}
</body>
</html>
"""
    nav = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>{title_xml}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>{title_xml}</h1>
    <ol><li><a href="content.xhtml">{title_xml}</a></li></ol>
  </nav>
</body>
</html>
"""
    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">toolceo-{_xml_escape(txt_path.stem)}</dc:identifier>
    <dc:title>{title_xml}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-09-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="Text/content.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles/main.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>
"""
    css = "body { font-family: serif; line-height: 1.5; margin: 1em; }\np { margin: 0 0 1em; }\n"

    with zipfile.ZipFile(epub_path, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        zf.writestr("META-INF/container.xml", """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
""")
        zf.writestr("OEBPS/content.opf", opf)
        zf.writestr("OEBPS/Text/content.xhtml", content)
        zf.writestr("OEBPS/Text/nav.xhtml", nav)
        zf.writestr("OEBPS/styles/main.css", css)


# ---------------------------------------------------------------------------
# Binary resolution
# ---------------------------------------------------------------------------

def get_calibre_binary() -> Optional[str]:
    """
    Return the absolute path to the ``ebook-convert`` binary.

    Search order:
    1. platform_tools.find_calibre() (checks engines/calibre/ and installed paths)
    2. Bundled binary shipped alongside the app under ``resources/calibre/``.
    3. System PATH (useful for developer machines / server installs).

    Returns None when Calibre cannot be found on this host.
    """
    try:
        from platform_tools import find_calibre
        calibre_path = find_calibre()
        if calibre_path:
            return calibre_path
    except Exception:
        pass

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
    progress_cb=None,
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
        cover_dir  = str(_calibre_work_dir(output_path))
        cover_path = extract_pdf_cover(str(input_path), cover_dir)

        # _progress_values collects callbacks emitted during conversion so that
        # stream_progress() can yield them one by one after run_conversion returns.
        # We use a list because the conversion runs synchronously here; the
        # router's tween thread will fill the gaps between real checkpoints.
        _progress_values: list[int] = []

        def _on_progress(pct: int) -> None:
            pct = int(pct)
            _progress_values.append(pct)
            if callable(progress_cb):
                progress_cb(pct)

        try:
            convert_pdf_to_epub(
                pdf_path=str(input_path),
                epub_path=str(output_path),
                title=title,
                cover_path=cover_path,
                progress_cb=_on_progress,
            )
        finally:
            if cover_path:
                cleanup_temp_files(cover_path)

        proc = _AlreadyDoneProcess()
        proc._toolceo_output_path   = str(output_path)
        proc._toolceo_target_fmt    = "epub"
        proc._toolceo_title         = title
        proc._toolceo_progress_log  = _progress_values  # consumed by stream_progress
        return proc

    # ── PDF → TXT: use our custom semantic engine ─────────────────────────
    # Calibre's built-in PDF→TXT path flattens tables into a stream of
    # unaligned tokens.  Our engine reconstructs semantic blocks (tables,
    # headings, code, lists) and renders tables as ASCII grid tables.
    if input_fmt == "pdf" and output_fmt == "txt":
        from tools.ebooks.utils.pdf_epub_engine import convert_pdf_to_txt

        _progress_values_txt: list[int] = []

        def _on_progress_txt(pct: int) -> None:
            pct = int(pct)
            _progress_values_txt.append(pct)
            if callable(progress_cb):
                progress_cb(pct)

        convert_pdf_to_txt(
            pdf_path=str(input_path),
            txt_path=str(output_path),
            title=title,
            progress_cb=_on_progress_txt,
        )

        proc = _AlreadyDoneProcess()
        proc._toolceo_output_path  = str(output_path)
        proc._toolceo_target_fmt   = "txt"
        proc._toolceo_source_fmt   = "pdf"
        proc._toolceo_title        = title
        proc._toolceo_progress_log = _progress_values_txt
        return proc

    # ── PDF → MOBI/AZW3: structured HTML intermediary → Calibre ──────────
    # Feed our semantic HTML (tables, code blocks, proper headings) to Calibre
    # instead of the raw PDF; this prevents Calibre from flattening tables and
    # losing monospace code formatting.
    if input_fmt == "pdf" and output_fmt in ("mobi", "azw3"):
        from tools.ebooks.utils.pdf_epub_engine import convert_pdf_to_epub

        binary = get_calibre_binary()
        if not binary:
            raise RuntimeError(
                "Calibre's ebook-convert was not found on this system. "
                "Please install Calibre (https://calibre-ebook.com/download) "
                "or place the bundled binary under resources/calibre/<platform>/."
            )

        work_dir = _calibre_work_dir(output_path)
        epub_tmp = work_dir / f"pdf_bridge_{os.getpid()}.epub"
        cover_tmp = extract_pdf_cover(str(input_path), str(work_dir))

        _progress_values_mobi: list[int] = []

        def _on_progress_mobi(pct: int) -> None:
            mapped = int(pct * 0.5)
            _progress_values_mobi.append(mapped)
            if callable(progress_cb):
                progress_cb(mapped)

        try:
            convert_pdf_to_epub(
                pdf_path=str(input_path),
                epub_path=str(epub_tmp),
                title=title,
                cover_path=cover_tmp,
                progress_cb=_on_progress_mobi,
            )

            cmd: list[str] = [
                binary,
                str(epub_tmp),
                str(output_path),
                "--title", title,
                "--authors", "Unknown",
                "--no-inline-toc",
                "--chapter", "/",
                "--page-breaks-before", "/",
                "--output-profile", "kindle",
                "-v",
            ]
            # --mobi-file-type is only valid for MOBI output, not AZW3.
            if output_fmt == "mobi":
                cmd += ["--mobi-file-type", "both"]

            _log.debug("Calibre (PDF→%s via HTML) command: %s", output_fmt.upper(), " ".join(cmd))
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=_calibre_env(output_path),
                timeout=_CALIBRE_TIMEOUT,
            )
            if result.returncode != 0:
                _log.debug("calibre output:\n%s", result.stdout)
                raise RuntimeError(
                    f"ebook-convert exited with code {result.returncode}. "
                    "Check that the input file is valid and not corrupted."
                )
            _progress_values_mobi.append(95)
        finally:
            cleanup_temp_files(epub_tmp)
            if cover_tmp:
                cleanup_temp_files(cover_tmp)

        proc = _AlreadyDoneProcess()
        proc._toolceo_output_path  = str(output_path)
        proc._toolceo_target_fmt   = output_fmt
        proc._toolceo_title        = title
        proc._toolceo_progress_log = _progress_values_mobi
        return proc

    # ── TXT input: native TXT → EPUB bridge, then Calibre if needed ─────────
    # Calibre's TXT/HTML input plugin calls Windows long-path APIs that can
    # fail with PermissionError inside the desktop app sandbox.  Building a
    # minimal EPUB ourselves avoids that fragile input path while keeping every
    # TXT target available.
    if input_fmt == "txt":
        _progress_values_txt_bridge: list[int] = [10]

        if output_fmt == "epub":
            _write_simple_epub_from_text(Path(input_path), Path(output_path), title)
            if callable(progress_cb):
                progress_cb(95)
            proc = _AlreadyDoneProcess()
            proc._toolceo_output_path = str(output_path)
            proc._toolceo_target_fmt = "epub"
            proc._toolceo_title = title
            proc._toolceo_progress_log = [10, 95]
            return proc

        binary = get_calibre_binary()
        if not binary:
            raise RuntimeError(
                "Calibre's ebook-convert was not found on this system. "
                "Please install Calibre (https://calibre-ebook.com/download) "
                "or place the bundled binary under resources/calibre/<platform>/."
            )

        work_dir = _calibre_work_dir(output_path)
        epub_tmp = work_dir / f"txt_bridge_{os.getpid()}.epub"
        try:
            _write_simple_epub_from_text(Path(input_path), epub_tmp, title)
            _progress_values_txt_bridge.append(40)
            if callable(progress_cb):
                progress_cb(40)
            cmd = [
                binary,
                str(epub_tmp),
                str(output_path),
                "--title", title,
                "--authors", "Unknown",
                "-v",
            ]
            if output_fmt == "mobi":
                cmd += ["--mobi-file-type", "both"]
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=_calibre_env(output_path),
                timeout=_CALIBRE_TIMEOUT,
            )
            if result.returncode != 0:
                _log.debug("calibre output:\n%s", result.stdout)
                raise RuntimeError(
                    f"ebook-convert exited with code {result.returncode}. "
                    "Check that the input file is valid and not corrupted."
                )
            _progress_values_txt_bridge.append(95)
            if callable(progress_cb):
                progress_cb(95)
        finally:
            cleanup_temp_files(epub_tmp)

        proc = _AlreadyDoneProcess()
        proc._toolceo_output_path = str(output_path)
        proc._toolceo_target_fmt = output_fmt
        proc._toolceo_source_fmt = "txt"
        proc._toolceo_title = title
        proc._toolceo_progress_log = _progress_values_txt_bridge
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
    clean_input_path = str(_calibre_work_dir(output_path) / f"input{input_ext}")
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
        env=_calibre_env(output_path),
    )
    # Attach context so stream_progress can perform post-processing and cleanup
    # after conversion completes, without changing the public function signature.
    process._toolceo_clean_input  = clean_input_path   # type: ignore[attr-defined]
    process._toolceo_cover_path   = None                # type: ignore[attr-defined]
    process._toolceo_output_path  = str(output_path)   # type: ignore[attr-defined]
    process._toolceo_target_fmt   = target_format.lower()  # type: ignore[attr-defined]
    process._toolceo_source_fmt   = input_fmt           # type: ignore[attr-defined]
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
    # Fast-path: PDF→EPUB custom engine already ran synchronously.
    # Re-play the recorded progress milestones so the router's tween threads
    # can fill the gaps and the SSE client sees a smooth progression instead
    # of a single 100% jump.
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
        # For MOBI/AZW3 → EPUB, Calibre's extractor can leave structural HTML
        # artefacts (merged title+heading, overshrunk code font).  Fix them now.
        src_fmt = getattr(process, "_toolceo_source_fmt", "")
        if src_fmt in ("mobi", "azw3"):
            fix_mobi_html_in_epub(getattr(process, "_toolceo_output_path", ""))

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
# MOBI/AZW3 → EPUB HTML artefact fixer
# ---------------------------------------------------------------------------

# Regex that matches a <font size="N"> wrapper immediately around a <tt> or
# <code> block, where the size value is anything other than the default (3).
# Calibre's MOBI extractor sometimes emits <font size="1"><tt>…</tt></font>
# which renders the code at a tiny, unreadable size.
# We strip the outer <font …> tag while keeping the <tt>/<code> content.
_FONT_SIZE_CODE_RE = re.compile(
    r'<font\s[^>]*\bsize\s*=\s*["\']?\d+["\']?[^>]*>'   # opening <font size=…>
    r'(\s*(?:<tt>|<code>).*?(?:</tt>|</code>)\s*)'       # <tt>…</tt> content (lazy)
    r'</font>',                                           # closing </font>
    re.IGNORECASE | re.DOTALL,
)

# Regex that matches a merged title+first-section-heading in a single block.
# Calibre emits them as either:
#   <p><b>Book Title\nFirst Section</b></p>
#   <p>Book Title\nFirst Section</p>
# where the two conceptual pieces are separated by whitespace / newlines.
# We use a two-capture-group approach: group 1 = title text, group 2 = heading.
_MERGED_TITLE_RE = re.compile(
    r'<(p|b)>'                    # opening tag — <p> or bare <b>
    r'\s*<b>([^<]+?)</b>'         # optional inner bold wrapper for title
    r'\s*[\r\n]+'                 # separator: newline(s) between title and heading
    r'\s*<b>([^<]+?)</b>'         # first section heading in its own <b>
    r'\s*</\1>',                  # matching close tag
    re.IGNORECASE | re.DOTALL,
)

# Simpler merged-title: the entire content of a <p> is two distinct text
# chunks separated by a hard newline — no inner <b> wrappers.
_MERGED_TITLE_PLAIN_RE = re.compile(
    r'<p>'
    r'\s*([^\r\n<]{3,120})'    # chunk 1: title (3–120 non-newline chars)
    r'\s*[\r\n]+'              # newline separator
    r'\s*([^\r\n<]{3,120})'    # chunk 2: heading
    r'\s*</p>',
    re.IGNORECASE | re.DOTALL,
)


def fix_mobi_extracted_html(html: str) -> str:
    """
    Fix structural HTML artefacts produced by Calibre's MOBI/AZW3 extractor.

    Two issues are addressed:

    1. **Title + heading merge** — Calibre sometimes places the document title
       and the first section heading inside a single ``<p>`` or ``<b>`` element,
       separated only by a newline.  This function splits them into a proper
       ``<h1>`` (title) and ``<h2>`` (first section heading).

    2. **Code font size** — ``<tt>`` or ``<code>`` blocks wrapped in a
       ``<font size="1">`` (or any explicit numeric size) tag render at a tiny,
       unreadable size.  The outer ``<font …>`` wrapper is removed so the
       monospace block inherits the normal body size.

    All other content — tables, lists, paragraphs, body text — is returned
    unchanged.

    Parameters
    ----------
    html:
        Raw HTML string extracted from a MOBI/AZW3 file (typically one XHTML
        content document from inside the converted EPUB zip).

    Returns
    -------
    str
        The corrected HTML string.
    """
    # ── Fix 1: remove <font size="…"> wrappers around <tt>/<code> blocks ──────
    # Replace  <font size="1"><tt>…</tt></font>
    # with     <tt>…</tt>
    # The replacement keeps the captured inner content (group 1) intact.
    html = _FONT_SIZE_CODE_RE.sub(r'\1', html)

    # ── Fix 2: split merged title+heading ────────────────────────────────────
    # Pattern A: two <b>…</b> spans inside one <p> or <b> block separated by \n
    #   → <h1>title</h1>\n<h2>heading</h2>
    def _split_bold_merge(m: re.Match) -> str:  # type: ignore[type-arg]
        title_text   = m.group(2).strip()
        heading_text = m.group(3).strip()
        return f"<h1>{title_text}</h1>\n<h2>{heading_text}</h2>"

    html = _MERGED_TITLE_RE.sub(_split_bold_merge, html)

    # Pattern B: plain text in a <p> with a newline separator and no inner tags.
    # Only apply when the block appears near the top of the document (within the
    # first 4 kB) to avoid false positives in body text.
    head_region = html[:4096]
    tail_region = html[4096:]
    head_region = _MERGED_TITLE_PLAIN_RE.sub(
        lambda m: (
            f"<h1>{m.group(1).strip()}</h1>\n"
            f"<h2>{m.group(2).strip()}</h2>"
        ),
        head_region,
        count=1,   # only the very first occurrence in the header region
    )
    html = head_region + tail_region

    return html


def fix_mobi_html_in_epub(epub_path: str) -> None:
    """
    Apply :func:`fix_mobi_extracted_html` to every HTML/XHTML content document
    inside the EPUB zip at *epub_path*.

    The zip is rewritten in-place using a swap-and-replace strategy so that the
    original file is only replaced on success.  Any error is logged at DEBUG
    level and silently swallowed — a partially fixed EPUB is better than a
    missing one.

    Parameters
    ----------
    epub_path:
        Absolute path to the ``.epub`` file to patch.
    """
    if not epub_path or not os.path.exists(epub_path):
        _log.debug("fix_mobi_html_in_epub: epub not found at %s — skipping", epub_path)
        return

    temp_epub = epub_path + "_mobifix.epub"
    try:
        with zipfile.ZipFile(epub_path, "r") as zin:
            with zipfile.ZipFile(temp_epub, "w", zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    if item.filename.endswith(".html") or item.filename.endswith(".xhtml"):
                        text = data.decode("utf-8", errors="replace")
                        text = fix_mobi_extracted_html(text)
                        data = text.encode("utf-8")
                    zout.writestr(item, data)
        os.replace(temp_epub, epub_path)
        _log.debug("fix_mobi_html_in_epub: patched MOBI artefacts in %s", epub_path)
    except Exception as exc:  # noqa: BLE001
        _log.debug("fix_mobi_html_in_epub: failed for %s: %s", epub_path, exc)
        if os.path.exists(temp_epub):
            try:
                os.remove(temp_epub)
            except OSError:
                pass



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
