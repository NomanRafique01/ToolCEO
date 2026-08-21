/**
 * tools/documents/pdf_tools/compressor/compressor.js
 *
 * PDF Compressor — size-reduction only.
 * Shows a thumbnail preview, lets the user pick a reduction target
 * (20 % / 50 % / 80 % / Custom), then submits via the backend job system.
 *
 * Exports:
 *   handleCompressFilePicked(file)  – call when a file is chosen
 *   removeCompressPanel()           – teardown on tool change / reset
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

const BACKEND = 'http://127.0.0.1:8000';

// ─── MODULE STATE ──────────────────────────────────────────────────────────────

let _compressFile     = null;
let _compressBaseName = '';
let _compressFileSize = 0;   // original file size in bytes

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

export function removeCompressPanel() {
  const panel = document.getElementById('compress-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-compress-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-compress-thumb');
  }

  _compressFile     = null;
  _compressBaseName = '';
  _compressFileSize = 0;
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showCompressThumb(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-compress-thumb-wrap');
  if (old) old.remove();

  const thumbContent = dataUri
    ? `<img class="dz-compress-thumb-img" src="${dataUri}"
             alt="PDF preview" draggable="false" />`
    : `<svg class="dz-compress-thumb-icon" viewBox="0 0 90 116"
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
  wrap.className = 'dz-compress-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-compress-thumb-card">
      <div class="dz-compress-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${thumbContent}
      </div>
      <button class="dz-compress-thumb-remove" title="Remove file"
              style="--cmp-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-compress-thumb-name">${_esc(file.name)}</span>
    <span class="dz-compress-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-compress-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-compress-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeCompressPanel();
    resetZoneContent(zone);
    import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(pageCount, color) {
  const existing = document.getElementById('compress-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id        = 'compress-settings-panel';
  panel.className = 'cmp-panel';
  panel.style.setProperty('--cmp-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ──────────────────────────────────────────────── -->
    <div class="cmp-header">
      <span class="cmp-header-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="${color}" stroke-width="1.3"/>
          <path d="M5 8h6M8 5v6" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M5 5l1.5 1.5M11 5l-1.5 1.5M5 11l1.5-1.5M11 11l-1.5-1.5"
                stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="cmp-header-text">
          <strong>${pageCount}</strong> page${pageCount !== 1 ? 's' : ''}
          &nbsp;·&nbsp;
          Original Size: <strong>${_fmt(_compressFileSize)}</strong>
        </span>
      </span>
      <button class="cmp-change-btn" id="cmp-change-btn" title="Pick a different file">
        Change file
      </button>
    </div>

    <!-- ── TARGET SIZE REDUCTION SECTION ───────────────────────────── -->
    <div class="cmp-section">
      <div class="cmp-section-title">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        Target Size Reduction
      </div>

      <div class="cmp-reduction-group" id="cmp-reduction-group">
        <button class="cmp-reduction-btn" data-reduction="20" id="cmp-red-20">
          <span class="cmp-reduction-title">20% <span class="cmp-reduction-sub">Low</span></span>
          <span class="cmp-reduction-size">${_fmt(_compressFileSize * 0.8)}</span>
        </button>
        <button class="cmp-reduction-btn cmp-reduction-btn--active" data-reduction="50" id="cmp-red-50">
          <span class="cmp-reduction-title">50% <span class="cmp-reduction-sub">Medium</span></span>
          <span class="cmp-reduction-size">${_fmt(_compressFileSize * 0.5)}</span>
        </button>
        <button class="cmp-reduction-btn" data-reduction="80" id="cmp-red-80">
          <span class="cmp-reduction-title">80% <span class="cmp-reduction-sub">High</span></span>
          <span class="cmp-reduction-size">${_fmt(_compressFileSize * 0.2)}</span>
        </button>
        <button class="cmp-reduction-btn" data-reduction="90" id="cmp-red-90">
          <span class="cmp-reduction-title">90% <span class="cmp-reduction-sub">Max</span></span>
          <span class="cmp-reduction-size">${_fmt(_compressFileSize * 0.1)}</span>
        </button>
      </div>
    </div>

    <!-- ── ACTIONS ROW ──────────────────────────────────────────────── -->
    <div class="cmp-actions">
      <input class="cmp-filename-input" id="cmp-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"/>
      <span class="cmp-filename-ext">.pdf</span>
      <button class="cmp-submit-btn" id="cmp-submit-btn">Compress PDF</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('cmp-panel--visible'));

  // ── Reduction buttons ──────────────────────────────────────────────────────

  const reductionBtns = panel.querySelectorAll('[data-reduction]');

  reductionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      reductionBtns.forEach((b) => b.classList.remove('cmp-reduction-btn--active'));
      btn.classList.add('cmp-reduction-btn--active');
    });
  });

  // ── "Change file" button ──────────────────────────────────────────────────

  panel.querySelector('#cmp-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeCompressPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // ── "Compress PDF" button ─────────────────────────────────────────────────

  panel.querySelector('#cmp-submit-btn').addEventListener('click', () => {
    if (!_compressFile) return;
    const opts    = _collectOptions(panel);
    const nameEl  = panel.querySelector('#cmp-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || (_compressBaseName + '_compressed');
    const main    = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
    _submitCompress(_compressFile, opts, outName);
  });

  // ── Default filename ──────────────────────────────────────────────────────

  const filenameInput = panel.querySelector('#cmp-filename-input');
  if (filenameInput && _compressBaseName) {
    filenameInput.value = `${_compressBaseName}_compressed`;
  }
}

// ─── COLLECT OPTIONS ──────────────────────────────────────────────────────────

function _collectOptions(panel) {
  const activeRedBtn = panel.querySelector('[data-reduction].cmp-reduction-btn--active');
  let targetBytes = null;

  if (activeRedBtn) {
    const redVal = activeRedBtn.dataset.reduction;
    const pct = Math.max(5, Math.min(95, parseInt(redVal, 10) || 50));
    targetBytes = Math.round(_compressFileSize * (1 - pct / 100));
  }

  return { max_file_size: targetBytes };
}

// ─── SCAN FLOW ────────────────────────────────────────────────────────────────

export async function handleCompressFilePicked(file) {
  if (!file || !(file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid PDF file.'
    });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#34D399') : '#34D399';
  const zone  = document.getElementById('drop-zone');

  removeCompressPanel();
  showScanProgress(zone, color);

  const fd = new FormData();
  fd.append('file', file);

  let pageCount = 1;
  let thumbnail = null;
  let fileSize  = file.size;

  try {
    const res  = await fetch(`${BACKEND}/api/pdf/compressor/info`, { method: 'POST', body: fd });
    if (res.ok) {
      const json = await res.json();
      pageCount  = json.page_count  || 1;
      thumbnail  = json.thumbnail   || null;
      fileSize   = json.file_size   || file.size;
    } else {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.detail || `Server error ${res.status}`);
    }
  } catch (err) {
    showError(zone, `Could not read PDF: ${err.message}`);
    return;
  }

  resetZoneContent(zone);

  _compressFile     = file;
  _compressBaseName = file.name.replace(/\.[^.]+$/, '');
  _compressFileSize = fileSize;

  _showCompressThumb(zone, file, color, thumbnail);
  _showSettingsPanel(pageCount, color);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitCompress(file, opts, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#34D399';

  // Hide thumbnail + settings immediately; show progress bar only
  const panel = document.getElementById('compress-settings-panel');
  if (panel) panel.remove();
  const thumb = zone ? zone.querySelector('.dz-compress-thumb-wrap') : null;
  if (thumb) thumb.remove();
  if (zone)  zone.classList.remove('dz-has-compress-thumb');

  // Build FormData
  const fd = new FormData();
  fd.append('file', file);
  if (opts.max_file_size != null) fd.append('max_file_size', String(opts.max_file_size));
  fd.append('output_filename', outputFilename);

  showProgress(zone, 10, color, 'Compressing…');

  // Register job immediately so bar appears if user switches tools during upload
  const earlyFilename = `${_compressBaseName}_compressed.pdf`;
  setBgJob({ jobId: null, tool, filename: earlyFilename, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/compressor/compress`, { method: 'POST', body: fd });
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

  // Upgrade from 'submitting' to 'running' now that we have a real jobId + SSE
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
      removeCompressPanel();
      const dlName = data.filename || `${_compressBaseName}_compressed.pdf`;
      const onReset = () => {
        removeCompressPanel();
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
      showError(zone, error || 'Compression failed. Please try again.');
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?');
  };
}
