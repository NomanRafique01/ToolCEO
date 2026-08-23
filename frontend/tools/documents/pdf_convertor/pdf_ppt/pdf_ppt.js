/**
 * tools/documents/pdf_convertor/pdf_ppt/pdf_ppt.js
 *
 * PDF → PPT Converter — single-file flow.
 * Mirrors pdf_txt.js exactly — identical UX, same progress/download/error
 * system.  Only class names, endpoint paths, and file extension differ.
 *
 * Exports:
 *   handlePdfPptFilePicked(file)  – call when a file is chosen
 *   removePdfPptPanel()           – teardown on tool change / reset
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../../scripts/toolstate.js';
import { pushNotification } from '../../../../scripts/notificationStore.js';
import {
  showScanProgress,
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../../../shared/progress.js';
import { getOfflinePdfInfo } from '../../../shared/pdfRenderer.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── MODULE STATE ──────────────────────────────────────────────────────────────

let _pdfPptFile      = null;
let _pdfPptBaseName  = '';
let _pdfPptPageCount = 1;

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

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

export function removePdfPptPanel() {
  const panel = document.getElementById('pdf-ppt-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-pdf-ppt-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-pdf-ppt-thumb');
  }

  _pdfPptFile      = null;
  _pdfPptBaseName  = '';
  _pdfPptPageCount = 1;
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showThumb(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-pdf-ppt-thumb-wrap');
  if (old) old.remove();

  const thumbContent = dataUri
    ? `<img class="dz-pdf-ppt-thumb-img" src="${dataUri}"
             alt="PDF preview" draggable="false" />`
    : `<svg class="dz-pdf-ppt-thumb-icon" viewBox="0 0 90 116"
            xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
        <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
        <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
        <rect x="0" y="42" width="90" height="26" fill="${color}"/>
        <text x="45" y="60" font-family="Arial,sans-serif" font-size="14"
              font-weight="bold" fill="#ffffff"
              text-anchor="middle" dominant-baseline="middle">PDF</text>
        <line x1="12" y1="80" x2="78" y2="80" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="89" x2="78" y2="89" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="98" x2="55" y2="98" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

  const wrap = document.createElement('div');
  wrap.className = 'dz-pdf-ppt-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-pdf-ppt-thumb-card">
      <div class="dz-pdf-ppt-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${thumbContent}
      </div>
      <button class="dz-pdf-ppt-thumb-remove" title="Remove file"
              style="--pw-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pdf-ppt-thumb-name">${_esc(file.name)}</span>
    <span class="dz-pdf-ppt-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-pdf-ppt-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-pdf-ppt-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removePdfPptPanel();
    resetZoneContent(zone);
    import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(pageCount, fileSize, color) {
  const existing = document.getElementById('pdf-ppt-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id        = 'pdf-ppt-settings-panel';
  panel.className = 'pw-panel';
  panel.style.setProperty('--pw-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ──────────────────────────────────────────────── -->
    <div class="pw-header">
      <span class="pw-header-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="6" height="8" rx="1" stroke="${color}" stroke-width="1.3"/>
          <path d="M4 2l3 3H4V2Z" stroke="${color}" stroke-width="1.1" stroke-linejoin="round"/>
          <path d="M7 9l2 1.5L7 12" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="9" y="2" width="6" height="8" rx="1" stroke="${color}" stroke-width="1.3"/>
          <path d="M11 5h2a1 1 0 0 1 0 2h-2V5Z" stroke="${color}" stroke-width="1.1" stroke-linejoin="round"/>
          <line x1="11" y1="8" x2="11" y2="9" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="pw-header-text">
          <strong>${pageCount}</strong> page${pageCount !== 1 ? 's' : ''}
          &nbsp;·&nbsp;
          <strong>${_fmt(fileSize)}</strong>
        </span>
      </span>
      <button class="pw-change-btn" id="pw-ppt-change-btn" title="Pick a different file">
        Change file
      </button>
    </div>

    <!-- ── INFO BOX ─────────────────────────────────────────────────── -->
    <div class="pw-info-box">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="${color}" stroke-width="1.2"/>
        <line x1="8" y1="7" x2="8" y2="12" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="8" cy="5" r="0.75" fill="${color}"/>
      </svg>
      <span>Each PDF page becomes a full-bleed PowerPoint slide rendered at high resolution.
      Slide dimensions are matched to the page aspect ratio (16:9, 4:3, or exact fit).
      100% offline — no cloud, no internet required.</span>
    </div>

    <!-- ── ACTIONS ROW ──────────────────────────────────────────────── -->
    <div class="pw-actions">
      <input class="pw-filename-input" id="pw-ppt-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"/>
      <span class="pw-filename-ext">.pptx</span>
      <button class="pw-submit-btn" id="pw-ppt-submit-btn">Convert to PPT</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('pw-panel--visible'));

  // ── Default filename ──────────────────────────────────────────────────────
  const filenameInput = panel.querySelector('#pw-ppt-filename-input');
  if (filenameInput && _pdfPptBaseName) {
    filenameInput.value = `${_pdfPptBaseName}_converted`;
  }

  // ── "Change file" button ──────────────────────────────────────────────────
  panel.querySelector('#pw-ppt-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removePdfPptPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // ── "Convert to PPT" button ───────────────────────────────────────────────
  panel.querySelector('#pw-ppt-submit-btn').addEventListener('click', () => {
    if (!_pdfPptFile) return;
    const nameEl  = panel.querySelector('#pw-ppt-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || `${_pdfPptBaseName}_converted`;
    const main    = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
    _submitConvert(_pdfPptFile, outName);
  });
}

// ─── SCAN FLOW ────────────────────────────────────────────────────────────────

export async function handlePdfPptFilePicked(file) {
  if (!file || !(file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid PDF file.'
    });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#F97316') : '#F97316';
  const zone  = document.getElementById('drop-zone');

  removePdfPptPanel();
  showScanProgress(zone, color);

  const fd = new FormData();
  fd.append('file', file);

  let pageCount = 1;
  let thumbnail = null;
  let fileSize  = file.size;
  let loaded    = false;

  try {
    const res = await fetch(`${BACKEND}/api/pdf/ppt/info`, { method: 'POST', body: fd }).catch(() => null);
    if (res && res.ok) {
      const json = await res.json();
      pageCount  = json.page_count  || 1;
      thumbnail  = json.thumbnail   || null;
      fileSize   = json.file_size   || file.size;
      loaded     = true;
    }
  } catch (_) {
    loaded = false;
  }

  if (!loaded) {
    try {
      const offlineInfo = await getOfflinePdfInfo(file, 0.5);
      pageCount = offlineInfo.pageCount || 1;
      thumbnail = offlineInfo.thumbnail || null;
    } catch (offlineErr) {
      showError(zone, `Could not read PDF: ${offlineErr.message}`);
      return;
    }
  }

  resetZoneContent(zone);

  _pdfPptFile      = file;
  _pdfPptBaseName  = file.name.replace(/\.[^.]+$/, '');
  _pdfPptPageCount = pageCount;

  _showThumb(zone, file, color, thumbnail);
  _showSettingsPanel(pageCount, fileSize, color);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitConvert(file, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#F97316';

  // Remove thumbnail + settings immediately; show progress ring only
  const panel = document.getElementById('pdf-ppt-settings-panel');
  if (panel) panel.remove();
  const thumb = zone ? zone.querySelector('.dz-pdf-ppt-thumb-wrap') : null;
  if (thumb) thumb.remove();
  if (zone)  zone.classList.remove('dz-has-pdf-ppt-thumb');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('output_filename', outputFilename);

  showProgress(zone, 9, color, 'Converting…');

  const earlyFilename = `${_pdfPptBaseName || outputFilename}_converted.pptx`;
  setBgJob({ jobId: null, tool, filename: earlyFilename, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/ppt/convert`, { method: 'POST', body: fd });
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
      updateProgress(document.getElementById('drop-zone'), Math.max(10, Math.min(90, pct)), color);
      return;
    }

    sse.close();

    if (state === 'done') {
      updateProgress(zone, 100, color);
      removePdfPptPanel();
      const dlName = data.filename || earlyFilename;
      const onReset = () => {
        removePdfPptPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset), 200);
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (state === 'error') {
      showError(document.getElementById('drop-zone'), error || 'Conversion failed. Please try again.');
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(document.getElementById('drop-zone'), 'Lost connection to backend. Is the server running?');
  };
}
