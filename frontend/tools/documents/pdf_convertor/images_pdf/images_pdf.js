/**
 * tools/documents/pdf_convertor/images_pdf/images_pdf.js
 *
 * Images → PDF Converter — fully redesigned to mirror the PNG-to-PDF UX.
 *
 * Features:
 *  • Multi-image queue with thumbnail cards in the drop zone.
 *  • Mode toggle: "Individual PDFs" (each image → its own PDF in a ZIP)
 *    vs "Single PDF" (all images merged into one PDF in page order).
 *  • When Single PDF is selected:
 *    - Reorder banner appears in the drop zone.
 *    - Cards display numbered ordinal badges (1, 2, 3…).
 *    - Full drag-to-reorder supported.
 *  • Supports ALL image formats: PNG, JPG/JPEG, WEBP, BMP, GIF, TIFF, SVG, AVIF, HEIC.
 *  • Clear "Add Image" and "Clear All" toolbar controls.
 *
 * Exports:
 *   handleImagesPdfFilesPicked(files)  – entry point from dropzone.js
 *   removeImagesPdfPanel()             – teardown on tool change / reset
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

/** @type {{ file: File, thumbnail: string|null }[]} */
let _queue   = [];
/** 'single' | 'individual' */
let _pdfMode = 'individual';

// Accepted image extensions
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif',
  '.tiff', '.tif', '.svg', '.avif', '.heic', '.heif',
]);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _isImage(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function _readDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function _getColor() {
  const tool = getActiveTool();
  return tool ? (tool.color || '#F472B6') : '#F472B6';
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

export function removeImagesPdfPanel() {
  document.getElementById('images-pdf-queue-panel')?.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-queue-toolbar')?.remove();
    zone.querySelector('.dz-imgpdf-thumb-strip')?.remove();
    zone.querySelector('.dz-imgpdf-reorder-banner')?.remove();
    zone.classList.remove('dz-has-imgpdf-thumbs');
  }

  _queue   = [];
  _pdfMode = 'individual';
}

// ─── THUMBNAIL STRIP ──────────────────────────────────────────────────────────

function _renderThumbStrip() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const color = _getColor();

  // Remove old
  zone.querySelector('.dz-queue-toolbar')?.remove();
  zone.querySelector('.dz-imgpdf-thumb-strip')?.remove();
  zone.querySelector('.dz-imgpdf-reorder-banner')?.remove();

  if (_queue.length === 0) {
    zone.classList.remove('dz-has-imgpdf-thumbs');
    return;
  }

  zone.classList.add('dz-has-imgpdf-thumbs');

  // ── Toolbar ──────────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.className = 'dz-queue-toolbar';
  toolbar.innerHTML = `
    <div class="dz-queue-toolbar-left">
      <span class="dz-queue-count-pill" style="background:${color}; color:#0A1F1C">
        ${_queue.length} ${_queue.length === 1 ? 'Image' : 'Images'}
      </span>
      <span class="dz-queue-info-text" id="dz-imgpdf-toolbar-hint">
        ${_pdfMode === 'single'
          ? 'Drag images to reorder PDF pages'
          : 'Each image will become a separate PDF'}
      </span>
    </div>
    <div class="dz-queue-toolbar-actions">
      <button type="button" class="dz-queue-add-btn" id="dz-imgpdf-toolbar-add"
              title="Add more images"
              style="color:${color};border-color:color-mix(in srgb,${color} 35%,transparent);background:color-mix(in srgb,${color} 12%,transparent)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
        Add Image
      </button>
      <button type="button" class="dz-queue-clear-btn" id="dz-imgpdf-toolbar-clear" title="Clear all images">
        Clear All
      </button>
    </div>
  `;

  toolbar.querySelector('#dz-imgpdf-toolbar-add').addEventListener('click', (e) => {
    e.stopPropagation();
    _openFilePicker();
  });

  toolbar.querySelector('#dz-imgpdf-toolbar-clear').addEventListener('click', (e) => {
    e.stopPropagation();
    removeImagesPdfPanel();
    const z = document.getElementById('drop-zone');
    if (z) {
      resetZoneContent(z);
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        const t = getActiveTool();
        if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
      }).catch(() => {});
    }
  });

  zone.appendChild(toolbar);

  // ── Reorder banner (only in single mode) ─────────────────────────────────
  if (_pdfMode === 'single' && _queue.length > 1) {
    const banner = document.createElement('div');
    banner.className = 'dz-imgpdf-reorder-banner';
    banner.style.borderColor = `color-mix(in srgb, ${color} 30%, transparent)`;
    banner.style.background  = `color-mix(in srgb, ${color} 8%, transparent)`;
    banner.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="5" cy="4" r="1.2" fill="${color}"/>
        <circle cx="5" cy="8" r="1.2" fill="${color}"/>
        <circle cx="5" cy="12" r="1.2" fill="${color}"/>
        <circle cx="11" cy="4" r="1.2" fill="${color}"/>
        <circle cx="11" cy="8" r="1.2" fill="${color}"/>
        <circle cx="11" cy="12" r="1.2" fill="${color}"/>
      </svg>
      <span style="color:${color}">Drag images to reorder PDF pages</span>
    `;
    zone.appendChild(banner);
  }

  // ── Card strip ───────────────────────────────────────────────────────────
  const strip = document.createElement('div');
  strip.className = 'dz-imgpdf-thumb-strip';

  _queue.forEach((item, idx) => {
    strip.appendChild(_buildThumbCard(item, idx, color));
  });

  // "Add more" button in strip
  const addBtn = document.createElement('button');
  addBtn.className = 'dz-imgpdf-add-btn';
  addBtn.title = 'Add more images';
  addBtn.type  = 'button';
  addBtn.style.setProperty('--imgpdf-color', color);
  addBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span>Add Image</span>`;
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _openFilePicker();
  });
  strip.appendChild(addBtn);

  zone.appendChild(strip);

  // Enable drag-to-reorder only in single PDF mode
  if (_pdfMode === 'single') {
    _initDragReorder(strip, color);
  }
}

// ─── SINGLE CARD ──────────────────────────────────────────────────────────────

function _buildThumbCard(item, idx, color) {
  const card = document.createElement('div');
  card.className   = 'dz-imgpdf-card';
  card.dataset.idx = String(idx);
  card.style.setProperty('--imgpdf-color', color);

  // Only make draggable in single mode
  if (_pdfMode === 'single') {
    card.draggable = true;
    card.classList.add('dz-imgpdf-card--draggable');
  }

  const shortName = item.file.name.length > 18
    ? item.file.name.slice(0, 15) + '…'
    : item.file.name;

  const thumbContent = item.thumbnail
    ? `<img class="dz-imgpdf-thumb-img" src="${item.thumbnail}"
            alt="${_esc(item.file.name)}" draggable="false"/>`
    : `<svg class="dz-imgpdf-thumb-fallback" viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="90" height="90" fill="#1c2128"/>
        <rect x="10" y="10" width="70" height="70" rx="6" fill="#2d333b" stroke="${color}" stroke-width="1.5"/>
        <circle cx="32" cy="36" r="8" fill="${color}" opacity="0.6"/>
        <path d="M10 65 l20-20 18 18 12-12 20 20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

  // Show ordinal only in single mode
  const ordinalHTML = (_pdfMode === 'single')
    ? `<span class="dz-imgpdf-ordinal" aria-label="Position ${idx + 1}">${idx + 1}</span>`
    : '';

  // Drag hint dots only in single mode
  const dragHintHTML = (_pdfMode === 'single') ? `
    <div class="dz-imgpdf-drag-hint" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="3" cy="3" r="1" fill="currentColor"/>
        <circle cx="7" cy="3" r="1" fill="currentColor"/>
        <circle cx="3" cy="7" r="1" fill="currentColor"/>
        <circle cx="7" cy="7" r="1" fill="currentColor"/>
      </svg>
    </div>` : '';

  card.innerHTML = `
    ${ordinalHTML}
    <div class="dz-imgpdf-thumb-frame" style="border-color:${color}">
      ${thumbContent}
    </div>
    ${dragHintHTML}
    <span class="dz-imgpdf-card-name" title="${_esc(item.file.name)}">${_esc(shortName)}</span>
    <button class="dz-imgpdf-card-remove" title="Remove this image"
            aria-label="Remove ${_esc(item.file.name)}">&#x2715;</button>`;

  card.querySelector('.dz-imgpdf-card-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    _queue.splice(idx, 1);
    _renderThumbStrip();
    _renderQueuePanel();
  });

  return card;
}

// ─── DRAG-TO-REORDER ──────────────────────────────────────────────────────────

function _initDragReorder(strip, color) {
  let _dragSrcIdx     = -1;
  let _scrollRaf      = null;
  let _lockedScrollTop= null;
  let _isCardDragging = false;
  let _pinRaf         = null;

  function _onWheelDuringDrag(e) {
    if (_isCardDragging) e.preventDefault();
  }

  function _lockMainScroll() {
    const mc = document.getElementById('main-content');
    if (!mc) return;
    _lockedScrollTop = mc.scrollTop;
    _isCardDragging  = true;

    if (!mc._dzScrollLockBound) {
      mc._dzScrollLockBound = true;
      mc.addEventListener('scroll', () => {
        if (_isCardDragging && _lockedScrollTop !== null) {
          if (mc.scrollTop !== _lockedScrollTop) mc.scrollTop = _lockedScrollTop;
        }
      }, { passive: false });
    }

    function _pinFrame() {
      if (!_isCardDragging) return;
      if (mc.scrollTop !== _lockedScrollTop) mc.scrollTop = _lockedScrollTop;
      _pinRaf = requestAnimationFrame(_pinFrame);
    }
    _pinRaf = requestAnimationFrame(_pinFrame);
    window.addEventListener('wheel', _onWheelDuringDrag, { passive: false });
  }

  function _unlockMainScroll() {
    _isCardDragging = false;
    if (_pinRaf !== null) { cancelAnimationFrame(_pinRaf); _pinRaf = null; }
    window.removeEventListener('wheel', _onWheelDuringDrag);
    const mc = document.getElementById('main-content');
    if (mc && _lockedScrollTop !== null) mc.scrollTop = _lockedScrollTop;
    _lockedScrollTop = null;
  }

  function _lockDropZone() {
    const z = document.getElementById('drop-zone');
    if (z) z.dataset.cardDragging = '1';
  }
  function _unlockDropZone() {
    const z = document.getElementById('drop-zone');
    if (z) delete z.dataset.cardDragging;
  }

  strip.querySelectorAll('.dz-imgpdf-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      _dragSrcIdx = parseInt(card.dataset.idx, 10);
      card.classList.add('dz-imgpdf-card--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(_dragSrcIdx));
      _lockDropZone();
      _lockMainScroll();
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dz-imgpdf-card--dragging');
      strip.querySelectorAll('.dz-imgpdf-card--drag-over')
           .forEach((c) => c.classList.remove('dz-imgpdf-card--drag-over'));
      _unlockMainScroll();
      _unlockDropZone();
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      strip.querySelectorAll('.dz-imgpdf-card--drag-over')
           .forEach((c) => c.classList.remove('dz-imgpdf-card--drag-over'));
      card.classList.add('dz-imgpdf-card--drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('dz-imgpdf-card--drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _unlockMainScroll();
      _unlockDropZone();

      strip.querySelectorAll('.dz-imgpdf-card--drag-over')
           .forEach((c) => c.classList.remove('dz-imgpdf-card--drag-over'));

      const targetIdx = parseInt(card.dataset.idx, 10);
      if (_dragSrcIdx === targetIdx || _dragSrcIdx < 0) { _dragSrcIdx = -1; return; }

      // Reorder _queue array
      const moved = _queue.splice(_dragSrcIdx, 1)[0];
      _queue.splice(targetIdx, 0, moved);

      // Move DOM nodes in-place (no full re-render for smooth UX)
      const cards   = Array.from(strip.querySelectorAll('.dz-imgpdf-card'));
      const srcCard = cards[_dragSrcIdx];
      const tgtCard = cards[targetIdx];
      if (srcCard && tgtCard) {
        if (_dragSrcIdx < targetIdx) {
          tgtCard.after(srcCard);
        } else {
          tgtCard.before(srcCard);
        }
        // Update indices + ordinals
        strip.querySelectorAll('.dz-imgpdf-card').forEach((c, i) => {
          c.dataset.idx = String(i);
          const ord = c.querySelector('.dz-imgpdf-ordinal');
          if (ord) { ord.textContent = String(i + 1); ord.setAttribute('aria-label', `Position ${i + 1}`); }
        });
      }
      _dragSrcIdx = -1;

      // Update queue panel hint
      _refreshQueuePanelHint();
    });
  });
}

// ─── FILE PICKER ──────────────────────────────────────────────────────────────

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
  inp.accept   = 'image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tiff,.tif,.svg,.avif,.heic,.heif';

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

// ─── QUEUE PANEL ──────────────────────────────────────────────────────────────

function _renderQueuePanel() {
  document.getElementById('images-pdf-queue-panel')?.remove();

  if (_queue.length < 1) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#F472B6') : '#F472B6';

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const total   = _queue.length;
  const isMulti = total > 1;

  // Output hint text
  let outHint;
  if (isMulti) {
    outHint = _pdfMode === 'single'
      ? `${total} images → <strong>1</strong> merged PDF`
      : `${total} images → <strong>${total}</strong> PDFs packed in a .zip`;
  } else {
    outHint = `1 image → converted <strong>.pdf</strong> file`;
  }

  const extHint     = (isMulti && _pdfMode === 'individual') ? 'zip' : 'pdf';
  const defaultName = _queue.length > 0
    ? _queue[0].file.name.replace(/\.[^.]+$/, '') + '_converted'
    : 'images_converted';

  // Mode toggle — only shown when 2+ images
  const modeToggleHTML = isMulti ? `
    <div class="imgpdf-mode-row" id="imgpdf-mode-row">
      <span class="imgpdf-mode-label">Output mode</span>
      <div class="imgpdf-mode-toggle">
        <button class="imgpdf-mode-btn${_pdfMode === 'individual' ? ' imgpdf-mode-btn--active' : ''}"
                data-mode="individual" type="button">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 1h7l3 3v11H2V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M9 1v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
          </svg>
          Individual PDFs
        </button>
        <button class="imgpdf-mode-btn${_pdfMode === 'single' ? ' imgpdf-mode-btn--active' : ''}"
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
  panel.id        = 'images-pdf-queue-panel';
  panel.className = 'imgpdf-queue-panel';
  panel.style.setProperty('--imgpdf-color', color);

  panel.innerHTML = `
    <div class="imgpdf-header">
      <span class="imgpdf-summary-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="6" height="6" rx="1" stroke="${color}" stroke-width="1.3"/>
          <circle cx="3" cy="4" r="0.8" stroke="${color}" stroke-width="1"/>
          <path d="M1 7l2-2 2 2 1-1 1 1" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 9l2 1.5L7 12" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="9" y="2" width="6" height="8" rx="1" stroke="${color}" stroke-width="1.3"/>
          <path d="M12 2l3 3h-3V2Z" stroke="${color}" stroke-width="1.1" stroke-linejoin="round"/>
        </svg>
        <span class="imgpdf-summary-text" id="imgpdf-summary-text">
          <strong>${total}</strong> image${total !== 1 ? 's' : ''}
          &nbsp;·&nbsp;
          ${outHint}
        </span>
      </span>
    </div>

    ${modeToggleHTML}

    <div class="imgpdf-actions">
      <input class="imgpdf-filename-input" id="imgpdf-filename-input"
             type="text" placeholder="Output filename (optional)"
             value="${_esc(defaultName)}" maxlength="120" spellcheck="false"/>
      <span class="imgpdf-filename-ext" id="imgpdf-filename-ext">.${extHint}</span>
      <button class="imgpdf-convert-btn" id="imgpdf-convert-btn">
        Convert to PDF
      </button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('imgpdf-queue-panel--visible'));

  // ── Mode toggle wiring ────────────────────────────────────────────────────
  if (isMulti) {
    panel.querySelectorAll('.imgpdf-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        _pdfMode = btn.dataset.mode;

        // Update button active state
        panel.querySelectorAll('.imgpdf-mode-btn').forEach((b) =>
          b.classList.toggle('imgpdf-mode-btn--active', b.dataset.mode === _pdfMode)
        );

        // Update summary text
        const summaryEl = panel.querySelector('#imgpdf-summary-text');
        const extEl     = panel.querySelector('#imgpdf-filename-ext');
        const newHint   = _pdfMode === 'single'
          ? `${total} images → <strong>1</strong> merged PDF`
          : `${total} images → <strong>${total}</strong> PDFs packed in a .zip`;
        if (summaryEl) {
          summaryEl.innerHTML = `<strong>${total}</strong> image${total !== 1 ? 's' : ''} &nbsp;·&nbsp; ${newHint}`;
        }
        if (extEl) extEl.textContent = `.${_pdfMode === 'individual' ? 'zip' : 'pdf'}`;

        // Update toolbar hint
        const toolbarHint = document.getElementById('dz-imgpdf-toolbar-hint');
        if (toolbarHint) {
          toolbarHint.textContent = _pdfMode === 'single'
            ? 'Drag images to reorder PDF pages'
            : 'Each image will become a separate PDF';
        }

        // Re-render strip to toggle drag+ordinals
        _renderThumbStrip();
      });
    });
  }

  // ── Convert button ────────────────────────────────────────────────────────
  panel.querySelector('#imgpdf-convert-btn').addEventListener('click', () => {
    if (_queue.length < 1) return;
    const nameInput = panel.querySelector('#imgpdf-filename-input');
    const outName   = (nameInput ? nameInput.value.trim() : '') || 'images_converted';
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    _submitConvert(outName);
  });
}

function _refreshQueuePanelHint() {
  const panel = document.getElementById('images-pdf-queue-panel');
  if (!panel) return;

  const total      = _queue.length;
  const summaryEl  = panel.querySelector('#imgpdf-summary-text');
  if (summaryEl) {
    const hint = _pdfMode === 'single'
      ? `${total} images → <strong>1</strong> merged PDF`
      : `${total} images → <strong>${total}</strong> PDFs packed in a .zip`;
    summaryEl.innerHTML = `<strong>${total}</strong> image${total !== 1 ? 's' : ''} &nbsp;·&nbsp; ${hint}`;
  }
}

// ─── ADD FILES ────────────────────────────────────────────────────────────────

async function _addFiles(fileArray) {
  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#F472B6') : '#F472B6';
  const zone  = document.getElementById('drop-zone');

  const imageFiles = fileArray.filter(_isImage);

  if (imageFiles.length < fileArray.length) {
    pushNotification({
      type: 'warning',
      message: 'Some files were skipped — only image files are accepted (PNG, JPG, WEBP, BMP, GIF, TIFF, SVG, AVIF, HEIC).',
    });
  }
  if (imageFiles.length === 0) return;

  // Deduplicate by name+size
  const _key     = (f) => `${f.name}::${f.size}`;
  const existing = new Set(_queue.map((item) => _key(item.file)));
  const newImages = imageFiles.filter((f) => !existing.has(_key(f)));
  if (newImages.length === 0) return;

  const isFirstBatch = _queue.length === 0;
  if (isFirstBatch && zone) {
    showScanProgress(zone, color, `Loading ${newImages.length} image${newImages.length !== 1 ? 's' : ''}…`);
  }

  const BATCH_SIZE = 6;
  for (let i = 0; i < newImages.length; i += BATCH_SIZE) {
    const chunk = newImages.slice(i, i + BATCH_SIZE);

    if (isFirstBatch && zone) {
      const currentCount = Math.min(i + chunk.length, newImages.length);
      const pct = Math.round((currentCount / newImages.length) * 100);
      updateProgress(zone, pct, color, tool ? tool.id : 'images-pdf');
      const label = zone.querySelector('.dz-progress-label');
      if (label) label.textContent = `Loading ${currentCount} of ${newImages.length}`;
    }

    await Promise.all(chunk.map(async (file) => {
      let thumbnail = null;
      try { thumbnail = await _readDataUri(file); } catch (_) {}
      _queue.push({ file, thumbnail });
    }));
  }

  if (isFirstBatch && zone) resetZoneContent(zone);

  _renderThumbStrip();
  _renderQueuePanel();
}

// ─── PUBLIC: FILE PICKED ──────────────────────────────────────────────────────

export async function handleImagesPdfFilesPicked(files) {
  await _addFiles(Array.from(files));
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitConvert(outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone       = document.getElementById('drop-zone');
  const color      = tool.color || '#F472B6';
  const isMulti    = _queue.length > 1;
  const pdfModeCopy = _pdfMode;

  // Determine expected extension
  const earlyExt  = (isMulti && pdfModeCopy === 'individual') ? 'zip' : 'pdf';
  const earlyName = outputFilename.endsWith('.pdf') || outputFilename.endsWith('.zip')
    ? outputFilename
    : `${outputFilename}.${earlyExt}`;

  // Clear UI
  zone?.querySelector('.dz-queue-toolbar')?.remove();
  zone?.querySelector('.dz-imgpdf-thumb-strip')?.remove();
  zone?.querySelector('.dz-imgpdf-reorder-banner')?.remove();
  zone?.classList.remove('dz-has-imgpdf-thumbs');
  document.getElementById('images-pdf-queue-panel')?.remove();

  const fd = new FormData();
  _queue.forEach((item) => fd.append('files', item.file));
  fd.append('output_filename', outputFilename);
  fd.append('pdf_mode', pdfModeCopy);

  // Clear local state before fetch (prevent stale refs)
  const queueSnapshot = _queue.slice();
  _queue   = [];
  _pdfMode = 'individual';

  showProgress(zone, 0, color, 'Converting…', tool.id);
  const clientJobKey = setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/images/pdf/convert`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      const msg    = Array.isArray(detail)
        ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
        : (typeof detail === 'string' ? detail : JSON.stringify(detail));
      throw new Error(msg || `Server error ${res.status}`);
    }
    jobId = json.job_id;
  } catch (err) {
    showError(zone, `Upload failed: ${err.message}`, tool.id);
    // Restore queue on failure
    _queue = queueSnapshot;
    clearBgJob(clientJobKey);
    return;
  }

  const sse    = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct  = 0;

  setBgJob({ jobId, tool, filename: earlyName, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct  = typeof progress === 'number' ? progress : lastPct;
    lastPct    = pct;

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

      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeImagesPdfPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
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
      clearBgJob(jobId);
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
    clearBgJob(jobId);
  };
}
