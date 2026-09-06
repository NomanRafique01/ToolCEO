/**
 * tools/images/image_compressor/image_compressor.js
 *
 * Multi-image compressor with thumbnail strip (like JPG tools).
 *
 * Flow:
 *   1. Tool selected → support text only below drop zone
 *   2. Files dropped → thumb strip in drop zone + settings panel (levels + Convert)
 *   3. Convert clicked → panel + thumbs cleared, progress → download
 *
 * Exports:
 *   initImageCompressorUI()
 *   handleImageCompressorFilesPicked(files)
 *   removeImageCompressorPanel()
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../scripts/toolstate.js';
import { pushNotification } from '../../../scripts/notificationStore.js';
import {
  showProgress,
  showScanProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../../shared/progress.js';

const BACKEND = 'http://127.0.0.1:8000';

const _COLOR = '#F472B6';
const _BG    = 'rgba(244,114,182,0.15)';

const _SUPPORT_TEXT =
  'Supports offline image compression for JPG • PNG • WEBP • AVIF • SVG • BMP • TIFF • GIF • ICO • HEIC/HEIF';

const _ACCEPT =
  'image/*,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.dib,.tiff,.tif,.ico,.heic,.heif,.svg';

const _LEVELS = [
  { id: 'maximum', label: 'Maximum', title: 'Compress as much as possible matching online tools (TinyPNG / Squoosh)' },
  { id: 'high',    label: 'High (80%)',    title: 'High quality with significant size reduction (Recommended)' },
  { id: 'medium',  label: 'Medium (50%)',  title: 'Balanced compression for high-res screens' },
  { id: 'low',     label: 'Low (Original Resolution)',   title: 'Keep 100% full original dimensions, light compression' },
];

const _EXT_MAP = {
  jpg: 'JPG', jpeg: 'JPG', png: 'PNG', webp: 'WEBP',
  avif: 'AVIF', gif: 'GIF', bmp: 'BMP', dib: 'BMP',
  tiff: 'TIFF', tif: 'TIFF', ico: 'ICO', heic: 'HEIC', heif: 'HEIF',
  svg: 'SVG',
};

/** @type {{ file: File, format: string, thumbnail: string|null }[]} */
let _queue = [];
let _level   = 'maximum';

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmtBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function _readDataUri(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

async function _detectFormat(file) {
  const fname = (file.name || '').toLowerCase();
  if (fname.endsWith('.svg') || file.type === 'image/svg+xml') return 'SVG';
  try {
    const buf = await file.slice(0, 12).arrayBuffer();
    const b   = new Uint8Array(buf);
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'JPG';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'PNG';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'WEBP';
    if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = String.fromCharCode(...b.slice(8, 12)).toLowerCase();
      if (brand === 'avif' || brand === 'avis') return 'AVIF';
      if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx' || brand === 'mif1' || brand === 'msf1') return 'HEIC';
    }
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'GIF';
    if (b[0] === 0x42 && b[1] === 0x4D) return 'BMP';
    if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4D && b[1] === 0x4D)) return 'TIFF';
    if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'ICO';
  } catch (_) { /* fall through */ }
  const ext = fname.split('.').pop().toLowerCase();
  return _EXT_MAP[ext] || ext.toUpperCase() || '?';
}

function _isAccepted(file) {
  const ext = (file.name || '').split('.').pop().toLowerCase();
  if (_EXT_MAP[ext]) return true;
  return /^image\//i.test(file.type || '');
}

function _outputExtForFormat(format) {
  const fmt = String(format || '').toLowerCase();
  if (fmt === 'jpeg') return 'jpg';
  if (fmt === 'tif') return 'tiff';
  if (fmt === 'heif') return 'heic';
  if (fmt === 'dib') return 'bmp';
  return fmt || 'png';
}

// ─── PUBLIC: TEARDOWN ────────────────────────────────────────────────────────

export function removeImageCompressorPanel() {
  document.getElementById('imgcmp-panel')?.remove();
  document.getElementById('imgcmp-support-text')?.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-imgcmp-thumb-strip')?.remove();
    zone.classList.remove('dz-has-imgcmp-thumbs');
  }

  _queue = [];
  _level = 'maximum';
}

// ─── PUBLIC: INIT ON TOOL SELECT ─────────────────────────────────────────────

export function initImageCompressorUI() {
  removeImageCompressorPanel();
  _renderSupportText();
}

function _renderSupportText() {
  document.getElementById('imgcmp-support-text')?.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || _COLOR) : _COLOR;

  const el = document.createElement('p');
  el.id        = 'imgcmp-support-text';
  el.className = 'imgcmp-support-text';
  el.style.setProperty('--imgcmp-color', color);
  el.textContent = _SUPPORT_TEXT;
  heroCard.appendChild(el);
}

// ─── THUMBNAIL STRIP ─────────────────────────────────────────────────────────

function _renderStrip() {
  const zone  = document.getElementById('drop-zone');
  if (!zone) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || _COLOR) : _COLOR;

  zone.querySelector('.dz-imgcmp-thumb-strip')?.remove();

  if (_queue.length === 0) {
    zone.classList.remove('dz-has-imgcmp-thumbs');
    return;
  }

  zone.classList.add('dz-has-imgcmp-thumbs');

  const strip = document.createElement('div');
  strip.className = 'dz-imgcmp-thumb-strip';

  _queue.forEach((item, idx) => {
    strip.appendChild(_buildThumbCard(item, idx, color));
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'dz-imgcmp-add-btn';
  addBtn.type      = 'button';
  addBtn.title     = 'Add more images';
  addBtn.style.setProperty('--imgcmp-color', color);
  addBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span>Add image</span>`;
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _openFilePicker();
  });
  strip.appendChild(addBtn);

  zone.appendChild(strip);
}

function _buildThumbCard(item, idx, color) {
  const card = document.createElement('div');
  card.className   = 'dz-imgcmp-card';
  card.dataset.idx = String(idx);
  card.style.setProperty('--imgcmp-color', color);

  const shortName = item.file.name.length > 18
    ? item.file.name.slice(0, 15) + '…'
    : item.file.name;

  const thumbContent = item.thumbnail
    ? `<img class="dz-imgcmp-thumb-img" src="${item.thumbnail}"
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
    <div class="dz-imgcmp-thumb-frame">
      ${thumbContent}
      <span class="dz-imgcmp-format-badge">${_esc(item.format)}</span>
    </div>
    <span class="dz-imgcmp-card-name" title="${_esc(item.file.name)}">${_esc(shortName)}</span>
    <span class="dz-imgcmp-card-size">${_fmtBytes(item.file.size)}</span>
    <button class="dz-imgcmp-card-remove" type="button"
            aria-label="Remove ${_esc(item.file.name)}">&#x2715;</button>`;

  card.querySelector('.dz-imgcmp-card-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    _queue.splice(idx, 1);
    _renderStrip();
    _renderPanel();
    if (_queue.length === 0) _renderSupportText();
  });

  return card;
}

// ─── FILE PICKER ─────────────────────────────────────────────────────────────

function _openFilePicker() {
  let inp  = document.getElementById('file-input');
  let temp = false;
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    temp = true;
  }
  inp.multiple = true;
  inp.accept   = _ACCEPT;

  inp.onchange = async () => {
    if (inp.files && inp.files.length > 0) {
      await _addFiles(Array.from(inp.files));
    }
    inp.value = '';
    inp.multiple = false;
    inp.accept   = '';
    if (temp) inp.remove();
  };

  inp.click();
}

// ─── SETTINGS PANEL (only when files loaded) ─────────────────────────────────

function _renderPanel() {
  document.getElementById('imgcmp-panel')?.remove();

  if (_queue.length < 1) return;

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || _COLOR) : _COLOR;
  const total = _queue.length;
  const isMulti = total > 1;

  const outHint = isMulti
    ? `${total} images → packed in a <strong>.zip</strong>`
    : `1 image → compressed <strong>.${_outputExtForFormat(_queue[0].format)}</strong> file`;

  const levelBtns = _LEVELS.map((lv) => `
    <button class="imgcmp-level-btn${_level === lv.id ? ' imgcmp-level-btn--active' : ''}"
            data-level="${lv.id}" type="button" title="${_esc(lv.title)}">
      ${_esc(lv.label)}
    </button>`).join('');

  const panel = document.createElement('div');
  panel.id        = 'imgcmp-panel';
  panel.className = 'imgcmp-panel';
  panel.style.setProperty('--imgcmp-color', color);

  panel.innerHTML = `
    <div class="imgcmp-panel-header">
      <span class="imgcmp-panel-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="14" height="12" rx="2" stroke="${color}" stroke-width="1.3"/>
          <circle cx="5.5" cy="6" r="1.3" stroke="${color}" stroke-width="1.1"/>
          <path d="M1 12l4-4 3 3 2-2 5 4" stroke="${color}" stroke-width="1.2"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="imgcmp-panel-badge-text">
          <strong>${total}</strong> image${total !== 1 ? 's' : ''} &nbsp;·&nbsp; ${outHint}
        </span>
      </span>
      <button class="imgcmp-clear-btn" id="imgcmp-clear-btn" type="button">Clear all</button>
    </div>

    <div class="imgcmp-level-row">
      <span class="imgcmp-level-label">Compression Level</span>
      <div class="imgcmp-level-toggle">${levelBtns}</div>
    </div>

    <div class="imgcmp-actions">
      <button class="imgcmp-convert-btn" id="imgcmp-convert-btn" type="button">Convert</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('imgcmp-panel--visible'));

  panel.querySelectorAll('.imgcmp-level-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _level = btn.dataset.level;
      panel.querySelectorAll('.imgcmp-level-btn').forEach((b) =>
        b.classList.toggle('imgcmp-level-btn--active', b.dataset.level === _level)
      );
    });
  });

  panel.querySelector('#imgcmp-clear-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    _queue = [];
    _renderStrip();
    _renderPanel();
    _renderSupportText();
  });

  panel.querySelector('#imgcmp-convert-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_queue.length < 1) return;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitCompress();
  });

  panel.addEventListener('click', (e) => e.stopPropagation());
}


// ─── ADD FILES ───────────────────────────────────────────────────────────────

async function _addFiles(fileArray) {
  const accepted = fileArray.filter(_isAccepted);

  if (accepted.length < fileArray.length) {
    pushNotification({
      type: 'warning',
      message: 'Some files skipped — unsupported format.',
      detail: 'Accepted: any browser-recognized image plus JPG, PNG, WEBP, AVIF, BMP, TIFF, GIF, ICO, HEIC, and HEIF.',
    });
  }
  if (accepted.length === 0) return;

  const key = (f) => `${f.name}::${f.size}`;
  const existing = new Set(_queue.map((i) => key(i.file)));
  const fresh = accepted.filter((f) => !existing.has(key(f)));
  if (fresh.length === 0) return;

  const zone = document.getElementById('drop-zone');
  const tool  = getActiveTool();
  const color = tool ? (tool.color || _COLOR) : _COLOR;

  // Only show scan ring on first load (queue was empty before this batch).
  const isFirstBatch = _queue.length === 0;
  if (isFirstBatch) {
    showScanProgress(zone, color, `Loading ${fresh.length} image${fresh.length !== 1 ? 's' : ''}…`);
  }

  // Process in concurrent batches of 6 to avoid blocking the main thread.
  const BATCH_SIZE = 6;
  let processed = 0;
  for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
    const chunk = fresh.slice(i, i + BATCH_SIZE);

    // Only update the label text — do NOT touch stroke-dashoffset via updateProgress()
    // because that fights the CSS @keyframes spin animation and causes it to stutter.
    if (isFirstBatch) {
      const label = zone ? zone.querySelector('.dz-progress-label') : null;
      if (label) label.textContent = `Loading ${processed} of ${fresh.length}…`;
    }

    await Promise.all(chunk.map(async (file) => {
      const format = await _detectFormat(file);
      let thumbnail = null;
      try { thumbnail = await _readDataUri(file); } catch (_) {}
      _queue.push({ file, format, thumbnail });
    }));

    processed += chunk.length;

    // Yield a paint frame between batches so the browser can keep the spin animation smooth.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Remove the scan ring once all images are loaded.
  if (isFirstBatch) {
    resetZoneContent(zone);
  }

  _renderStrip();
  _renderPanel();
}


// ─── PUBLIC: FILES PICKED ─────────────────────────────────────────────────────

export async function handleImageCompressorFilesPicked(files) {
  await _addFiles(Array.from(files));
}

// ─── SUBMIT ──────────────────────────────────────────────────────────────────

async function _submitCompress() {
  const tool = getActiveTool();
  if (!tool || _queue.length === 0) return;

  const queueSnapshot = _queue.slice();
  const levelCopy     = _level;
  const isMulti       = queueSnapshot.length > 1;
  const color         = tool.color || _COLOR;

  const firstStem = queueSnapshot[0].file.name.replace(/\.[^.]+$/, '');
  const outExt    = _outputExtForFormat(queueSnapshot[0].format);
  const earlyName = isMulti
    ? 'compressed_images.zip'
    : `${firstStem}_compressed.${outExt}`;

  const zone = document.getElementById('drop-zone');

  // Clear compressor UI immediately on Convert
  removeImageCompressorPanel();
  if (zone) resetZoneContent(zone);

  const fd = new FormData();
  queueSnapshot.forEach((item) => fd.append('files', item.file));
  fd.append('compression_level', levelCopy);

  showProgress(zone, 10, color, 'Compressing…');
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/images/compress/convert`, { method: 'POST', body: fd });
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
    _queue = queueSnapshot;
    _level = levelCopy;
    _renderStrip();
    _renderPanel();
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
      const dlName = data.filename || earlyName;

      const onReset = () => {
        removeImageCompressorPanel();
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
      showError(zone, error || 'Compression failed. Please try again.');
      clearBgJob();
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?');
    clearBgJob();
  };
}
