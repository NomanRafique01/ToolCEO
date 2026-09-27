import os
import re
import json
import time
import socket
import shutil
import tempfile
import uuid
from typing import Dict, Any, List, Optional
from html import escape as html_escape
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse

from jobs import get_job_snapshot

router = APIRouter()

# ── Session Storage (In-Memory with 15-min TTL) ──────────────────────────
SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_TTL_SECONDS = 15 * 60  # 15 minutes
PICKING_MAX_SECONDS = 5 * 60
HEARTBEAT_STALE_SECONDS = 8
MOBILE_TEMP_ROOT = os.path.join(tempfile.gettempdir(), "toolceo_mobile_uploads")
os.makedirs(MOBILE_TEMP_ROOT, exist_ok=True)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_FRONTEND_MOBILE = os.path.join(_PROJECT_ROOT, "frontend", "mobile")

_HEX_COLOR = re.compile(r"^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")
_SAFE_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _safe_color(val: Any, fallback: str = "#00E5C0") -> str:
    if isinstance(val, str) and _HEX_COLOR.match(val.strip()):
        return val.strip()
    return fallback


def _safe_bg(val: Any, fallback: str = "rgba(0, 229, 192, 0.15)") -> str:
    if not isinstance(val, str):
        return fallback
    s = val.strip()[:80]
    if _HEX_COLOR.match(s) or s.startswith("rgba(") or s.startswith("rgb("):
        return s
    return fallback


def _safe_icon(val: Any) -> Optional[str]:
    if not isinstance(val, str):
        return None
    s = val.strip()
    if len(s) > 20000 or not s.lower().startswith("<svg"):
        return None
    lower = s.lower()
    if "<script" in lower or "javascript:" in lower or "onerror=" in lower:
        return None
    return s


def _safe_text(val: Any, fallback: str = "", max_len: int = 160) -> str:
    if not isinstance(val, str):
        return fallback
    s = _SAFE_TEXT.sub("", val).strip()
    return s[:max_len] if s else fallback


def _resolve_format_meta(tool_id: Optional[str]) -> Dict[str, Any]:
    tid = (tool_id or "").lower()

    if tid == "images-pdf":
        return {
            "allowed_exts": [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif", ".svg", ".avif", ".heic", ".heif"],
            "accept_attr": "image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tiff,.tif,.svg,.avif,.heic,.heif",
            "format_label": "Image files (PNG, JPG, WebP, SVG...)",
            "allows_camera": True,
        }
    if tid == "image_compressor":
        return {
            "allowed_exts": [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp", ".dib", ".tiff", ".tif", ".ico", ".heic", ".heif", ".svg"],
            "accept_attr": "image/*,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.dib,.tiff,.tif,.ico,.heic,.heif,.svg",
            "format_label": "Image files (JPG, PNG, WebP...)",
            "allows_camera": True,
        }
    if tid == "jpg" or tid.startswith("jpg-"):
        return {
            "allowed_exts": [".jpg", ".jpeg"],
            "accept_attr": "image/jpeg,.jpg,.jpeg",
            "format_label": "JPG / JPEG images (.jpg, .jpeg)",
            "allows_camera": True,
        }
    if tid == "png" or tid.startswith("png-"):
        return {
            "allowed_exts": [".png"],
            "accept_attr": "image/png,.png",
            "format_label": "PNG images (.png)",
            "allows_camera": True,
        }
    if tid == "webp" or tid.startswith("webp-"):
        return {
            "allowed_exts": [".webp"],
            "accept_attr": "image/webp,.webp",
            "format_label": "WebP images (.webp)",
            "allows_camera": True,
        }
    if tid == "svg" or tid.startswith("svg-"):
        return {
            "allowed_exts": [".svg"],
            "accept_attr": "image/svg+xml,.svg",
            "format_label": "SVG vector files (.svg)",
            "allows_camera": False,
        }
    if tid in ("gif", "bmp", "tiff", "heic") or any(tid.startswith(f"{x}-") for x in ("gif", "bmp", "tiff", "heic")):
        ext = f".{tid.split('-')[0]}"
        return {
            "allowed_exts": [ext],
            "accept_attr": f"image/{tid.split('-')[0]},{ext}",
            "format_label": f"{tid.split('-')[0].upper()} images ({ext})",
            "allows_camera": True,
        }
    if tid == "merge" or tid.startswith("pdf-") or tid in ("split", "compress", "encrypt", "watermark", "edit-pdf", "editor", "extract-images", "extractor", "rotate") or tid.endswith("-pdf"):
        is_enc = tid == "encrypt"
        return {
            "allowed_exts": [".pdf", ".tceo"] if is_enc else [".pdf"],
            "accept_attr": ".pdf,.tceo,application/pdf" if is_enc else ".pdf,application/pdf",
            "format_label": "PDF files (.pdf, .tceo)" if is_enc else "PDF documents (.pdf)",
            "allows_camera": False,
        }
    if tid.startswith("docx-") or tid == "docx":
        return {
            "allowed_exts": [".docx"],
            "accept_attr": ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "format_label": "Word documents (.docx)",
            "allows_camera": False,
        }
    if tid.startswith("xlsx-") or tid == "xlsx":
        return {
            "allowed_exts": [".xlsx", ".xls"],
            "accept_attr": ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "format_label": "Excel spreadsheets (.xlsx, .xls)",
            "allows_camera": False,
        }
    if tid.startswith("pptx-") or tid == "pptx":
        return {
            "allowed_exts": [".pptx", ".ppt"],
            "accept_attr": ".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "format_label": "PowerPoint presentations (.pptx, .ppt)",
            "allows_camera": False,
        }
    if tid.startswith("txt-") or tid == "txt":
        return {
            "allowed_exts": [".txt"],
            "accept_attr": ".txt,text/plain",
            "format_label": "Plain text files (.txt)",
            "allows_camera": False,
        }
    if tid.startswith("odt-") or tid == "odt":
        return {
            "allowed_exts": [".odt"],
            "accept_attr": ".odt,application/vnd.oasis.opendocument.text",
            "format_label": "OpenDocument text files (.odt)",
            "allows_camera": False,
        }
    if tid.startswith("csv-") or tid == "csv":
        return {
            "allowed_exts": [".csv"],
            "accept_attr": ".csv,text/csv",
            "format_label": "CSV files (.csv)",
            "allows_camera": False,
        }
    if tid.startswith("epub-") or tid == "epub":
        return {"allowed_exts": [".epub"], "accept_attr": ".epub", "format_label": "EPUB eBooks (.epub)", "allows_camera": False}
    if tid.startswith("mobi-") or tid == "mobi":
        return {"allowed_exts": [".mobi"], "accept_attr": ".mobi", "format_label": "MOBI eBooks (.mobi)", "allows_camera": False}
    if tid.startswith("azw3-") or tid == "azw3":
        return {"allowed_exts": [".azw3"], "accept_attr": ".azw3", "format_label": "AZW3 eBooks (.azw3)", "allows_camera": False}
    if tid.startswith("fb2-") or tid == "fb2":
        return {"allowed_exts": [".fb2"], "accept_attr": ".fb2", "format_label": "FB2 eBooks (.fb2)", "allows_camera": False}
    if tid.startswith("rtf-") or tid == "rtf":
        return {"allowed_exts": [".rtf"], "accept_attr": ".rtf", "format_label": "RTF documents (.rtf)", "allows_camera": False}
    if tid.startswith("archive-create-") or tid.startswith("archive-folder-") or tid == "archive-merge":
        return {"allowed_exts": ["*"], "accept_attr": "*/*", "format_label": "Any files", "allows_camera": False}
    if "zip" in tid and "archive" in tid:
        return {"allowed_exts": [".zip"], "accept_attr": ".zip", "format_label": "ZIP archives (.zip)", "allows_camera": False}
    if "rar" in tid and "archive" in tid:
        return {"allowed_exts": [".rar"], "accept_attr": ".rar", "format_label": "RAR archives (.rar)", "allows_camera": False}
    if "7z" in tid and "archive" in tid:
        return {"allowed_exts": [".7z"], "accept_attr": ".7z", "format_label": "7Z archives (.7z)", "allows_camera": False}
    if "tar" in tid and "archive" in tid:
        return {"allowed_exts": [".tar", ".tar.gz", ".tgz"], "accept_attr": ".tar,.tar.gz,.tgz", "format_label": "TAR archives", "allows_camera": False}
    if tid.startswith("archive-"):
        return {
            "allowed_exts": [".zip", ".7z", ".rar", ".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz", ".gz", ".bz2", ".xz", ".wim", ".iso", ".cab"],
            "accept_attr": ".zip,.7z,.rar,.tar,.tar.gz,.tgz,.tar.bz2,.tar.xz,.gz,.bz2,.xz,.wim,.iso,.cab",
            "format_label": "Archive files (.zip, .7z, .rar, .tar...)",
            "allows_camera": False,
        }
    return {"allowed_exts": ["*"], "accept_attr": "*/*", "format_label": "files", "allows_camera": False}


def _theme_payload(sess: Dict[str, Any]) -> Dict[str, Any]:
    tool_id = sess.get("tool")
    fmt = _resolve_format_meta(tool_id)
    return {
        "tool": tool_id,
        "tool_name": sess.get("tool_name"),
        "color": sess.get("color", "#00E5C0"),
        "bg": sess.get("bg", "rgba(0, 229, 192, 0.15)"),
        "icon": sess.get("icon") or "",
        "mainText": sess.get("mainText") or "",
        "subText": sess.get("subText") or "",
        "tag": sess.get("tag") or "",
        "allowed_exts": sess.get("allowed_exts") or fmt["allowed_exts"],
        "accept_attr": sess.get("accept_attr") or fmt["accept_attr"],
        "format_label": sess.get("format_label") or fmt["format_label"],
        "allows_camera": sess.get("allows_camera") if sess.get("allows_camera") is not None else fmt["allows_camera"],
        "action_label": sess.get("action_label") or sess.get("tool_name") or "Execute",
        "output_ext": sess.get("output_ext") or "pdf",
        "supports_multi": bool(sess.get("supports_multi", False)),
        "supports_reorder": bool(sess.get("supports_reorder", False)),
        "has_mode_toggle": bool(sess.get("has_mode_toggle", False)),
    }


def get_local_ip() -> str:
    """Find the best local LAN IPv4 address for mobile devices to connect to."""
    # First try connecting a dummy UDP socket to a public IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    # Fallback: inspect network interfaces
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                return ip
    except Exception:
        pass

    return "127.0.0.1"


def cleanup_stale_sessions():
    now = time.time()
    stale_ids = []
    for sid, sess in SESSIONS.items():
        if now - sess.get("created_at", now) > SESSION_TTL_SECONDS:
            stale_ids.append(sid)

    for sid in stale_ids:
        sess = SESSIONS.pop(sid, None)
        if sess and "dir" in sess and os.path.exists(sess["dir"]):
            try:
                shutil.rmtree(sess["dir"], ignore_errors=True)
            except Exception:
                pass


# ── API Endpoints ─────────────────────────────────────────────────────────

@router.post("/api/mobile/session/create")
async def create_session(request: Request, tool: Optional[str] = "images-pdf", tool_name: Optional[str] = "Images to PDF"):
    cleanup_stale_sessions()

    payload: Dict[str, Any] = {}
    try:
        raw = await request.body()
        if raw:
            parsed = json.loads(raw.decode("utf-8"))
            if isinstance(parsed, dict):
                payload = parsed
    except Exception:
        payload = {}

    tool = _safe_text(payload.get("tool") or tool, "images-pdf", 80)
    tool_name = _safe_text(payload.get("tool_name") or tool_name, "ToolCEO File Transfer", 80)
    color = _safe_color(payload.get("color"))
    bg = _safe_bg(payload.get("bg"))
    icon = _safe_icon(payload.get("icon"))
    main_text = _safe_text(payload.get("mainText"), "", 200)
    sub_text = _safe_text(payload.get("subText"), "", 200)
    tag = _safe_text(payload.get("tag"), "", 40)
    action_label = _safe_text(payload.get("action_label"), tool_name, 80)
    output_ext = _safe_text(payload.get("output_ext"), "pdf", 20)
    supports_multi = bool(payload.get("supports_multi", False))
    supports_reorder = bool(payload.get("supports_reorder", False))
    has_mode_toggle = bool(payload.get("has_mode_toggle", False))

    safe_tool = "".join(c for c in (tool or "tool") if c.isalnum() or c in "-_")[:10]
    session_id = f"{safe_tool}_{uuid.uuid4().hex[:8]}"
    session_dir = os.path.join(MOBILE_TEMP_ROOT, session_id)
    os.makedirs(session_dir, exist_ok=True)

    local_ip = get_local_ip()
    port = request.url.port or 8765

    format_meta = _resolve_format_meta(tool)
    allowed_exts = payload.get("allowed_exts") or format_meta["allowed_exts"]
    accept_attr = payload.get("accept_attr") or format_meta["accept_attr"]
    format_label = payload.get("format_label") or format_meta["format_label"]
    # Camera capture is reserved for image-input tools. Never trust a stale
    # client flag to expose it for documents, PDFs, archives, or eBooks.
    allows_camera = bool(payload.get("allows_camera", True)) and bool(format_meta["allows_camera"])

    SESSIONS[session_id] = {
        "id": session_id,
        "tool": tool,
        "tool_name": tool_name,
        "color": color,
        "bg": bg,
        "icon": icon,
        "mainText": main_text,
        "subText": sub_text,
        "tag": tag,
        "action_label": action_label,
        "output_ext": output_ext,
        "supports_multi": supports_multi,
        "supports_reorder": supports_reorder,
        "has_mode_toggle": has_mode_toggle,
        "allowed_exts": allowed_exts,
        "accept_attr": accept_attr,
        "format_label": format_label,
        "allows_camera": allows_camera,
        "created_at": time.time(),
        "last_seen": None,
        "picking": False,
        "status": "waiting",  # waiting -> connected -> uploading -> completed
        "dir": session_dir,
        "files": [],
        "acked_until": 0,
        "pending_execution": None,
        "pending_clear": False,
        "pending_job_clear": False,
        "transfer_progress": 0,
        "transfer_received": 0,
        "transfer_total": 0,
        "transfer_batch_id": None,
        "pending_reorder": None,   # list of filenames in new order
        "pending_remove": [],      # ordered file removals waiting for desktop
        # Active desktop conversion job the phone mirrors (progress/download)
        "job_id": None,
        "job_filename": "",
    }

    url = f"http://{local_ip}:{port}/mobile-upload?session={session_id}&tool={tool}&t={int(time.time()*1000)}"

    return {
        "session_id": session_id,
        "url": url,
        "local_ip": local_ip,
        "port": port,
        "status": "waiting",
        **_theme_payload(SESSIONS[session_id]),
    }


def _refresh_phone_liveness(sess: Dict[str, Any]) -> None:
    """Expire a dead phone page. File picking is allowed to stay quiet."""
    status = sess.get("status")
    if status in ("completed", "cancelled", "waiting", "phone_disconnected", "uploading"):
        return
    # Once files are present, the desktop may still be fetching/ingesting
    # them. Do not let the phone page lifecycle expire that transfer.
    if sess.get("files"):
        return
    last_seen = sess.get("last_seen")
    if not last_seen:
        return
    silent_for = time.time() - last_seen
    if sess.get("picking"):
        if silent_for > PICKING_MAX_SECONDS:
            sess["picking"] = False
            sess["status"] = "phone_disconnected"
        return
    if silent_for > HEARTBEAT_STALE_SECONDS:
        sess["status"] = "phone_disconnected"


def _session_job_payload(sess: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Live snapshot of the desktop conversion job linked to this session."""
    job_id = sess.get("job_id")
    if not job_id:
        return None
    snap = get_job_snapshot(str(job_id))
    if not snap:
        # The job registry can briefly lag the session poll while a job is
        # being registered or replaced. Keep the mirror visible instead of
        # making the phone drop its progress/download view prematurely.
        return {
            "job_id": str(job_id),
            "state": "running",
            "progress": 0,
            "filename": sess.get("job_filename") or "",
            "media_type": None,
            "cancelled": False,
            "error": None,
        }
    return {
        "job_id": snap["id"],
        "state": snap["state"],
        "progress": snap["progress"],
        "filename": snap.get("filename") or sess.get("job_filename") or "",
        "media_type": snap.get("media_type"),
        "cancelled": bool(snap.get("cancelled")),
        "error": snap.get("error"),
    }


@router.get("/api/mobile/session/{session_id}/status")
async def get_session_status(session_id: str):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired or not found")

    _refresh_phone_liveness(sess)

    files = sess.get("files", [])
    acked = int(sess.get("acked_until") or 0)
    pending = files[acked:]
    pending_removes = sess.get("pending_remove")
    if isinstance(pending_removes, list):
        pending_removes = pending_removes[0] if pending_removes else None

    return {
        "session_id": session_id,
        "status": sess.get("status", "waiting"),
        "picking": bool(sess.get("picking")),
        "last_seen": sess.get("last_seen"),
        "files_count": len(pending),
        "files": pending,
        "all_files": files,
        "pending_execution": sess.get("pending_execution"),
        "pending_clear": bool(sess.get("pending_clear")),
        "pending_job_clear": bool(sess.get("pending_job_clear")),
        "transfer_progress": int(sess.get("transfer_progress") or 0),
        "transfer_received": int(sess.get("transfer_received") or 0),
        "transfer_total": int(sess.get("transfer_total") or 0),
        "pending_reorder": sess.get("pending_reorder"),
        "pending_remove": pending_removes,
        "job": _session_job_payload(sess),
        **_theme_payload(sess),
    }


@router.post("/api/mobile/session/{session_id}/execute")
async def execute_session_tool(request: Request, session_id: str):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")

    payload: Dict[str, Any] = {}
    try:
        raw = await request.body()
        if raw:
            payload = json.loads(raw.decode("utf-8"))
    except Exception:
        payload = {}

    sess["pending_execution"] = {
        "output_filename": _safe_text(payload.get("output_filename"), "", 120),
        "mode": _safe_text(payload.get("mode"), "single", 20),
        "order": payload.get("order", []),
        "requested_at": time.time(),
    }
    return {"ok": True, "pending_execution": sess["pending_execution"]}


@router.post("/api/mobile/session/{session_id}/execute_ack")
async def ack_session_execute(session_id: str):
    sess = SESSIONS.get(session_id)
    if sess:
        sess["pending_execution"] = None
    return {"ok": True}


@router.post("/api/mobile/session/{session_id}/clear")
async def clear_session_files(session_id: str):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")
    sess["files"] = []
    sess["acked_until"] = 0
    sess["pending_clear"] = True
    sess["pending_remove"] = []
    sess["pending_execution"] = None
    return {"ok": True}


@router.post("/api/mobile/session/{session_id}/clear_ack")
async def ack_session_clear(session_id: str):
    sess = SESSIONS.get(session_id)
    if sess:
        sess["pending_clear"] = False
    return {"ok": True}


@router.post("/api/mobile/session/{session_id}/reorder")
async def reorder_session_files(request: Request, session_id: str):
    """Phone calls this after the user drag-reorders cards.
    Body: {"order": ["file1.pdf", "file2.pdf", ...]}
    Re-sorts sess["files"] to match the given order so the desktop
    re-ingests them in the correct sequence.
    """
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")

    payload: Dict[str, Any] = {}
    try:
        raw = await request.body()
        if raw:
            payload = json.loads(raw.decode("utf-8"))
    except Exception:
        payload = {}

    order: List[str] = payload.get("order") or []
    if not isinstance(order, list):
        raise HTTPException(status_code=400, detail="order must be a list of filenames")

    existing_by_name = {f["name"]: f for f in sess.get("files", [])}
    new_order = [existing_by_name[name] for name in order if name in existing_by_name]
    # Append any files not mentioned in order list at the end
    mentioned = set(order)
    new_order += [f for f in sess.get("files", []) if f["name"] not in mentioned]

    sess["files"] = new_order
    sess["acked_until"] = 0  # force desktop to re-ingest in new order
    sess["pending_reorder"] = list(order)  # signal desktop to re-apply order
    return {"ok": True, "count": len(new_order)}


@router.post("/api/mobile/session/{session_id}/reorder_ack")
async def ack_session_reorder(session_id: str):
    sess = SESSIONS.get(session_id)
    if sess:
        sess["pending_reorder"] = None
    return {"ok": True}


@router.post("/api/mobile/session/{session_id}/remove")
async def remove_session_file(request: Request, session_id: str):
    """Phone calls this when a single file card is removed.
    Body: {"filename": "file1.pdf"}
    Removes the file from the session list and signals the desktop.
    """
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")

    payload: Dict[str, Any] = {}
    try:
        raw = await request.body()
        if raw:
            payload = json.loads(raw.decode("utf-8"))
    except Exception:
        payload = {}

    file_id: str = _safe_text(payload.get("file_id"), "", 80)
    filename: str = _safe_text(payload.get("filename"), "", 300)
    if not file_id and not filename:
        raise HTTPException(status_code=400, detail="file_id or filename required")

    original_files = sess.get("files", [])
    remove_index = next((i for i, f in enumerate(original_files)
                         if (file_id and f.get("id") == file_id) or
                            (not file_id and f.get("name") == filename)), -1)
    if remove_index < 0:
        return {"ok": True, "remaining": len(original_files), "removed": False}

    removed = original_files[remove_index]
    sess["files"] = original_files[:remove_index] + original_files[remove_index + 1:]
    acked_until = int(sess.get("acked_until") or 0)
    if remove_index < acked_until:
        sess["acked_until"] = max(0, acked_until - 1)
    pending_removes = sess.get("pending_remove")
    if not isinstance(pending_removes, list):
        pending_removes = [] if not pending_removes else [pending_removes]
    pending_removes.append({"id": removed.get("id"), "name": removed.get("name")})
    sess["pending_remove"] = pending_removes
    return {"ok": True, "remaining": len(sess["files"]), "removed": True}


@router.post("/api/mobile/session/{session_id}/remove_ack")
async def ack_session_remove(session_id: str):
    sess = SESSIONS.get(session_id)
    if sess:
        pending_removes = sess.get("pending_remove")
        if isinstance(pending_removes, list):
            if pending_removes:
                pending_removes.pop(0)
        else:
            sess["pending_remove"] = None
    return {"ok": True}


@router.post("/api/mobile/session/{session_id}/job")
async def set_session_job(request: Request, session_id: str):
    """Desktop calls this to link/unlink the conversion job mirrored on the phone.

    Body: {"job_id": "<uuid>"|"", "filename": "<display name>"}.
    A null/empty job_id clears the mirror (user cancelled or closed the card).
    """
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired or not found")

    payload: Dict[str, Any] = {}
    try:
        raw = await request.body()
        if raw:
            parsed = json.loads(raw.decode("utf-8"))
            if isinstance(parsed, dict):
                payload = parsed
    except Exception:
        payload = {}

    raw_job_id = payload.get("job_id")
    job_id = re.sub(r"[^A-Za-z0-9_\-]", "", str(raw_job_id or ""))[:64]
    if job_id:
        sess["job_id"] = job_id
        sess["job_filename"] = _safe_text(payload.get("filename"), "", 200)
        sess["pending_job_clear"] = False
    else:
        sess["job_id"] = None
        sess["job_filename"] = ""
    return {"ok": True, "job_id": sess.get("job_id")}


@router.post("/api/mobile/session/{session_id}/job_dismiss")
async def dismiss_session_job(session_id: str):
    """Clear a mirrored desktop job after the phone closes or downloads it."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired or not found")
    sess["job_id"] = None
    sess["job_filename"] = ""
    sess["pending_job_clear"] = True
    return {"ok": True}


@router.post("/api/mobile/session/{session_id}/job_dismiss_ack")
async def ack_session_job_dismiss(session_id: str):
    sess = SESSIONS.get(session_id)
    if sess:
        sess["pending_job_clear"] = False
    return {"ok": True}


@router.post("/api/mobile/session/{session_id}/transfer-progress")
async def update_transfer_progress(request: Request, session_id: str):
    """Receive upload progress from the phone for the desktop mirror."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")

    payload: Dict[str, Any] = {}
    try:
        raw = await request.body()
        if raw:
            parsed = json.loads(raw.decode("utf-8"))
            if isinstance(parsed, dict):
                payload = parsed
    except Exception:
        payload = {}

    total = max(0, int(payload.get("total") or 0))
    received = max(0, int(payload.get("received") or 0))
    progress = max(0, min(100, int(payload.get("progress") or 0)))
    batch_id = str(payload.get("batch_id") or "")[:80]
    reset_batch = bool(payload.get("reset"))
    current_progress = int(sess.get("transfer_progress") or 0)
    current_received = int(sess.get("transfer_received") or 0)
    current_batch_id = str(sess.get("transfer_batch_id") or "")
    batch_changed = False

    # Each phone send gets its own batch ID. Late progress requests from an
    # older send must never overwrite the progress of a newer send.
    if batch_id and batch_id != current_batch_id:
        if reset_batch or sess.get("status") != "uploading" or current_progress >= 100:
            sess["transfer_batch_id"] = batch_id
            current_batch_id = batch_id
            current_progress = 0
            current_received = 0
            batch_changed = True
        else:
            return {"ok": True, "progress": current_progress}
    # Progress updates are sent as independent fetches from the browser and
    # can arrive out of order. Never let an older 0%/smaller update roll the
    # desktop indicator backwards during the same upload. A completed prior
    # transfer starts a fresh progress sequence.
    is_new_transfer = reset_batch or batch_changed or (
        not batch_id and (sess.get("status") != "uploading" or current_progress >= 100)
    )
    if is_new_transfer or progress >= current_progress or received >= current_received:
        sess["transfer_total"] = total
        sess["transfer_received"] = received
        sess["transfer_progress"] = progress
    sess["status"] = "uploading"
    sess["picking"] = True
    sess["last_seen"] = time.time()
    # The phone's transfer-progress endpoint owns live byte progress. Do not
    # reset it here because multipart parsing may begin after progress events.
    sess["transfer_total"] = sess.get("transfer_total") or 0
    return {"ok": True, "progress": progress}


@router.post("/api/mobile/session/{session_id}/ping")
async def ping_session(session_id: str, resume: bool = False):
    """Phone calls this as soon as page loads to signal it has connected."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")
    sess["last_seen"] = time.time()
    # A regular heartbeat must not win a race with the picker notification.
    # Only the explicit resume ping sent after the picker closes clears it.
    if resume:
        sess["picking"] = False
    if sess["status"] in ("waiting", "phone_disconnected"):
        sess["status"] = "connected"
    return {"status": sess["status"], "picking": False}


@router.post("/api/mobile/session/{session_id}/picking")
async def phone_picking(session_id: str):
    """Phone calls this right before opening the gallery or camera."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")
    if sess["status"] == "cancelled":
        return {"status": sess["status"], "picking": False}
    sess["picking"] = True
    sess["last_seen"] = time.time()
    if sess["status"] in ("waiting", "phone_disconnected"):
        sess["status"] = "connected"
    return {"status": sess["status"], "picking": True}


@router.delete("/api/mobile/session/{session_id}")
async def cancel_session(session_id: str):
    """PC calls this when the panel is closed or the tool changes — tells the phone the session ended."""
    sess = SESSIONS.get(session_id)
    if not sess:
        return {"status": "not_found"}
    sess["status"] = "cancelled"
    return {"status": "cancelled"}


@router.post("/api/mobile/session/{session_id}/ack")
async def ack_transferred_files(request: Request, session_id: str):
    """Desktop calls this after ingesting a phone batch so the session stays live."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")
    if sess.get("status") == "cancelled":
        return {"status": "cancelled"}

    count = None
    try:
        raw = await request.body()
        if raw:
            parsed = json.loads(raw.decode("utf-8"))
            if isinstance(parsed, dict) and parsed.get("count") is not None:
                count = int(parsed.get("count"))
    except Exception:
        count = None

    files = sess.get("files") or []
    acked = int(sess.get("acked_until") or 0)
    pending = max(0, len(files) - acked)
    take = pending if count is None else max(0, min(count, pending))
    sess["acked_until"] = acked + take

    if sess["acked_until"] >= len(files):
        sess["status"] = "connected"
        sess["picking"] = False
        sess["transfer_progress"] = 0
        sess["transfer_received"] = 0
        sess["transfer_total"] = 0
        sess["transfer_batch_id"] = None
    else:
        sess["status"] = "completed"

    return {
        "status": sess["status"],
        "acked_until": sess["acked_until"],
        "files_count": max(0, len(files) - sess["acked_until"]),
    }


@router.post("/api/mobile/session/{session_id}/disconnect")
async def phone_disconnect(session_id: str):
    """Phone calls this when the transfer page is actually closed, not when picking files."""
    sess = SESSIONS.get(session_id)
    if not sess:
        return {"status": "not_found"}
    # Opening a native gallery can emit a stale pagehide/beacon. Keep the
    # session alive while the picker is active; liveness expiry handles a
    # genuinely abandoned picker.
    if sess.get("picking") or sess.get("files") or sess.get("status") in ("uploading", "completed"):
        sess["last_seen"] = time.time()
        if sess.get("status") == "phone_disconnected":
            sess["status"] = "connected"
        return {"status": sess.get("status", "connected"), "picking": bool(sess.get("picking"))}
    sess["picking"] = False
    if sess["status"] not in ("completed", "cancelled"):
        sess["status"] = "phone_disconnected"
    return {"status": sess["status"]}


@router.post("/api/mobile/upload/{session_id}")
async def upload_files_from_mobile(
    session_id: str,
    files: List[UploadFile] = File(...)
):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired or not found")

    allowed_exts = [e.lower() for e in (sess.get("allowed_exts") or _resolve_format_meta(sess.get("tool"))["allowed_exts"])]
    if "*" not in allowed_exts:
        for file in files:
            fname = (file.filename or "").lower()
            match = False
            for ext in allowed_exts:
                if fname.endswith(ext.lower()):
                    match = True
                    break
            if not match:
                f_ext = os.path.splitext(fname)[1]
                if f_ext in allowed_exts:
                    match = True
            if not match:
                format_label = sess.get("format_label") or _resolve_format_meta(sess.get("tool"))["format_label"]
                tool_name = sess.get("tool_name") or "Selected tool"
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid format: '{file.filename}' is not accepted. {tool_name} accepts {format_label}."
                )

    sess["status"] = "uploading"
    # A large multi-file upload can outlive the normal heartbeat window while
    # the phone is backgrounded. Treat the upload itself as picker activity.
    sess["picking"] = True
    sess["last_seen"] = time.time()
    target_dir = sess["dir"]
    existing = sess.setdefault("files", [])
    saved_files = []

    for file in files:
        safe_filename = os.path.basename(file.filename or "upload.dat")
        destination_path = os.path.join(target_dir, safe_filename)

        # Avoid filename collisions
        base, ext = os.path.splitext(safe_filename)
        counter = 1
        while os.path.exists(destination_path):
            destination_path = os.path.join(target_dir, f"{base}_{counter}{ext}")
            counter += 1

        with open(destination_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(destination_path)
        file_index = len(existing) + len(saved_files)
        file_url = f"/api/mobile/session/{session_id}/file/{file_index}"

        saved_files.append({
            "id": uuid.uuid4().hex,
            "name": os.path.basename(destination_path),
            "size": file_size,
            "type": file.content_type or "application/octet-stream",
            "path": destination_path,
            "url": file_url
        })

    existing.extend(saved_files)
    sess["transfer_progress"] = 100
    sess["transfer_received"] = sess.get("transfer_total") or sum(int(f.get("size") or 0) for f in saved_files)
    sess["status"] = "completed"
    sess["picking"] = False

    return {
        "success": True,
        "count": len(saved_files),
        "files": saved_files
    }


@router.get("/api/mobile/session/{session_id}/file/{file_index}")
async def get_session_file(session_id: str, file_index: int):
    sess = SESSIONS.get(session_id)
    if not sess or not sess.get("files"):
        raise HTTPException(status_code=404, detail="File not found")

    files = sess["files"]
    if file_index < 0 or file_index >= len(files):
        raise HTTPException(status_code=404, detail="Invalid file index")

    file_info = files[file_index]
    file_path = file_info["path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")

    return FileResponse(
        path=file_path,
        media_type=file_info.get("type", "application/octet-stream"),
        filename=file_info["name"]
    )


@router.get("/mobile-logo.png")
async def get_mobile_logo():
    """Serves the official ToolCEO logo."""
    logo_path = os.path.join(_PROJECT_ROOT, "assets", "icon1.png")
    if not os.path.exists(logo_path):
        logo_path = os.path.join(_PROJECT_ROOT, "assets", "icon.png")
    if os.path.exists(logo_path):
        return FileResponse(logo_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")


def _mobile_asset(filename: str, media_type: str) -> FileResponse:
    path = os.path.join(_FRONTEND_MOBILE, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(path, media_type=media_type)


@router.get("/mobile/mobile_upload.css")
async def mobile_upload_css():
    return _mobile_asset("mobile_upload.css", "text/css")


@router.get("/mobile/mobile_upload.js")
async def mobile_upload_js():
    return _mobile_asset("mobile_upload.js", "text/javascript")


# ── Branded Mobile Webpage ────────────────────────────────────────────────

@router.get("/mobile-upload", response_class=HTMLResponse)
async def serve_mobile_upload_page(session: str = "", tool: str = "images-pdf"):
    """
    Renders a responsive, modern mobile webpage styled with ToolCEO's
    exact design tokens, brand logo, tool-matching theme, and dropzone.
    """
    sess = SESSIONS.get(session)
    theme = _theme_payload(sess) if sess else {
        "tool": tool,
        "tool_name": "ToolCEO File Transfer",
        "color": "#00E5C0",
        "bg": "rgba(0, 229, 192, 0.15)",
        "icon": "",
        "mainText": "",
        "subText": "",
        "tag": "",
        "allows_camera": _resolve_format_meta(tool)["allows_camera"],
    }
    tool_name = html_escape(theme.get("tool_name") or "ToolCEO File Transfer")
    color = html_escape(theme.get("color") or "#00E5C0")
    bg = html_escape(theme.get("bg") or "rgba(0, 229, 192, 0.15)")
    asset_v = int(time.time())
    theme_json = json.dumps(theme).replace("<", "\\u003c")

    html_content = f"""<!DOCTYPE html>
<html lang="en" style="--dz-color:{color};--dz-bg:{bg};--accent:{color};--primary:{color}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ToolCEO - Mobile Transfer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/mobile/mobile_upload.css?v={asset_v}">
</head>
<body>

  <header class="header">
    <div class="logo-container">
      <img src="/mobile-logo.png" alt="ToolCEO" class="logo-img" onerror="this.style.display='none'">
      <span class="logo-text">ToolCEO</span>
    </div>
    <div class="status-badge">
      <span class="pulse-dot"></span>
      <span>Connected</span>
    </div>
  </header>

  <main class="main-card" id="main-card">
    <div class="tool-banner">
      <div class="tool-icon-box" id="tool-icon-box">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <div class="tool-info">
        <div class="tool-title-row">
          <h2 id="tool-name">{tool_name}</h2>
          <span class="hero-tool-badge" id="tool-tag" hidden></span>
        </div>
        <p>Send files directly to your desktop workspace</p>
      </div>
    </div>

    <div id="form-view">
      <div class="drop-zone" id="mobile-dropzone">
        <!-- Empty State Elements -->
        <span id="drop-icon-slot">
          <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </span>
        <span class="drop-main-text" id="drop-main-text">Select files to send</span>
        <span class="drop-browse" id="drop-sub-text">Browse files from your phone</span>
        <span class="drop-format-hint" id="drop-format-hint" style="display:none"></span>
        <span class="drop-private">Your files will be sent to your desktop ToolCEO.</span>

        <!-- Loaded State: Thumbnail Strip inside Drop Zone (mirrors desktop) -->
        <div class="dz-jpg-thumb-strip" id="mobile-thumb-strip" style="display: none;"></div>

        <!-- In-Dropzone Circular Progress Ring (Matches Desktop dz-progress-wrap) -->
        <div class="dz-progress-wrap" id="job-progress-view" style="display: none;">
          <div class="dz-progress-content">
            <svg class="dz-ring-svg" width="110" height="110" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle class="dz-ring-glow" cx="55" cy="55" r="28"/>
              <circle class="dz-ring-track" cx="55" cy="55" r="40"/>
              <circle class="dz-ring-fill" id="job-ring-fill" cx="55" cy="55" r="40" stroke="{color}" stroke-dasharray="251.327 251.327" stroke-dashoffset="251.327" style="transform-origin:55px 55px"/>
            </svg>
            <div class="dz-ring-center">
              <span class="dz-pct" id="job-ring-pct">0%</span>
              <span class="dz-progress-label" id="job-progress-label">PROCESSING</span>
            </div>
          </div>
        </div>

        <!-- In-Dropzone Download Card (Matches Desktop dz-save-card) -->
        <div class="dz-download-wrap" id="job-done-view" style="display: none;">
          <div class="dz-save-card" id="mobile-save-card" style="--save-color:{color}">
            <button class="dz-save-close" id="job-close-btn" type="button" title="Close download window" aria-label="Close download window">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="dz-save-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="dz-save-info">
              <span class="dz-save-name" id="job-done-filename" title=""></span>
              <span class="dz-save-ext" id="job-done-ext">File ready to download</span>
            </div>
            <button class="dz-save-btn" id="job-download-btn" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
                <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
              </svg>Download File
            </button>
            <div class="dz-save-done" id="job-save-done">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
                <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Downloaded successfully
            </div>
          </div>
        </div>
      </div>

      <div class="action-chips" id="action-chips">
        <button type="button" class="action-chip" id="choose-gallery-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h5"/></svg>
          <span id="choose-gallery-label">Browse Files</span>
        </button>
        <button type="button" class="action-chip" id="take-photo-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Take Photo
        </button>
      </div>

      <div class="mobile-send-panel" id="mobile-send-panel" style="display: none;">
        <div class="mobile-send-copy">
          <span class="mobile-send-kicker">Ready to send</span>
          <span class="mobile-send-count" id="mobile-send-count">0 files selected</span>
        </div>
        <button type="button" class="mobile-send-btn" id="mobile-send-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/>
          </svg>
          <span>Send to Desktop</span>
        </button>
      </div>

      <input type="file" id="file-input-gallery" multiple accept="image/*,application/pdf,application/*" />
      <input type="file" id="file-input-camera" accept="image/*" capture="environment" />

      <!-- Sync Info Bar below Drop Zone -->
      <div class="mobile-desktop-sync-bar" id="mobile-sync-bar" style="display: none; margin-top: 14px;">
        <span class="pulse-dot"></span>
        <span id="mobile-sync-text">Files sent to desktop &mdash; ready in workspace</span>
      </div>

      <div class="progress-bar-container" id="progress-container">
        <div class="progress-bar" id="progress-bar"></div>
      </div>
    </div>

    <div class="success-view" id="success-view">
      <div class="success-icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="success-title">Files Transferred!</div>
      <div class="success-desc">Your files have been delivered to your desktop dropzone. You can now convert or edit them on your PC.</div>
      <button type="button" class="action-chip" id="send-more-btn" style="margin-top: 10px; width: 100%; padding: 12px;">
        Send More Files
      </button>
    </div>

    <div class="disconnected-view" id="disconnected-view">
      <div class="disconnected-icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
      <div class="disconnected-title">Session Ended</div>
      <div class="disconnected-desc" id="disconnected-desc">The desktop closed this transfer session.<br>Scan a new QR code to start again.</div>
    </div>
  </main>

  <script id="mobile-theme" type="application/json">{theme_json}</script>
  <script>window.MOBILE_SESSION_ID = {json.dumps(session)};</script>
  <script src="/mobile/mobile_upload.js?v={asset_v}"></script>
</body>
</html>"""
    return HTMLResponse(content=html_content)
