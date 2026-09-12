/**
 * frontend/tools/archives/archive_extract.js
 *
 * Archive Extract Tool — supports ZIP, RAR, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ,
 * GZ, BZ2, XZ, CAB, ISO, DMG extraction via local 7-Zip engine.
 *
 * Provides:
 *   - Offline/local archive inspection (file count, uncompressed size, encrypted detection)
 *   - Interactive thumbnail card inside the dropzone
 *   - File list preview table showing contents inside the archive with crisp yellow SVG icons
 *   - Optional password input for encrypted archives
 *   - Native OS directory picker window (Windows, macOS, Linux) to choose extraction destination
 *   - Mandatory destination selection check with warning notification
 *   - Direct extraction to destination folder without creating extra zip files
 *   - "Open Folder" completion card to instantly open folder in OS file explorer
 *   - Clean state reset on completion and for "Extract Another"
 *   - Smooth scroll to top on tool selection and on convert click
 *   - Background job registration & SSE progress bar synchronization
 *   - Cancellation handling
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

export const ARCHIVE_EXTRACT_IDS = new Set([
  'archive-extract-zip',
  'archive-extract-rar',
  'archive-extract-7z',
  'archive-extract-tar',
  'archive-extract-tar-gz',
  'archive-extract-tar-bz2',
  'archive-extract-tar-xz',
  'archive-extract-gz',
  'archive-extract-bz2',
  'archive-extract-xz',
  'archive-extract-cab',
  'archive-extract-iso',
  'archive-extract-dmg',
]);

const FORMAT_BY_ID = {
  'archive-extract-zip':     'zip',
  'archive-extract-rar':     'rar',
  'archive-extract-7z':      '7z',
  'archive-extract-tar':     'tar',
  'archive-extract-tar-gz':  'tar.gz',
  'archive-extract-tar-bz2': 'tar.bz2',
  'archive-extract-tar-xz':  'tar.xz',
  'archive-extract-gz':      'gz',
  'archive-extract-bz2':     'bz2',
  'archive-extract-xz':      'xz',
  'archive-extract-cab':     'cab',
  'archive-extract-iso':     'iso',
  'archive-extract-dmg':     'dmg',
};

// ─── CRISP YELLOW SVG ICONS ───────────────────────────────────────────────────

const YELLOW_FOLDER_SVG = `<svg class="archive-theme-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.086a2 2 0 0 1 1.414.586l1.414 1.414A2 2 0 0 0 13.828 6.5H18.5A2.5 2.5 0 0 1 21 9v9.5A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-12Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M3 9.5h18" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
</svg>`;

const YELLOW_FILE_SVG = `<svg class="archive-theme-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5.5 4A2.5 2.5 0 0 1 8 1.5h7l6 6V20a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 20V4Z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M15 1.5V7.5h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="9.5" y1="12" x2="16.5" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>
  <line x1="9.5" y1="16" x2="14.5" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
</svg>`;

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _extractFile = null;
let _extractInfo = null;
let _destinationDir = null;
let _jobId = null;
let _cancelRequested = false;
let _streamRetryTimer = null;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
}

function _cleanStem(filename) {
  let name = filename || 'archive';
  const exts = ['.tar.gz', '.tar.bz2', '.tar.xz', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.cab', '.iso', '.dmg'];
  for (const ext of exts) {
    if (name.toLowerCase().endsWith(ext)) {
      name = name.slice(0, -ext.length);
      break;
    }
  }
  return name.replace(/\.[^.]+$/, '') || 'archive';
}

async function _pickDestinationFolder() {
  if (window.toolceo?.selectDirectory) {
    return await window.toolceo.selectDirectory({
      title: 'Select Destination Folder for Extraction',
      buttonLabel: 'Extract Here',
    });
  }
  if (window.electronAPI?.selectDirectory) {
    return await window.electronAPI.selectDirectory({
      title: 'Select Destination Folder for Extraction',
      buttonLabel: 'Extract Here',
    });
  }
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (handle) return handle.name;
    } catch (_) {}
  }
  return null;
}

// ─── PUBLIC TEARDOWN ──────────────────────────────────────────────────────────

export function removeArchiveExtractPanel() {
  const panel = document.getElementById('archive-extract-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-extract-thumb-wrap')?.remove();
    zone.querySelector('.archive-extract-done-wrap')?.remove();
    zone.classList.remove('dz-has-extract-thumb', 'dz-has-extract-done');
  }

  _extractFile = null;
  _extractInfo = null;
  _destinationDir = null;
  _jobId = null;
}

// ─── PUBLIC PREDICATES ────────────────────────────────────────────────────────

export function isArchiveExtractTool(toolId) {
  return ARCHIVE_EXTRACT_IDS.has(toolId);
}

/**
 * Called by dropzone._updateDropZone when the user switches back to an archive
 * extract tool that has a completed bgJob with a known destination directory.
 * Shows the extraction-done confirmation card immediately without waiting for
 * the SSE setTimeout (which already bailed out because the tool was not active).
 */
export function restoreArchiveExtractDone(zone, bgJob, color, tool) {
  if (!bgJob || bgJob.state !== 'done') return;
  if (bgJob.destinationDir) {
    _showExtractDone(zone, bgJob.destinationDir, color, tool);
    // The bgJob is cleared by the "Extract Another" click handler inside
    // _showExtractDone; call silent-clear here so the bg-job bar updates now.
    clearBgJob(true);
  }
  // If no destinationDir (zip-as-download path), dropzone handles it via
  // its existing _showDownload fallback — nothing extra needed here.
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showExtractThumb(zone, file, color, info) {
  zone.querySelector('.dz-extract-thumb-wrap')?.remove();
  zone.querySelector('.archive-extract-done-wrap')?.remove();
  zone.classList.remove('dz-has-extract-done');

  const format = (info?.format || getArchiveFormatLabel(file.name)).toUpperCase();
  const thumbSvg = getArchiveFileIconSvg(format, color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-extract-thumb-wrap';
  wrap.style.setProperty('--ext-color', color);

  wrap.innerHTML = `
    <div class="dz-extract-thumb-card">
      <div class="dz-extract-thumb-frame" style="box-shadow:0 8px 24px rgba(0,0,0,0.45)">
        ${thumbSvg}
      </div>
      <button type="button" class="dz-extract-thumb-remove" title="Remove file" aria-label="Remove archive">×</button>
    </div>
    <span class="dz-extract-thumb-name" title="${_esc(file.name)}">${_esc(file.name)}</span>
    <span class="dz-extract-thumb-size">${_fmt(file.size)}</span>
  `;

  zone.classList.add('dz-has-extract-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-extract-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    clearBgJob();
    removeArchiveExtractPanel();
    resetZoneContent(zone);
    import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

function _showSettingsPanel(file, info, color) {
  document.getElementById('archive-extract-panel')?.remove();

  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const panel = document.createElement('section');
  panel.id = 'archive-extract-panel';
  panel.className = 'archive-extract-panel';
  panel.style.setProperty('--ext-color', color);

  const format = (info?.format || getArchiveFormatLabel(file.name)).toUpperCase();
  const fileCount = info?.file_count || 0;
  const uncompressedSize = info?.uncompressed_size || 0;
  const isEncrypted = Boolean(info?.is_encrypted || info?.needs_password);
  const entries = info?.entries || [];

  // Build file list preview table (first 30 entries) with yellow SVG icons
  let previewRowsHtml = '';
  if (entries.length > 0) {
    previewRowsHtml = entries.slice(0, 30).map((entry) => `
      <div class="archive-preview-row">
        <span class="archive-preview-path" title="${_esc(entry.path)}">
          ${entry.is_folder ? YELLOW_FOLDER_SVG : YELLOW_FILE_SVG} ${_esc(entry.path)}
        </span>
        <span class="archive-preview-size">${entry.is_folder ? '—' : _fmt(entry.size)}</span>
      </div>
    `).join('');

    if (entries.length > 30) {
      previewRowsHtml += `
        <div class="archive-preview-more">
          + ${entries.length - 30} more item${entries.length - 30 === 1 ? '' : 's'} inside archive…
        </div>
      `;
    }
  }

  panel.innerHTML = `
    <div class="archive-extract-header">
      <div class="archive-extract-stats">
        <span class="archive-stat-badge">
          <strong>${fileCount > 0 ? fileCount : '1+'}</strong> ${fileCount === 1 ? 'file' : 'files'}
        </span>
        ${uncompressedSize > 0 ? `
          <span class="archive-stat-badge">
            Unpacked: <strong>${_fmt(uncompressedSize)}</strong>
          </span>
        ` : ''}
        ${isEncrypted ? `
          <span class="archive-stat-badge archive-stat-badge--locked">
            🔒 Password Protected
          </span>
        ` : ''}
      </div>
      <button type="button" class="archive-change-btn" id="archive-change-file-btn">Change file</button>
    </div>

    ${previewRowsHtml ? `
      <div class="archive-preview-box">
        <div class="archive-preview-title">
          <span>Archive Contents (${entries.length} items)</span>
        </div>
        <div class="archive-preview-list">
          ${previewRowsHtml}
        </div>
      </div>
    ` : ''}

    <div class="archive-extract-inputs">
      ${isEncrypted ? `
        <div class="archive-field-group">
          <label class="archive-field-label" for="archive-extract-password">Archive Password</label>
          <div class="archive-input-wrap">
            <input type="password" id="archive-extract-password" class="archive-field-input"
                   placeholder="Enter archive password..." />
          </div>
        </div>
      ` : ''}

      <div class="archive-field-group">
        <label class="archive-field-label" for="archive-dest-folder">Extract Destination Folder</label>
        <div class="archive-dir-picker-wrap">
          <input type="text" id="archive-dest-folder" class="archive-field-input"
                 placeholder="Select folder where files should be extracted..."
                 value="${_esc(_destinationDir || '')}" />
          <button type="button" class="archive-browse-btn" id="archive-browse-dest-btn" title="Choose extraction folder">
            ${YELLOW_FOLDER_SVG} <span>Browse Folder</span>
          </button>
        </div>
        <p class="archive-destination-error" id="archive-destination-error" role="alert" hidden>
          Please select a folder before extracting.
        </p>
      </div>
    </div>

    <div class="archive-extract-actions">
      <button type="button" class="archive-extract-btn" id="archive-extract-submit-btn"
              style="--ext-color:${color}">
        Extract ${format} Archive
      </button>
    </div>
  `;

  zone.parentElement?.appendChild(panel);

  // Wire Change File button
  panel.querySelector('#archive-change-file-btn')?.addEventListener('click', () => {
    const input = document.getElementById('file-input');
    if (input) input.click();
  });

  // Wire Browse Destination Folder button
  panel.querySelector('#archive-browse-dest-btn')?.addEventListener('click', async () => {
    const chosen = await _pickDestinationFolder();
    if (chosen) {
      _destinationDir = chosen;
      const input = document.getElementById('archive-dest-folder');
      if (input) input.value = chosen;
      const error = document.getElementById('archive-destination-error');
      if (error) error.hidden = true;
    }
  });

  // Wire Submit Extract button
  panel.querySelector('#archive-extract-submit-btn')?.addEventListener('click', _submitExtract);
}

// ─── COMPLETION CARD (INSIDE DROP ZONE) ────────────────────────────────────────

function _showExtractDone(zone, destDir, color, tool) {
  resetZoneContent(zone);
  document.getElementById('archive-extract-panel')?.remove();
  zone.classList.add('dz-has-extract-done');

  const wrap = document.createElement('div');
  wrap.className = 'archive-extract-done-wrap';
  wrap.style.setProperty('--ext-color', color);

  wrap.innerHTML = `
    <button class="dz-save-close" type="button" title="Close" aria-label="Close" style="--save-color:${color}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <div class="archive-extract-done-header">
      <div class="archive-extract-done-icon">
        <svg class="archive-done-check-svg" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle class="archive-done-circle" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6" fill="none"/>
          <path class="archive-done-tick" d="M7 12.5l3.5 3.5L17 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="archive-extract-done-title-block">
        <h3 class="archive-extract-done-title">Extraction Complete</h3>
        <p class="archive-extract-done-subtitle">All files extracted successfully</p>
      </div>
    </div>
    <div class="archive-extract-done-divider"></div>
    <div class="archive-extract-done-dest-label">Output location</div>
    <div class="archive-extract-done-path-box" title="${_esc(destDir)}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex-shrink:0;color:#facc15">
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
      <span>${_esc(destDir)}</span>
    </div>
    <div class="archive-extract-done-actions">
      <button type="button" class="archive-open-folder-btn" id="archive-open-dest-btn"
              style="--ext-color:${color}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        Open Folder
      </button>
      <button type="button" class="archive-extract-again-btn" id="archive-extract-another-btn">
        Extract Another
      </button>
    </div>
  `;

  zone.appendChild(wrap);

  wrap.querySelector('.dz-save-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearBgJob();
    removeArchiveExtractPanel();
    resetZoneContent(zone);
    const activeTool = getActiveTool();
    if (activeTool) {
      import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
      }).catch(() => {});
    }
  });

  wrap.querySelector('#archive-open-dest-btn')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (window.toolceo?.openPath) {
        await window.toolceo.openPath(destDir);
      } else if (window.electronAPI?.openPath) {
        await window.electronAPI.openPath(destDir);
      } else if (window.toolceo?.showItemInFolder) {
        await window.toolceo.showItemInFolder(destDir);
      }
    } catch (err) {
      console.error('Failed to open destination folder:', err);
    }
  });

  wrap.querySelector('#archive-extract-another-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearBgJob();
    removeArchiveExtractPanel();
    resetZoneContent(zone);
    const activeTool = getActiveTool();
    if (activeTool) {
      import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
      }).catch(() => {});
    }
  });
}

// ─── PUBLIC FILE HANDLER ──────────────────────────────────────────────────────

export async function handleArchiveFilesPicked(file) {
  if (!file) return;

  const tool = getActiveTool();
  if (!tool || !isArchiveExtractTool(tool.id)) return;

  const color = tool.color || '#00E5C0';
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  removeArchiveExtractPanel();
  showScanProgress(zone, color, 'Inspecting archive contents…');

  let info = null;
  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch(`${BACKEND}/api/archives/extract/info`, {
      method: 'POST',
      body: form,
    });
    if (res.ok) {
      info = await res.json();
    }
  } catch (_) {
    // Network or server error — will fall back to local presentation
  }

  resetZoneContent(zone);

  _extractFile = file;
  _extractInfo = info;

  _showExtractThumb(zone, file, color, info);
  _showSettingsPanel(file, info, color);
}

// ─── SUBMIT EXTRACTION ────────────────────────────────────────────────────────

async function _submitExtract() {
  const tool = getActiveTool();
  const zone = document.getElementById('drop-zone');
  if (!tool || !zone || !_extractFile) return;

  _cancelRequested = false;

  let destFolder = document.getElementById('archive-dest-folder')?.value.trim() || _destinationDir;

  // If user hasn't selected a destination folder yet, prompt OS file explorer
  if (!destFolder && (window.toolceo?.selectDirectory || window.electronAPI?.selectDirectory)) {
    const chosen = await _pickDestinationFolder();
    if (chosen) {
      destFolder = chosen;
      _destinationDir = chosen;
      const input = document.getElementById('archive-dest-folder');
      if (input) input.value = chosen;
      const error = document.getElementById('archive-destination-error');
      if (error) error.hidden = true;
    }
  }

  // If user still hasn't selected a destination folder, notify and highlight input
  if (!destFolder) {
    const folderInput = document.getElementById('archive-dest-folder');
    const error = document.getElementById('archive-destination-error');
    if (error) error.hidden = false;
    if (folderInput) {
      folderInput.focus();
      folderInput.classList.add('archive-field-input--highlight');
      setTimeout(() => folderInput.classList.remove('archive-field-input--highlight'), 2500);
    }
    return;
  }

  // Smoothly scroll to top so the user immediately sees the progress ring
  document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });

  const color = tool.color || '#00E5C0';
  const passwordInput = document.getElementById('archive-extract-password');
  const password = passwordInput?.value.trim() || '';

  const earlyName = destFolder || `${_cleanStem(_extractFile.name)}_extracted`;

  // Clean up settings panel & dropzone thumbnail before showing progress
  document.getElementById('archive-extract-panel')?.remove();
  zone.querySelector('.dz-extract-thumb-wrap')?.remove();
  zone.classList.remove('dz-has-extract-thumb');

  const form = new FormData();
  form.append('file', _extractFile);
  form.append('destination_dir', destFolder);
  if (password) {
    form.append('password', password);
  }

  showProgress(zone, 5, color, 'Extracting…', tool.id);
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null, noSave: true, noNotify: true });

  try {
    const res = await fetch(`${BACKEND}/api/archives/extract`, {
      method: 'POST',
      body: form,
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.detail || body.error || `Server error ${res.status}`);
    }
    if (_cancelRequested) {
      fetch(`${BACKEND}/api/archives/cancel/${body.job_id}`, { method: 'POST' }).catch(() => {});
      return;
    }
    _jobId = body.job_id;
  } catch (error) {
    if (_cancelRequested) return;
    clearBgJob();
    showError(zone, `Extraction failed: ${error.message}`, tool.id);
    return;
  }

  const stream = new EventSource(`${BACKEND}/api/progress/${_jobId}`);
  let streamFinished = false;
  _streamRetryTimer = null;
  setBgJob({ jobId: _jobId, tool, filename: earlyName, progress: 10, state: 'running', sse: stream, noSave: true, noNotify: true });

  stream.onmessage = (event) => {
    if (_cancelRequested) {
      stream.close();
      return;
    }

    let data;
    try {
      data = JSON.parse(event.data);
    } catch (_) {
      return;
    }
    if (_streamRetryTimer) {
      clearTimeout(_streamRetryTimer);
      _streamRetryTimer = null;
    }

    const job = getBgJob(_jobId);
    if (job) {
      job.progress = data.progress || job.progress;
      job.state = data.state === 'done' ? 'done' : (data.state === 'error' ? 'error' : 'running');
      if (data.filename) job.filename = data.filename;
      syncBgJobBar();
    }

    if (data.state === 'running' || data.state === 'pending') {
      updateProgress(zone, Math.max(5, Math.min(99, data.progress || 5)), color, tool.id);
      return;
    }

    stream.close();

    if (data.state === 'done') {
      streamFinished = true;
      if (_streamRetryTimer) clearTimeout(_streamRetryTimer);
      updateProgress(zone, 100, color, tool.id);
      // destination_dir may come from SSE payload, or fall back to the local
      // destFolder captured in this closure, or to data.filename (the engine
      // returns dest_path as filename when extracting directly to disk).
      const finalDest = data.destination_dir || destFolder || (data.media_type === 'inode/directory' ? data.filename : null);

      // Store finalDest on the bgJob so it can be restored if the user
      // switches away and comes back before the confirmation is shown.
      const bgJobRef = getBgJob(_jobId);
      if (bgJobRef) {
        bgJobRef.destinationDir = finalDest || null;
        syncBgJobBar();
      }

      setTimeout(() => {
        // Only show the confirmation if the extract tool is still the active
        // tool. If the user switched away, the bgJob restore in _updateDropZone
        // will call _showExtractDone when they switch back.
        const currentTool = getActiveTool();
        if (!currentTool || currentTool.id !== tool.id) return;
        if (finalDest) {
          _showExtractDone(zone, finalDest, color, tool);
          clearBgJob(true);
        } else {
          const downloadName = data.filename || earlyName;
          showDownload(
            zone,
            downloadName,
            _jobId,
            color,
            () => {
              removeArchiveExtractPanel();
              const activeTool = getActiveTool();
              if (activeTool) {
                import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
                  if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
                }).catch(() => {});
              }
            },
            tool.id
          );
        }
      }, 300);
    } else {
      showError(zone, data.error || 'Archive extraction failed.', tool.id);
    }
  };

  stream.onerror = () => {
    if (_cancelRequested || streamFinished) return;
    if (_streamRetryTimer) return;
    _streamRetryTimer = setTimeout(() => {
      _streamRetryTimer = null;
      if (!streamFinished && !_cancelRequested) {
        showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
        stream.close();
      }
    }, 10000);
  };
}

// ─── CANCEL LISTENER ──────────────────────────────────────────────────────────

document.addEventListener('progress-cancelled', () => {
  _cancelRequested = true;
  if (_streamRetryTimer) {
    clearTimeout(_streamRetryTimer);
    _streamRetryTimer = null;
  }
  if (_jobId) {
    fetch(`${BACKEND}/api/archives/cancel/${_jobId}`, { method: 'POST' }).catch(() => {});
  }
  _jobId = null;
  clearBgJob();
  removeArchiveExtractPanel();
  pushNotification({ type: 'info', message: 'Archive extraction cancelled.' });
});
