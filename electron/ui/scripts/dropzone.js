/**
 * dropzone.js
 * Wires up the file drop zone: click-to-browse, drag-over highlight,
 * drag-leave reset, drop handling with tool-selection guard,
 * full hero-card + drop-zone morphing when a tool is selected,
 * the "no tool" warning banner, SSE progress tracking, and
 * download-on-complete / error display — all inside the existing zone.
 */

import { getActiveTool, onToolChange } from './toolstate.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── ENDPOINT MAP ─────────────────────────────────────────────────────────────
// Maps tool id → { url, buildForm(files) }
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

// ─── WARNING BANNER ───────────────────────────────────────────────────────────

let _bannerEl    = null;
let _bannerTimer = null;

function _ensureBanner() {
  if (_bannerEl) return;

  _bannerEl = document.createElement('div');
  _bannerEl.className = 'tool-warning-banner';
  _bannerEl.innerHTML = `
    <div class="tool-warning-inner">
      <svg class="tool-warning-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M10 2.5L1.5 17.5h17L10 2.5Z"
              stroke="#FBBF24" stroke-width="1.6"
              stroke-linejoin="round" stroke-linecap="round"/>
        <line x1="10" y1="8.5" x2="10" y2="12"
              stroke="#FBBF24" stroke-width="1.7" stroke-linecap="round"/>
        <circle cx="10" cy="14.5" r="0.9" fill="#FBBF24"/>
      </svg>
      <span class="tool-warning-text">Please Select a Tool First</span>
    </div>
  `;

  const root = document.getElementById('main-content') || document.body;
  root.appendChild(_bannerEl);
}

export function showNoToolWarning() {
  _ensureBanner();

  if (_bannerTimer) {
    clearTimeout(_bannerTimer);
    clearTimeout(_bannerEl._fadeTimer);
    _bannerEl.classList.remove('tool-warning-banner--fade');
    void _bannerEl.offsetWidth;
  }

  _bannerEl.classList.add('tool-warning-banner--visible');

  _bannerTimer = setTimeout(() => {
    _bannerEl.classList.add('tool-warning-banner--fade');
    _bannerEl._fadeTimer = setTimeout(() => {
      _bannerEl.classList.remove('tool-warning-banner--visible', 'tool-warning-banner--fade');
      _bannerTimer = null;
    }, 500);
  }, 3000);
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
  const isConvert  = tag.toLowerCase() === 'convert';
  const badgeColor  = isConvert ? '#38BDF8' : color;
  const badgeBg     = isConvert ? 'rgba(56,189,248,0.12)' : bg;
  const badgeBorder = isConvert ? 'rgba(56,189,248,0.3)' : `${color}4D`;
  return `<span class="hero-tool-badge"
    style="color:${badgeColor};background:${badgeBg};border-color:${badgeBorder}">
    ${tag}
  </span>`;
}

function _updateDropZone(tool) {
  const zone     = document.getElementById('drop-zone');
  const mainEl   = zone && zone.querySelector('.drop-main-text');
  const subEl    = zone && zone.querySelector('.drop-browse');
  const privEl   = zone && zone.querySelector('.drop-private');
  const iconSlot = zone && zone.querySelector('.drop-icon');

  const heroHeader  = document.querySelector('.hero-card-header');
  const heroTitleEl = heroHeader && heroHeader.querySelector('.hero-title');
  const heroSubEl   = heroHeader && heroHeader.querySelector('.hero-subtitle');
  const heroHintEl  = heroHeader && heroHeader.querySelector('.hero-hint');

  if (!zone || !mainEl || !subEl || !privEl) return;

  // ── RESET ──────────────────────────────────────────────────────────────────
  if (!tool) {
    _resetZoneContent(zone);
    if (iconSlot) iconSlot.outerHTML = DEFAULT_ICON_SVG;
    mainEl.textContent = DEFAULT_MAIN;
    subEl.textContent  = DEFAULT_SUB;
    privEl.textContent = DEFAULT_PRIV;
    zone.removeAttribute('style');
    zone.classList.remove('drop-zone--tool-active');

    if (heroTitleEl) { heroTitleEl.textContent = DEFAULT_TITLE; heroTitleEl.style.color = ''; }
    if (heroSubEl)   { heroSubEl.innerHTML = DEFAULT_SUBT; }
    if (heroHintEl)  { heroHintEl.textContent = DEFAULT_HINT; heroHintEl.style.color = ''; }
    return;
  }

  // ── TOOL SELECTED ──────────────────────────────────────────────────────────
  const { label, mainText, subText, icon, color, bg, tag } = tool;

  _resetZoneContent(zone);  // clear any previous progress/download/error state

  const currentIcon = zone.querySelector('.drop-icon');
  if (currentIcon && icon) currentIcon.outerHTML = _scaledIcon(icon, color);

  mainEl.textContent = mainText;
  subEl.textContent  = subText;
  privEl.textContent = 'Your files never leave your device.';

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
}

// ─── ZONE OVERLAY HELPERS ─────────────────────────────────────────────────────

/** Remove any progress / download / error overlay from inside the zone. */
function _resetZoneContent(zone) {
  zone.querySelectorAll(
    '.dz-progress-wrap, .dz-download-wrap, .dz-error-wrap'
  ).forEach((el) => el.remove());
  zone.classList.remove('dz-state-processing', 'dz-state-done', 'dz-state-error');
}

/** Show the progress bar overlay (replaces browse text area). */
function _showProgress(zone, pct, color) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-processing');

  const wrap = document.createElement('div');
  wrap.className = 'dz-progress-wrap';
  wrap.innerHTML = `
    <span class="dz-progress-label">Processing…  <span class="dz-pct">${pct}%</span></span>
    <div class="dz-progress-track">
      <div class="dz-progress-bar" style="width:${pct}%;background:${color}"></div>
    </div>`;
  zone.appendChild(wrap);
}

/** Update just the bar/label without re-inserting the whole overlay. */
function _updateProgress(zone, pct, color) {
  const bar   = zone.querySelector('.dz-progress-bar');
  const label = zone.querySelector('.dz-pct');
  if (bar)   { bar.style.width = `${pct}%`; bar.style.background = color; }
  if (label) label.textContent = `${pct}%`;
}

/** Show download-ready state. */
function _showDownload(zone, filename, jobId, color) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-done');

  const wrap = document.createElement('div');
  wrap.className = 'dz-download-wrap';
  wrap.innerHTML = `
    <div class="dz-dl-icon" style="color:${color}">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 20h14" stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round"/>
      </svg>
    </div>
    <span class="dz-dl-name" title="${filename}">${filename}</span>
    <button class="dz-dl-btn" style="--dz-color:${color}">Save As…</button>`;

  zone.appendChild(wrap);

  wrap.querySelector('.dz-dl-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    _downloadFile(jobId, filename, color, wrap);
  });
}

/** Show error state. */
function _showError(zone, message) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-error');

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
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Save As…'; }
    const zone = document.getElementById('drop-zone');
    if (zone) _showError(zone, `Download failed: ${err.message}`);
  }
}

// ─── SPLIT PAGE-RANGE INPUTS ──────────────────────────────────────────────────

/** Inject (or remove) the page-range row inside the drop-zone for split tool. */
function _syncSplitInputs(tool) {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;
  // Remove any existing range row
  const existing = zone.querySelector('.dz-split-range');
  if (existing) existing.remove();

  if (!tool || tool.id !== 'split') return;

  const color = tool.color || '#E8924A';
  const row = document.createElement('div');
  row.className = 'dz-split-range';
  row.innerHTML = `
    <label class="dz-range-label" style="color:${color}">Page range (optional)</label>
    <div class="dz-range-inputs">
      <input class="dz-range-input" id="dz-split-start" type="number" min="1" placeholder="From" />
      <span class="dz-range-sep" style="color:${color}">–</span>
      <input class="dz-range-input" id="dz-split-end"   type="number" min="1" placeholder="To" />
    </div>`;
  // Stop clicks on the inputs from opening the file picker
  row.addEventListener('click', (e) => e.stopPropagation());
  zone.appendChild(row);
}

// ─── SUBMIT FILE ──────────────────────────────────────────────────────────────

async function _submitFile(files) {
  const tool = getActiveTool();
  if (!tool) { showNoToolWarning(); return; }

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

  // ── Extra fields for split ─────────────────────────────────────────────────
  // Only append page numbers when the user actually typed a value.
  // Omitting both lets the backend know to split every page → ZIP.
  if (tool.id === 'split') {
    const startEl  = document.getElementById('dz-split-start');
    const endEl    = document.getElementById('dz-split-end');
    const hasStart = startEl && startEl.value.trim() !== '';
    const hasEnd   = endEl   && endEl.value.trim()   !== '';
    if (hasStart) fd.append('start_page', parseInt(startEl.value, 10));
    if (hasEnd)   fd.append('end_page',   parseInt(endEl.value,   10));
  }

  // ── Show initial progress ──────────────────────────────────────────────────
  _showProgress(zone, 0, color);

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
    return;
  }

  // ── Subscribe to SSE progress ──────────────────────────────────────────────
  const sse = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let  lastPct = 0;

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = typeof progress === 'number' ? progress : lastPct;
    lastPct   = pct;

    if (state === 'running' || state === 'pending') {
      // Animate smoothly between 10 and 90 while the server works
      const displayPct = Math.max(10, Math.min(90, pct));
      _updateProgress(zone, displayPct, color);
      return;
    }

    sse.close();

    if (state === 'done') {
      _updateProgress(zone, 100, color);
      // filename is sent in the SSE done payload — no HEAD request needed
      const dlName = data.filename || `output_${jobId.slice(0, 8)}`;
      setTimeout(() => _showDownload(zone, dlName, jobId, color), 200);
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
  onToolChange(_syncSplitInputs);

  // ── Click ──────────────────────────────────────────────────────────────────
  dropZone.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    // Don't open file picker when clicking the download button or error
    if (e.target.closest('.dz-download-wrap, .dz-error-wrap')) return;
    if (!getActiveTool()) { showNoToolWarning(); return; }
    // If already processing, ignore
    if (dropZone.classList.contains('dz-state-processing')) return;
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
    if (e.dataTransfer.files.length > 0) {
      _submitFile(e.dataTransfer.files);
    }
  });
}
