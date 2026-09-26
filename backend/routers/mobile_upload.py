import os
import time
import socket
import shutil
import tempfile
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse

router = APIRouter()

# ── Session Storage (In-Memory with 15-min TTL) ──────────────────────────
SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_TTL_SECONDS = 15 * 60  # 15 minutes
MOBILE_TEMP_ROOT = os.path.join(tempfile.gettempdir(), "toolceo_mobile_uploads")
os.makedirs(MOBILE_TEMP_ROOT, exist_ok=True)


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
    session_id = str(uuid.uuid4())[:10]
    session_dir = os.path.join(MOBILE_TEMP_ROOT, session_id)
    os.makedirs(session_dir, exist_ok=True)

    local_ip = get_local_ip()
    port = request.url.port or 8765

    SESSIONS[session_id] = {
        "id": session_id,
        "tool": tool,
        "tool_name": tool_name,
        "created_at": time.time(),
        "status": "waiting",  # waiting -> connected -> uploading -> completed
        "dir": session_dir,
        "files": []
    }

    url = f"http://{local_ip}:{port}/mobile-upload?session={session_id}&tool={tool}"

    return {
        "session_id": session_id,
        "url": url,
        "local_ip": local_ip,
        "port": port,
        "tool": tool,
        "tool_name": tool_name,
        "status": "waiting"
    }


@router.get("/api/mobile/session/{session_id}/status")
async def get_session_status(session_id: str):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired or not found")

    return {
        "session_id": session_id,
        "status": sess.get("status", "waiting"),
        "tool": sess.get("tool"),
        "tool_name": sess.get("tool_name"),
        "files_count": len(sess.get("files", [])),
        "files": sess.get("files", [])
    }


@router.post("/api/mobile/session/{session_id}/ping")
async def ping_session(session_id: str):
    """Phone calls this as soon as page loads to signal it has connected."""
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session expired")
    if sess["status"] == "waiting":
        sess["status"] = "connected"
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
    target_dir = sess["dir"]
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
        file_url = f"/api/mobile/session/{session_id}/file/{len(saved_files)}"

        saved_files.append({
            "name": os.path.basename(destination_path),
            "size": file_size,
            "type": file.content_type or "application/octet-stream",
            "path": destination_path,
            "url": file_url
        })

    sess["files"] = saved_files
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
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logo_path = os.path.join(os.path.dirname(base_dir), "assets", "icon1.png")
    if not os.path.exists(logo_path):
        logo_path = os.path.join(os.path.dirname(base_dir), "assets", "icon.png")
    if os.path.exists(logo_path):
        return FileResponse(logo_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")


# ── Branded Mobile Webpage ────────────────────────────────────────────────

@router.get("/mobile-upload", response_class=HTMLResponse)
async def serve_mobile_upload_page(session: str = "", tool: str = "images-pdf"):
    """
    Renders a responsive, modern mobile webpage styled with ToolCEO's
    exact design tokens, brand logo, tool-matching theme, and dropzone.
    """
    sess = SESSIONS.get(session)
    tool_name = sess.get("tool_name", "ToolCEO File Transfer") if sess else "ToolCEO File Transfer"

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ToolCEO - Mobile Transfer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg: #0B0F19;
      --card-bg: rgba(22, 28, 45, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #00E5C0;
      --primary-glow: rgba(0, 229, 192, 0.25);
      --primary-hover: #00ffda;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --danger: #EF4444;
      --success: #10B981;
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }}

    body {{
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      overflow-x: hidden;
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(0, 229, 192, 0.12), transparent 45%),
        radial-gradient(circle at 100% 100%, rgba(30, 58, 138, 0.15), transparent 40%);
    }}

    /* Header & Logo */
    .header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      max-width: 480px;
      padding: 12px 6px 20px;
    }}

    .logo-container {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .logo-img {{
      width: 38px;
      height: 38px;
      border-radius: 10px;
      box-shadow: 0 4px 14px var(--primary-glow);
      object-fit: cover;
    }}

    .logo-text {{
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #FFFFFF 40%, var(--primary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}

    .status-badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #34D399;
      font-size: 11px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 20px;
    }}

    .pulse-dot {{
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
      animation: pulse 1.8s infinite;
    }}

    @keyframes pulse {{
      0% {{ transform: scale(0.95); opacity: 0.7; }}
      50% {{ transform: scale(1.25); opacity: 1; }}
      100% {{ transform: scale(0.95); opacity: 0.7; }}
    }}

    /* Main Container */
    .main-card {{
      width: 100%;
      max-width: 480px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      padding: 22px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 18px;
    }}

    .tool-banner {{
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }}

    .tool-icon-box {{
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: rgba(0, 229, 192, 0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
    }}

    .tool-info h2 {{
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
    }}

    .tool-info p {{
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }}

    /* Mobile Drop Zone */
    .drop-zone {{
      border: 2px dashed rgba(0, 229, 192, 0.35);
      border-radius: 16px;
      background: rgba(0, 229, 192, 0.03);
      padding: 26px 16px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
    }}

    .drop-zone:active {{
      background: rgba(0, 229, 192, 0.08);
      border-color: var(--primary);
      transform: scale(0.99);
    }}

    .drop-icon {{
      width: 48px;
      height: 48px;
      color: var(--primary);
      filter: drop-shadow(0 4px 10px var(--primary-glow));
    }}

    .drop-title {{
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
    }}

    .drop-subtitle {{
      font-size: 12px;
      color: var(--text-muted);
    }}

    .action-chips {{
      display: flex;
      gap: 8px;
      margin-top: 4px;
      width: 100%;
    }}

    .action-chip {{
      flex: 1;
      padding: 10px 8px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
    }}

    .action-chip:active {{
      background: rgba(255, 255, 255, 0.12);
    }}

    input[type="file"] {{
      display: none;
    }}

    /* Preview Grid */
    .preview-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
    }}

    .preview-title {{
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
    }}

    .file-count-badge {{
      background: rgba(0, 229, 192, 0.15);
      color: var(--primary);
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 12px;
    }}

    .preview-grid {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      max-height: 240px;
      overflow-y: auto;
      padding-right: 4px;
    }}

    .preview-item {{
      position: relative;
      aspect-ratio: 1;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.3);
    }}

    .preview-item img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}

    .preview-item-doc {{
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 6px;
      text-align: center;
      font-size: 10px;
      color: var(--text-muted);
    }}

    .remove-btn {{
      position: absolute;
      top: 4px;
      right: 4px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.65);
      color: #FFF;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
    }}

    /* Upload Action Button */
    .send-btn {{
      width: 100%;
      padding: 14px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--primary) 0%, #00B89C 100%);
      color: #061A16;
      border: none;
      font-size: 15px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 18px var(--primary-glow);
      cursor: pointer;
      transition: all 0.2s ease;
      margin-top: 6px;
    }}

    .send-btn:disabled {{
      opacity: 0.4;
      cursor: not-allowed;
      box-shadow: none;
    }}

    .send-btn:not(:disabled):active {{
      transform: scale(0.98);
    }}

    /* Progress & Success */
    .progress-bar-container {{
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      overflow: hidden;
      margin-top: 8px;
      display: none;
    }}

    .progress-bar {{
      height: 100%;
      width: 0%;
      background: var(--primary);
      transition: width 0.2s ease;
    }}

    .success-view {{
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 30px 10px;
      gap: 16px;
    }}

    .success-icon {{
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      border: 2px solid var(--success);
      color: var(--success);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
      animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }}

    @keyframes popIn {{
      0% {{ transform: scale(0.5); opacity: 0; }}
      100% {{ transform: scale(1); opacity: 1; }}
    }}

    .success-title {{
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
    }}

    .success-desc {{
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }}
  </style>
</head>
<body>

  <!-- Top Bar -->
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

  <!-- Main Upload Card -->
  <main class="main-card" id="main-card">
    <div class="tool-banner">
      <div class="tool-icon-box">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <div class="tool-info">
        <h2>{tool_name}</h2>
        <p>Send files directly to your desktop workspace</p>
      </div>
    </div>

    <!-- Active Form View -->
    <div id="form-view">
      <div class="drop-zone" id="mobile-dropzone">
        <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div>
          <div class="drop-title">Tap to choose files</div>
          <div class="drop-subtitle">or take new photos with camera</div>
        </div>
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

      <!-- Preview Header & Deck -->
      <div id="preview-section" style="display: none; margin-top: 14px;">
        <div class="preview-header">
          <span class="preview-title">Selected Files</span>
          <span class="file-count-badge" id="file-count">0 files</span>
        </div>
        <div class="preview-grid" id="preview-grid" style="margin-top: 10px;"></div>
      </div>

      <!-- Upload Progress -->
      <div class="progress-bar-container" id="progress-container">
        <div class="progress-bar" id="progress-bar"></div>
      </div>

      <!-- Action Button -->
      <button type="button" class="send-btn" id="send-btn" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <span id="send-btn-text">Send to Desktop</span>
      </button>
    </div>

    <!-- Success View -->
    <div class="success-view" id="success-view">
      <div class="success-icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="success-title">Files Transferred!</div>
      <div class="success-desc">Your files have been delivered to your desktop dropzone. You can now convert or edit them on your PC.</div>
      <button type="button" class="action-chip" style="margin-top: 10px; width: 100%; padding: 12px;" onclick="window.location.reload()">
        Send More Files
      </button>
    </div>
  </main>

  <script>
    const sessionId = "{session}";
    let selectedFiles = [];

    // Notify backend that phone opened the page
    if (sessionId) {{
      fetch(`/api/mobile/session/${{sessionId}}/ping`, {{ method: 'POST' }}).catch(() => {{}});
    }}

    const dropzone = document.getElementById('mobile-dropzone');
    const galleryInput = document.getElementById('file-input-gallery');
    const cameraInput = document.getElementById('file-input-camera');
    const previewSection = document.getElementById('preview-section');
    const previewGrid = document.getElementById('preview-grid');
    const fileCount = document.getElementById('file-count');
    const sendBtn = document.getElementById('send-btn');
    const sendBtnText = document.getElementById('send-btn-text');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const formView = document.getElementById('form-view');
    const successView = document.getElementById('success-view');

    dropzone.addEventListener('click', () => galleryInput.click());
    document.getElementById('choose-gallery-btn').addEventListener('click', () => galleryInput.click());
    document.getElementById('take-photo-btn').addEventListener('click', () => cameraInput.click());

    function addFiles(newFiles) {{
      for (const file of newFiles) {{
        selectedFiles.push(file);
      }}
      renderPreviews();
    }}

    galleryInput.addEventListener('change', (e) => {{
      if (e.target.files?.length) addFiles(e.target.files);
      galleryInput.value = '';
    }});

    cameraInput.addEventListener('change', (e) => {{
      if (e.target.files?.length) addFiles(e.target.files);
      cameraInput.value = '';
    }});

    function renderPreviews() {{
      previewGrid.innerHTML = '';
      if (selectedFiles.length === 0) {{
        previewSection.style.display = 'none';
        sendBtn.disabled = true;
        sendBtnText.textContent = 'Send to Desktop';
        return;
      }}

      previewSection.style.display = 'block';
      fileCount.textContent = `${{selectedFiles.length}} file${{selectedFiles.length > 1 ? 's' : ''}}`;
      sendBtn.disabled = false;
      sendBtnText.textContent = `Send ${{selectedFiles.length}} File${{selectedFiles.length > 1 ? 's' : ''}} to PC`;

      selectedFiles.forEach((file, index) => {{
        const item = document.createElement('div');
        item.className = 'preview-item';

        if (file.type.startsWith('image/')) {{
          const img = document.createElement('img');
          img.src = URL.createObjectURL(file);
          item.appendChild(img);
        }} else {{
          const doc = document.createElement('div');
          doc.className = 'preview-item-doc';
          doc.innerHTML = `<strong>${{file.name.slice(0, 16)}}</strong><span>${{(file.size / 1024).toFixed(0)}} KB</span>`;
          item.appendChild(doc);
        }}

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = (e) => {{
          e.stopPropagation();
          selectedFiles.splice(index, 1);
          renderPreviews();
        }};
        item.appendChild(removeBtn);
        previewGrid.appendChild(item);
      }});
    }}

    sendBtn.addEventListener('click', async () => {{
      if (selectedFiles.length === 0 || !sessionId) return;

      sendBtn.disabled = true;
      sendBtnText.textContent = 'Sending...';
      progressContainer.style.display = 'block';
      progressBar.style.width = '10%';

      const formData = new FormData();
      for (const file of selectedFiles) {{
        formData.append('files', file);
      }}

      try {{
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/mobile/upload/${{sessionId}}`, true);

        xhr.upload.onprogress = (e) => {{
          if (e.lengthComputable) {{
            const pct = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = `${{pct}}%`;
          }}
        }};

        xhr.onload = () => {{
          if (xhr.status >= 200 && xhr.status < 300) {{
            progressBar.style.width = '100%';
            setTimeout(() => {{
              formView.style.display = 'none';
              successView.style.display = 'flex';
            }}, 300);
          }} else {{
            alert('Upload failed. Please try again.');
            sendBtn.disabled = false;
            sendBtnText.textContent = 'Retry Sending';
            progressContainer.style.display = 'none';
          }}
        }};

        xhr.onerror = () => {{
          alert('Network error. Ensure your phone and PC are connected to the same Wi-Fi.');
          sendBtn.disabled = false;
          sendBtnText.textContent = 'Retry Sending';
          progressContainer.style.display = 'none';
        }};

        xhr.send(formData);
      }} catch (err) {{
        alert('Error: ' + err.message);
        sendBtn.disabled = false;
        sendBtnText.textContent = 'Retry Sending';
        progressContainer.style.display = 'none';
      }}
    }});
  </script>
</body>
</html>"""
    return HTMLResponse(content=html_content)
