/**
 * tools/documents/pdf_tools/water_mark/water_mark.js
 *
 * Interactive PDF Watermark Editor — ToolCEO
 * 100% Offline Page Preview & Visual Drag-and-Drop Watermarking.
 */

import { pushNotification } from '../../../../scripts/notificationStore.js';
import {
  getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob,
} from '../../../../scripts/toolstate.js';
import {
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../../../shared/progress.js';
import { getOfflinePdfInfo, renderPdfPageToDataUri } from '../../../shared/pdfRenderer.js';

const BACKEND = 'http://127.0.0.1:8000';

let _wmFile = null;
let _wmBaseName = '';
let _wmFileSize = 0;
let _wmPageCount = 1;
let _wmHdUri = '';
let _pageWidth = 595;
let _pageHeight = 842;

let _activeContainer = null;

const WM_DEFAULTS = {
  mode: 'text',
  text: '',
  font_family: 'helv',
  font_size: 48,
  color: '#CC0000',
  opacity: 0.73,
  angle: -45,
  spacing: 0,
  x_pct: 50,
  y_pct: 50,
  signature_data_url: '',
  sign_width_pct: 34,
};

let _opts = { ...WM_DEFAULTS };

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function _fontFamilyCss(val) {
  if (val === 'times') return '"Times New Roman", Times, serif';
  if (val === 'cour') return '"Courier New", Courier, monospace';
  return 'Arial, Helvetica, sans-serif';
}

function _isPdfFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf';
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

function _showWatermarkThumbnail(zone, file, color, dataUri = null) {
  if (!zone || !file) return;
  zone.querySelectorAll('.dz-watermark-thumb-wrap').forEach((thumb) => thumb.remove());

  const thumbContent = dataUri
    ? `<img class="dz-pdf-thumb-img" src="${dataUri}" alt="PDF preview" draggable="false" />`
    : _fallbackPdfIcon(color);

  const wrap = document.createElement('div');
  wrap.className = 'dz-pdf-thumb-wrap dz-watermark-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-pdf-thumb-card">
      <div class="dz-pdf-thumb-frame" style="border: 2px solid ${color}; box-shadow: 0 4px 18px rgba(0,0,0,0.45);">
        ${thumbContent}
      </div>
      <button class="dz-pdf-thumb-remove dz-watermark-thumb-remove" title="Remove file" style="--thumb-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pdf-thumb-name">${_esc(file.name)}</span>`;

  zone.classList.add('dz-has-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-watermark-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    if (_activeContainer) _closeViewer(_activeContainer);
    removeWatermarkPanel();
    resetZoneContent(zone);
    const activeTool = getActiveTool();
    if (activeTool) {
      import('../../../../scripts/dropzone.js')
        .then(({ _updateDropZoneForTool }) => { if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool); })
        .catch(() => {});
    }
  });
}

export function removeWatermarkPanel() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  zone.querySelectorAll('.dz-watermark-thumb-wrap').forEach((thumb) => thumb.remove());
  if (!zone.querySelector('.dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip, .dz-editor-thumb-wrap, .dz-rotate-thumb-wrap, .dz-extractor-thumb-wrap')) {
    zone.classList.remove('dz-has-thumb');
  }
}

/** Preview width for scaling PDF pt → screen px (viewer may still be display:none). */
function _previewWidthPx(viewer) {
  const frame = viewer.querySelector('#wm-frame-container');
  const img = viewer.querySelector('#wm-hd-img');

  let w = frame ? frame.clientWidth : 0;
  if (!w && img) w = img.clientWidth || 0;
  if (!w && img && img.naturalWidth && img.naturalHeight) {
    const maxW = 600;
    const maxH = 770;
    const byW = maxW;
    const byH = (img.naturalWidth / img.naturalHeight) * maxH;
    w = Math.min(byW, byH);
  }
  if (!w) w = 600;
  return w;
}

/** Apply watermark label styles to the HD preview overlay. */
function _syncDraggableLabel(viewer) {
  if (!viewer) return;
  const labelEl = viewer.querySelector('#wm-draggable-label');
  if (!labelEl) return;

  const pageW = _pageWidth > 0 ? _pageWidth : 595;
  const scale = _previewWidthPx(viewer) / pageW;
  const displaySize = Math.max(8, Math.round(_opts.font_size * scale));
  const hasSign = _opts.mode === 'sign' && _opts.signature_data_url;
  const hasText = (_opts.text || '').trim().length > 0;

  labelEl.classList.toggle('wm-draggable-label--empty', !hasSign && !hasText);
  labelEl.classList.toggle('wm-draggable-label--sign', !!hasSign);
  labelEl.innerHTML = hasSign
    ? `<img class="wm-sign-preview-img" src="${_opts.signature_data_url}" alt="Signature" draggable="false" />${_rotateHandleHTML()}`
    : `${_esc(_opts.text || '')}${_rotateHandleHTML()}`;
  labelEl.style.fontFamily = _fontFamilyCss(_opts.font_family);
  labelEl.style.fontSize = `${displaySize}px`;
  labelEl.style.fontWeight = '700';
  labelEl.style.color = _opts.color;
  labelEl.style.opacity = String(_opts.opacity);
  labelEl.style.letterSpacing = `${_opts.spacing}px`;
  labelEl.style.left = `${_opts.x_pct}%`;
  labelEl.style.top = `${_opts.y_pct}%`;
  labelEl.style.transform = `translate(-50%, -50%) rotate(${_opts.angle}deg)`;

  if (hasSign) {
    labelEl.style.width = `${Math.max(12, Math.min(70, _opts.sign_width_pct))}%`;
  } else {
    labelEl.style.width = '';
  }
}

function _rotateHandleHTML() {
  return `
    <button class="wm-rotate-handle" type="button" title="Rotate" aria-label="Rotate watermark">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
        <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
        <path d="M21 3v6h-6"/>
      </svg>
    </button>`;
}

// ─── SWAP PARTS (mirrors rotate.js _getSwapParts) ─────────────────────────────

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

  let viewer = target.querySelector('#wm-viewer') || swap.querySelector('#wm-viewer');

  if (
    viewer &&
    (
      !viewer.querySelector('.wm-preview-col') ||
      !viewer.querySelector('#wm-add-sign-btn') ||
      viewer.dataset.wmVer !== '6'
    )
  ) {
    viewer.remove();
    viewer = null;
  }

  if (!viewer) {
    viewer = document.createElement('div');
    viewer.id = 'wm-viewer';
    viewer.className = 'wm-viewer';
    viewer.dataset.wmVer = '6';
    viewer.innerHTML = _buildViewerHTML();
    swap.appendChild(viewer);

    _wireViewerEvents(viewer);
  }

  return { swap, cardView, viewer };
}

function _buildViewerHTML() {
  return `
    <!-- TOP BAR -->
    <div class="wm-topbar">
      <div class="wm-topbar-left">
        <button class="wm-back-btn" type="button" title="Back to PDF tools">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back
        </button>
        <div class="wm-file-meta">
          <span class="wm-file-name">No PDF selected</span>
        </div>
      </div>
      <div class="wm-topbar-actions">
        <div class="wm-filename-wrap" title="Output filename">
          <input class="wm-filename-input" id="wm-filename-input" type="text"
                 placeholder="Output filename" maxlength="120" spellcheck="false" />
          <span class="wm-filename-ext">.pdf</span>
        </div>
        <button class="wm-apply-btn" type="button" id="wm-apply-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
            <text x="7" y="17" font-size="10" font-weight="800" fill="currentColor" font-family="sans-serif">W</text>
          </svg>
          Apply &amp; Save
        </button>
      </div>
    </div>

    <!-- EDITOR BODY -->
    <div class="wm-editor-body">

      <!-- LEFT: HD PAGE PREVIEW -->
      <div class="wm-preview-col">
        <div class="wm-preview-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
          </svg>
          Preview &nbsp;·&nbsp; Drag Text or Sign to Position
        </div>

        <div class="wm-frame-glow">
          <div class="wm-frame-container" id="wm-frame-container">
            <img class="wm-hd-img" id="wm-hd-img" src="" alt="HD PDF Page 1" />
            <div class="wm-draggable-label" id="wm-draggable-label"
                 style="left:50%;top:50%;"></div>
            <div class="wm-position-badge" id="wm-pos-badge">50% · 50%</div>
          </div>
        </div>

        <div class="wm-drag-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M12 12v.01"/>
          </svg>
          Click &amp; drag the text or signature to set position
        </div>
      </div>

      <!-- RIGHT: CONTROLS PANEL -->
      <div class="wm-controls-col">
        <div class="wm-controls-inner">

          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7h16M4 12h10M4 17h6"/></svg>
              Watermark Text
            </div>
            <input type="text" class="wm-text-input" id="wm-text" value=""
                   placeholder="Type watermark text…" maxlength="80" spellcheck="false" />
            <div class="wm-presets-row">
              <button class="wm-preset-badge" data-text="CONFIDENTIAL">CONFIDENTIAL</button>
              <button class="wm-preset-badge" data-text="DRAFT">DRAFT</button>
              <button class="wm-preset-badge" data-text="SAMPLE">SAMPLE</button>
              <button class="wm-preset-badge" data-text="TOP SECRET">TOP SECRET</button>
              <button class="wm-preset-badge" data-text="DO NOT COPY">DO NOT COPY</button>
              <button class="wm-preset-badge" data-text="COPY">COPY</button>
            </div>
          </div>

          <div class="wm-divider"></div>

          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 20h4M12 4v16M4 4h16M16 20h4M9 12h6"/></svg>
              Typography
            </div>
            <div class="wm-grid-2">
              <div class="wm-control-group">
                <label class="wm-label">Font Family</label>
                <select class="wm-select" id="wm-font">
                  <option value="helv" selected>Helvetica / Arial</option>
                  <option value="times">Times New Roman</option>
                  <option value="cour">Courier New</option>
                </select>
              </div>
              <div class="wm-control-group">
                <label class="wm-label">Font Size
                  <span class="wm-label-val" id="wm-size-val">48px</span>
                </label>
                <input type="range" class="wm-slider" id="wm-size"
                       min="10" max="120" value="48" />
              </div>
            </div>
          </div>

          <div class="wm-divider"></div>

          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/><path d="M2 12h20"/></svg>
              Color
            </div>
            <div class="wm-swatches" id="wm-swatches">
              <span class="wm-swatch active" data-color="#CC0000" style="background:#CC0000" title="Red"></span>
              <span class="wm-swatch" data-color="#1D4ED8" style="background:#1D4ED8" title="Blue"></span>
              <span class="wm-swatch" data-color="#15803D" style="background:#15803D" title="Green"></span>
              <span class="wm-swatch" data-color="#000000" style="background:#000000" title="Black"></span>
              <span class="wm-swatch" data-color="#6B7280" style="background:#6B7280" title="Grey"></span>
              <span class="wm-swatch" data-color="#9333EA" style="background:#9333EA" title="Purple"></span>
              <span class="wm-swatch" data-color="#EA580C" style="background:#EA580C" title="Orange"></span>
              <span class="wm-swatch" data-color="#FFFFFF" style="background:#FFFFFF;box-shadow:0 0 0 1.5px #CBD5E1 inset" title="White"></span>
            </div>
          </div>

          <div class="wm-divider"></div>

          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3 9H3l3-9h6z"/><path d="M12 22v-6M12 22c-3 0-5-1-5-4M12 22c3 0 5-1 5-4"/></svg>
              Opacity &amp; Spacing
            </div>
            <div class="wm-grid-2">
              <div class="wm-control-group">
                <label class="wm-label">Opacity
                  <span class="wm-label-val" id="wm-opacity-val">73%</span>
                </label>
                <input type="range" class="wm-slider" id="wm-opacity"
                       min="5" max="100" value="73" />
              </div>
              <div class="wm-control-group">
                <label class="wm-label">Letter Spacing
                  <span class="wm-label-val" id="wm-space-val">0px</span>
                </label>
                <input type="range" class="wm-slider" id="wm-space"
                       min="-2" max="24" value="0" />
              </div>
            </div>
          </div>

          <div class="wm-divider"></div>

          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>
              Add Sign
            </div>
            <div class="wm-add-sign-card">
              <button type="button" class="wm-add-sign-btn" id="wm-add-sign-btn">
                <span class="wm-add-sign-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                </span>
                <span>
                  <strong>Add Sign</strong>
                  <small>Draw a signature and drag it onto the page</small>
                </span>
              </button>
              <div class="wm-sign-status" id="wm-sign-status">No signature added</div>
              <label class="wm-label">
                Sign Size
                <span class="wm-label-val" id="wm-sign-size-val">34%</span>
              </label>
              <input type="range" class="wm-slider" id="wm-sign-size"
                     min="12" max="70" value="34" />
            </div>
          </div>

        </div>
      </div>

    </div>

    <div class="wm-sign-modal" id="wm-sign-modal" aria-hidden="true">
      <div class="wm-sign-modal-backdrop" data-close-sign></div>
      <div class="wm-sign-dialog" role="dialog" aria-modal="true" aria-labelledby="wm-sign-title">
        <div class="wm-sign-dialog-head">
          <div>
            <h3 id="wm-sign-title">Design Signature</h3>
            <p>Create a clean transparent signature for this PDF.</p>
          </div>
          <button type="button" class="wm-sign-close" data-close-sign aria-label="Close signature designer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="wm-sign-tools">
          <label class="wm-sign-tool">
            <span>Name helper</span>
            <input type="text" class="wm-text-input" id="wm-sign-name" placeholder="Type name, then draw or insert" maxlength="48" spellcheck="false" />
          </label>
          <label class="wm-sign-tool wm-sign-tool--compact">
            <span>Ink</span>
            <input type="color" id="wm-sign-color" value="#000000" />
          </label>
          <label class="wm-sign-tool">
            <span>Stroke <b id="wm-sign-stroke-val">3px</b></span>
            <input type="range" class="wm-slider" id="wm-sign-stroke" min="1" max="9" value="3" />
          </label>
        </div>
        <div class="wm-sign-canvas-wrap">
          <canvas id="wm-sign-canvas" width="760" height="260"></canvas>
        </div>
        <div class="wm-sign-actions">
          <button type="button" class="wm-sign-secondary" id="wm-sign-type-btn">Insert Typed Name</button>
          <button type="button" class="wm-sign-secondary" id="wm-sign-clear-btn">Clear</button>
          <button type="button" class="wm-sign-primary" id="wm-sign-insert-btn">Insert Signature</button>
        </div>
      </div>
    </div>
  `;
}

// ─── WIRE VIEWER EVENTS ───────────────────────────────────────────────────────

function _wireViewerEvents(viewer) {
  viewer.querySelector('.wm-back-btn').addEventListener('click', () => {
    _closeViewer(_activeContainer);
  });

  viewer.querySelector('#wm-apply-btn').addEventListener('click', () => {
    if (!_wmFile) return;
    const nameEl = viewer.querySelector('#wm-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || `${_wmBaseName}_watermarked`;
    const opts = _collectOptsFromViewer(viewer);
    _scrollMainToTool();
    _submitWatermark(_wmFile, opts, outName);
  });

  const container = viewer.querySelector('#wm-frame-container');
  const labelEl = viewer.querySelector('#wm-draggable-label');
  const posBadge = viewer.querySelector('#wm-pos-badge');

  function _setPosFromClient(clientX, clientY) {
    if (!container) return;
    const img = container.querySelector('#wm-hd-img');
    const rect = (img && img.clientWidth > 0)
      ? img.getBoundingClientRect()
      : container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    let y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    _opts.x_pct = parseFloat(((x / rect.width) * 100).toFixed(1));
    _opts.y_pct = parseFloat(((y / rect.height) * 100).toFixed(1));
    labelEl.style.left = `${_opts.x_pct}%`;
    labelEl.style.top = `${_opts.y_pct}%`;
    if (posBadge) posBadge.textContent = `${Math.round(_opts.x_pct)}% · ${Math.round(_opts.y_pct)}%`;
  }

  let dragging = false;
  let rotating = false;

  function _setAngleFromClient(clientX, clientY) {
    const rect = labelEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
    _opts.angle = parseFloat(angle.toFixed(1));
    _syncDraggableLabel(viewer);
  }

  function _isRotateHandle(target) {
    return !!target.closest?.('.wm-rotate-handle');
  }

  labelEl.addEventListener('mousedown', (e) => {
    if (_isRotateHandle(e.target)) return;
    dragging = true;
    labelEl.classList.add('dragging');
    e.preventDefault();
  });

  labelEl.addEventListener('mousedown', (e) => {
    if (!_isRotateHandle(e.target)) return;
    rotating = true;
    labelEl.classList.add('rotating');
    _setAngleFromClient(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (rotating) {
      _setAngleFromClient(e.clientX, e.clientY);
      return;
    }
    if (!dragging) return;
    _setPosFromClient(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => {
    if (rotating) {
      rotating = false;
      labelEl.classList.remove('rotating');
    }
    if (dragging) {
      dragging = false;
      labelEl.classList.remove('dragging');
    }
  });

  labelEl.addEventListener('touchstart', (e) => {
    if (_isRotateHandle(e.target)) return;
    dragging = true;
    labelEl.classList.add('dragging');
    e.preventDefault();
  }, { passive: false });

  labelEl.addEventListener('touchstart', (e) => {
    if (!_isRotateHandle(e.target)) return;
    const t = e.touches[0];
    rotating = true;
    labelEl.classList.add('rotating');
    _setAngleFromClient(t.clientX, t.clientY);
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (rotating) {
      const t = e.touches[0];
      _setAngleFromClient(t.clientX, t.clientY);
      return;
    }
    if (!dragging) return;
    const t = e.touches[0];
    _setPosFromClient(t.clientX, t.clientY);
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (rotating) {
      rotating = false;
      labelEl.classList.remove('rotating');
    }
    if (dragging) {
      dragging = false;
      labelEl.classList.remove('dragging');
    }
  });

  const textInput = viewer.querySelector('#wm-text');
  const fontSelect = viewer.querySelector('#wm-font');
  const sizeSlider = viewer.querySelector('#wm-size');
  const sizeVal = viewer.querySelector('#wm-size-val');
  const colorInput = viewer.querySelector('#wm-color');
  const colorPrev = viewer.querySelector('#wm-color-preview');
  const colorHex = viewer.querySelector('#wm-color-hex');
  const opacSlider = viewer.querySelector('#wm-opacity');
  const opacVal = viewer.querySelector('#wm-opacity-val');
  const spaceSlider = viewer.querySelector('#wm-space');
  const spaceVal = viewer.querySelector('#wm-space-val');
  const signSize = viewer.querySelector('#wm-sign-size');
  const signSizeVal = viewer.querySelector('#wm-sign-size-val');

  function _setColor(hex, fromPicker = false) {
    const cleaned = String(hex || '').trim();
    const valid = /^#[0-9A-Fa-f]{6}$/.test(cleaned);
    if (!valid && !fromPicker) return;
    const value = valid ? cleaned.toUpperCase() : cleaned;
    _opts.color = value;
    if (colorInput) colorInput.value = value;
    if (colorPrev) colorPrev.style.background = value;
    if (colorHex && document.activeElement !== colorHex) colorHex.value = value;
    _refreshLabel();
  }

  function _refreshLabel() {
    _syncDraggableLabel(viewer);
  }

  _refreshLabel();

  const hdImg = viewer.querySelector('#wm-hd-img');
  if (hdImg) {
    hdImg.addEventListener('load', () => {
      requestAnimationFrame(() => _syncDraggableLabel(viewer));
    });
  }

  textInput.addEventListener('input', (e) => {
    _opts.mode = 'text';
    _opts.text = e.target.value;
    _refreshLabel();
  });

  viewer.querySelectorAll('.wm-preset-badge').forEach((btn) => {
    btn.addEventListener('click', () => {
      _opts.mode = 'text';
      _opts.text = btn.dataset.text;
      textInput.value = _opts.text;
      _refreshLabel();
    });
  });

  fontSelect.addEventListener('change', (e) => {
    _opts.font_family = e.target.value;
    _refreshLabel();
  });

  sizeSlider.addEventListener('input', (e) => {
    _opts.font_size = parseFloat(e.target.value);
    sizeVal.textContent = `${_opts.font_size}px`;
    _updateSliderFill(sizeSlider, 10, 120);
    _refreshLabel();
  });

  if (colorInput) {
    colorInput.addEventListener('input', (e) => {
      _setColor(e.target.value, true);
      _clearSwatchActive(viewer);
    });
  }

  if (colorHex) {
    colorHex.addEventListener('input', (e) => {
      let v = e.target.value.trim();
      if (v && !v.startsWith('#')) v = `#${v}`;
      e.target.value = v.toUpperCase();
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        _setColor(v);
        _clearSwatchActive(viewer);
      }
    });
    colorHex.addEventListener('change', (e) => {
      let v = e.target.value.trim();
      if (v && !v.startsWith('#')) v = `#${v}`;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        _setColor(v);
        _clearSwatchActive(viewer);
      } else {
        e.target.value = _opts.color;
      }
    });
  }

  viewer.querySelectorAll('.wm-swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      viewer.querySelectorAll('.wm-swatch').forEach((s) => s.classList.remove('active'));
      sw.classList.add('active');
      _setColor(sw.dataset.color);
    });
  });

  if (signSize) {
    signSize.addEventListener('input', (e) => {
      _opts.sign_width_pct = parseFloat(e.target.value);
      if (signSizeVal) signSizeVal.textContent = `${_opts.sign_width_pct}%`;
      _updateSliderFill(signSize, 12, 70);
      _refreshLabel();
    });
  }

  _wireSignatureModal(viewer, _refreshLabel);

  opacSlider.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10);
    _opts.opacity = pct / 100.0;
    opacVal.textContent = `${pct}%`;
    _updateSliderFill(opacSlider, 5, 100);
    _refreshLabel();
  });

  spaceSlider.addEventListener('input', (e) => {
    _opts.spacing = parseFloat(e.target.value);
    spaceVal.textContent = `${_opts.spacing}px`;
    _updateSliderFill(spaceSlider, -2, 24);
    _refreshLabel();
  });

  _updateSliderFill(sizeSlider, 10, 120);
  _updateSliderFill(opacSlider, 5, 100);
  _updateSliderFill(spaceSlider, -2, 24);
  if (signSize) _updateSliderFill(signSize, 12, 70);
}

function _wireSignatureModal(viewer, refreshLabel) {
  const openBtn = viewer.querySelector('#wm-add-sign-btn');
  const modal = viewer.querySelector('#wm-sign-modal');
  const canvas = viewer.querySelector('#wm-sign-canvas');
  if (!openBtn || !modal || !canvas) return;

  const ctx = canvas.getContext('2d');
  const colorInput = viewer.querySelector('#wm-sign-color');
  const strokeInput = viewer.querySelector('#wm-sign-stroke');
  const strokeVal = viewer.querySelector('#wm-sign-stroke-val');
  const nameInput = viewer.querySelector('#wm-sign-name');
  const clearBtn = viewer.querySelector('#wm-sign-clear-btn');
  const typeBtn = viewer.querySelector('#wm-sign-type-btn');
  const insertBtn = viewer.querySelector('#wm-sign-insert-btn');
  const status = viewer.querySelector('#wm-sign-status');
  let drawing = false;
  let hasInk = false;

  function openModal() {
    modal.classList.add('wm-sign-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    _clearSignatureCanvas(ctx, canvas);
  }

  function closeModal() {
    modal.classList.remove('wm-sign-modal--open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function canvasPoint(evt) {
    const source = evt.touches ? evt.touches[0] : evt;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvas.width,
      y: ((source.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function begin(evt) {
    drawing = true;
    hasInk = true;
    const p = canvasPoint(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    evt.preventDefault();
  }

  function move(evt) {
    if (!drawing) return;
    const p = canvasPoint(evt);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = colorInput?.value || '#000000';
    ctx.lineWidth = parseFloat(strokeInput?.value || '3');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    evt.preventDefault();
  }

  function end() {
    drawing = false;
  }

  openBtn.addEventListener('click', openModal);
  modal.querySelectorAll('[data-close-sign]').forEach((el) => el.addEventListener('click', closeModal));
  canvas.addEventListener('mousedown', begin);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', begin, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);

  if (strokeInput) {
    strokeInput.addEventListener('input', () => {
      if (strokeVal) strokeVal.textContent = `${strokeInput.value}px`;
      _updateSliderFill(strokeInput, 1, 9);
    });
    _updateSliderFill(strokeInput, 1, 9);
  }

  clearBtn?.addEventListener('click', () => {
    hasInk = false;
    _clearSignatureCanvas(ctx, canvas);
  });

  typeBtn?.addEventListener('click', () => {
    const name = (nameInput?.value || '').trim();
    if (!name) return;
    _clearSignatureCanvas(ctx, canvas);
    ctx.fillStyle = colorInput?.value || '#000000';
    ctx.font = 'italic 86px "Times New Roman", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 10, canvas.width - 80);
    hasInk = true;
  });

  insertBtn?.addEventListener('click', () => {
    if (!hasInk) {
      pushNotification({ type: 'warning', message: 'Please draw or insert a signature first.' });
      return;
    }
    _opts.mode = 'sign';
    _opts.signature_data_url = canvas.toDataURL('image/png');
    _opts.text = '';
    _opts.angle = 0;
    const textInput = viewer.querySelector('#wm-text');
    if (textInput) textInput.value = '';
    if (status) status.textContent = 'Signature ready - drag it on the page';
    refreshLabel();
    closeModal();
  });
}

function _clearSignatureCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function _updateSliderFill(slider, min, max) {
  const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', `${Math.max(0, Math.min(100, pct))}%`);
}

function _clearSwatchActive(viewer) {
  viewer.querySelectorAll('.wm-swatch').forEach((s) => s.classList.remove('active'));
}

// ─── SHOW / CLOSE VIEWER ──────────────────────────────────────────────────────

function _showViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!viewer) return;

  document.body.classList.add('has-wm-viewer');
  if (cardView) {
    cardView.style.opacity = '0';
    cardView.style.transform = 'translateY(8px)';
  }

  setTimeout(() => {
    if (cardView) cardView.classList.add('wm-hidden');
    viewer.classList.add('wm-viewer--visible');

    requestAnimationFrame(() => {
      _syncDraggableLabel(viewer);
      requestAnimationFrame(() => _syncDraggableLabel(viewer));
    });

    const mainContent = document.getElementById('main-content');
    if (mainContent && viewer) {
      const top = viewer.getBoundingClientRect().top + mainContent.scrollTop - 70;
      mainContent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }, 300);
}

function _closeViewer(container) {
  const target = container || _activeContainer || document.getElementById('explore-section') || document.body;
  const { cardView, viewer } = _getSwapParts(target);
  if (!viewer) return;

  document.body.classList.remove('has-wm-viewer');
  _wmFile = null;
  _wmBaseName = '';
  _wmFileSize = 0;
  _wmPageCount = 1;
  _wmHdUri = '';

  viewer.classList.remove('wm-viewer--visible');
  if (cardView) {
    cardView.classList.remove('wm-hidden');
    requestAnimationFrame(() => {
      cardView.style.opacity = '1';
      cardView.style.transform = 'translateY(0)';
    });
  }

  removeWatermarkPanel();
}

// ─── POPULATE VIEWER DATA ─────────────────────────────────────────────────────

function _populateViewer(viewer) {
  _opts = { ...WM_DEFAULTS };

  const nameEl = viewer.querySelector('.wm-file-name');
  if (nameEl) nameEl.textContent = _wmFile ? _wmFile.name : 'No PDF selected';

  const imgEl = viewer.querySelector('#wm-hd-img');
  if (imgEl && _wmHdUri) imgEl.src = _wmHdUri;

  const filenameInput = viewer.querySelector('#wm-filename-input');
  if (filenameInput && _wmBaseName) {
    filenameInput.value = `${_wmBaseName}_watermarked`;
  }

  const textInput = viewer.querySelector('#wm-text');
  const fontSelect = viewer.querySelector('#wm-font');
  const sizeSlider = viewer.querySelector('#wm-size');
  const sizeVal = viewer.querySelector('#wm-size-val');
  const colorInput = viewer.querySelector('#wm-color');
  const colorPrev = viewer.querySelector('#wm-color-preview');
  const colorHex = viewer.querySelector('#wm-color-hex');
  const opacSlider = viewer.querySelector('#wm-opacity');
  const opacVal = viewer.querySelector('#wm-opacity-val');
  const spaceSlider = viewer.querySelector('#wm-space');
  const spaceVal = viewer.querySelector('#wm-space-val');
  const labelEl = viewer.querySelector('#wm-draggable-label');
  const posBadge = viewer.querySelector('#wm-pos-badge');
  const signSize = viewer.querySelector('#wm-sign-size');
  const signSizeVal = viewer.querySelector('#wm-sign-size-val');
  const signStatus = viewer.querySelector('#wm-sign-status');

  if (textInput) textInput.value = _opts.text;
  if (fontSelect) fontSelect.value = _opts.font_family;
  if (sizeSlider) {
    sizeSlider.value = _opts.font_size;
    _updateSliderFill(sizeSlider, 10, 120);
  }
  if (sizeVal) sizeVal.textContent = `${_opts.font_size}px`;
  if (colorInput) colorInput.value = _opts.color;
  if (colorPrev) colorPrev.style.background = _opts.color;
  if (colorHex) colorHex.value = _opts.color;
  viewer.querySelectorAll('.wm-swatch').forEach((s) => {
    s.classList.toggle('active', s.dataset.color.toLowerCase() === _opts.color.toLowerCase());
  });
  if (opacSlider) {
    opacSlider.value = Math.round(_opts.opacity * 100);
    _updateSliderFill(opacSlider, 5, 100);
  }
  if (opacVal) opacVal.textContent = `${Math.round(_opts.opacity * 100)}%`;
  if (spaceSlider) {
    spaceSlider.value = _opts.spacing;
    _updateSliderFill(spaceSlider, -2, 24);
  }
  if (spaceVal) spaceVal.textContent = `${_opts.spacing}px`;

  if (signSize) {
    signSize.value = _opts.sign_width_pct;
    _updateSliderFill(signSize, 12, 70);
  }
  if (signSizeVal) signSizeVal.textContent = `${_opts.sign_width_pct}%`;
  if (signStatus) signStatus.textContent = 'No signature added';
  if (posBadge) posBadge.textContent = `${Math.round(_opts.x_pct)}% · ${Math.round(_opts.y_pct)}%`;

  if (labelEl) {
    labelEl.style.left = `${_opts.x_pct}%`;
    labelEl.style.top = `${_opts.y_pct}%`;
  }

  _syncDraggableLabel(viewer);
  setTimeout(() => _syncDraggableLabel(viewer), 50);
  setTimeout(() => _syncDraggableLabel(viewer), 350);
}

// ─── OFFLINE PDF LOADER ───────────────────────────────────────────────────────

async function _loadPdfIntoViewer(container, file) {
  const tool = getActiveTool();
  const color = (tool && tool.color) || '#38BDF8';
  const zone = document.getElementById('drop-zone');
  if (zone) {
    removeWatermarkPanel();
    resetZoneContent(zone);
    showProgress(zone, 10, color, 'Reading PDF offline…');
  }

  try {
    const info = await getOfflinePdfInfo(file, 0.5);
    const pdfDoc = info.pdfDoc;
    const page1 = await pdfDoc.getPage(1);
    const vp = page1.getViewport({ scale: 1.0 });

    const scale = Math.min(2.0, 1200 / Math.max(vp.width, 1));
    const hdDataUri = await renderPdfPageToDataUri(page1, scale);

    _wmFile = file;
    _wmBaseName = (file.name || 'document').replace(/\.[^.]+$/, '');
    _wmFileSize = file.size || 0;
    _wmPageCount = info.pageCount || 1;
    _wmHdUri = hdDataUri;
    _pageWidth = Math.round(vp.width) || 595;
    _pageHeight = Math.round(vp.height) || 842;
    _activeContainer = container || document.getElementById('explore-section') || document.body;

    if (zone) {
      updateProgress(zone, 100, color, tool.id);
      resetZoneContent(zone);
      _showWatermarkThumbnail(zone, file, color, info.thumbnail);
    }

    const { viewer } = _getSwapParts(_activeContainer);
    if (viewer) {
      _showViewer(_activeContainer);
      _populateViewer(viewer);
    }

  } catch (err) {
    if (zone) showError(zone, `Could not read PDF: ${err.message}`);
    pushNotification({
      type: 'error',
      message: 'PDF Load Failed',
      detail: err.message || 'Could not load PDF offline.',
    });
  }
}

export function handleWatermarkFilePicked(file) {
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

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

function _collectOptsFromViewer(viewer) {
  const textInput = viewer?.querySelector('#wm-text');
  const fontSelect = viewer?.querySelector('#wm-font');
  const sizeSlider = viewer?.querySelector('#wm-size');
  const colorInput = viewer?.querySelector('#wm-color');
  const colorHex = viewer?.querySelector('#wm-color-hex');
  const opacSlider = viewer?.querySelector('#wm-opacity');
  const spaceSlider = viewer?.querySelector('#wm-space');
  const signSize = viewer?.querySelector('#wm-sign-size');

  let color = (colorInput?.value || colorHex?.value || _opts.color || '#CC0000').trim();
  if (color && !color.startsWith('#')) color = `#${color}`;

  const opacityPct = opacSlider ? parseFloat(opacSlider.value) : Math.round((_opts.opacity ?? 0.73) * 100);

  return {
    mode: _opts.mode === 'sign' && _opts.signature_data_url ? 'sign' : 'text',
    text: (textInput?.value ?? _opts.text ?? '').trim(),
    font_family: fontSelect?.value || _opts.font_family || 'helv',
    font_size: parseFloat(sizeSlider?.value ?? _opts.font_size ?? 48),
    color: /^#[0-9A-Fa-f]{6}$/i.test(color) ? color.toUpperCase() : (_opts.color || '#CC0000'),
    opacity: Math.max(0.05, Math.min(1, opacityPct / 100)),
    angle: Number.isFinite(_opts.angle) ? _opts.angle : -45,
    spacing: parseFloat(spaceSlider?.value ?? _opts.spacing ?? 0),
    x_pct: Number.isFinite(_opts.x_pct) ? _opts.x_pct : 50,
    y_pct: Number.isFinite(_opts.y_pct) ? _opts.y_pct : 50,
    signature_data_url: _opts.signature_data_url || '',
    sign_width_pct: parseFloat(signSize?.value ?? _opts.sign_width_pct ?? 34),
  };
}

function _scrollMainToTool() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;
  mainContent.scrollTop = 0;
}

function _formNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function _submitWatermark(file, opts, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const payload = {
    mode: opts.mode === 'sign' && opts.signature_data_url ? 'sign' : 'text',
    text: (opts.text || '').trim(),
    font_family: opts.font_family || 'helv',
    font_size: _formNum(opts.font_size, 48),
    color: opts.color || '#CC0000',
    opacity: _formNum(opts.opacity, 0.73),
    angle: _formNum(opts.angle, -45),
    spacing: _formNum(opts.spacing, 0),
    x_pct: _formNum(opts.x_pct, 50),
    y_pct: _formNum(opts.y_pct, 50),
    signature_data_url: opts.signature_data_url || '',
    sign_width_pct: _formNum(opts.sign_width_pct, 34),
  };

  if (payload.mode === 'text' && !payload.text) {
    pushNotification({ type: 'warning', message: 'Add watermark text or create a signature first.' });
    return;
  }

  _closeViewer(_activeContainer);

  _scrollMainToTool();
  requestAnimationFrame(() => {
    _scrollMainToTool();
    requestAnimationFrame(_scrollMainToTool);
  });
  setTimeout(_scrollMainToTool, 80);

  const zone = document.getElementById('drop-zone');
  const color = tool.color || '#38BDF8';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('text', payload.text);
  fd.append('mode', payload.mode);
  fd.append('font_family', payload.font_family);
  fd.append('font_size', String(payload.font_size));
  fd.append('color', payload.color);
  fd.append('opacity', String(payload.opacity));
  fd.append('angle', String(payload.angle));
  fd.append('spacing', String(payload.spacing));
  fd.append('x_pct', String(payload.x_pct));
  fd.append('y_pct', String(payload.y_pct));
  fd.append('signature_data_url', payload.signature_data_url);
  fd.append('sign_width_pct', String(payload.sign_width_pct));
  fd.append('output_filename', outputFilename);

  showProgress(zone, 10, color, 'Applying Watermark…');

  const earlyFilename = `${_wmBaseName || 'document'}_watermarked.pdf`;
  setBgJob({ jobId: null, tool, filename: earlyFilename, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res = await fetch(`${BACKEND}/api/pdf/watermark/process`, { method: 'POST', body: fd });
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
    showError(zone, `Upload failed: ${err.message}`);
    clearBgJob();
    return;
  }

  const sse = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct = 0;

  setBgJob({ jobId, tool, filename: earlyFilename, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = Math.max(lastPct, typeof progress === 'number' ? progress : lastPct);
    lastPct = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state = state === 'done' ? 'done' : (state === 'error' ? 'error' : 'running');
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
      removeWatermarkPanel();
      const dlName = data.filename || earlyFilename;
      const onReset = () => {
        removeWatermarkPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../../scripts/dropzone.js')
            .then(({ _updateDropZoneForTool }) => { if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool); })
            .catch(() => { });
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset, tool.id), 200);
      _scrollMainToTool();
      return;
    }

    if (state === 'error') {
      showError(zone, error || 'Watermarking failed. Please try again.');
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend server.');
  };
}
