/**
 * tools/documents/pdf_tools/extractor/extractor.js
 *
 * Owns the Extract Images flow: PDF scan, drop-zone thumbnail, rotate-style
 * page picker, selected-page state, async extraction job, and shared download UI.
 */

import { pushNotification } from '../../../../scripts/notificationStore.js';
import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../../scripts/toolstate.js';
import {
  showScanProgress,
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../../../shared/progress.js';
import { ensurePdfJs, loadPdfDocument, getOfflinePdfInfo } from '../../../shared/pdfRenderer.js';

const BACKEND = 'http://127.0.0.1:8000';
const THUMBNAIL_SCALE = 1.5;

let _selectedFile = null;
let _pageCount = 0;
let _baseName = '';
let _pdfDoc = null;
let _selectedPages = new Set();
let _renderToken = 0;
let _activeContainer = null;

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

function _fileBaseName(filename) {
  return String(filename || 'document').replace(/\.[^.]+$/, '') || 'document';
}

function _ensurePdfJs() {
  return ensurePdfJs();
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

function _showPdfThumbnail(zone, file, color, dataUri = null) {
  if (!zone || !file) return;
  zone.querySelectorAll('.dz-extractor-thumb-wrap').forEach((thumb) => thumb.remove());

  const thumbContent = dataUri
    ? `<img class="dz-pdf-thumb-img" src="${dataUri}" alt="PDF preview" draggable="false" />`
    : _fallbackPdfIcon(color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-pdf-thumb-wrap dz-extractor-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-pdf-thumb-card">
      <div class="dz-pdf-thumb-frame" style="border: 2px solid ${color}; box-shadow: 0 4px 18px rgba(0,0,0,0.45);">
        ${thumbContent}
      </div>
      <button class="dz-pdf-thumb-remove dz-extractor-thumb-remove" title="Remove file" style="--thumb-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pdf-thumb-name">${_escHtml(file.name)}</span>`;

  zone.classList.add('dz-has-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-extractor-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeExtractorPanel();
    resetZoneContent(zone);
    const activeTool = getActiveTool();
    if (activeTool) {
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
      }).catch(() => {});
    }
  });
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

  let viewer = target.querySelector('#extractor-viewer') || swap.querySelector('#extractor-viewer');

  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'extractor-viewer';
    viewer.className = 'extractor-viewer';
    viewer.innerHTML = `
      <div class="extractor-topbar">
        <div class="extractor-topbar-row">
          <div class="extractor-topbar-left">
            <button class="extractor-back-btn" type="button" title="Back to PDF tools">
              <span aria-hidden="true">&larr;</span>
              <span>Back</span>
            </button>
            <div class="extractor-file-meta">
              <span class="extractor-file-name">No PDF selected</span>
              <span class="extractor-page-count">0 pages</span>
            </div>
          </div>
          <div class="extractor-actions">
            <button class="extractor-action-btn" type="button" data-extractor-select="all">Select All</button>
            <button class="extractor-action-btn" type="button" data-extractor-select="clear">Clear</button>
            <button class="extractor-action-btn extractor-save-btn" type="button">Extract Images</button>
          </div>
        </div>
        <div class="extractor-search-row">
          <div class="extractor-search-wrap">
            <svg class="extractor-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M11 11L14 14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <input class="extractor-search-input" type="text" placeholder="Go to page (e.g. 5)..." aria-label="Go to page" />
            <button class="extractor-search-btn" type="button" title="Find page">Find</button>
          </div>
        </div>
      </div>
      <div class="extractor-grid" role="list"></div>`;
    swap.appendChild(viewer);

    viewer.querySelector('.extractor-back-btn').addEventListener('click', () => _closeViewer(container));
    viewer.querySelector('[data-extractor-select="all"]').addEventListener('click', () => _selectAllPages(viewer));
    viewer.querySelector('[data-extractor-select="clear"]').addEventListener('click', () => _clearSelectedPages(viewer));
    viewer.querySelector('.extractor-save-btn').addEventListener('click', () => _submitExtract());

    const searchInput = viewer.querySelector('.extractor-search-input');
    const searchBtn = viewer.querySelector('.extractor-search-btn');
    const performSearch = (doScroll = true) => {
      const grid = viewer.querySelector('.extractor-grid');
      if (!searchInput || !grid) return;
      const val = searchInput.value.trim();
      const cards = viewer.querySelectorAll('.extractor-page-card');

      if (!val) {
        cards.forEach((card) => card.classList.remove('extractor-card-highlight'));
        return;
      }

      const matchNum = val.match(/\d+/);
      if (!matchNum) return;

      const targetIndex = parseInt(matchNum[0], 10) - 1;
      let targetCard = null;
      cards.forEach((card) => {
        const pIdx = parseInt(card.dataset.pageIndex, 10);
        if (pIdx === targetIndex) {
          card.classList.add('extractor-card-highlight');
          targetCard = card;
        } else {
          card.classList.remove('extractor-card-highlight');
        }
      });

      if (targetCard && doScroll) {
        const cardRect = targetCard.getBoundingClientRect();
        if (grid.scrollHeight > grid.clientHeight + 10) {
          const gridRect = grid.getBoundingClientRect();
          grid.scrollTo({ top: Math.max(0, grid.scrollTop + (cardRect.top - gridRect.top) - 16), behavior: 'smooth' });
        }
        const mainContent = document.getElementById('main-content') || document.documentElement;
        const mainRect = mainContent.getBoundingClientRect();
        mainContent.scrollTo({ top: Math.max(0, mainContent.scrollTop + (cardRect.top - mainRect.top) - 110), behavior: 'smooth' });
      } else if (!targetCard && doScroll && cards.length > 0) {
        pushNotification({
          type: 'warning',
          message: 'Page Not Found',
          detail: `Page ${targetIndex + 1} is out of range (Total: ${cards.length} pages).`,
        });
      }
    };

    searchInput.addEventListener('input', () => performSearch(true));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch(true);
      }
    });
    searchBtn.addEventListener('click', () => performSearch(true));
  }

  return { swap, cardView, viewer };
}

function _showViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  document.body.classList.add('has-extractor-viewer');
  cardView.style.opacity = '0';
  cardView.style.transform = 'translateY(8px)';
  setTimeout(() => {
    cardView.classList.add('extractor-hidden');
    viewer.classList.add('extractor-viewer--visible');
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      const viewerTop = viewer.getBoundingClientRect().top + mainContent.scrollTop - 70;
      mainContent.scrollTo({ top: Math.max(0, viewerTop), behavior: 'smooth' });
    }
  }, 300);
}

function _closeViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  document.body.classList.remove('has-extractor-viewer');
  _renderToken += 1;
  viewer.classList.remove('extractor-viewer--visible');
  cardView.classList.remove('extractor-hidden');
  requestAnimationFrame(() => {
    cardView.style.opacity = '1';
    cardView.style.transform = 'translateY(0)';
  });
}

function _showLoading(viewer, file) {
  viewer.querySelector('.extractor-file-name').textContent = file.name;
  viewer.querySelector('.extractor-page-count').textContent = 'Loading pages...';
  viewer.querySelector('.extractor-grid').innerHTML = '<div class="extractor-empty-state">Preparing PDF preview...</div>';
}

function _updateSelectionMeta(viewer) {
  const meta = viewer && viewer.querySelector('.extractor-page-count');
  if (!meta) return;
  const selected = _selectedPages.size;
  const total = _pageCount;
  if (!total) {
    meta.textContent = '0 pages';
  } else if (selected === total) {
    meta.textContent = `${total} page${total === 1 ? '' : 's'} - all selected`;
  } else {
    meta.textContent = `${selected} of ${total} page${total === 1 ? '' : 's'} selected`;
  }

  const panelMeta = document.querySelector('.extractor-panel-selection');
  if (panelMeta) {
    panelMeta.textContent = selected === total
      ? 'All pages selected'
      : `${selected} selected`;
  }
}

function _updatePageSelection(viewer, pageNumber) {
  const card = viewer.querySelector(`.extractor-page-card[data-page-index="${pageNumber - 1}"]`);
  if (!card) return;
  const isSelected = _selectedPages.has(pageNumber);
  card.classList.toggle('extractor-card-selected', isSelected);
  const btn = card.querySelector('.extractor-select-btn');
  if (btn) {
    btn.textContent = isSelected ? 'Selected' : 'Select';
    btn.setAttribute('aria-label', `${isSelected ? 'Unselect' : 'Select'} page ${pageNumber}`);
  }
  _updateSelectionMeta(viewer);
}

function _togglePage(pageNumber, viewer) {
  if (_selectedPages.has(pageNumber)) {
    _selectedPages.delete(pageNumber);
  } else {
    _selectedPages.add(pageNumber);
  }
  _updatePageSelection(viewer, pageNumber);
}

function _selectAllPages(viewer) {
  _selectedPages = new Set(Array.from({ length: _pageCount }, (_, i) => i + 1));
  viewer.querySelectorAll('.extractor-page-card').forEach((card) => {
    _updatePageSelection(viewer, parseInt(card.dataset.pageIndex, 10) + 1);
  });
}

function _clearSelectedPages(viewer) {
  _selectedPages.clear();
  viewer.querySelectorAll('.extractor-page-card').forEach((card) => {
    _updatePageSelection(viewer, parseInt(card.dataset.pageIndex, 10) + 1);
  });
}

function _buildPageCards(viewer, pageCount) {
  const grid = viewer.querySelector('.extractor-grid');
  grid.innerHTML = '';

  for (let i = 0; i < pageCount; i += 1) {
    const pageNumber = i + 1;
    const card = document.createElement('div');
    card.className = 'extractor-page-card extractor-card-selected';
    card.dataset.pageIndex = String(i);
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="extractor-thumb-stage">
        <div class="extractor-thumb-skeleton" aria-hidden="true"></div>
        <div class="extractor-selected-overlay">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.3"/>
            <path d="M5 8.2l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="extractor-page-number">Page ${pageNumber}</div>
      <div class="extractor-page-actions">
        <button class="extractor-page-btn extractor-select-btn" type="button" aria-label="Unselect page ${pageNumber}">Selected</button>
      </div>`;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.extractor-select-btn') || e.target.closest('.extractor-thumb-stage')) {
        _togglePage(pageNumber, viewer);
      }
    });
    grid.appendChild(card);
  }
}

async function _renderPage(pdfDoc, pageNumber, viewer, token) {
  const page = await pdfDoc.getPage(pageNumber);
  if (token !== _renderToken) return;

  const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  if (token !== _renderToken) return;

  const card = viewer.querySelector(`.extractor-page-card[data-page-index="${pageNumber - 1}"]`);
  const stage = card && card.querySelector('.extractor-thumb-stage');
  if (!stage) return;

  const skeleton = stage.querySelector('.extractor-thumb-skeleton');
  if (skeleton) skeleton.remove();

  const overlay = stage.querySelector('.extractor-selected-overlay');
  if (overlay) {
    stage.insertBefore(canvas, overlay);
  } else {
    stage.appendChild(canvas);
  }
}

function _showExtractorPanel(color) {
  const existing = document.getElementById('extractor-info-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard || !_selectedFile) return;

  const panel = document.createElement('div');
  panel.id = 'extractor-info-panel';
  panel.className = 'extractor-info-panel';
  panel.style.setProperty('--extractor-color', color);
  panel.innerHTML = `
    <div class="xip-left">
      <span class="xip-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="9" height="12" rx="1.4" stroke="currentColor" stroke-width="1.3"/>
          <rect x="5" y="6" width="9" height="7" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
          <path d="M5 12l2.4-2.4 1.8 1.8 1.4-1.4L14 12" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>${_pageCount} page${_pageCount === 1 ? '' : 's'}</span>
      </span>
      <span class="extractor-panel-selection">All pages selected</span>
    </div>
    <div class="xip-actions">
      <button class="xip-secondary-btn" type="button">Change file</button>
      <button class="xip-primary-btn" type="button">Extract Images</button>
    </div>`;

  heroCard.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('extractor-info-panel--visible'));

  panel.querySelector('.xip-secondary-btn').addEventListener('click', () => {
    removeExtractorPanel();
    resetZoneContent(document.getElementById('drop-zone'));
    const activeTool = getActiveTool();
    if (activeTool) {
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
      }).catch(() => {});
    }
  });
  panel.querySelector('.xip-primary-btn').addEventListener('click', () => _submitExtract());
}

async function _loadPdfIntoViewer(container, file) {
  const tool = getActiveTool();
  const color = (tool && tool.color) || '#F472B6';
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  removeExtractorPanel();
  showScanProgress(zone, color);

  const fd = new FormData();
  fd.append('file', file);

  let info = null;
  try {
    const res = await fetch(`${BACKEND}/api/pdf/extractor/info`, { method: 'POST', body: fd }).catch(() => null);
    if (res && res.ok) {
      info = await res.json();
    }
  } catch (err) {
    info = null;
  }

  if (!info) {
    try {
      const offlineInfo = await getOfflinePdfInfo(file, 0.5);
      info = {
        page_count: offlineInfo.pageCount || 0,
        thumbnail: offlineInfo.thumbnail || null,
        image_status: { has_usable_images: true }
      };
    } catch (offlineErr) {
      showError(zone, `Could not read PDF: ${offlineErr.message}`);
      return;
    }
  }

  _selectedFile = file;
  _pageCount = info.page_count || 0;
  _baseName = _fileBaseName(file.name);
  _selectedPages = new Set(Array.from({ length: _pageCount }, (_, i) => i + 1));
  _activeContainer = container;
  _pdfDoc = null;
  _renderToken += 1;
  const token = _renderToken;

  resetZoneContent(zone);
  _showPdfThumbnail(zone, file, color, info.thumbnail || null);

  const imageStatus = info.image_status || {};
  if (imageStatus.has_usable_images === false) {
    pushNotification({
      type: 'warning',
      message: imageStatus.reason === 'images_too_blurry'
        ? 'Image Too Blurry'
        : 'No Images Found',
      detail: imageStatus.message || 'No usable embedded images were found in this PDF.',
    });
    return;
  }

  _showExtractorPanel(color);

  const { viewer } = _getSwapParts(container);
  if (!viewer) return;
  _showViewer(container);
  _showLoading(viewer, file);
  viewer.querySelector('.extractor-file-name').textContent = file.name;
  _updateSelectionMeta(viewer);
  const searchInput = viewer.querySelector('.extractor-search-input');
  if (searchInput) searchInput.value = '';
  _buildPageCards(viewer, _pageCount);

  try {
    const pdfDoc = await loadPdfDocument(file);
    if (token !== _renderToken) return;
    _pdfDoc = pdfDoc;
    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      _renderPage(pdfDoc, pageNumber, viewer, token).catch(() => {
        const card = viewer.querySelector(`.extractor-page-card[data-page-index="${pageNumber - 1}"]`);
        const stage = card && card.querySelector('.extractor-thumb-stage');
        if (stage) stage.innerHTML = '<span class="extractor-empty-state">Preview failed</span>';
      });
    }
  } catch (err) {
    pushNotification({
      type: 'warning',
      message: 'Preview Limited',
      detail: err.message || 'Page thumbnails could not be rendered.',
    });
  }
}

async function _submitExtract() {
  if (!_selectedFile || !_pageCount) return;

  if (_selectedPages.size < 1) {
    pushNotification({
      type: 'warning',
      message: 'Select at least one page',
      detail: 'Choose pages or use Select All before extracting images.',
    });
    return;
  }

  const tool = getActiveTool();
  const color = (tool && tool.color) || '#F472B6';
  const zone = document.getElementById('drop-zone');
  const outputName = `${_baseName}_images.zip`;
  const selectedPages = Array.from(_selectedPages).sort((a, b) => a - b);
  const shouldSendSelection = selectedPages.length !== _pageCount;
  const file = _selectedFile;

  if (_activeContainer) _closeViewer(_activeContainer);
  document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });

  if (zone) showProgress(zone, 0, color, 'Extracting images...');
  setBgJob({ jobId: null, tool, filename: outputName, progress: 5, state: 'submitting', sse: null });

  const fd = new FormData();
  fd.append('file', file);
  fd.append('output_filename', outputName);
  if (shouldSendSelection) {
    fd.append('selected_pages', JSON.stringify(selectedPages));
  }

  let jobId;
  try {
    const res = await fetch(`${BACKEND}/api/pdf/extractor/extract`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      throw new Error(typeof detail === 'string' ? detail : `Server error ${res.status}`);
    }
    jobId = json.job_id;
  } catch (err) {
    if (zone) showError(zone, `Upload failed: ${err.message}`);
    clearBgJob();
    return;
  }

  const sse = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct = 0;
  setBgJob({ jobId, tool, filename: outputName, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = typeof progress === 'number' ? progress : lastPct;
    lastPct = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state = state === 'done' ? 'done' : (state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (state === 'running' || state === 'pending') {
      if (zone) updateProgress(zone, Math.max(10, Math.min(90, pct)), color);
      return;
    }

    sse.close();

    if (state === 'done') {
      if (zone) updateProgress(zone, 100, color);
      const dlName = data.filename || outputName;
      const onReset = () => {
        removeExtractorPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset), 200);
      pushNotification({
        type: 'success',
        message: 'Images Extracted',
        detail: dlName,
      });
      return;
    }

    if (state === 'error') {
      if (zone) showError(zone, error || 'Processing failed. Please try again.');
    }
  };

  sse.onerror = () => {
    sse.close();
    if (zone) showError(zone, 'Lost connection to backend. Is the server running?');
  };
}

export function removeExtractorPanel() {
  const panel = document.getElementById('extractor-info-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelectorAll('.dz-extractor-thumb-wrap').forEach((thumb) => thumb.remove());
    if (!zone.querySelector('.dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip')) {
      zone.classList.remove('dz-has-thumb');
    }
  }

  const container = _activeContainer || document.getElementById('explore-section') || document.body;
  const viewer = container.querySelector('#extractor-viewer');
  const cardView = container.querySelector('#pdf-tools-card-view');
  if (viewer) viewer.classList.remove('extractor-viewer--visible');
  if (cardView) {
    cardView.classList.remove('extractor-hidden');
    cardView.style.opacity = '1';
    cardView.style.transform = 'translateY(0)';
  }
  document.body.classList.remove('has-extractor-viewer');

  _renderToken += 1;
  _selectedFile = null;
  _pageCount = 0;
  _baseName = '';
  _pdfDoc = null;
  _selectedPages.clear();
}

export function handleExtractorFilePicked(file) {
  if (!_isPdfFile(file)) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid PDF file.',
    });
    return;
  }

  const container = document.getElementById('explore-section') || document.body;
  _loadPdfIntoViewer(container, file);
}
