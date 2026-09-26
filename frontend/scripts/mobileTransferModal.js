/**
 * frontend/scripts/mobileTransferModal.js
 *
 * Renders the "Send from Phone" QR pairing panel DIRECTLY INSIDE the drop zone,
 * matching the native ToolCEO in-place morphing pattern (no separate overlay/window).
 */

import { getActiveTool, onToolChange } from './toolstate.js';
import { pushNotification } from './notificationStore.js';
import { handleExternalFiles } from './dropzone.js';

let _activeSessionId = null;
let _pollTimer = null;
let _activeMobileUrl = null;

// Selecting another tool (or clearing the selection) must tear the QR panel
// down: its dz-has-phone-transfer class hides the dropzone's default contents,
// so a stale panel would block the newly selected tool from rendering.
onToolChange(() => closeMobileTransferModal());

/**
 * Opens the mobile transfer panel directly inside the dropzone.
 */
export async function openMobileTransferModal() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

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

  // Theme the panel to the active tool's color
  const toolColor = tool.color || '#00E5C0';
  zone.style.setProperty('--tool-accent', toolColor);
  zone.style.setProperty('--tool-accent-soft', _withAlpha(toolColor, 0.10));
  zone.style.setProperty('--tool-accent-mid', _withAlpha(toolColor, 0.20));
  zone.style.setProperty('--tool-accent-border', _withAlpha(toolColor, 0.35));
  zone.style.setProperty('--tool-accent-glow', _withAlpha(toolColor, 0.15));

  // Set active class on dropzone
  zone.classList.add('dz-has-phone-transfer');

  const panelHtml = `
    <div class="dz-phone-panel" id="dz-phone-panel">
      <!-- Close Button -->
      <button type="button" class="dz-phone-close-btn" id="dz-phone-close-btn" title="Back to dropzone">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <!-- Header -->
      <div class="dz-phone-header">
        <div class="dz-phone-header-text">
          <h3>Send from Phone</h3>
          <p>Scan to transfer files directly to this tool</p>
        </div>
        <div class="dz-phone-tool-badge">${toolName}</div>
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
    const res = await fetch(`${backendUrl}/api/mobile/session/create?tool=${encodeURIComponent(tool.id)}&tool_name=${encodeURIComponent(toolName)}`, {
      method: 'POST'
    });

    if (!res.ok) throw new Error('Failed to create pairing session');
    const sessionData = await res.json();
    _activeSessionId = sessionData.session_id;
    _activeMobileUrl = sessionData.url;

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
 * Converts a #RRGGBB color to an rgba() string with the given alpha.
 * Returns the input unchanged if it is not a hex color.
 */
function _withAlpha(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Removes the in-dropzone panel and reverts dropzone to normal state.
 */
export function closeMobileTransferModal() {
  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-phone-panel')?.remove();
    zone.classList.remove('dz-has-phone-transfer');
    zone.style.removeProperty('--tool-accent');
    zone.style.removeProperty('--tool-accent-soft');
    zone.style.removeProperty('--tool-accent-mid');
    zone.style.removeProperty('--tool-accent-border');
    zone.style.removeProperty('--tool-accent-glow');
  }

  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
  _activeSessionId = null;
  _activeMobileUrl = null;
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

    const statusPill = document.getElementById('dz-phone-status-pill');
    const statusText = document.getElementById('dz-phone-status-text');

    try {
      const res = await fetch(`${backendUrl}/api/mobile/session/${sessionId}/status`);
      if (!res.ok) return;

      const data = await res.json();

      if (data.status === 'connected') {
        if (statusPill) statusPill.className = 'dz-phone-status-pill is-connected';
        if (statusText) statusText.textContent = 'Phone connected! Select files on phone';
      } else if (data.status === 'uploading') {
        if (statusPill) statusPill.className = 'dz-phone-status-pill is-uploading';
        if (statusText) statusText.textContent = 'Receiving files from phone…';
      } else if (data.status === 'completed' && data.files && data.files.length > 0) {
        clearInterval(_pollTimer);
        _pollTimer = null;

        if (statusPill) statusPill.className = 'dz-phone-status-pill is-connected';
        if (statusText) statusText.textContent = `✓ Received ${data.files.length} file(s)! Loading…`;

        // Download files and feed into dropzone
        await _processTransferredFiles(backendUrl, sessionId, data.files);
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

    setTimeout(() => {
      closeMobileTransferModal();

      pushNotification({
        type: 'success',
        message: 'Mobile Transfer Complete',
        detail: `Loaded ${fileObjects.length} file(s) from your phone.`,
      });

      // Submit into active tool's dropzone pipeline
      handleExternalFiles(fileObjects);
    }, 500);

  } catch (err) {
    console.error('[mobile-transfer] File ingestion failed:', err);
    pushNotification({
      type: 'error',
      message: 'Transfer Ingestion Failed',
      detail: err.message,
    });
    closeMobileTransferModal();
  }
}
