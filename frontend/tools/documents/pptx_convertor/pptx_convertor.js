/**
 * tools/documents/pptx_convertor/pptx_convertor.js
 *
 * Shared base for all 6 PPTX conversion tools.
 * All UI logic lives here — individual tool files are thin wrappers that call
 * handlePptxFilePicked(file, toolId) and removePptxPanel().
 *
 * Flow (identical to docx_convertor.js pattern):
 *   1. File picked  → showScanProgress (indeterminate ring)
 *   2. File ready   → thumbnail in drop zone + settings panel below hero card
 *   3. Submit       → showProgress (SSE-driven ring) → showDownload
 *
 * Tool IDs and their backend routes:
 *   pptx-pdf    → POST /api/pptx/pdf/convert
 *   pptx-html   → POST /api/pptx/html/convert
 *   pptx-images → POST /api/pptx/images/convert
 *   pptx-odp    → POST /api/pptx/odp/convert
 *   pptx-txt    → POST /api/pptx/txt/convert
 *   pptx-repair → POST /api/pptx/repair/convert
 *
 * Exports:
 *   handlePptxFilePicked(file, toolId)  – call when a file is chosen
 *   removePptxPanel()                   – teardown on tool change / reset
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../scripts/toolstate.js';
import { pushNotification } from '../../../scripts/notificationStore.js';
import {
  showScanProgress,
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../../shared/progress.js';
import { getPptxThumbnail } from '../../shared/pptxThumb.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── TARGET-FORMAT METADATA ───────────────────────────────────────────────────

/** Map tool-id → target extension (without leading dot) */
const _TARGET_EXT = {
  'pptx-pdf':    'pdf',
  'pptx-html':   'html',
  'pptx-images': 'zip',
  'pptx-odp':    'odp',
  'pptx-txt':    'txt',
  'pptx-repair': 'pptx',
};

/** Map tool-id → backend sub-path segment */
const _ROUTE = {
  'pptx-pdf':    'pdf',
  'pptx-html':   'html',
  'pptx-images': 'images',
  'pptx-odp':    'odp',
  'pptx-txt':    'txt',
  'pptx-repair': 'repair',
};

// ─── MODULE STATE ──────────────────────────────────────────────────────────────

let _pptxFile     = null;
let _pptxBaseName = '';
let _pptxToolId   = '';   // e.g. "pptx-pdf"

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function _targetExt(toolId) {
  return _TARGET_EXT[toolId] || 'out';
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

export function removePptxPanel() {
  const panel = document.getElementById('pptx-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-pptx-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-pptx-thumb');
  }

  _pptxFile     = null;
  _pptxBaseName = '';
  _pptxToolId   = '';
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showThumb(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-pptx-thumb-wrap');
  if (old) old.remove();

  // Show real slide thumbnail if available, else SVG fallback (same size as DOCX: 90×116)
  const thumbContent = dataUri
    ? `<img class="dz-pptx-thumb-img" src="${dataUri}" alt="Slide 1 preview" draggable="false" />`
    : `<svg class="dz-pptx-thumb-icon" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
        <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
        <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
        <rect x="0" y="42" width="90" height="26" fill="${color}"/>
        <text x="45" y="60" font-family="Arial,sans-serif" font-size="12"
              font-weight="bold" fill="#ffffff"
              text-anchor="middle" dominant-baseline="middle">PPTX</text>
        <rect x="12" y="80" width="40" height="28" rx="2" fill="none" stroke="#dddddd" stroke-width="1.5"/>
        <line x1="12" y1="89" x2="52" y2="89" stroke="#eeeeee" stroke-width="1"/>
        <line x1="22" y1="80" x2="22" y2="108" stroke="#eeeeee" stroke-width="1"/>
      </svg>`;

  const wrap = document.createElement('div');
  wrap.className = 'dz-pptx-thumb-wrap';
  wrap.style.setProperty('--pc-color', color);
  wrap.innerHTML = `
    <div class="dz-pptx-thumb-card">
      <div class="dz-pptx-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${thumbContent}
      </div>
      <button class="dz-pptx-thumb-remove" title="Remove file"
              aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pptx-thumb-name">${_esc(file.name)}</span>
    <span class="dz-pptx-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-pptx-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-pptx-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removePptxPanel();
    resetZoneContent(zone);
    import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(fileSize, color) {
  const existing = document.getElementById('pptx-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const ext   = _targetExt(_pptxToolId);
  const label = getActiveTool() ? getActiveTool().label : `Convert to ${ext.toUpperCase()}`;

  const panel = document.createElement('div');
  panel.id        = 'pptx-settings-panel';
  panel.className = 'pw-panel';
  panel.style.setProperty('--pw-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ──────────────────────────────────────────────── -->
    <div class="pw-header">
      <span class="pw-header-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="${color}" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>
          <rect x="4" y="7" width="5" height="3.5" rx="1" stroke="${color}" stroke-width="1.1"/>
        </svg>
        <span class="pw-header-text">
          <strong>${_fmt(fileSize)}</strong>
        </span>
      </span>
      <button class="pw-change-btn" id="pc-change-btn" title="Pick a different file">
        Change file
      </button>
    </div>

    <!-- ── ACTIONS ROW ──────────────────────────────────────────────── -->
    <div class="pw-actions">
      <input class="pw-filename-input" id="pc-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"
             value="${_esc(_pptxBaseName)}"/>
      <span class="pw-filename-ext">.${ext}</span>
      <button class="pw-submit-btn" id="pc-submit-btn">${label}</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('pw-panel--visible'));

  // ── "Change file" button ────────────────────────────────────────────────────
  panel.querySelector('#pc-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removePptxPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // ── "Convert" button ────────────────────────────────────────────────────────
  panel.querySelector('#pc-submit-btn').addEventListener('click', () => {
    if (!_pptxFile) return;
    const nameEl  = panel.querySelector('#pc-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || _pptxBaseName;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitConvert(_pptxFile, outName);
  });
}

// ─── FILE PICKED (PUBLIC ENTRY POINT) ─────────────────────────────────────────

export async function handlePptxFilePicked(file, toolId) {
  if (!file || !file.name.toLowerCase().endsWith('.pptx')) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid PPTX file.',
    });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#FB923C') : '#FB923C';
  const zone  = document.getElementById('drop-zone');

  removePptxPanel();

  _pptxToolId   = toolId;
  _pptxFile     = file;
  _pptxBaseName = file.name.replace(/\.[^.]+$/, '');

  showScanProgress(zone, color);

  // Extract the embedded thumbnail from the PPTX ZIP client-side
  let thumbnail = null;
  try {
    thumbnail = await getPptxThumbnail(file);
  } catch (_) { /* leave null — fallback SVG will be used */ }

  resetZoneContent(zone);

  _showThumb(zone, file, color, thumbnail);
  _showSettingsPanel(file.size, color);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitConvert(file, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#FB923C';

  // Remove thumbnail + settings; show progress ring
  const panel = document.getElementById('pptx-settings-panel');
  if (panel) panel.remove();
  const thumb = zone ? zone.querySelector('.dz-pptx-thumb-wrap') : null;
  if (thumb) thumb.remove();
  if (zone)  zone.classList.remove('dz-has-pptx-thumb');

  const ext   = _targetExt(_pptxToolId);
  const route = _ROUTE[_pptxToolId];

  // For images: append _images suffix if not already present
  let earlyName;
  if (_pptxToolId === 'pptx-images') {
    const base = _pptxBaseName || outputFilename;
    earlyName = base.endsWith('_images') ? `${base}.zip` : `${base}_images.zip`;
  } else {
    earlyName = `${_pptxBaseName || outputFilename}.${ext}`;
  }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('output_filename', outputFilename);

  showProgress(zone, 10, color, 'Converting…');
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pptx/${route}/convert`, { method: 'POST', body: fd });
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
    showError(zone, `Upload failed: ${err.message}`);
    clearBgJob();
    return;
  }

  // ── SSE progress ────────────────────────────────────────────────────────────
  const sse   = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct = 0;

  setBgJob({ jobId, tool, filename: earlyName, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const rawPct = typeof progress === 'number' ? progress : lastPct;
    const pct    = Math.max(lastPct, rawPct);
    lastPct      = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state    = state === 'done' ? 'done' : (state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (state === 'running' || state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color, tool.id);
      return;
    }

    sse.close();

    if (state === 'done') {
      updateProgress(zone, 100, color, tool.id);
      removePptxPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removePptxPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
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

    if (state === 'error') {
      showError(zone, error || 'Conversion failed. Please try again.');
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?');
  };
}
