/**
 * tools/shared/progress.js
 *
 * Shared drop-zone overlay helpers used by all tools.
 * Provides: progress ring, scan ring, download card, error display.
 *
 * These were previously private functions inside dropzone.js.
 * Extracting them here lets each tool module import and reuse them
 * without duplicating code.
 *
 * Exports (all named):
 *   buildRingWrap(color, pct, label, indeterminate)
 *   showProgress(zone, pct, color, label)
 *   showScanProgress(zone, color)
 *   updateProgress(zone, pct, color)
 *   resetZoneContent(zone)
 *   resetAfterSave(zone)
 *   showDownload(zone, filename, jobId, color)
 *   showError(zone, message)
 *   escHtml(str)
 */

import { clearBgJob, getActiveTool, getBgJob } from '../../scripts/toolstate.js';
import { buildConversionMeta } from '../../scripts/historyTracker.js';

const BACKEND = 'http://127.0.0.1:8000';

// ── Ring geometry constants ──────────────────────────────────────────────────

const _RING_R    = 40;
const _RING_CIRC = 2 * Math.PI * _RING_R;   // ≈ 251.3

// ─── UTILITY ─────────────────────────────────────────────────────────────────

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── ZONE RESET ───────────────────────────────────────────────────────────────

/** Remove any progress / download / error overlay from inside the zone. */
export function resetZoneContent(zone) {
  if (!zone) return;
  zone.querySelectorAll(
    '.dz-progress-wrap, .dz-download-wrap, .dz-error-wrap, .dz-pdf-thumb-wrap, .dz-compress-thumb-wrap, .dz-encrypt-thumb-wrap, .dz-merge-thumb-strip, .dz-queue-toolbar, .dz-pdf-word-thumb-wrap, .dz-pdf-excel-thumb-wrap, .dz-pdf-html-thumb-wrap, .dz-pdf-txt-thumb-wrap, .dz-ebook-thumb-wrap, .dz-docx-thumb-wrap, .dz-pptx-thumb-wrap, .dz-xlsx-thumb-wrap, .dz-txt-thumb-wrap, .dz-odt-thumb-wrap, .dz-csv-thumb-wrap, .dz-img-preview-wrap, .dz-jpg-thumb-strip, .dz-png-thumb-strip, .dz-webp-thumb-strip, .dz-svg-thumb-strip'
  ).forEach((el) => el.remove());
  zone.classList.remove(
    'dz-state-processing', 'dz-state-done', 'dz-state-error',
    'dz-state-scanning',   'dz-has-thumb',  'dz-has-compress-thumb',
    'dz-has-encrypt-thumb', 'dz-has-merge-thumbs', 'dz-has-pdf-word-thumb',
    'dz-has-pdf-excel-thumb', 'dz-has-pdf-html-thumb', 'dz-has-pdf-txt-thumb',
    'dz-has-ebook-thumb', 'dz-has-docx-thumb', 'dz-has-pptx-thumb', 'dz-has-xlsx-thumb',
    'dz-has-txt-thumb', 'dz-has-odt-thumb', 'dz-has-csv-thumb', 'dz-has-img-preview',
    'dz-has-jpg-thumbs', 'dz-has-png-thumbs', 'dz-has-webp-thumbs', 'dz-has-svg-thumbs'
  );
}

// ─── PROGRESS RING ────────────────────────────────────────────────────────────

/** Build the circular ring SVG + centre text, returns wrap element. */
export function buildRingWrap(color, pct, label, indeterminate, toolId) {
  const offset  = indeterminate ? 0 : _RING_CIRC * (1 - pct / 100);
  const dashArr = indeterminate
    ? `${_RING_CIRC * 0.35} ${_RING_CIRC * 0.65}`
    : `${_RING_CIRC} ${_RING_CIRC}`;

  const wrap = document.createElement('div');
  wrap.className = 'dz-progress-wrap';
  const owner = toolId || getActiveTool()?.id;
  if (owner) wrap.dataset.toolId = owner;
  wrap.style.setProperty('--dz-ring-color', color);

  wrap.innerHTML = `
    <button class="dz-progress-cancel" type="button" title="Cancel" aria-label="Cancel conversion">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <svg class="dz-ring-svg" width="110" height="110" viewBox="0 0 110 110"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle class="dz-ring-glow" cx="55" cy="55" r="28"/>
      <circle class="dz-ring-track" cx="55" cy="55" r="${_RING_R}"/>
      <circle class="dz-ring-fill${indeterminate ? ' dz-ring-fill--indeterminate' : ''}"
              cx="55" cy="55" r="${_RING_R}"
              stroke="${color}"
              stroke-dasharray="${dashArr}"
              stroke-dashoffset="${offset}"
              style="transform-origin:55px 55px"/>
    </svg>
    <div class="dz-ring-center">
      <span class="dz-pct">${indeterminate ? '' : `${pct}%`}</span>
      <span class="dz-progress-label">${label || 'Processing'}</span>
    </div>`;

  return wrap;
}

/** Show the circular ring progress — centred inside the drop zone. */
export function showProgress(zone, pct, color, label, toolId) {
  resetZoneContent(zone);
  zone.classList.add('dz-state-processing');
  const owner = toolId || getActiveTool()?.id;
  const wrap = buildRingWrap(color, pct, label || 'Processing', false, owner);
  zone.appendChild(wrap);
  _wireCancelBtn(wrap, zone);
}

/** Show an indeterminate scanning ring — spinning arc. */
export function showScanProgress(zone, color, label = 'Scanning', toolId) {
  resetZoneContent(zone);
  zone.classList.add('dz-state-scanning');
  const owner = toolId || getActiveTool()?.id;
  const wrap = buildRingWrap(color, 0, label, true, owner);
  zone.appendChild(wrap);
  _wireCancelBtn(wrap, zone);
}

/** Wire the cancel button inside a progress-wrap to abort the active job. */
function _wireCancelBtn(wrap, zone) {
  const btn = wrap.querySelector('.dz-progress-cancel');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearBgJob();            // closes SSE + hides bg-job bar
    resetZoneContent(zone);  // remove ring overlay
    // Let individual tool modules react (e.g. re-show idle state)
    document.dispatchEvent(new CustomEvent('progress-cancelled'));
  });
}

/**
 * Update just the ring fill + percentage text without rebuilding the overlay.
 * @param {HTMLElement} zone
 * @param {number}      pct
 * @param {string}      color
 * @param {string}      [toolId]  When provided, silently skips the update if the
 *                                user has navigated away from that tool. This prevents
 *                                a background job from overwriting a different tool's
 *                                progress ring with its own colour/percentage.
 */
export function updateProgress(zone, pct, color, toolId) {
  if (!zone) return;
  const activeTool = getActiveTool();

  // If the caller tells us which tool owns this update, bail out when the user
  // has switched to a different tool.
  if (toolId && activeTool && activeTool.id !== toolId) return;

  const wrap = zone.querySelector('.dz-progress-wrap');
  if (!wrap) return;

  // If the progress wrap in the drop zone belongs to a different tool, bail out!
  const wrapToolId = wrap.dataset.toolId;
  if (wrapToolId) {
    if (toolId && wrapToolId !== toolId) return;
    if (activeTool && wrapToolId !== activeTool.id) return;
  }

  const ring  = zone.querySelector('.dz-ring-fill');
  const label = zone.querySelector('.dz-pct');
  if (ring) {
    const offset = _RING_CIRC * (1 - pct / 100);
    ring.setAttribute('stroke-dashoffset', offset);
    ring.setAttribute('stroke', color);
  }
  if (label) label.textContent = `${pct}%`;
  wrap.style.setProperty('--dz-ring-color', color);
}


// ─── AFTER-SAVE RESET ─────────────────────────────────────────────────────────

/**
 * After a successful save, wait briefly then reset the drop zone.
 * Accepts an optional `onReset` callback that is invoked after the zone
 * content is cleared — use it to clear tool-specific state (e.g. split panel)
 * and re-apply the tool-selected appearance.
 * @param {HTMLElement} zone
 * @param {Function}    [onReset]
 */
export function resetAfterSave(zone, onReset) {
  setTimeout(() => {
    resetZoneContent(zone);
    clearBgJob();
    if (typeof onReset === 'function') onReset();
  }, 1800);
}

// ─── DOWNLOAD ────────────────────────────────────────────────────────────────

/**
 * Show download-ready state — card is centred inside the drop zone.
 * @param {HTMLElement} zone
 * @param {string}      filename
 * @param {string}      jobId
 * @param {string}      color
 * @param {Function}    [onReset]  optional callback invoked after zone reset post-save
 * @param {string}      [toolId]   ID of the tool that owns this job. When provided,
 *                                 the download card is suppressed if the user has
 *                                 navigated to a different tool.
 */
export function showDownload(zone, filename, jobId, color, onReset, toolId) {
  // Use caller-supplied toolId first (most reliable), fall back to bgJob lookup.
  const ownerToolId = toolId || getBgJob(jobId)?.tool?.id;
  if (ownerToolId) {
    const activeTool = getActiveTool();
    // Only suppress when activeTool is set and points to a different tool.
    if (activeTool && activeTool.id !== ownerToolId) return;
  }

  resetZoneContent(zone);
  zone.classList.add('dz-state-done');

  const ext     = filename.includes('.') ? filename.split('.').pop().toUpperCase() : '';
  const extText = ext ? `${ext} file — ready to save` : 'File ready to save';

  const wrap = document.createElement('div');
  wrap.className = 'dz-download-wrap';
  wrap.innerHTML = `
    <div class="dz-save-card" style="--save-color:${color}">
      <button class="dz-save-close" type="button" title="Close download window" aria-label="Close download window">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="dz-save-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="dz-save-info">
        <span class="dz-save-name" title="${escHtml(filename)}">${escHtml(filename)}</span>
        <span class="dz-save-ext">${escHtml(extText)}</span>
      </div>
      <button class="dz-save-btn" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>Save As…
      </button>
      <div class="dz-save-done">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
          <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.9"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Saved successfully
      </div>
    </div>`;

  zone.appendChild(wrap);

  const closeBtn = wrap.querySelector('.dz-save-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetZoneContent(zone);
      clearBgJob(jobId, true);
      if (typeof onReset === 'function') onReset();
    });
  }

  const _SAVE_BTN_INNER = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
       style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
    <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </svg>Save As…`;

  const btn = wrap.querySelector('.dz-save-btn');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    btn.textContent = 'Saving…';

    // Remove any previous inline error so the card looks clean on retry.
    const prevErr = wrap.querySelector('.dz-save-inline-err');
    if (prevErr) prevErr.remove();

    try {
      const res = await fetch(`${BACKEND}/api/download/${jobId}`);
      if (!res.ok) {
        // Read the server's error detail before throwing so we can show it.
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          detail = body.detail || body.error || detail;
        } catch (_) { /* body wasn't JSON — use the status code */ }
        throw new Error(detail);
      }

      const blob      = await res.blob();
      const arrayBuf  = await blob.arrayBuffer();
      const uint8     = new Uint8Array(arrayBuf);
      const chunkSize = 8192;
      let binary = '';
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      if (window.toolceo && window.toolceo.saveFileAs) {
        const meta = buildConversionMeta({ outputFilename: filename });
        const savedPath = await window.toolceo.saveFileAs(filename, base64, meta);
        if (savedPath) {
          btn.style.display = 'none';
          wrap.querySelector('.dz-save-done').classList.add('dz-save-done--visible');
          clearBgJob(jobId, true);
          resetAfterSave(zone, onReset);
        } else {
          btn.disabled = false;
          btn.innerHTML = _SAVE_BTN_INNER;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        btn.style.display = 'none';
        wrap.querySelector('.dz-save-done').classList.add('dz-save-done--visible');
        clearBgJob(jobId, true);
        resetAfterSave(zone, onReset);
      }
    } catch (err) {
      // Restore the button so the user can retry without losing the card.
      btn.disabled = false;
      btn.innerHTML = _SAVE_BTN_INNER;

      // Show the error inline inside the card — don't nuke the whole card.
      const errEl = document.createElement('div');
      errEl.className = 'dz-save-inline-err';
      errEl.textContent = `Save failed: ${err.message}`;
      wrap.querySelector('.dz-save-card').appendChild(errEl);
    }
  });
}

// ─── ERROR ────────────────────────────────────────────────────────────────────

/** Show error state. */
export function showError(zone, message, toolId) {
  if (!zone) return;
  const activeTool = getActiveTool();
  if (toolId && activeTool && activeTool.id !== toolId) return;

  const currentWrap = zone.querySelector('.dz-progress-wrap');
  if (currentWrap && currentWrap.dataset.toolId) {
    if (toolId && currentWrap.dataset.toolId !== toolId) return;
    if (activeTool && currentWrap.dataset.toolId !== activeTool.id) return;
  }

  resetZoneContent(zone);
  zone.classList.add('dz-state-error');

  const wrap = document.createElement('div');
  wrap.className = 'dz-error-wrap';
  wrap.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" stroke="#F87171" stroke-width="1.5"/>
      <line x1="10" y1="6" x2="10" y2="11" stroke="#F87171" stroke-width="1.7" stroke-linecap="round"/>
      <circle cx="10" cy="13.5" r="0.9" fill="#F87171"/>
    </svg>
    <span class="dz-error-msg">${escHtml(message)}</span>`;
  zone.appendChild(wrap);
}

// ─── DOWNLOAD BLOB DIRECT ──────────────────────────────────────────────────────

/**
 * Show download-ready state for direct in-memory blobs (e.g. from /api/pdf/encrypt).
 * @param {HTMLElement} zone
 * @param {Blob}        blob
 * @param {string}      filename
 * @param {string}      color
 * @param {Function}    [onReset]
 * @param {string}      [toolId]   ID of the tool that owns this job. When provided,
 *                                 the download card is suppressed if the user has
 *                                 navigated to a different tool.
 */
export function showDownloadBlobCard(zone, blob, filename, color, onReset, toolId) {
  // Suppress the download card when the user is on a different tool's page.
  if (toolId) {
    const activeTool = getActiveTool();
    if (activeTool && activeTool.id !== toolId) return;
  }

  resetZoneContent(zone);
  zone.classList.add('dz-state-done');

  const ext     = filename.includes('.') ? filename.split('.').pop().toUpperCase() : '';
  const extText = ext ? `${ext} file — ready to save` : 'File ready to save';

  const wrap = document.createElement('div');
  wrap.className = 'dz-download-wrap';
  wrap.innerHTML = `
    <div class="dz-save-card" style="--save-color:${color}">
      <button class="dz-save-close" type="button" title="Close download window" aria-label="Close download window">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="dz-save-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="dz-save-info">
        <span class="dz-save-name" title="${escHtml(filename)}">${escHtml(filename)}</span>
        <span class="dz-save-ext">${escHtml(extText)}</span>
      </div>
      <button class="dz-save-btn" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>Save As…
      </button>
      <div class="dz-save-done">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
          <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.9"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Saved successfully
      </div>
    </div>`;

  zone.appendChild(wrap);

  const closeBtn = wrap.querySelector('.dz-save-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetZoneContent(zone);
      clearBgJob();
      if (typeof onReset === 'function') onReset();
    });
  }

  const btn = wrap.querySelector('.dz-save-btn');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const arrayBuf  = await blob.arrayBuffer();
      const uint8     = new Uint8Array(arrayBuf);
      const chunkSize = 8192;
      let binary = '';
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      if (window.toolceo && window.toolceo.saveFileAs) {
        const meta = buildConversionMeta({ outputFilename: filename });
        const savedPath = await window.toolceo.saveFileAs(filename, base64, meta);
        if (savedPath) {
          btn.style.display = 'none';
          wrap.querySelector('.dz-save-done').classList.add('dz-save-done--visible');
          clearBgJob();
          resetAfterSave(zone, onReset);
        } else {
          btn.disabled = false;
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
            <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
                  stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          </svg>Save As…`;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        btn.style.display = 'none';
        wrap.querySelector('.dz-save-done').classList.add('dz-save-done--visible');
        clearBgJob();
        resetAfterSave(zone, onReset);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Save As…';
      showError(zone, `Save failed: ${err.message}`);
    }
  });
}
