"""
Cross-platform external binary discovery for ToolCEO.

The PDF engines are intentionally in-memory where possible.  A few conversion
features still need command-line tools installed on the host; this module keeps
their platform-specific lookup and install guidance in one place.
"""

from __future__ import annotations

import glob
import os
import shutil
import sys
from pathlib import Path
from typing import Iterable


IS_WIN = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")


INSTALL_HINTS = {
    "ghostscript": {
        "name": "Ghostscript",
        "mac": "brew install ghostscript",
        "linux": "sudo apt install ghostscript",
        "windows": "Install Ghostscript from https://ghostscript.com/releases/gsdnld.html",
    },
    "libreoffice": {
        "name": "LibreOffice",
        "mac": "brew install --cask libreoffice",
        "linux": "sudo apt install libreoffice",
        "windows": "Install LibreOffice from https://www.libreoffice.org/download/download-libreoffice/",
    },
    "pandoc": {
        "name": "Pandoc",
        "mac": "brew install pandoc",
        "linux": "sudo apt install pandoc",
        "windows": "Install Pandoc from https://pandoc.org/installing.html",
    },
    "tesseract": {
        "name": "Tesseract OCR",
        "mac": "brew install tesseract",
        "linux": "sudo apt install tesseract-ocr",
        "windows": "Install Tesseract OCR and add tesseract.exe to PATH",
    },
}


def _first_existing(paths: Iterable[str | Path]) -> str | None:
    for candidate in paths:
        path = str(candidate)
        if path and os.path.exists(path):
            return path
    return None


def _first_glob(patterns: Iterable[str]) -> str | None:
    for pattern in patterns:
        matches = sorted(glob.glob(pattern), reverse=True)
        if matches:
            return matches[0]
    return None


def install_message(tool_key: str) -> str:
    hint = INSTALL_HINTS[tool_key]
    if IS_WIN:
        install = hint["windows"]
    elif IS_MAC:
        install = hint["mac"]
    else:
        install = hint["linux"]
    return f"Please install {hint['name']} to use this tool. {install}"


def require_binary(tool_key: str, binary_path: str | None) -> str:
    if binary_path:
        return binary_path
    raise RuntimeError(install_message(tool_key))


def find_ghostscript() -> str | None:
    if IS_WIN:
        found = _first_glob(
            [
                r"C:\Program Files\gs\gs*\bin\gswin64c.exe",
                r"C:\Program Files (x86)\gs\gs*\bin\gswin32c.exe",
            ]
        )
        return found or shutil.which("gswin64c") or shutil.which("gswin32c") or shutil.which("gs")
    if IS_MAC:
        return _first_existing(["/opt/homebrew/bin/gs", "/usr/local/bin/gs"]) or shutil.which("gs")
    return shutil.which("gs")


def get_engine_path(engine_name: str) -> str | None:
    """
    Resolve external engine path relative to application root or frozen PyInstaller bundle.
    """
    engine_norm = engine_name.replace("/", os.sep).replace("\\", os.sep)
    if getattr(sys, "frozen", False):
        # Running as PyInstaller bundle (e.g. inside resources/engines/python/main_backend.exe)
        exe_dir = os.path.dirname(sys.executable)
        candidates = [
            os.path.join(exe_dir, "..", engine_norm),
            os.path.join(exe_dir, engine_norm),
            os.path.join(exe_dir, "..", "engines", engine_norm),
        ]
        if hasattr(sys, "_MEIPASS"):
            candidates.append(os.path.join(sys._MEIPASS, "engines", engine_norm))
            candidates.append(os.path.join(sys._MEIPASS, engine_norm))
    else:
        # Running in development from repo root or backend dir
        base = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.join(base, "..", "engines", engine_norm),
            os.path.join(base, "engines", engine_norm),
        ]

    for candidate in candidates:
        norm = os.path.abspath(candidate)
        if os.path.exists(norm):
            return norm
    return None


def find_libreoffice() -> str | None:
    bundled = get_engine_path("libreoffice/program/soffice.exe") or get_engine_path("libreoffice/soffice.exe")
    if bundled:
        return bundled
    if IS_WIN:
        found = _first_existing(
            [
                Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
                / "LibreOffice"
                / "program"
                / "soffice.exe",
                Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
                / "LibreOffice"
                / "program"
                / "soffice.exe",
            ]
        )
        return found or shutil.which("soffice") or shutil.which("libreoffice")
    if IS_MAC:
        return _first_existing(
            [
                "/Applications/LibreOffice.app/Contents/MacOS/soffice",
                "/opt/homebrew/bin/soffice",
                "/usr/local/bin/soffice",
            ]
        ) or shutil.which("soffice") or shutil.which("libreoffice")
    return shutil.which("soffice") or shutil.which("libreoffice")


def find_pandoc() -> str | None:
    bundled = get_engine_path("pandoc/pandoc.exe") or get_engine_path("pandoc/pandoc")
    if bundled:
        return bundled
    if IS_WIN:
        found = _first_existing(
            [
                Path(os.environ.get("LOCALAPPDATA", "")) / "Pandoc" / "pandoc.exe",
                Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Pandoc" / "pandoc.exe",
            ]
        )
        return found or shutil.which("pandoc")
    if IS_MAC:
        return _first_existing(["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"]) or shutil.which("pandoc")
    return shutil.which("pandoc")


def find_ffmpeg() -> str | None:
    bundled = get_engine_path("ffmpeg/ffmpeg.exe") or get_engine_path("ffmpeg/bin/ffmpeg.exe") or get_engine_path("ffmpeg/ffmpeg")
    if bundled:
        return bundled
    return shutil.which("ffmpeg")


def find_tesseract() -> str | None:
    bundled = get_engine_path("tesseract/tesseract.exe") or get_engine_path("tesseract/tesseract")
    if bundled:
        return bundled
    if IS_WIN:
        found = _first_existing(
            [
                Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
                / "Tesseract-OCR"
                / "tesseract.exe",
                Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
                / "Tesseract-OCR"
                / "tesseract.exe",
            ]
        )
        return found or shutil.which("tesseract")
    if IS_MAC:
        return _first_existing(["/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"]) or shutil.which("tesseract")
    return shutil.which("tesseract")


def find_calibre() -> str | None:
    bundled = (
        get_engine_path("calibre/ebook-convert.exe")
        or get_engine_path("calibre/app/bin/ebook-convert.exe")
        or get_engine_path("calibre/ebook-convert")
    )
    if bundled:
        return bundled
    if IS_WIN:
        found = _first_existing(
            [
                Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
                / "Calibre2"
                / "ebook-convert.exe",
            ]
        )
        return found or shutil.which("ebook-convert")
    return shutil.which("ebook-convert")


def find_7zip() -> str | None:
    bundled = get_engine_path("7zip/7z.exe") or get_engine_path("7zip/7z")
    if bundled:
        return bundled
    if IS_WIN:
        found = _first_existing(
            [
                Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
                / "7-Zip"
                / "7z.exe",
            ]
        )
        return found or shutil.which("7z")
    return shutil.which("7z")


LIBREOFFICE_PATH = find_libreoffice()
PANDOC_PATH = find_pandoc()
FFMPEG_PATH = find_ffmpeg()
TESSERACT_PATH = find_tesseract()
CALIBRE_PATH = find_calibre()
SEVENZIP_PATH = find_7zip()

