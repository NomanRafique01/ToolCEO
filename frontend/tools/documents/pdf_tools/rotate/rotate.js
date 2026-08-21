/**
 * tools/documents/pdf_tools/rotate/rotate.js
 *
 * Owns the Rotate Pages view swap, PDF.js thumbnail rendering, rotation state,
 * and frontend save request.
 */

import { pushNotification } from '../../../../scripts/notificationStore.js';

const BACKEND = 'http://127.0.0.1:8000';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const THUMBNAIL_SCALE = 1.5; // High definition scale for crisp page previews

let _fileInput = null;
let _selectedFile = null;
let _pdfDoc = null;
let _rotations = [];
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
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return Promise.resolve(window.pdfjsLib);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PDFJS_URL}"]`);
    const script = existing || document.createElement('script');

    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error('PDF.js did not initialize.'));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Could not load PDF.js.'));

    if (!existing) {
      script.src = PDFJS_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
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
    return window.toolceo.saveFileAs(filename, base64);
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
  const swap = container.querySelector('#pdf-tools-swap');
  const cardView = container.querySelector('#pdf-tools-card-view');
  let viewer = container.querySelector('#rotate-viewer');

  if (swap && !viewer) {
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
        <span class="rotate-badge"></span>
      </div>
      <div class="rotate-page-number">Page ${pageNumber}</div>
      <div class="rotate-page-actions">
        <button class="rotate-page-btn" type="button" title="Rotate page ${pageNumber} left" aria-label="Rotate page ${pageNumber} left">&#8634;</button>
        <button class="rotate-page-btn" type="button" title="Rotate page ${pageNumber} right" aria-label="Rotate page ${pageNumber} right">&#8635;</button>
      </div>`;

    const [leftBtn, rightBtn] = card.querySelectorAll('.rotate-page-btn');
    leftBtn.addEventListener('click', () => _rotatePage(i, -90, viewer));
    rightBtn.addEventListener('click', () => _rotatePage(i, 90, viewer));
    grid.appendChild(card);
  }
}

function _updatePageRotation(viewer, index) {
  const card = viewer.querySelector(`.rotate-page-card[data-page-index="${index}"]`);
  if (!card) return;

  const rotation = _rotations[index] || 0;
  const canvas = card.querySelector('canvas');
  const badge = card.querySelector('.rotate-badge');

  if (canvas) canvas.style.transform = `rotate(${rotation}deg)`;
  if (badge) {
    badge.textContent = `${rotation}deg`;
    badge.classList.toggle('rotate-badge--visible', rotation !== 0);
  }
}

function _rotatePage(index, delta, viewer) {
  _rotations[index] = ((_rotations[index] || 0) + delta + 360) % 360;
  _updatePageRotation(viewer, index);
}

function _rotateAll(delta, viewer) {
  _rotations = _rotations.map((value) => (value + delta + 360) % 360);
  _rotations.forEach((_, index) => _updatePageRotation(viewer, index));
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

  const card = viewer.querySelector(`.rotate-page-card[data-page-index="${pageNumber - 1}"]`);
  const stage = card && card.querySelector('.rotate-thumb-stage');
  if (!stage) return;

  const skeleton = stage.querySelector('.rotate-thumb-skeleton');
  if (skeleton) skeleton.remove();
  stage.insertBefore(canvas, stage.querySelector('.rotate-badge'));
  _updatePageRotation(viewer, pageNumber - 1);

  if (pageNumber === 1 && !_firstPageThumbShown && _selectedFile) {
    _firstPageThumbShown = true;
    _showRotateDropzoneThumbnail(_selectedFile, '#00E5C0', canvas.toDataURL('image/jpeg', 0.95));
  }
}

async function _loadPdfIntoViewer(container, file) {
  const { viewer } = _getSwapParts(container);
  if (!viewer) return;

  _selectedFile = file;
  _pdfDoc = null;
  _rotations = [];
  _activeContainer = container;
  _firstPageThumbShown = false;
  _renderToken += 1;
  const token = _renderToken;

  _showViewer(container);
  _showLoading(viewer, file);

  try {
    const pdfjsLib = await _ensurePdfJs();
    const buffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    if (token !== _renderToken) return;

    _pdfDoc = pdfDoc;
    _rotations = Array(pdfDoc.numPages).fill(0);
    _showRotateDropzoneThumbnail(file, '#00E5C0');
    viewer.querySelector('.rotate-file-name').textContent = file.name;
    viewer.querySelector('.rotate-page-count').textContent = `${pdfDoc.numPages} page${pdfDoc.numPages === 1 ? '' : 's'}`;
    
    // Clear search input on new PDF load
    const searchInput = viewer.querySelector('.rotate-search-input');
    if (searchInput) searchInput.value = '';

    _buildPageCards(viewer, pdfDoc.numPages);

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      _renderPage(pdfDoc, pageNumber, viewer, token).catch(() => {
        const card = viewer.querySelector(`.rotate-page-card[data-page-index="${pageNumber - 1}"]`);
        const stage = card && card.querySelector('.rotate-thumb-stage');
        if (stage) stage.innerHTML = '<span class="rotate-empty-state">Preview failed</span>';
      });
    }
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

  const btn = viewer.querySelector('.rotate-save-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const file = await _fileToBase64(_selectedFile);
    const res = await fetch(`${BACKEND}/api/rotate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, rotations: _rotations }),
    });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      throw new Error(typeof detail === 'string' ? detail : `Server error ${res.status}`);
    }

    const output = json.file || json.output || json.pdf || json.data;
    if (!output) throw new Error('Backend did not return a PDF.');

    const filename = `rotated_${_baseName(_selectedFile.name)}.pdf`;
    const saved = await _downloadBase64Pdf(output, filename);
    if (saved) {
      pushNotification({
        type: 'success',
        message: 'PDF Rotated',
        detail: filename,
      });
    }
  } catch (err) {
    pushNotification({
      type: 'error',
      message: 'Rotate failed',
      detail: err.message || 'Unable to save rotated PDF.',
    });
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
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

  const container = document.getElementById('explore-tools-content') || document.body;
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

