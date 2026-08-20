/**
 * tools/documents/pdf_tools/splitter/splitter.js
 *
 * Self-contained Splitter tool module.
 * Owns all split-specific state, scan flow, panel UI, and submission logic.
 *
 * Exports:
 *   handleSplitFilePicked(file)  – call when a file is chosen while Split is active
 *   removeSplitPanel()           – call to tear down the panel (tool change / reset)
 *   autoChunkSize(n)             – mirrors backend _auto_chunk_size logic
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

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let _splitFile      = null;
let _splitPageCount = 0;
let _splitBaseName  = '';   // original filename (no extension) for download naming

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Return the default auto-split chunk size based on total page count.
 * Mirrors the same logic in backend/tools/documents/pdf_tools/splitter/engine.py
 * @param {number} totalPages
 * @returns {number}
 */
export function autoChunkSize(totalPages) {
  if (totalPages <= 100) return 10;
  if (totalPages <= 400) return 25;
  return 50;
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── SPLIT PANEL ──────────────────────────────────────────────────────────────

/** Remove the split info panel and thumbnail if they exist. */
export function removeSplitPanel() {
  const existing = document.getElementById('split-info-panel');
  if (existing) existing.remove();
  // Remove thumbnail from drop zone too
  const zone = document.getElementById('drop-zone');
  if (zone) {
    const thumb = zone.querySelector('.dz-pdf-thumb-wrap');
    if (thumb) thumb.remove();
    zone.classList.remove('dz-has-thumb');
  }
  _splitFile      = null;
  _splitPageCount = 0;
  _splitBaseName  = '';
}

/**
 * Build and insert the split info panel below the drop zone inside the hero card.
 * @param {number} totalPages
 * @param {string} color
 */
function _showSplitPanel(totalPages, color) {
  // Only remove the DOM element — state variables were just set by caller
  const existing = document.getElementById('split-info-panel');
  if (existing) existing.remove();

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id = 'split-info-panel';
  panel.className = 'split-info-panel';
  panel.style.setProperty('--split-color', color);

  const defaultChunk = autoChunkSize(totalPages);

  panel.innerHTML = `
    <div class="sip-header">
      <span class="sip-pages-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="1" width="10" height="14" rx="2" stroke="${color}" stroke-width="1.3"/>
          <line x1="5" y1="5"  x2="11" y2="5"  stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="5" y1="8"  x2="11" y2="8"  stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="5" y1="11" x2="9"  y2="11" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="sip-total-label">Total pages: <strong>${totalPages}</strong></span>
      </span>
      <button class="sip-change-btn" id="sip-change-btn" title="Pick a different file">Change file</button>
    </div>
    <div class="sip-range-row">
      <span class="sip-range-label">Page range <span class="sip-optional">(optional)</span></span>
      <div class="sip-inputs">
        <input class="sip-input" id="sip-from" type="number" min="1" max="${totalPages}" placeholder="From" />
        <span class="sip-sep">–</span>
        <input class="sip-input" id="sip-to"   type="number" min="1" max="${totalPages}" placeholder="To" />
      </div>
      <button class="sip-split-btn" id="sip-split-btn">Split PDF</button>
    </div>
    <div class="sip-auto-hint" id="sip-auto-hint">
      Auto-split: <strong>${defaultChunk} pages</strong> per chunk
      (${Math.ceil(totalPages / defaultChunk)} parts) — enter a range above to override
    </div>`;

  heroCard.appendChild(panel);

  // Animate in
  requestAnimationFrame(() => panel.classList.add('split-info-panel--visible'));

  // "Change file" resets to drop zone state
  panel.querySelector('#sip-change-btn').addEventListener('click', () => {
    const tool = getActiveTool();
    removeSplitPanel();
    resetZoneContent(document.getElementById('drop-zone'));
    // Re-apply the tool-selected state to the drop zone
    if (tool) {
      // Import dynamically to avoid circular dep — updateDropZone lives in dropzone.js
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        if (_updateDropZoneForTool) _updateDropZoneForTool(tool);
      }).catch(() => {});
    }
  });

  // Toggle hint visibility when range inputs change
  const fromEl = panel.querySelector('#sip-from');
  const toEl   = panel.querySelector('#sip-to');
  const hint   = panel.querySelector('#sip-auto-hint');
  const _toggleHint = () => {
    if (hint) hint.style.display = (fromEl.value.trim() || toEl.value.trim()) ? 'none' : '';
  };
  fromEl.addEventListener('input', _toggleHint);
  toEl.addEventListener('input', _toggleHint);

  // "Split PDF" button submits
  panel.querySelector('#sip-split-btn').addEventListener('click', () => {
    if (!_splitFile) return;
    const fromVal = fromEl.value.trim();
    const toVal   = toEl.value.trim();

    // Validate range if provided
    if (fromVal || toVal) {
      const s = parseInt(fromVal || '1', 10);
      const e = parseInt(toVal   || String(_splitPageCount), 10);
      if (s < 1 || e > _splitPageCount || s > e) {
        _flashRangeError(panel, `Enter a valid range between 1 and ${_splitPageCount}.`);
        return;
      }
    }

    _submitSplitFile(_splitFile, fromVal, toVal);
  });
}

function _flashRangeError(panel, msg) {
  let errEl = panel.querySelector('.sip-range-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'sip-range-error';
    panel.querySelector('.sip-range-row').appendChild(errEl);
  }
  errEl.textContent = msg;
  clearTimeout(errEl._t);
  errEl._t = setTimeout(() => errEl.remove(), 3000);
}

// ─── PDF THUMBNAIL ────────────────────────────────────────────────────────────

/**
 * Show the PDF thumbnail inside the drop zone.
 * Uses the real first-page JPEG from the backend when available,
 * falls back to a static file icon if the backend couldn't render it.
 * @param {HTMLElement} zone
 * @param {File}        file
 * @param {string}      color
 * @param {string|null} dataUri
 */
function _showPdfThumbnail(zone, file, color, dataUri) {
  const old = zone.querySelector('.dz-pdf-thumb-wrap');
  if (old) old.remove();

  const thumbContent = dataUri
    ? `<img class="dz-pdf-thumb-img" src="${dataUri}" alt="PDF preview" draggable="false" />`
    : `<svg class="dz-pdf-thumb-icon" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
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

  const wrap = document.createElement('div');
  wrap.className = 'dz-pdf-thumb-wrap';
  wrap.innerHTML = `
    <div class="dz-pdf-thumb-card">
      <div class="dz-pdf-thumb-frame" style="border: 2px solid ${color}; box-shadow: 0 4px 18px rgba(0,0,0,0.45);">
        ${thumbContent}
      </div>
      <button class="dz-pdf-thumb-remove" title="Remove file" style="--thumb-color:${color}" aria-label="Remove file">&#x2715;</button>
    </div>
    <span class="dz-pdf-thumb-name">${_escHtml(file.name)}</span>`;

  zone.classList.add('dz-has-thumb');
  zone.appendChild(wrap);

  wrap.querySelector('.dz-pdf-thumb-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeSplitPanel();
  });
}

// ─── SCAN FLOW ────────────────────────────────────────────────────────────────

/**
 * Called when a file is picked while Split tool is active.
 * Scans the PDF for page count then reveals the info panel.
 * @param {File} file
 */
export async function handleSplitFilePicked(file) {
  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#E8924A') : '#E8924A';
  const zone  = document.getElementById('drop-zone');

  removeSplitPanel();
  showScanProgress(zone, color);

  // Fire page-count + thumbnail renders in parallel — same file, two FormData objects
  const fd1 = new FormData();
  fd1.append('file', file);
  const fd2 = new FormData();
  fd2.append('file', file);

  let pageCount, thumbnailDataUri;
  try {
    const [countRes, thumbRes] = await Promise.all([
      fetch(`${BACKEND}/api/pdf/page-count`, { method: 'POST', body: fd1 }),
      fetch(`${BACKEND}/api/pdf/thumbnail`,  { method: 'POST', body: fd2 }),
    ]);
    const countJson = await countRes.json();
    if (!countRes.ok) throw new Error(countJson.detail || `Server error ${countRes.status}`);
    pageCount = countJson.page_count;

    if (thumbRes.ok) {
      const thumbJson = await thumbRes.json();
      thumbnailDataUri = thumbJson.thumbnail || null;
    }
  } catch (err) {
    showError(zone, `Could not read PDF: ${err.message}`);
    return;
  }

  // Reset zone to tool-selected idle state (remove scan bar)
  resetZoneContent(zone);

  // Store file for later submission
  _splitFile      = file;
  _splitPageCount = pageCount;
  _splitBaseName  = file.name.replace(/\.[^.]+$/, '');

  // Show the real first-page thumbnail (or fallback icon if render failed)
  _showPdfThumbnail(zone, file, color, thumbnailDataUri);

  _showSplitPanel(pageCount, color);
}

// ─── SPLIT SUBMIT ─────────────────────────────────────────────────────────────

async function _submitSplitFile(file, fromVal, toVal) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#E8924A';

  // Hide the panel while processing
  const panel = document.getElementById('split-info-panel');
  if (panel) panel.classList.add('split-info-panel--submitting');

  const fd = new FormData();
  fd.append('file', file);
  if (fromVal) fd.append('start_page', parseInt(fromVal, 10));
  if (toVal)   fd.append('end_page',   parseInt(toVal,   10));
  // No manual range → send the auto-detected chunk size so the backend uses it
  if (!fromVal && !toVal) {
    fd.append('chunk_size', autoChunkSize(_splitPageCount));
  }

  // Show progress inside drop zone
  showProgress(zone, 0, color, 'Processing…');

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/split`, { method: 'POST', body: fd });
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
    if (panel) panel.classList.remove('split-info-panel--submitting');
    return;
  }

  // ── Subscribe to SSE progress ──────────────────────────────────────────────
  const sse = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let  lastPct = 0;

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = typeof progress === 'number' ? progress : lastPct;
    lastPct   = pct;

    if (state === 'running' || state === 'pending') {
      const displayPct = Math.max(10, Math.min(90, pct));
      updateProgress(zone, displayPct, color);
      return;
    }

    sse.close();

    if (state === 'done') {
      updateProgress(zone, 100, color);
      // Capture base name before removeSplitPanel clears it
      const baseName = _splitBaseName || 'document';
      // Remove the split panel on success
      removeSplitPanel();
      // Build filename: original PDF base name + "_split_pages.zip"
      const dlName = data.filename
        ? `${baseName}_${data.filename}`
        : `${baseName}_split_pdfs.zip`;
      // onReset: after save, clear split state and re-apply tool appearance
      const onReset = () => {
        removeSplitPanel();
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
      showError(zone, error || 'Processing failed. Please try again.');
      if (panel) panel.classList.remove('split-info-panel--submitting');
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?');
    if (panel) panel.classList.remove('split-info-panel--submitting');
  };
}
