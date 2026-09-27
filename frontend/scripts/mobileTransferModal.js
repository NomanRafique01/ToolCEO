/**
 * frontend/scripts/mobileTransferModal.js
 *
 * Renders the "Send from Phone" QR pairing panel DIRECTLY INSIDE the drop zone,
 * matching the native ToolCEO in-place morphing pattern (no separate overlay/window).
 */

import { getActiveTool, onToolChange, setToolSwitchGuard } from './toolstate.js';
import { pushNotification } from './notificationStore.js';
import { handleExternalFiles } from './dropzone.js';
import { bindMirrorSession, unbindMirrorSession } from './mobileJobMirror.js';

let _activeSessionId = null;
let _pollTimer = null;
let _activeMobileUrl = null;
let _connectedNotified = false;
let _activeToolLabel = null;
let _pairedToolId = null;
let _suppressDisconnectNotice = false;
let _ingestingFiles = false;

function _isPhoneLive() {
  return Boolean(_activeSessionId && _connectedNotified);
}

function _notifyDisconnectBeforeLoad(requestedName) {
  const connectedName = _activeToolLabel || getActiveTool()?.label || getActiveTool()?.name || 'the current tool';
  const loadName = requestedName || 'this tool';
  pushNotification({
    type: 'warning',
    message: `To load ${loadName}, please first disconnect ${connectedName} from phone`,
  });
}

function _guardToolSwitch(nextTool, currentTool) {
  if (!_isPhoneLive()) return true;
  // Clearing the active tool is how sidebar/category navigation resets the
  // hero. Refuse it silently while paired so browsing other categories keeps
  // the session alive and the tool is still connected when the user returns.
  if (!nextTool) return false;
  const nextId = nextTool?.id || null;
  const currentId = currentTool?.id || _pairedToolId || null;
  if (nextId && currentId && String(nextId) === String(currentId)) return true;
  _notifyDisconnectBeforeLoad(nextTool?.label || nextTool?.name || null);
  return false;
}

setToolSwitchGuard(_guardToolSwitch);

// Selecting another tool (or clearing the selection) must tear the QR panel
// down: its dz-has-phone-transfer class hides the dropzone's default contents,
// so a stale panel would block the newly selected tool from rendering.
onToolChange((tool) => {
  if (!_activeSessionId) return;
  if (tool && _pairedToolId && String(tool.id) === String(_pairedToolId)) return;
  closeMobileTransferModal();
});

/**
 * Opens the mobile transfer panel directly inside the dropzone.
 */
export async function openMobileTransferModal() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    pushNotification({
      type: 'warning',
      message: 'You are currently offline',
      detail: 'Connect to the internet to share files from your phone.',
    });
    return;
  }

  if (_activeSessionId && _connectedNotified) {
    _ensureConnectedBadge('connected');
    return;
  }

  // Clear previous panel if any
  closeMobileTransferModal();

  const tool = getActiveTool();
  if (!tool) {
    pushNotification({
      type: 'warning',
      message: 'Please Select a Tool First',
    });
    return;
  }

  const toolName = tool.label || tool.name || 'Tool';
  const formatLabel = _mobileFormatLabel(tool);
  _activeToolLabel = toolName;
  _pairedToolId = tool.id || null;

  // Theme the panel to the active tool's color
  const toolColor = tool.color || '#00E5C0';
  _applyToolAccent(toolColor);

  // Set active class on dropzone
  zone.classList.add('dz-has-phone-transfer');

  const panelHtml = `
    <div class="dz-phone-panel" id="dz-phone-panel">
      <!-- Header -->
      <div class="dz-phone-header">
        <div class="dz-phone-header-text">
          <h3>Send from Phone</h3>
          <p>Scan to transfer ${formatLabel} directly to this tool</p>
        </div>
        <div class="dz-phone-header-right">
          <div class="dz-phone-tool-badge">${toolName}</div>
          <button type="button" class="dz-phone-close-btn" id="dz-phone-close-btn" title="Back to dropzone">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Center: QR Box -->
      <div class="dz-phone-qr-box">
        <div class="dz-phone-qr-card">
          <div class="dz-phone-qr-loader" id="dz-phone-qr-loader">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00E5C0" stroke-width="2.5" stroke-linecap="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span>Generating…</span>
          </div>
          <img id="dz-phone-qr-img" class="dz-phone-qr-img" style="display: none;" alt="QR Code" />
        </div>
      </div>

      <!-- Details & Status -->
      <div class="dz-phone-details">
        <div class="dz-phone-status-pill" id="dz-phone-status-pill">
          <span class="dz-phone-status-dot"></span>
          <span id="dz-phone-status-text">Generating QR code…</span>
        </div>

        <div class="dz-phone-steps">
          <div class="dz-phone-step">
            <span class="dz-phone-step-num">1</span>
            <span>Connect phone to the same Wi-Fi network</span>
          </div>
          <div class="dz-phone-step">
            <span class="dz-phone-step-num">2</span>
            <span>Scan the QR code with your phone camera</span>
          </div>
          <div class="dz-phone-step">
            <span class="dz-phone-step-num">3</span>
            <span>Select or snap photos to upload directly</span>
          </div>
        </div>

        <div class="dz-phone-footer">
          <button type="button" class="dz-phone-cancel-btn" id="dz-phone-cancel-btn">← Back to Dropzone</button>
          <button type="button" class="dz-phone-copy-btn" id="dz-phone-copy-btn">Copy Link</button>
        </div>
      </div>
    </div>
  `;

  zone.insertAdjacentHTML('beforeend', panelHtml);

  // Bind close and cancel handlers
  document.getElementById('dz-phone-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMobileTransferModal();
  });

  document.getElementById('dz-phone-cancel-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMobileTransferModal();
  });

  document.getElementById('dz-phone-copy-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_activeMobileUrl) {
      navigator.clipboard.writeText(_activeMobileUrl).then(() => {
        const btn = document.getElementById('dz-phone-copy-btn');
        if (btn) {
          btn.textContent = '✓ Copied';
          setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
        }
      });
    }
  });

  // Prevent clicks inside panel from triggering file picker
  document.getElementById('dz-phone-panel')?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Call backend to create pairing session
  try {
    const backendUrl = window.TOOLCEO_BACKEND_URL || 'http://127.0.0.1:8765';
    const res = await fetch(`${backendUrl}/api/mobile/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: tool.id,
        tool_name: toolName,
        color: tool.color || '#00E5C0',
        bg: tool.bg || 'rgba(0, 229, 192, 0.15)',
        icon: tool.icon || '',
        mainText: tool.mainText || '',
        subText: tool.subText || '',
        tag: tool.tag || '',
      }),
    });

    if (!res.ok) throw new Error('Failed to create pairing session');
    const sessionData = await res.json();
    _activeSessionId = sessionData.session_id;
    _activeMobileUrl = sessionData.url;

    // Bind this session so any tool job is automatically mirrored to the phone
    bindMirrorSession(_activeSessionId, tool.id || null);

    // Generate QR code
    let qrDataUrl = null;
    if (window.toolceo?.generateQrCode) {
      const qrRes = await window.toolceo.generateQrCode(_activeMobileUrl, { width: 190, margin: 1 });
      if (qrRes?.ok) qrDataUrl = qrRes.dataUrl;
    }

    if (!qrDataUrl) {
      qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=${encodeURIComponent(_activeMobileUrl)}`;
    }

    const qrLoader = document.getElementById('dz-phone-qr-loader');
    const qrImg = document.getElementById('dz-phone-qr-img');
    const statusText = document.getElementById('dz-phone-status-text');

    if (qrImg) {
      qrImg.src = qrDataUrl;
      qrImg.onload = () => {
        if (qrLoader) qrLoader.style.display = 'none';
        qrImg.style.display = 'block';
      };
    }

    if (statusText) statusText.textContent = 'Waiting for phone to scan…';

    // Start polling
    _startPolling(backendUrl, _activeSessionId);

  } catch (err) {
    console.error('[mobile-transfer]', err);
    const statusText = document.getElementById('dz-phone-status-text');
    if (statusText) statusText.textContent = 'Error: ' + err.message;
  }
}

/**
 * Returns a human-readable format label for the subtitle, e.g. "PDFs", "images", "EPUB files".
 * Derived purely from the tool id so no extra data is needed on the tool object.
 */
function _mobileFormatLabel(tool) {
  if (!tool) return 'files';
  const id = String(tool.id || '');

  // Multi-file PDF tools
  if (id === 'merge' || id === 'images-pdf') return id === 'merge' ? 'PDFs' : 'images';

  // PDF family (single PDF in)
  if (id.startsWith('pdf-') || id.match(/^(split|compress|encrypt|watermark|edit-pdf|extract-images|pdf-to-)/) ||
      /^(split|compress|encrypt|watermark)$/.test(id)) return 'a PDF';
  if (id.endsWith('-pdf') && !id.startsWith('archive')) return 'a PDF';

  // Image categories
  if (id === 'image_compressor') return 'images';
  if (id.match(/^(jpg|jpeg)(-|$)/) || id === 'jpg') return 'a JPG';
  if (id.match(/^png(-|$)/) || id === 'png') return 'a PNG';
  if (id.match(/^webp(-|$)/) || id === 'webp') return 'a WebP';
  if (id === 'svg' || id.startsWith('svg-')) return 'an SVG';
  if (id === 'gif' || id.startsWith('gif-')) return 'a GIF';
  if (id === 'bmp' || id.startsWith('bmp-')) return 'a BMP';
  if (id === 'tiff' || id.startsWith('tiff-')) return 'a TIFF';
  if (id === 'heic' || id.startsWith('heic-')) return 'a HEIC';
  if (/^(jpg-|jpeg-|png-|webp-|gif-|bmp-|tiff-)/.test(id)) return 'an image';

  // Ebook input formats
  if (id.startsWith('epub-')) return 'an EPUB';
  if (id.startsWith('mobi-')) return 'a MOBI';
  if (id.startsWith('azw3-')) return 'an AZW3';
  if (id.startsWith('fb2-')) return 'an FB2';
  if (id.startsWith('rtf-') && !id.startsWith('archive')) return 'an RTF';

  // Document input formats
  if (id.startsWith('docx-') || id === 'docx') return 'a DOCX';
  if (id.startsWith('xlsx-') || id === 'xlsx') return 'an XLSX';
  if (id.startsWith('pptx-') || id === 'pptx') return 'a PPTX';
  if (id.startsWith('csv-') || id === 'csv') return 'a CSV';
  if (id.startsWith('odt-') || id === 'odt') return 'an ODT';
  if (id.startsWith('txt-') || id === 'txt') return 'a TXT';

  // Archive create tools (accept any files/folder)
  if (id.startsWith('archive-folder-')) return 'a folder';
  if (id.startsWith('archive-create-') || id.startsWith('archive-merge')) return 'files';

  // Archive extract / convert / utility — identify the container format
  if (id.includes('zip')) return 'a ZIP';
  if (id.includes('7z')) return 'a 7Z';
  if (id.includes('rar')) return 'a RAR';
  if (id.includes('tar-gz') || id.includes('tar.gz')) return 'a TAR.GZ';
  if (id.includes('tar-bz2')) return 'a TAR.BZ2';
  if (id.includes('tar-xz')) return 'a TAR.XZ';
  if (id.includes('tar')) return 'a TAR';
  if (id.includes('gz')) return 'a GZ';
  if (id.includes('bz2')) return 'a BZ2';
  if (id.includes('xz')) return 'an XZ';
  if (id.includes('iso')) return 'an ISO';
  if (id.includes('cab')) return 'a CAB';
  if (id.includes('wim')) return 'a WIM';
  if (id.includes('dmg')) return 'a DMG';
  if (id.startsWith('archive-')) return 'an archive';

  return 'files';
}


function _withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function _accentTargets() {
  return [document.getElementById('drop-zone'), document.querySelector('.hero-card')].filter(Boolean);
}

function _applyToolAccent(toolColor) {
  for (const el of _accentTargets()) {
    el.style.setProperty('--tool-accent', toolColor);
    el.style.setProperty('--tool-accent-soft', _withAlpha(toolColor, 0.10));
    el.style.setProperty('--tool-accent-mid', _withAlpha(toolColor, 0.20));
    el.style.setProperty('--tool-accent-border', _withAlpha(toolColor, 0.35));
    el.style.setProperty('--tool-accent-glow', _withAlpha(toolColor, 0.15));
  }
}

function _clearToolAccent() {
  for (const el of _accentTargets()) {
    el.style.removeProperty('--tool-accent');
    el.style.removeProperty('--tool-accent-soft');
    el.style.removeProperty('--tool-accent-mid');
    el.style.removeProperty('--tool-accent-border');
    el.style.removeProperty('--tool-accent-glow');
  }
}

/**
 * Hide the QR pairing panel and restore the normal drop zone while the
 * phone session stays alive (polling continues).
 */
function _revealDropZoneWhilePaired(mode = 'connected') {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;
  zone.querySelector('.dz-phone-panel')?.remove();
  zone.classList.remove('dz-has-phone-transfer');
  zone.classList.add('dz-phone-paired');
  _ensureConnectedBadge(mode);
}

/**
 * True while a phone session is live and the dropzone is in paired mode.
 */
export function isPhonePaired() {
  return Boolean(_activeSessionId && document.getElementById('drop-zone')?.classList.contains('dz-phone-paired'));
}

/**
 * Shown when the user tries to pick/paste/drop files on PC while the phone is connected.
 */
export function notifyPhoneSelectRequired() {
  const tool = getActiveTool();
  const toolName = tool?.label || tool?.name || _activeToolLabel || 'This tool';
  const formatLabel = _mobileFormatLabel(tool);
  pushNotification({
    type: 'info',
    message: `${toolName} is connected with your Phone, Please Select ${formatLabel} from your phone`,
  });
}

function _ensureConnectedBadge(mode = 'connected') {
  const host = document.querySelector('.hero-header-right') || document.getElementById('drop-zone');
  if (!host) return;

  document.getElementById('drop-zone')?.querySelector('#dz-phone-live-badge')?.remove();

  let badge = document.getElementById('dz-phone-live-badge');
  if (!badge) {
    host.insertAdjacentHTML('beforeend', `
      <div class="dz-phone-live-badge" id="dz-phone-live-badge" role="status" aria-live="polite">
        <span class="dz-phone-status-dot"></span>
        <span class="dz-phone-live-label">Connected with Phone</span>
        <button type="button" class="dz-phone-live-disconnect" id="dz-phone-live-disconnect" title="Disconnect phone" aria-label="Disconnect phone">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `);
    badge = document.getElementById('dz-phone-live-badge');
    badge?.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('dz-phone-live-disconnect')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMobileTransferModal();
    });
  }

  const tool = getActiveTool();
  if (tool?.color) _applyToolAccent(tool.color);

  badge.classList.remove('is-uploading', 'is-waiting');
  const label = badge.querySelector('.dz-phone-live-label');
  if (mode === 'uploading') {
    badge.classList.add('is-uploading');
    if (label) label.textContent = 'Receiving from Phone';
  } else if (mode === 'waiting') {
    badge.classList.add('is-waiting');
    if (label) label.textContent = 'Waiting for Phone';
  } else {
    if (label) label.textContent = 'Connected with Phone';
  }
}

/**
 * Removes the in-dropzone panel and reverts dropzone to normal state.
 */
export function closeMobileTransferModal({ silent = false, notice, detail } = {}) {
  const zone = document.getElementById('drop-zone');
  const wasConnected = _connectedNotified;
  const hadSession = Boolean(_activeSessionId);
  const toolLabel = _activeToolLabel;
  const suppress = _suppressDisconnectNotice;

  if (zone) {
    zone.querySelector('.dz-phone-panel')?.remove();
    zone.classList.remove('dz-has-phone-transfer');
    zone.classList.remove('dz-phone-paired');
  }
  document.getElementById('dz-phone-live-badge')?.remove();
  _clearToolAccent();

  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  if (!silent && !suppress) {
    if (notice) {
      pushNotification({
        type: 'warning',
        message: notice,
        detail: detail || '',
      });
    } else if (wasConnected && hadSession) {
      pushNotification({
        type: 'warning',
        message: `Phone Disconnected with ${toolLabel || 'Tool'}`,
        detail: 'Transfer session ended',
      });
    }
  }

  if (hadSession) {
    const backendUrl = window.TOOLCEO_BACKEND_URL || 'http://127.0.0.1:8765';
    fetch(`${backendUrl}/api/mobile/session/${_activeSessionId}`, { method: 'DELETE' }).catch(() => {});
  }

  _activeSessionId = null;
  _activeMobileUrl = null;
  _connectedNotified = false;
  _activeToolLabel = null;
  _pairedToolId = null;
  _suppressDisconnectNotice = false;
  _ingestingFiles = false;

  // Unbind the phone mirror so stale sessions can't receive job links
  unbindMirrorSession();
}

function _handleDesktopOffline() {
  if (!_activeSessionId) return;

  if (_connectedNotified) {
    closeMobileTransferModal({
      notice: 'Phone disconnected',
      detail: 'This computer went offline, so the phone transfer was ended. Reconnect to the internet to share files from your phone.',
    });
    return;
  }

  closeMobileTransferModal({
    notice: 'You are currently offline',
    detail: 'Connect to the internet to share files from your phone.',
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', _handleDesktopOffline);
}

function _endSessionFromPhone() {
  if (!_activeSessionId) return;
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  const tool = getActiveTool();
  pushNotification({
    type: 'warning',
    message: 'Phone Disconnected',
    detail: tool ? `${tool.label || 'Tool'} transfer session ended` : 'Transfer session ended',
  });
  _suppressDisconnectNotice = true;
  closeMobileTransferModal();
}

/**
 * Polls backend session status until completion or cancellation.
 */
function _startPolling(backendUrl, sessionId) {
  if (_pollTimer) clearInterval(_pollTimer);

  _pollTimer = setInterval(async () => {
    if (!_activeSessionId || _activeSessionId !== sessionId) {
      clearInterval(_pollTimer);
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/mobile/session/${sessionId}/status`);
      if (!res.ok) return;

      const data = await res.json();
      if (!_activeSessionId || _activeSessionId !== sessionId) return;

      if (data.status === 'completed' && data.files && data.files.length > 0) {
        if (_ingestingFiles) return;
        _ingestingFiles = true;
        _ensureConnectedBadge('uploading');
        try {
          await _processTransferredFiles(backendUrl, sessionId, data.files);
        } finally {
          _ingestingFiles = false;
        }
      } else if (data.status === 'uploading') {
        _revealDropZoneWhilePaired('uploading');
      } else if (data.status === 'connected' || data.picking) {
        _revealDropZoneWhilePaired('connected');
        if (!_connectedNotified) {
          _connectedNotified = true;
          const tool = getActiveTool();
          pushNotification({
            type: 'success',
            message: `Phone Connected Successfully with ${tool ? (tool.label || 'this tool') : 'this tool'}`,
            detail: 'Ready to receive files — select them on your phone',
          });
        }
      } else if (data.status === 'phone_disconnected' || data.status === 'cancelled') {
        _endSessionFromPhone();
      }
    } catch (err) {
      console.warn('[mobile-transfer] Poll failed:', err.message);
    }
  }, 1000);
}

/**
 * Fetches the uploaded files from backend and passes them into dropzone file handler.
 */
async function _processTransferredFiles(backendUrl, sessionId, fileList) {
  try {
    const fileObjects = [];

    for (let i = 0; i < fileList.length; i++) {
      const fInfo = fileList[i];
      const fileUrl = `${backendUrl}${fInfo.url}`;
      
      const fileRes = await fetch(fileUrl);
      const blob = await fileRes.blob();
      
      const fileObj = new File([blob], fInfo.name, { type: fInfo.type || blob.type });
      
      // If running inside Electron, also preserve the native disk path
      if (fInfo.path) {
        Object.defineProperty(fileObj, 'path', {
          value: fInfo.path,
          writable: false,
          configurable: true,
        });
      }

      fileObjects.push(fileObj);
    }

    pushNotification({
      type: 'success',
      message: 'Mobile Transfer Complete',
      detail: `Loaded ${fileObjects.length} file(s) from your phone.`,
    });

    await handleExternalFiles(fileObjects);

    try {
      await fetch(`${backendUrl}/api/mobile/session/${sessionId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: fileList.length }),
      });
    } catch (ackErr) {
      console.warn('[mobile-transfer] Ack failed:', ackErr.message);
    }

    if (_activeSessionId === sessionId) {
      const zone = document.getElementById('drop-zone');
      zone?.classList.add('dz-phone-paired');
      _revealDropZoneWhilePaired('connected');
    }

  } catch (err) {
    console.error('[mobile-transfer] File ingestion failed:', err);
    pushNotification({
      type: 'error',
      message: 'Transfer Ingestion Failed',
      detail: err.message,
    });
  }
}

function _requestedNameFromTarget(el) {
  if (!el) return null;
  return (
    el.querySelector('.fmt-label')?.textContent?.trim()
    || el.querySelector('.header-search-item-title')?.textContent?.trim()
    || el.querySelector('.tool-name')?.textContent?.trim()
    || el.querySelector('.bg-job-name')?.textContent?.trim()
    || el.dataset.nav
    || el.dataset.label
    || null
  );
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!_isPhoneLive()) return;
    if (e.target.closest('.card-fav-btn, .dz-phone-live-disconnect, [data-bg-close], [data-bg-save]')) return;

    // Only intercept clicks that actually load a tool: real format cards,
    // header search results and background-job cards. Sidebar nav items,
    // dashboard category cards (.tool-card), family entry cards
    // (.fmt-card--*-entry) and view-all links just navigate, so let them through.
    const card = e.target.closest('.fmt-card, .header-search-item, .bg-job-card');
    if (!card) return;
    if ([...card.classList].some((c) => c.endsWith('-entry'))) return;

    const nextId = card.dataset.id || card.dataset.toolId || null;
    const currentId = getActiveTool()?.id || _pairedToolId;
    if (nextId && currentId && String(nextId) === String(currentId)) return;
    if (card.classList.contains('fmt-card') && card.classList.contains('selected')) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    _notifyDisconnectBeforeLoad(_requestedNameFromTarget(card));
  }, true);
}
