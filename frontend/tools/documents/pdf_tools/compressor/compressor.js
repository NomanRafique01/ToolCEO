/**
 * tools/documents/pdf_tools/compressor/compressor.js
 *
 * Self-contained Compressor tool module.
 * Owns all compress-specific state, scan flow, settings panel UI,
 * preset logic, and submission.
 *
 * Exports:
 *   handleCompressFilePicked(file)  – call when a file is chosen while Compress is active
 *   removeCompressPanel()           – tear down the panel (tool change / reset)
 */

import { getActiveTool }             from '../../../../scripts/toolstate.js';
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

let _compressFile     = null;
let _compressBaseName = '';
let _compressFileSize = 0;   // original file size in bytes

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── PRESET DEFINITIONS ────────────────────────────────────────────────────────

const PRESETS = {
  screen:  { label: 'Screen'  },
  ebook:   { label: 'eBook'   },
  printer: { label: 'Printer' },
  custom:  { label: 'Custom'  },
};

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

/** Remove the compress settings panel and thumbnail from the DOM. */
export function removeCompressPanel() {
  const panel = document.getElementById('compress-settings-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-compress-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-compress-thumb');
  }

  _compressFile     = null;
  _compressBaseName = '';
  _compressFileSize = 0;
}

// ─── THUMBNAIL (inside drop zone) ─────────────────────────────────────────────

/**
 * Render the first-page thumbnail inside the drop zone.
 * Same visual contract as splitter: single-file preview card with
 * filename label and remove (×) button.
 */
function _showCompressThumb(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-compress-thumb-wrap');
  if (old) old.remove();

  const thumbContent = dataUri
    ? `<img class="dz-compress-thumb-img" src="${dataUri}"
             alt="PDF preview" draggable="false" />`
    : `<svg class="dz-compress-thumb-icon" viewBox="0 0 90 116"
            xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
        <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
        <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
        <rect x="0" y="42" width="90" height="26" fill="${color}"/>
        <text x="45" y="60" font-family="Arial,sans-serif" font-size="14"
              font-weight="bold" fill="#ffffff"
              text-anchor="middle" dominant-baseline="middle">PDF</text>
        <line x1="12" y1="80" x2="78" y2="80" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="89" x2="78" y2="89" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="98" x2="55" y2="98" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
      </svg>`;

  const wrap = document.createElement('div');
  wrap.className = 'dz-compress-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-compress-thumb-card">
      <div class="dz-compress-thumb-frame" style="border:2px solid ${color};box-shadow:0 4px 18px rgba(0,0,0,0.45)">
        ${thumbContent}
      </div>
      <button class="dz-compress-thumb-remove" title="Remove file"
              style="--cmp-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-compress-thumb-name">${_esc(file.name)}</span>
    <span class="dz-compress-thumb-size">${_fmt(file.size)}</span>`;

  zone.classList.add('dz-has-compress-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-compress-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeCompressPanel();
    resetZoneContent(zone);
    import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
      const t = getActiveTool();
      if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
    }).catch(() => {});
  });
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────

/**
 * Build and append the compression settings panel below the drop zone.
 */
function _showSettingsPanel(pageCount, color) {
  const existing = document.getElementById('compress-settings-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id        = 'compress-settings-panel';
  panel.className = 'cmp-panel';
  panel.style.setProperty('--cmp-color', color);

  panel.innerHTML = `
    <!-- ── PANEL HEADER ──────────────────────────────────────────────── -->
    <div class="cmp-header">
      <span class="cmp-header-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="${color}" stroke-width="1.3"/>
          <path d="M5 8h6M8 5v6" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M5 5l1.5 1.5M11 5l-1.5 1.5M5 11l1.5-1.5M11 11l-1.5-1.5"
                stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="cmp-header-text">
          <strong>${pageCount}</strong> page${pageCount !== 1 ? 's' : ''}
          &nbsp;·&nbsp;
          <strong>${_fmt(_compressFileSize)}</strong>
        </span>
      </span>
      <button class="cmp-change-btn" id="cmp-change-btn" title="Pick a different file">
        Change file
      </button>
    </div>

    <!-- ── PRESET ROW ───────────────────────────────────────────────── -->
    <div class="cmp-section">
      <div class="cmp-section-title">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/>
          <path d="M4 6h4M6 4v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        Compression Preset
      </div>
      <div class="cmp-preset-group" id="cmp-preset-group">
        <button class="cmp-preset-btn" data-preset="screen">Screen</button>
        <button class="cmp-preset-btn" data-preset="ebook">eBook</button>
        <button class="cmp-preset-btn" data-preset="printer">Printer</button>
        <button class="cmp-preset-btn cmp-preset-btn--active" data-preset="custom">Custom</button>
      </div>
    </div>

    <!-- ── SETTINGS GRID ────────────────────────────────────────────── -->
    <div class="cmp-grid">

      <!-- Content Removal -->
      <div class="cmp-group">
        <div class="cmp-group-label">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 3h8M5 1h2M4 3v7a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V3"
                  stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          Content Removal
        </div>
        <label class="cmp-toggle-row">
          <span class="cmp-toggle-label">Remove metadata</span>
          <span class="cmp-toggle-wrap">
            <input type="checkbox" id="cmp-rm-metadata" class="cmp-toggle-input"/>
            <span class="cmp-toggle-knob"></span>
          </span>
        </label>
        <label class="cmp-toggle-row">
          <span class="cmp-toggle-label">Remove annotations &amp; comments</span>
          <span class="cmp-toggle-wrap">
            <input type="checkbox" id="cmp-rm-annots" class="cmp-toggle-input"/>
            <span class="cmp-toggle-knob"></span>
          </span>
        </label>
        <label class="cmp-toggle-row">
          <span class="cmp-toggle-label">Remove bookmarks</span>
          <span class="cmp-toggle-wrap">
            <input type="checkbox" id="cmp-rm-bookmarks" class="cmp-toggle-input"/>
            <span class="cmp-toggle-knob"></span>
          </span>
        </label>
        <label class="cmp-toggle-row">
          <span class="cmp-toggle-label">Remove embedded thumbnails</span>
          <span class="cmp-toggle-wrap">
            <input type="checkbox" id="cmp-rm-thumbs" class="cmp-toggle-input"/>
            <span class="cmp-toggle-knob"></span>
          </span>
        </label>
      </div>

      <!-- Font + Output -->
      <div class="cmp-group">
        <div class="cmp-group-label">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 10L5 2h2l3 8M3.5 7h5" stroke="currentColor" stroke-width="1.2"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Font
        </div>
        <label class="cmp-toggle-row">
          <span class="cmp-toggle-label">Subset fonts</span>
          <span class="cmp-toggle-wrap">
            <input type="checkbox" id="cmp-subset-fonts" class="cmp-toggle-input"/>
            <span class="cmp-toggle-knob"></span>
          </span>
        </label>

        <div class="cmp-group-label cmp-group-label--mt">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 9.5V8a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1.5"
                  stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <path d="M6 1v6M4 5l2 2 2-2" stroke="currentColor" stroke-width="1.2"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Output
        </div>
        <label class="cmp-toggle-row">
          <span class="cmp-toggle-label">Flatten form fields</span>
          <span class="cmp-toggle-wrap">
            <input type="checkbox" id="cmp-flatten" class="cmp-toggle-input"/>
            <span class="cmp-toggle-knob"></span>
          </span>
        </label>
        <div class="cmp-field cmp-field--max-size">
          <label class="cmp-label" for="cmp-max-size">Max file size target</label>
          <div class="cmp-max-size-row">
            <input class="cmp-number-input" id="cmp-max-size" type="number"
                   min="1" step="1" placeholder="e.g. 500"/>
            <span class="cmp-number-unit">KB</span>
          </div>
          <span class="cmp-field-hint">Leave blank for no limit</span>
        </div>
      </div>

    </div><!-- /cmp-grid -->

    <!-- ── ACTIONS ROW ──────────────────────────────────────────────── -->
    <div class="cmp-actions">
      <input class="cmp-filename-input" id="cmp-filename-input"
             type="text" placeholder="Output filename (optional)"
             maxlength="120" spellcheck="false"/>
      <span class="cmp-filename-ext">.pdf</span>
      <button class="cmp-submit-btn" id="cmp-submit-btn">Compress PDF</button>
    </div>`;

  heroCard.appendChild(panel);

  // Animate in
  requestAnimationFrame(() => panel.classList.add('cmp-panel--visible'));

  // ── Wire up controls ──────────────────────────────────────────────────────

  // Preset buttons
  panel.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      _activatePreset(panel, preset);
    });
  });

  // "Change file" button
  panel.querySelector('#cmp-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeCompressPanel();
    const zone = document.getElementById('drop-zone');
    resetZoneContent(zone);
    if (tool) {
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // "Compress PDF" submit
  panel.querySelector('#cmp-submit-btn').addEventListener('click', () => {
    if (!_compressFile) return;
    const opts = _collectOptions(panel);
    const nameInput = panel.querySelector('#cmp-filename-input');
    const outName   = (nameInput ? nameInput.value.trim() : '') || (_compressBaseName + '_compressed');
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTop = 0;
    _submitCompress(_compressFile, opts, outName);
  });

  // Default filename
  const filenameInput = panel.querySelector('#cmp-filename-input');
  if (filenameInput && _compressBaseName) {
    filenameInput.value = `${_compressBaseName}_compressed`;
  }
}

// ─── PRESET LOGIC ─────────────────────────────────────────────────────────────

function _activatePreset(panel, presetName) {
  // Update active preset button only — image controls removed from this panel
  panel.querySelectorAll('[data-preset]').forEach((b) => {
    b.classList.toggle('cmp-preset-btn--active', b.dataset.preset === presetName);
  });
}

// ─── COLLECT OPTIONS ──────────────────────────────────────────────────────────

function _collectOptions(panel) {
  const activePresetBtn = panel.querySelector('[data-preset].cmp-preset-btn--active');
  const preset          = activePresetBtn ? activePresetBtn.dataset.preset : 'custom';

  const maxSizeKb = parseInt(panel.querySelector('#cmp-max-size').value, 10);
  const maxBytes  = isNaN(maxSizeKb) || maxSizeKb <= 0 ? null : maxSizeKb * 1024;

  return {
    preset,
    remove_metadata:    panel.querySelector('#cmp-rm-metadata').checked,
    remove_annotations: panel.querySelector('#cmp-rm-annots').checked,
    remove_bookmarks:   panel.querySelector('#cmp-rm-bookmarks').checked,
    remove_thumbnails:  panel.querySelector('#cmp-rm-thumbs').checked,
    subset_fonts:       panel.querySelector('#cmp-subset-fonts').checked,
    flatten_forms:      panel.querySelector('#cmp-flatten').checked,
    max_file_size:      maxBytes,
  };
}

// ─── SCAN FLOW ────────────────────────────────────────────────────────────────

/**
 * Called when a file is picked while the Compress tool is active.
 * Scans the PDF for page count + thumbnail, then shows the settings panel.
 * @param {File} file
 */
export async function handleCompressFilePicked(file) {
  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#34D399') : '#34D399';
  const zone  = document.getElementById('drop-zone');

  removeCompressPanel();
  showScanProgress(zone, color);

  const fd = new FormData();
  fd.append('file', file);

  let pageCount = 1;
  let thumbnail = null;
  let fileSize  = file.size;

  try {
    const res  = await fetch(`${BACKEND}/api/pdf/compressor/info`, { method: 'POST', body: fd });
    if (res.ok) {
      const json = await res.json();
      pageCount  = json.page_count  || 1;
      thumbnail  = json.thumbnail   || null;
      fileSize   = json.file_size   || file.size;
    } else {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.detail || `Server error ${res.status}`);
    }
  } catch (err) {
    showError(zone, `Could not read PDF: ${err.message}`);
    return;
  }

  resetZoneContent(zone);

  _compressFile     = file;
  _compressBaseName = file.name.replace(/\.[^.]+$/, '');
  _compressFileSize = fileSize;

  _showCompressThumb(zone, file, color, thumbnail);
  _showSettingsPanel(pageCount, color);
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitCompress(file, opts, outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#34D399';

  // Grey out panel while processing
  const panel = document.getElementById('compress-settings-panel');
  if (panel) panel.classList.add('cmp-panel--submitting');

  // Build FormData — all options as form fields
  const fd = new FormData();
  fd.append('file', file);
  fd.append('remove_metadata',    String(opts.remove_metadata));
  fd.append('remove_annotations', String(opts.remove_annotations));
  fd.append('remove_bookmarks',   String(opts.remove_bookmarks));
  fd.append('remove_thumbnails',  String(opts.remove_thumbnails));
  fd.append('subset_fonts',       String(opts.subset_fonts));
  fd.append('preset',             opts.preset);
  fd.append('flatten_forms',      String(opts.flatten_forms));
  if (opts.max_file_size != null) fd.append('max_file_size', String(opts.max_file_size));
  fd.append('output_filename', outputFilename);

  showProgress(zone, 0, color, 'Compressing…');

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/compressor/compress`, { method: 'POST', body: fd });
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
    if (panel) panel.classList.remove('cmp-panel--submitting');
    return;
  }

  // ── SSE progress ───────────────────────────────────────────────────────────
  const sse   = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct = 0;

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = typeof progress === 'number' ? progress : lastPct;
    lastPct   = pct;

    if (state === 'running' || state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color);
      return;
    }

    sse.close();

    if (state === 'done') {
      updateProgress(zone, 100, color);
      const baseName = _compressBaseName || 'document';
      removeCompressPanel();
      const dlName = data.filename || `${baseName}_compressed.pdf`;
      const onReset = () => {
        removeCompressPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset), 200);
      return;
    }

    if (state === 'error') {
      showError(zone, error || 'Compression failed. Please try again.');
      if (panel) panel.classList.remove('cmp-panel--submitting');
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?');
    if (panel) panel.classList.remove('cmp-panel--submitting');
  };
}
