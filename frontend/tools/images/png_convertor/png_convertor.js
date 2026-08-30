/**
 * tools/images/png_convertor/png_convertor.js
 *
 * Multi-image queue flow for all 7 PNG conversion tools.
 * Mirrors jpg_convertor.js exactly, adapted for PNG source files.
 *
 * Single file  → backend returns the converted file directly.
 * Multiple files → backend converts all and returns a .zip archive.
 * Multiple files + png-pdf + single mode → backend merges into one PDF.
 *
 * Exports:
 *   handlePngFilesPicked(files, toolId)   – entry point from thin wrappers
 *   removePngPanel()                       – full teardown
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../scripts/toolstate.js';
import { pushNotification } from '../../../scripts/notificationStore.js';
import {
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../../shared/progress.js';

const BACKEND         = 'http://127.0.0.1:8000';
const _FALLBACK_COLOR = '#34D399';

// ─── TOOL METADATA ───────────────────────────────────────────────────────────

const _ROUTE = {
  'png-jpg':  'to-jpg',
  'png-webp': 'to-webp',
  'png-pdf':  'to-pdf',
  'png-bmp':  'to-bmp',
  'png-tiff': 'to-tiff',
  'png-ico':  'to-ico',
  'png-txt':  'to-txt',
};

const _EXT = {
  'png-jpg':  'jpg',
  'png-webp': 'webp',
  'png-pdf':  'pdf',
  'png-bmp':  'bmp',
  'png-tiff': 'tiff',
  'png-ico':  'ico',
  'png-txt':  'txt',
};

// ─── MODULE STATE ────────────────────────────────────────────────────────────

/** @type {{ file: File, thumbnail: string|null }[]} */
let _queue   = [];
let _toolId  = '';
/** 'single' | 'individual' — only relevant for png-pdf with multiple images */
let _pdfMode = 'individual';

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _isPng(file) {
  const n = (file ? file.name : '').toLowerCase();
  return n.endsWith('.png');
}

function _readDataUri(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

// ─── PUBLIC: TEARDOWN ────────────────────────────────────────────────────────

export function removePngPanel() {
  document.getElementById('png-queue-panel')?.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-png-thumb-strip')?.remove();
    zone.classList.remove('dz-has-png-thumbs');
  }

  _queue   = [];
  _toolId  = '';
  _pdfMode = 'individual';
}

// ─── THUMBNAIL STRIP ─────────────────────────────────────────────────────────

function _renderStrip() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || _FALLBACK_COLOR) : _FALLBACK_COLOR;

  zone.querySelector('.dz-png-thumb-strip')?.remove();

  if (_queue.length === 0) {
    zone.classList.remove('dz-has-png-thumbs');
    return;
  }

  zone.classList.add('dz-has-png-thumbs');

  const strip = document.createElement('div');
  strip.className = 'dz-jpg-thumb-strip dz-png-thumb-strip';

  _queue.forEach((item, idx) => {
    strip.appendChild(_buildCard(item, idx, color));
  });

  // "Add more" button
  const addBtn = document.createElement('button');
  addBtn.className = 'dz-jpg-add-btn';
  addBtn.type  = 'button';
  addBtn.title = 'Add more PNG images';
  addBtn.style.setProperty('--jpg-color', color);
  addBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span>Add PNG</span>`;
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _openFilePicker();
  });
  strip.appendChild(addBtn);

  zone.appendChild(strip);
}

function _buildCard(item, idx, color) {
  const card = document.createElement('div');
  card.className   = 'dz-jpg-card';
  card.dataset.idx = String(idx);
  card.style.setProperty('--jpg-color', color);

  const shortName = item.file.name.length > 18
    ? item.file.name.slice(0, 15) + '…'
    : item.file.name;

  const thumbContent = item.thumbnail
    ? `<img class="dz-jpg-thumb-img" src="${item.thumbnail}"
           alt="${_esc(item.file.name)}" draggable="false"/>`
    : `<svg viewBox="0 0 90 90" width="90" height="90" xmlns="http://www.w3.org/2000/svg">
         <rect x="0" y="0" width="90" height="90" fill="#1c2128"/>
         <rect x="10" y="10" width="70" height="70" rx="6" fill="#2d333b"
               stroke="${color}" stroke-width="1.5"/>
         <circle cx="32" cy="36" r="8" fill="${color}" opacity="0.6"/>
         <path d="M10 65 l20-20 18 18 12-12 20 20" fill="none"
               stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
       </svg>`;

  card.innerHTML = `
    <div class="dz-jpg-thumb-frame">
      ${thumbContent}
    </div>
    <span class="dz-jpg-card-name" title="${_esc(item.file.name)}">${_esc(shortName)}</span>
    <button class="dz-jpg-card-remove" type="button"
            aria-label="Remove ${_esc(item.file.name)}">&#x2715;</button>`;

  card.querySelector('.dz-jpg-card-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    _queue.splice(idx, 1);
    _renderStrip();
    _renderPanel();
  });

  return card;
}

// ─── FILE PICKER ─────────────────────────────────────────────────────────────

function _openFilePicker() {
  let inp = document.getElementById('file-input');
  let temp = false;
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    temp = true;
  }
  inp.multiple = true;
  inp.accept   = 'image/png,.png';

  inp.onchange = async () => {
    if (inp.files && inp.files.length > 0) {
      await _addFiles(Array.from(inp.files));
    }
    inp.value    = '';
    inp.multiple = false;
    inp.accept   = '';
    if (temp) inp.remove();
  };

  inp.click();
}

// ─── QUEUE PANEL ─────────────────────────────────────────────────────────────

function _renderPanel() {
  document.getElementById('png-queue-panel')?.remove();

  if (_queue.length < 1) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || _FALLBACK_COLOR) : _FALLBACK_COLOR;

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const ext      = _EXT[_toolId] || 'out';
  const label    = tool ? tool.label : `Convert to ${ext.toUpperCase()}`;
  const total    = _queue.length;
  const isPdf    = _toolId === 'png-pdf';
  const isMulti  = total > 1;

  // For png-pdf with multiple files, hint changes based on _pdfMode
  let outHint;
  if (isPdf && isMulti) {
    outHint = _pdfMode === 'single'
      ? `${total} images → <strong>1</strong> merged PDF`
      : `${total} images → <strong>${total}</strong> PDFs packed in a .zip`;
  } else if (isMulti) {
    outHint = `${total} images → <strong>${total}</strong> files packed in a .zip`;
  } else {
    outHint = `1 image → converted <strong>.${ext}</strong> file`;
  }

  const extHint    = isPdf && isMulti && _pdfMode === 'single' ? 'pdf' : (isMulti ? 'zip' : ext);
  const defaultName = _queue[0].file.name.replace(/\.[^.]+$/, '') + '_converted';

  // BMP warning — only shown for png-bmp
  const bmpWarningHTML = (_toolId === 'png-bmp') ? `
    <div class="jpg-bmp-warning">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="flex-shrink:0;margin-top:1px">
        <path d="M8 1.5L14.5 13H1.5L8 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <circle cx="8" cy="11.8" r="0.7" fill="currentColor"/>
      </svg>
      BMP files are uncompressed — output will be much larger than the original file.
    </div>` : '';

  // ICO info row — only shown for png-ico
  const icoInfoHTML = (_toolId === 'png-ico') ? `
    <div class="jpg-ico-info">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="flex-shrink:0;margin-top:1px">
        <circle cx="8" cy="8" r="6.5" stroke="${color}" stroke-width="1.3"/>
        <line x1="8" y1="7" x2="8" y2="11" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="8" cy="5.2" r="0.75" fill="${color}"/>
      </svg>
      Generates a multi-resolution icon with all 7 standard sizes:
      <span class="jpg-ico-sizes">16 · 24 · 32 · 48 · 64 · 128 · 256 px</span>
      &nbsp;— full image preserved, transparent padding added for non-square sources.
    </div>` : '';

  // PDF mode toggle — only shown for png-pdf with 2+ images
  const pdfToggleHTML = (isPdf && isMulti) ? `
    <div class="jpg-pdf-mode-row" id="png-pdf-mode-row">
      <span class="jpg-pdf-mode-label">Output mode</span>
      <div class="jpg-pdf-mode-toggle">
        <button class="jpg-pdf-mode-btn${_pdfMode === 'individual' ? ' jpg-pdf-mode-btn--active' : ''}"
                data-mode="individual" type="button">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 1h7l3 3v11H2V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M9 1v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
          </svg>
          Individual PDFs
        </button>
        <button class="jpg-pdf-mode-btn${_pdfMode === 'single' ? ' jpg-pdf-mode-btn--active' : ''}"
                data-mode="single" type="button">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 1h7l3 3v11H2V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M9 1v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
            <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          </svg>
          Single PDF
        </button>
      </div>
    </div>` : '';

  const panel = document.createElement('div');
  panel.id        = 'png-queue-panel';
  panel.className = 'jpg-queue-panel';
  panel.style.setProperty('--jpg-color', color);

  panel.innerHTML = `
    <div class="jpg-queue-header">
      <span class="jpg-queue-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="14" height="12" rx="2" stroke="${color}" stroke-width="1.3"/>
          <circle cx="5.5" cy="6" r="1.3" stroke="${color}" stroke-width="1.1"/>
          <path d="M1 12l3.5-3.5 3 3 2-2 5.5 4" stroke="${color}" stroke-width="1.2"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="jpg-queue-badge-text" id="png-queue-hint">
          <strong>${total}</strong> image${total !== 1 ? 's' : ''} &nbsp;·&nbsp; ${outHint}
        </span>
      </span>
      <button class="jpg-queue-clear-btn" id="png-queue-clear" type="button">Clear all</button>
    </div>

    ${pdfToggleHTML}
    ${bmpWarningHTML}
    ${icoInfoHTML}

    <div class="jpg-queue-actions">
      <input class="jpg-queue-filename" id="png-queue-filename"
             type="text" placeholder="Output filename (optional)"
             value="${_esc(defaultName)}" maxlength="120" spellcheck="false"/>
      <span class="jpg-queue-ext" id="png-queue-ext">.${extHint}</span>
      <button class="jpg-queue-convert-btn" id="png-queue-convert" type="button">${label}</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('jpg-queue-panel--visible'));

  // ── PDF mode toggle wiring ────────────────────────────────────────────────
  if (isPdf && isMulti) {
    panel.querySelectorAll('.jpg-pdf-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        _pdfMode = btn.dataset.mode;
        panel.querySelectorAll('.jpg-pdf-mode-btn').forEach((b) =>
          b.classList.toggle('jpg-pdf-mode-btn--active', b.dataset.mode === _pdfMode)
        );
        const hintEl = panel.querySelector('#png-queue-hint');
        const extEl  = panel.querySelector('#png-queue-ext');
        if (hintEl) {
          const newHint = _pdfMode === 'single'
            ? `${total} images → <strong>1</strong> merged PDF`
            : `${total} images → <strong>${total}</strong> PDFs packed in a .zip`;
          hintEl.innerHTML = `<strong>${total}</strong> image${total !== 1 ? 's' : ''} &nbsp;·&nbsp; ${newHint}`;
        }
        if (extEl) extEl.textContent = `.${_pdfMode === 'single' ? 'pdf' : 'zip'}`;
      });
    });
  }

  panel.querySelector('#png-queue-clear').addEventListener('click', () => {
    removePngPanel();
    const zone = document.getElementById('drop-zone');
    if (zone) {
      resetZoneContent(zone);
      import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        const t = getActiveTool();
        if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
      }).catch(() => {});
    }
  });

  panel.querySelector('#png-queue-convert').addEventListener('click', () => {
    if (_queue.length < 1) return;
    const inp     = panel.querySelector('#png-queue-filename');
    const outName = (inp ? inp.value.trim() : '') || defaultName;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitConvert(outName);
  });
}

// ─── ADD FILES ────────────────────────────────────────────────────────────────

async function _addFiles(fileArray) {
  const pngFiles = fileArray.filter(_isPng);

  if (pngFiles.length < fileArray.length) {
    pushNotification({
      type: 'warning',
      message: 'Some files skipped — only .png files are accepted.',
    });
  }
  if (pngFiles.length === 0) return;

  // Deduplicate by name+size
  const key = (f) => `${f.name}::${f.size}`;
  const existing = new Set(_queue.map((i) => key(i.file)));
  const fresh = pngFiles.filter((f) => !existing.has(key(f)));
  if (fresh.length === 0) return;

  for (const file of fresh) {
    let thumbnail = null;
    try { thumbnail = await _readDataUri(file); } catch (_) {}
    _queue.push({ file, thumbnail });
  }

  _renderStrip();
  _renderPanel();
}

// ─── PUBLIC: FILE PICKED ─────────────────────────────────────────────────────

export async function handlePngFilesPicked(files, toolId) {
  _toolId = toolId;
  await _addFiles(Array.from(files));
}

// ─── SUBMIT ──────────────────────────────────────────────────────────────────

async function _submitConvert(outputFilename) {
  const tool = getActiveTool();
  if (!tool || _queue.length === 0) return;

  const queueSnapshot = _queue.slice();
  const toolId        = _toolId;
  const ext           = _EXT[toolId] || 'out';
  const route         = _ROUTE[toolId];
  const isMulti       = queueSnapshot.length > 1;
  const pdfModeCopy   = _pdfMode;
  const earlyExt      = (toolId === 'png-pdf' && isMulti && pdfModeCopy === 'single')
    ? 'pdf'
    : (isMulti ? 'zip' : ext);
  const earlyName     = `${outputFilename}.${earlyExt}`;
  const color         = tool.color || _FALLBACK_COLOR;

  // Teardown UI
  const zone = document.getElementById('drop-zone');
  zone?.querySelector('.dz-png-thumb-strip')?.remove();
  zone?.classList.remove('dz-has-png-thumbs');
  document.getElementById('png-queue-panel')?.remove();
  _queue   = [];
  _toolId  = '';
  _pdfMode = 'individual';

  if (zone) resetZoneContent(zone);

  const fd = new FormData();
  queueSnapshot.forEach((item) => fd.append('files', item.file));
  fd.append('output_filename', outputFilename);
  if (toolId === 'png-pdf') fd.append('pdf_mode', pdfModeCopy);

  showProgress(zone, 10, color, 'Converting…');
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/png/${route}/convert`, { method: 'POST', body: fd });
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
      const dlName = data.filename || earlyName;

      const onReset = () => {
        removePngPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };

      showDownload(zone, dlName, jobId, color, onReset);
      clearBgJob(true);
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (state === 'error') {
      showError(zone, error || 'Conversion failed. Please try again.');
      clearBgJob();
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?');
    clearBgJob();
  };
}
