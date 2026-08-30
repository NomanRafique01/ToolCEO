/**
 * tools/images/image_preview.js
 *
 * HD image preview for all Images-category tools.
 *
 * When the user drops or selects an image file while any Images tool is
 * active, this module replaces the default drop-zone content with:
 *   • a full-width <img> preview (object-fit: contain, min-height 300px)
 *   • a metadata row: filename | file size | dimensions | format
 *   • a "×" remove button that reverts to the idle tool-ready state
 *
 * The preview is purely local — no upload, no backend call.  Actual
 * conversion logic is wired separately (per-tool) once sub-cards are built.
 *
 * Supported formats: jpg/jpeg, png, webp, gif, bmp, tiff/tif, svg
 *
 * Exports:
 *   isImageTool(toolId)          → boolean
 *   handleImageFilePicked(file)  → void
 *   removeImagePreview()         → void
 */

import { getActiveTool }    from '../../scripts/toolstate.js';
import { pushNotification } from '../../scripts/notificationStore.js';
import { resetZoneContent } from '../shared/progress.js';

// ─── TOOL-ID REGISTRY ────────────────────────────────────────────────────────
// All tool IDs that belong to the Images category.
// When sub-tools are added they will have ids like 'jpg-png', 'png-webp', etc.
// For now only the top-level format entry IDs exist; we keep them here so the
// dispatch in dropzone.js can call isImageTool() generically.

const _IMG_TOOL_IDS = new Set([
  'jpg', 'png', 'webp', 'svg', 'gif', 'bmp', 'tiff',
]);

// Sub-tool ids will follow the pattern <src>-<dst> e.g. 'jpg-png'.
// We recognise them by checking if the source prefix is an image format.
const _IMG_PREFIXES = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'tiff']);

/**
 * Returns true if the given tool id belongs to the Images category.
 * Handles both top-level format ids ('jpg') and future sub-tool ids ('jpg-png').
 * @param {string} toolId
 */
export function isImageTool(toolId) {
  if (!toolId) return false;
  if (_IMG_TOOL_IDS.has(toolId)) return true;
  // Sub-tool prefix match: 'jpg-png' → prefix 'jpg'
  const prefix = toolId.split('-')[0];
  return _IMG_PREFIXES.has(prefix);
}

// ─── ACCEPTED EXTENSIONS ─────────────────────────────────────────────────────
const _ACCEPTED_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.svg',
]);

// Map extension → display format label
const _FORMAT_LABELS = {
  '.jpg'  : 'JPEG',
  '.jpeg' : 'JPEG',
  '.png'  : 'PNG',
  '.webp' : 'WEBP',
  '.gif'  : 'GIF',
  '.bmp'  : 'BMP',
  '.tiff' : 'TIFF',
  '.tif'  : 'TIFF',
  '.svg'  : 'SVG',
};

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let _currentObjectUrl = null;

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmtSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function _ext(filename) {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

// ─── REMOVE PREVIEW ───────────────────────────────────────────────────────────

/** Remove the preview wrap and revoke the object URL if one exists. */
export function removeImagePreview() {
  if (_currentObjectUrl) {
    URL.revokeObjectURL(_currentObjectUrl);
    _currentObjectUrl = null;
  }
  const zone = document.getElementById('drop-zone');
  if (!zone) return;
  zone.querySelectorAll('.dz-img-preview-wrap').forEach((el) => el.remove());
  zone.classList.remove('dz-has-img-preview');
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

/**
 * Called when the user drops or selects a file while an Images tool is active.
 * Validates the extension, builds the preview, injects it into the drop zone.
 * @param {File} file
 */
export function handleImageFilePicked(file) {
  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#00E5C0') : '#00E5C0';

  // ── Extension validation ────────────────────────────────────────────────
  const extension = _ext(file.name);
  if (!_ACCEPTED_EXTS.has(extension)) {
    pushNotification({
      type: 'warning',
      message: 'Invalid Image Format',
      detail: `Expected JPG, PNG, WEBP, GIF, BMP, TIFF, or SVG. Got "${extension || 'unknown'}".`,
    });
    return;
  }

  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  // Clear any existing state (progress ring, previous preview, etc.)
  resetZoneContent(zone);
  removeImagePreview();

  // Revoke previous object URL to avoid leaks
  if (_currentObjectUrl) {
    URL.revokeObjectURL(_currentObjectUrl);
    _currentObjectUrl = null;
  }

  // ── Build object URL for the image ─────────────────────────────────────
  const objectUrl = URL.createObjectURL(file);
  _currentObjectUrl = objectUrl;

  const formatLabel = _FORMAT_LABELS[extension] || extension.replace('.', '').toUpperCase();
  const sizeLabel   = _fmtSize(file.size);

  // ── Build compact thumbnail card (matches PDF / DOCX thumb style) ───────
  const wrap = document.createElement('div');
  wrap.className = 'dz-img-preview-wrap';
  // Set colour token on the outermost wrap so all children inherit it
  wrap.style.setProperty('--img-prev-color', color);

  wrap.innerHTML = `
    <div class="dz-img-preview-card">
      <div class="dz-img-preview-frame">
        <img
          class="dz-img-preview-img"
          src="${_esc(objectUrl)}"
          alt="${_esc(file.name)}"
          draggable="false"
        />
      </div>
      <button class="dz-img-preview-remove" type="button" aria-label="Remove image">&#x2715;</button>
    </div>
    <span class="dz-img-preview-name" title="${_esc(file.name)}">${_esc(file.name)}</span>
    <div class="dz-img-preview-meta">
      <span class="dz-img-preview-size">${sizeLabel}</span>
      <span class="dz-img-preview-fmt">${formatLabel}</span>
    </div>`;

  zone.appendChild(wrap);
  zone.classList.add('dz-has-img-preview');

  // ── Remove button ───────────────────────────────────────────────────────
  const removeBtn = wrap.querySelector('.dz-img-preview-remove');
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeImagePreview();
    // Re-apply tool-selected appearance after clearing preview
    const currentTool = getActiveTool();
    if (currentTool) {
      // Trigger a synthetic tool-change so _updateDropZone re-runs
      import('../../scripts/toolstate.js').then(({ setActiveTool }) => {
        setActiveTool({ ...currentTool });
      });
    }
  });
}

