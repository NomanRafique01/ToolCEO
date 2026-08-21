/**
 * tools/documents/pdf_tools/water_mark/water_mark.js
 *
 * Interactive PDF Watermark Editor — ToolCEO
 *
 * Uses the same "swap" pattern as the Rotate Pages tool:
 *   - When a PDF is loaded, #pdf-tools-card-view hides and #wm-viewer swaps in.
 *   - The editor shows an HD first-page preview with a draggable watermark label.
 *   - Controls: text, presets, font, size, color, opacity, angle, spacing.
 *   - Apply → async background job → SSE progress → Download panel.
 *
 * Exports:
 *   handleWatermarkFilePicked(file)  – triggered when file is chosen
 *   removeWatermarkPanel()           – cleanup / reset drop zone thumb
 */

import { pushNotification } from '../../../../scripts/notificationStore.js';
import {
  getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob,
} from '../../../../scripts/toolstate.js';
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

let _wmFile      = null;
let _wmBaseName  = '';
let _wmFileSize  = 0;
let _wmPageCount = 1;
let _wmHdUri     = '';
let _pageWidth   = 595;  // PDF page width in points (for coord mapping)
let _pageHeight  = 842;  // PDF page height in points

let _activeContainer = null;

let _opts = {
  text:        'CONFIDENTIAL',
  font_family: 'helv',
  font_size:   46,
  color:       '#CC0000',
  opacity:     0.45,
  angle:       -45,
  spacing:     0,
  x_pct:       50,
  y_pct:       50,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1048576)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function _pct(v) {
  return `${Math.round(v)}%`;
}

function _fontFamilyCss(val) {
  if (val === 'times') return '"Times New Roman", Times, serif';
  if (val === 'cour')  return '"Courier New", Courier, monospace';
  return 'Arial, Helvetica, sans-serif';
}

// ─── SWAP PARTS (mirrors rotate.js _getSwapParts) ─────────────────────────────

function _getSwapParts(container) {
  const swap     = container.querySelector('#pdf-tools-swap');
  const cardView = container.querySelector('#pdf-tools-card-view');
  let   viewer   = container.querySelector('#wm-viewer');

  if (swap && !viewer) {
    viewer = document.createElement('div');
    viewer.id        = 'wm-viewer';
    viewer.className = 'wm-viewer';
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
          <span class="wm-file-info">0 pages</span>
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
          Apply Watermark
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
          Page 1 — HD Preview &nbsp;·&nbsp; Drag Watermark to Position
        </div>

        <div class="wm-frame-glow">
          <div class="wm-frame-container" id="wm-frame-container">
            <img class="wm-hd-img" id="wm-hd-img" src="" alt="HD PDF Page 1" />
            <div class="wm-draggable-label" id="wm-draggable-label"
                 style="left:50%;top:50%;">CONFIDENTIAL</div>
            <div class="wm-position-badge" id="wm-pos-badge">50% · 50%</div>
          </div>
        </div>

        <div class="wm-drag-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M12 12v.01"/>
          </svg>
          Click &amp; drag the watermark text to set position
        </div>
      </div>

      <!-- RIGHT: CONTROLS PANEL -->
      <div class="wm-controls-col">
        <div class="wm-controls-inner">

          <!-- Watermark Text -->
          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7h16M4 12h10M4 17h6"/></svg>
              Watermark Text
            </div>
            <input type="text" class="wm-text-input" id="wm-text" value="CONFIDENTIAL"
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

          <!-- Font & Size -->
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
                  <span class="wm-label-val" id="wm-size-val">46px</span>
                </label>
                <input type="range" class="wm-slider" id="wm-size"
                       min="10" max="120" value="46" />
              </div>
            </div>
          </div>

          <div class="wm-divider"></div>

          <!-- Color -->
          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/><path d="M2 12h20"/></svg>
              Color
            </div>
            <div class="wm-color-row">
              <div class="wm-color-swatch-wrap" title="Pick custom color">
                <div class="wm-color-preview" id="wm-color-preview" style="background:#CC0000"></div>
                <input type="color" class="wm-color-picker" id="wm-color" value="#CC0000" />
              </div>
              <div class="wm-swatches" id="wm-swatches">
                <span class="wm-swatch" data-color="#CC0000" style="background:#CC0000" title="Red"></span>
                <span class="wm-swatch" data-color="#1D4ED8" style="background:#1D4ED8" title="Blue"></span>
                <span class="wm-swatch" data-color="#15803D" style="background:#15803D" title="Green"></span>
                <span class="wm-swatch" data-color="#000000" style="background:#000000" title="Black"></span>
                <span class="wm-swatch" data-color="#6B7280" style="background:#6B7280" title="Grey"></span>
                <span class="wm-swatch" data-color="#9333EA" style="background:#9333EA" title="Purple"></span>
                <span class="wm-swatch" data-color="#EA580C" style="background:#EA580C" title="Orange"></span>
                <span class="wm-swatch" data-color="#FFFFFF" style="background:#FFFFFF;box-shadow:0 0 0 1.5px #CBD5E1 inset" title="White"></span>
              </div>
            </div>
          </div>

          <div class="wm-divider"></div>

          <!-- Opacity & Spacing -->
          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3 9H3l3-9h6z"/><path d="M12 22v-6M12 22c-3 0-5-1-5-4M12 22c3 0 5-1 5-4"/></svg>
              Opacity &amp; Spacing
            </div>
            <div class="wm-grid-2">
              <div class="wm-control-group">
                <label class="wm-label">Opacity
                  <span class="wm-label-val" id="wm-opacity-val">45%</span>
                </label>
                <input type="range" class="wm-slider" id="wm-opacity"
                       min="5" max="100" value="45" />
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

          <!-- Angle -->
          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 21H3v-4l14-14"/></svg>
              Rotation Angle
            </div>
            <label class="wm-label">
              Angle
              <span class="wm-label-val" id="wm-angle-val">-45°</span>
            </label>
            <input type="range" class="wm-slider" id="wm-angle"
                   min="-180" max="180" value="-45" />
            <div class="wm-angle-presets">
              <button class="wm-angle-btn active" data-angle="-45">-45°</button>
              <button class="wm-angle-btn" data-angle="0">Flat (0°)</button>
              <button class="wm-angle-btn" data-angle="45">45°</button>
              <button class="wm-angle-btn" data-angle="90">90°</button>
              <button class="wm-angle-btn" data-angle="-90">-90°</button>
            </div>
          </div>

          <div class="wm-divider"></div>

          <!-- Live Text Preview Strip -->
          <div class="wm-section">
            <div class="wm-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Live Style Preview
            </div>
            <div class="wm-live-strip">
              <span class="wm-live-text" id="wm-live-preview">CONFIDENTIAL</span>
            </div>
          </div>

        </div><!-- /controls-inner -->
      </div><!-- /controls-col -->

    </div><!-- /editor-body -->
  `;
}

// ─── WIRE VIEWER EVENTS ───────────────────────────────────────────────────────

function _wireViewerEvents(viewer) {
  viewer.querySelector('.wm-back-btn').addEventListener('click', () => {
    _closeViewer(_activeContainer);
  });

  viewer.querySelector('#wm-apply-btn').addEventListener('click', () => {
    if (!_wmFile) return;
    const nameEl  = viewer.querySelector('#wm-filename-input');
    const outName = (nameEl ? nameEl.value.trim() : '') || `${_wmBaseName}_watermarked`;
    _submitWatermark(_wmFile, { ..._opts }, outName);
  });

  // Drag events
  const container = viewer.querySelector('#wm-frame-container');
  const labelEl   = viewer.querySelector('#wm-draggable-label');
  const posBadge  = viewer.querySelector('#wm-pos-badge');

  let dragging = false;

  labelEl.addEventListener('mousedown', (e) => {
    dragging = true;
    labelEl.classList.add('dragging');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging || !container) return;
    const rect = container.getBoundingClientRect();
    let x = Math.max(0, Math.min(rect.width,  e.clientX - rect.left));
    let y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    _opts.x_pct = parseFloat(((x / rect.width)  * 100).toFixed(1));
    _opts.y_pct = parseFloat(((y / rect.height) * 100).toFixed(1));
    labelEl.style.left = `${_opts.x_pct}%`;
    labelEl.style.top  = `${_opts.y_pct}%`;
    if (posBadge) posBadge.textContent = `${Math.round(_opts.x_pct)}% · ${Math.round(_opts.y_pct)}%`;
  });

  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      labelEl.classList.remove('dragging');
    }
  });

  labelEl.addEventListener('touchstart', (e) => {
    dragging = true;
    labelEl.classList.add('dragging');
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    if (!dragging || !container) return;
    const t = e.touches[0];
    const rect = container.getBoundingClientRect();
    let x = Math.max(0, Math.min(rect.width,  t.clientX - rect.left));
    let y = Math.max(0, Math.min(rect.height, t.clientY - rect.top));
    _opts.x_pct = parseFloat(((x / rect.width)  * 100).toFixed(1));
    _opts.y_pct = parseFloat(((y / rect.height) * 100).toFixed(1));
    labelEl.style.left = `${_opts.x_pct}%`;
    labelEl.style.top  = `${_opts.y_pct}%`;
    if (posBadge) posBadge.textContent = `${Math.round(_opts.x_pct)}% · ${Math.round(_opts.y_pct)}%`;
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (dragging) {
      dragging = false;
      labelEl.classList.remove('dragging');
    }
  });

  // ── Control Listeners ──

  const textInput   = viewer.querySelector('#wm-text');
  const fontSelect  = viewer.querySelector('#wm-font');
  const sizeSlider  = viewer.querySelector('#wm-size');
  const sizeVal     = viewer.querySelector('#wm-size-val');
  const colorInput  = viewer.querySelector('#wm-color');
  const colorPrev   = viewer.querySelector('#wm-color-preview');
  const opacSlider  = viewer.querySelector('#wm-opacity');
  const opacVal     = viewer.querySelector('#wm-opacity-val');
  const spaceSlider = viewer.querySelector('#wm-space');
  const spaceVal    = viewer.querySelector('#wm-space-val');
  const angleSlider = viewer.querySelector('#wm-angle');
  const angleVal    = viewer.querySelector('#wm-angle-val');
  const livePreview = viewer.querySelector('#wm-live-preview');

  function _refreshLabel() {
    if (!labelEl) return;

    // Update text
    labelEl.textContent = _opts.text || 'WATERMARK';

    // Font
    labelEl.style.fontFamily = _fontFamilyCss(_opts.font_family);

    // Size — scale proportionally inside the container
    const frame = viewer.querySelector('#wm-frame-container');
    const scaleFactor = frame ? (frame.clientWidth / 600) : 0.7;
    const displaySize = Math.max(8, Math.round(_opts.font_size * scaleFactor));
    labelEl.style.fontSize      = `${displaySize}px`;
    labelEl.style.fontWeight    = '700';

    // Color & opacity
    labelEl.style.color         = _opts.color;
    labelEl.style.opacity       = String(_opts.opacity);
    labelEl.style.letterSpacing = `${_opts.spacing}px`;

    // Position & rotation
    labelEl.style.left      = `${_opts.x_pct}%`;
    labelEl.style.top       = `${_opts.y_pct}%`;
    labelEl.style.transform = `translate(-50%, -50%) rotate(${_opts.angle}deg)`;

    // Live preview strip
    if (livePreview) {
      livePreview.textContent      = _opts.text || 'WATERMARK';
      livePreview.style.fontFamily = _fontFamilyCss(_opts.font_family);
      livePreview.style.fontSize   = `${Math.min(36, Math.max(12, _opts.font_size * 0.55))}px`;
      livePreview.style.fontWeight = '700';
      livePreview.style.color      = _opts.color;
      livePreview.style.opacity    = String(Math.min(1, _opts.opacity * 1.4));
      livePreview.style.letterSpacing = `${_opts.spacing}px`;
      livePreview.style.transform  = `rotate(${_opts.angle * 0.25}deg)`;
    }
  }

  _refreshLabel();

  // Text
  textInput.addEventListener('input', (e) => {
    _opts.text = e.target.value;
    _refreshLabel();
  });

  // Presets
  viewer.querySelectorAll('.wm-preset-badge').forEach((btn) => {
    btn.addEventListener('click', () => {
      _opts.text = btn.dataset.text;
      textInput.value = _opts.text;
      _refreshLabel();
    });
  });

  // Font
  fontSelect.addEventListener('change', (e) => {
    _opts.font_family = e.target.value;
    _refreshLabel();
  });

  // Size
  sizeSlider.addEventListener('input', (e) => {
    _opts.font_size = parseFloat(e.target.value);
    sizeVal.textContent = `${_opts.font_size}px`;
    _updateSliderFill(sizeSlider, 10, 120);
    _refreshLabel();
  });

  // Color picker
  colorInput.addEventListener('input', (e) => {
    _opts.color = e.target.value;
    if (colorPrev) colorPrev.style.background = _opts.color;
    _clearSwatchActive(viewer);
    _refreshLabel();
  });

  // Color swatches
  viewer.querySelectorAll('.wm-swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      _opts.color = sw.dataset.color;
      colorInput.value = _opts.color;
      if (colorPrev) colorPrev.style.background = _opts.color;
      viewer.querySelectorAll('.wm-swatch').forEach((s) => s.classList.remove('active'));
      sw.classList.add('active');
      _refreshLabel();
    });
  });

  // Opacity
  opacSlider.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10);
    _opts.opacity = pct / 100.0;
    opacVal.textContent = `${pct}%`;
    _updateSliderFill(opacSlider, 5, 100);
    _refreshLabel();
  });

  // Spacing
  spaceSlider.addEventListener('input', (e) => {
    _opts.spacing = parseFloat(e.target.value);
    spaceVal.textContent = `${_opts.spacing}px`;
    _updateSliderFill(spaceSlider, -2, 24);
    _refreshLabel();
  });

  // Angle slider
  angleSlider.addEventListener('input', (e) => {
    _opts.angle = parseFloat(e.target.value);
    angleVal.textContent = `${_opts.angle}°`;
    _updateSliderFill(angleSlider, -180, 180);
    _syncAngleBtns(viewer);
    _refreshLabel();
  });

  // Angle preset buttons
  viewer.querySelectorAll('.wm-angle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const angle = parseFloat(btn.dataset.angle);
      _opts.angle = angle;
      angleSlider.value = angle;
      angleVal.textContent = `${angle}°`;
      _updateSliderFill(angleSlider, -180, 180);
      _syncAngleBtns(viewer);
      _refreshLabel();
    });
  });

  // Init all sliders fill
  _updateSliderFill(sizeSlider, 10, 120);
  _updateSliderFill(opacSlider, 5, 100);
  _updateSliderFill(spaceSlider, -2, 24);
  _updateSliderFill(angleSlider, -180, 180);
}

function _updateSliderFill(slider, min, max) {
  const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', `${Math.max(0, Math.min(100, pct))}%`);
}

function _syncAngleBtns(viewer) {
  viewer.querySelectorAll('.wm-angle-btn').forEach((b) => {
    b.classList.toggle('active', parseFloat(b.dataset.angle) === _opts.angle);
  });
}

function _clearSwatchActive(viewer) {
  viewer.querySelectorAll('.wm-swatch').forEach((s) => s.classList.remove('active'));
}

// ─── SHOW / CLOSE VIEWER (mirrors rotate.js) ──────────────────────────────────

function _showViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  document.body.classList.add('has-wm-viewer');
  cardView.style.opacity   = '0';
  cardView.style.transform = 'translateY(8px)';

  setTimeout(() => {
    cardView.classList.add('wm-hidden');
    viewer.classList.add('wm-viewer--visible');

    const mainContent = document.getElementById('main-content');
    if (mainContent && viewer) {
      const top = viewer.getBoundingClientRect().top + mainContent.scrollTop - 70;
      mainContent.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }, 300);
}

function _closeViewer(container) {
  if (!container) return;
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  document.body.classList.remove('has-wm-viewer');
  _wmFile      = null;
  _wmBaseName  = '';
  _wmFileSize  = 0;
  _wmPageCount = 1;
  _wmHdUri     = '';

  viewer.classList.remove('wm-viewer--visible');
  cardView.classList.remove('wm-hidden');

  requestAnimationFrame(() => {
    cardView.style.opacity   = '1';
    cardView.style.transform = 'translateY(0)';
  });

  removeWatermarkPanel();
}

// ─── POPULATE VIEWER DATA ─────────────────────────────────────────────────────

function _populateViewer(viewer) {
  // File meta
  const nameEl = viewer.querySelector('.wm-file-name');
  const infoEl = viewer.querySelector('.wm-file-info');
  if (nameEl) nameEl.textContent = _wmFile ? _wmFile.name : 'No PDF selected';
  if (infoEl) infoEl.textContent = `${_wmPageCount} page${_wmPageCount !== 1 ? 's' : ''} · ${_fmt(_wmFileSize)}`;

  // HD image
  const imgEl = viewer.querySelector('#wm-hd-img');
  if (imgEl && _wmHdUri) imgEl.src = _wmHdUri;

  // Default output filename
  const filenameInput = viewer.querySelector('#wm-filename-input');
  if (filenameInput && _wmBaseName) {
    filenameInput.value = `${_wmBaseName}_watermarked`;
  }

  // Reset watermark label position to center
  const labelEl = viewer.querySelector('#wm-draggable-label');
  if (labelEl) {
    _opts.x_pct = 50;
    _opts.y_pct = 50;
    labelEl.style.left = '50%';
    labelEl.style.top  = '50%';
  }

  // Re-run refresh so label visuals match opts
  const livePreview = viewer.querySelector('#wm-live-preview');
  const textInput   = viewer.querySelector('#wm-text');
  if (textInput) textInput.value = _opts.text;

  // Trigger a full refresh of the label
  setTimeout(() => {
    if (labelEl) {
      const frame = viewer.querySelector('#wm-frame-container');
      const scaleFactor = frame ? (frame.clientWidth / 600) : 0.7;
      const displaySize = Math.max(8, Math.round(_opts.font_size * scaleFactor));
      labelEl.textContent          = _opts.text;
      labelEl.style.fontFamily     = _fontFamilyCss(_opts.font_family);
      labelEl.style.fontSize       = `${displaySize}px`;
      labelEl.style.fontWeight     = '700';
      labelEl.style.color          = _opts.color;
      labelEl.style.opacity        = String(_opts.opacity);
      labelEl.style.letterSpacing  = `${_opts.spacing}px`;
      labelEl.style.left           = '50%';
      labelEl.style.top            = '50%';
      labelEl.style.transform      = `translate(-50%, -50%) rotate(${_opts.angle}deg)`;

      if (livePreview) {
        livePreview.textContent      = _opts.text;
        livePreview.style.color      = _opts.color;
        livePreview.style.fontFamily = _fontFamilyCss(_opts.font_family);
        livePreview.style.fontSize   = `${Math.min(36, Math.max(12, _opts.font_size * 0.55))}px`;
        livePreview.style.transform  = `rotate(${_opts.angle * 0.25}deg)`;
      }
    }
  }, 50);
}

// ─── THUMBNAIL (drop zone mini) ───────────────────────────────────────────────

function _showWatermarkThumb(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-wm-thumb-wrap');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.className = 'dz-wm-thumb-wrap dz-pdf-thumb-wrap dz-rotate-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-pdf-thumb-card">
      <div class="dz-pdf-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.35)">
        ${dataUri ? `<img class="dz-pdf-thumb-img" src="${dataUri}" alt="PDF preview" draggable="false" />` : ''}
      </div>
      <button class="dz-pdf-thumb-remove dz-wm-thumb-remove" title="Remove file"
              style="--thumb-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pdf-thumb-name">${_esc(file.name)}</span>`;

  zone.classList.add('dz-has-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-wm-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    _closeViewer(_activeContainer);
  });
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

export function removeWatermarkPanel() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  zone.querySelectorAll('.dz-wm-thumb-wrap').forEach((el) => el.remove());
  if (!zone.querySelector('.dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip')) {
    zone.classList.remove('dz-has-thumb');
  }
}

// ─── SCAN FLOW (main entry) ───────────────────────────────────────────────────

export async function handleWatermarkFilePicked(file) {
  if (!file || !(file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
    pushNotification({ type: 'warning', message: 'Please select a valid PDF file.' });
    return;
  }

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#38BDF8') : '#38BDF8';
  const zone  = document.getElementById('drop-zone');

  removeWatermarkPanel();
  showScanProgress(zone, color);

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await fetch(`${BACKEND}/api/pdf/watermark/info`, { method: 'POST', body: fd });
    if (res.ok) {
      const json   = await res.json();
      _wmPageCount = json.page_count || 1;
      _wmFileSize  = json.file_size  || file.size;
      _wmHdUri     = json.thumbnail  || '';
      _pageWidth   = json.width      || 595;
      _pageHeight  = json.height     || 842;
    } else {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.detail || `Server error ${res.status}`);
    }
  } catch (err) {
    showError(zone, `Could not read PDF: ${err.message}`);
    return;
  }

  resetZoneContent(zone);

  _wmFile     = file;
  _wmBaseName = file.name.replace(/\.[^.]+$/, '');

  // Show mini thumb in drop zone
  _showWatermarkThumb(zone, file, color, _wmHdUri);

  // Open the full editor in the explore-tools content area (same as rotate)
  const container = document.getElementById('explore-tools-content') || document.body;
  _activeContainer = container;

  const { viewer } = _getSwapParts(container);
  _populateViewer(viewer);
  _showViewer(container);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitWatermark(file, opts, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  // Close the editor view first — shows drop zone progress
  _closeViewer(_activeContainer);

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#38BDF8';

  const fd = new FormData();
  fd.append('file', file);
  fd.append('text',            opts.text        || 'CONFIDENTIAL');
  fd.append('font_family',     opts.font_family || 'helv');
  fd.append('font_size',       String(opts.font_size  || 36));
  fd.append('color',           opts.color       || '#FF0000');
  fd.append('opacity',         String(opts.opacity     || 0.5));
  fd.append('angle',           String(opts.angle       || -45));
  fd.append('spacing',         String(opts.spacing     || 0));
  fd.append('x_pct',           String(opts.x_pct       || 50));
  fd.append('y_pct',           String(opts.y_pct       || 50));
  fd.append('output_filename', outputFilename);

  showProgress(zone, 10, color, 'Applying Watermark…');

  const earlyFilename = `${_wmBaseName || 'document'}_watermarked.pdf`;
  setBgJob({ jobId: null, tool, filename: earlyFilename, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/watermark/process`, { method: 'POST', body: fd });
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

  const sse   = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct = 0;

  setBgJob({ jobId, tool, filename: earlyFilename, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = Math.max(lastPct, typeof progress === 'number' ? progress : lastPct);
    lastPct = pct;

    const bg = getBgJob();
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state    = state === 'done' ? 'done' : (state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (state === 'running' || state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color);
      return;
    }

    sse.close();

    if (state === 'done') {
      updateProgress(zone, 100, color);
      removeWatermarkPanel();
      const dlName = data.filename || earlyFilename;
      const onReset = () => {
        removeWatermarkPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../../scripts/dropzone.js')
            .then(({ _updateDropZoneForTool }) => { if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool); })
            .catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset), 200);
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
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
