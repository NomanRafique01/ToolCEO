/**
 * tools/documents/pdf_tools/encrypt/encrypt.js
 *
 * PDF Encrypt / Decrypt & ToolCEO Vault (.tceo) Tool module.
 * Supports standard PDF encryption/decryption as well as the high-security
 * ToolCEO Vault (.tceo) binary container format.
 *
 * Exports:
 *   handleEncryptFilePicked(file)  – call when a file is chosen
 *   removeEncryptPanel()           – teardown on tool change / reset
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../../scripts/toolstate.js';
import { pushNotification } from '../../../../scripts/notificationStore.js';
import {
  showScanProgress,
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownloadBlobCard,
  showError,
  escHtml,
} from '../../../shared/progress.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── MODULE STATE ──────────────────────────────────────────────────────────────

let _encryptFile      = null;
let _encryptBaseName  = '';
let _encryptFileSize  = 0;
let _encryptPageCount = 1;
let _encInfo          = null;
let _vaultInfo        = null; // { is_tceo, version, has_hint, tampered }
let _isTceo           = false;
let _activeTab        = 'encrypt'; // 'encrypt' | 'decrypt' | 'vault'
let _thumbDataUri     = null;

function _fmt(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

export function removeEncryptPanel() {
  const panel = document.getElementById('encrypt-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-encrypt-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-encrypt-thumb');
  }

  _encryptFile      = null;
  _encryptBaseName  = '';
  _encryptFileSize  = 0;
  _encryptPageCount = 1;
  _encInfo          = null;
  _vaultInfo        = null;
  _isTceo           = false;
  _activeTab        = 'encrypt';
  _thumbDataUri     = null;
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showEncryptThumb(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-encrypt-thumb-wrap');
  if (old) old.remove();

  const thumbContent = dataUri
    ? `<img class="dz-encrypt-thumb-img" src="${dataUri}" alt="PDF preview" draggable="false" />`
    : (_isTceo
        ? `<svg class="dz-encrypt-thumb-icon" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="90" height="116" rx="6" fill="#1E1B4B"/>
            <polygon points="62,0 90,28 62,28" fill="#312E81"/>
            <polyline points="62,0 62,28 90,28" fill="none" stroke="#4338CA" stroke-width="1"/>
            <path d="M45 38 L65 48 V64 C65 76 45 88 45 88 C45 88 25 76 25 64 V48 Z" fill="none" stroke="#818CF8" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M45 54 V64 M45 70 V71" stroke="#818CF8" stroke-width="2.5" stroke-linecap="round"/>
            <text x="45" y="102" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="#818CF8" text-anchor="middle">.TCEO</text>
          </svg>`
        : `<svg class="dz-encrypt-thumb-icon" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
            <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
            <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
            <rect x="0" y="42" width="90" height="26" fill="${color}"/>
            <text x="45" y="60" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">PDF</text>
            <line x1="12" y1="80" x2="78" y2="80" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="89" x2="78" y2="89" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="98" x2="55" y2="98" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
          </svg>`);

  const wrap = document.createElement('div');
  wrap.className = 'dz-encrypt-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-encrypt-thumb-card">
      <div class="dz-encrypt-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${thumbContent}
      </div>
      <button class="dz-encrypt-thumb-remove" title="Remove file"
              style="--enc-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-encrypt-thumb-name">${escHtml(file.name)}</span>
    <span class="dz-encrypt-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-encrypt-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-encrypt-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeEncryptPanel();
    resetZoneContent(zone);
    import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(pageCount, encInfo, color) {
  const existing = document.getElementById('encrypt-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id        = 'encrypt-settings-panel';
  panel.className = 'enc-panel';
  panel.style.setProperty('--enc-color', color);

  let badgeHtml = '';
  if (_isTceo) {
    badgeHtml = `<span class="enc-badge enc-badge--vault">🛡️ ToolCEO Vault v2</span>`;
    if (_vaultInfo && _vaultInfo.tampered) {
      badgeHtml += ` <span class="enc-badge enc-badge--tampered">⚠️ File Tampered</span>`;
    }
  } else if (encInfo && encInfo.is_encrypted) {
    badgeHtml = `<span class="enc-badge enc-badge--encrypted">🔒 Encrypted</span>`;
  } else {
    badgeHtml = `<span class="enc-badge enc-badge--unlocked">🔓 Unlocked</span>`;
  }

  const headerInfo = _isTceo
    ? `<span><strong>.tceo Vault Container</strong> &nbsp;·&nbsp; Size: <strong>${_fmt(_encryptFileSize)}</strong></span> ${badgeHtml}`
    : `<span><strong>${pageCount}</strong> page${pageCount !== 1 ? 's' : ''} &nbsp;·&nbsp; Size: <strong>${_fmt(_encryptFileSize)}</strong></span> ${badgeHtml}`;

  const tabsHtml = _isTceo
    ? `<div class="enc-tabs">
        <button type="button" class="enc-tab-btn enc-tab-btn--active" data-tab="vault">
          🛡️ ToolCEO Vault Unlock
        </button>
       </div>`
    : `<div class="enc-tabs">
        <button type="button" class="enc-tab-btn ${!(_activeTab === 'decrypt' || _activeTab === 'vault') ? 'enc-tab-btn--active' : ''}" data-tab="encrypt">
          🔒 Encrypt PDF
        </button>
        <button type="button" class="enc-tab-btn ${_activeTab === 'decrypt' ? 'enc-tab-btn--active' : ''}" data-tab="decrypt">
          🔓 Decrypt PDF
        </button>
        <button type="button" class="enc-tab-btn ${_activeTab === 'vault' ? 'enc-tab-btn--active' : ''}" data-tab="vault">
          🛡️ ToolCEO Vault
        </button>
       </div>`;

  panel.innerHTML = `
    <!-- ── PANEL HEADER ── -->
    <div class="enc-header">
      <div class="enc-header-info">${headerInfo}</div>
      <button class="enc-change-btn" id="enc-change-btn" title="Pick a different file">Change file</button>
    </div>

    <!-- ── MODE TABS ── -->
    ${tabsHtml}

    <!-- ── DYNAMIC FORM BODY ── -->
    <div class="enc-form-body" id="enc-form-body"></div>

    <!-- ── ACTIONS ROW ── -->
    <div class="enc-actions" id="enc-actions"></div>
  `;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('enc-panel--visible'));

  // Wire "Change file"
  panel.querySelector('#enc-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeEncryptPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  if (_isTceo) {
    _activeTab = 'vault';
  } else if (!_activeTab || _activeTab === 'decrypt') {
    _activeTab = encInfo && encInfo.is_encrypted ? 'decrypt' : 'encrypt';
  }

  panel.querySelectorAll('.enc-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.enc-tab-btn').forEach((b) => b.classList.remove('enc-tab-btn--active'));
      btn.classList.add('enc-tab-btn--active');
      _activeTab = btn.dataset.tab;
      _renderFormBody(panel, encInfo, color);
    });
  });

  _renderFormBody(panel, encInfo, color);
}

// ─── RENDER FORM BODY PER TAB ──────────────────────────────────────────────────

function _renderFormBody(panel, encInfo, color) {
  const formBody = panel.querySelector('#enc-form-body');
  const actionsRow = panel.querySelector('#enc-actions');
  if (!formBody || !actionsRow) return;

  if (_activeTab === 'encrypt') {
    // ── ENCRYPT TAB ──────────────────────────────────────────────────────────
    formBody.innerHTML = `
      <div class="enc-field-group">
        <label class="enc-label" for="enc-user-pass">User Password <span style="color:#F87171">*</span></label>
        <div class="enc-input-wrap">
          <input type="password" id="enc-user-pass" class="enc-input" placeholder="Enter password to block opening" />
          <button type="button" class="enc-eye-btn" data-target="enc-user-pass" title="Toggle password visibility">👁️</button>
        </div>
        <div class="enc-strength-wrap">
          <div class="enc-strength-bar"><div class="enc-strength-fill" id="enc-strength-fill"></div></div>
          <span class="enc-strength-label" id="enc-strength-label"></span>
        </div>
      </div>

      <div class="enc-field-group">
        <label class="enc-label" for="enc-confirm-pass">Confirm Password <span style="color:#F87171">*</span></label>
        <div class="enc-input-wrap">
          <input type="password" id="enc-confirm-pass" class="enc-input" placeholder="Re-enter password to verify" />
          <button type="button" class="enc-eye-btn" data-target="enc-confirm-pass" title="Toggle password visibility">👁️</button>
        </div>
      </div>

      <div>
        <button type="button" class="enc-advanced-toggle" id="enc-advanced-toggle">
          <span>Advanced: Permissions Password</span>
          <span class="enc-advanced-chevron" id="enc-advanced-chevron">▾</span>
        </button>
        <div class="enc-advanced-body" id="enc-advanced-body" style="display:none">
          <div class="enc-field-group">
            <label class="enc-label" for="enc-owner-pass">Owner Password <span style="font-size:11px;color:var(--text-muted);font-weight:400">(Optional)</span></label>
            <div class="enc-input-wrap">
              <input type="password" id="enc-owner-pass" class="enc-input" placeholder="Full access password (falls back to user password)" />
              <button type="button" class="enc-eye-btn" data-target="enc-owner-pass" title="Toggle password visibility">👁️</button>
            </div>
          </div>

          <div class="enc-permissions-grid">
            <div class="enc-perm-item">
              <span>Allow Printing</span>
              <label class="enc-switch">
                <input type="checkbox" id="perm-print" checked />
                <span class="enc-slider"></span>
              </label>
            </div>
            <div class="enc-perm-item">
              <span>Allow Copying</span>
              <label class="enc-switch">
                <input type="checkbox" id="perm-copy" />
                <span class="enc-slider"></span>
              </label>
            </div>
            <div class="enc-perm-item">
              <span>Allow Editing</span>
              <label class="enc-switch">
                <input type="checkbox" id="perm-edit" />
                <span class="enc-slider"></span>
              </label>
            </div>
            <div class="enc-perm-item">
              <span>Allow Annotations</span>
              <label class="enc-switch">
                <input type="checkbox" id="perm-annot" />
                <span class="enc-slider"></span>
              </label>
            </div>
            <div class="enc-perm-item">
              <span>Allow Form Filling</span>
              <label class="enc-switch">
                <input type="checkbox" id="perm-forms" />
                <span class="enc-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="enc-field-group">
        <label class="enc-label">Encryption Level</label>
        <div class="enc-pill-group" id="enc-pill-group">
          <button type="button" class="enc-pill-btn" data-level="128">128-bit RC4</button>
          <button type="button" class="enc-pill-btn enc-pill-btn--active" data-level="256">256-bit AES</button>
        </div>
      </div>
    `;

    actionsRow.innerHTML = `
      <input class="enc-filename-input" id="enc-filename-input" type="text"
             value="${escHtml(_encryptBaseName)}_encrypted" placeholder="Output filename" spellcheck="false" />
      <span class="enc-filename-ext">.pdf</span>
      <button type="button" class="enc-submit-btn" id="enc-submit-btn" disabled>🔒 Encrypt PDF</button>
    `;

    _wireEncryptEvents(panel, color);
  } else if (_activeTab === 'decrypt') {
    // ── DECRYPT TAB ──────────────────────────────────────────────────────────
    if (encInfo && !encInfo.is_encrypted) {
      formBody.innerHTML = `
        <div class="enc-warning-banner">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/>
            <line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="8" cy="11.5" r="0.8" fill="currentColor"/>
          </svg>
          This PDF is not password protected.
        </div>
      `;
      actionsRow.innerHTML = `
        <button type="button" class="enc-submit-btn" id="enc-submit-btn" disabled>🔓 Remove Password & Unlock</button>
      `;
    } else {
      formBody.innerHTML = `
        <div class="enc-field-group">
          <label class="enc-label" for="dec-pass">Password <span style="color:#F87171">*</span></label>
          <div class="enc-input-wrap">
            <input type="password" id="dec-pass" class="enc-input" placeholder="Enter current password to unlock" />
            <button type="button" class="enc-eye-btn" data-target="dec-pass" title="Toggle password visibility">👁️</button>
          </div>
          <div class="dec-field-error" id="dec-field-error" style="display:none"></div>
        </div>
      `;
      actionsRow.innerHTML = `
        <input class="enc-filename-input" id="enc-filename-input" type="text"
               value="${escHtml(_encryptBaseName)}_unlocked" placeholder="Output filename" spellcheck="false" />
        <span class="enc-filename-ext">.pdf</span>
        <button type="button" class="enc-submit-btn" id="enc-submit-btn" disabled>🔓 Remove Password & Unlock</button>
      `;
      _wireDecryptEvents(panel, color);
    }
  } else if (_activeTab === 'vault') {
    // ── TOOLCEO VAULT TAB ────────────────────────────────────────────────────
    if (_isTceo) {
      // Vault Unlock Mode (.tceo file loaded)
      const hintNotice = _vaultInfo && _vaultInfo.has_hint
        ? `<div class="enc-warning-banner" style="border-color:rgba(99,102,241,0.4);background:rgba(99,102,241,0.1);color:#818CF8">
             💡 This vault container has an encrypted password hint. Enter password to unlock.
           </div>`
        : '';
      const tamperedNotice = _vaultInfo && _vaultInfo.tampered
        ? `<div class="enc-warning-banner" style="border-color:rgba(248,113,113,0.4);background:rgba(248,113,113,0.1);color:#F87171">
             ⚠️ Warning: SHA-256 Checksum mismatch. File may be tampered with or corrupted.
           </div>`
        : '';

      formBody.innerHTML = `
        ${hintNotice}
        ${tamperedNotice}
        <div class="enc-field-group">
          <label class="enc-label" for="vlt-pass">Vault Password <span style="color:#F87171">*</span></label>
          <div class="enc-input-wrap">
            <input type="password" id="vlt-pass" class="enc-input" placeholder="Enter master password to recover PDF" />
            <button type="button" class="enc-eye-btn" data-target="vlt-pass" title="Toggle password visibility">👁️</button>
          </div>
          <div class="dec-field-error" id="vlt-field-error" style="display:none"></div>
        </div>
      `;

      actionsRow.innerHTML = `
        <input class="enc-filename-input" id="enc-filename-input" type="text"
               value="${escHtml(_encryptBaseName)}_unlocked" placeholder="Output filename" spellcheck="false" />
        <span class="enc-filename-ext">.pdf</span>
        <button type="button" class="enc-submit-btn" id="enc-submit-btn" disabled style="background:#6366F1">🔓 Unlock & Recover PDF</button>
      `;

      _wireVaultUnlockEvents(panel, color);
    } else {
      // Vault Lock Mode (Standard PDF loaded)
      formBody.innerHTML = `
        <div class="enc-field-group">
          <label class="enc-label" for="vlt-user-pass">Vault Password <span style="color:#F87171">*</span> (Min 4 characters)</label>
          <div class="enc-input-wrap">
            <input type="password" id="vlt-user-pass" class="enc-input" placeholder="Enter high-security master password" />
            <button type="button" class="enc-eye-btn" data-target="vlt-user-pass" title="Toggle password visibility">👁️</button>
          </div>
          <div class="enc-strength-wrap">
            <div class="enc-strength-bar"><div class="enc-strength-fill" id="vlt-strength-fill"></div></div>
            <span class="enc-strength-label" id="vlt-strength-label"></span>
          </div>
        </div>

        <div class="enc-field-group">
          <label class="enc-label" for="vlt-confirm-pass">Confirm Password <span style="color:#F87171">*</span></label>
          <div class="enc-input-wrap">
            <input type="password" id="vlt-confirm-pass" class="enc-input" placeholder="Re-enter master password" />
            <button type="button" class="enc-eye-btn" data-target="vlt-confirm-pass" title="Toggle password visibility">👁️</button>
          </div>
        </div>

        <div class="enc-field-group">
          <label class="enc-label" for="vlt-hint">Password Hint <span style="font-size:11px;color:var(--text-muted);font-weight:400">(Optional)</span></label>
          <div class="enc-input-wrap">
            <input type="text" id="vlt-hint" class="enc-input" placeholder="Encrypted hint to help remember password" spellcheck="false" />
          </div>
        </div>
      `;

      actionsRow.innerHTML = `
        <input class="enc-filename-input" id="enc-filename-input" type="text"
               value="${escHtml(_encryptBaseName)}" placeholder="Output filename" spellcheck="false" />
        <span class="enc-filename-ext">.tceo</span>
        <button type="button" class="enc-submit-btn" id="enc-submit-btn" disabled style="background:#6366F1">🛡️ Lock in ToolCEO Vault (.tceo)</button>
      `;

      _wireVaultLockEvents(panel, color);
    }
  }

  _wireEyeToggles(panel);
}

// ─── EVENT WIRING FOR ENCRYPT TAB ──────────────────────────────────────────────

function _wireEncryptEvents(panel, color) {
  const userPassInput    = panel.querySelector('#enc-user-pass');
  const confirmPassInput = panel.querySelector('#enc-confirm-pass');
  const submitBtn        = panel.querySelector('#enc-submit-btn');
  const strengthFill     = panel.querySelector('#enc-strength-fill');
  const strengthLabel    = panel.querySelector('#enc-strength-label');

  const advToggle  = panel.querySelector('#enc-advanced-toggle');
  const advBody    = panel.querySelector('#enc-advanced-body');
  const advChevron = panel.querySelector('#enc-advanced-chevron');

  if (advToggle && advBody && advChevron) {
    advToggle.addEventListener('click', () => {
      const isOpen = advBody.style.display !== 'none';
      advBody.style.display = isOpen ? 'none' : 'flex';
      advChevron.classList.toggle('enc-advanced-chevron--open', !isOpen);
    });
  }

  let selectedLevel = '256';
  const pillBtns = panel.querySelectorAll('#enc-pill-group .enc-pill-btn');
  pillBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      pillBtns.forEach((b) => b.classList.remove('enc-pill-btn--active'));
      btn.classList.add('enc-pill-btn--active');
      selectedLevel = btn.dataset.level;
    });
  });

  const _validate = () => {
    const uPass = userPassInput ? userPassInput.value : '';
    const cPass = confirmPassInput ? confirmPassInput.value : '';

    if (!uPass) {
      if (strengthFill) { strengthFill.style.width = '0%'; strengthFill.style.backgroundColor = 'transparent'; }
      if (strengthLabel) { strengthLabel.textContent = ''; }
    } else if (uPass.length < 6) {
      if (strengthFill) { strengthFill.style.width = '33%'; strengthFill.style.backgroundColor = '#F87171'; }
      if (strengthLabel) { strengthLabel.textContent = 'Weak'; strengthLabel.style.color = '#F87171'; }
    } else if (uPass.length < 10 || !/[A-Z]/.test(uPass) || !/[0-9]/.test(uPass)) {
      if (strengthFill) { strengthFill.style.width = '66%'; strengthFill.style.backgroundColor = '#FBBF24'; }
      if (strengthLabel) { strengthLabel.textContent = 'Medium'; strengthLabel.style.color = '#FBBF24'; }
    } else {
      if (strengthFill) { strengthFill.style.width = '100%'; strengthFill.style.backgroundColor = '#34D399'; }
      if (strengthLabel) { strengthLabel.textContent = 'Strong'; strengthLabel.style.color = '#34D399'; }
    }

    const valid = uPass.length > 0 && uPass === cPass;
    if (submitBtn) submitBtn.disabled = !valid;
  };

  if (userPassInput) userPassInput.addEventListener('input', _validate);
  if (confirmPassInput) confirmPassInput.addEventListener('input', _validate);

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (!_encryptFile) return;
      const userPassword  = userPassInput ? userPassInput.value : '';
      const confirmPass   = confirmPassInput ? confirmPassInput.value : '';
      if (!userPassword || userPassword !== confirmPass) return;

      const ownerPassInput = panel.querySelector('#enc-owner-pass');
      const ownerPassword  = ownerPassInput ? ownerPassInput.value : '';

      const allowPrinting    = panel.querySelector('#perm-print')?.checked ?? true;
      const allowCopying     = panel.querySelector('#perm-copy')?.checked ?? false;
      const allowEditing     = panel.querySelector('#perm-edit')?.checked ?? false;
      const allowAnnotations = panel.querySelector('#perm-annot')?.checked ?? false;
      const allowForms       = panel.querySelector('#perm-forms')?.checked ?? false;

      const nameEl  = panel.querySelector('#enc-filename-input');
      const outName = (nameEl ? nameEl.value.trim() : '') || (_encryptBaseName + '_encrypted');

      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 0;

      _submitEncrypt({
        file: _encryptFile,
        user_password: userPassword,
        owner_password: ownerPassword,
        encryption_level: selectedLevel,
        allow_printing: allowPrinting,
        allow_copying: allowCopying,
        allow_editing: allowEditing,
        allow_annotations: allowAnnotations,
        allow_forms: allowForms,
        output_filename: outName,
        color,
      });
    });
  }
}

// ─── EVENT WIRING FOR DECRYPT TAB ──────────────────────────────────────────────

function _wireDecryptEvents(panel, color) {
  const decPassInput  = panel.querySelector('#dec-pass');
  const submitBtn     = panel.querySelector('#enc-submit-btn');
  const decFieldError = panel.querySelector('#dec-field-error');

  const _validate = () => {
    const pass = decPassInput ? decPassInput.value : '';
    if (submitBtn) submitBtn.disabled = pass.length === 0;
    if (decFieldError) decFieldError.style.display = 'none';
  };

  if (decPassInput) decPassInput.addEventListener('input', _validate);

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (!_encryptFile) return;
      const password = decPassInput ? decPassInput.value : '';
      if (!password) return;

      const nameEl  = panel.querySelector('#enc-filename-input');
      const outName = (nameEl ? nameEl.value.trim() : '') || (_encryptBaseName + '_unlocked');

      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 0;

      _submitDecrypt({
        file: _encryptFile,
        password,
        output_filename: outName,
        color,
      });
    });
  }
}

// ─── EVENT WIRING FOR VAULT TAB ────────────────────────────────────────────────

function _wireVaultLockEvents(panel, color) {
  const userPassInput    = panel.querySelector('#vlt-user-pass');
  const confirmPassInput = panel.querySelector('#vlt-confirm-pass');
  const hintInput        = panel.querySelector('#vlt-hint');
  const submitBtn        = panel.querySelector('#enc-submit-btn');
  const strengthFill     = panel.querySelector('#vlt-strength-fill');
  const strengthLabel    = panel.querySelector('#vlt-strength-label');

  const _validate = () => {
    const uPass = userPassInput ? userPassInput.value : '';
    const cPass = confirmPassInput ? confirmPassInput.value : '';

    if (!uPass) {
      if (strengthFill) { strengthFill.style.width = '0%'; strengthFill.style.backgroundColor = 'transparent'; }
      if (strengthLabel) { strengthLabel.textContent = ''; }
    } else if (uPass.length < 4) {
      if (strengthFill) { strengthFill.style.width = '25%'; strengthFill.style.backgroundColor = '#F87171'; }
      if (strengthLabel) { strengthLabel.textContent = 'Too Short (Min 4)'; strengthLabel.style.color = '#F87171'; }
    } else if (uPass.length < 8) {
      if (strengthFill) { strengthFill.style.width = '50%'; strengthFill.style.backgroundColor = '#FBBF24'; }
      if (strengthLabel) { strengthLabel.textContent = 'Fair'; strengthLabel.style.color = '#FBBF24'; }
    } else {
      if (strengthFill) { strengthFill.style.width = '100%'; strengthFill.style.backgroundColor = '#818CF8'; }
      if (strengthLabel) { strengthLabel.textContent = 'Vault Grade (600k iterations)'; strengthLabel.style.color = '#818CF8'; }
    }

    const valid = uPass.length >= 4 && uPass === cPass;
    if (submitBtn) submitBtn.disabled = !valid;
  };

  if (userPassInput) userPassInput.addEventListener('input', _validate);
  if (confirmPassInput) confirmPassInput.addEventListener('input', _validate);

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (!_encryptFile) return;
      const userPassword = userPassInput ? userPassInput.value : '';
      const confirmPass  = confirmPassInput ? confirmPassInput.value : '';
      if (!userPassword || userPassword.length < 4 || userPassword !== confirmPass) return;

      const hintText = hintInput ? hintInput.value.trim() : '';
      const nameEl   = panel.querySelector('#enc-filename-input');
      const outName  = (nameEl ? nameEl.value.trim() : '') || _encryptBaseName;

      _submitVaultLock({
        file: _encryptFile,
        password: userPassword,
        hint: hintText,
        output_filename: outName,
        color,
      });
    });
  }
}

function _wireVaultUnlockEvents(panel, color) {
  const passInput = panel.querySelector('#vlt-pass');
  const submitBtn = panel.querySelector('#enc-submit-btn');

  const _validate = () => {
    const pass = passInput ? passInput.value : '';
    if (submitBtn) submitBtn.disabled = pass.length === 0;
  };

  if (passInput) passInput.addEventListener('input', _validate);

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      if (!_encryptFile) return;
      const password = passInput ? passInput.value : '';
      if (!password) return;

      const nameEl  = panel.querySelector('#enc-filename-input');
      const outName = (nameEl ? nameEl.value.trim() : '') || (_encryptBaseName + '_unlocked');

      _submitVaultUnlock({
        file: _encryptFile,
        password,
        output_filename: outName,
        color,
      });
    });
  }
}

// ─── EYE TOGGLE BUTTONS ────────────────────────────────────────────────────────

function _wireEyeToggles(panel) {
  panel.querySelectorAll('.enc-eye-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = panel.querySelector(`#${targetId}`);
      if (input) {
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? '🔒' : '👁️';
      }
    });
  });
}

// ─── PUBLIC: HANDLE FILE PICKED ────────────────────────────────────────────────

export async function handleEncryptFilePicked(file) {
  if (!file) return;

  const fname  = file.name.toLowerCase();
  const isPdf  = fname.endsWith('.pdf')  || file.type === 'application/pdf';
  const isTceo = fname.endsWith('.tceo') || fname.endsWith('.tceo.pdf');

  if (!isPdf && !isTceo) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid PDF or .tceo Vault file.'
    });
    return;
  }

  const tool  = getActiveTool();
  const color = (tool && tool.color) || '#FBBF24';
  const zone  = document.getElementById('drop-zone');

  if (!zone) return;

  removeEncryptPanel();

  _encryptFile     = file;
  _encryptBaseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
  _encryptFileSize = file.size;
  _isTceo          = isTceo;

  // Show indeterminate scanning ring
  showScanProgress(zone, color);

  if (isTceo) {
    _activeTab = 'vault';
    let vaultInfo = null;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${BACKEND}/api/pdf/vault-check`, { method: 'POST', body: fd });
      if (res.ok) {
        vaultInfo = await res.json();
      }
    } catch (err) {
      console.error('Vault check failed:', err);
    }

    _vaultInfo = vaultInfo;
    resetZoneContent(zone);
    _showEncryptThumb(zone, file, color, null);
    _showSettingsPanel(1, null, color);
    return;
  }

  // Standard PDF scanning
  let encInfo = null;
  let pageCount = 1;
  let thumbUri = null;

  try {
    const fdEnc = new FormData();
    fdEnc.append('file', file);
    const fdCount = new FormData();
    fdCount.append('file', file);
    const fdThumb = new FormData();
    fdThumb.append('file', file);

    const [encRes, countRes, thumbRes] = await Promise.all([
      fetch(`${BACKEND}/api/pdf/check-encryption`, { method: 'POST', body: fdEnc }).catch(() => null),
      fetch(`${BACKEND}/api/pdf/page-count`, { method: 'POST', body: fdCount }).catch(() => null),
      fetch(`${BACKEND}/api/pdf/thumbnail`, { method: 'POST', body: fdThumb }).catch(() => null),
    ]);

    if (encRes && encRes.ok) {
      encInfo = await encRes.json().catch(() => null);
    }
    if (countRes && countRes.ok) {
      const countJson = await countRes.json().catch(() => ({}));
      pageCount = countJson.page_count || 1;
    }
    if (thumbRes && thumbRes.ok) {
      const thumbJson = await thumbRes.json().catch(() => ({}));
      thumbUri = thumbJson.thumbnail || null;
    }
  } catch (err) {
    console.error('Check encryption failed:', err);
  }

  _encInfo          = encInfo;
  _thumbDataUri     = thumbUri;
  _encryptPageCount = pageCount;

  // Clear scan ring
  resetZoneContent(zone);

  // Render thumbnail inside drop zone
  _showEncryptThumb(zone, file, color, thumbUri);

  // Render settings panel below drop zone
  _showSettingsPanel(pageCount, encInfo, color);
}

// ─── SUBMISSION FUNCTIONS ──────────────────────────────────────────────────────

async function _submitEncrypt(opts) {
  const {
    file,
    user_password,
    owner_password,
    encryption_level,
    allow_printing,
    allow_copying,
    allow_editing,
    allow_annotations,
    allow_forms,
    output_filename,
    color,
  } = opts;

  const tool = getActiveTool();
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const panel = document.getElementById('encrypt-settings-panel');
  if (panel) panel.remove();
  resetZoneContent(zone);
  showProgress(zone, 15, color, 'Encrypting PDF…');

  let outName = (output_filename || 'encrypted').trim();
  if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';

  setBgJob({ jobId: null, tool, filename: outName, progress: 15, state: 'running', sse: null });
  syncBgJobBar();

  const fd = new FormData();
  fd.append('file', file);
  fd.append('user_password', user_password);
  if (owner_password) fd.append('owner_password', owner_password);
  fd.append('encryption_level', encryption_level);
  fd.append('allow_printing', allow_printing);
  fd.append('allow_copying', allow_copying);
  fd.append('allow_editing', allow_editing);
  fd.append('allow_annotations', allow_annotations);
  fd.append('allow_forms', allow_forms);

  try {
    updateProgress(zone, 50, color);
    const bgMid = getBgJob();
    if (bgMid) { bgMid.progress = 50; syncBgJobBar(); }

    const res = await fetch(`${BACKEND}/api/pdf/encrypt`, {
      method: 'POST',
      body: fd,
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || `Encryption failed (${res.status})`);
    }

    const blob = await res.blob();

    updateProgress(zone, 100, color);
    const bgDone = getBgJob();
    if (bgDone) {
      bgDone.progress = 100;
      bgDone.state    = 'done';
      bgDone.filename = outName;
      syncBgJobBar();
    }

    const resetCb = () => {
      removeEncryptPanel();
      clearBgJob();
      const t = getActiveTool();
      if (t) {
        import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
          if (_updateDropZoneForTool) _updateDropZoneForTool(t);
        }).catch(() => {});
      }
    };

    setTimeout(() => {
      showDownloadBlobCard(zone, blob, outName, color, resetCb);
      pushNotification({
        type: 'success',
        message: 'PDF Encrypted Successfully',
        detail: outName,
      });
    }, 200);

  } catch (err) {
    clearBgJob();
    showError(zone, err.message || 'Encryption failed.');
    pushNotification({
      type: 'error',
      message: 'Encryption Failed',
      detail: err.message || 'An error occurred during encryption',
    });
  }
}

async function _submitDecrypt(opts) {
  const { file, password, output_filename, color } = opts;
  const tool = getActiveTool();
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const panel = document.getElementById('encrypt-settings-panel');
  if (panel) panel.remove();
  resetZoneContent(zone);
  showProgress(zone, 15, color, 'Unlocking PDF…');

  let outName = (output_filename || 'unlocked').trim();
  if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';

  setBgJob({ jobId: null, tool, filename: outName, progress: 15, state: 'running', sse: null });
  syncBgJobBar();

  const fd = new FormData();
  fd.append('file', file);
  fd.append('password', password);

  try {
    updateProgress(zone, 50, color);
    const bgMid = getBgJob();
    if (bgMid) { bgMid.progress = 50; syncBgJobBar(); }

    const res = await fetch(`${BACKEND}/api/pdf/decrypt`, {
      method: 'POST',
      body: fd,
    });

    if (res.status === 400) {
      const json = await res.json().catch(() => ({}));
      if (json.error === 'incorrect_password') {
        clearBgJob();
        resetZoneContent(zone);
        _showEncryptThumb(zone, _encryptFile, color, _thumbDataUri);
        _showSettingsPanel(_encryptPageCount, _encInfo, color);

        const restoredPanel = document.getElementById('encrypt-settings-panel');
        if (restoredPanel) {
          const errEl = restoredPanel.querySelector('#dec-field-error');
          if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent = 'Incorrect password. Try again.';
          }
        }
        return;
      }
      throw new Error(json.message || 'Decryption failed (400)');
    }

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || `Decryption failed (${res.status})`);
    }

    const blob = await res.blob();

    updateProgress(zone, 100, color);
    const bgDone = getBgJob();
    if (bgDone) {
      bgDone.progress = 100;
      bgDone.state    = 'done';
      bgDone.filename = outName;
      syncBgJobBar();
    }

    const resetCb = () => {
      removeEncryptPanel();
      clearBgJob();
      const t = getActiveTool();
      if (t) {
        import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
          if (_updateDropZoneForTool) _updateDropZoneForTool(t);
        }).catch(() => {});
      }
    };

    setTimeout(() => {
      showDownloadBlobCard(zone, blob, outName, color, resetCb);
      pushNotification({
        type: 'success',
        message: 'PDF Unlocked Successfully',
        detail: outName,
      });
    }, 200);

  } catch (err) {
    clearBgJob();
    showError(zone, err.message || 'Decryption failed.');
    pushNotification({
      type: 'error',
      message: 'Decryption Failed',
      detail: err.message || 'An error occurred during decryption',
    });
  }
}

async function _submitVaultLock(opts) {
  const { file, password, hint, output_filename, color } = opts;
  const tool = getActiveTool();
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const panel = document.getElementById('encrypt-settings-panel');
  if (panel) panel.remove();
  resetZoneContent(zone);
  showProgress(zone, 15, color, 'Locking in ToolCEO Vault…');

  let outName = (output_filename || 'vault').trim();
  if (!outName.toLowerCase().endsWith('.tceo')) outName += '.tceo';

  setBgJob({ jobId: null, tool, filename: outName, progress: 15, state: 'running', sse: null });
  syncBgJobBar();

  const fd = new FormData();
  fd.append('file', file);
  fd.append('password', password);
  if (hint) fd.append('hint', hint);

  try {
    updateProgress(zone, 50, color);
    const bgMid = getBgJob();
    if (bgMid) { bgMid.progress = 50; syncBgJobBar(); }

    const res = await fetch(`${BACKEND}/api/pdf/vault-lock`, {
      method: 'POST',
      body: fd,
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || `Vault Lock failed (${res.status})`);
    }

    const blob = await res.blob();

    updateProgress(zone, 100, color);
    const bgDone = getBgJob();
    if (bgDone) {
      bgDone.progress = 100;
      bgDone.state    = 'done';
      bgDone.filename = outName;
      syncBgJobBar();
    }

    const resetCb = () => {
      removeEncryptPanel();
      clearBgJob();
      const t = getActiveTool();
      if (t) {
        import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
          if (_updateDropZoneForTool) _updateDropZoneForTool(t);
        }).catch(() => {});
      }
    };

    setTimeout(() => {
      showDownloadBlobCard(zone, blob, outName, color, resetCb);
      pushNotification({
        type: 'success',
        message: 'PDF Locked in ToolCEO Vault (.tceo)',
        detail: outName,
      });
    }, 200);

  } catch (err) {
    clearBgJob();
    showError(zone, err.message || 'Vault Lock failed.');
    pushNotification({
      type: 'error',
      message: 'Vault Lock Failed',
      detail: err.message || 'An error occurred during vault locking',
    });
  }
}

async function _submitVaultUnlock(opts) {
  const { file, password, output_filename, color } = opts;
  const tool = getActiveTool();
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const panel = document.getElementById('encrypt-settings-panel');
  if (panel) panel.remove();
  resetZoneContent(zone);
  showProgress(zone, 15, color, 'Unlocking ToolCEO Vault…');

  let outName = (output_filename || 'unlocked').trim();
  if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';

  setBgJob({ jobId: null, tool, filename: outName, progress: 15, state: 'running', sse: null });
  syncBgJobBar();

  const fd = new FormData();
  fd.append('file', file);
  fd.append('password', password);

  try {
    updateProgress(zone, 50, color);
    const bgMid = getBgJob();
    if (bgMid) { bgMid.progress = 50; syncBgJobBar(); }

    const res = await fetch(`${BACKEND}/api/pdf/vault-unlock`, {
      method: 'POST',
      body: fd,
    });

    if (res.status === 400) {
      const json = await res.json().catch(() => ({}));
      if (json.error === 'wrong_password' || json.error === 'incorrect_password') {
        clearBgJob();
        resetZoneContent(zone);
        _showEncryptThumb(zone, _encryptFile, color, null);
        _showSettingsPanel(1, null, color);

        const restoredPanel = document.getElementById('encrypt-settings-panel');
        if (restoredPanel) {
          const errEl = restoredPanel.querySelector('#vlt-field-error');
          if (errEl) {
            errEl.style.display = 'block';
            errEl.textContent = 'Incorrect password or invalid vault file.';
          }
        }
        return;
      }
      throw new Error(json.message || 'Vault Unlock failed (400)');
    }

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || `Vault Unlock failed (${res.status})`);
    }

    const blob = await res.blob();

    updateProgress(zone, 100, color);
    const bgDone = getBgJob();
    if (bgDone) {
      bgDone.progress = 100;
      bgDone.state    = 'done';
      bgDone.filename = outName;
      syncBgJobBar();
    }

    const resetCb = () => {
      removeEncryptPanel();
      clearBgJob();
      const t = getActiveTool();
      if (t) {
        import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
          if (_updateDropZoneForTool) _updateDropZoneForTool(t);
        }).catch(() => {});
      }
    };

    setTimeout(() => {
      showDownloadBlobCard(zone, blob, outName, color, resetCb);
      pushNotification({
        type: 'success',
        message: 'PDF Recovered & Unlocked Successfully',
        detail: outName,
      });
    }, 200);

  } catch (err) {
    clearBgJob();
    showError(zone, err.message || 'Vault Unlock failed.');
    pushNotification({
      type: 'error',
      message: 'Vault Unlock Failed',
      detail: err.message || 'An error occurred during vault unlocking',
    });
  }
}
