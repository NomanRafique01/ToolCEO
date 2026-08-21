/**
 * dropzone.js
 * Wires up the file drop zone: click-to-browse, drag-over highlight,
 * drag-leave reset, drop handling with tool-selection guard,
 * full hero-card + drop-zone morphing when a tool is selected,
 * the "no tool" warning banner, SSE progress tracking, and
 * download-on-complete / error display — all inside the existing zone.
 *
 * Split PDF special flow is now delegated to the dedicated splitter module:
 *   electron/ui/tools/documents/pdf_tools/splitter/splitter.js
 */

import { getActiveTool, setActiveTool, onToolChange, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from './toolstate.js';
import { pushNotification } from './notificationStore.js';
import {
  handleSplitFilePicked,
  removeSplitPanel,
} from '../tools/documents/pdf_tools/splitter/splitter.js';
import {
  handleMergeFilesPicked,
  removeMergePanel,
} from '../tools/documents/pdf_tools/merger/merger.js';
import {
  handleCompressFilePicked,
  removeCompressPanel,
} from '../tools/documents/pdf_tools/compressor/compressor.js';
import {
  handleEncryptFilePicked,
  removeEncryptPanel,
} from '../tools/documents/pdf_tools/encrypt/encrypt.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── ENDPOINT MAP ─────────────────────────────────────────────────────────────
const ENDPOINT_MAP = {
  // PDF Tools
  merge        : { url: `${BACKEND}/api/pdf/merge`,         multi: true  },
  split        : { url: `${BACKEND}/api/pdf/split`,         multi: false },
  compress     : { url: `${BACKEND}/api/pdf/compress`,      multi: false },
  rotate       : { url: `${BACKEND}/api/pdf/rotate`,        multi: false },
  encrypt      : { url: `${BACKEND}/api/pdf/encrypt`,       multi: false },
  watermark    : { url: `${BACKEND}/api/pdf/watermark`,     multi: false },
  ocr          : { url: `${BACKEND}/api/pdf/ocr`,           multi: false },
  metadata     : { url: `${BACKEND}/api/pdf/metadata`,      multi: false },
  // PDF Conversions
  'pdf-docx'   : { url: `${BACKEND}/api/convert/pdf-to-docx`,   multi: false },
  'pdf-html'   : { url: `${BACKEND}/api/convert/pdf-to-html`,   multi: false },
  'pdf-txt'    : { url: `${BACKEND}/api/convert/pdf-to-txt`,    multi: false },
  'pdf-images' : { url: `${BACKEND}/api/convert/pdf-to-images`, multi: false },
  'docx-pdf'   : { url: `${BACKEND}/api/convert/docx-to-pdf`,   multi: false },
  'images-pdf' : { url: `${BACKEND}/api/convert/images-to-pdf`, multi: true  },
};

// ─── WARNING NOTIFICATIONS ──────────────────────────────────────────────────

const PDF_TOOL_IDS = new Set([
  'merge', 'split', 'compress', 'rotate', 'encrypt', 'watermark', 'ocr', 'metadata',
  'pdf-docx', 'pdf-html', 'pdf-txt', 'pdf-images'
]);

export function showNoToolWarning() {
  pushNotification({
    type: 'warning',
    message: 'Please Select a Tool First'
  });
}

export function showInvalidPdfWarning() {
  pushNotification({
    type: 'warning',
    message: 'Invalid File Format. Please select a valid PDF file.'
  });
}

function _isPdfFile(file) {
  if (!file) return false;
  const fname = (file.name || '').toLowerCase();
  return fname.endsWith('.pdf') || fname.endsWith('.tceo') || fname.endsWith('.tceo.pdf') || file.type === 'application/pdf';
}

// ─── DEFAULT STATE ────────────────────────────────────────────────────────────

const DEFAULT_ICON_SVG = `
  <svg class="drop-icon" viewBox="0 0 48 48" width="48" height="48" fill="none"
       xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="4" width="26" height="34" rx="3" stroke="#00E5C0" stroke-width="1.5"/>
    <path d="M34 4l6 6H34V4Z" stroke="#00E5C0" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="24" y1="46" x2="24" y2="34" stroke="#00E5C0" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="18" y1="40" x2="24" y2="34" stroke="#00E5C0" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="30" y1="40" x2="24" y2="34" stroke="#00E5C0" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

const DEFAULT_MAIN  = 'Drop files anywhere to convert';
const DEFAULT_SUB   = 'or click to browse';
const DEFAULT_PRIV  = 'Your files never leave your device.';
const DEFAULT_TITLE = 'Welcome back, CEO';
const DEFAULT_HINT  = 'Drag anywhere';
const DEFAULT_SUBT  = 'The all-in-one offline file converter for Windows.';

// ─── HERO + DROP ZONE MORPH ───────────────────────────────────────────────────

function _scaledIcon(svgString, color) {
  return svgString
    .replace(/width="26"/, 'width="48"')
    .replace(/height="26"/, 'height="48"')
    .replace(/class="[^"]*"/, '')
    .replace('<svg', `<svg class="drop-icon" style="color:${color}"`)
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/fill="currentColor"/g,   `fill="${color}"`);
}

function _tagBadge(tag, color, bg) {
  if (!tag) return '';
  const badgeColor  = color || '#00E5C0';
  const badgeBg     = bg || `color-mix(in srgb, ${badgeColor} 12%, transparent)`;
  const badgeBorder = `color-mix(in srgb, ${badgeColor} 30%, transparent)`;
  return `<span class="hero-tool-badge"
    style="color:${badgeColor};background:${badgeBg};border-color:${badgeBorder}">
    ${tag}
  </span>`;
}

/** Also exported so the splitter module can re-apply tool state after "Change file". */
export function _updateDropZoneForTool(tool) { _updateDropZone(tool); }

function _updateDropZone(tool) {
  // Reset the download panel when the tool changes; it will only become
  // active again after a conversion completes (_dlPanelReady is called then).
  _dlPanelReset();
  const zone = document.getElementById('drop-zone');

  const heroHeader  = document.querySelector('.hero-card-header');
  const heroTitleEl = heroHeader && heroHeader.querySelector('.hero-title');
  const heroSubEl   = heroHeader && heroHeader.querySelector('.hero-subtitle');
  const heroHintEl  = heroHeader && heroHeader.querySelector('.hero-hint');

  if (!zone) return;

  // ── RESET ──────────────────────────────────────────────────────────────────
  if (!tool) {
    _resetZoneContent(zone);
    removeSplitPanel();
    removeMergePanel();
    removeCompressPanel();
    removeEncryptPanel();

    const mainEl   = zone.querySelector('.drop-main-text');
    const subEl    = zone.querySelector('.drop-browse');
    const privEl   = zone.querySelector('.drop-private');
    const iconSlot = zone.querySelector('.drop-icon');

    if (iconSlot) iconSlot.outerHTML = DEFAULT_ICON_SVG;
    if (mainEl) mainEl.textContent = DEFAULT_MAIN;
    if (subEl)  subEl.textContent  = DEFAULT_SUB;
    if (privEl) privEl.textContent = DEFAULT_PRIV;
    zone.removeAttribute('style');
    zone.classList.remove('drop-zone--tool-active');

    if (heroTitleEl) { heroTitleEl.textContent = DEFAULT_TITLE; heroTitleEl.style.color = ''; }
    if (heroSubEl)   { heroSubEl.innerHTML = DEFAULT_SUBT; }
    if (heroHintEl)  { heroHintEl.textContent = DEFAULT_HINT; heroHintEl.style.color = ''; }
    return;
  }

  // ── TOOL SELECTED ──────────────────────────────────────────────────────────
  const { label, mainText, subText, icon, color, bg, tag } = tool;

  _resetZoneContent(zone);   // clear any previous progress/download/error state
  removeSplitPanel();        // hide previous split info panel if tool changed
  removeMergePanel();        // hide previous merge queue panel if tool changed
  removeCompressPanel();     // hide previous compress settings panel if tool changed
  removeEncryptPanel();      // hide previous encrypt settings panel if tool changed

  zone.style.setProperty('--dz-color', color);
  zone.style.setProperty('--dz-bg', bg);
  zone.classList.add('drop-zone--tool-active');

  if (heroTitleEl) { heroTitleEl.textContent = `${label} Selected`; heroTitleEl.style.color = color; }
  if (heroSubEl) {
    heroSubEl.innerHTML = `
      <span class="hero-selected-row">
        <span class="hero-selected-dot" style="background:${color}"></span>
        Ready to process your file
        ${_tagBadge(tag, color, bg)}
      </span>`;
  }
  if (heroHintEl) { heroHintEl.textContent = 'Drop or click below'; heroHintEl.style.color = color; }

  // Fresh DOM query after _resetZoneContent
  const mainEl      = zone.querySelector('.drop-main-text');
  const subEl       = zone.querySelector('.drop-browse');
  const privEl      = zone.querySelector('.drop-private');
  const currentIcon = zone.querySelector('.drop-icon');

  if (currentIcon && icon) currentIcon.outerHTML = _scaledIcon(icon, color);
  if (mainEl) mainEl.textContent = mainText;
  if (subEl)  subEl.textContent  = subText;
  if (privEl) privEl.textContent = 'Your files never leave your device.';

  // Check if there is an active background job for this tool.
  // If so, restore the normal progress ring (or download card) inside the drop zone!
  const bgJob = getBgJob();
  if (bgJob && bgJob.tool && bgJob.tool.id === tool.id) {
    if (bgJob.state === 'running' || bgJob.state === 'pending' || bgJob.state === 'submitting') {
      _showProgress(zone, bgJob.progress || 10, color, 'Processing…');
      return;
    }
    if (bgJob.state === 'done') {
      _showDownload(zone, bgJob.filename, bgJob.jobId, color);
      return;
    }
    if (bgJob.state === 'error') {
      _showError(zone, 'Processing failed. Please try again.');
      return;
    }
  }
}

// ─── DOWNLOAD PANEL (right-column panel) ──────────────────────────────────────

/** Cached pending download so the panel Save button can trigger it. */
let _dlPanelJob = null;  // { jobId, filename, color }

/**
 * Switch the download panel to "active" state (tool selected, waiting for file).
 * Renders the tool name/icon inside the panel inner content.
 */
function _dlPanelActivate(tool) {
  const panel = document.getElementById('download-panel');
  if (!panel) return;

  if (!tool) {
    _dlPanelReset(panel);
    return;
  }

  panel.style.display = '';

  const { label, icon, color, bg } = tool;
  const safeColor = color || '#00E5C0';
  const safeBg    = bg    || 'rgba(0,229,192,0.08)';

  panel.style.setProperty('--dl-color', safeColor);
  panel.style.setProperty('--dl-bg',    safeBg);
  panel.style.setProperty('border-color', `color-mix(in srgb, ${safeColor} 28%, var(--border))`);

  const iconHtml = icon
    ? icon
        .replace(/width="26"/, 'width="18"').replace(/height="26"/, 'height="18"')
        .replace(/class="[^"]*"/, '')
        .replace('<svg', '<svg style="color:currentColor"')
        .replace(/stroke="currentColor"/g, 'stroke="currentColor"')
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
         <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.7"
               stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M5 20h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
       </svg>`;

  panel.innerHTML = `
    <div class="dl-panel-inner">
      <div class="dl-panel-header">
        <div class="dl-panel-tool-icon">${iconHtml}</div>
        <span class="dl-panel-tool-name">${label}</span>
        <span class="dl-panel-status-dot"></span>
        <button class="dl-panel-close" type="button" title="Close download panel" aria-label="Close download panel">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="dl-panel-waiting">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
          <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
        Drop or pick a file to begin
      </div>
      <div class="dl-file-block">
        <span class="dl-file-name"></span>
        <span class="dl-file-ext"></span>
      </div>
      <button class="dl-save-btn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline;vertical-align:middle;margin-right:6px" aria-hidden="true">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>Save As…
      </button>
      <div class="dl-saved-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
          <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Saved successfully
      </div>
    </div>`;

  panel.classList.remove('dl-panel--ready', 'dl-panel--saved');
  panel.classList.add('dl-panel--active');
  _dlPanelJob = null;

  // Wire Close button
  panel.querySelector('.dl-panel-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    _dlPanelReset(panel);
  });

  // Wire Save button
  panel.querySelector('.dl-save-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (_dlPanelJob) {
      _dlPanelSave(_dlPanelJob.jobId, _dlPanelJob.filename, _dlPanelJob.color, panel);
    }
  });
}

/**
 * Switch the download panel to "ready" state (conversion complete).
 * Builds the full panel HTML here since _dlPanelActivate is no longer
 * called eagerly on tool selection.
 */
function _dlPanelReady(filename, jobId, color) {
  const panel = document.getElementById('download-panel');
  if (!panel) return;

  const tool = getActiveTool();
  const safeColor = color || (tool && tool.color) || '#00E5C0';
  const safeBg    = (tool && tool.bg) || 'rgba(0,229,192,0.08)';
  const label     = (tool && tool.label) || 'Output';
  const icon      = tool && tool.icon;

  panel.style.display = '';
  panel.style.setProperty('--dl-color', safeColor);
  panel.style.setProperty('--dl-bg',    safeBg);
  panel.style.setProperty('border-color', `color-mix(in srgb, ${safeColor} 28%, var(--border))`);

  const iconHtml = icon
    ? icon
        .replace(/width="26"/, 'width="18"').replace(/height="26"/, 'height="18"')
        .replace(/class="[^"]*"/, '')
        .replace('<svg', '<svg style="color:currentColor"')
        .replace(/stroke="currentColor"/g, 'stroke="currentColor"')
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
         <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.7"
               stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M5 20h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
       </svg>`;

  const ext = filename.includes('.') ? filename.split('.').pop().toUpperCase() : '';
  const extText = ext ? `${ext} file — ready to save` : 'File ready to save';

  panel.innerHTML = `
    <div class="dl-panel-inner">
      <div class="dl-panel-header">
        <div class="dl-panel-tool-icon">${iconHtml}</div>
        <span class="dl-panel-tool-name">${label}</span>
        <span class="dl-panel-status-dot"></span>
        <button class="dl-panel-close" type="button" title="Close download panel" aria-label="Close download panel">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="dl-file-block">
        <span class="dl-file-name">${filename}</span>
        <span class="dl-file-ext">${extText}</span>
      </div>
      <button class="dl-save-btn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display:inline;vertical-align:middle;margin-right:6px" aria-hidden="true">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>Save As…
      </button>
      <div class="dl-saved-row">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
          <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Saved successfully
      </div>
    </div>`;

  _dlPanelJob = { jobId, filename, color: safeColor };
  panel.classList.remove('dl-panel--saved');
  panel.classList.add('dl-panel--active', 'dl-panel--ready');

  // Wire Close button
  panel.querySelector('.dl-panel-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    _dlPanelReset(panel);
  });

  // Wire Save button
  panel.querySelector('.dl-save-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (_dlPanelJob) {
      _dlPanelSave(_dlPanelJob.jobId, _dlPanelJob.filename, _dlPanelJob.color, panel);
    }
  });
}

/** Reset panel to idle state — hidden until a tool is active. */
function _dlPanelReset(panel) {
  const p = panel || document.getElementById('download-panel');
  if (!p) return;
  p.style.display = 'none';
  p.className = 'dl-panel';
  p.innerHTML = `
    <div class="dl-panel-idle">
      <svg class="dl-panel-idle-icon" width="28" height="28" viewBox="0 0 24 24" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 20h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      <span class="dl-panel-idle-text">Output will appear here</span>
    </div>`;
  _dlPanelJob = null;
}

/** Trigger the actual file save from the panel's Save button. */
async function _dlPanelSave(jobId, filename, color, panel) {
  const btn = panel && panel.querySelector('.dl-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch(`${BACKEND}/api/download/${jobId}`);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);

    const blob     = await res.blob();
    const arrayBuf = await blob.arrayBuffer();
    const uint8    = new Uint8Array(arrayBuf);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    if (window.toolceo && window.toolceo.saveFileAs) {
      const savedPath = await window.toolceo.saveFileAs(filename, base64);
      if (savedPath) {
        if (btn) { btn.disabled = false; btn.style.display = 'none'; }
        panel.classList.add('dl-panel--saved');
      } else {
        // User cancelled
        if (btn) { btn.disabled = false; btn.textContent = 'Save As…'; }
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      if (btn) { btn.disabled = false; btn.style.display = 'none'; }
      panel.classList.add('dl-panel--saved');
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save As…'; }
  }
}

// ─── ZONE OVERLAY HELPERS ─────────────────────────────────────────────────────

/** Remove any progress / download / error overlay from inside the zone. */
function _resetZoneContent(zone) {
  zone.querySelectorAll(
    '.dz-progress-wrap, .dz-download-wrap, .dz-error-wrap, .dz-pdf-thumb-wrap'
  ).forEach((el) => el.remove());
  zone.classList.remove(
    'dz-state-processing', 'dz-state-done', 'dz-state-error',
    'dz-state-scanning',   'dz-has-thumb'
  );
}

// ── Ring geometry constants ──────────────────────────────────────────────────
const _RING_R    = 40;   // circle radius
const _RING_CIRC = 2 * Math.PI * _RING_R;  // ≈ 251.3

/** Build the circular ring SVG + center text, returns {wrapEl, ringFill, pctEl} */
function _buildRingWrap(color, pct, label, indeterminate) {
  // dashoffset encodes progress: 0 = full, CIRC = empty
  const offset   = indeterminate ? 0 : _RING_CIRC * (1 - pct / 100);
  const dashArr  = indeterminate
    ? `${_RING_CIRC * 0.35} ${_RING_CIRC * 0.65}`
    : `${_RING_CIRC} ${_RING_CIRC}`;

  const wrap = document.createElement('div');
  wrap.className = 'dz-progress-wrap';
  // Set ring colour as CSS var so the SVG filter + glow use it
  wrap.style.setProperty('--dz-ring-color', color);

  wrap.innerHTML = `
    <svg class="dz-ring-svg" width="110" height="110" viewBox="0 0 110 110"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- glow inner circle -->
      <circle class="dz-ring-glow" cx="55" cy="55" r="28"/>
      <!-- track -->
      <circle class="dz-ring-track" cx="55" cy="55" r="${_RING_R}"/>
      <!-- progress fill -->
      <circle class="dz-ring-fill${indeterminate ? ' dz-ring-fill--indeterminate' : ''}"
              cx="55" cy="55" r="${_RING_R}"
              stroke="${color}"
              stroke-dasharray="${dashArr}"
              stroke-dashoffset="${offset}"
              style="transform-origin:55px 55px"/>
    </svg>
    <div class="dz-ring-center">
      <span class="dz-pct">${indeterminate ? '' : `${pct}%`}</span>
      <span class="dz-progress-label">${label || 'Processing'}</span>
    </div>`;

  return wrap;
}

/** Show the circular ring progress — centred inside the drop zone. */
function _showProgress(zone, pct, color, label) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-processing');
  zone.appendChild(_buildRingWrap(color, pct, label || 'Processing', false));
}

/** Show an indeterminate scanning ring — spinning arc. */
function _showScanProgress(zone, color) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-scanning');
  zone.appendChild(_buildRingWrap(color, 0, 'Scanning', true));
}

/** Update just the ring fill + percentage text without rebuilding the overlay. */
function _updateProgress(zone, pct, color) {
  const ring  = zone.querySelector('.dz-ring-fill');
  const label = zone.querySelector('.dz-pct');
  if (ring) {
    const offset = _RING_CIRC * (1 - pct / 100);
    ring.setAttribute('stroke-dashoffset', offset);
    ring.setAttribute('stroke', color);
  }
  if (label) label.textContent = `${pct}%`;
  // Also sync the SVG filter colour var
  const wrap = zone.querySelector('.dz-progress-wrap');
  if (wrap) wrap.style.setProperty('--dz-ring-color', color);
}

/**
 * After a successful save, wait briefly so the user sees "Saved successfully",
 * then reset the drop zone back to its tool-selected idle state ready for a new file.
 */
function _resetAfterSave(zone) {
  setTimeout(() => {
    _resetZoneContent(zone);
    clearBgJob();
    removeSplitPanel();
    removeMergePanel();
    removeCompressPanel();
    removeEncryptPanel();
    const tool = getActiveTool();
    if (tool) _updateDropZone(tool);
  }, 1800);
}

/** Show download-ready state — card is centred inside the drop zone. */
function _showDownload(zone, filename, jobId, color) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-done');

  const ext     = filename.includes('.') ? filename.split('.').pop().toUpperCase() : '';
  const extText = ext ? `${ext} file — ready to save` : 'File ready to save';

  const wrap = document.createElement('div');
  wrap.className = 'dz-download-wrap';
  wrap.innerHTML = `
    <div class="dz-save-card" style="--save-color:${color}">
      <div class="dz-save-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="dz-save-info">
        <span class="dz-save-name" title="${_escHtml(filename)}">${_escHtml(filename)}</span>
        <span class="dz-save-ext">${_escHtml(extText)}</span>
      </div>
      <button class="dz-save-btn" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>Save As…
      </button>
      <div class="dz-save-done">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
          <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.9"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Saved successfully
      </div>
    </div>`;

  zone.appendChild(wrap);

  const btn = wrap.querySelector('.dz-save-btn');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const res = await fetch(`${BACKEND}/api/download/${jobId}`);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);

      const blob      = await res.blob();
      const arrayBuf  = await blob.arrayBuffer();
      const uint8     = new Uint8Array(arrayBuf);
      const chunkSize = 8192;
      let binary = '';
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      if (window.toolceo && window.toolceo.saveFileAs) {
        const savedPath = await window.toolceo.saveFileAs(filename, base64);
        if (savedPath) {
          btn.style.display = 'none';
          wrap.querySelector('.dz-save-done').classList.add('dz-save-done--visible');
          clearBgJob();
          _resetAfterSave(zone);
        } else {
          btn.disabled = false;
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
            <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
                  stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>Save As…`;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        btn.style.display = 'none';
        wrap.querySelector('.dz-save-done').classList.add('dz-save-done--visible');
        clearBgJob();
        _resetAfterSave(zone);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Save As…';
      _showError(zone, `Download failed: ${err.message}`);
    }
  });
}

/** Show error state. */
function _showError(zone, message) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-error');

  pushNotification({
    type: 'error',
    message: message
  });

  const wrap = document.createElement('div');
  wrap.className = 'dz-error-wrap';
  wrap.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" stroke="#F87171" stroke-width="1.5"/>
      <line x1="10" y1="6" x2="10" y2="11" stroke="#F87171" stroke-width="1.7" stroke-linecap="round"/>
      <circle cx="10" cy="13.5" r="0.9" fill="#F87171"/>
    </svg>
    <span class="dz-error-msg">${_escHtml(message)}</span>`;
  zone.appendChild(wrap);
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── DOWNLOAD HANDLER ─────────────────────────────────────────────────────────

async function _downloadFile(jobId, filename, color, wrap) {
  const btn = wrap.querySelector('.dz-dl-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch(`${BACKEND}/api/download/${jobId}`);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);

    const blob     = await res.blob();
    const arrayBuf = await blob.arrayBuffer();
    const uint8    = new Uint8Array(arrayBuf);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    // Use Electron "Save As" dialog if available; fall back to browser anchor download
    if (window.toolceo && window.toolceo.saveFileAs) {
      const savedPath = await window.toolceo.saveFileAs(filename, base64);
      if (savedPath) {
        if (btn) { btn.disabled = false; btn.textContent = '✓ Saved'; btn.style.opacity = '0.6'; }
        const zone = document.getElementById('drop-zone');
        if (zone) _resetAfterSave(zone);
      } else {
        // User cancelled the dialog — re-enable button
        if (btn) { btn.disabled = false; btn.textContent = 'Save As…'; }
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      if (btn) { btn.disabled = false; btn.textContent = '✓ Downloaded'; btn.style.opacity = '0.6'; }
      const zone = document.getElementById('drop-zone');
      if (zone) _resetAfterSave(zone);
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save As…'; }
    const zone = document.getElementById('drop-zone');
    if (zone) _showError(zone, `Download failed: ${err.message}`);
  }
}

// ─── SPLIT TOOL ───────────────────────────────────────────────────────────────
// All split-specific logic (panel, thumbnail, scan, submit) now lives in:
//   electron/ui/tools/documents/pdf_tools/splitter/splitter.js
// The imports at the top of this file delegate split handling there.

// ─── GENERIC SUBMIT FILE ──────────────────────────────────────────────────────

async function _submitFile(files) {
  const tool = getActiveTool();
  if (!tool) { showNoToolWarning(); return; }

  const fileArray = Array.from(files);
  if (fileArray.length === 0) return;

  // Validate format for PDF tools
  if (PDF_TOOL_IDS.has(tool.id)) {
    const hasInvalid = fileArray.some((f) => !_isPdfFile(f));
    if (hasInvalid) {
      showInvalidPdfWarning();
      return;
    }
  }

  // Split tool has its own two-step flow — delegated to the splitter module
  if (tool.id === 'split') {
    handleSplitFilePicked(files[0]);
    return;
  }

  // Merge tool has its own multi-file queue flow — delegated to the merger module
  if (tool.id === 'merge') {
    handleMergeFilesPicked(files);
    return;
  }

  // Compress tool has its own settings-panel flow — delegated to the compressor module
  if (tool.id === 'compress') {
    handleCompressFilePicked(files[0]);
    return;
  }

  // Encrypt / Decrypt tool has its own settings-panel flow — delegated to the encrypt module
  if (tool.id === 'encrypt') {
    handleEncryptFilePicked(files[0]);
    return;
  }

  const endpoint = ENDPOINT_MAP[tool.id];
  if (!endpoint) {
    const zone = document.getElementById('drop-zone');
    if (zone) _showError(zone, `No backend endpoint configured for tool "${tool.label}".`);
    return;
  }

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#00E5C0';

  // ── Build form data ────────────────────────────────────────────────────────
  const fd = new FormData();
  if (endpoint.multi) {
    Array.from(files).forEach((f) => fd.append('files', f));
  } else {
    fd.append('file', files[0]);
  }

  // ── Show initial progress ──────────────────────────────────────────────────
  _showProgress(zone, 0, color);

  // Register job immediately so bar appears if user switches tools during upload
  const earlyFilename = files[0] ? files[0].name : 'processed_file';
  setBgJob({ jobId: null, tool, filename: earlyFilename, progress: 5, state: 'submitting', sse: null });

  // ── POST to backend ────────────────────────────────────────────────────────
  let jobId;
  try {
    const res  = await fetch(endpoint.url, { method: 'POST', body: fd });
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
    _showError(zone, `Upload failed: ${err.message}`);
    clearBgJob();
    return;
  }

  // ── Subscribe to SSE progress ──────────────────────────────────────────────
  const sse = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let  lastPct = 0;

  // Upgrade from 'submitting' to 'running' now that we have a real jobId + SSE
  setBgJob({ jobId, tool, filename: earlyFilename, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = typeof progress === 'number' ? progress : lastPct;
    lastPct   = pct;

    const bg = getBgJob();
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state    = state === 'done' ? 'done' : (state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (state === 'running' || state === 'pending') {
      const displayPct = Math.max(10, Math.min(90, pct));
      _updateProgress(zone, displayPct, color);
      return;
    }

    sse.close();

    if (state === 'done') {
      _updateProgress(zone, 100, color);
      const dlName = data.filename || `output_${jobId.slice(0, 8)}`;
      setTimeout(() => _showDownload(zone, dlName, jobId, color), 200);
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (state === 'error') {
      _showError(zone, error || 'Processing failed. Please try again.');
    }
  };

  sse.onerror = () => {
    sse.close();
    _showError(zone, 'Lost connection to backend. Is the server running?');
  };
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function initDropZone() {
  const dropZone  = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  if (!dropZone || !fileInput) return;

  onToolChange(_updateDropZone);

  // Handle "View Tool" button in the bg-job-bar — switch back to the tool that
  // was executing in the background without causing a syncBgJobBar re-render loop.
  document.addEventListener('bg-job-switch', (e) => {
    const tool = e.detail && e.detail.tool;
    if (tool) setActiveTool(tool);
  });

  // When background job is cleared or saved, reset drop zone overlays
  document.addEventListener('bg-job-cleared', () => {
    const zone = document.getElementById('drop-zone');
    if (zone) {
      _resetZoneContent(zone);
      removeSplitPanel();
      removeMergePanel();
      removeCompressPanel();
      removeEncryptPanel();
      const tool = getActiveTool();
      if (tool) _updateDropZone(tool);
    }
  });

  // ── Click ──────────────────────────────────────────────────────────────────
  dropZone.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    // Don't open file picker when clicking interactive elements from any tool panel
    if (e.target.closest(
      '.dz-download-wrap, .dz-error-wrap, .dz-pdf-thumb-remove, ' +
      '.dz-merge-card-remove, .dz-merge-add-btn, .merge-queue-panel, .split-info-panel, ' +
      '.compress-settings-panel, .dz-compress-thumb-remove, .cmp-panel, ' +
      '.encrypt-settings-panel, .dz-encrypt-thumb-remove, .enc-panel'
    )) return;
    if (!getActiveTool()) { showNoToolWarning(); return; }
    // If already processing, scanning, done, or a file thumbnail is currently loaded, do not open file window
    if (dropZone.classList.contains('dz-state-processing')) return;
    if (dropZone.classList.contains('dz-state-scanning'))   return;
    if (dropZone.classList.contains('dz-state-done'))       return;
    if (
      dropZone.classList.contains('dz-has-thumb') ||
      dropZone.classList.contains('dz-has-compress-thumb') ||
      dropZone.classList.contains('dz-has-encrypt-thumb') ||
      dropZone.classList.contains('dz-has-merge-thumbs') ||
      dropZone.querySelector('.dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip')
    ) {
      return;
    }
    // For merge tool with existing queue, a zone click adds more files
    const tool = getActiveTool();
    if (tool && tool.id === 'merge') {
      fileInput.multiple = true;
      fileInput.accept   = '.pdf,application/pdf';
    } else if (tool && tool.id === 'encrypt') {
      fileInput.multiple = false;
      fileInput.accept   = '.pdf,.tceo,application/pdf,application/octet-stream';
    } else {
      fileInput.multiple = false;
      fileInput.accept   = '*/*';
    }
    fileInput.click();
  });

  // ── File input change ──────────────────────────────────────────────────────
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      _submitFile(fileInput.files);
      fileInput.value = '';
    }
  });

  // ── Drag over ─────────────────────────────────────────────────────────────
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });

  // ── Drag leave ────────────────────────────────────────────────────────────
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
  });

  // ── Drop ──────────────────────────────────────────────────────────────────
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    if (!getActiveTool()) { showNoToolWarning(); return; }
    if (dropZone.classList.contains('dz-state-processing')) return;
    if (dropZone.classList.contains('dz-state-scanning'))   return;
    if (
      dropZone.classList.contains('dz-has-thumb') ||
      dropZone.classList.contains('dz-has-compress-thumb') ||
      dropZone.classList.contains('dz-has-encrypt-thumb') ||
      dropZone.classList.contains('dz-has-merge-thumbs') ||
      dropZone.querySelector('.dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip')
    ) {
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      _submitFile(e.dataTransfer.files);
    }
  });
}
