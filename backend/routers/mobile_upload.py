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


def _theme_payload(sess: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "tool": sess.get("tool"),
        "tool_name": sess.get("tool_name"),
        "color": sess.get("color", "#00E5C0"),
        "bg": sess.get("bg", "rgba(0, 229, 192, 0.15)"),
        "icon": sess.get("icon") or "",
        "mainText": sess.get("mainText") or "",
        "subText": sess.get("subText") or "",
        "tag": sess.get("tag") or "",
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

    safe_tool = "".join(c for c in (tool or "tool") if c.isalnum() or c in "-_")[:10]
    session_id = f"{safe_tool}_{uuid.uuid4().hex[:8]}"
    session_dir = os.path.join(MOBILE_TEMP_ROOT, session_id)
    os.makedirs(session_dir, exist_ok=True)

    local_ip = get_local_ip()
    port = request.url.port or 8765

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
        "created_at": time.time(),
        "last_seen": None,
        "picking": False,
        "status": "waiting",  # waiting -> connected -> uploading -> completed
        "dir": session_dir,
        "files": [],
        "acked_until": 0,
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
    if status in ("completed", "cancelled", "waiting", "phone_disconnected"):
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
    """Live snapshot of the desktop conversion job linked to this session.

    The desktop links a jobId when a tool execution starts and unlinks it when
    the user cancels/closes the result card. Progress itself is read live from
    the jobs store so the phone is always in sync with what the desktop ring
    shows, without any desktop-side push loop.
    """
    job_id = sess.get("job_id")
    if not job_id:
        return None
    snap = get_job_snapshot(str(job_id))
    if not snap:
        sess["job_id"] = None
        return None
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

    return {
        "session_id": session_id,
        "status": sess.get("status", "waiting"),
        "picking": bool(sess.get("picking")),
        "last_seen": sess.get("last_seen"),
        "files_count": len(pending),
        "files": pending,
        "job": _session_job_payload(sess),
        **_theme_payload(sess),
    }


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
    else:
        sess["job_id"] = None
        sess["job_filename"] = ""
    return {"ok": True, "job_id": sess.get("job_id")}


@router.post("/api/mobile/session/{session_id}/ping")
async def ping_session(session_id: str):
    """Phone calls this as soon as page loads to signal it has connected."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")
    sess["last_seen"] = time.time()
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

    sess["status"] = "uploading"
    sess["picking"] = False
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
            "name": os.path.basename(destination_path),
            "size": file_size,
            "type": file.content_type or "application/octet-stream",
            "path": destination_path,
            "url": file_url
        })

    existing.extend(saved_files)
    sess["status"] = "completed"

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
      <span>PC Connected</span>
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
        <h2 id="tool-name">{tool_name}</h2>
        <p>Send files directly to your desktop workspace <span class="hero-tool-badge" id="tool-tag" hidden></span></p>
      </div>
    </div>

    <div id="form-view">
      <div class="drop-zone" id="mobile-dropzone">
        <span id="drop-icon-slot">
          <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </span>
        <span class="drop-main-text" id="drop-main-text">Tap to choose files</span>
        <span class="drop-browse" id="drop-sub-text">or click to pick your file</span>
        <span class="drop-private">Your files never leave your device.</span>
      </div>

      <div class="action-chips">
        <button type="button" class="action-chip" id="choose-gallery-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Gallery / Files
        </button>
        <button type="button" class="action-chip" id="take-photo-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Take Photo
        </button>
      </div>

      <input type="file" id="file-input-gallery" multiple accept="image/*,application/pdf,application/*" />
      <input type="file" id="file-input-camera" accept="image/*" capture="environment" />

      <div id="preview-section" style="display: none; margin-top: 14px;">
        <div class="preview-header">
          <span class="preview-title">Selected Files</span>
          <span class="file-count-badge" id="file-count">0 files</span>
        </div>
        <div class="preview-grid" id="preview-grid" style="margin-top: 10px;"></div>
      </div>

      <div class="progress-bar-container" id="progress-container">
        <div class="progress-bar" id="progress-bar"></div>
      </div>

      <button type="button" class="send-btn" id="send-btn" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <span id="send-btn-text">Send to Desktop</span>
      </button>
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

    <div class="job-progress-view" id="job-progress-view">
      <div class="job-progress-ring-wrap">
        <svg class="job-ring" viewBox="0 0 80 80">
          <circle class="job-ring-track" cx="40" cy="40" r="34"/>
          <circle class="job-ring-fill" id="job-ring-fill" cx="40" cy="40" r="34"/>
        </svg>
        <span class="job-ring-pct" id="job-ring-pct">0%</span>
      </div>
      <div class="job-progress-label" id="job-progress-label">Processing on Desktop…</div>
      <div class="job-progress-filename" id="job-progress-filename"></div>
      <button type="button" class="job-cancel-btn" id="job-cancel-btn">✕ Cancel</button>
    </div>

    <div class="job-done-view" id="job-done-view">
      <div class="job-done-icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="job-done-title">Ready to Download!</div>
      <div class="job-done-filename" id="job-done-filename"></div>
      <a class="job-download-btn" id="job-download-btn" download>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Download File</span>
      </a>
      <button type="button" class="job-new-btn" id="job-new-btn">Send More Files</button>
    </div>
  </main>

  <script id="mobile-theme" type="application/json">{theme_json}</script>
  <script>window.MOBILE_SESSION_ID = {json.dumps(session)};</script>
  <script src="/mobile/mobile_upload.js?v={asset_v}"></script>
</body>
</html>"""
    return HTMLResponse(content=html_content)
