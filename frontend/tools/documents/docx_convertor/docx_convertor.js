/**
 * tools/documents/docx_convertor/docx_convertor.js
 *
 * Shared base for all 6 DOCX conversion tools.
 * All UI logic lives here — individual tool files are thin wrappers that call
 * handleDocxFilePicked(file, toolId) and removeDocxPanel().
 *
 * Flow (identical to ebook_base.js / pdf_html.js pattern):
 *   1. File picked  → showScanProgress (indeterminate ring)
 *   2. File ready   → thumbnail in drop zone + settings panel below hero card
 *   3. Submit       → showProgress (SSE-driven ring) → showDownload
 *
 * Tool IDs and their backend routes:
 *   docx-pdf   → POST /api/docx/pdf/convert
 *   docx-html  → POST /api/docx/html/convert
 *   docx-txt   → POST /api/docx/txt/convert
 *   docx-odt   → POST /api/docx/odt/convert
 *   docx-epub  → POST /api/docx/epub/convert
 *   docx-md    → POST /api/docx/md/convert
 *
 * Exports:
 *   handleDocxFilePicked(file, toolId)  – call when a file is chosen
 *   removeDocxPanel()                   – teardown on tool change / reset
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
  'docx-pdf':  'pdf',
  'docx-html': 'html',
  'docx-txt':  'txt',
  'docx-odt':  'odt',
  'docx-epub': 'epub',
  'docx-md':   'md',
};

/** Map tool-id → backend sub-path segment */
const _ROUTE = {
  'docx-pdf':  'pdf',
  'docx-html': 'html',
  'docx-txt':  'txt',
  'docx-odt':  'odt',
  'docx-epub': 'epub',
  'docx-md':   'md',
};

// ─── MODULE STATE ──────────────────────────────────────────────────────────────

let _docxFile     = null;
let _docxBaseName = '';
let _docxToolId   = '';   // e.g. "docx-pdf"

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

function _targetLabel(toolId) {
  const ext = _targetExt(toolId).toUpperCase();
  return ext;
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

export function removeDocxPanel() {
  const panel = document.getElementById('docx-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-docx-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-docx-thumb');
  }

  _docxFile     = null;
  _docxBaseName = '';
  _docxToolId   = '';
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showThumb(zone, file, color) {
  const old = zone.querySelector('.dz-docx-thumb-wrap');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.className = 'dz-docx-thumb-wrap';
  wrap.style.setProperty('--dc-color', color);
  wrap.innerHTML = `
    <div class="dz-docx-thumb-card">
      <div class="dz-docx-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        <svg class="dz-docx-thumb-icon" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
          <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
          <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
          <rect x="0" y="42" width="90" height="26" fill="${color}"/>
          <text x="45" y="60" font-family="Arial,sans-serif" font-size="12"
                font-weight="bold" fill="#ffffff"
                text-anchor="middle" dominant-baseline="middle">DOCX</text>
          <line x1="12" y1="80" x2="78" y2="80" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
          <line x1="12" y1="89" x2="78" y2="89" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
          <line x1="12" y1="98" x2="55" y2="98" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <button class="dz-docx-thumb-remove" title="Remove file"
              aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-docx-thumb-name">${_esc(file.name)}</span>
    <span class="dz-docx-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-docx-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-docx-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeDocxPanel();
    resetZoneContent(zone);
    import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(fileSize, color) {
  const existing = document.getElementById('docx-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const ext   = _targetExt(_docxToolId);
  const label = getActiveTool() ? getActiveTool().label : `Convert to ${ext.toUpperCase()}`;

  const panel = document.createElement('div');
  panel.id        = 'docx-settings-panel';
  panel.className = 'pw-panel';
  panel.style.setProperty('--pw-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ──────────────────────────────────────────────── -->
    <div class="pw-header">
      <span class="pw-header-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="${color}" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="4" y1="7"  x2="10" y2="7"  stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="9"  x2="10" y2="9"  stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="11" x2="7"  y2="11" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="pw-header-text">
          <strong>${_fmt(fileSize)}</strong>
        </span>
      </span>
      <button class="pw-change-btn" id="dc-change-btn" title="Pick a different file">
        Change file
      </button>
    </div>

    <!-- ── ACTIONS ROW ──────────────────────────────────────────────── -->
    <div class="pw-actions">
      <input class="pw-filename-input" id="dc-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"
             value="${_esc(_docxBaseName)}"/>
      <span class="pw-filename-ext">.${ext}</span>
      <button class="pw-submit-btn" id="dc-submit-btn">${label}</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('pw-panel--visible'));

  // ── "Change file" button ────────────────────────────────────────────────────
  panel.querySelector('#dc-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeDocxPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // ── "Convert" button ────────────────────────────────────────────────────────
  panel.querySelector('#dc-submit-btn').addEventListener('click', () => {
    if (!_docxFile) return;
    const nameEl  = panel.querySelector('#dc-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || _docxBaseName;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitConvert(_docxFile, outName);
  });
}

// ─── FILE PICKED (PUBLIC ENTRY POINT) ─────────────────────────────────────────

export async function handleDocxFilePicked(file, toolId) {
  if (!file || !file.name.toLowerCase().endsWith('.docx')) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid DOCX file.',
    });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#60A5FA') : '#60A5FA';
  const zone  = document.getElementById('drop-zone');

  removeDocxPanel();

  _docxToolId   = toolId;
  _docxFile     = file;
  _docxBaseName = file.name.replace(/\.[^.]+$/, '');

  showScanProgress(zone, color);

  // Brief simulated scan — DOCX has no thumbnail capability
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
  const color = tool.color || '#60A5FA';

  // Remove thumbnail + settings; show progress ring
  const panel = document.getElementById('docx-settings-panel');
  if (panel) panel.remove();
  const thumb = zone ? zone.querySelector('.dz-docx-thumb-wrap') : null;
  if (thumb) thumb.remove();
  if (zone)  zone.classList.remove('dz-has-docx-thumb');

  const ext        = _targetExt(_docxToolId);
  const route      = _ROUTE[_docxToolId];
  const earlyName  = `${_docxBaseName || outputFilename}.${ext}`;

  const fd = new FormData();
  fd.append('file', file);
  fd.append('output_filename', outputFilename);

  showProgress(zone, 10, color, 'Converting…');
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/docx/${route}/convert`, { method: 'POST', body: fd });
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
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color);
      return;
    }

    sse.close();

    if (state === 'done') {
      updateProgress(zone, 100, color);
      removeDocxPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeDocxPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset), 200);
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
