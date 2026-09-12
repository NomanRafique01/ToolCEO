/**
 * frontend/tools/archives/archive_protect.js
 *
 * Password Protect & Remove Password tool module for Archives.
 * Supports ZIP (AES-256), 7Z (AES-256 with optional Header Encryption),
 * and RAR (AES-256 via WinRAR CLI).
 *
 * Exports:
 *   handleArchiveProtectFilePicked(file, initialMode)
 *   removeArchiveProtectPanel()
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../scripts/toolstate.js';
import { pushNotification } from '../../scripts/notificationStore.js';
import {
  showScanProgress,
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../shared/progress.js';
import { getArchiveFileIconSvg, getArchiveFormatLabel } from '../shared/archiveIcon.js';

const BACKEND = 'http://127.0.0.1:8000';

let _protectFile      = null;
let _protectBaseName  = '';
let _activeMode       = 'protect'; // 'protect' | 'unlock'
let _selectedFormat   = 'zip';     // 'zip' | '7z' | 'rar'
let _encryptHeader    = false;

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const p = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** p)).toFixed(p ? 1 : 0)} ${units[p]}`;
}

function _cleanStem(filename) {
  let name = filename || 'archive';
  for (const ext of ['.tar.gz', '.tar.bz2', '.tar.xz', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.cab', '.iso', '.dmg']) {
    if (name.toLowerCase().endsWith(ext)) { name = name.slice(0, -ext.length); break; }
  }
  return name || 'archive';
}

function _detectFormat(filename) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.7z')) return '7z';
  if (lower.endsWith('.rar')) return 'rar';
  return 'zip';
}

function _scrollToTop() {
  const mc = document.getElementById('main-content');
  if (mc) {
    mc.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── PUBLIC TEARDOWN ─────────────────────────────────────────────────────────

export function removeArchiveProtectPanel() {
  const panel = document.getElementById('archive-protect-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-arc-protect-thumb-wrap')?.remove();
    zone.classList.remove('dz-has-arc-protect-thumb');
  }

  _protectFile     = null;
  _protectBaseName = '';
}

// ─── THUMBNAIL (inside drop zone) ────────────────────────────────────────────

function _showThumb(zone, file, color) {
  zone.querySelector('.dz-arc-protect-thumb-wrap')?.remove();

  const format  = getArchiveFormatLabel(file.name);
  const iconSvg = getArchiveFileIconSvg(format, color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-arc-protect-thumb-wrap';
  wrap.style.setProperty('--arc-protect-color', color);

  wrap.innerHTML = `
    <div class="dz-arc-protect-thumb-card">
      <div class="dz-arc-protect-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${iconSvg}
      </div>
      <button class="dz-arc-protect-thumb-remove" title="Remove file" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-arc-protect-thumb-name">${_esc(file.name)}</span>
    <span class="dz-arc-protect-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-arc-protect-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-arc-protect-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeArchiveProtectPanel();
    const z = document.getElementById('drop-zone');
    if (z) resetZoneContent(z);
    import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── PASSWORD STRENGTH CALCULATOR ────────────────────────────────────────────

function _calcStrength(pass) {
  if (!pass) return { score: 0, label: '', color: 'transparent', pct: 0 };
  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 10) score += 1;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  if (score <= 1) return { score: 1, label: 'Weak', color: '#EF4444', pct: 25 };
  if (score <= 3) return { score: 2, label: 'Medium', color: '#F59E0B', pct: 60 };
  return { score: 3, label: 'Strong', color: '#10B981', pct: 100 };
}

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────

function _showSettingsPanel(file, color, isEncrypted = null) {
  document.getElementById('archive-protect-panel')?.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id        = 'archive-protect-panel';
  panel.style.setProperty('--arc-protect-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ── -->
    <div class="arc-protect-header">
      <div class="arc-protect-header-info">
        <span><strong>${_esc(file.name)}</strong> &nbsp;·&nbsp; Size: <strong>${_fmt(file.size)}</strong></span>
      </div>
      <button class="arc-protect-change-btn" id="arc-prot-change-btn" title="Pick a different archive">Change file</button>
    </div>

    <!-- ── DYNAMIC FORM BODY ── -->
    <div class="arc-protect-form-body" id="arc-protect-form-body"></div>

    <!-- ── ACTIONS ROW ── -->
    <div class="arc-protect-actions" id="arc-protect-actions"></div>
  `;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('arc-protect--visible'));

  // Wire Change file
  panel.querySelector('#arc-prot-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeArchiveProtectPanel();
    const zone = document.getElementById('drop-zone');
    if (zone) resetZoneContent(zone);
    if (tool) {
      import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  _renderForm(panel, file, color, isEncrypted);
}

// ─── RENDER FORM CONTENT ─────────────────────────────────────────────────────

function _renderForm(panel, file, color, isEncrypted = null) {
  const formBody = panel.querySelector('#arc-protect-form-body');
  const actionsRow = panel.querySelector('#arc-protect-actions');
  if (!formBody || !actionsRow) return;

  const eyeIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

  if (_activeMode === 'protect') {
    // If the file is already password-protected, inform the user
    if (isEncrypted === true) {
      pushNotification({ type: 'warning', message: 'This archive is already password-protected. Unlock it first to change its password.' });
      formBody.innerHTML = `
        <div class="arc-protect-unlocked-notice arc-protect-unlocked-notice--warning">
          <div class="arc-protect-unlocked-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <div class="arc-protect-unlocked-text">
            <span class="arc-protect-unlocked-title">Archive is Already Password-Protected</span>
            <span class="arc-protect-unlocked-desc">This archive is already encrypted with a password. If you wish to set a new password, please unlock it first using Remove Archive Password.</span>
          </div>
        </div>
      `;
      actionsRow.innerHTML = `
        <button type="button" class="arc-protect-submit-btn arc-protect-submit-btn--secondary" id="arc-prot-other-file-btn">
          Choose Another File
        </button>
      `;
      actionsRow.querySelector('#arc-prot-other-file-btn')?.addEventListener('click', () => {
        panel.querySelector('#arc-prot-change-btn')?.click();
      });
      return;
    }

    const headerToggleHtml = _selectedFormat === '7z' ? `
      <!-- Header Encryption Toggle (7Z) -->
      <div class="arc-protect-toggle-card" id="arc-prot-header-card">
        <div class="arc-protect-toggle-left">
          <span class="arc-protect-toggle-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Encrypt File Names &amp; Header
          </span>
          <span class="arc-protect-toggle-subtitle">Hides file names until password is entered</span>
        </div>
        <label class="arc-protect-switch">
          <input type="checkbox" id="arc-prot-header-toggle" ${_encryptHeader ? 'checked' : ''} />
          <span class="arc-protect-slider"></span>
        </label>
      </div>
    ` : '';

    formBody.innerHTML = `
      <!-- Password field -->
      <div class="arc-protect-field-group">
        <label class="arc-protect-label" for="arc-prot-pass">
          Set Password <span style="color:#F87171">*</span>
        </label>
        <div class="arc-protect-input-wrap">
          <input type="password" id="arc-prot-pass" class="arc-protect-input" placeholder="Enter password (AES-256)" autocomplete="new-password" />
          <button type="button" class="arc-protect-eye-btn" data-target="arc-prot-pass" title="Toggle password visibility">${eyeIcon}</button>
        </div>
        <div class="arc-protect-strength-wrap">
          <div class="arc-protect-strength-bar"><div class="arc-protect-strength-fill" id="arc-prot-strength-fill"></div></div>
          <span class="arc-protect-strength-label" id="arc-prot-strength-label"></span>
        </div>
      </div>

      <!-- Confirm Password field -->
      <div class="arc-protect-field-group">
        <label class="arc-protect-label" for="arc-prot-confirm">
          Confirm Password <span style="color:#F87171">*</span>
        </label>
        <div class="arc-protect-input-wrap">
          <input type="password" id="arc-prot-confirm" class="arc-protect-input" placeholder="Re-enter password to verify" autocomplete="new-password" />
          <button type="button" class="arc-protect-eye-btn" data-target="arc-prot-confirm" title="Toggle password visibility">${eyeIcon}</button>
        </div>
      </div>

      ${headerToggleHtml}

      <!-- Custom Output Filename -->
      <div class="arc-protect-field-group">
        <label class="arc-protect-label" for="arc-prot-filename">Output Filename (optional)</label>
        <input type="text" id="arc-prot-filename" class="arc-protect-input"
               placeholder="${_esc(_protectBaseName)}_protected.${_selectedFormat}"
               value="${_esc(_protectBaseName)}_protected.${_selectedFormat}"
               maxlength="120" spellcheck="false" />
      </div>
    `;

    actionsRow.innerHTML = `
      <button type="button" class="arc-protect-submit-btn" id="arc-prot-submit-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        Protect Archive
      </button>
    `;

    // Strength listener
    const passInput = formBody.querySelector('#arc-prot-pass');
    const strengthFill = formBody.querySelector('#arc-prot-strength-fill');
    const strengthLabel = formBody.querySelector('#arc-prot-strength-label');
    passInput.addEventListener('input', () => {
      const st = _calcStrength(passInput.value);
      strengthFill.style.width = `${st.pct}%`;
      strengthFill.style.backgroundColor = st.color;
      strengthLabel.textContent = st.label;
      strengthLabel.style.color = st.color;
    });

    // Header toggle listener
    const headerToggle = formBody.querySelector('#arc-prot-header-toggle');
    if (headerToggle) {
      headerToggle.addEventListener('change', () => {
        _encryptHeader = headerToggle.checked;
      });
    }

    // Submit Protect
    actionsRow.querySelector('#arc-prot-submit-btn').addEventListener('click', () => {
      const p1 = formBody.querySelector('#arc-prot-pass')?.value || '';
      const p2 = formBody.querySelector('#arc-prot-confirm')?.value || '';
      const nameInput = formBody.querySelector('#arc-prot-filename');
      const outName = (nameInput ? nameInput.value.trim() : '') || `${_protectBaseName}_protected.${_selectedFormat}`;

      if (!p1) {
        pushNotification({ type: 'warning', message: 'Please enter a password to protect the archive.' });
        formBody.querySelector('#arc-prot-pass')?.focus();
        return;
      }
      if (p1 !== p2) {
        pushNotification({ type: 'error', message: 'Passwords do not match. Please verify your password.' });
        formBody.querySelector('#arc-prot-confirm')?.focus();
        return;
      }

      const encHead = _selectedFormat === 'rar' ? true : (_selectedFormat === '7z' ? !!headerToggle?.checked : false);
      _scrollToTop();
      _submitProtect(file, p1, _selectedFormat, encHead, outName);
    });

  } else {
    // ── UNLOCK / REMOVE PASSWORD TAB ──────────────────────────────────────────
    // If the file is already unlocked (no password), inform the user!
    if (isEncrypted === false) {
      pushNotification({ type: 'info', message: 'The selected archive is already unlocked (no password set).' });
      formBody.innerHTML = `
        <div class="arc-protect-unlocked-notice">
          <div class="arc-protect-unlocked-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div class="arc-protect-unlocked-text">
            <span class="arc-protect-unlocked-title">Archive is Already Unlocked</span>
            <span class="arc-protect-unlocked-desc">Your selected archive file has no password or is already unlocked. No decryption is required.</span>
          </div>
        </div>
      `;
      actionsRow.innerHTML = `
        <button type="button" class="arc-protect-submit-btn arc-protect-submit-btn--secondary" id="arc-prot-other-file-btn">
          Choose Another File
        </button>
      `;
      actionsRow.querySelector('#arc-prot-other-file-btn')?.addEventListener('click', () => {
        panel.querySelector('#arc-prot-change-btn')?.click();
      });
      return;
    }

    formBody.innerHTML = `
      <div class="arc-protect-field-group">
        <label class="arc-protect-label" for="arc-prot-unlock-pass">
          Current Archive Password <span style="color:#F87171">*</span>
        </label>
        <div class="arc-protect-input-wrap">
          <input type="password" id="arc-prot-unlock-pass" class="arc-protect-input" placeholder="Enter password to unlock and decrypt" autocomplete="current-password" />
          <button type="button" class="arc-protect-eye-btn" data-target="arc-prot-unlock-pass" title="Toggle password visibility">${eyeIcon}</button>
        </div>
      </div>

      <div class="arc-protect-field-group">
        <label class="arc-protect-label" for="arc-prot-unlock-filename">Output Filename (optional)</label>
        <input type="text" id="arc-prot-unlock-filename" class="arc-protect-input"
               placeholder="${_esc(_protectBaseName)}_unlocked.${_detectFormat(file.name)}"
               value="${_esc(_protectBaseName)}_unlocked.${_detectFormat(file.name)}"
               maxlength="120" spellcheck="false" />
      </div>
    `;

    actionsRow.innerHTML = `
      <button type="button" class="arc-protect-submit-btn" id="arc-prot-unlock-submit-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
        </svg>
        Remove Password &amp; Decrypt
      </button>
    `;

    // Submit Unlock
    actionsRow.querySelector('#arc-prot-unlock-submit-btn').addEventListener('click', () => {
      const p = formBody.querySelector('#arc-prot-unlock-pass')?.value || '';
      const nameInput = formBody.querySelector('#arc-prot-unlock-filename');
      const outName = (nameInput ? nameInput.value.trim() : '') || `${_protectBaseName}_unlocked.${_detectFormat(file.name)}`;

      if (!p) {
        pushNotification({ type: 'warning', message: 'Please enter the archive password to unlock it.' });
        formBody.querySelector('#arc-prot-unlock-pass')?.focus();
        return;
      }

      _scrollToTop();
      _submitUnlock(file, p, outName);
    });
  }


  // Eye toggle listeners
  formBody.querySelectorAll('.arc-protect-eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = formBody.querySelector(`#${targetId}`);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.style.color = isPass ? 'var(--arc-protect-color, #F59E0B)' : 'var(--text-muted, #8b949e)';
    });
  });
}

// ─── PUBLIC FILE HANDLER ─────────────────────────────────────────────────────

export async function handleArchiveProtectFilePicked(file, initialMode = 'protect') {
  if (!file) return;

  const ARCHIVE_EXTS = [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.cab',
    '.iso', '.dmg', '.wim', '.tar.gz', '.tar.bz2', '.tar.xz',
  ];
  const lname = file.name.toLowerCase();
  if (!ARCHIVE_EXTS.some((e) => lname.endsWith(e))) {
    pushNotification({ type: 'warning', message: 'Invalid File Format. Please select a valid archive file.' });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#FBBF24') : '#FBBF24';
  const zone  = document.getElementById('drop-zone');

  removeArchiveProtectPanel();

  _protectFile     = file;
  _protectBaseName = _cleanStem(file.name);
  _activeMode      = initialMode || (tool?.id === 'archive-unlock' ? 'unlock' : 'protect');
  _selectedFormat  = _detectFormat(file.name);

  showScanProgress(zone, color, tool?.id || 'archive-protect');

  // Inspect archive metadata to detect whether it is already encrypted or unlocked
  let isEncrypted = null;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BACKEND}/api/archives/extract/info`, { method: 'POST', body: fd });
    if (res.ok) {
      const info = await res.json();
      isEncrypted = typeof info.is_encrypted === 'boolean' ? info.is_encrypted : null;
    }
  } catch (_) {}

  await new Promise((r) => setTimeout(r, 250));

  resetZoneContent(zone);
  _showThumb(zone, file, color);
  _showSettingsPanel(file, color, isEncrypted);
}

// ─── SUBMIT PROTECT ──────────────────────────────────────────────────────────

async function _submitProtect(file, password, outputFormat, encryptHeader, outputName) {
  const tool = getActiveTool();
  if (!tool) return;

  _scrollToTop();

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#FBBF24';
  const earlyName = `${outputName || _protectBaseName}_protected.${outputFormat}`;

  // Teardown settings panel & thumb before starting progress ring
  document.getElementById('archive-protect-panel')?.remove();
  zone?.querySelector('.dz-arc-protect-thumb-wrap')?.remove();
  zone?.classList.remove('dz-has-arc-protect-thumb');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('password', password);
  fd.append('output_format', outputFormat);
  fd.append('encrypt_header', encryptHeader ? 'true' : 'false');
  fd.append('output_filename', outputName);

  showProgress(zone, 10, color, 'Encrypting archive (AES-256)…', tool.id);
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/archives/protect`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
        : (typeof detail === 'string' ? detail : JSON.stringify(detail));
      throw new Error(msg || `Server error ${res.status}`);
    }
    jobId = json.job_id;
  } catch (err) {
    showError(zone, `Encryption failed: ${err.message}`, tool.id);
    clearBgJob();
    return;
  }

  const sse    = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct  = 0;
  setBgJob({ jobId, tool, filename: earlyName, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const rawPct = typeof data.progress === 'number' ? data.progress : lastPct;
    const pct    = Math.max(lastPct, rawPct);
    lastPct = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state    = data.state === 'done' ? 'done' : (data.state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (data.state === 'running' || data.state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color, tool.id);
      return;
    }

    sse.close();

    if (data.state === 'done') {
      updateProgress(zone, 100, color, tool.id);
      removeArchiveProtectPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeArchiveProtectPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset, tool.id), 200);
      if (getActiveTool()?.id === tool.id) {
        document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (data.state === 'error') {
      showError(zone, data.error || 'Protection failed. Please check your file and password.', tool.id);
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
  };
}

// ─── SUBMIT UNLOCK ───────────────────────────────────────────────────────────

async function _submitUnlock(file, password, outputName) {
  const tool = getActiveTool();
  if (!tool) return;

  _scrollToTop();

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#FBBF24';
  const earlyName = `${outputName || _protectBaseName}_unlocked.${_detectFormat(file.name)}`;

  // Teardown settings panel & thumb before starting progress ring
  document.getElementById('archive-protect-panel')?.remove();
  zone?.querySelector('.dz-arc-protect-thumb-wrap')?.remove();
  zone?.classList.remove('dz-has-arc-protect-thumb');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('password', password);
  fd.append('output_filename', outputName);

  showProgress(zone, 10, color, 'Decrypting archive…', tool.id);
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/archives/unlock`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
        : (typeof detail === 'string' ? detail : JSON.stringify(detail));
      throw new Error(msg || `Server error ${res.status}`);
    }
    jobId = json.job_id;
  } catch (err) {
    showError(zone, `Unlock request failed: ${err.message}`, tool.id);
    clearBgJob();
    return;
  }

  const sse    = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct  = 0;
  setBgJob({ jobId, tool, filename: earlyName, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const rawPct = typeof data.progress === 'number' ? data.progress : lastPct;
    const pct    = Math.max(lastPct, rawPct);
    lastPct = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state    = data.state === 'done' ? 'done' : (data.state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (data.state === 'running' || data.state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color, tool.id);
      return;
    }

    sse.close();

    if (data.state === 'done') {
      updateProgress(zone, 100, color, tool.id);
      removeArchiveProtectPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeArchiveProtectPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset, tool.id), 200);
      if (getActiveTool()?.id === tool.id) {
        document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (data.state === 'error') {
      showError(zone, data.error || 'Incorrect password or decryption failed. Please try again.', tool.id);
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
  };
}
