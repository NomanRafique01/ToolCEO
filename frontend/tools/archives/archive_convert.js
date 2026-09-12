/**
 * tools/archives/archive_convert.js
 *
 * Shared base for all archive-to-archive conversion tools.
 * Handles: ZIP↔7Z↔TAR↔TAR.GZ↔RAR and RAR→ZIP/7Z/TAR/TAR.GZ
 *
 * Tool IDs follow the pattern:  arc-<src>-to-<dst>
 * e.g.  arc-zip-to-7z,  arc-rar-to-zip,  arc-tar-gz-to-7z
 *
 * Backend routes:  POST /api/archives/convert/<src>-to-<dst>
 * e.g.  /api/archives/convert/zip-to-7z
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

// ─── CSS VARIABLE NAME ────────────────────────────────────────────────────────
const _CSS_VAR = '--arc-conv-color';

// ─── ALL KNOWN TOOL IDs ───────────────────────────────────────────────────────
export const ARCHIVE_CONVERT_IDS = new Set([
  // ZIP group
  'arc-zip-to-7z', 'arc-zip-to-tar', 'arc-zip-to-tar-gz', 'arc-zip-to-rar',
  // TAR group
  'arc-tar-to-zip', 'arc-tar-to-7z', 'arc-tar-to-gz', 'arc-tar-to-rar',
  // 7Z group
  'arc-7z-to-zip', 'arc-7z-to-tar', 'arc-7z-to-tar-gz', 'arc-7z-to-rar',
  // TAR.GZ group
  'arc-tar-gz-to-zip', 'arc-tar-gz-to-7z', 'arc-tar-gz-to-tar', 'arc-tar-gz-to-rar',
  // RAR group
  'arc-rar-to-zip', 'arc-rar-to-7z', 'arc-rar-to-tar', 'arc-rar-to-tar-gz',
]);

// ─── TOOL-ID → SOURCE EXTENSION (for file validation) ────────────────────────
const _SRC_EXT = {
  'arc-zip-to-7z':    '.zip',
  'arc-zip-to-tar':   '.zip',
  'arc-zip-to-tar-gz':'.zip',
  'arc-zip-to-rar':   '.zip',
  'arc-tar-to-zip':   '.tar',
  'arc-tar-to-7z':    '.tar',
  'arc-tar-to-gz':    '.tar',
  'arc-tar-to-rar':   '.tar',
  'arc-7z-to-zip':    '.7z',
  'arc-7z-to-tar':    '.7z',
  'arc-7z-to-tar-gz': '.7z',
  'arc-7z-to-rar':    '.7z',
  'arc-tar-gz-to-zip':'.tar.gz',
  'arc-tar-gz-to-7z': '.tar.gz',
  'arc-tar-gz-to-tar':'.tar.gz',
  'arc-tar-gz-to-rar':'.tar.gz',
  'arc-rar-to-zip':   '.rar',
  'arc-rar-to-7z':    '.rar',
  'arc-rar-to-tar':   '.rar',
  'arc-rar-to-tar-gz':'.rar',
};

// ─── TOOL-ID → BACKEND ROUTE PATH (src-to-dst segment) ───────────────────────
const _ROUTE = {
  'arc-zip-to-7z':     'zip-to-7z',
  'arc-zip-to-tar':    'zip-to-tar',
  'arc-zip-to-tar-gz': 'zip-to-tar-gz',
  'arc-zip-to-rar':    'zip-to-rar',
  'arc-tar-to-zip':    'tar-to-zip',
  'arc-tar-to-7z':     'tar-to-7z',
  'arc-tar-to-gz':     'tar-to-gz',
  'arc-tar-to-rar':    'tar-to-rar',
  'arc-7z-to-zip':     '7z-to-zip',
  'arc-7z-to-tar':     '7z-to-tar',
  'arc-7z-to-tar-gz':  '7z-to-tar-gz',
  'arc-7z-to-rar':     '7z-to-rar',
  'arc-tar-gz-to-zip': 'tar.gz-to-zip',
  'arc-tar-gz-to-7z':  'tar.gz-to-7z',
  'arc-tar-gz-to-tar': 'tar.gz-to-tar',
  'arc-tar-gz-to-rar': 'tar.gz-to-rar',
  'arc-rar-to-zip':    'rar-to-zip',
  'arc-rar-to-7z':     'rar-to-7z',
  'arc-rar-to-tar':    'rar-to-tar',
  'arc-rar-to-tar-gz': 'rar-to-tar-gz',
};

// ─── TOOL-ID → OUTPUT EXTENSION ──────────────────────────────────────────────
const _DST_EXT = {
  'arc-zip-to-7z':     '.7z',
  'arc-zip-to-tar':    '.tar',
  'arc-zip-to-tar-gz': '.tar.gz',
  'arc-zip-to-rar':    '.rar',
  'arc-tar-to-zip':    '.zip',
  'arc-tar-to-7z':     '.7z',
  'arc-tar-to-gz':     '.gz',
  'arc-tar-to-rar':    '.rar',
  'arc-7z-to-zip':     '.zip',
  'arc-7z-to-tar':     '.tar',
  'arc-7z-to-tar-gz':  '.tar.gz',
  'arc-7z-to-rar':     '.rar',
  'arc-tar-gz-to-zip': '.zip',
  'arc-tar-gz-to-7z':  '.7z',
  'arc-tar-gz-to-tar': '.tar',
  'arc-tar-gz-to-rar': '.rar',
  'arc-rar-to-zip':    '.zip',
  'arc-rar-to-7z':     '.7z',
  'arc-rar-to-tar':    '.tar',
  'arc-rar-to-tar-gz': '.tar.gz',
};

// ─── MODULE STATE ──────────────────────────────────────────────────────────────
let _arcFile     = null;
let _arcBaseName = '';
let _arcToolId   = '';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const p = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** p)).toFixed(p ? 1 : 0)} ${units[p]}`;
}

function _srcFormatLabel(toolId) {
  const ext = (_SRC_EXT[toolId] || '.zip').replace(/^\./, '').toUpperCase();
  return ext;
}

function _dstFormatLabel(toolId) {
  const ext = (_DST_EXT[toolId] || '.zip').replace(/^\./, '').toUpperCase();
  return ext;
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────
export function removeArchiveConvertPanel() {
  const panel = document.getElementById('arc-convert-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-arc-conv-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-arc-conv-thumb');
  }

  _arcFile     = null;
  _arcBaseName = '';
  _arcToolId   = '';
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────
function _showThumb(zone, file, color, toolId) {
  const old = zone.querySelector('.dz-arc-conv-thumb-wrap');
  if (old) old.remove();

  // Use the archive format icon that matches the source format
  const srcLabel = _srcFormatLabel(toolId);
  const iconSvg  = getArchiveFileIconSvg(srcLabel, color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-arc-conv-thumb-wrap';
  wrap.style.setProperty(_CSS_VAR, color);

  wrap.innerHTML = `
    <div class="dz-arc-conv-thumb-card">
      <div class="dz-arc-conv-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${iconSvg}
      </div>
      <button class="dz-arc-conv-thumb-remove" title="Remove file" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-arc-conv-thumb-name">${_esc(file.name)}</span>
    <span class="dz-arc-conv-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-arc-conv-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-arc-conv-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeArchiveConvertPanel();
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
  const existing = document.getElementById('arc-convert-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const dstExt = _DST_EXT[_arcToolId] || '.zip';
  const label  = getActiveTool() ? getActiveTool().label : `Convert to ${_dstFormatLabel(_arcToolId)}`;

  const panel = document.createElement('div');
  panel.id        = 'arc-convert-settings-panel';
  panel.className = 'pw-panel';
  panel.style.setProperty('--pw-color', color);

  panel.innerHTML = `
    <div class="pw-header">
      <span class="pw-header-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 7h11l-3-3M17 17H6l3 3M18 7a6 6 0 0 1 1 6M6 17a6 6 0 0 1-1-6"
                stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="pw-header-text"><strong>${_fmt(fileSize)}</strong></span>
      </span>
      <button class="pw-change-btn" id="ac-change-btn" title="Pick a different file">Change file</button>
    </div>
    <div class="pw-actions">
      <input class="pw-filename-input" id="ac-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"
             value="${_esc(_arcBaseName)}"/>
      <span class="pw-filename-ext">${_esc(dstExt)}</span>
      <button class="pw-submit-btn" id="ac-submit-btn">${_esc(label)}</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('pw-panel--visible'));

  panel.querySelector('#ac-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeArchiveConvertPanel();
    const zone = document.getElementById('drop-zone');
    if (zone) resetZoneContent(zone);
    if (tool) {
      import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // Capture file + baseName at panel-creation time so they survive any
  // intermediate removeArchiveConvertPanel() call (e.g. tool reselect).
  const _capturedFile     = _arcFile;
  const _capturedBaseName = _arcBaseName;

  panel.querySelector('#ac-submit-btn').addEventListener('click', () => {
    const fileToConvert = _arcFile || _capturedFile;
    if (!fileToConvert) return;
    const nameEl  = panel.querySelector('#ac-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || _arcBaseName || _capturedBaseName;
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitConvert(fileToConvert, outName);
  });
}

// ─── FILE PICKED (PUBLIC ENTRY POINT) ─────────────────────────────────────────
export async function handleArchiveConvertFilePicked(file, toolId) {
  const srcExt = _SRC_EXT[toolId] || '.zip';

  // Validate extension — support multi-dot extensions like .tar.gz
  const fname = (file && file.name) ? file.name.toLowerCase() : '';
  const validExt = srcExt.toLowerCase();
  if (!file || !fname.endsWith(validExt)) {
    pushNotification({
      type: 'warning',
      message: `Invalid File Format. Please select a valid ${_srcFormatLabel(toolId)} archive.`,
    });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#00E5C0') : '#00E5C0';
  const zone  = document.getElementById('drop-zone');

  removeArchiveConvertPanel();

  _arcToolId   = toolId;
  _arcFile     = file;

  // Strip known multi-dot archive extensions from the basename
  let baseName = file.name;
  for (const strip of ['.tar.gz', '.tar.bz2', '.tar.xz', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']) {
    if (baseName.toLowerCase().endsWith(strip)) {
      baseName = baseName.slice(0, baseName.length - strip.length);
      break;
    }
  }
  _arcBaseName = baseName;

  showScanProgress(zone, color, 'Scanning archive');

  await new Promise((r) => setTimeout(r, 380));

  resetZoneContent(zone);
  _showThumb(zone, file, color, toolId);
  _showSettingsPanel(file.size, color);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────
async function _submitConvert(file, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone   = document.getElementById('drop-zone');
  const color  = tool.color || '#00E5C0';

  // Capture before removeArchiveConvertPanel() clears module vars
  const dstExt   = _DST_EXT[_arcToolId] || '.zip';
  const route    = _ROUTE[_arcToolId];
  const baseName = _arcBaseName || outputFilename;

  // Remove thumbnail + panel; show progress ring
  const panel = document.getElementById('arc-convert-settings-panel');
  if (panel) panel.remove();
  const thumb = zone ? zone.querySelector('.dz-arc-conv-thumb-wrap') : null;
  if (thumb) thumb.remove();
  if (zone)  zone.classList.remove('dz-has-arc-conv-thumb');
  _arcFile = null; _arcBaseName = ''; _arcToolId = '';

  const earlyName = `${baseName}${dstExt}`;

  const fd = new FormData();
  fd.append('file', file);
  fd.append('output_filename', outputFilename + dstExt);

  showProgress(zone, 10, color, 'Converting…', tool.id);
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/archives/convert/${route}`, { method: 'POST', body: fd });
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
      removeArchiveConvertPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeArchiveConvertPanel();
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

    if (state === 'error') {
      showError(zone, error || 'Conversion failed. Please try again.', tool.id);
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
  };
}
