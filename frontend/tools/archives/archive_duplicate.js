/**
 * frontend/tools/archives/archive_duplicate.js
 *
 * Archive Duplicate Finder — content-hash based duplicate analyzer & clean rebind.
 * Scans archive contents for identical files (SHA-256), displays side-by-side /
 * comparative file panels with delete toggles, and rebinds the archive without duplicates.
 */

import { getActiveTool, setBgJob, clearBgJob, getBgJob, syncBgJobBar } from '../../scripts/toolstate.js';
import { pushNotification } from '../../scripts/notificationStore.js';
import {
  showScanProgress,
  resetZoneContent,
  showProgress,
  updateProgress,
  showDownload,
  showError,
} from '../shared/progress.js';
import { getArchiveFileIconSvg, getArchiveFormatLabel } from '../shared/archiveIcon.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _currentFile = null;
let _scanData = null;
let _deletePaths = new Set();
let _outputStem = '';

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
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
}

function _cleanStem(filename) {
  let stem = String(filename || 'archive');
  const exts = ['.tar.gz', '.tar.bz2', '.tar.xz', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.wim'];
  for (const ext of exts) {
    if (stem.toLowerCase().endsWith(ext)) {
      stem = stem.slice(0, -ext.length);
      break;
    }
  }
  return stem.replace(/\.[^/.]+$/, '') || 'archive';
}

function _scrollToTop() {
  const mc = document.getElementById('main-content');
  if (mc) mc.scrollTo({ top: 0, behavior: 'smooth' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function _getFileIconSvg(ext) {
  const e = (ext || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico'].includes(e)) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(e)) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>`;
  }
  if (['js', 'ts', 'py', 'html', 'css', 'json', 'xml', 'c', 'cpp', 'rs', 'go'].includes(e)) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(e)) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  }
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
}

// ─── PUBLIC TEARDOWN ──────────────────────────────────────────────────────────

export function removeArchiveDuplicatePanel() {
  const panel = document.getElementById('archive-duplicate-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-arc-duplicate-thumb-wrap')?.remove();
    zone.classList.remove('dz-has-arc-duplicate-thumb');
  }

  _currentFile = null;
  _scanData = null;
  _deletePaths.clear();
  _outputStem = '';
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showThumb(zone, file, color, scanData) {
  zone.querySelector('.dz-arc-duplicate-thumb-wrap')?.remove();

  const format = getArchiveFormatLabel(scanData?.archive_format || file.name);
  const thumbSvg = getArchiveFileIconSvg(format, color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-arc-duplicate-thumb-wrap';
  wrap.style.setProperty('--ad-color', color);

  const dupsCount = scanData?.duplicate_files_count || 0;
  const badgeText = dupsCount > 0 ? `${dupsCount} Duplicates` : 'Clean Archive';

  wrap.innerHTML = `
    <div class="dz-arc-duplicate-thumb-card">
      <div class="dz-arc-duplicate-thumb-frame">
        ${thumbSvg}
      </div>
      <button type="button" class="dz-arc-duplicate-thumb-remove" title="Remove file" aria-label="Remove archive">✕</button>
    </div>
    <span class="dz-arc-duplicate-thumb-name" title="${_esc(file.name)}">${_esc(file.name)}</span>
    <div class="dz-arc-duplicate-thumb-meta">
      <span class="dz-arc-duplicate-thumb-size">${_fmt(file.size)}</span>
      <span class="dz-arc-duplicate-thumb-badge">${badgeText}</span>
    </div>
  `;

  zone.classList.add('dz-has-arc-duplicate-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-arc-duplicate-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeArchiveDuplicatePanel();
    resetZoneContent(zone);
    import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── FILE PICKED HANDLER ──────────────────────────────────────────────────────

export async function handleArchiveDuplicateFilePicked(file) {
  if (!file) return;

  const tool = getActiveTool();
  const color = tool?.color || '#00E5C0';
  const zone = document.getElementById('drop-zone');

  removeArchiveDuplicatePanel();

  _currentFile = file;
  _outputStem = _cleanStem(file.name);
  _deletePaths.clear();

  showScanProgress(zone, color, 'Scanning archive for duplicate files…', tool?.id || 'archive-duplicate');

  try {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch(`${BACKEND}/api/archives/duplicates/scan`, {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Scan failed with status ${res.status}`);
    }

    _scanData = data;

    // Smart default: For each duplicate group, keep 1st file, mark remaining for deletion
    if (Array.isArray(data.groups)) {
      data.groups.forEach((grp) => {
        if (Array.isArray(grp.files) && grp.files.length > 1) {
          for (let i = 1; i < grp.files.length; i++) {
            _deletePaths.add(grp.files[i].path);
          }
        }
      });
    }

    await new Promise((r) => setTimeout(r, 200));

    resetZoneContent(zone);
    _showThumb(zone, file, color, data);
    _showDuplicatePanel(file, data, color);
  } catch (err) {
    showError(zone, `Scan failed: ${err.message}`, tool?.id || 'archive-duplicate');
  }
}

// ─── DUPLICATE PANEL RENDERING ────────────────────────────────────────────────

function _showDuplicatePanel(file, data, color) {
  document.getElementById('archive-duplicate-panel')?.remove();

  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const panel = document.createElement('section');
  panel.id = 'archive-duplicate-panel';
  panel.style.setProperty('--ad-color', color);

  const totalGroups = data.duplicate_groups_count || 0;
  const totalDups = data.duplicate_files_count || 0;
  const wastedBytes = data.wasted_bytes || 0;
  const totalFiles = data.total_files || 0;

  // ── Compact Metrics Strip ──
  const metricsHTML = `
    <div class="ad-metrics-strip">
      <div class="ad-metric-chip chip-sets">
        <strong>${totalGroups}</strong>
        duplicate ${totalGroups === 1 ? 'set' : 'sets'}
      </div>
      <div class="ad-metric-divider"></div>
      <div class="ad-metric-chip chip-sets">
        <strong>${totalDups}</strong>
        redundant ${totalDups === 1 ? 'file' : 'files'}
      </div>
      <div class="ad-metric-divider"></div>
      <div class="ad-metric-chip chip-space">
        <strong>${_fmt(wastedBytes)}</strong>
        recoverable
      </div>
      <div class="ad-metric-divider"></div>
      <div class="ad-metric-chip chip-total">
        <strong>${totalFiles}</strong>
        files scanned
      </div>
    </div>
  `;

  // ── Clean State (No Duplicates Found) ──
  if (totalGroups === 0) {
    panel.innerHTML = `
      ${metricsHTML}
      <div class="ad-clean-state-card">
        <div class="ad-clean-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="ad-clean-title">No Duplicate Files Detected!</div>
        <div class="ad-clean-desc">
          All ${totalFiles} files inside <strong>${_esc(file.name)}</strong> have completely unique contents.
          Your archive is already streamlined with no wasted storage.
        </div>
      </div>
    `;
    zone.parentNode.insertBefore(panel, zone.nextSibling);
    return;
  }

  // ── Toolbar & Duplicate Groups ──
  panel.innerHTML = `
    ${metricsHTML}

    <div class="ad-toolbar">
      <div class="ad-search-box">
        <svg class="ad-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="ad-search-input" placeholder="Filter duplicate files by name or path..." />
      </div>
      <div class="ad-actions-row">
        <button type="button" class="ad-btn-quick ad-btn-recommended" id="ad-btn-auto-select">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
          Keep 1st Copy (Delete Rest)
        </button>
        <button type="button" class="ad-btn-quick" id="ad-btn-keep-all">
          Keep All Files
        </button>
        <span class="ad-selection-counter" id="ad-counter">
          Marked for removal: <strong id="ad-counter-num">${_deletePaths.size}</strong> files
        </span>
      </div>
    </div>

    <div class="ad-groups-list" id="ad-groups-container">
      ${_renderGroupsHTML(data.groups)}
    </div>

    <div class="ad-binding-dock">
      <div class="ad-binding-left">
        <div class="ad-binding-name-wrap">
          <span class="ad-binding-label">Output:</span>
          <input type="text" class="ad-binding-name-input" id="ad-output-name" value="${_esc(_outputStem)}_deduped.${data.archive_format || 'zip'}" />
        </div>
        <div class="ad-binding-summary" id="ad-dock-summary">
          ${_calcSummaryText()}
        </div>
      </div>
      <button type="button" class="ad-bind-submit-btn" id="ad-submit-bind">
        Bind without Duplicates
      </button>
    </div>
  `;

  zone.parentNode.insertBefore(panel, zone.nextSibling);

  // Wire up event listeners
  _wirePanelEvents(panel, data);
}

// ─── RENDER DUPLICATE GROUPS HTML ─────────────────────────────────────────────

function _renderGroupsHTML(groups) {
  if (!Array.isArray(groups)) return '';

  return groups.map((grp, gIdx) => {
    const toDeleteCount = grp.files.filter((f) => _deletePaths.has(f.path)).length;

    return `
      <div class="ad-group-card" data-group-id="${grp.id}">
        <div class="ad-group-header">
          <div class="ad-group-title-wrap">
            <span class="ad-group-badge">Set #${gIdx + 1}</span>
            <span class="ad-group-size">${_fmt(grp.file_size)} each</span>
            <span class="ad-group-hash-tag" title="SHA-256: ${grp.hash}">SHA: ${grp.hash}</span>
          </div>
          <span class="ad-group-status-pill">
            ${grp.files.length} copies found &bull; <strong class="ad-grp-del-count">${toDeleteCount}</strong> to delete
          </span>
        </div>
        <div class="ad-file-items">
          ${grp.files.map((file) => _renderFileItemHTML(file, grp)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function _renderFileItemHTML(file, grp) {
  const isDeleted = _deletePaths.has(file.path);
  const stateLabel = isDeleted
    ? `<span class="ad-state-label label-delete">Delete</span>`
    : `<span class="ad-state-label label-keep">Keep</span>`;

  // When deleted → show Restore (keep) action; when kept → show Delete action
  const btnText = isDeleted
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg> Restore`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Remove`;

  return `
    <div class="ad-file-item ${isDeleted ? 'is-deleted' : 'is-kept'}" data-path="${_esc(file.path)}" data-group-id="${grp.id}">
      <div class="ad-file-info">
        <div class="ad-file-icon">
          ${_getFileIconSvg(file.ext)}
        </div>
        <div class="ad-file-meta-col">
          <div class="ad-file-name-row">
            <span class="ad-file-name" title="${_esc(file.name)}">${_esc(file.name)}</span>
            <span class="ad-file-subtext">${_fmt(file.size)} &bull; ${file.modified || ''}</span>
          </div>
          <span class="ad-file-path" title="${_esc(file.path)}">${_esc(file.path)}</span>
        </div>
      </div>
      <div class="ad-file-action-wrap">
        <div class="ad-badge-slot">${stateLabel}</div>
        <button type="button" class="ad-toggle-btn" title="Toggle keep or remove for this duplicate">
          ${btnText}
        </button>
      </div>
    </div>
  `;
}

function _calcSummaryText() {
  const count = _deletePaths.size;
  if (count === 0) return 'No duplicate files marked for removal.';

  let savedBytes = 0;
  if (_scanData && Array.isArray(_scanData.groups)) {
    _scanData.groups.forEach((grp) => {
      const delInGrp = grp.files.filter((f) => _deletePaths.has(f.path)).length;
      savedBytes += delInGrp * grp.file_size;
    });
  }

  return `Removing <strong>${count}</strong> duplicates &bull; Saving <strong>${_fmt(savedBytes)}</strong>`;
}

// ─── WIRE PANEL EVENTS ────────────────────────────────────────────────────────

function _wirePanelEvents(panel, data) {
  const container = panel.querySelector('#ad-groups-container');
  const counterNum = panel.querySelector('#ad-counter-num');
  const dockSummary = panel.querySelector('#ad-dock-summary');
  const bindBtn = panel.querySelector('#ad-submit-bind');

  function updateUIState() {
    if (counterNum) counterNum.textContent = String(_deletePaths.size);
    if (dockSummary) dockSummary.innerHTML = _calcSummaryText();
    if (bindBtn) {
      bindBtn.disabled = _deletePaths.size === 0;
    }
  }

  // Toggle button clicks
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.ad-toggle-btn');
    if (!btn) return;

    const row = btn.closest('.ad-file-item');
    if (!row) return;

    const path = row.dataset.path;
    const grpId = row.dataset.groupId;
    const group = data.groups.find((g) => g.id === grpId);
    if (!group) return;

    const isCurrentlyDeleted = _deletePaths.has(path);

    if (isCurrentlyDeleted) {
      // User wants to KEEP this file
      _deletePaths.delete(path);
      row.classList.remove('is-deleted');
      row.classList.add('is-kept');
      row.querySelector('.ad-badge-slot').innerHTML = `<span class="ad-state-label label-keep">Keep</span>`;
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Remove`;
    } else {
      // User wants to DELETE this file
      // Safety rule: Don't allow deleting ALL copies in a group!
      const keptInGrp = group.files.filter((f) => !_deletePaths.has(f.path));
      if (keptInGrp.length <= 1) {
        pushNotification({
          type: 'error',
          message: 'Cannot remove all copies',
          detail: 'At least one copy of each file must be kept in the archive.',
          autoDismiss: true,
        });
        return;
      }

      _deletePaths.add(path);
      row.classList.remove('is-kept');
      row.classList.add('is-deleted');
      row.querySelector('.ad-badge-slot').innerHTML = `<span class="ad-state-label label-delete">Delete</span>`;
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg> Restore`;
    }

    // Update group header delete count
    const grpCard = row.closest('.ad-group-card');
    if (grpCard) {
      const delCount = group.files.filter((f) => _deletePaths.has(f.path)).length;
      const cntEl = grpCard.querySelector('.ad-grp-del-count');
      if (cntEl) cntEl.textContent = String(delCount);
    }

    updateUIState();
  });

  // Auto-Select (Keep 1st of each set)
  panel.querySelector('#ad-btn-auto-select')?.addEventListener('click', () => {
    _deletePaths.clear();
    data.groups.forEach((grp) => {
      for (let i = 1; i < grp.files.length; i++) {
        _deletePaths.add(grp.files[i].path);
      }
    });

    container.innerHTML = _renderGroupsHTML(data.groups);
    updateUIState();
  });

  // Keep All Files (Clear deletion marks)
  panel.querySelector('#ad-btn-keep-all')?.addEventListener('click', () => {
    _deletePaths.clear();
    container.innerHTML = _renderGroupsHTML(data.groups);
    updateUIState();
  });

  // Filter search
  const searchInput = panel.querySelector('.ad-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      const groupCards = container.querySelectorAll('.ad-group-card');
      groupCards.forEach((card) => {
        const fileRows = card.querySelectorAll('.ad-file-item');
        let anyVisible = false;
        fileRows.forEach((row) => {
          const path = (row.dataset.path || '').toLowerCase();
          const match = !query || path.includes(query);
          row.style.display = match ? 'flex' : 'none';
          if (match) anyVisible = true;
        });
        card.style.display = anyVisible ? 'block' : 'none';
      });
    });
  }

  // Bind submit button
  bindBtn?.addEventListener('click', () => {
    const outputName = panel.querySelector('#ad-output-name')?.value?.trim() || `${_outputStem}_no_duplicates.zip`;
    _submitRebind(_currentFile, Array.from(_deletePaths), outputName, data.archive_format || 'zip');
  });
}

// ─── SUBMIT REBIND JOB ────────────────────────────────────────────────────────

async function _submitRebind(file, deletePaths, outputFilename, outputFormat) {
  const tool = getActiveTool();
  if (!tool || !file) return;

  _scrollToTop();

  const zone = document.getElementById('drop-zone');
  const color = tool.color || '#00E5C0';

  // Teardown duplicate panels and thumbnails before starting progress
  removeArchiveDuplicatePanel();

  const fd = new FormData();
  fd.append('file', file);
  fd.append('delete_paths', JSON.stringify(deletePaths));
  fd.append('output_filename', outputFilename);
  fd.append('output_format', outputFormat);

  showProgress(zone, 5, color, 'Binding archive…', tool.id);
  setBgJob({ jobId: null, tool, filename: outputFilename, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res = await fetch(`${BACKEND}/api/archives/duplicates/rebind`, {
      method: 'POST',
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || json.detail || `Server error ${res.status}`);
    }
    jobId = json.job_id;
  } catch (err) {
    showError(zone, `Rebinding failed: ${err.message}`, tool.id);
    clearBgJob();
    return;
  }

  const sse = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct = 10;
  setBgJob({ jobId, tool, filename: outputFilename, progress: 10, state: 'running', sse });

  sse.onmessage = (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }

    if (data.error || data.state === 'error') {
      sse.close();
      showError(zone, data.error || 'Rebinding failed. Please try again.', tool.id);
      clearBgJob(jobId);
      return;
    }

    const rawPct = typeof data.progress === 'number' ? data.progress : lastPct;
    const pct = Math.max(lastPct, rawPct);
    lastPct = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state = data.state === 'done' ? 'done' : 'running';
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (data.state === 'running' || data.state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(95, pct)), color, tool.id);
      const label = zone?.querySelector('.dz-progress-label');
      if (label) {
        if (pct >= 85) label.textContent = 'Finalizing clean archive…';
        else if (pct >= 55) label.textContent = 'Re-packing clean archive…';
        else if (pct >= 15) label.textContent = 'Removing duplicate files…';
      }
      return;
    }

    sse.close();

    if (data.state === 'done') {
      updateProgress(zone, 100, color, tool.id);
      removeArchiveDuplicatePanel();
      const dlName = data.filename || outputFilename;
      const onReset = () => {
        removeArchiveDuplicatePanel();
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

      pushNotification({
        type: 'success',
        message: 'Archive duplicates removed successfully!',
        detail: `Created ${dlName} with ${deletePaths.length} duplicate files removed.`,
        autoDismiss: false,
      });
      return;
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
  };
}
