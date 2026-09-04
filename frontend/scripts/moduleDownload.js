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

// ─── STATE ────────────────────────────────────────────────────────────────────

let _active = false;        // true while a download is running
let _paused = false;        // true while paused (connection lost)
let _currentModuleId = null;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/** Returns true if a download is currently active (including paused state). */
export function isDownloadActive() {
  return _active;
}

/**
 * Called by modules.js install button handler.
 * mod — a module definition object from the MODULES array (id, name, downloadUrl).
 */
export function startModuleDownload(mod) {
  if (_active) return; // guard — should not happen (button is disabled)
  if (!window.electronAPI || !window.electronAPI.startModuleDownload) return;

  _active         = true;
  _paused         = false;
  _currentModuleId = mod.id;

  _showPanel(mod.name);

  // Kick off the download (fire-and-forget — progress comes via IPC events)
  window.electronAPI.startModuleDownload({ moduleId: mod.id, downloadUrl: mod.downloadUrl })
    .then((result) => {
      if (!result.ok && result.reason === 'offline') {
        // Already shown native notification from main; also push in-app
        pushNotification({
          type: 'error',
          message: 'No internet connection. Please check your network and try again.',
        });
        _hidePanel();
        _active = false;
        _currentModuleId = null;
      } else if (!result.ok && result.reason === 'busy') {
        pushNotification({ type: 'warning', message: 'A module download is already in progress.' });
        _hidePanel();
        _active = false;
        _currentModuleId = null;
      }
      // Other failure paths are handled via IPC events (error, complete)
    })
    .catch(() => {
      _hidePanel();
      _active = false;
      _currentModuleId = null;
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
    <div class="mod-dl-stats">
      <span class="mod-dl-mb" id="mod-dl-mb">0 / — MB</span>
      <span class="mod-dl-speed" id="mod-dl-speed">—</span>
    </div>
    <div class="mod-dl-actions" id="mod-dl-actions">
      <span class="mod-dl-eta" id="mod-dl-eta">Time remaining: —</span>
      <button class="mod-dl-btn--cancel" id="mod-dl-cancel-btn">Cancel</button>
    </div>`;
  document.body.appendChild(panel);

  // Cancel button
  panel.querySelector('#mod-dl-cancel-btn').addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.cancelModuleDownload) {
      window.electronAPI.cancelModuleDownload();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
  });

  // ── IPC event listeners ───────────────────────────────────────────────────

  if (!window.electronAPI) return;

  // Progress updates
  window.electronAPI.onModuleDownloadProgress((payload) => {
    _updateProgress(payload);
  });

  // Download complete
  window.electronAPI.onModuleDownloadComplete((payload) => {
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;

    // Only re-render the Modules page if the user is still on it.
    // Check: the explore-section must exist AND contain a .mod-grid (Modules page).
    // This prevents overwriting other category views (Documents, Images, etc.).
    const exploreSection = document.getElementById('explore-section');
    const isModulesPageOpen = exploreSection && exploreSection.querySelector('.mod-grid');
    if (isModulesPageOpen && window.__modulesActivateNav) {
      // Dynamically import to avoid circular dep; modules.js imports us
      import('./modules.js').then(({ renderModules }) => {
        renderModules(exploreSection, window.__modulesActivateNav);
      });
    }
  });

  // Error / connection-lost / resuming
  window.electronAPI.onModuleDownloadError((payload) => {
    const { reason } = payload;

    if (reason === 'connection-lost') {
      _paused = true;
      _showStatusMsg('Connection lost — download paused.', false);
      _showResumeButton();
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
    }
  });
}

// ─── PANEL HELPERS ────────────────────────────────────────────────────────────

function _showPanel(moduleName) {
  const panel = document.getElementById('mod-dl-panel');
  if (!panel) return;
  _el('mod-dl-title').innerHTML = `Downloading <strong>${moduleName}</strong>`;
  _el('mod-dl-percent').textContent = '0%';
  _el('mod-dl-bar').style.width = '0%';
  _el('mod-dl-mb').textContent = '0 / — MB';
  _el('mod-dl-speed').textContent = '—';
  _el('mod-dl-eta').textContent = 'Time remaining: —';
  _hideStatusMsg();
  _showCancelOnly();
  panel.classList.add('mod-dl-panel--visible');
}

function _hidePanel() {
  const panel = document.getElementById('mod-dl-panel');
  if (panel) panel.classList.remove('mod-dl-panel--visible');
}

function _updateProgress({ receivedBytes, totalBytes, speedBps, etaSeconds, percent }) {
  _el('mod-dl-percent').textContent = `${percent}%`;
  _el('mod-dl-bar').style.width     = `${percent}%`;
  _el('mod-dl-mb').textContent      = `${_fmtMB(receivedBytes)} / ${totalBytes > 0 ? _fmtMB(totalBytes) : '— MB'}`;
  _el('mod-dl-speed').textContent   = speedBps > 0 ? `${_fmtMB(speedBps)}/s` : '—';
  _el('mod-dl-eta').textContent     = etaSeconds > 0 ? `Time remaining: ${_fmtEta(etaSeconds)}` : 'Time remaining: —';
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
    <span class="mod-dl-eta" id="mod-dl-eta">Download paused</span>
    <span style="display:flex;gap:14px;align-items:center">
      <button class="mod-dl-btn--cancel" id="mod-dl-cancel-btn2">Cancel</button>
      <button class="mod-dl-btn--resume" id="mod-dl-resume-btn">Resume</button>
    </span>`;

  actions.querySelector('#mod-dl-cancel-btn2').addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.cancelModuleDownload) {
      window.electronAPI.cancelModuleDownload();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
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
    <span class="mod-dl-eta" id="mod-dl-eta">Time remaining: —</span>
    <button class="mod-dl-btn--cancel" id="mod-dl-cancel-btn">Cancel</button>`;
  actions.querySelector('#mod-dl-cancel-btn').addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.cancelModuleDownload) {
      window.electronAPI.cancelModuleDownload();
    }
    _hidePanel();
    _active = false;
    _paused = false;
    _currentModuleId = null;
  });
}

// ─── FORMATTING HELPERS ───────────────────────────────────────────────────────

function _el(id) { return document.getElementById(id); }

function _fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function _fmtEta(seconds) {
  if (seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
