/**
 * moduleDownload.js
 *
 * Manages the floating module download/install progress panel (#mod-dl-panel).
 * Wires up IPC events from the main process for both download and install phases,
 * and exposes startModuleDownload() and startModuleInstall() for modules.js.
 */

import { pushNotification } from './notificationStore.js';
import { invalidateModuleCache, loadModuleStatuses } from './modulelock.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

let _active = false;        // true while download or install is running
let _paused = false;        // true while paused (connection lost)
let _currentModuleId = null;
let _currentModuleName = null;
let _currentPhase = 'downloading'; // 'downloading' | 'installing'

const MODULE_NAMES = {
  office: 'Office Module',
  ocr: 'OCR Module',
  document: 'Document Module',
  ebook: 'eBook Module',
  media: 'Media Module',
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/** Returns true if a download or install is currently active */
export function isDownloadActive() {
  return _active;
}

/** Returns the phase: 'downloading' | 'installing' | null */
export function getActivePhase() {
  return _active ? _currentPhase : null;
}

/** Returns the ID of the module currently downloading/installing, or null. */
export function getActiveDownloadModuleId() {
  return _active ? _currentModuleId : null;
}

/** Notify any listening UI components of a module's state change. */
export function notifyModuleState(moduleId, state, percent = null) {
  if (!moduleId) return;
  window.dispatchEvent(new CustomEvent('module-state-changed', { detail: { moduleId, state, percent } }));
}

/** Sync in-memory download state from Electron's active task. */
export function syncActiveDownload(activeDl) {
  if (!activeDl || !activeDl.moduleId) return;
  _active = true;
  _paused = activeDl.paused === true;
  _currentModuleId = activeDl.moduleId;
  _currentModuleName = MODULE_NAMES[activeDl.moduleId] || (activeDl.moduleId.toUpperCase() + ' Module');
  _currentPhase = activeDl.phase || 'downloading';

  _showPanel(_currentModuleName, activeDl.total ? _fmtMB(activeDl.total) : '', _currentPhase);

  if (_currentPhase === 'installing') {
    _updateProgress({
      percent: activeDl.percent || 0,
      phase: 'installing',
      message: activeDl.message || 'Installing module files…',
    });
    notifyModuleState(activeDl.moduleId, 'installing', activeDl.percent);
  } else {
    const pct = activeDl.total && activeDl.received
      ? Math.floor((activeDl.received / activeDl.total) * 100)
      : (activeDl.percent || 0);
    _updateProgress({
      percent: pct,
      receivedBytes: activeDl.received,
      totalBytes: activeDl.total,
      phase: 'downloading',
    });
    notifyModuleState(activeDl.moduleId, 'downloading', pct);
  }

  if (_paused) {
    _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
    _showResumeButton();
  }
}

/**
 * Step 1: Start download only.
 * mod — a module definition object from the MODULES array (id, name, downloadUrl).
 */
export function startModuleDownload(mod) {
  if (_active) {
    pushNotification({ type: 'warning', message: 'A module operation is already in progress.' });
    return;
  }
  if (!window.electronAPI || !window.electronAPI.startModuleDownload) return;

  _active = true;
  _paused = false;
  _currentPhase = 'downloading';
  _currentModuleId = mod.id;
  _currentModuleName = mod.name || mod.id;

  _showPanel(_currentModuleName, mod.size, 'downloading');
  notifyModuleState(mod.id, 'downloading', 0);

  window.electronAPI.startModuleDownload({ moduleId: mod.id, downloadUrl: mod.downloadUrl })
    .then((result) => {
      if (!result || !result.ok) {
        const failedModId = mod.id;
        if (result && result.reason === 'offline') {
          pushNotification({
            type: 'error',
            message: 'No internet connection. Please check your network and try again.',
          });
          _hidePanel();
          _active = false;
          _paused = false;
          _currentModuleId = null;
          _currentModuleName = null;
          notifyModuleState(failedModId, 'not_downloaded');
        } else if (result && result.reason === 'busy') {
          pushNotification({ type: 'warning', message: 'Another operation is already in progress.' });
        } else if (result && (result.reason === 'connection-lost' || result.paused)) {
          _paused = true;
          _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
          _showResumeButton();
        } else if (result && result.reason !== 'cancelled') {
          pushNotification({
            type: 'error',
            message: `Download failed: ${result?.error || result?.reason || 'Unknown error'}`,
          });
          _hidePanel();
          _active = false;
          _paused = false;
          _currentModuleId = null;
          _currentModuleName = null;
          notifyModuleState(failedModId, 'not_downloaded');
        }
      }
    })
    .catch((err) => {
      const failedModId = mod.id;
      pushNotification({
        type: 'error',
        message: `Download error: ${err.message || 'Failed to start download'}`,
      });
      _hidePanel();
      _active = false;
      _paused = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(failedModId, 'not_downloaded');
    });
}

/**
 * Step 2: Start installation from downloaded zip.
 * mod — a module definition object from the MODULES array (id, name).
 */
export function startModuleInstall(mod) {
  if (_active) {
    pushNotification({ type: 'warning', message: 'A module operation is already in progress.' });
    return;
  }
  if (!window.electronAPI || !window.electronAPI.startModuleInstall) return;

  _active = true;
  _paused = false;
  _currentPhase = 'installing';
  _currentModuleId = mod.id;
  _currentModuleName = mod.name || mod.id;

  _showPanel(_currentModuleName, '', 'installing');
  notifyModuleState(mod.id, 'installing', 0);

  window.electronAPI.startModuleInstall({ moduleId: mod.id })
    .then((result) => {
      if (!result || !result.ok) {
        const failedModId = mod.id;
        if (result && result.reason === 'busy') {
          pushNotification({ type: 'warning', message: 'Another operation is already in progress.' });
        } else if (result && result.reason !== 'cancelled') {
          pushNotification({
            type: 'error',
            message: `Installation failed: ${result?.error || result?.reason || 'Unknown error'}`,
          });
          _hidePanel();
          _active = false;
          _currentModuleId = null;
          _currentModuleName = null;
          notifyModuleState(failedModId, 'downloaded');
        }
      }
    })
    .catch((err) => {
      const failedModId = mod.id;
      pushNotification({
        type: 'error',
        message: `Installation error: ${err.message || 'Failed to extract module archive'}`,
      });
      _hidePanel();
      _active = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(failedModId, 'downloaded');
    });
}

/**
 * Cancel the active operation (either download or install).
 */
export function cancelActiveOperation(moduleId = null) {
  const targetId = moduleId || _currentModuleId;
  if (!targetId) return;

  if (_currentPhase === 'installing') {
    if (window.electronAPI && window.electronAPI.cancelModuleInstall) {
      window.electronAPI.cancelModuleInstall();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
    _currentModuleName = null;
    notifyModuleState(targetId, 'downloaded');
    pushNotification({ type: 'info', message: 'Installation cancelled. Downloaded files kept for later installation.', autoDismiss: true });
  } else {
    if (window.electronAPI && window.electronAPI.cancelModuleDownload) {
      window.electronAPI.cancelModuleDownload();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
    _currentModuleName = null;
    notifyModuleState(targetId, 'not_downloaded');
    pushNotification({ type: 'info', message: 'Download cancelled.', autoDismiss: true });
  }
}

// ─── PANEL INIT ───────────────────────────────────────────────────────────────

/**
 * Create the panel DOM, inject into body, and wire up all IPC listeners.
 */
export function initModuleDownloadPanel() {
  if (document.getElementById('mod-dl-panel')) return;

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
    cancelActiveOperation();
  });

  if (!window.electronAPI) return;

  // ── Download events ─────────────────────────────────────────────────────────

  // Download progress
  window.electronAPI.onModuleDownloadProgress((payload) => {
    if ((!_active || !_currentModuleId) && payload && payload.moduleId) {
      _active = true;
      _currentPhase = 'downloading';
      _currentModuleId = payload.moduleId;
      _currentModuleName = MODULE_NAMES[payload.moduleId] || (payload.moduleId.toUpperCase() + ' Module');
      _showPanel(_currentModuleName, '', 'downloading');
    }
    _currentPhase = 'downloading';
    _updateProgress(payload);
    notifyModuleState(payload.moduleId, 'downloading', payload.percent);
  });

  // Download complete (transitions to 'downloaded' — DOES NOT auto-install)
  window.electronAPI.onModuleDownloadComplete(async (payload) => {
    _hidePanel();
    _active = false;
    _paused = false;
    const completedModuleId = payload?.moduleId || _currentModuleId;
    const completedModuleName = _currentModuleName || (completedModuleId ? (MODULE_NAMES[completedModuleId] || completedModuleId.toUpperCase() + ' Module') : 'Module');
    _currentModuleId = null;
    _currentModuleName = null;

    notifyModuleState(completedModuleId, 'downloaded');

    pushNotification({
      type: 'success',
      message: `${completedModuleName} downloaded successfully. Click "Install Now" to complete setup.`,
    });
  });

  // Download cancelled
  if (window.electronAPI.onModuleDownloadCancelled) {
    window.electronAPI.onModuleDownloadCancelled((payload) => {
      _hidePanel();
      _active = false;
      _paused = false;
      const targetId = payload?.moduleId || _currentModuleId;
      _currentModuleId = null;
      _currentModuleName = null;
      if (targetId) notifyModuleState(targetId, 'not_downloaded');
    });
  }

  // ── Install events ──────────────────────────────────────────────────────────

  // Install progress
  if (window.electronAPI.onModuleInstallProgress) {
    window.electronAPI.onModuleInstallProgress((payload) => {
      if ((!_active || !_currentModuleId) && payload && payload.moduleId) {
        _active = true;
        _currentPhase = 'installing';
        _currentModuleId = payload.moduleId;
        _currentModuleName = MODULE_NAMES[payload.moduleId] || (payload.moduleId.toUpperCase() + ' Module');
        _showPanel(_currentModuleName, '', 'installing');
      }
      _currentPhase = 'installing';
      _updateProgress({
        percent: payload.percent,
        phase: 'installing',
        message: payload.message || 'Installing module files…',
      });
      notifyModuleState(payload.moduleId, 'installing', payload.percent);
    });
  }

  // Install complete
  if (window.electronAPI.onModuleInstallComplete) {
    window.electronAPI.onModuleInstallComplete(async (payload) => {
      _updateProgress({ percent: 100, phase: 'installing', message: 'Installation complete' });
      setTimeout(() => _hidePanel(), 400);
      _active = false;
      _paused = false;
      const completedModuleId = payload?.moduleId || _currentModuleId;
      const completedModuleName = _currentModuleName || (completedModuleId ? (MODULE_NAMES[completedModuleId] || completedModuleId.toUpperCase() + ' Module') : 'Module');
      _currentModuleId = null;
      _currentModuleName = null;

      // Invalidate lock cache and refresh
      invalidateModuleCache();
      await loadModuleStatuses();

      pushNotification({
        type: 'success',
        message: `${completedModuleName} installed successfully! All related tools are now unlocked.`,
      });

      notifyModuleState(completedModuleId, 'installed');

      // Real-time tool unlock in the dashboard
      if (completedModuleId) {
        document.querySelectorAll(`[data-locked-module="${completedModuleId}"]`).forEach((card) => {
          card.classList.remove('fmt-card--locked');
          card.removeAttribute('data-locked-module');
          const lockIcon = card.querySelector('.fmt-lock-badge, .lock-icon');
          if (lockIcon) lockIcon.remove();
        });
      }
    });
  }

  // Install cancelled
  if (window.electronAPI.onModuleInstallCancelled) {
    window.electronAPI.onModuleInstallCancelled((payload) => {
      _hidePanel();
      _active = false;
      _paused = false;
      const targetId = payload?.moduleId || _currentModuleId;
      _currentModuleId = null;
      _currentModuleName = null;
      if (targetId) notifyModuleState(targetId, 'downloaded');
    });
  }

  // Error listeners
  window.electronAPI.onModuleDownloadError((payload = {}) => {
    const { reason, error } = payload;
    const currentModId = _currentModuleId;

    if (reason === 'connection-lost') {
      _paused = true;
      _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
      _showResumeButton();
      const panel = document.getElementById('mod-dl-panel');
      if (panel) panel.classList.add('mod-dl-panel--visible');
    } else if (reason === 'connection-restored' || reason === 'resuming') {
      _paused = false;
      _hideStatusMsg();
      _showCancelOnly();
      pushNotification({ type: 'info', message: 'Connection restored. Resuming download…', autoDismiss: true });
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
      notifyModuleState(currentModId, 'not_downloaded');
    } else {
      pushNotification({
        type: 'error',
        message: error || `Module error (${reason || 'unknown'})`,
      });
      _hidePanel();
      _active = false;
      _paused = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(currentModId, _currentPhase === 'installing' ? 'downloaded' : 'not_downloaded');
    }
  });

  if (window.electronAPI.onModuleInstallError) {
    window.electronAPI.onModuleInstallError((payload = {}) => {
      const { error } = payload;
      const currentModId = _currentModuleId;
      pushNotification({
        type: 'error',
        message: `Installation failed: ${error || 'Failed to extract module archive'}`,
      });
      _hidePanel();
      _active = false;
      _paused = false;
      _currentModuleId = null;
      _currentModuleName = null;
      notifyModuleState(currentModId, 'downloaded');
    });
  }

  // Online / offline
  window.addEventListener('online', () => {
    if (_active && _paused && _currentPhase === 'downloading') {
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
    if (_active && !_paused && _currentPhase === 'downloading') {
      _paused = true;
      _showStatusMsg('Connection lost — download paused. Waiting for connection…', false);
      _showResumeButton();
    }
  });
}

// ─── PANEL HELPERS ────────────────────────────────────────────────────────────

function _showPanel(moduleName, expectedSize, phase = 'downloading') {
  _currentPhase = phase;
  const panel = document.getElementById('mod-dl-panel');
  if (!panel) return;

  const iconEl = panel.querySelector('.mod-dl-icon');
  if (phase === 'installing') {
    if (iconEl) {
      iconEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="12" y1="22.08" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    }
    _el('mod-dl-title').innerHTML = `Installing <strong>${moduleName}</strong>`;
    const sizeEl = _el('mod-dl-size');
    if (sizeEl) sizeEl.textContent = 'Installing module files…';
  } else {
    if (iconEl) {
      iconEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;
    }
    _el('mod-dl-title').innerHTML = `Downloading <strong>${moduleName}</strong>`;
    const sizeEl = _el('mod-dl-size');
    if (sizeEl) {
      const cleanExpected = expectedSize ? expectedSize.replace('~', '').trim() : '';
      sizeEl.textContent = cleanExpected ? `0.0 MB / ${cleanExpected}` : '0.0 MB';
    }
  }

  _el('mod-dl-percent').textContent = '0%';
  _el('mod-dl-bar').style.width = '0%';
  _hideStatusMsg();
  _showCancelOnly();
  panel.classList.add('mod-dl-panel--visible');
}

function _hidePanel() {
  const panel = document.getElementById('mod-dl-panel');
  if (panel) panel.classList.remove('mod-dl-panel--visible');
}

function _updateProgress({ percent = 0, receivedBytes = 0, totalBytes = 0, phase = 'downloading', message = '' }) {
  const isExtracting = phase === 'installing' || phase === 'extracting';
  const cleanPercent = Math.max(0, Math.min(100, Math.round(percent)));

  _el('mod-dl-percent').textContent = `${cleanPercent}%`;
  _el('mod-dl-bar').style.width     = `${cleanPercent}%`;

  if (isExtracting) {
    const titleEl = _el('mod-dl-title');
    if (titleEl) {
      titleEl.innerHTML = `Installing <strong>${_currentModuleName || 'Module'}</strong>`;
    }
    const sizeEl = _el('mod-dl-size');
    if (sizeEl) {
      sizeEl.textContent = message || 'Installing module files…';
    }
    return;
  }

  const sizeEl = _el('mod-dl-size');
  if (sizeEl) {
    if (totalBytes > 0) {
      sizeEl.textContent = `${_fmtMB(receivedBytes)} / ${_fmtMB(totalBytes)}`;
    } else if (receivedBytes > 0) {
      sizeEl.textContent = _fmtMB(receivedBytes);
    }
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
    <span style="display:flex;gap:10px;align-items:center">
      <button class="mod-dl-btn--cancel" id="mod-dl-cancel-btn2">Cancel</button>
      <button class="mod-dl-btn--resume" id="mod-dl-resume-btn">Resume</button>
    </span>`;

  actions.querySelector('#mod-dl-cancel-btn2').addEventListener('click', () => {
    cancelActiveOperation();
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
    cancelActiveOperation();
  });
}

// ─── FORMATTING HELPERS ───────────────────────────────────────────────────────

function _el(id) { return document.getElementById(id); }

function _fmtMB(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0.0 MB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
