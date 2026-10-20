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
import subprocess
import sys
from pathlib import Path
from typing import Iterable


IS_WIN = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")


def _build_startupinfo() -> "subprocess.STARTUPINFO":
    """Create a fully configured STARTUPINFO that hides the child window."""
    si = subprocess.STARTUPINFO()
    # STARTF_USESHOWWINDOW tells CreateProcess to honour wShowWindow
    si.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 0x00000001)
    # SW_HIDE = 0 → window is hidden
    si.wShowWindow = getattr(subprocess, "SW_HIDE", 0)
    return si


# Win32 creation-flag constants (fallback values for older Python builds)
_CREATE_NO_WINDOW   = getattr(subprocess, "CREATE_NO_WINDOW",   0x08000000)
_DETACHED_PROCESS   = 0x00000008  # sever parent console inheritance
_CREATE_NEW_CONSOLE = 0x00000010  # must be stripped if present


def get_subprocess_kwargs() -> dict:
    """
    Return creationflags and startupinfo to guarantee no console/cmd window
    pops up when spawning external processes on Windows.

    Use as:  subprocess.run(cmd, ..., **get_subprocess_kwargs())
    """
    kwargs: dict = {}
    if IS_WIN:
        kwargs["creationflags"] = _CREATE_NO_WINDOW | _DETACHED_PROCESS
        kwargs["startupinfo"] = _build_startupinfo()
    return kwargs


def _apply_silent_flags(kwargs: dict) -> None:
    """
    Mutate *kwargs* in-place so creationflags / startupinfo guarantee
    no console window is shown, regardless of what the caller passed.
    """
    # --- creationflags ---------------------------------------------------
    flags = kwargs.get("creationflags", 0)
    flags &= ~_CREATE_NEW_CONSOLE        # strip conflicting flag
    flags |= _CREATE_NO_WINDOW | _DETACHED_PROCESS
    kwargs["creationflags"] = flags

    # --- startupinfo -----------------------------------------------------
    si = kwargs.get("startupinfo")
    if si is None:
        si = _build_startupinfo()
    else:
        si.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 0x00000001)
        si.wShowWindow = getattr(subprocess, "SW_HIDE", 0)
    kwargs["startupinfo"] = si


def ensure_silent_subprocess() -> None:
    """
    Globally monkey-patch subprocess.Popen on Windows so that **every**
    process spawned by any code path (our engines, 3rd-party libraries,
    etc.) NEVER creates or flashes a console / cmd-prompt window.

    The patch handles creationflags and startupinfo whether they are
    passed as keyword arguments or positional arguments.
    """
    if not IS_WIN:
        return
    if getattr(subprocess, "_toolceo_silent_patched", False):
        return

    _orig_init = subprocess.Popen.__init__

    # Positional index of startupinfo / creationflags in Popen.__init__
    # (0-based, after `self`):
    # args(0), bufsize(1), executable(2), stdin(3), stdout(4), stderr(5),
    # preexec_fn(6), close_fds(7), shell(8), cwd(9), env(10),
    # universal_newlines(11), startupinfo(12), creationflags(13)
    _IDX_STARTUPINFO   = 12
    _IDX_CREATIONFLAGS = 13

    def _silent_init(self, *args, **kwargs):
        # ── Promote positional startupinfo/creationflags to kwargs ─────
        # so _apply_silent_flags always works on the dict.  This handles
        # the rare case of callers passing them positionally.
        args_list = None
        if len(args) > _IDX_STARTUPINFO and "startupinfo" not in kwargs:
            args_list = list(args)
            kwargs["startupinfo"] = args_list[_IDX_STARTUPINFO]
            args_list[_IDX_STARTUPINFO] = None          # will be in kwargs
        if len(args) > _IDX_CREATIONFLAGS and "creationflags" not in kwargs:
            if args_list is None:
                args_list = list(args)
            kwargs["creationflags"] = args_list[_IDX_CREATIONFLAGS]
            args_list[_IDX_CREATIONFLAGS] = 0            # will be in kwargs
        if args_list is not None:
            args = tuple(args_list)

        # ── Force silent flags on every spawn ─────────────────────────
        _apply_silent_flags(kwargs)

        _orig_init(self, *args, **kwargs)

    subprocess.Popen.__init__ = _silent_init
    subprocess._toolceo_silent_patched = True


# Automatically ensure silent subprocess execution whenever platform_tools is imported
ensure_silent_subprocess()



INSTALL_HINTS = {
    "ghostscript": {
        "name": "Ghostscript",
        "mac": "brew install ghostscript",
        "linux": "sudo apt install ghostscript",
        "windows": "Please install Ghostscript from https://ghostscript.com/releases/gsdnld.html",
    },
    "libreoffice": {
        "name": "LibreOffice (Office Module)",
        "mac": "brew install --cask libreoffice, or install the Office Module in ToolCEO.",
        "linux": "sudo apt install libreoffice, or install the Office Module in ToolCEO.",
        "windows": "Please open the Modules section in ToolCEO and install the Office Module.",
    },
    "pandoc": {
        "name": "Pandoc (Document Module)",
        "mac": "brew install pandoc, or install the Document Module in ToolCEO.",
        "linux": "sudo apt install pandoc, or install the Document Module in ToolCEO.",
        "windows": "Please open the Modules section in ToolCEO and install the Document Module.",
    },
    "tesseract": {
        "name": "Tesseract (OCR Module)",
        "mac": "brew install tesseract, or install the OCR Module in ToolCEO.",
        "linux": "sudo apt install tesseract-ocr, or install the OCR Module in ToolCEO.",
        "windows": "Please open the Modules section in ToolCEO and install the OCR Module.",
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
    hint = INSTALL_HINTS.get(tool_key, {
        "name": tool_key,
        "windows": "Please install the required module in ToolCEO.",
        "mac": "Please install the required module in ToolCEO.",
        "linux": "Please install the required module in ToolCEO.",
    })
    if IS_WIN:
        install = hint["windows"]
    elif IS_MAC:
        install = hint["mac"]
    else:
        install = hint["linux"]
    return f"{hint['name']} is required for this operation. {install}"


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
    Resolve external engine path dynamically across all environments:
    1. ToolCEO User Engines: TOOLCEO_USER_ENGINES_PATH, %APPDATA%/ToolCEO/engines, %LOCALAPPDATA%/ToolCEO/engines
    2. Bundled Engines: TOOLCEO_ENGINES_PATH, frozen resources/engines
    3. Development Engines: backend/../engines or backend/engines
    4. Automatically resolves flat engine names ('libreoffice/program/soffice.exe')
       and module-prefixed names ('office/libreoffice/program/soffice.exe').
    """
    engine_norm = engine_name.replace("/", os.sep).replace("\\", os.sep)

    MODULE_PREFIX_MAP = {
        "tesseract": "ocr",
        "libreoffice": "office",
        "pandoc": "document",
        "calibre": "ebook",
        "7zip": "media",
        "ffmpeg": "media",
    }

    variants: list[str] = [engine_norm]
    parts = engine_norm.split(os.sep)
    first_part = parts[0].lower()

    if first_part in MODULE_PREFIX_MAP:
        mod_prefix = MODULE_PREFIX_MAP[first_part]
        variants.append(os.path.join(mod_prefix, engine_norm))

    reverse_prefix_map = {v: k for k, v in MODULE_PREFIX_MAP.items()}
    if first_part in reverse_prefix_map and len(parts) > 1:
        variants.append(os.path.join(*parts[1:]))

    if len(parts) >= 2:
        short_variant = os.path.join(*parts[-2:])
        if short_variant not in variants:
            variants.append(short_variant)
    if parts:
        basename = parts[-1]
        if basename not in variants:
            variants.append(basename)

    search_roots: list[str] = []

    # 1. Environment-variable override for user-downloaded engines (set by Electron)
    env_user_engines = os.environ.get("TOOLCEO_USER_ENGINES_PATH", "").strip()
    if env_user_engines:
        search_roots.append(env_user_engines)

    # 2. Standard user data locations (always checked even if env var was not forwarded)
    if IS_WIN:
        appdata = os.environ.get("APPDATA", "").strip()
        if appdata:
            search_roots.append(os.path.join(appdata, "ToolCEO", "engines"))
        localappdata = os.environ.get("LOCALAPPDATA", "").strip()
        if localappdata:
            search_roots.append(os.path.join(localappdata, "ToolCEO", "engines"))
            search_roots.append(os.path.join(localappdata, "Programs", "ToolCEO", "engines"))
            search_roots.append(os.path.join(localappdata, "Programs", "ToolCEO", "resources", "engines"))
            # AppX / MSIX package store redirection roots:
            for p in glob.glob(os.path.join(localappdata, "Packages", "*ToolCEO*", "LocalCache", "Roaming", "ToolCEO", "engines")):
                search_roots.append(p)
            for p in glob.glob(os.path.join(localappdata, "Packages", "*ToolCEO*", "LocalCache", "Local", "ToolCEO", "engines")):
                search_roots.append(p)
    elif IS_MAC:
        search_roots.append(os.path.expanduser("~/Library/Application Support/ToolCEO/engines"))
    else:
        search_roots.append(os.path.expanduser("~/.config/ToolCEO/engines"))

    # 3. Bundled engines environment variable (set by Electron)
    env_engines = os.environ.get("TOOLCEO_ENGINES_PATH", "").strip()
    if env_engines:
        search_roots.append(env_engines)

    # 4. Packaged/Frozen PyInstaller bundle directory
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        search_roots.append(os.path.join(exe_dir, ".."))                   # resources/engines
        search_roots.append(os.path.join(exe_dir, "..", "..", "engines"))   # AppInstallDir/engines
        search_roots.append(os.path.join(exe_dir, "engines"))
        search_roots.append(exe_dir)
        if hasattr(sys, "_MEIPASS"):
            search_roots.append(os.path.join(sys._MEIPASS, "engines"))
            search_roots.append(sys._MEIPASS)
    else:
        # 5. Development mode
        base = os.path.dirname(os.path.abspath(__file__))
        search_roots.append(os.path.join(base, "..", "engines"))
        search_roots.append(os.path.join(base, "engines"))

    for root in search_roots:
        if not root or not os.path.exists(root):
            continue
        for variant in variants:
            candidate = os.path.abspath(os.path.join(root, variant))
            if os.path.exists(candidate):
                return candidate

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
    bundled = (
        get_engine_path("ffmpeg/ffmpeg.exe")
        or get_engine_path("ffmpeg/bin/ffmpeg.exe")
        or get_engine_path("media/ffmpeg/ffmpeg.exe")
        or get_engine_path("media/ffmpeg/bin/ffmpeg.exe")
        or get_engine_path("ffmpeg/ffmpeg")
        or get_engine_path("media/ffmpeg/ffmpeg")
    )
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
    if IS_WIN:
        bundled = get_engine_path("7zip/7z.exe") or get_engine_path("media/7zip/7z.exe")
    elif IS_MAC:
        bundled = (
            get_engine_path("7zip/mac/7zz")
            or get_engine_path("7zip/7zz")
            or get_engine_path("media/7zip/mac/7zz")
            or get_engine_path("media/7zip/7zz")
        )
    else:
        bundled = (
            get_engine_path("7zip/linux/7zz")
            or get_engine_path("7zip/7zz")
            or get_engine_path("media/7zip/linux/7zz")
            or get_engine_path("media/7zip/7zz")
        )
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
    return shutil.which("7z") or shutil.which("7zz")


def find_rar() -> str | None:
    bundled = (
        get_engine_path("rar/rar.exe")
        or get_engine_path("rar/Rar.exe")   # handle capitalised filename on Windows
        or get_engine_path("rar/rar")
    )
    if bundled:
        return bundled
    if IS_WIN:
        found = _first_existing(
            [
                Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
                / "WinRAR"
                / "rar.exe",
                Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
                / "WinRAR"
                / "rar.exe",
            ]
        )
        return found or shutil.which("rar")
    return shutil.which("rar")


LIBREOFFICE_PATH = find_libreoffice()
PANDOC_PATH = find_pandoc()
FFMPEG_PATH = find_ffmpeg()
TESSERACT_PATH = find_tesseract()
CALIBRE_PATH = find_calibre()
SEVENZIP_PATH = find_7zip()
RAR_PATH = find_rar()

