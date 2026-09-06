/**
 * tools/documents/csv_convertor/csv_convertor.js
 *
 * Shared base for all 8 CSV conversion tools.
 * All UI logic lives here — individual tool files are thin wrappers that call
 * handleCsvFilePicked(file, toolId) and removeCsvPanel().
 *
 * Flow (identical to odt_convertor.js / txt_convertor.js pattern):
 *   1. File picked  → showScanProgress (indeterminate ring)
 *   2. File ready   → thumbnail in drop zone + settings panel below hero card
 *   3. Submit       → showProgress (SSE-driven ring) → showDownload
 *
 * Tool IDs and their backend routes:
 *   csv-json  → POST /api/csv/json/convert
 *   csv-xlsx  → POST /api/csv/xlsx/convert
 *   csv-html  → POST /api/csv/html/convert
 *   csv-md    → POST /api/csv/md/convert
 *   csv-pdf   → POST /api/csv/pdf/convert
 *   csv-txt   → POST /api/csv/txt/convert
 *   csv-xml   → POST /api/csv/xml/convert
 *   csv-sql   → POST /api/csv/sql/convert
 *
 * Exports:
 *   handleCsvFilePicked(file, toolId)  – call when a file is chosen
 *   removeCsvPanel()                   – teardown on tool change / reset
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

const BACKEND = 'http://127.0.0.1:8000';

// ─── TARGET-FORMAT METADATA ───────────────────────────────────────────────────

/** Map tool-id → target extension (without leading dot) */
const _TARGET_EXT = {
  'csv-json': 'json',
  'csv-xlsx': 'xlsx',
  'csv-html': 'html',
  'csv-md':   'md',
  'csv-pdf':  'pdf',
  'csv-txt':  'txt',
  'csv-xml':  'xml',
  'csv-sql':  'sql',
};

/** Map tool-id → backend sub-path segment */
const _ROUTE = {
  'csv-json': 'json',
  'csv-xlsx': 'xlsx',
  'csv-html': 'html',
  'csv-md':   'md',
  'csv-pdf':  'pdf',
  'csv-txt':  'txt',
  'csv-xml':  'xml',
  'csv-sql':  'sql',
};

// ─── MODULE STATE ──────────────────────────────────────────────────────────────

let _csvFile     = null;
let _csvBaseName = '';
let _csvToolId   = '';   // e.g. "csv-json"

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

export function removeCsvPanel() {
  const panel = document.getElementById('csv-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-csv-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-csv-thumb');
  }

  _csvFile     = null;
  _csvBaseName = '';
  _csvToolId   = '';
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showThumb(zone, file, color) {
  const old = zone.querySelector('.dz-csv-thumb-wrap');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.className = 'dz-csv-thumb-wrap';
  wrap.style.setProperty('--cc-color', color);
  wrap.innerHTML = `
    <div class="dz-csv-thumb-card">
      <div class="dz-csv-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        <svg class="dz-csv-thumb-icon" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
          <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
          <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
          <rect x="0" y="42" width="90" height="26" fill="${color}"/>
          <text x="45" y="60" font-family="Arial,sans-serif" font-size="12"
                font-weight="bold" fill="#ffffff"
                text-anchor="middle" dominant-baseline="middle">CSV</text>
          <line x1="12" y1="78" x2="78" y2="78" stroke="#dddddd" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="12" y1="87" x2="78" y2="87" stroke="#dddddd" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="12" y1="96" x2="78" y2="96" stroke="#dddddd" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="30" y1="78" x2="30" y2="106" stroke="#eeeeee" stroke-width="1" stroke-linecap="round"/>
          <line x1="54" y1="78" x2="54" y2="106" stroke="#eeeeee" stroke-width="1" stroke-linecap="round"/>
        </svg>
      </div>
      <button class="dz-csv-thumb-remove" title="Remove file"
              aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-csv-thumb-name">${_esc(file.name)}</span>
    <span class="dz-csv-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-csv-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-csv-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeCsvPanel();
    resetZoneContent(zone);
    import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(fileSize, color) {
  const existing = document.getElementById('csv-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const ext   = _targetExt(_csvToolId);
  const label = getActiveTool() ? getActiveTool().label : `Convert to ${ext.toUpperCase()}`;

  const panel = document.createElement('div');
  panel.id        = 'csv-settings-panel';
  panel.className = 'pw-panel';
  panel.style.setProperty('--pw-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ──────────────────────────────────────────────── -->
    <div class="pw-header">
      <span class="pw-header-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="${color}" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="4" y1="8"  x2="10" y2="8"  stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="10" x2="10" y2="10" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="pw-header-text">
          <strong>${_fmt(fileSize)}</strong>
        </span>
      </span>
      <button class="pw-change-btn" id="cc-change-btn" title="Pick a different file">
        Change file
      </button>
    </div>

    <!-- ── ACTIONS ROW ──────────────────────────────────────────────── -->
    <div class="pw-actions">
      <input class="pw-filename-input" id="cc-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"
             value="${_esc(_csvBaseName)}"/>
      <span class="pw-filename-ext">.${ext}</span>
      <button class="pw-submit-btn" id="cc-submit-btn">${label}</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('pw-panel--visible'));

  // ── "Change file" button ────────────────────────────────────────────────────
  panel.querySelector('#cc-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeCsvPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // ── "Convert" button ────────────────────────────────────────────────────────
  panel.querySelector('#cc-submit-btn').addEventListener('click', () => {
    if (!_csvFile) return;
    const nameEl  = panel.querySelector('#cc-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || _csvBaseName;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitConvert(_csvFile, outName);
  });
}

// ─── FILE PICKED (PUBLIC ENTRY POINT) ─────────────────────────────────────────

export async function handleCsvFilePicked(file, toolId) {
  if (!file || !file.name.toLowerCase().endsWith('.csv')) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid CSV file.',
    });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#84CC16') : '#84CC16';
  const zone  = document.getElementById('drop-zone');

  removeCsvPanel();

  _csvToolId   = toolId;
  _csvFile     = file;
  _csvBaseName = file.name.replace(/\.[^.]+$/, '');

  showScanProgress(zone, color);

  // Brief simulated scan — CSV has no thumbnail capability
  await new Promise((r) => setTimeout(r, 400));

  resetZoneContent(zone);

  _showThumb(zone, file, color);
  _showSettingsPanel(file.size, color);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitConvert(file, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#84CC16';

  // Remove thumbnail + settings; show progress ring
  const panel = document.getElementById('csv-settings-panel');
  if (panel) panel.remove();
  const thumb = zone ? zone.querySelector('.dz-csv-thumb-wrap') : null;
  if (thumb) thumb.remove();
  if (zone)  zone.classList.remove('dz-has-csv-thumb');

  const ext       = _targetExt(_csvToolId);
  const route     = _ROUTE[_csvToolId];
  const earlyName = `${_csvBaseName || outputFilename}.${ext}`;

  const fd = new FormData();
  fd.append('file', file);
  fd.append('output_filename', outputFilename);

  showProgress(zone, 10, color, 'Converting…');
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/csv/${route}/convert`, { method: 'POST', body: fd });
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
      removeCsvPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeCsvPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset, tool.id), 200);
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
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
