/**
 * tools/documents/pdf_tools/rotate/rotate.js
 *
 * Owns the Rotate Pages view swap, PDF.js thumbnail rendering, rotation state,
 * and frontend save request.
 */

import { pushNotification } from '../../../../scripts/notificationStore.js';
import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../../scripts/toolstate.js';
import { showProgress, updateProgress, showDownloadBlobCard, showError, resetZoneContent } from '../../../shared/progress.js';
import { buildConversionMeta } from '../../../../scripts/historyTracker.js';
import { ensurePdfJs, loadPdfDocument } from '../../../shared/pdfRenderer.js';

const BACKEND = 'http://127.0.0.1:8000';
const THUMBNAIL_SCALE = 1.5; // High definition scale for crisp page previews

let _fileInput = null;
let _selectedFile = null;
let _pdfDoc = null;
let _rotations = [];
let _deletedPages = new Set();
let _renderToken = 0;
let _activeContainer = null;
let _firstPageThumbShown = false;

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _isPdfFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf';
}

function _baseName(filename) {
  return String(filename || 'document').replace(/\.[^.]+$/, '');
}

function _fallbackPdfIcon(color) {
  return `<svg class="dz-pdf-thumb-icon" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
    <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
    <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
    <rect x="0" y="42" width="90" height="26" fill="${color}"/>
    <text x="45" y="60" font-family="Arial,sans-serif" font-size="14" font-weight="bold"
          fill="#ffffff" text-anchor="middle" dominant-baseline="middle">PDF</text>
    <line x1="12" y1="80" x2="78" y2="80" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
    <line x1="12" y1="89" x2="78" y2="89" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
    <line x1="12" y1="98" x2="55" y2="98" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function _showRotateDropzoneThumbnail(file, color, dataUri = null) {
  const zone = document.getElementById('drop-zone');
  if (!zone || !file) return;

  removeRotatePanel();

  const thumbContent = dataUri
    ? `<img class="dz-pdf-thumb-img" src="${dataUri}" alt="PDF preview" draggable="false" />`
    : _fallbackPdfIcon(color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-pdf-thumb-wrap dz-rotate-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-pdf-thumb-card">
      <div class="dz-pdf-thumb-frame" style="border: 2px solid ${color}; box-shadow: 0 4px 18px rgba(0,0,0,0.45);">
        ${thumbContent}
      </div>
      <button class="dz-pdf-thumb-remove dz-rotate-thumb-remove" title="Remove file" style="--thumb-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pdf-thumb-name">${_escHtml(file.name)}</span>`;

  zone.classList.add('dz-has-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-rotate-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    if (_activeContainer) _closeViewer(_activeContainer);
    removeRotatePanel();
  });
}

export function removeRotatePanel() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  zone.querySelectorAll('.dz-rotate-thumb-wrap').forEach((thumb) => thumb.remove());
  if (!zone.querySelector('.dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip')) {
    zone.classList.remove('dz-has-thumb');
  }
}

function _ensureFileInput() {
  if (_fileInput) return _fileInput;
  _fileInput = document.createElement('input');
  _fileInput.type = 'file';
  _fileInput.accept = '.pdf,application/pdf';
  _fileInput.style.display = 'none';
  document.body.appendChild(_fileInput);
  return _fileInput;
}

function _ensurePdfJs() {
  return ensurePdfJs();
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function _downloadBase64Pdf(base64, filename) {
  if (window.toolceo && window.toolceo.saveFileAs) {
    const meta = buildConversionMeta({ outputFilename: filename });
    return window.toolceo.saveFileAs(filename, base64, meta);
  }

  const bytes = atob(base64);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    const slice = bytes.slice(i, i + 8192);
    const arr = new Uint8Array(slice.length);
    for (let j = 0; j < slice.length; j += 1) arr[j] = slice.charCodeAt(j);
    chunks.push(arr);
  }

  const blob = new Blob(chunks, { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return Promise.resolve(true);
}

function _getSwapParts(container) {
  let target = container || document.getElementById('explore-section') || document.body;
  let swap = target.querySelector('#pdf-tools-swap');
  let cardView = target.querySelector('#pdf-tools-card-view');

  if (!swap) {
    const explore = document.getElementById('explore-section');
    if (explore) {
      target = explore;
      swap = explore.querySelector('#pdf-tools-swap');
      cardView = explore.querySelector('#pdf-tools-card-view');
    }
  }

  if (!swap) {
    swap = document.createElement('div');
    swap.id = 'pdf-tools-swap';
    swap.className = 'pdf-tools-swap';
    target.appendChild(swap);
  }

  if (!cardView) {
    cardView = swap.querySelector('#pdf-tools-card-view');
    if (!cardView) {
      cardView = document.createElement('div');
      cardView.id = 'pdf-tools-card-view';
      cardView.className = 'pdf-tools-card-view';
      swap.appendChild(cardView);
    }
  }

  let viewer = target.querySelector('#rotate-viewer') || swap.querySelector('#rotate-viewer');

  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'rotate-viewer';
    viewer.className = 'rotate-viewer';
    viewer.innerHTML = `
      <div class="rotate-topbar">
        <div class="rotate-topbar-row">
          <div class="rotate-topbar-left">
            <button class="rotate-back-btn" type="button" title="Back to PDF tools">
              <span aria-hidden="true">&larr;</span>
              <span>Back</span>
            </button>
            <div class="rotate-file-meta">
              <span class="rotate-file-name">No PDF selected</span>
              <span class="rotate-page-count">0 pages</span>
            </div>
          </div>
          <div class="rotate-actions">
            <button class="rotate-action-btn" type="button" data-rotate-all="left">Rotate All Left &#8634;</button>
            <button class="rotate-action-btn" type="button" data-rotate-all="right">Rotate All Right &#8635;</button>
            <button class="rotate-action-btn rotate-save-btn" type="button">Apply &amp; Save</button>
          </div>
        </div>
        <div class="rotate-search-row">
          <div class="rotate-search-wrap">
            <svg class="rotate-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M11 11L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <input class="rotate-search-input" type="text" placeholder="Go to page (e.g. 5)..." aria-label="Go to page" />
            <button class="rotate-search-btn" type="button" title="Find page">Find</button>
          </div>
        </div>
      </div>
      <div class="rotate-grid" role="list"></div>`;
    swap.appendChild(viewer);

    viewer.querySelector('.rotate-back-btn').addEventListener('click', () => _closeViewer(container));
    viewer.querySelector('[data-rotate-all="left"]').addEventListener('click', () => _rotateAll(-90, viewer));
    viewer.querySelector('[data-rotate-all="right"]').addEventListener('click', () => _rotateAll(90, viewer));
    viewer.querySelector('.rotate-save-btn').addEventListener('click', () => _applyAndSave(viewer));

    // Page search functionality (instant calculation & scroll target card to top of pages window)
    const searchInput = viewer.querySelector('.rotate-search-input');
    const searchBtn   = viewer.querySelector('.rotate-search-btn');

    const performSearch = (doScroll = true) => {
      const grid = viewer.querySelector('.rotate-grid');
      if (!searchInput || !grid) return;

      const val = searchInput.value.trim();
      const cards = viewer.querySelectorAll('.rotate-page-card');

      if (!val) {
        cards.forEach((c) => c.classList.remove('rotate-card-highlight'));
        return;
      }

      const matchNum = val.match(/\d+/);
      if (!matchNum) {
        cards.forEach((c) => c.classList.remove('rotate-card-highlight'));
        return;
      }

      const targetPageNum = parseInt(matchNum[0], 10);
      const targetIndex = targetPageNum - 1;

      let targetCard = null;
      cards.forEach((card) => {
        const pIdx = parseInt(card.dataset.pageIndex, 10);
        if (pIdx === targetIndex) {
          card.classList.add('rotate-card-highlight');
          targetCard = card;
        } else {
          card.classList.remove('rotate-card-highlight');
        }
      });

      if (targetCard) {
        if (doScroll) {
          const cardRect = targetCard.getBoundingClientRect();
          const topbar = viewer.querySelector('.rotate-topbar');
          const topbarHeight = topbar ? topbar.offsetHeight : 80;

          // 1. Internal grid scroll fallback if grid container is scrollable
          if (grid.scrollHeight > grid.clientHeight + 10) {
            const gridRect = grid.getBoundingClientRect();
            const gridTargetScroll = grid.scrollTop + (cardRect.top - gridRect.top) - 16;
            grid.scrollTo({ top: Math.max(0, gridTargetScroll), behavior: 'smooth' });
          }

          // 2. Main page scroll (#main-content): position target card right below sticky topbar
          const mainContent = document.getElementById('main-content') || document.documentElement;
          if (mainContent) {
            const mainRect = mainContent.getBoundingClientRect();
            const mainTargetScroll = mainContent.scrollTop + (cardRect.top - mainRect.top) - topbarHeight - 16;
            mainContent.scrollTo({ top: Math.max(0, mainTargetScroll), behavior: 'smooth' });
          }
        }
      } else if (doScroll && cards.length > 0) {
        pushNotification({
          type: 'warning',
          message: 'Page Not Found',
          detail: `Page ${targetPageNum} is out of range (Total: ${cards.length} page${cards.length === 1 ? '' : 's'}).`,
        });
      }
    };

    if (searchInput) {
      searchInput.addEventListener('input', () => performSearch(true));
      searchInput.addEventListener('change', () => performSearch(true));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          performSearch(true);
        }
      });
    }
    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        performSearch(true);
      });
    }
  }

  return { swap, cardView, viewer };
}

function _showViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  document.body.classList.add('has-rotate-viewer');
  cardView.style.opacity = '0';
  cardView.style.transform = 'translateY(8px)';
  setTimeout(() => {
    cardView.classList.add('rotate-hidden');
    viewer.classList.add('rotate-viewer--visible');

    // Auto scroll `#main-content` to position the viewer at top
    const mainContent = document.getElementById('main-content');
    if (mainContent && viewer) {
      const viewerTop = viewer.getBoundingClientRect().top + mainContent.scrollTop - 70;
      mainContent.scrollTo({ top: Math.max(0, viewerTop), behavior: 'smooth' });
    }
  }, 300);
}

function _closeViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  document.body.classList.remove('has-rotate-viewer');
  _renderToken += 1;
  _selectedFile = null;
  _pdfDoc = null;
  _rotations = [];
  _deletedPages.clear();
  _firstPageThumbShown = false;
  removeRotatePanel();

  viewer.classList.remove('rotate-viewer--visible');
  cardView.classList.remove('rotate-hidden');
  requestAnimationFrame(() => {
    cardView.style.opacity = '1';
    cardView.style.transform = 'translateY(0)';
  });
}

function _showLoading(viewer, file) {
  viewer.querySelector('.rotate-file-name').textContent = file.name;
  viewer.querySelector('.rotate-page-count').textContent = 'Loading pages...';
  viewer.querySelector('.rotate-grid').innerHTML = `
    <div class="rotate-empty-state">Preparing PDF preview...</div>`;
}

function _updatePageCountMeta(viewer) {
  if (!_pdfDoc || !viewer) return;
  const total = _pdfDoc.numPages;
  const deletedCount = _deletedPages.size;
  const meta = viewer.querySelector('.rotate-page-count');
  if (!meta) return;

  if (deletedCount > 0) {
    const remaining = total - deletedCount;
    meta.textContent = `${remaining} of ${total} page${total === 1 ? '' : 's'} (${deletedCount} deleted)`;
  } else {
    meta.textContent = `${total} page${total === 1 ? '' : 's'}`;
  }
}

function _updatePageDeleteState(viewer, index) {
  const card = viewer.querySelector(`.rotate-page-card[data-page-index="${index}"]`);
  if (!card) return;

  const isDeleted = _deletedPages.has(index);
  card.classList.toggle('rotate-card-deleted', isDeleted);

  const deleteBtn = card.querySelector('.rotate-delete-btn');
  if (deleteBtn) {
    deleteBtn.classList.toggle('rotate-delete-btn--active', isDeleted);
    const pageNum = index + 1;
    deleteBtn.title = isDeleted ? `Undo delete for page ${pageNum}` : `Delete page ${pageNum}`;
    deleteBtn.setAttribute('aria-label', deleteBtn.title);
  }

  const rotBtns = card.querySelectorAll('.rotate-rot-btn');
  rotBtns.forEach((btn) => {
    btn.disabled = isDeleted;
  });

  _updatePageCountMeta(viewer);
}

function _toggleDeletePage(index, viewer) {
  if (_deletedPages.has(index)) {
    _deletedPages.delete(index);
  } else {
    _deletedPages.add(index);
  }
  _updatePageDeleteState(viewer, index);
}

function _buildPageCards(viewer, pageCount) {
  const grid = viewer.querySelector('.rotate-grid');
  grid.innerHTML = '';

  for (let i = 0; i < pageCount; i += 1) {
    const pageNumber = i + 1;
    const card = document.createElement('div');
    card.className = 'rotate-page-card';
    card.dataset.pageIndex = String(i);
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="rotate-thumb-stage">
        <div class="rotate-thumb-skeleton" aria-hidden="true"></div>
        <div class="rotate-deleted-overlay">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.333H4.667a1.333 1.333 0 0 1-1.334-1.333V4h9.334z" stroke="#FF4D4D" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>DELETED</span>
        </div>
      </div>
      <div class="rotate-page-number">Page ${pageNumber}</div>
      <div class="rotate-page-actions">
        <button class="rotate-page-btn rotate-rot-btn" type="button" title="Rotate page ${pageNumber} left" aria-label="Rotate page ${pageNumber} left">&#8634;</button>
        <button class="rotate-page-btn rotate-rot-btn" type="button" title="Rotate page ${pageNumber} right" aria-label="Rotate page ${pageNumber} right">&#8635;</button>
        <button class="rotate-page-btn rotate-delete-btn" type="button" title="Delete page ${pageNumber}" aria-label="Delete page ${pageNumber}">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.333H4.667a1.333 1.333 0 0 1-1.334-1.333V4h9.334z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>`;

    const [leftBtn, rightBtn] = card.querySelectorAll('.rotate-rot-btn');
    const deleteBtn = card.querySelector('.rotate-delete-btn');

    leftBtn.addEventListener('click', () => _rotatePage(i, -90, viewer));
    rightBtn.addEventListener('click', () => _rotatePage(i, 90, viewer));
    deleteBtn.addEventListener('click', () => _toggleDeletePage(i, viewer));

    grid.appendChild(card);
  }
}

function _updatePageRotation(viewer, index) {
  const card = viewer.querySelector(`.rotate-page-card[data-page-index="${index}"]`);
  if (!card) return;

  const rotation = _rotations[index] || 0;
  const canvas = card.querySelector('canvas');

  if (canvas) canvas.style.transform = `rotate(${rotation}deg)`;
}

function _rotatePage(index, delta, viewer) {
  if (_deletedPages.has(index)) return;
  _rotations[index] = ((_rotations[index] || 0) + delta + 360) % 360;
  _updatePageRotation(viewer, index);
}

function _rotateAll(delta, viewer) {
  _rotations = _rotations.map((value, index) => {
    if (_deletedPages.has(index)) return value;
    return (value + delta + 360) % 360;
  });
  _rotations.forEach((_, index) => {
    if (!_deletedPages.has(index)) {
      _updatePageRotation(viewer, index);
    }
  });
}

async function _renderPage(pdfDoc, pageNumber, viewer, token) {
  if (!pdfDoc || token !== _renderToken) return;
  const page = await pdfDoc.getPage(pageNumber);
  if (token !== _renderToken) return;

  const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  if (token !== _renderToken) return;

  const card = viewer.querySelector(`.rotate-page-card[data-page-index="${pageNumber - 1}"]`);
  const stage = card && card.querySelector('.rotate-thumb-stage');
  if (!stage) return;

  const skeleton = stage.querySelector('.rotate-thumb-skeleton');
  if (skeleton) skeleton.remove();

  const existingCanvas = stage.querySelector('canvas');
  if (existingCanvas) existingCanvas.remove();

  const overlay = stage.querySelector('.rotate-deleted-overlay');
  if (overlay) {
    stage.insertBefore(canvas, overlay);
  } else {
    stage.appendChild(canvas);
  }
  _updatePageRotation(viewer, pageNumber - 1);

  if (pageNumber === 1 && !_firstPageThumbShown && _selectedFile) {
    _firstPageThumbShown = true;
    _showRotateDropzoneThumbnail(_selectedFile, '#00E5C0', canvas.toDataURL('image/jpeg', 0.95));
  }
}

async function _renderThumbnailsQueue(viewer, token) {
  const pdfDoc = _pdfDoc;
  if (!pdfDoc) return;
  const numPages = pdfDoc.numPages;

  const BATCH_SIZE = 4;
  for (let i = 1; i <= numPages; i += BATCH_SIZE) {
    if (token !== _renderToken) return;
    const batch = [];
    for (let p = i; p < i + BATCH_SIZE && p <= numPages; p += 1) {
      batch.push(
        _renderPage(pdfDoc, p, viewer, token).catch(() => {
          const card = viewer.querySelector(`.rotate-page-card[data-page-index="${p - 1}"]`);
          const stage = card && card.querySelector('.rotate-thumb-stage');
          if (stage && !stage.querySelector('canvas')) {
            stage.innerHTML = '<span class="rotate-empty-state">Preview failed</span>';
          }
        })
      );
    }
    await Promise.all(batch);
  }
}

async function _loadPdfIntoViewer(container, file) {
  const targetContainer = container || document.getElementById('explore-section') || document.body;
  const { viewer } = _getSwapParts(targetContainer);
  if (!viewer) return;

  _selectedFile = file;
  _pdfDoc = null;
  _rotations = [];
  _deletedPages.clear();
  _activeContainer = targetContainer;
  _firstPageThumbShown = false;
  _renderToken += 1;
  const token = _renderToken;

  _showViewer(targetContainer);
  _showLoading(viewer, file);

  try {
    const pdfDoc = await loadPdfDocument(file);
    if (token !== _renderToken) return;

    _pdfDoc = pdfDoc;
    _rotations = Array(pdfDoc.numPages).fill(0);
    _showRotateDropzoneThumbnail(file, '#00E5C0');
    viewer.querySelector('.rotate-file-name').textContent = file.name;
    _updatePageCountMeta(viewer);
    
    // Clear search input on new PDF load
    const searchInput = viewer.querySelector('.rotate-search-input');
    if (searchInput) searchInput.value = '';

    _buildPageCards(viewer, pdfDoc.numPages);
    _renderThumbnailsQueue(viewer, token);
  } catch (err) {
    viewer.querySelector('.rotate-grid').innerHTML = `
      <div class="rotate-empty-state">Could not preview this PDF.</div>`;
    pushNotification({
      type: 'error',
      message: 'Could not read PDF',
      detail: err.message || 'Preview failed.',
    });
  }
}

async function _applyAndSave(viewer) {
  if (!_selectedFile || !_rotations.length) return;

  const remainingPages = _pdfDoc ? (_pdfDoc.numPages - _deletedPages.size) : 1;
  if (remainingPages <= 0) {
    pushNotification({
      type: 'warning',
      message: 'Cannot Save PDF',
      detail: 'All pages are marked as deleted. At least one page must remain.',
    });
    return;
  }

  const fileData = _selectedFile;
  const rotationsData = [..._rotations];
  const deletedList = Array.from(_deletedPages);

  // 1. Disappear pages window (viewer) immediately
  if (_activeContainer) {
    _closeViewer(_activeContainer);
  }

  // 2. Scroll main content area to top smoothly
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 3. Setup tool & dropzone progress UI
  const tool = getActiveTool();
  const color = (tool && tool.color) || '#00E5C0';
  const zone = document.getElementById('drop-zone');

  const hasDeleted = deletedList.length > 0;
  const outName = `${hasDeleted ? 'modified' : 'rotated'}_${_baseName(fileData.name)}.pdf`;

  if (zone) {
    resetZoneContent(zone);
    showProgress(zone, 15, color, 'Processing PDF…');
  }

  // 4. Register background progress job (triggers bg progress bar)
  setBgJob({ jobId: null, tool, filename: outName, progress: 15, state: 'running', sse: null });
  syncBgJobBar();

  try {
    const file = await _fileToBase64(fileData);

    if (zone) updateProgress(zone, 50, color, tool.id);
    const bgMid = getBgJob();
    if (bgMid) {
      bgMid.progress = 50;
      syncBgJobBar();
    }

    const res = await fetch(`${BACKEND}/api/rotate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file,
        rotations: rotationsData,
        deleted_pages: deletedList,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      throw new Error(typeof detail === 'string' ? detail : `Server error ${res.status}`);
    }

    const output = json.file || json.output || json.pdf || json.data;
    if (!output) throw new Error('Backend did not return a PDF.');

    // Convert base64 payload into Blob for dropzone download card
    const bytes = atob(output);
    const uint8 = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) {
      uint8[i] = bytes.charCodeAt(i);
    }
    const blob = new Blob([uint8], { type: 'application/pdf' });

    if (zone) updateProgress(zone, 100, color, tool.id);

    const bgDone = getBgJob();
    if (bgDone) {
      bgDone.progress = 100;
      bgDone.state = 'done';
      bgDone.filename = outName;
      bgDone.blob = blob;
      setBgJob({ ...bgDone, blob });
      syncBgJobBar();
    }

    const onReset = () => {
      removeRotatePanel();
      clearBgJob();
      const activeTool = getActiveTool();
      if (activeTool) {
        import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
          if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
        }).catch(() => {});
      }
    };

    if (zone) {
      setTimeout(() => showDownloadBlobCard(zone, blob, outName, color, onReset, tool.id), 200);
    }

    if (getActiveTool()?.id !== tool?.id) {
      pushNotification({
        type: 'success',
        message: hasDeleted ? 'PDF Pages Updated' : 'PDF Rotated',
        detail: hasDeleted
          ? `${outName} (${deletedList.length} page${deletedList.length === 1 ? '' : 's'} deleted)`
          : outName,
      });
    }
  } catch (err) {
    if (zone) showError(zone, err.message || 'Unable to save modified PDF.');
    clearBgJob();
    pushNotification({
      type: 'error',
      message: 'Save failed',
      detail: err.message || 'Unable to save modified PDF.',
    });
  }
}

/**
 * Called when a PDF file is dropped or picked via the main drop zone
 * while the Rotate Pages tool is active.
 * @param {File} file
 */
export function handleRotateFilePicked(file) {
  if (!file || !_isPdfFile(file)) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid PDF file.',
    });
    return;
  }

  const container = document.getElementById('explore-section') || document.body;
  _loadPdfIntoViewer(container, file);
}

export function openRotateFilePicker(container, tool) {
  const input = _ensureFileInput();
  input.value = '';
  input.onchange = () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    if (!_isPdfFile(file)) {
      pushNotification({
        type: 'warning',
        message: 'Invalid File Format. Please select a valid PDF file.',
      });
      return;
    }

    _loadPdfIntoViewer(container, file);
  };

  input.click();
}

