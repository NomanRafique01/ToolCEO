/**
 * tools/documents/pdf_tools/editor/editor.js
 *
 * Owns the Edit PDF load flow: PDF scan, page grid, and in-browser page
 * editor canvas. Final PDF export is intentionally left for the next step.
 */

import { pushNotification } from '../../../../scripts/notificationStore.js';
import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../../../scripts/toolstate.js';
import {
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownloadBlobCard,
  showError,
} from '../../../shared/progress.js';
import { ensurePdfJs, loadPdfDocument, getOfflinePdfInfo } from '../../../shared/pdfRenderer.js';
import {
  Canvas as FabricCanvas,
  Circle,
  Control,
  FabricImage,
  Group,
  IText,
  Textbox,
  Line,
  PencilBrush,
  Rect,
  Shadow,
  Triangle,
  controlsUtils,
  util as fabricUtil,
} from '../../../../vendor/fabric/index.min.mjs';

const BACKEND = 'http://127.0.0.1:8000';
const EDITOR_COLOR = '#00E5C0';
const PDFJS_URL = '../../../../vendor/pdfjs/pdf.min.js';
const PDFJS_WORKER_URL = '../../../../vendor/pdfjs/pdf.worker.min.js';
const THUMBNAIL_SCALE = 1.5;
const EDIT_PAGE_MAX_WIDTH = 1920;   // HD: Full-HD width baseline
const EDIT_PAGE_MAX_HEIGHT = 2560;  // HD: Full-HD height baseline

const BRUSH_SIZES = { thin: 2, medium: 5, thick: 9 };
const FONT_SIZES = [10, 12, 14, 18, 24, 32, 36, 48, 64];
const PALETTE = [
  ['#000000', 'Black'],
  ['#FFFFFF', 'White'],
  ['#EF4444', 'Red'],
  ['#22C55E', 'Green'],
  ['#FACC15', 'Yellow'],
  ['#F97316', 'Orange'],
  ['#00E5C0', 'Teal'],
  ['#EC4899', 'Pink'],
  ['#6B7280', 'Grey'],
];

const TOOL_LABELS = {
  select: 'Select',
  pen: 'Pen',
  highlighter: 'Highlighter',
  text: 'Text',
  rect: 'Rectangle',
  ellipse: 'Circle',
  line: 'Line',
  arrow: 'Arrow',
};

const FONT_FAMILIES = [
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Segoe UI',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Inter',
  'Roboto',
];

let _selectedFile = null;
let _pageCount = 0;
let _pages = [];
let _sessionId = null;
let _selectedPage = null;
let _activeContainer = null;
let _editorState = null;
let _pdfDoc = null;
let _pdfLoadPromise = null;
let _renderToken = 0;

function _isPdfFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf';
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _thumbnailDataUri(thumbnail) {
  if (!thumbnail) return null;
  return thumbnail.startsWith('data:image/')
    ? thumbnail
    : `data:image/png;base64,${thumbnail}`;
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
  zone.querySelectorAll('.dz-editor-thumb-wrap').forEach((thumb) => thumb.remove());

  const thumbContent = dataUri
    ? `<img class="dz-pdf-thumb-img" src="${dataUri}" alt="PDF preview" draggable="false" />`
    : _fallbackPdfIcon(color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-pdf-thumb-wrap dz-editor-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-pdf-thumb-card">
      <div class="dz-pdf-thumb-frame" style="border: 2px solid ${color}; box-shadow: 0 4px 18px rgba(0,0,0,0.45);">
        ${thumbContent}
      </div>
      <button class="dz-pdf-thumb-remove dz-editor-thumb-remove" title="Remove file" style="--thumb-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pdf-thumb-name">${_escHtml(file.name)}</span>`;

  zone.classList.add('dz-has-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-editor-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeEditorPanel();
    resetZoneContent(zone);
    const activeTool = getActiveTool();
    if (activeTool) {
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
      }).catch(() => {});
    }
  });
}

function _buildToolbarHTML() {
  const colorSwatches = PALETTE.map(([hex, name]) => `
    <button type="button" class="ed-swatch${hex === '#000000' ? ' active' : ''}" data-color="${hex}" title="${name}" aria-label="${name}" style="background:${hex}"></button>
  `).join('');

  const icon = {
    pen: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    highlighter: '<svg viewBox="0 0 24 24"><path d="m9 11 6 6"/><path d="m5 19 4-4"/><path d="m14 4 6 6-9 9H5v-6Z"/><path d="M19 15v4"/></svg>',
    text: '<svg viewBox="0 0 24 24"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
    rect: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>',
    ellipse: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>',
    line: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5"/><path d="M10 5h9v9"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></svg>',
    select: '<svg viewBox="0 0 24 24"><path d="M4 3l7 17 2-7 7-2Z"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h2"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
    delete: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
  };

  return `
    <div class="ed-section">
      <div class="ed-section-title">Draw</div>
      <div class="ed-tool-row">
        <button type="button" class="ed-tool-btn active" data-tool="pen" title="Pen">${icon.pen}<span>Pen</span></button>
        <button type="button" class="ed-tool-btn" data-tool="highlighter" title="Highlighter">${icon.highlighter}<span>Highlighter</span></button>
        <button type="button" class="ed-tool-btn" data-tool="select" title="Select">${icon.select}<span>Select</span></button>
      </div>
      <label class="ed-label">Width <span id="ed-brush-width-val">5px</span></label>
      <input type="range" class="ed-slider" id="ed-brush-width" min="1" max="40" value="5" />
      <label class="ed-label">Opacity <span id="ed-opacity-val">100%</span></label>
      <input type="range" class="ed-slider" id="ed-opacity" min="10" max="100" value="100" />
    </div>

    <div class="ed-section">
      <div class="ed-section-title">Color Picker</div>
      <div class="ed-swatches">${colorSwatches}</div>
      <div class="ed-color-row">
        <div class="ed-current-color" id="ed-current-color" style="background:#000000"></div>
        <input type="text" class="ed-hex-input" id="ed-hex-input" value="#000000" maxlength="7" spellcheck="false" />
      </div>
    </div>

    <div class="ed-section">
      <div class="ed-section-title">Text</div>
      <button type="button" class="ed-wide-btn" data-tool="text" title="Add Text">${icon.text}<span>Add Text</span></button>
      
      <div class="ed-custom-select" id="ed-font-family-select">
        <button type="button" class="ed-custom-select-trigger" id="ed-font-family-trigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="ed-custom-select-value" id="ed-font-family-label">Arial</span>
          <svg class="ed-select-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="ed-custom-select-menu" id="ed-font-family-menu" role="listbox">
          ${FONT_FAMILIES.map((font) => `
            <div class="ed-custom-select-option${font === 'Arial' ? ' selected' : ''}" role="option" data-value="${font}" style="font-family:'${font}', sans-serif;">
              <span>${font}</span>
              <span class="ed-font-preview" style="font-family:'${font}', sans-serif;">Ag</span>
            </div>
          `).join('')}
        </div>
      </div>

      <label class="ed-label" style="margin-top:10px;">Size <span id="ed-font-size-val">32px</span></label>
      <input type="range" class="ed-slider" id="ed-font-size" min="8" max="120" value="32" />

      <div class="ed-tool-row" style="margin-top:10px;">
        <button type="button" class="ed-toggle" id="ed-bold" style="flex:1;">Bold</button>
        <button type="button" class="ed-toggle" id="ed-italic" style="flex:1;">Italic</button>
      </div>
    </div>

    <div class="ed-section">
      <div class="ed-section-title">Shapes</div>
      <div class="ed-tool-grid">
        <button type="button" class="ed-tool-btn" data-tool="rect" title="Rectangle">${icon.rect}<span>Rectangle</span></button>
        <button type="button" class="ed-tool-btn" data-tool="ellipse" title="Circle">${icon.ellipse}<span>Circle</span></button>
        <button type="button" class="ed-tool-btn" data-tool="line" title="Line">${icon.line}<span>Line</span></button>
        <button type="button" class="ed-tool-btn" data-tool="arrow" title="Arrow">${icon.arrow}<span>Arrow</span></button>
      </div>
      <label class="ed-label">Width <span id="ed-shape-width-val">3px</span></label>
      <input type="range" class="ed-slider" id="ed-shape-width" min="1" max="30" value="3" />
    </div>

    <div class="ed-section">
      <div class="ed-section-title">Image</div>
      <button type="button" class="ed-wide-btn" id="ed-add-image" title="Add Image">${icon.image}<span>Add Image</span></button>
      <input type="file" id="ed-image-input" accept="image/png,image/jpeg,image/webp" hidden />
    </div>

    <div class="ed-section">
      <button type="button" class="ed-danger-btn" id="ed-clear" title="Clear All">${icon.clear}<span>Clear All</span></button>
    </div>`;
}

function _buildViewerHTML() {
  return `
    <div class="extractor-topbar editor-grid-topbar">
      <div class="extractor-topbar-row">
        <div class="extractor-topbar-left">
          <button class="extractor-back-btn editor-back-btn" type="button" title="Back to PDF tools">
            <span aria-hidden="true">&larr;</span>
            <span>Back</span>
          </button>
          <div class="extractor-file-meta">
            <span class="extractor-file-name">No PDF selected</span>
            <span class="extractor-page-count">0 pages</span>
          </div>
        </div>
        <div class="editor-header-title">
          <span class="editor-select-kicker">Edit PDF</span>
          <h3>Select a page to edit</h3>
          <span class="editor-select-note">Choose any page below</span>
        </div>
        <div class="editor-header-actions">
          <button class="wm-apply-btn ed-save-pdf-btn" type="button" data-editor-save>
            Save PDF
          </button>
        </div>
      </div>
    </div>
    <div class="extractor-grid editor-page-grid" role="list"></div>

    <div class="ed-page-editor" id="ed-page-editor" aria-hidden="true">
      <div class="wm-topbar ed-topbar">
        <div class="wm-topbar-left">
          <button class="wm-back-btn ed-page-back" type="button" title="Back to pages">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Back to Pages
          </button>
          <div class="wm-file-meta">
            <span class="wm-file-name" id="ed-page-indicator">Page 1 of 1</span>
          </div>
        </div>
        <div class="wm-topbar-actions">
          <button class="wm-apply-btn ed-apply-btn" type="button" id="ed-apply-btn">
            Apply Changes
          </button>
        </div>
      </div>

      <div class="wm-editor-body ed-editor-body">
        <div class="wm-controls-col ed-toolbar">
          <div class="wm-controls-inner ed-toolbar-inner">
            ${_buildToolbarHTML()}
          </div>
        </div>
        <div class="wm-preview-col ed-canvas-col">
          <div class="wm-preview-header ed-preview-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
            Preview &nbsp;&middot;&nbsp; <span id="ed-active-tool-label">Pen Tool Selected</span>
          </div>
          <div class="ed-canvas-scroll" id="ed-canvas-scroll">
            <div class="ed-canvas-stage" id="ed-canvas-stage">
              <canvas id="ed-overlay-canvas"></canvas>
            </div>

          </div>
        </div>
      </div>
    </div>`;
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

  let viewer = target.querySelector('#editor-viewer') || swap.querySelector('#editor-viewer');

  if (viewer && viewer.dataset.editorVer !== '5') {
    viewer.remove();
    viewer = null;
  }

  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'editor-viewer';
    viewer.className = 'extractor-viewer editor-viewer';
    viewer.dataset.editorVer = '5';
    viewer.innerHTML = _buildViewerHTML();
    swap.appendChild(viewer);

    viewer.querySelector('.editor-back-btn').addEventListener('click', () => _closeViewer(container));
    viewer.querySelectorAll('[data-editor-save]').forEach((btn) => {
      btn.addEventListener('click', () => _saveEditedPdf(viewer));
    });
    _wirePageEditor(viewer);
  }

  return { swap, cardView, viewer };
}

function _showViewer(container, color) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  viewer.style.setProperty('--extractor-color', color);
  viewer.style.setProperty('--extractor-bg', `color-mix(in srgb, ${color} 11%, transparent)`);
  viewer.style.setProperty('--extractor-bg-strong', `color-mix(in srgb, ${color} 20%, transparent)`);

  document.body.classList.add('has-extractor-viewer', 'has-editor-viewer');
  cardView.style.opacity = '0';
  cardView.style.transform = 'translateY(8px)';
  setTimeout(() => {
    cardView.classList.add('extractor-hidden');
    viewer.classList.add('extractor-viewer--visible');
  }, 300);
}

function _closeViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  document.body.classList.remove('has-extractor-viewer', 'has-editor-viewer');
  viewer.classList.remove('extractor-viewer--visible', 'editor-viewer--canvas-mode');
  cardView.classList.remove('extractor-hidden');
  requestAnimationFrame(() => {
    cardView.style.opacity = '1';
    cardView.style.transform = 'translateY(0)';
  });
}

function _scrollToViewer(viewer) {
  const mainContent = document.getElementById('main-content');
  if (mainContent && viewer) {
    const top = viewer.getBoundingClientRect().top + mainContent.scrollTop - 70;
    mainContent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}

function _updateSelection(viewer, pageNumber) {
  viewer.querySelectorAll('.extractor-page-card').forEach((card) => {
    const isSelected = parseInt(card.dataset.pageIndex, 10) + 1 === pageNumber;
    card.classList.toggle('extractor-card-selected', isSelected);
    card.classList.toggle('extractor-card-highlight', isSelected);
  });
}

function _pageByNumber(pageNumber) {
  return _pages.find((page) => page.page_number === pageNumber);
}

function _gridThumbForPage(page) {
  return page.editedDataUri || page.thumbnailDataUri || _thumbnailDataUri(page.thumbnail);
}

async function _openPageEditor(pageNumber, viewer) {
  const page = _pageByNumber(pageNumber);
  if (!page) return;

  _selectedPage = pageNumber;
  _updateSelection(viewer, pageNumber);
  viewer.classList.add('editor-viewer--canvas-mode');
  viewer.querySelector('#ed-page-editor').setAttribute('aria-hidden', 'false');
  viewer.querySelector('#ed-page-indicator').textContent = `Page ${pageNumber} of ${_pageCount}`;
  _scrollToViewer(viewer);

  _initCanvasForPage(viewer, page);

  if (!page.baseDataUri) {
    _ensurePageImage(page).then(() => {
      if (_selectedPage === pageNumber && _editorState?.page === page) {
        _initCanvasForPage(viewer, page);
      }
    }).catch((err) => {
      pushNotification({
        type: 'warning',
        message: 'Preview Limited',
        detail: err.message || 'Could not render this page for editing.',
      });
    });
  }
}

function _buildPageCards(viewer, pages) {
  const grid = viewer.querySelector('.editor-page-grid');
  grid.innerHTML = '';

  pages.forEach((page) => {
    const pageNumber = page.page_number;
    const dataUri = _gridThumbForPage(page);
    const card = document.createElement('div');
    card.className = 'extractor-page-card editor-page-card';
    card.dataset.pageIndex = String(pageNumber - 1);
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="extractor-thumb-stage">
        ${dataUri
          ? `<img src="${dataUri}" alt="Page ${pageNumber} preview" draggable="false" />`
          : '<div class="extractor-thumb-skeleton" aria-hidden="true"></div>'}
        <span class="ed-edited-badge"${page.editedDataUri ? '' : ' hidden'}>Edited</span>
        <div class="extractor-selected-overlay">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.3"/>
            <path d="M5 8.2l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="extractor-page-number">Page ${pageNumber}</div>`;

    card.addEventListener('click', () => _openPageEditor(pageNumber, viewer));
    grid.appendChild(card);
  });
}

function _buildPlaceholderPages(pageCount, firstThumbnail = null) {
  return Array.from({ length: pageCount }, (_, index) => ({
    page_number: index + 1,
    thumbnail: null,
    thumbnailDataUri: index === 0 ? firstThumbnail : null,
    image: null,
    baseDataUri: null,
    editedDataUri: null,
    overlayDataUri: null,
    hasEdits: false,
    width: 595,
    height: 842,
    history: [],
    redo: [],
  }));
}

function _setCardThumbnail(viewer, page, dataUri) {
  const card = viewer.querySelector(`.editor-page-card[data-page-index="${page.page_number - 1}"]`);
  const stage = card?.querySelector('.extractor-thumb-stage');
  if (!stage || !dataUri) return;

  const skeleton = stage.querySelector('.extractor-thumb-skeleton');
  if (skeleton) skeleton.remove();

  let img = stage.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.alt = `Page ${page.page_number} preview`;
    img.draggable = false;
    stage.insertBefore(img, stage.firstChild);
  }
  img.src = dataUri;
}

async function _renderPageToDataUri(pdfPage, scale) {
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  return {
    dataUri: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

async function _renderPageThumbnail(pageNumber, viewer, token) {
  if (!_pdfDoc || token !== _renderToken) return;
  const pdfPage = await _pdfDoc.getPage(pageNumber);
  if (token !== _renderToken) return;

  const vp1 = pdfPage.getViewport({ scale: 1 });
  const viewport = pdfPage.getViewport({ scale: THUMBNAIL_SCALE });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  if (token !== _renderToken) return;

  const page = _pageByNumber(pageNumber);
  if (page) {
    page.width = vp1.width;
    page.height = vp1.height;
  }

  const card = viewer.querySelector(`.editor-page-card[data-page-index="${pageNumber - 1}"]`);
  const stage = card?.querySelector('.extractor-thumb-stage');
  if (!stage) return;

  const skeleton = stage.querySelector('.extractor-thumb-skeleton');
  if (skeleton) skeleton.remove();

  const existingCanvas = stage.querySelector('canvas');
  if (existingCanvas) existingCanvas.remove();
  const existingImg = stage.querySelector('img');
  if (existingImg) existingImg.remove();

  const overlay = stage.querySelector('.extractor-selected-overlay');
  if (overlay) {
    stage.insertBefore(canvas, overlay);
  } else {
    stage.appendChild(canvas);
  }
}

async function _ensurePageImage(page) {
  if (page.baseDataUri) return page.baseDataUri;
  if (!_pdfDoc && _pdfLoadPromise) await _pdfLoadPromise;
  if (!_pdfDoc) throw new Error('PDF preview is still loading.');

  const pdfPage = await _pdfDoc.getPage(page.page_number);
  const viewport = pdfPage.getViewport({ scale: 1 });
  page.width = viewport.width;
  page.height = viewport.height;
  const scale = Math.min(
    EDIT_PAGE_MAX_WIDTH / Math.max(viewport.width, 1),
    EDIT_PAGE_MAX_HEIGHT / Math.max(viewport.height, 1),
    3  // HD: allow up to 3x for crisp high-resolution output
  );
  const rendered = await _renderPageToDataUri(pdfPage, scale);
  page.baseDataUri = rendered.dataUri;
  page.image = rendered.dataUri;
  return page.baseDataUri;
}

async function _loadPdfJsDocument(file, viewer, token) {
  const pdfjsLib = await _ensurePdfJs();
  const buffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
  if (token !== _renderToken) return;

  _pdfDoc = pdfDoc;
  _renderThumbnailsQueue(viewer, token);
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
        _renderPageThumbnail(p, viewer, token).catch(() => {
          const card = viewer.querySelector(`.editor-page-card[data-page-index="${p - 1}"]`);
          const stage = card?.querySelector('.extractor-thumb-stage');
          if (stage && !stage.querySelector('canvas, img')) {
            stage.innerHTML = '<span class="extractor-empty-state">Preview failed</span>';
          }
        })
      );
    }
    await Promise.all(batch);
  }
}

async function _loadPdfIntoViewer(container, file) {
  const tool = getActiveTool();
  const color = (tool && tool.color) || EDITOR_COLOR;
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  removeEditorPanel();
  showProgress(zone, 10, color, 'Reading PDF offline…');
  _renderToken += 1;
  const token = _renderToken;

  let info = null;
  try {
    const offlineInfo = await getOfflinePdfInfo(file, 0.5);
    info = {
      page_count: offlineInfo.pageCount || 0,
      thumbnail: offlineInfo.thumbnail,
      pdfDoc: offlineInfo.pdfDoc,
    };
  } catch (offlineErr) {
    showError(zone, `Could not read PDF: ${offlineErr.message}`);
    return;
  }

  if (token !== _renderToken) return;

  _selectedFile = file;
  _pageCount = info.page_count || 0;
  _pages = _buildPlaceholderPages(_pageCount, info.thumbnail);
  _sessionId = null;
  _selectedPage = null;
  _activeContainer = container || document.getElementById('explore-section') || document.body;
  _pdfDoc = info.pdfDoc || null;

  updateProgress(zone, 100, color, tool.id);
  resetZoneContent(zone);
  _showPdfThumbnail(zone, file, color, info.thumbnail);

  const { viewer: activeViewer } = _getSwapParts(_activeContainer);
  if (!activeViewer) return;

  _showViewer(_activeContainer, color);
  activeViewer.querySelector('.extractor-file-name').textContent = file.name;
  activeViewer.querySelector('.extractor-page-count').textContent =
    `${_pageCount} page${_pageCount === 1 ? '' : 's'} ready to edit`;
  _buildPageCards(activeViewer, _pages);

  // Wait for the viewer transition (300 ms) + two animation frames so the
  // full page-card grid has been laid out before we scroll to it.
  setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _scrollToViewer(activeViewer);
      });
    });
  }, 320);

  _pdfLoadPromise = (_pdfDoc ? Promise.resolve(_pdfDoc) : loadPdfDocument(file))
    .then((doc) => {
      if (token !== _renderToken) return;
      _pdfDoc = doc;
      _renderThumbnailsQueue(activeViewer, token);
    })
    .catch(() => {})
    .finally(() => {
      if (token === _renderToken) _pdfLoadPromise = null;
    });
}

function _defaultEditorState(viewer) {
  return {
    viewer,
    page: null,
    canvasEl: viewer.querySelector('#ed-overlay-canvas'),
    fabric: null,
    stage: viewer.querySelector('#ed-canvas-stage'),
    scroll: viewer.querySelector('#ed-canvas-scroll'),
    tool: 'pen',
    color: '#000000',
    size: 'medium',
    brushWidth: 5,
    shapeWidth: 3,
    opacity: 1,
    fontFamily: 'Arial',
    fontSize: 32,
    bold: false,
    italic: false,
    zoom: 1,
    startPoint: null,
    activeShape: null,
    suspendHistory: false,
    panning: false,
    spaceDown: false,
  };
}

function _wirePageEditor(viewer) {
  _editorState = _defaultEditorState(viewer);
  const state = _editorState;
  _ensureFabricCanvas(state);

  viewer.querySelector('.ed-page-back').addEventListener('click', () => _backToGrid(viewer));
  viewer.querySelector('#ed-apply-btn').addEventListener('click', () => {
    _saveCurrentPageEdit(viewer);
    _backToGrid(viewer);
  });

  viewer.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => _setTool(viewer, btn.dataset.tool));
  });

  const brushWidthSlider = viewer.querySelector('#ed-brush-width');
  if (brushWidthSlider) {
    brushWidthSlider.addEventListener('input', () => {
      state.brushWidth = parseInt(brushWidthSlider.value, 10) || 5;
      const brushVal = viewer.querySelector('#ed-brush-width-val');
      if (brushVal) brushVal.textContent = `${state.brushWidth}px`;
      _configureActiveBrush();
    });
  }

  const shapeWidthSlider = viewer.querySelector('#ed-shape-width');
  if (shapeWidthSlider) {
    shapeWidthSlider.addEventListener('input', () => {
      state.shapeWidth = parseInt(shapeWidthSlider.value, 10) || 3;
      const valLabel = viewer.querySelector('#ed-shape-width-val');
      if (valLabel) valLabel.textContent = `${state.shapeWidth}px`;

      const active = state.fabric?.getActiveObject();
      if (active) {
        if (active.type === 'group' && active.getObjects) {
          active.getObjects().forEach((child) => {
            if (child.type === 'line' || child instanceof Line) child.set('strokeWidth', state.shapeWidth);
          });
        } else if (active.stroke) {
          active.set('strokeWidth', state.shapeWidth);
        }
        state.fabric.requestRenderAll();
        _afterFabricChange();
      }
    });
  }

  const opacity = viewer.querySelector('#ed-opacity');
  if (opacity) {
    opacity.addEventListener('input', () => {
      state.opacity = parseInt(opacity.value, 10) / 100;
      viewer.querySelector('#ed-opacity-val').textContent = `${opacity.value}%`;
      _configureActiveBrush();
    });
  }

  const fontTrigger = viewer.querySelector('#ed-font-family-trigger');
  const fontMenu = viewer.querySelector('#ed-font-family-menu');
  const fontLabel = viewer.querySelector('#ed-font-family-label');

  if (fontTrigger && fontMenu) {
    fontTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = fontMenu.classList.contains('open');
      fontMenu.classList.toggle('open', !isOpen);
      fontTrigger.setAttribute('aria-expanded', !isOpen);
    });

    fontMenu.querySelectorAll('.ed-custom-select-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        state.fontFamily = val;
        if (fontLabel) fontLabel.textContent = val;
        fontMenu.querySelectorAll('.ed-custom-select-option').forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        fontMenu.classList.remove('open');
        fontTrigger.setAttribute('aria-expanded', 'false');

        const active = state.fabric?.getActiveObject();
        if (active && _isTextObject(active)) {
          active.set('fontFamily', state.fontFamily);
          state.fabric.requestRenderAll();
          _afterFabricChange();
        }
      });
    });

    document.addEventListener('click', (e) => {
      if (!viewer.querySelector('#ed-font-family-select')?.contains(e.target)) {
        fontMenu.classList.remove('open');
        fontTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const fontSizeSlider = viewer.querySelector('#ed-font-size');
  if (fontSizeSlider) {
    fontSizeSlider.addEventListener('input', () => {
      state.fontSize = parseInt(fontSizeSlider.value, 10) || 32;
      const fontVal = viewer.querySelector('#ed-font-size-val');
      if (fontVal) fontVal.textContent = `${state.fontSize}px`;
      const active = state.fabric?.getActiveObject();
      if (active && _isTextObject(active)) {
        active.set('fontSize', state.fontSize);
        state.fabric.requestRenderAll();
        _afterFabricChange();
      }
    });
  }
  viewer.querySelector('#ed-bold').addEventListener('click', (e) => {
    state.bold = !state.bold;
    e.currentTarget.classList.toggle('active', state.bold);
    const active = state.fabric?.getActiveObject();
    if (active && _isTextObject(active)) {
      active.set('fontWeight', state.bold ? '700' : '400');
      state.fabric.requestRenderAll();
      _afterFabricChange();
    }
  });
  viewer.querySelector('#ed-italic').addEventListener('click', (e) => {
    state.italic = !state.italic;
    e.currentTarget.classList.toggle('active', state.italic);
    const active = state.fabric?.getActiveObject();
    if (active && _isTextObject(active)) {
      active.set('fontStyle', state.italic ? 'italic' : 'normal');
      state.fabric.requestRenderAll();
      _afterFabricChange();
    }
  });

  viewer.querySelectorAll('.ed-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => _setColor(viewer, swatch.dataset.color));
  });
  viewer.querySelector('#ed-hex-input').addEventListener('change', (e) => {
    let value = e.target.value.trim();
    if (value && !value.startsWith('#')) value = `#${value}`;
    if (/^#[0-9a-f]{6}$/i.test(value)) _setColor(viewer, value.toUpperCase());
    else e.target.value = state.color;
  });

  viewer.querySelector('#ed-add-image').addEventListener('click', () => {
    viewer.querySelector('#ed-image-input').click();
  });
  viewer.querySelector('#ed-image-input').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) _insertImage(file);
  });

  // Delete Selected toolbar button
  const deleteSelectedBtn = viewer.querySelector('#ed-delete-selected');
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => _deleteSelectedObject(viewer));
  }
  // Floating delete badge click (same action)
  const floatDeleteBtn = viewer.querySelector('#ed-float-delete');
  if (floatDeleteBtn) {
    floatDeleteBtn.addEventListener('click', () => _deleteSelectedObject(viewer));
  }

  viewer.querySelector('#ed-clear').addEventListener('click', () => {
    if (!state.page || !confirm('Clear all edits on this page?')) return;
    _clearFabricObjects();
    _saveCurrentPageEdit(viewer);
  });

  state.fabric.on('selection:created', (opt) => _onObjectSelected(viewer, opt));
  state.fabric.on('selection:updated', (opt) => _onObjectSelected(viewer, opt));
  state.fabric.on('selection:cleared', () => _onSelectionCleared(viewer));
  state.fabric.on('mouse:down', _fabricPointerDown);
  state.fabric.on('mouse:move', _fabricPointerMove);
  state.fabric.on('mouse:up', _fabricPointerUp);
  state.fabric.on('path:created', () => _afterFabricChange());
  state.fabric.on('object:modified', () => _afterFabricChange());
  state.fabric.on('object:removed', () => _afterFabricChange());
  state.fabric.on('text:changed', () => _afterFabricChange());
  state.canvasEl.addEventListener('wheel', _handleWheel, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      state.spaceDown = true;
      state.scroll.classList.add('ed-panning-ready');
    }
    // Delete / Backspace: remove selected fabric object (skip if text is being edited)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !_isTypingInText()) {
      e.preventDefault();
      _deleteSelectedObject(viewer);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      _undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      _redo();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.spaceDown = false;
      state.panning = false;
      state.scroll.classList.remove('ed-panning-ready', 'ed-panning');
    }
  });
}

function _baseName(name) {
  return String(name || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim() || 'document';
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read PDF file.'));
    reader.readAsDataURL(file);
  });
}

function _dataUriToBlob(dataUri, type = 'application/pdf') {
  const raw = String(dataUri || '');
  const b64 = raw.includes(',') ? raw.split(',', 2)[1] : raw;
  const bytes = atob(b64);
  const uint8 = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) uint8[i] = bytes.charCodeAt(i);
  return new Blob([uint8], { type });
}

function _editedPagesPayload() {
  return _pages
    .filter((page) => page.hasEdits && page.editedDataUri)
    .map((page) => ({
      page_number: page.page_number,
      image: page.editedDataUri,
    }));
}

function _resetAfterEditorSave() {
  removeEditorPanel();
  clearBgJob();
  const activeTool = getActiveTool();
  if (activeTool) {
    import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
    }).catch(() => {});
  }
}

async function _saveEditedPdf(viewer) {
  if (!_selectedFile || !_pageCount) return;
  if (viewer.classList.contains('editor-viewer--canvas-mode') && _pageHasCanvasEdits()) {
    _saveCurrentPageEdit(viewer);
  }

  const edits = _editedPagesPayload();
  if (!edits.length) {
    pushNotification({
      type: 'warning',
      message: 'No edits to save',
      detail: 'Edit at least one page before saving the PDF.',
    });
    return;
  }

  const tool = getActiveTool();
  const color = (tool && tool.color) || EDITOR_COLOR;
  const zone = document.getElementById('drop-zone');
  const outName = `edited_${_baseName(_selectedFile.name)}.pdf`;

  if (_activeContainer) _closeViewer(_activeContainer);
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

  if (zone) {
    resetZoneContent(zone);
    showProgress(zone, 15, color, 'Saving PDF...');
  }
  setBgJob({ jobId: null, tool, filename: outName, progress: 15, state: 'running', sse: null });
  syncBgJobBar();

  try {
    const file = await _fileToBase64(_selectedFile);
    if (zone) updateProgress(zone, 45, color, tool.id);
    const bgMid = getBgJob();
    if (bgMid) {
      bgMid.progress = 45;
      syncBgJobBar();
    }

    const res = await fetch(`${BACKEND}/api/pdf/editor/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, edits, filename: outName }),
    });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      throw new Error(typeof detail === 'string' ? detail : `Server error ${res.status}`);
    }
    const output = json.file || json.output || json.pdf || json.data;
    if (!output) throw new Error('Backend did not return an edited PDF.');

    const blob = _dataUriToBlob(output, 'application/pdf');

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

    if (zone && getActiveTool()?.id === 'editor') {
      setTimeout(() => showDownloadBlobCard(zone, blob, outName, color, _resetAfterEditorSave), 200);
    }


  } catch (err) {
    if (zone) showError(zone, err.message || 'Unable to save edited PDF.');
    clearBgJob();
  }
}

function _setTool(viewer, tool) {
  if (!_editorState) return;
  _editorState.tool = tool;
  viewer.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  const label = viewer.querySelector('#ed-active-tool-label');
  if (label) label.textContent = `${TOOL_LABELS[tool] || 'Edit'} Tool Selected`;
  viewer.querySelector('#ed-canvas-stage').classList.toggle('ed-stage--draw-active', _isDrawTool(tool));
  _configureCanvasMode();
}

function _setColor(viewer, color) {
  if (!_editorState) return;
  _editorState.color = color;
  viewer.querySelector('#ed-current-color').style.background = color;
  viewer.querySelector('#ed-hex-input').value = color;
  viewer.querySelectorAll('.ed-swatch').forEach((swatch) => {
    swatch.classList.toggle('active', swatch.dataset.color.toLowerCase() === color.toLowerCase());
  });
  _configureActiveBrush();

  const active = _editorState.fabric?.getActiveObject();
  if (active) {
    _applyColorToObject(active, color);
    _editorState.fabric.requestRenderAll();
    _afterFabricChange();
  }
}

function _initCanvasForPage(viewer, page) {
  const state = _editorState || _defaultEditorState(viewer);
  _editorState = state;
  _ensureFabricCanvas(state);
  state.page = page;
  const previewSrc = page.baseDataUri || page.thumbnailDataUri || _thumbnailDataUri(page.thumbnail) || '';
  state.stage.classList.toggle('ed-stage--loading', !previewSrc);

  const width = Math.max(1, parseInt(page.width || 595, 10));
  const height = Math.max(1, parseInt(page.height || 842, 10));
  state.fabric.setDimensions({ width, height });
  state.fabric.setZoom(1);

  _setFabricBackground(previewSrc, width, height).then(() => {
    state.stage.classList.toggle('ed-stage--loading', !previewSrc);
  });
  _loadFabricObjects(page.fabricObjects || []).then(() => {
    if (!page.history || page.history.length === 0) {
      page.history = [_currentFabricSnapshot()];
    }
  });
  page.redo = page.redo || [];
  state.zoom = _fitZoomForPage(width, height, state.scroll);
  _applyZoom();
  _configureCanvasMode();
  requestAnimationFrame(() => {
    state.scroll.scrollTop = 0;
    state.scroll.scrollLeft = 0;
  });
}

function _fitZoomForPage(width, height, scrollEl) {
  const availableWidth = Math.max(300, (scrollEl?.clientWidth || 900) - 48);
  const availableHeight = Math.max(300, (scrollEl?.clientHeight || 760) - 48);
  const fit = Math.min(availableWidth / width, availableHeight / height);
  return parseFloat(Math.max(0.2, Math.min(fit, 2.5)).toFixed(2));
}

function _applyZoom() {
  const state = _editorState;
  if (!state || !state.page) return;
  const width = Math.max(1, parseInt(state.page.width || 595, 10));
  const height = Math.max(1, parseInt(state.page.height || 842, 10));
  const stageW = Math.round(width * state.zoom);
  const stageH = Math.round(height * state.zoom);
  state.stage.style.width = `${stageW}px`;
  state.stage.style.height = `${stageH}px`;
  state.fabric?.setZoom(state.zoom);
  state.fabric?.setDimensions({
    width: stageW,
    height: stageH,
  });
  state.fabric?.calcOffset();
  state.fabric?.requestRenderAll();
}

function _ensureFabricCanvas(state) {
  if (state.fabric) return state.fabric;

  state.fabric = new FabricCanvas(state.canvasEl, {
    preserveObjectStacking: true,
    selection: true,
    fireRightClick: false,
    stopContextMenu: true,
  });
  state.fabric.freeDrawingBrush = new PencilBrush(state.fabric);
  _configureActiveBrush();
  _configureCanvasMode();
  return state.fabric;
}

function _onObjectSelected(viewer, opt) {
  const state = _editorState;
  if (!state) return;
  const obj = opt?.selected?.[0] || state.fabric?.getActiveObject();
  if (!obj) return;

  _applyRotateControl(obj);

  // Enable toolbar delete button
  const delBtn = viewer.querySelector('#ed-delete-selected');
  if (delBtn) delBtn.disabled = false;

  if (_isFabricImageObject(obj)) {
    _setTool(viewer, 'select');
  } else if (_isTextObject(obj)) {
    if (obj.fontFamily) {
      state.fontFamily = obj.fontFamily;
      const fontLabel = viewer.querySelector('#ed-font-family-label');
      if (fontLabel) fontLabel.textContent = obj.fontFamily;
    }
    if (obj.fontSize) {
      state.fontSize = obj.fontSize;
      const fsInput = viewer.querySelector('#ed-font-size');
      const fsVal = viewer.querySelector('#ed-font-size-val');
      if (fsInput) fsInput.value = obj.fontSize;
      if (fsVal) fsVal.textContent = `${obj.fontSize}px`;
    }
    const isBold = obj.fontWeight === '700' || obj.fontWeight === 'bold';
    state.bold = isBold;
    viewer.querySelector('#ed-bold')?.classList.toggle('active', isBold);
    const isItalic = obj.fontStyle === 'italic';
    state.italic = isItalic;
    viewer.querySelector('#ed-italic')?.classList.toggle('active', isItalic);
  }
  state.fabric.requestRenderAll();
}

function _onSelectionCleared(viewer) {
  // Disable toolbar delete button
  const delBtn = viewer.querySelector('#ed-delete-selected');
  if (delBtn) delBtn.disabled = true;
}

function _deleteSelectedObject(viewer) {
  const state = _editorState;
  if (!state?.fabric || !state.page) return;
  const active = state.fabric.getActiveObject();
  if (!active) return;
  // Handle multi-object selection
  if (active.type === 'activeSelection' && active.getObjects) {
    const objs = active.getObjects();
    state.fabric.discardActiveObject();
    objs.forEach((obj) => state.fabric.remove(obj));
  } else {
    state.fabric.remove(active);
    state.fabric.discardActiveObject();
  }
  state.fabric.requestRenderAll();
  _afterFabricChange();
  _onSelectionCleared(viewer);
}

/** Returns true when the user is currently typing inside a Fabric text object (prevents accidental deletes). */
function _isTypingInText() {
  const state = _editorState;
  if (!state?.fabric) return false;
  const active = state.fabric.getActiveObject();
  return !!active && _isTextObject(active) && !!active.isEditing;
}

/** Positions the floating delete badge above the selected object's bounding box on the canvas stage. */
function _positionFloatDelete(viewer, obj) {
  const state = _editorState;
  const floatDel = viewer.querySelector('#ed-float-delete');
  if (!floatDel || !state?.fabric || !obj) return;
  // getBoundingRect returns coords in canvas (display) pixel space
  const bounds = obj.getBoundingRect();
  const zoom = state.zoom || 1;
  // Center badge horizontally over object, ~40px above top edge
  const badgeLeft = Math.max(0, bounds.left + bounds.width / 2 - 36);
  const badgeTop = Math.max(0, bounds.top - 44);
  floatDel.style.left = `${badgeLeft}px`;
  floatDel.style.top = `${badgeTop}px`;
  floatDel.hidden = false;
}

function _fabricPointerDown(opt) {
  const state = _editorState;
  if (!state || !state.page) return;
  const evt = opt.e;

  if (state.spaceDown) {
    state.panning = true;
    state.panStart = { x: evt.clientX, y: evt.clientY, left: state.scroll.scrollLeft, top: state.scroll.scrollTop };
    state.scroll.classList.add('ed-panning');
    evt.preventDefault();
    return;
  }

  const p = state.fabric.getScenePoint(evt);
  if (state.tool === 'text') {
    state.startPoint = p;
    state.currentPoint = p;
    state.hasDragged = false;
    state.isDrawingText = true;
    state.activeTextFrame = new Rect({
      left: p.x,
      top: p.y,
      width: 1,
      height: 1,
      fill: 'rgba(0, 229, 192, 0.08)',
      stroke: EDITOR_COLOR,
      strokeWidth: 1.5,
      strokeDashArray: [4, 4],
      strokeUniform: true,
      selectable: false,
      evented: false,
    });
    state.fabric.add(state.activeTextFrame);
    state.fabric.requestRenderAll();
    evt.preventDefault();
    return;
  }

  if (!_isShapeTool(state.tool)) return;
  state.startPoint = p;
  state.currentPoint = p;
  state.hasDragged = false;
  state.activeShape = _createShapeObject(p, p, state.tool);
  state.fabric.add(state.activeShape);
  state.fabric.setActiveObject(state.activeShape);
  evt.preventDefault();
}

function _fabricPointerMove(opt) {
  const state = _editorState;
  if (!state || !state.page) return;
  const evt = opt.e;

  if (state.panning && state.panStart) {
    state.scroll.scrollLeft = state.panStart.left - (evt.clientX - state.panStart.x);
    state.scroll.scrollTop = state.panStart.top - (evt.clientY - state.panStart.y);
    evt.preventDefault();
    return;
  }

  if (state.isDrawingText && state.activeTextFrame && state.startPoint) {
    const current = state.fabric.getScenePoint(evt);
    state.currentPoint = current;
    const dist = Math.hypot(current.x - state.startPoint.x, current.y - state.startPoint.y);
    if (dist >= 6) {
      state.hasDragged = true;
    }
    state.activeTextFrame.set({
      left: Math.min(state.startPoint.x, current.x),
      top: Math.min(state.startPoint.y, current.y),
      width: Math.max(1, Math.abs(current.x - state.startPoint.x)),
      height: Math.max(1, Math.abs(current.y - state.startPoint.y)),
    });
    state.fabric.requestRenderAll();
    evt.preventDefault();
    return;
  }

  if (!state.activeShape || !state.startPoint) return;
  const current = state.fabric.getScenePoint(evt);
  state.currentPoint = current;
  const dist = Math.hypot(current.x - state.startPoint.x, current.y - state.startPoint.y);
  if (dist >= 6) {
    state.hasDragged = true;
  }
  const nextShape = _updateShapeObject(state.activeShape, state.startPoint, current, state.tool);
  if (nextShape) state.activeShape = nextShape;
  state.fabric.requestRenderAll();
}

function _fabricPointerUp() {
  const state = _editorState;
  if (!state) return;

  if (state.isDrawingText) {
    if (state.activeTextFrame) {
      state.fabric.remove(state.activeTextFrame);
      state.activeTextFrame = null;
    }
    const a = state.startPoint || { x: 50, y: 50 };
    const b = state.currentPoint || a;
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const finalWidth = (state.hasDragged && w >= 30) ? Math.max(80, w) : 200;

    const text = new Textbox('Type text here', {
      left: left,
      top: top,
      width: finalWidth,
      fill: _hexToRgba(state.color, state.opacity),
      fontSize: state.fontSize || 32,
      fontFamily: state.fontFamily || 'Arial',
      fontWeight: state.bold ? '700' : '400',
      fontStyle: state.italic ? 'italic' : 'normal',
      cornerColor: EDITOR_COLOR,
      borderColor: EDITOR_COLOR,
      cornerStyle: 'circle',
      cornerSize: 11,
      touchCornerSize: 24,
      transparentCorners: false,
      hasRotatingPoint: true,
      editable: true,
    });
    _applyRotateControl(text);
    state.fabric.add(text);
    state.fabric.setActiveObject(text);
    _setTool(state.viewer, 'select');
    state.fabric.requestRenderAll();

    setTimeout(() => {
      text.enterEditing();
      text.selectAll();
      state.fabric.requestRenderAll();
    }, 50);

    _afterFabricChange();

    state.isDrawingText = false;
    state.startPoint = null;
    state.currentPoint = null;
    state.hasDragged = false;
    return;
  }

  if (state.activeShape) {
    const dist = state.startPoint && state.currentPoint
      ? Math.hypot(state.currentPoint.x - state.startPoint.x, state.currentPoint.y - state.startPoint.y)
      : 0;

    if (!state.hasDragged || dist < 6) {
      state.fabric.remove(state.activeShape);
      state.fabric.discardActiveObject();
      state.fabric.requestRenderAll();
    } else {
      state.activeShape.set({
        selectable: true,
        evented: true,
        cornerColor: EDITOR_COLOR,
        borderColor: EDITOR_COLOR,
        cornerStyle: 'circle',
        transparentCorners: false,
      });
      _applyRotateControl(state.activeShape);
      state.activeShape.setCoords();
      state.fabric.requestRenderAll();
      _afterFabricChange();
    }
    state.activeShape = null;
    state.startPoint = null;
    state.currentPoint = null;
    state.hasDragged = false;
  }

  state.panning = false;
  state.scroll?.classList.remove('ed-panning');
}

function _configureCanvasMode() {
  const state = _editorState;
  if (!state?.fabric) return;
  state.fabric.isDrawingMode = state.tool === 'pen' || state.tool === 'highlighter';
  state.fabric.selection = state.tool === 'select';
  if (state.fabric.isDrawingMode) state.fabric.discardActiveObject();
  state.fabric.defaultCursor = _isPlacementTool(state.tool) ? 'crosshair' : 'default';
  state.fabric.hoverCursor = _isPlacementTool(state.tool) ? 'crosshair' : 'move';
  state.fabric.getObjects().forEach((obj) => {
    obj.selectable = !state.fabric.isDrawingMode;
    obj.evented = !state.fabric.isDrawingMode;
  });
  _configureActiveBrush();
}

function _insertImage(file) {
  const state = _editorState;
  if (!state || !state.page || !file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const image = await _fabricImageFromURL(reader.result);
    const maxW = state.fabric.width * 0.38;
    const maxH = state.fabric.height * 0.38;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    image.set({
      left: (state.fabric.width - image.width * scale) / 2,
      top: (state.fabric.height - image.height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      selectable: true,
      evented: true,
      cornerColor: EDITOR_COLOR,
      borderColor: EDITOR_COLOR,
      cornerStyle: 'circle',
      cornerSize: 13,
      touchCornerSize: 28,
      transparentCorners: false,
      hasRotatingPoint: true,
      lockUniScaling: false,
    });
    _applyRotateControl(image);
    _setTool(state.viewer, 'select');
    state.fabric.add(image);
    state.fabric.setActiveObject(image);
    _afterFabricChange();
  };
  reader.readAsDataURL(file);
}

export function insertImageIntoActiveEditor(file) {
  if (!_editorState?.page || !_activeContainer?.querySelector('#editor-viewer.editor-viewer--canvas-mode')) {
    return false;
  }
  if (!file || !file.type?.startsWith('image/')) return false;
  _insertImage(file);
  return true;
}

function _applyRotateControl(obj) {
  if (!obj) return;
  if (!obj.controls) {
    obj.controls = controlsUtils.createObjectDefaultControls();
  }
  // Rotate handle at top-center
  obj.controls.mtr = new Control({
    x: 0,
    y: -0.5,
    offsetY: -34,
    cursorStyleHandler: controlsUtils.rotationStyleHandler,
    actionHandler: controlsUtils.rotationWithSnapping,
    actionName: 'rotate',
    render: _renderRotateControl,
  });
  // Delete control at top-right corner — anchored like the rotate handle
  obj.controls.deleteControl = new Control({
    x: 0.5,
    y: -0.5,
    offsetX: 18,
    offsetY: -18,
    sizeX: 30,
    sizeY: 30,
    cursorStyle: 'pointer',
    mouseUpHandler: (_eventData, transform) => {
      const canvas = transform.target.canvas;
      if (!canvas) return false;
      const target = transform.target;
      if (target.type === 'activeSelection' && target.getObjects) {
        const objs = target.getObjects();
        canvas.discardActiveObject();
        objs.forEach((o) => canvas.remove(o));
      } else {
        canvas.remove(target);
        canvas.discardActiveObject();
      }
      canvas.requestRenderAll();
      _afterFabricChange();
      return true;
    },
    render: _renderDeleteControl,
  });
  obj.setControlsVisibility({
    ml: true,
    mr: true,
    mt: true,
    mb: true,
    tl: true,
    tr: true,
    bl: true,
    br: true,
    mtr: true,
    deleteControl: true,
  });
  obj.set({
    cornerColor: EDITOR_COLOR,
    borderColor: EDITOR_COLOR,
    cornerStyle: 'circle',
    cornerSize: 11,
    touchCornerSize: 24,
    transparentCorners: false,
    hasRotatingPoint: true,
  });
}


function _isFabricImageObject(obj) {
  return !!obj && (obj instanceof FabricImage || obj.isType?.('image') || String(obj.type || '').toLowerCase() === 'image');
}

function _isTextObject(obj) {
  return !!obj && (obj instanceof Textbox || obj instanceof IText || obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text');
}

function _renderRotateControl(ctx, left, top) {
  ctx.save();
  ctx.translate(left, top);

  // Connecting stem line from handle downwards to the object border (at y = 34)
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(0, 34);
  ctx.strokeStyle = '#00E5C0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Shadow for 3D depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  // Outer glossy badge
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#041B18';
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#00E5C0';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Curved rotation arrow icon
  ctx.strokeStyle = '#E8FFF9';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, -0.25 * Math.PI, 1.15 * Math.PI);
  ctx.stroke();

  // Arrow tip
  ctx.fillStyle = '#00E5C0';
  ctx.beginPath();
  ctx.moveTo(5, -7.5);
  ctx.lineTo(10.5, -7.5);
  ctx.lineTo(8.5, -2.5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function _renderDeleteControl(ctx, left, top) {
  ctx.save();
  ctx.translate(left, top);

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 2;

  // Outer circle — vivid red fill with teal ring for visibility
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#C0392B';
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#FF6B6B';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Trash-can icon drawn in white — lid
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  // lid top bar
  ctx.moveTo(-6, -5);
  ctx.lineTo(6, -5);
  ctx.stroke();
  // lid handle
  ctx.beginPath();
  ctx.moveTo(-2, -5);
  ctx.lineTo(-2, -7.5);
  ctx.lineTo(2, -7.5);
  ctx.lineTo(2, -5);
  ctx.stroke();
  // body
  ctx.beginPath();
  ctx.moveTo(-5, -4);
  ctx.lineTo(-4, 6);
  ctx.lineTo(4, 6);
  ctx.lineTo(5, -4);
  ctx.stroke();
  // inner lines
  ctx.beginPath();
  ctx.moveTo(-1.5, -2);
  ctx.lineTo(-1.5, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1.5, -2);
  ctx.lineTo(1.5, 4);
  ctx.stroke();

  ctx.restore();
}

function _handleWheel(evt) {
  const state = _editorState;
  if (!state || !state.page || !evt.ctrlKey) return;
  evt.preventDefault();
  const next = Math.max(0.3, Math.min(3, state.zoom + (evt.deltaY < 0 ? 0.1 : -0.1)));
  state.zoom = parseFloat(next.toFixed(2));
  _applyZoom();
}

function _isDrawTool(tool) {
  return ['pen', 'highlighter'].includes(tool);
}

function _isShapeTool(tool) {
  return ['rect', 'ellipse', 'line', 'arrow'].includes(tool);
}

function _isPlacementTool(tool) {
  return _isShapeTool(tool) || tool === 'text';
}

function _brushWidth() {
  const state = _editorState;
  const width = state.brushWidth || 5;
  return state.tool === 'highlighter' ? width * 2.8 : width;
}

function _hexToRgba(hex, opacity) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function _configureActiveBrush() {
  const state = _editorState;
  if (!state?.fabric) return;
  if (!(state.fabric.freeDrawingBrush instanceof PencilBrush)) {
    state.fabric.freeDrawingBrush = new PencilBrush(state.fabric);
  }
  state.fabric.freeDrawingBrush.width = _brushWidth();
  state.fabric.freeDrawingBrush.color = state.tool === 'highlighter'
    ? _hexToRgba(state.color, 0.4)
    : _hexToRgba(state.color, state.opacity);
  state.fabric.freeDrawingBrush.shadow = state.tool === 'highlighter'
    ? new Shadow({ color: 'rgba(255,255,0,0)', blur: 0, offsetX: 0, offsetY: 0 })
    : null;
}

function _shapeStyle(tool) {
  const state = _editorState;
  const strokeWidth = state.shapeWidth || 3;
  return {
    fill: 'rgba(0,0,0,0)',
    stroke: _hexToRgba(state.color, state.opacity),
    strokeWidth,
    strokeUniform: true,
    selectable: false,
    evented: false,
    objectCaching: false,
  };
}

function _createShapeObject(a, b, tool) {
  const style = _shapeStyle(tool);
  if (tool === 'rect') {
    return new Rect({ left: a.x, top: a.y, width: 1, height: 1, ...style });
  }
  if (tool === 'ellipse') {
    return new Circle({ left: a.x, top: a.y, radius: 1, scaleX: 1, scaleY: 1, ...style });
  }
  if (tool === 'arrow') {
    return _makeArrow(a, b, style);
  }
  return new Line([a.x, a.y, b.x, b.y], style);
}

function _updateShapeObject(obj, a, b, tool) {
  if (tool === 'rect') {
    obj.set({
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    });
    return;
  }
  if (tool === 'ellipse') {
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    obj.set({
      left: Math.min(a.x, b.x),
      top: Math.min(a.y, b.y),
      radius: 1,
      scaleX: Math.max(1, w / 2),
      scaleY: Math.max(1, h / 2),
    });
    return;
  }
  if (tool === 'arrow') {
    const state = _editorState;
    const replacement = _makeArrow(a, b, _shapeStyle(tool));
    state.suspendHistory = true;
    state.fabric.remove(obj);
    state.fabric.add(replacement);
    state.fabric.setActiveObject(replacement);
    state.suspendHistory = false;
    return replacement;
  }
  obj.set({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  return obj;
}

function _makeArrow(a, b, style) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const sw = style.strokeWidth || 3;
  const headLength = Math.max(12, Math.min(32, sw * 3.5));
  const headWidth = Math.max(10, Math.min(28, sw * 2.8));

  const lineEndDist = Math.max(0, len - headLength * 0.75);
  const lineEndX = len > 0 ? a.x + (dx / len) * lineEndDist : b.x;
  const lineEndY = len > 0 ? a.y + (dy / len) * lineEndDist : b.y;

  const line = new Line([a.x, a.y, lineEndX, lineEndY], style);
  const triangle = new Triangle({
    left: b.x,
    top: b.y,
    width: headWidth,
    height: headLength,
    fill: style.stroke,
    stroke: style.stroke,
    strokeWidth: 0,
    angle: (angle * 180) / Math.PI + 90,
    originX: 'center',
    originY: 'top',
  });
  return new Group([line, triangle], {
    selectable: false,
    evented: false,
    objectCaching: false,
  });
}

function _isTinyShape(obj) {
  if (!obj) return true;
  const bounds = obj.getBoundingRect();
  return bounds.width < 8 || bounds.height < 8;
}

function _addFabricText(p) {
  const state = _editorState;
  const text = new Textbox('Type text here', {
    left: p.x,
    top: p.y,
    width: 200,
    fill: _hexToRgba(state.color, state.opacity),
    fontSize: state.fontSize || 32,
    fontFamily: state.fontFamily || 'Arial',
    fontWeight: state.bold ? '700' : '400',
    fontStyle: state.italic ? 'italic' : 'normal',
    cornerColor: EDITOR_COLOR,
    borderColor: EDITOR_COLOR,
    cornerStyle: 'circle',
    cornerSize: 11,
    touchCornerSize: 24,
    transparentCorners: false,
    hasRotatingPoint: true,
    editable: true,
  });
  _applyRotateControl(text);
  state.fabric.add(text);
  state.fabric.setActiveObject(text);
  _setTool(state.viewer, 'select');
  state.fabric.requestRenderAll();
  setTimeout(() => {
    text.enterEditing();
    text.selectAll();
    state.fabric.requestRenderAll();
  }, 50);
  _afterFabricChange();
}

function _applyColorToObject(obj, color) {
  const state = _editorState;
  const value = _hexToRgba(color, state.opacity);
  if (obj.type === 'group' && obj.getObjects) {
    obj.getObjects().forEach((child) => _applyColorToObject(child, color));
    return;
  }
  if (_isTextObject(obj)) {
    obj.set('fill', value);
    return;
  }
  if (obj.fill && obj.fill !== 'rgba(0,0,0,0)') obj.set('fill', value);
  if (obj.stroke) obj.set('stroke', value);
}

function _currentFabricSnapshot() {
  const state = _editorState;
  if (!state?.fabric) return '[]';
  return JSON.stringify(state.fabric.getObjects().map((obj) => obj.toObject([
    'selectable',
    'evented',
    'objectCaching',
    'strokeUniform',
  ])));
}

async function _loadFabricObjects(objects) {
  const state = _editorState;
  if (!state?.fabric) return;
  state.suspendHistory = true;
  state.fabric.discardActiveObject();
  state.fabric.remove(...state.fabric.getObjects());

  const rawObjects = Array.isArray(objects) ? objects : [];
  if (rawObjects.length) {
    const revived = await fabricUtil.enlivenObjects(rawObjects);
    revived.forEach((obj) => {
      _applyRotateControl(obj);
      state.fabric.add(obj);
    });
  }

  state.suspendHistory = false;
  _configureCanvasMode();
  state.fabric.requestRenderAll();
  _saveOverlayOnly();
  if (state.page) {
    state.page.hasEdits = _pageHasCanvasEdits();
    if (!state.page.hasEdits) state.page.editedDataUri = null;
    _refreshEditedCard(state.viewer, state.page);
  }
}

async function _setFabricBackground(dataUri, width, height) {
  const state = _editorState;
  if (!state?.fabric) return;
  if (!dataUri) {
    state.fabric.backgroundImage = null;
    state.fabric.backgroundColor = '#FFFFFF';
    state.fabric.requestRenderAll();
    return;
  }

  const bg = await _fabricImageFromURL(dataUri);
  bg.set({
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    scaleX: width / (bg.width || width),
    scaleY: height / (bg.height || height),
    selectable: false,
    evented: false,
  });
  state.fabric.backgroundColor = '#FFFFFF';
  state.fabric.backgroundImage = bg;
  state.fabric.requestRenderAll();
}

async function _fabricImageFromURL(dataUri) {
  return FabricImage.fromURL(dataUri, { crossOrigin: 'anonymous' }, {});
}

function _afterFabricChange() {
  const state = _editorState;
  if (!state || !state.page || state.suspendHistory) return;
  _saveOverlayOnly();
  state.page.hasEdits = _pageHasCanvasEdits();
  const snapshot = _currentFabricSnapshot();
  state.page.history = state.page.history || [];
  if (state.page.history[state.page.history.length - 1] !== snapshot) {
    state.page.history.push(snapshot);
    if (state.page.history.length > 40) state.page.history.shift();
  }
  state.page.redo = [];
}

function _undo() {
  const state = _editorState;
  if (!state?.page?.history || state.page.history.length <= 1) return;
  state.page.redo = state.page.redo || [];
  state.page.redo.push(state.page.history.pop());
  _loadFabricObjects(JSON.parse(state.page.history[state.page.history.length - 1] || '[]'));
}

function _redo() {
  const state = _editorState;
  if (!state?.page?.redo || state.page.redo.length < 1) return;
  const next = state.page.redo.pop();
  state.page.history = state.page.history || [];
  state.page.history.push(next);
  _loadFabricObjects(JSON.parse(next || '[]'));
}

function _clearFabricObjects() {
  const state = _editorState;
  if (!state?.fabric) return;
  state.suspendHistory = true;
  state.fabric.remove(...state.fabric.getObjects());
  state.suspendHistory = false;
  _afterFabricChange();
}

function _saveOverlayOnly() {
  const state = _editorState;
  if (!state || !state.page) return;
  state.page.fabricObjects = JSON.parse(_currentFabricSnapshot());
  // HD: render overlay at 2x resolution for crisp output
  state.page.overlayDataUri = state.fabric.toDataURL({ format: 'png', multiplier: 2 });
}

function _saveCurrentPageEdit(viewer) {
  const state = _editorState;
  if (!state || !state.page) return false;
  _saveOverlayOnly();
  state.page.hasEdits = _pageHasCanvasEdits();
  // HD: export at 2x for full HD output
  state.page.editedDataUri = state.page.hasEdits
    ? state.fabric.toDataURL({ format: 'png', multiplier: 2 })
    : null;
  _refreshEditedCard(viewer, state.page);
  return state.page.hasEdits;
}

function _pageHasCanvasEdits() {
  const state = _editorState;
  return !!state?.fabric && state.fabric.getObjects().length > 0;
}

function _refreshEditedCard(viewer, page) {
  const card = viewer.querySelector(`.editor-page-card[data-page-index="${page.page_number - 1}"]`);
  if (!card) return;
  const stage = card.querySelector('.extractor-thumb-stage');
  if (!stage) return;

  const dataUri = page.editedDataUri || page.thumbnailDataUri || _thumbnailDataUri(page.thumbnail);
  if (dataUri) {
    let img = stage.querySelector('img');
    if (!img) {
      const canvas = stage.querySelector('canvas');
      if (canvas) canvas.remove();
      img = document.createElement('img');
      img.alt = `Page ${page.page_number} preview`;
      img.draggable = false;
      const overlay = stage.querySelector('.extractor-selected-overlay');
      if (overlay) stage.insertBefore(img, overlay);
      else stage.appendChild(img);
    }
    img.src = dataUri;
  }
  const badge = card.querySelector('.ed-edited-badge');
  if (badge) badge.hidden = !(page.hasEdits && page.editedDataUri);
}

function _backToGrid(viewer) {
  const pageNumber = _selectedPage;
  _saveCurrentPageEdit(viewer);
  viewer.classList.remove('editor-viewer--canvas-mode');
  viewer.querySelector('#ed-page-editor').setAttribute('aria-hidden', 'true');
  if (pageNumber) {
    _updateSelection(viewer, pageNumber);
    const card = viewer.querySelector(`.editor-page-card[data-page-index="${pageNumber - 1}"]`);
    if (card) {
      setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }, 50);
    }
  }
}

export function removeEditorPanel() {
  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelectorAll('.dz-editor-thumb-wrap').forEach((thumb) => thumb.remove());
    if (!zone.querySelector('.dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip')) {
      zone.classList.remove('dz-has-thumb');
    }
  }

  const container = _activeContainer || document.getElementById('explore-section') || document.body;
  const viewer = container.querySelector('#editor-viewer');
  const cardView = container.querySelector('#pdf-tools-card-view');
  if (viewer) viewer.classList.remove('extractor-viewer--visible', 'editor-viewer--canvas-mode');
  if (cardView) {
    cardView.classList.remove('extractor-hidden');
    cardView.style.opacity = '1';
    cardView.style.transform = 'translateY(0)';
  }
  document.body.classList.remove('has-extractor-viewer', 'has-editor-viewer');

  _selectedFile = null;
  _pageCount = 0;
  _pages = [];
  _sessionId = null;
  _selectedPage = null;
  _pdfDoc = null;
  _pdfLoadPromise = null;
  _renderToken += 1;
  if (_editorState) {
    _editorState.page = null;
    _editorState.startPoint = null;
    _editorState.activeShape = null;
  }
}

export function handleEditorFilePicked(file) {
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
