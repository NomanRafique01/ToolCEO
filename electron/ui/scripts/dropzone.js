/**
 * dropzone.js
 * Wires up the file drop zone: click-to-browse, drag-over highlight,
 * drag-leave reset, drop handling with tool-selection guard,
 * full hero-card + drop-zone morphing when a tool is selected,
 * the "no tool" warning banner, SSE progress tracking, and
 * download-on-complete / error display — all inside the existing zone.
 *
 * Split PDF special flow:
 *   1. User drops / picks a PDF while Split tool is active.
 *   2. Drop zone shows a "Scanning PDF…" progress bar.
 *   3. Backend /api/pdf/page-count responds with the total page count.
 *   4. A panel slides in BELOW the drop zone (inside the hero card) showing
 *      total pages + From/To range inputs + a Split button.
 *   5. Clicking Split submits to /api/pdf/split with the chosen range.
 */

import { getActiveTool, onToolChange } from './toolstate.js';

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
    _removeSplitPanel();
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
  _removeSplitPanel();      // hide previous split info panel if tool changed

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
  zone.classList.remove('dz-state-processing', 'dz-state-done', 'dz-state-error', 'dz-state-scanning');
}

/** Show the progress bar overlay (replaces browse text area). */
function _showProgress(zone, pct, color, label) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-processing');

  const displayLabel = label || 'Processing…';
  const wrap = document.createElement('div');
  wrap.className = 'dz-progress-wrap';
  wrap.innerHTML = `
    <span class="dz-progress-label">${displayLabel}  <span class="dz-pct">${pct}%</span></span>
    <div class="dz-progress-track">
      <div class="dz-progress-bar" style="width:${pct}%;background:${color}"></div>
    </div>`;
  zone.appendChild(wrap);
}

/** Show a scan progress bar (different label, same visual). */
function _showScanProgress(zone, color) {
  _resetZoneContent(zone);
  zone.classList.add('dz-state-scanning');

  const wrap = document.createElement('div');
  wrap.className = 'dz-progress-wrap';
  wrap.innerHTML = `
    <span class="dz-progress-label">Scanning PDF… <span class="dz-pct"></span></span>
    <div class="dz-progress-track">
      <div class="dz-progress-bar dz-progress-bar--indeterminate" style="background:${color}"></div>
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

// ─── SPLIT INFO PANEL ─────────────────────────────────────────────────────────

/** The file object held between scan and submit for split tool. */
let _splitFile      = null;
let _splitPageCount = 0;

/** Remove the post-upload split info panel if it exists. */
function _removeSplitPanel() {
  const existing = document.getElementById('split-info-panel');
  if (existing) existing.remove();
  _splitFile      = null;
  _splitPageCount = 0;
}

/**
 * Show the split info panel below the drop zone inside the hero card.
 * @param {number} totalPages
 * @param {string} color
 */
function _showSplitPanel(totalPages, color) {
  _removeSplitPanel();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id = 'split-info-panel';
  panel.className = 'split-info-panel';
  panel.style.setProperty('--split-color', color);

  panel.innerHTML = `
    <div class="sip-header">
      <span class="sip-pages-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="1" width="10" height="14" rx="2" stroke="${color}" stroke-width="1.3"/>
          <line x1="5" y1="5"  x2="11" y2="5"  stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="5" y1="8"  x2="11" y2="8"  stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="5" y1="11" x2="9"  y2="11" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="sip-total-label">Total pages: <strong>${totalPages}</strong></span>
      </span>
      <button class="sip-change-btn" id="sip-change-btn" title="Pick a different file">Change file</button>
    </div>
    <div class="sip-range-row">
      <span class="sip-range-label">Page range <span class="sip-optional">(optional)</span></span>
      <div class="sip-inputs">
        <input class="sip-input" id="sip-from" type="number" min="1" max="${totalPages}" placeholder="From" />
        <span class="sip-sep">–</span>
        <input class="sip-input" id="sip-to"   type="number" min="1" max="${totalPages}" placeholder="To" />
      </div>
      <button class="sip-split-btn" id="sip-split-btn">Split PDF</button>
    </div>`;

  heroCard.appendChild(panel);

  // Animate in
  requestAnimationFrame(() => panel.classList.add('split-info-panel--visible'));

  // "Change file" resets to drop zone state
  panel.querySelector('#sip-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    _removeSplitPanel();
    _resetZoneContent(document.getElementById('drop-zone'));
    // Re-trigger the tool state so the drop zone shows the tool-selected state
    if (tool) _updateDropZone(tool);
  });

  // "Split PDF" button submits
  panel.querySelector('#sip-split-btn').addEventListener('click', () => {
    if (!_splitFile) return;
    const fromEl = panel.querySelector('#sip-from');
    const toEl   = panel.querySelector('#sip-to');
    const fromVal = fromEl.value.trim();
    const toVal   = toEl.value.trim();

    // Validate range if provided
    if (fromVal || toVal) {
      const s = parseInt(fromVal || '1', 10);
      const e = parseInt(toVal   || String(_splitPageCount), 10);
      if (s < 1 || e > _splitPageCount || s > e) {
        _flashRangeError(panel, `Enter a valid range between 1 and ${_splitPageCount}.`);
        return;
      }
    }

    _submitSplitFile(_splitFile, fromVal, toVal);
  });
}

function _flashRangeError(panel, msg) {
  let errEl = panel.querySelector('.sip-range-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'sip-range-error';
    panel.querySelector('.sip-range-row').appendChild(errEl);
  }
  errEl.textContent = msg;
  clearTimeout(errEl._t);
  errEl._t = setTimeout(() => errEl.remove(), 3000);
}

// ─── SPLIT SCAN FLOW ──────────────────────────────────────────────────────────

/**
 * Called when a file is picked while Split tool is active.
 * Scans the PDF for page count then reveals the info panel.
 */
async function _handleSplitFilePicked(file) {
  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#E8924A') : '#E8924A';
  const zone  = document.getElementById('drop-zone');

  _removeSplitPanel();
  _showScanProgress(zone, color);

  // POST to page-count endpoint
  const fd = new FormData();
  fd.append('file', file);

  let pageCount;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/page-count`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.detail || `Server error ${res.status}`);
    }
    pageCount = json.page_count;
  } catch (err) {
    _showError(zone, `Could not read PDF: ${err.message}`);
    return;
  }

  // Reset zone to tool-selected idle state (remove scan bar)
  _resetZoneContent(zone);

  // Store file for later submission
  _splitFile      = file;
  _splitPageCount = pageCount;

  _showSplitPanel(pageCount, color);
}

// ─── SPLIT SUBMIT ─────────────────────────────────────────────────────────────

async function _submitSplitFile(file, fromVal, toVal) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#E8924A';

  // Hide the panel while processing
  const panel = document.getElementById('split-info-panel');
  if (panel) panel.classList.add('split-info-panel--submitting');

  const fd = new FormData();
  fd.append('file', file);
  if (fromVal) fd.append('start_page', parseInt(fromVal, 10));
  if (toVal)   fd.append('end_page',   parseInt(toVal,   10));

  // Show progress inside drop zone
  _showProgress(zone, 0, color, 'Processing…');

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/split`, { method: 'POST', body: fd });
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
    if (panel) panel.classList.remove('split-info-panel--submitting');
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
      const displayPct = Math.max(10, Math.min(90, pct));
      _updateProgress(zone, displayPct, color);
      return;
    }

    sse.close();

    if (state === 'done') {
      _updateProgress(zone, 100, color);
      // Remove the split panel on success
      _removeSplitPanel();
      const dlName = data.filename || `output_${jobId.slice(0, 8)}`;
      setTimeout(() => _showDownload(zone, dlName, jobId, color), 200);
      return;
    }

    if (state === 'error') {
      _showError(zone, error || 'Processing failed. Please try again.');
      if (panel) panel.classList.remove('split-info-panel--submitting');
    }
  };

  sse.onerror = () => {
    sse.close();
    _showError(zone, 'Lost connection to backend. Is the server running?');
    if (panel) panel.classList.remove('split-info-panel--submitting');
  };
}

// ─── GENERIC SUBMIT FILE ──────────────────────────────────────────────────────

async function _submitFile(files) {
  const tool = getActiveTool();
  if (!tool) { showNoToolWarning(); return; }

  // Split tool has its own two-step flow
  if (tool.id === 'split') {
    _handleSplitFilePicked(files[0]);
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
      const displayPct = Math.max(10, Math.min(90, pct));
      _updateProgress(zone, displayPct, color);
      return;
    }

    sse.close();

    if (state === 'done') {
      _updateProgress(zone, 100, color);
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

  // ── Click ──────────────────────────────────────────────────────────────────
  dropZone.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    // Don't open file picker when clicking the download button or error
    if (e.target.closest('.dz-download-wrap, .dz-error-wrap')) return;
    if (!getActiveTool()) { showNoToolWarning(); return; }
    // If already processing or scanning, ignore
    if (dropZone.classList.contains('dz-state-processing')) return;
    if (dropZone.classList.contains('dz-state-scanning'))   return;
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
    if (e.dataTransfer.files.length > 0) {
      _submitFile(e.dataTransfer.files);
    }
  });
}
