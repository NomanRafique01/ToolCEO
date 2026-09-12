import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../scripts/toolstate.js';
import { pushNotification } from '../../scripts/notificationStore.js';
import { showScanProgress, showProgress, updateProgress, resetZoneContent, showDownload, showError } from '../shared/progress.js';
import { loadPdfDocument, renderPdfPageToDataUri } from '../shared/pdfRenderer.js';
import { getArchiveFileIconSvg, getArchiveFolderIconSvg, getArchiveFormatLabel } from '../shared/archiveIcon.js';

const BACKEND = 'http://127.0.0.1:8000';
const ARCHIVE_IDS = new Set([
  'archive-files-zip', 'archive-files-tar', 'archive-files-tar-gz', 'archive-files-tar-bz2',
  'archive-files-7z', 'archive-folder-zip', 'archive-folder-7z',
  'archive-files-rar', 'archive-files-tar-xz',
  'archive-files-wim',
]);
const FORMAT_BY_ID = {
  'archive-files-zip':     'zip',
  'archive-files-tar':     'tar',
  'archive-files-tar-gz':  'tar.gz',
  'archive-files-tar-bz2': 'tar.bz2',
  'archive-files-7z':      '7z',
  'archive-folder-zip':    'zip',
  'archive-folder-7z':     '7z',
  'archive-files-rar':     'rar',
  'archive-files-tar-xz':  'tar.xz',
  'archive-files-wim':     'wim',
};

// ─── FILE-TYPE SETS FOR THUMBNAIL ROUTING ────────────────────────────────────

const _PDF_EXT      = new Set(['.pdf']);
const _IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.svg', '.ico']);
const _EBOOK_EXTS   = new Set(['.epub', '.mobi', '.azw3', '.fb2', '.rtf', '.txt']);
const _ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.cab', '.iso', '.dmg', '.lz', '.lzma', '.zst', '.pkg', '.deb', '.rpm']);

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

/**
 * Each item: { file: File, thumbnail: string|null, objUrl: string|null }
 * thumbnail  = data-URI (PDF / image) or null (ebook badge / generic badge)
 * objUrl     = blob: URL for images (must be revoked on removal)
 */
let _queue = [];
let _jobId = null;
let _cancelRequested = false;

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatBytes(value) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
}

function filePath(file) {
  return file.webkitRelativePath || file.name;
}

function _ext(filename) {
  const dot = (filename || '').lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function _archiveLabel(filename) {
  return getArchiveFormatLabel(filename);
}

// ─── THUMBNAIL RESOLVER ────────────────────────────────────────────────────────

/**
 * Returns { thumbnail: string|null, objUrl: string|null }
 * - PDF files  → data-URI of page 1 via PDF.js (offline)
 * - Image files → blob: URL (for zero-copy display; caller must revoke later)
 * - Everything else → { thumbnail: null, objUrl: null } → use badge icon
 */
async function _resolveThumbnail(file) {
  const ext = _ext(file.name);

  // ── PDF ──────────────────────────────────────────────────────────────────
  if (_PDF_EXT.has(ext)) {
    try {
      const pdfDoc   = await loadPdfDocument(file);
      const page1    = await pdfDoc.getPage(1);
      const viewport = page1.getViewport({ scale: 1.0 });
      const scale    = Math.min(0.5, 450 / Math.max(viewport.width, viewport.height, 1));
      const dataUri  = await renderPdfPageToDataUri(page1, scale);
      return { thumbnail: dataUri, objUrl: null };
    } catch (_) {
      return { thumbnail: null, objUrl: null };
    }
  }

  // ── Image ─────────────────────────────────────────────────────────────────
  if (_IMAGE_EXTS.has(ext)) {
    const objUrl = URL.createObjectURL(file);
    return { thumbnail: objUrl, objUrl };   // thumbnail IS the blob URL here
  }

  // ── Ebook / other → no visual thumbnail, fall back to badge icon ──────────
  return { thumbnail: null, objUrl: null };
}

// ─── THUMBNAIL CARD CONTENT ────────────────────────────────────────────────────

function _pageThumbSvg(label, color) {
  return `<svg class="archive-ebook-icon-svg" viewBox="0 0 76 92" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0" y="0" width="76" height="92" rx="5" fill="#ffffff"/>
    <polygon points="58,0 76,18 58,18" fill="#e2e2e2"/>
    <polyline points="58,0 58,18 76,18" fill="none" stroke="#cccccc" stroke-width="1"/>
    <rect x="0" y="32" width="76" height="22" fill="${color}"/>
    <text x="38" y="47" font-family="Arial,sans-serif" font-size="11" font-weight="700"
          fill="#081918" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>
    <line x1="10" y1="62" x2="66" y2="62" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity="0.45"/>
    <line x1="10" y1="70" x2="66" y2="70" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
    <line x1="10" y1="78" x2="44" y2="78" stroke="${color}" stroke-width="1.5" stroke-linecap="round" opacity="0.2"/>
  </svg>`;
}

/**
 * Returns the inner HTML of the icon/thumbnail area for a queue item.
 * Static after first render — no lazy-loads, no listeners.
 */
function _thumbHTML(item, color) {
  const ext = _ext(item.file.name);
  const isFolder = item.file.webkitRelativePath && item.file.webkitRelativePath.includes('/');

  // Directory pickers return each file with its relative path; show the folder
  // family thumbnail instead of a document badge for those entries.
  if (isFolder) {
    return `<div class="archive-file-icon archive-file-icon--folder" style="--archive-color:${color}">
      ${getArchiveFolderIconSvg(color)}
    </div>`;
  }

  // PDF or image — show rendered thumbnail
  if (item.thumbnail) {
    return `<div class="archive-file-icon archive-file-icon--thumb" style="--archive-color:${color}">
      <img class="archive-thumb-img" src="${esc(item.thumbnail)}"
           alt="${esc(item.file.name)}" draggable="false" />
    </div>`;
  }

  // Ebook — coloured badge with ebook-style SVG fallback icon
  if (_EBOOK_EXTS.has(ext)) {
    const label = ext.replace('.', '').toUpperCase().slice(0, 5);
    return `<div class="archive-file-icon archive-file-icon--ebook" style="--archive-color:${color}">
      ${_pageThumbSvg(label, color)}
    </div>`;
  }

  // Archive (ZIP, RAR, 7Z, TAR, GZ …) — distinctive zipper file icon
  if (_ARCHIVE_EXTS.has(ext)) {
    const label = _archiveLabel(item.file.name);
    return `<div class="archive-file-icon archive-file-icon--archive" style="--archive-color:${color}">
      ${getArchiveFileIconSvg(label, color)}
    </div>`;
  }

  // Generic formats use the same white folded-page thumbnail as ebooks.
  const badgeLabel = (item.file.name.split('.').pop() || 'FILE').slice(0, 5).toUpperCase();
  return `<div class="archive-file-icon archive-file-icon--ebook" style="--archive-color:${color}">
    ${_pageThumbSvg(badgeLabel, color)}
  </div>`;
}

// ─── RENDER STRIP ─────────────────────────────────────────────────────────────

function renderQueue() {
  const zone = document.getElementById('drop-zone');
  if (!zone || !_queue.length) return;

  const tool  = getActiveTool();
  const color = tool?.color || '#84CC16';

  zone.classList.add('dz-has-archive-thumbs');
  let strip = zone.querySelector('.dz-archive-thumb-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'dz-archive-thumb-strip';
    zone.appendChild(strip);
  }
  strip.style.setProperty('--archive-color', color);

  strip.innerHTML = _queue.map((item, index) => `
    <div class="dz-archive-card" draggable="true" data-index="${index}" style="--archive-color:${color}">
      <span class="dz-archive-ordinal">${index + 1}</span>
      ${_thumbHTML(item, color)}
      <span class="dz-archive-card-name" title="${esc(filePath(item.file))}">${esc(item.file.name)}</span>
      <span class="dz-archive-card-size">${formatBytes(item.file.size)}</span>
      <button type="button" class="dz-archive-card-remove" data-remove="${index}"
              title="Remove file" aria-label="Remove ${esc(item.file.name)}">×</button>
    </div>`).join('') + `
    <button type="button" class="dz-archive-add-btn" title="Add more files" style="--archive-color:${color}">
      <span aria-hidden="true">+</span><span>Add files</span>
    </button>`;

  // ── Wire Add button ─────────────────────────────────────────────────────
  strip.querySelector('.dz-archive-add-btn').addEventListener('click', (event) => {
    event.stopPropagation();
    openPicker();
  });

  // ── Wire Remove buttons ─────────────────────────────────────────────────
  strip.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const idx = Number(button.dataset.remove);
      // Revoke object URL if this item had one (images)
      if (_queue[idx]?.objUrl) {
        URL.revokeObjectURL(_queue[idx].objUrl);
      }
      _queue.splice(idx, 1);
      renderQueue();
      renderPanel();
    });
  });

  // ── Drag-to-reorder ─────────────────────────────────────────────────────
  let dragged = -1;
  strip.querySelectorAll('.dz-archive-card').forEach((card) => {
    card.addEventListener('dragstart', () => {
      dragged = Number(card.dataset.index);
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend',   () => card.classList.remove('is-dragging'));
    card.addEventListener('dragover',  (e) => e.preventDefault());
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = Number(card.dataset.index);
      if (dragged >= 0 && dragged !== target) {
        const [item] = _queue.splice(dragged, 1);
        _queue.splice(target, 0, item);
        renderQueue();
        renderPanel();
      }
    });
  });
}

// ─── RENDER PANEL ─────────────────────────────────────────────────────────────

function renderPanel() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  let panel = document.getElementById('archive-create-panel');
  if (!_queue.length) {
    panel?.remove();
    zone.classList.remove('dz-has-archive-thumbs');
    zone.querySelector('.dz-archive-thumb-strip')?.remove();
    return;
  }

  const tool   = getActiveTool();
  const color  = tool?.color || '#84CC16';
  const format = FORMAT_BY_ID[tool?.id] || 'zip';

  // Derive a suggested stem from the first file's name (strip its extension).
  const firstFileName = _queue[0]?.file?.name || 'archive';
  const firstStem = firstFileName.includes('.')
    ? firstFileName.slice(0, firstFileName.lastIndexOf('.'))
    : firstFileName;
  const suggested = `${firstStem}.${format}`;

  // Preserve any value the user has already typed; only inject the suggestion
  // on the very first render (before the panel element exists).
  const isNewPanel = !panel;

  if (isNewPanel) {
    panel = document.createElement('section');
    panel.id        = 'archive-create-panel';
    panel.className = 'archive-create-panel';
    zone.parentElement?.appendChild(panel);
  }

  // Snapshot the current input value before innerHTML wipes it.
  const existingValue = !isNewPanel
    ? (document.getElementById('archive-output-name')?.value ?? suggested)
    : suggested;

  // Expose tool color so the button picks it up via CSS var
  panel.style.setProperty('--archive-create-color', color);

  panel.innerHTML = `
    <div class="archive-create-header">
      <div class="archive-create-summary">
        <strong>${_queue.length} ${_queue.length === 1 ? 'file' : 'files'}</strong>
        <span>${formatBytes(_queue.reduce((sum, item) => sum + item.file.size, 0))}</span>
      </div>
      <span class="archive-output-label">Output filename</span>
    </div>
    <div class="archive-create-actions">
      <input id="archive-output-name" class="archive-output-input"
             value="${esc(existingValue)}" maxlength="180" />
      <button type="button" class="archive-create-button"
              style="--archive-create-color:${color}">
        Create ${format.toUpperCase()} archive
      </button>
    </div>`;

  panel.querySelector('.archive-create-button').addEventListener('click', submit);
}

// ─── FILE PICKER ──────────────────────────────────────────────────────────────

function openPicker() {
  const input = document.getElementById('file-input');
  const tool  = getActiveTool();
  if (!input || !tool) return;
  input.multiple          = true;
  input.accept            = '*/*';
  input.webkitdirectory   = tool.id.startsWith('archive-folder-');
  input.click();
}

// ─── PUBLIC TEARDOWN ──────────────────────────────────────────────────────────

export function removeArchiveCreatePanel() {
  // Revoke all cached blob URLs to avoid memory leaks
  _queue.forEach((item) => { if (item.objUrl) URL.revokeObjectURL(item.objUrl); });
  _queue = [];
  _jobId = null;

  document.getElementById('archive-create-panel')?.remove();
  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-archive-thumb-strip')?.remove();
    zone.classList.remove('dz-has-archive-thumbs');
  }
}

// ─── PUBLIC PREDICATES ────────────────────────────────────────────────────────

export function isArchiveCreateTool(toolId) {
  return ARCHIVE_IDS.has(toolId);
}

// ─── PUBLIC FILE HANDLER ──────────────────────────────────────────────────────

/**
 * Called by dropzone.js when files are dropped / picked while an archive-create
 * tool is active.  Shows a scanning animation, resolves thumbnails for each
 * file concurrently (batches of 4), then renders the static thumbnail strip.
 */
export async function handleArchiveFilesPicked(files) {
  const tool  = getActiveTool();
  if (!tool || !isArchiveCreateTool(tool.id)) return;

  const color = tool.color || '#84CC16';
  const zone  = document.getElementById('drop-zone');

  // Deduplicate incoming files against what's already in the queue
  const incoming = Array.from(files);
  const existing = new Set(_queue.map((item) => filePath(item.file)));
  const newFiles = incoming.filter((f) => !existing.has(filePath(f)));
  if (!newFiles.length) return;

  const isFirstBatch = _queue.length === 0;

  // ── Show scanning ring only for the very first batch ───────────────────────
  if (isFirstBatch) {
    showScanProgress(zone, color, `Scanning ${newFiles.length} file${newFiles.length !== 1 ? 's' : ''}…`);
  }

  // ── Resolve thumbnails concurrently in batches of 4 ────────────────────────
  const BATCH_SIZE = 4;
  let processed = 0;

  for (let i = 0; i < newFiles.length; i += BATCH_SIZE) {
    const chunk = newFiles.slice(i, i + BATCH_SIZE);

    // Update label inside the ring (if it exists — first batch only)
    if (isFirstBatch) {
      const label = zone?.querySelector('.dz-progress-label');
      if (label) label.textContent = `Scanning ${processed} of ${newFiles.length}…`;
    }

    await Promise.all(chunk.map(async (file) => {
      let thumbnail = null;
      let objUrl    = null;
      try {
        const result = await _resolveThumbnail(file);
        thumbnail = result.thumbnail;
        objUrl    = result.objUrl;
      } catch (_) { /* non-critical — fall back to badge icon */ }

      _queue.push({ file, thumbnail, objUrl });
    }));

    processed += chunk.length;

    // Yield a paint frame so the spin animation stays smooth
    await new Promise((r) => setTimeout(r, 0));
  }

  // ── Remove scan overlay (first batch only), then render the static strip ───
  if (isFirstBatch) {
    resetZoneContent(zone);
  }

  renderQueue();
  renderPanel();
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function submit() {
  const tool = getActiveTool();
  const zone = document.getElementById('drop-zone');
  if (!tool || !zone || !_queue.length) return;

  _cancelRequested = false;

  // Keep conversion progress visible when the create panel is lower on the page.
  document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });

  const format     = FORMAT_BY_ID[tool.id];
  const outputName = document.getElementById('archive-output-name')?.value.trim() || `archive.${format}`;
  const earlyName  = outputName.toLowerCase().endsWith(`.${format}`) ? outputName : `${outputName}.${format}`;

  // Tear down the strip and panel before showing the progress ring
  zone.querySelector('.dz-archive-thumb-strip')?.remove();
  zone.classList.remove('dz-has-archive-thumbs');
  document.getElementById('archive-create-panel')?.remove();

  const form = new FormData();
  _queue.forEach((item) => form.append('files', item.file, item.file.name));
  form.append('archive_format',  format);
  form.append('output_filename', outputName);
  form.append('relative_paths',  JSON.stringify(_queue.map((item) => filePath(item.file))));

  showProgress(zone, 5, tool.color, 'Creating…', tool.id);
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  try {
    const response = await fetch(`${BACKEND}/api/archives/create`, { method: 'POST', body: form });
    const body     = await response.json();
    if (!response.ok) throw new Error(body.detail || `Server error ${response.status}`);
    if (_cancelRequested) {
      fetch(`${BACKEND}/api/archives/cancel/${body.job_id}`, { method: 'POST' }).catch(() => {});
      return;
    }
    _jobId = body.job_id;
  } catch (error) {
    if (_cancelRequested) return;
    clearBgJob();
    showError(zone, `Upload failed: ${error.message}`, tool.id);
    return;
  }

  const stream = new EventSource(`${BACKEND}/api/progress/${_jobId}`);
  setBgJob({ jobId: _jobId, tool, filename: earlyName, progress: 10, state: 'running', sse: stream });

  stream.onmessage = (event) => {
    if (_cancelRequested) {
      stream.close();
      return;
    }

    let data;
    try { data = JSON.parse(event.data); } catch (_) { return; }

    const job = getBgJob(_jobId);
    if (job) {
      job.progress = data.progress || job.progress;
      job.state    = data.state === 'done' ? 'done' : data.state === 'error' ? 'error' : 'running';
      if (data.filename) job.filename = data.filename;
      syncBgJobBar();
    }

    if (data.state === 'running' || data.state === 'pending') {
      updateProgress(zone, Math.max(5, Math.min(95, data.progress || 5)), tool.color, tool.id);
      return;
    }

    stream.close();

    if (data.state === 'done') {
      setTimeout(() => showDownload(zone, data.filename || earlyName, _jobId, tool.color, removeArchiveCreatePanel, tool.id), 150);
    } else {
      showError(zone, data.error || 'Archive creation failed.', tool.id);
    }
  };

  stream.onerror = () => {
    stream.close();
    if (_cancelRequested) return;
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
  };
}

// ─── CANCEL LISTENER ──────────────────────────────────────────────────────────

document.addEventListener('progress-cancelled', () => {
  if (!_jobId) return;                        // not our job — skip
  _cancelRequested = true;
  fetch(`${BACKEND}/api/archives/cancel/${_jobId}`, { method: 'POST' }).catch(() => {});
  _jobId = null;
  removeArchiveCreatePanel();
  pushNotification({ type: 'info', message: 'Archive creation cancelled.' });
});
