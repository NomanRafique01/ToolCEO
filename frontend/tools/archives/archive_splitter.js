/**
 * frontend/tools/archives/archive_splitter.js
 *
 * Archive Splitter — split any archive into equal-size volume parts.
 *
 * UX is identical to archive_convert.js:
 *  1. File dropped → scan ring
 *  2. Thumb inside zone + pw-panel settings panel below hero-card
 *  3. Submit → progress ring → showDownload (SSE)
 *  4. Background job bar mirrors progress if the user navigates away
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../scripts/toolstate.js';
import { pushNotification } from '../../scripts/notificationStore.js';
import {
  showScanProgress,
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../shared/progress.js';
import { getArchiveFileIconSvg, getArchiveFormatLabel } from '../shared/archiveIcon.js';

const BACKEND = 'http://127.0.0.1:8000';

// CSS variable used for colour inheritance across all children of the wrap
const _CSS_VAR = '--split-color';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let _splitFile     = null;
let _splitBaseName = '';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const p = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** p)).toFixed(p ? 1 : 0)} ${units[p]}`;
}

function _cleanStem(filename) {
  let name = filename || 'archive';
  for (const ext of ['.tar.gz', '.tar.bz2', '.tar.xz', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.cab', '.iso', '.dmg']) {
    if (name.toLowerCase().endsWith(ext)) { name = name.slice(0, -ext.length); break; }
  }
  return name || 'archive';
}

// ─── PUBLIC TEARDOWN ──────────────────────────────────────────────────────────
export function removeArchiveSplitterPanel() {
  const panel = document.getElementById('arc-splitter-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-split-thumb-wrap')?.remove();
    zone.classList.remove('dz-has-split-thumb');
  }

  _splitFile = null;
  _splitBaseName = '';
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────
function _showThumb(zone, file, color) {
  zone.querySelector('.dz-split-thumb-wrap')?.remove();

  const format  = getArchiveFormatLabel(file.name);
  const iconSvg = getArchiveFileIconSvg(format, color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-split-thumb-wrap';
  wrap.style.setProperty(_CSS_VAR, color);

  wrap.innerHTML = `
    <div class="dz-split-thumb-card">
      <div class="dz-split-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${iconSvg}
      </div>
      <button class="dz-split-thumb-remove" title="Remove file" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-split-thumb-name">${_esc(file.name)}</span>
    <span class="dz-split-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-split-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-split-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeArchiveSplitterPanel();
    const z = document.getElementById('drop-zone');
    if (z) resetZoneContent(z);
    import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function _showSettingsPanel(fileSize, color) {
  document.getElementById('arc-splitter-settings-panel')?.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id        = 'arc-splitter-settings-panel';
  panel.className = 'pw-panel';
  panel.style.setProperty('--pw-color', color);

  const _ALL_SIZE_OPTIONS = [
    { mb: 1,    label: '1 MB' },
    { mb: 5,    label: '5 MB' },
    { mb: 10,   label: '10 MB' },
    { mb: 25,   label: '25 MB' },
    { mb: 50,   label: '50 MB' },
    { mb: 100,  label: '100 MB' },
    { mb: 250,  label: '250 MB' },
    { mb: 500,  label: '500 MB' },
    { mb: 700,  label: '700 MB (CD)' },
    { mb: 1024, label: '1 GB' },
    { mb: 2048, label: '2 GB' },
    { mb: 4096, label: '4 GB (FAT32 max)' },
  ];

  // Only show part sizes strictly smaller than the archive — splitting into
  // one part the same size as the archive makes no sense.
  const fileSizeMb = fileSize / (1024 * 1024);
  const sizeOptions = _ALL_SIZE_OPTIONS.filter((o) => o.mb < fileSizeMb);

  // If the archive is tiny (< 1 MB) still show 1 MB so the user sees something.
  if (sizeOptions.length === 0) sizeOptions.push(_ALL_SIZE_OPTIONS[0]);

  // Default: largest valid option that is ≤ half the file size (sensible split),
  // falling back to the largest available option.
  const halfMb = fileSizeMb / 2;
  const defaultMb = (sizeOptions.filter((o) => o.mb <= halfMb).pop()
    || sizeOptions[sizeOptions.length - 1]).mb;

  const selectHtml = sizeOptions.map((o) =>
    `<option value="${o.mb}"${o.mb === defaultMb ? ' selected' : ''}>${o.label}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="pw-header">
      <span class="pw-header-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 4h13v13M4 4h1M4 8h1M4 12h1M4 16h1M4 20h1M8 20H4M12 20H8M16 20h-4"
                stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
          <rect x="2" y="17" width="6" height="4" rx="1" stroke="${color}" stroke-width="1.4"/>
          <rect x="16" y="17" width="6" height="4" rx="1" stroke="${color}" stroke-width="1.4"/>
          <path d="M8 4v13" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <span class="pw-header-text"><strong>${_fmt(fileSize)}</strong></span>
      </span>
      <button class="pw-change-btn" id="asl-change-btn" title="Pick a different file">Change file</button>
    </div>
    <div class="pw-actions pw-actions--split">
      <div class="pw-split-group">
        <label class="pw-split-label" for="asl-part-size">Part size</label>
        <div class="pw-split-select-wrap">
          <select class="pw-split-select" id="asl-part-size" title="Select split part size">${selectHtml}</select>
          <svg class="pw-select-arrow" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <input class="pw-filename-input" id="asl-filename-input"
             type="text" placeholder="Output name (optional)"
             maxlength="120" spellcheck="false"
             value="${_esc(_splitBaseName)}"/>
      <button class="pw-submit-btn" id="asl-submit-btn">Split Archive</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('pw-panel--visible'));

  panel.querySelector('#asl-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeArchiveSplitterPanel();
    const zone = document.getElementById('drop-zone');
    if (zone) resetZoneContent(zone);
    if (tool) {
      import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  const _capturedFile     = _splitFile;
  const _capturedBaseName = _splitBaseName;

  panel.querySelector('#asl-submit-btn').addEventListener('click', () => {
    const fileToSplit = _splitFile || _capturedFile;
    if (!fileToSplit) return;
    const nameEl   = panel.querySelector('#asl-filename-input');
    const sizeEl   = panel.querySelector('#asl-part-size');
    const outName  = (nameEl ? nameEl.value.trim() : '') || _splitBaseName || _capturedBaseName;
    const partSize = sizeEl ? parseInt(sizeEl.value, 10) : 10;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitSplit(fileToSplit, outName, partSize);
  });
}

// ─── PUBLIC FILE HANDLER ──────────────────────────────────────────────────────
export async function handleArchiveSplitterFilePicked(file) {
  if (!file) return;

  const ARCHIVE_EXTS = [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.cab',
    '.iso', '.dmg', '.wim', '.tar.gz', '.tar.bz2', '.tar.xz',
  ];
  const lname = file.name.toLowerCase();
  if (!ARCHIVE_EXTS.some((e) => lname.endsWith(e))) {
    pushNotification({ type: 'warning', message: 'Invalid File Format. Please select a valid archive file.' });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#00E5C0') : '#00E5C0';
  const zone  = document.getElementById('drop-zone');

  removeArchiveSplitterPanel();

  _splitFile     = file;
  _splitBaseName = _cleanStem(file.name);

  showScanProgress(zone, color, 'archive-split');
  await new Promise((r) => setTimeout(r, 380));

  resetZoneContent(zone);
  _showThumb(zone, file, color);
  _showSettingsPanel(file.size, color);
}

// ─── SUBMIT SPLIT ─────────────────────────────────────────────────────────────
async function _submitSplit(file, outputName, partSizeMb) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#00E5C0';

  const earlyName = `${outputName || _splitBaseName}_parts.zip`;

  // Remove thumb + panel
  document.getElementById('arc-splitter-settings-panel')?.remove();
  zone?.querySelector('.dz-split-thumb-wrap')?.remove();
  zone?.classList.remove('dz-has-split-thumb');
  _splitFile = null; _splitBaseName = '';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('part_size_mb', String(partSizeMb));
  fd.append('output_filename', outputName);

  showProgress(zone, 10, color, 'Splitting…', tool.id);
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/archives/split`, { method: 'POST', body: fd });
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
    showError(zone, `Upload failed: ${err.message}`, tool.id);
    clearBgJob();
    return;
  }

  const sse    = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct  = 0;
  setBgJob({ jobId, tool, filename: earlyName, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const rawPct = typeof data.progress === 'number' ? data.progress : lastPct;
    const pct    = Math.max(lastPct, rawPct);
    lastPct = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state    = data.state === 'done' ? 'done' : (data.state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (data.state === 'running' || data.state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color, tool.id);
      return;
    }

    sse.close();

    if (data.state === 'done') {
      updateProgress(zone, 100, color, tool.id);
      removeArchiveSplitterPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeArchiveSplitterPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
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

    if (data.state === 'error') {
      showError(zone, data.error || 'Split failed. Please try again.', tool.id);
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
  };
}
