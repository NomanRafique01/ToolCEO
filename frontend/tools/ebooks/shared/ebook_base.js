/**
 * tools/ebooks/shared/ebook_base.js
 *
 * Single shared base for every eBook conversion tool.
 * All UI logic lives here — individual tool files are thin wrappers
 * that call handleEbookFilePicked(file, toolId) and removeEbookPanel().
 *
 * Flow (mirrors pdf_word.js / pdf_excel.js pattern exactly):
 *   1. File picked  → showScanProgress (indeterminate ring)
 *   2. File loaded  → thumbnail in drop zone + settings panel below hero card
 *   3. Submit       → showProgress (SSE-driven ring) → showDownload
 *
 * Exports:
 *   handleEbookFilePicked(file, toolId)  – call when a file is chosen
 *   removeEbookPanel()                   – teardown on tool change / reset
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
import { getOfflinePdfInfo } from '../../shared/pdfRenderer.js';

const BACKEND = 'http://127.0.0.1:8000';

// Accepted file extensions for each source format
const FORMAT_EXTS = {
  pdf:  ['.pdf'],
  epub: ['.epub'],
  mobi: ['.mobi'],
  azw3: ['.azw3'],
  fb2:  ['.fb2'],
  txt:  ['.txt'],
  rtf:  ['.rtf'],
};

// ─── MODULE STATE ──────────────────────────────────────────────────────────────

let _ebookFile     = null;
let _ebookBaseName = '';
let _ebookToolId   = '';   // e.g. "pdf-epub"

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

/** Extract source format from tool id, e.g. "pdf-epub" → "pdf" */
function _srcFmt(toolId) {
  return toolId.split('-')[0];
}

/** Extract target format from tool id, e.g. "pdf-epub" → "epub" */
function _dstFmt(toolId) {
  return toolId.split('-').slice(1).join('-');
}

/** True if the file's extension matches the expected source format */
function _validExt(file, toolId) {
  const src  = _srcFmt(toolId);
  const exts = FORMAT_EXTS[src] || [];
  const name = (file.name || '').toLowerCase();
  return exts.some((e) => name.endsWith(e));
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

export function removeEbookPanel() {
  const panel = document.getElementById('ebook-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-ebook-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-ebook-thumb');
  }

  _ebookFile     = null;
  _ebookBaseName = '';
  _ebookToolId   = '';
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showThumb(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-ebook-thumb-wrap');
  if (old) old.remove();

  const src = _srcFmt(_ebookToolId).toUpperCase();

  const thumbContent = dataUri
    ? `<img class="dz-ebook-thumb-img" src="${dataUri}"
             alt="File preview" draggable="false" />`
    : `<svg class="dz-ebook-thumb-icon" viewBox="0 0 90 116"
            xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
        <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
        <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
        <rect x="0" y="42" width="90" height="26" fill="${color}"/>
        <text x="45" y="60" font-family="Arial,sans-serif" font-size="14"
              font-weight="bold" fill="#ffffff"
              text-anchor="middle" dominant-baseline="middle">${src}</text>
        <line x1="12" y1="80" x2="78" y2="80" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="89" x2="78" y2="89" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="98" x2="55" y2="98" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

  const wrap = document.createElement('div');
  wrap.className = 'dz-ebook-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-ebook-thumb-card">
      <div class="dz-ebook-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${thumbContent}
      </div>
      <button class="dz-ebook-thumb-remove" title="Remove file"
              style="--eb-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-ebook-thumb-name">${_esc(file.name)}</span>
    <span class="dz-ebook-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-ebook-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-ebook-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeEbookPanel();
    resetZoneContent(zone);
    import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(fileSize, color) {
  const existing = document.getElementById('ebook-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const dst    = _dstFmt(_ebookToolId).toUpperCase();
  const label  = getActiveTool() ? getActiveTool().label : `Convert to ${dst}`;

  const panel = document.createElement('div');
  panel.id        = 'ebook-settings-panel';
  panel.className = 'eb-panel';
  panel.style.setProperty('--eb-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ──────────────────────────────────────────────── -->
    <div class="eb-header">
      <span class="eb-header-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 13s-4-2-7-2V3c3 0 7 2 7 2s4-2 7-2v8c-3 0-7 2-7 2Z"
            stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>
          <line x1="8" y1="5" x2="8" y2="13" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="eb-header-text">
          <strong>${_fmt(fileSize)}</strong>
        </span>
      </span>
      <button class="eb-change-btn" id="eb-change-btn" title="Pick a different file">
        Change file
      </button>
    </div>

    <!-- ── ACTIONS ROW ──────────────────────────────────────────────── -->
    <div class="eb-actions">
      <input class="eb-filename-input" id="eb-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"/>
      <span class="eb-filename-ext">.${_dstFmt(_ebookToolId)}</span>
      <button class="eb-submit-btn" id="eb-submit-btn">${label}</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('eb-panel--visible'));

  const filenameInput = panel.querySelector('#eb-filename-input');
  if (filenameInput && _ebookBaseName) filenameInput.value = _ebookBaseName;

  panel.querySelector('#eb-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeEbookPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  panel.querySelector('#eb-submit-btn').addEventListener('click', () => {
    if (!_ebookFile) return;
    const nameEl  = panel.querySelector('#eb-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || _ebookBaseName;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitConvert(_ebookFile, outName);
  });
}

// ─── FILE PICKED (PUBLIC ENTRY POINT) ─────────────────────────────────────────

export async function handleEbookFilePicked(file, toolId) {
  if (!file || !_validExt(file, toolId)) {
    const src = _srcFmt(toolId).toUpperCase();
    pushNotification({
      type: 'warning',
      message: `Invalid File Format. Please select a valid ${src} file.`,
    });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#8B5CF6') : '#8B5CF6';
  const zone  = document.getElementById('drop-zone');

  _ebookToolId = toolId;
  removeEbookPanel();
  showScanProgress(zone, color);

  // For PDFs try to get thumbnail; for other formats skip backend info call
  let thumbnail = null;
  const isPdf   = _srcFmt(toolId) === 'pdf';

  if (isPdf) {
    try {
      const offlineInfo = await getOfflinePdfInfo(file, 0.5);
      thumbnail = offlineInfo.thumbnail || null;
    } catch (_) { /* non-critical */ }
  }

  resetZoneContent(zone);

  _ebookFile     = file;
  _ebookBaseName = file.name.replace(/\.[^.]+$/, '');
  _ebookToolId   = toolId;

  _showThumb(zone, file, color, thumbnail);
  _showSettingsPanel(file.size, color);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitConvert(file, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#8B5CF6';
  const dst   = _dstFmt(_ebookToolId);

  // Remove thumbnail + settings; show progress ring
  const panel = document.getElementById('ebook-settings-panel');
  if (panel) panel.remove();
  const thumb = zone ? zone.querySelector('.dz-ebook-thumb-wrap') : null;
  if (thumb) thumb.remove();
  if (zone)  zone.classList.remove('dz-has-ebook-thumb');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('target_format', dst);
  fd.append('output_filename', outputFilename);

  showProgress(zone, 10, color, 'Converting…');

  const earlyFilename = `${_ebookBaseName || outputFilename}.${dst}`;
  setBgJob({ jobId: null, tool, filename: earlyFilename, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/ebooks/convert`, { method: 'POST', body: fd });
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

  setBgJob({ jobId, tool, filename: earlyFilename, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const rawPct = typeof progress === 'number' ? progress : lastPct;
    const pct    = Math.max(lastPct, rawPct);
    lastPct      = pct;

    const bg = getBgJob();
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
      removeEbookPanel();
      const dlName = data.filename || earlyFilename;
      const onReset = () => {
        removeEbookPanel();
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
