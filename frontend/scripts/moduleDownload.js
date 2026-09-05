/**
 * moduleDownload.js
 *
 * Manages the floating module download progress panel (#mod-dl-panel).
 * Wires up IPC events from the main process (progress, complete, error)
 * and exposes startModuleDownload() for modules.js to call.
 *
 * Also exports isDownloadActive() so the install button can be guarded.
 */

import { pushNotification } from './notificationStore.js';
import { invalidateModuleCache, loadModuleStatuses } from './modulelock.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

let _active = false;        // true while a download is running
let _paused = false;        // true while paused (connection lost)
let _currentModuleId = null;
let _currentModuleName = null;
let _currentPhase = 'downloading';

const MODULE_NAMES = {
  office: 'Office Module',
  ocr: 'OCR Module',
  document: 'Document Module',
  ebook: 'eBook Module',
  media: 'Media Module',
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/** Returns true if a download is currently active (including paused state). */
export function isDownloadActive() {
  return _active;
}

/** Returns the ID of the module currently downloading/installing, or null. */
export function getActiveDownloadModuleId() {
  return _active ? _currentModuleId : null;
}

/** Sync in-memory download state from Electron's active download. */
export function syncActiveDownload(activeDl) {
  if (!activeDl || !activeDl.moduleId) return;
  _active = true;
  _paused = activeDl.paused === true;
  _currentModuleId = activeDl.moduleId;
  _currentModuleName = MODULE_NAMES[activeDl.moduleId] || (activeDl.moduleId.toUpperCase() + ' Module');
  _showPanel(_currentModuleName, activeDl.total ? _fmtMB(activeDl.total) : '');
  if (activeDl.phase === 'extracting') {
    _updateProgress({
      percent: activeDl.percent || 0,
      phase: 'extracting',
      message: activeDl.message || 'Installing module files…',
    });
  } else if (activeDl.total && activeDl.received) {
    const pct = Math.floor((activeDl.received / activeDl.total) * 100);
    _updateProgress({
      percent: pct,
      receivedBytes: activeDl.received,
      totalBytes: activeDl.total,
      phase: activeDl.phase || 'downloading',
    });
  }
  if (_paused) {
    _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
    _showResumeButton();
  }
  notifyModuleState(activeDl.moduleId, 'installing', activeDl.percent);
}

/** Notify any listening UI components of a module's state change. */
export function notifyModuleState(moduleId, state, percent = null) {
  if (!moduleId) return;
  window.dispatchEvent(new CustomEvent('module-state-changed', { detail: { moduleId, state, percent } }));
}

/**
 * Called by modules.js install button handler.
 * mod — a module definition object from the MODULES array (id, name, downloadUrl).
 */
export function startModuleDownload(mod) {
  if (_active) {
    pushNotification({ type: 'warning', message: 'A module download is already in progress.' });
    return;
  }
  if (!window.electronAPI || !window.electronAPI.startModuleDownload) return;

  _active          = true;
  _paused          = false;
  _currentModuleId = mod.id;
  _currentModuleName = mod.name || mod.id;

  _showPanel(_currentModuleName, mod.size);
  notifyModuleState(mod.id, 'installing');

  // Kick off the download (fire-and-forget — progress comes via IPC events)
  window.electronAPI.startModuleDownload({ moduleId: mod.id, downloadUrl: mod.downloadUrl })
    .then((result) => {
      if (!result.ok) {
        const failedModId = mod.id;
        if (result.reason === 'offline') {
          pushNotification({
            type: 'error',
            message: 'No internet connection. Please check your network and try again.',
          });
          _hidePanel();
          _active = false;
          _paused = false;
          _currentModuleId = null;
          _currentModuleName = null;
          notifyModuleState(failedModId, 'not_installed');
        } else if (result.reason === 'busy') {
          pushNotification({ type: 'warning', message: 'A module download is already in progress.' });
          const busyModId = result.activeModuleId || _currentModuleId;
          if (busyModId) {
            _active = true;
            _currentModuleId = busyModId;
            _currentModuleName = MODULE_NAMES[busyModId] || (busyModId.toUpperCase() + ' Module');
            _showPanel(_currentModuleName, '');
            notifyModuleState(busyModId, 'installing');
          }
        } else if (result.reason === 'connection-lost' || result.paused) {
          // Connection lost: keep download window appearing and wait for resume!
          _paused = true;
          _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
          _showResumeButton();
        } else if (result.reason !== 'cancelled') {
          pushNotification({
            type: 'error',
            message: `Installation failed: ${result.error || result.reason || 'Unknown error'}`,
          });
          _hidePanel();
          _active = false;
          _paused = false;
          _currentModuleId = null;
          _currentModuleName = null;
          notifyModuleState(failedModId, 'not_installed');
        }
      }
    })
    .catch((err) => {
      const failedModId = mod.id;
      pushNotification({
        type: 'error',
        message: `Installation error: ${err.message || 'Failed to start download'}`,
      });
      _hidePanel();
      _active = false;
      _paused = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(failedModId, 'not_installed');
    });
}

// ─── PANEL INIT ───────────────────────────────────────────────────────────────

/**
 * Create the panel DOM, inject into body, and wire up all IPC listeners.
 * Call once on app load.
 */
export function initModuleDownloadPanel() {
  if (document.getElementById('mod-dl-panel')) return; // already initialised

  // Inject panel HTML
  const panel = document.createElement('div');
  panel.id = 'mod-dl-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="mod-dl-header">
      <span class="mod-dl-icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="mod-dl-title" id="mod-dl-title">Downloading <strong>…</strong></span>
    </div>
    <div id="mod-dl-status-msg" class="mod-dl-status-msg" style="display:none"></div>
    <div class="mod-dl-bar-row">
      <div class="mod-dl-bar-wrap">
        <div class="mod-dl-bar-fill" id="mod-dl-bar"></div>
      </div>
      <span class="mod-dl-percent" id="mod-dl-percent">0%</span>
    </div>
    <div class="mod-dl-footer">
      <span class="mod-dl-size" id="mod-dl-size">0.0 MB</span>
      <div class="mod-dl-actions" id="mod-dl-actions">
        <button class="mod-dl-btn--cancel" id="mod-dl-cancel-btn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  // Cancel button
  panel.querySelector('#mod-dl-cancel-btn').addEventListener('click', () => {
    const cancelledModId = _currentModuleId;
    if (window.electronAPI && window.electronAPI.cancelModuleDownload) {
      window.electronAPI.cancelModuleDownload();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
    notifyModuleState(cancelledModId, 'not_installed');
  });

  // ── IPC event listeners ───────────────────────────────────────────────────

  if (!window.electronAPI) return;

  // Progress updates
  window.electronAPI.onModuleDownloadProgress((payload) => {
    if ((!_active || !_currentModuleId) && payload && payload.moduleId) {
      _active = true;
      _currentModuleId = payload.moduleId;
      _currentModuleName = MODULE_NAMES[payload.moduleId] || (payload.moduleId.toUpperCase() + ' Module');
      _showPanel(_currentModuleName, '');
      notifyModuleState(payload.moduleId, 'installing');
    }
    _updateProgress(payload);
  });

  // Download complete
  window.electronAPI.onModuleDownloadComplete(async (payload) => {
    _hidePanel();
    _active = false;
    _paused = false;
    const completedModuleId = payload?.moduleId || _currentModuleId;
    const completedModuleName = _currentModuleName || (completedModuleId ? completedModuleId.toUpperCase() + ' Module' : 'Module');
    _currentModuleId = null;
    _currentModuleName = null;

    // Invalidate modulelock cache so newly installed modules unlock immediately
    invalidateModuleCache();
    await loadModuleStatuses();

    // Show in-app notification
    pushNotification({
      type: 'success',
      message: `${completedModuleName} installed successfully! All related tools are now unlocked.`,
    });

    // Notify card and modal of installed state
    notifyModuleState(completedModuleId, 'installed');

    // Real-time unlock: unlock any tool cards currently visible in the DOM
    if (completedModuleId) {
      document.querySelectorAll(`[data-locked-module="${completedModuleId}"]`).forEach((card) => {
        card.classList.remove('fmt-card--locked');
        card.removeAttribute('data-locked-module');
        const lockIcon = card.querySelector('.fmt-lock-badge, .lock-icon');
        if (lockIcon) lockIcon.remove();
      });
    }
  });

  // Error / connection-lost / resuming
  window.electronAPI.onModuleDownloadError((payload = {}) => {
    const { reason, error } = payload;
    const currentModId = _currentModuleId;

    if (reason === 'connection-lost') {
      _paused = true;
      _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
      _showResumeButton();
      // Ensure panel remains visible
      const panel = document.getElementById('mod-dl-panel');
      if (panel) panel.classList.add('mod-dl-panel--visible');
    } else if (reason === 'connection-restored' || reason === 'resuming') {
      _paused = false;
      _hideStatusMsg();
      _showCancelOnly();
      pushNotification({ type: 'info', message: 'Connection restored. Resuming download…', autoDismiss: true });
      // Auto-resume: tell main process to resume
      if (reason === 'connection-restored' && window.electronAPI.resumeModuleDownload) {
        window.electronAPI.resumeModuleDownload();
      }
    } else if (reason === 'offline') {
      pushNotification({ type: 'error', message: 'No internet connection. Please check your network.' });
      _hidePanel();
      _active = false;
      _paused = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(currentModId, 'not_installed');
    } else if (reason === 'extraction-failed') {
      pushNotification({
        type: 'error',
        message: `Failed to unpack module files: ${error || 'Extraction failed'}`,
      });
      _hidePanel();
      _active = false;
      _paused = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(currentModId, 'not_installed');
    } else {
      pushNotification({
        type: 'error',
        message: error || `Module download error (${reason || 'unknown'})`,
      });
      _hidePanel();
      _active = false;
      _paused = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(currentModId, 'not_installed');
    }
  });

  // Browser online/offline event integration
  window.addEventListener('online', () => {
    if (_active && _paused) {
      _paused = false;
      _hideStatusMsg();
      _showCancelOnly();
      pushNotification({ type: 'info', message: 'Connection restored. Resuming download…', autoDismiss: true });
      if (window.electronAPI && window.electronAPI.resumeModuleDownload) {
        window.electronAPI.resumeModuleDownload();
      }
    }
  });

  window.addEventListener('offline', () => {
    if (_active && !_paused) {
      _paused = true;
      _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
      _showResumeButton();
    }
  });
}

// ─── PANEL HELPERS ────────────────────────────────────────────────────────────

function _showPanel(moduleName, expectedSize) {
  _currentPhase = 'downloading';
  const panel = document.getElementById('mod-dl-panel');
  if (!panel) return;

  const iconEl = panel.querySelector('.mod-dl-icon');
  if (iconEl && iconEl.dataset.installIcon) {
    delete iconEl.dataset.installIcon;
    iconEl.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
  }

  _el('mod-dl-title').innerHTML = `Downloading <strong>${moduleName}</strong>`;
  _el('mod-dl-percent').textContent = '0%';
  _el('mod-dl-bar').style.width = '0%';
  const sizeEl = _el('mod-dl-size');
  if (sizeEl) {
    const cleanExpected = expectedSize ? expectedSize.replace('~', '').trim() : '';
    sizeEl.textContent = cleanExpected ? `0.0 MB / ${cleanExpected}` : '0.0 MB';
  }
  _hideStatusMsg();
  _showCancelOnly();
  panel.classList.add('mod-dl-panel--visible');
}

function _hidePanel() {
  const panel = document.getElementById('mod-dl-panel');
  if (panel) panel.classList.remove('mod-dl-panel--visible');
}

function _updateProgress({ percent = 0, receivedBytes = 0, totalBytes = 0, phase = 'downloading', message = '' }) {
  const isExtracting = phase === 'extracting';
  const cleanPercent = Math.max(0, Math.min(100, Math.round(percent)));

  if (isExtracting) {
    if (_currentPhase !== 'extracting') {
      _currentPhase = 'extracting';
      const bar = _el('mod-dl-bar');
      if (bar) {
        bar.style.transition = 'none';
        bar.style.width = '0%';
        void bar.offsetWidth; // force DOM reflow
        bar.style.transition = 'width 0.18s linear';
      }
    }

    const titleEl = _el('mod-dl-title');
    if (titleEl) {
      titleEl.innerHTML = `Installing <strong>${_currentModuleName || 'Module'}</strong>`;
    }

    const iconEl = document.querySelector('#mod-dl-panel .mod-dl-icon');
    if (iconEl && !iconEl.dataset.installIcon) {
      iconEl.dataset.installIcon = 'true';
      iconEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="12" y1="22.08" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }

    _el('mod-dl-percent').textContent = `${cleanPercent}%`;
    _el('mod-dl-bar').style.width     = `${cleanPercent}%`;

    const sizeEl = _el('mod-dl-size');
    if (sizeEl) {
      sizeEl.textContent = 'Installing module files…';
    }

    _hideStatusMsg();
    _showInstallingState();

    if (_currentModuleId) {
      notifyModuleState(_currentModuleId, 'installing');
    }
    return;
  }

  _currentPhase = 'downloading';

  const iconEl = document.querySelector('#mod-dl-panel .mod-dl-icon');
  if (iconEl && iconEl.dataset.installIcon) {
    delete iconEl.dataset.installIcon;
    iconEl.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
  }

  _el('mod-dl-percent').textContent = `${cleanPercent}%`;
  _el('mod-dl-bar').style.width     = `${cleanPercent}%`;

  const sizeEl = _el('mod-dl-size');
  if (sizeEl) {
    if (totalBytes > 0) {
      sizeEl.textContent = `${_fmtMB(receivedBytes)} / ${_fmtMB(totalBytes)}`;
    } else if (receivedBytes > 0) {
      sizeEl.textContent = _fmtMB(receivedBytes);
    }
  }
}

function _showInstallingState() {
  const actions = _el('mod-dl-actions');
  if (actions) {
    actions.innerHTML = '';
  }
}

function _showStatusMsg(msg, isInfo) {
  const el = _el('mod-dl-status-msg');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'mod-dl-status-msg' + (isInfo ? ' mod-dl-status-msg--info' : '');
  el.style.display = '';
}

function _hideStatusMsg() {
  const el = _el('mod-dl-status-msg');
  if (el) el.style.display = 'none';
}

function _showResumeButton() {
  const actions = _el('mod-dl-actions');
  if (!actions) return;
  actions.innerHTML = `
    <span style="display:flex;gap:14px;align-items:center">
      <button class="mod-dl-btn--cancel" id="mod-dl-cancel-btn2">Cancel</button>
      <button class="mod-dl-btn--resume" id="mod-dl-resume-btn">Resume</button>
    </span>`;

  actions.querySelector('#mod-dl-cancel-btn2').addEventListener('click', () => {
    const cancelledModId = _currentModuleId;
    if (window.electronAPI && window.electronAPI.cancelModuleDownload) {
      window.electronAPI.cancelModuleDownload();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
    notifyModuleState(cancelledModId, 'not_installed');
  });

  actions.querySelector('#mod-dl-resume-btn').addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.resumeModuleDownload) {
      window.electronAPI.resumeModuleDownload();
    }
    _paused = false;
    _hideStatusMsg();
    _showCancelOnly();
  });
}

function _showCancelOnly() {
  const actions = _el('mod-dl-actions');
  if (!actions) return;
  actions.innerHTML = `
    <button class="mod-dl-btn--cancel" id="mod-dl-cancel-btn">Cancel</button>`;
  actions.querySelector('#mod-dl-cancel-btn').addEventListener('click', () => {
    const cancelledModId = _currentModuleId;
    if (window.electronAPI && window.electronAPI.cancelModuleDownload) {
      window.electronAPI.cancelModuleDownload();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
    notifyModuleState(cancelledModId, 'not_installed');
  });
}

// ─── FORMATTING HELPERS ───────────────────────────────────────────────────────

function _el(id) { return document.getElementById(id); }

function _fmtMB(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0.0 MB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function _fmtEta(seconds) {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
