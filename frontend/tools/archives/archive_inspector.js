/**
 * frontend/tools/archives/archive_inspector.js
 *
 * Archive Inspector — read-only archive contents viewer.
 * Drop or pick any archive (ZIP, RAR, 7Z, TAR, GZ, etc.) and see its
 * full file/folder tree with per-entry sizes, compression method, and
 * overall summary. No extraction, no modification — inspect only.
 *
 * UX pattern matches archive_extract.js exactly:
 *  1. File dropped/picked → scan ring
 *  2. POST /api/archives/inspect → info JSON
 *  3. resetZoneContent → show thumb inside zone
 *  4. Show inspector panel below zone (replaces settings panel)
 *  5. "Change file" resets everything
 */

import { getActiveTool } from '../../scripts/toolstate.js';
import { pushNotification } from '../../scripts/notificationStore.js';
import {
  showScanProgress,
  resetZoneContent,
  showError,
} from '../shared/progress.js';
import { getArchiveFileIconSvg, getArchiveFormatLabel } from '../shared/archiveIcon.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _inspectFile = null;

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

function _fmtRatio(ratio) {
  if (ratio == null || ratio === 0) return '—';
  return `${ratio}%`;
}

// SVG icons for tree rows
const FOLDER_SVG = `<svg class="ai-row-icon ai-row-icon--folder" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.086a2 2 0 0 1 1.414.586l1.414 1.414A2 2 0 0 0 13.828 6.5H18.5A2.5 2.5 0 0 1 21 9v9.5A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-12Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
</svg>`;

const FILE_SVG = `<svg class="ai-row-icon ai-row-icon--file" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M5.5 4A2.5 2.5 0 0 1 8 1.5h7l6 6V20a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 20V4Z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M15 1.5V7.5h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const LOCK_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="color:#facc15;flex-shrink:0">
  <rect x="4" y="11" width="16" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
  <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// ─── PUBLIC TEARDOWN ──────────────────────────────────────────────────────────

export function removeArchiveInspectorPanel() {
  const panel = document.getElementById('archive-inspector-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-inspect-thumb-wrap')?.remove();
    zone.classList.remove('dz-has-inspect-thumb');
  }

  _inspectFile = null;
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

function _showInspectThumb(zone, file, color, info) {
  zone.querySelector('.dz-inspect-thumb-wrap')?.remove();

  const format   = getArchiveFormatLabel(info?.format || file.name);
  const thumbSvg = getArchiveFileIconSvg(format, color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-inspect-thumb-wrap';
  wrap.style.setProperty('--inspect-color', color);

  wrap.innerHTML = `
    <div class="dz-inspect-thumb-card">
      <div class="dz-inspect-thumb-frame">
        ${thumbSvg}
      </div>
      <button type="button" class="dz-inspect-thumb-remove" title="Remove file" aria-label="Remove archive">×</button>
    </div>
    <span class="dz-inspect-thumb-name" title="${_esc(file.name)}">${_esc(file.name)}</span>
    <span class="dz-inspect-thumb-size">${_fmt(file.size)}</span>
  `;

  zone.classList.add('dz-has-inspect-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-inspect-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeArchiveInspectorPanel();
    resetZoneContent(zone);
    import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── INSPECTOR PANEL ──────────────────────────────────────────────────────────

function _showInspectorPanel(file, info, color) {
  document.getElementById('archive-inspector-panel')?.remove();

  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const panel = document.createElement('section');
  panel.id = 'archive-inspector-panel';
  panel.className = 'archive-inspector-panel';
  panel.style.setProperty('--inspect-color', color);

  const format             = getArchiveFormatLabel(info?.format || file.name);
  const fileCount          = info?.file_count ?? 0;
  const folderCount        = info?.folder_count ?? 0;
  const uncompressedSize   = info?.uncompressed_size ?? 0;
  const compressedSize     = info?.compressed_size ?? 0;
  const compressionRatio   = info?.compression_ratio ?? 0;
  const compressionMethod  = info?.compression_method || '—';
  const isEncrypted        = Boolean(info?.is_encrypted);
  const entries            = info?.entries || [];

  // Build the file tree rows
  const MAX_ROWS = 500;
  const shown    = entries.slice(0, MAX_ROWS);

  const rowsHtml = shown.map((entry) => {
    const icon    = entry.is_folder ? FOLDER_SVG : FILE_SVG;
    const sizeStr = entry.is_folder ? '—' : _fmt(entry.size);
    const pkdStr  = entry.is_folder ? '—' : (entry.packed > 0 ? _fmt(entry.packed) : '—');
    const methodStr = entry.method || '—';
    const lockBadge = entry.encrypted ? `<span class="ai-row-locked" title="Encrypted">${LOCK_SVG}</span>` : '';
    // Compute per-entry ratio
    let ratioStr = '—';
    if (!entry.is_folder && entry.size > 0 && entry.packed > 0) {
      const r = Math.round(100 * (1 - entry.packed / entry.size));
      ratioStr = `${r}%`;
    }
    return `
      <div class="ai-table-row">
        <span class="ai-col-name" title="${_esc(entry.path)}">${icon}${lockBadge}<span class="ai-col-name-text">${_esc(entry.path)}</span></span>
        <span class="ai-col-size">${sizeStr}</span>
        <span class="ai-col-packed">${pkdStr}</span>
        <span class="ai-col-ratio">${ratioStr}</span>
        <span class="ai-col-method">${_esc(methodStr)}</span>
      </div>`;
  }).join('');

  const moreHtml = entries.length > MAX_ROWS
    ? `<div class="ai-table-more">+ ${entries.length - MAX_ROWS} more entries…</div>`
    : '';

  panel.innerHTML = `
    <div class="ai-panel-header">
      <div class="ai-panel-stats">
        <span class="ai-stat-badge">
          <strong>${format.toUpperCase()}</strong>
        </span>
        <span class="ai-stat-badge">
          <strong>${fileCount}</strong> ${fileCount === 1 ? 'file' : 'files'}
        </span>
        ${folderCount > 0 ? `
        <span class="ai-stat-badge">
          <strong>${folderCount}</strong> ${folderCount === 1 ? 'folder' : 'folders'}
        </span>` : ''}
        ${uncompressedSize > 0 ? `
        <span class="ai-stat-badge">
          Total: <strong>${_fmt(uncompressedSize)}</strong>
        </span>` : ''}
        ${compressionRatio > 0 ? `
        <span class="ai-stat-badge">
          Ratio: <strong>${_fmtRatio(compressionRatio)}</strong>
        </span>` : ''}
        ${isEncrypted ? `
        <span class="ai-stat-badge ai-stat-badge--locked">
          ${LOCK_SVG} Password Protected
        </span>` : ''}
      </div>
      <button type="button" class="ai-change-btn" id="ai-change-file-btn">Change file</button>
    </div>

    ${entries.length > 0 ? `
    <div class="ai-table-wrap">
      <div class="ai-table-header">
        <span class="ai-col-name">Name</span>
        <span class="ai-col-size">Size</span>
        <span class="ai-col-packed">Packed</span>
        <span class="ai-col-ratio">Ratio</span>
        <span class="ai-col-method">Method</span>
      </div>
      <div class="ai-table-body">
        ${rowsHtml}
        ${moreHtml}
      </div>
    </div>` : `
    <div class="ai-table-empty">No file entries found in this archive.</div>`}

    <div class="ai-summary-bar">
      <div class="ai-summary-cell">
        <span class="ai-summary-label">Format</span>
        <span class="ai-summary-value">${_esc(format.toUpperCase())}</span>
      </div>
      <div class="ai-summary-cell">
        <span class="ai-summary-label">Files</span>
        <span class="ai-summary-value">${fileCount + folderCount}</span>
      </div>
      <div class="ai-summary-cell">
        <span class="ai-summary-label">Uncompressed</span>
        <span class="ai-summary-value">${_fmt(uncompressedSize)}</span>
      </div>
      ${compressedSize > 0 ? `
      <div class="ai-summary-cell">
        <span class="ai-summary-label">Compressed</span>
        <span class="ai-summary-value">${_fmt(compressedSize)}</span>
      </div>` : ''}
      ${compressionRatio > 0 ? `
      <div class="ai-summary-cell">
        <span class="ai-summary-label">Compression</span>
        <span class="ai-summary-value ai-summary-value--accent">${_fmtRatio(compressionRatio)} saved</span>
      </div>` : ''}
      <div class="ai-summary-cell">
        <span class="ai-summary-label">Method</span>
        <span class="ai-summary-value">${_esc(compressionMethod)}</span>
      </div>
    </div>
  `;

  zone.parentElement?.appendChild(panel);

  // Wire Change File button
  panel.querySelector('#ai-change-file-btn')?.addEventListener('click', () => {
    const input = document.getElementById('file-input');
    if (input) input.click();
  });
}

// ─── PUBLIC FILE HANDLER ──────────────────────────────────────────────────────

export async function handleArchiveInspectorFilePicked(file) {
  if (!file) return;

  const tool = getActiveTool();
  if (!tool || tool.id !== 'archive-inspect') return;

  // Accept any archive extension
  const ARCHIVE_EXTS = [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.cab',
    '.iso', '.dmg', '.wim', '.tar.gz', '.tar.bz2', '.tar.xz',
  ];
  const lname = file.name.toLowerCase();
  const isArchive = ARCHIVE_EXTS.some((ext) => lname.endsWith(ext));
  if (!isArchive) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid archive file (ZIP, RAR, 7Z, TAR, GZ…).',
    });
    return;
  }

  const color = tool.color || '#A78BFA';
  const zone  = document.getElementById('drop-zone');
  if (!zone) return;

  // Reset previous state
  removeArchiveInspectorPanel();
  showScanProgress(zone, color, 'archive-inspect');

  let info = null;
  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch(`${BACKEND}/api/archives/inspect`, {
      method: 'POST',
      body: form,
    });
    if (res.ok) {
      info = await res.json();
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.error) {
        resetZoneContent(zone);
        showError(zone, err.error);
        return;
      }
    }
  } catch (_) {
    // Network or server error — show friendly message
    resetZoneContent(zone);
    showError(zone, 'Could not reach backend. Make sure the app backend is running.');
    return;
  }

  resetZoneContent(zone);

  if (info?.needs_password) {
    pushNotification({
      type: 'warning',
      message: 'This archive is password-protected. Password-protected inspection is not yet supported.',
    });
    return;
  }

  _inspectFile = file;
  _showInspectThumb(zone, file, color, info);
  _showInspectorPanel(file, info, color);
}
