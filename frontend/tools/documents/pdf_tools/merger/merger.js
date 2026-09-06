/**
 * tools/documents/pdf_tools/merger/merger.js
 *
 * Self-contained Merger tool module.
 * Owns all merge-specific state, file queue, thumbnail rendering,
 * drag-to-reorder, and submission logic.
 *
 * Exports:
 *   handleMergeFilesPicked(files)  – call when files are chosen while Merge is active
 *   removeMergePanel()             – tear down the panel (tool change / reset)
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
import { getOfflinePdfInfo } from '../../../shared/pdfRenderer.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

/** @type {{ file: File, pageCount: number, thumbnail: string|null }[]} */
let _queue = [];   // ordered list of files in the merge sequence

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── PUBLIC: TEARDOWN ─────────────────────────────────────────────────────────

/** Remove the merge queue panel (and all thumbnail slots) from the DOM. */
export function removeMergePanel() {
  const panel = document.getElementById('merge-queue-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    const toolbar = zone.querySelector('.dz-queue-toolbar');
    if (toolbar) toolbar.remove();
    const strip = zone.querySelector('.dz-merge-thumb-strip');
    if (strip) strip.remove();
    zone.classList.remove('dz-has-merge-thumbs');
  }

  _queue = [];
}

// ─── THUMBNAIL STRIP (inside drop zone) ───────────────────────────────────────

/**
 * Rebuild the thumbnail strip inside the drop zone from `_queue`.
 * Cards are left→right in queue order. Each card has:
 *   - ordinal badge (1, 2, 3 …)
 *   - thumbnail image (or fallback PDF icon)
 *   - filename label
 *   - remove (×) button
 * Cards are draggable for reordering.
 */
function _renderThumbStrip() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#FF6B6B') : '#FF6B6B';

  if (_queue.length === 0) {
    const oldToolbar = zone.querySelector('.dz-queue-toolbar');
    if (oldToolbar) oldToolbar.remove();
    const oldStrip = zone.querySelector('.dz-merge-thumb-strip');
    if (oldStrip) oldStrip.remove();
    zone.classList.remove('dz-has-merge-thumbs');
    return;
  }

  zone.classList.add('dz-has-merge-thumbs');

  const totalPages = _queue.reduce((s, it) => s + (it.pageCount || 1), 0);

  // Queue Toolbar at the top of the drop zone - update in-place if exists
  let toolbar = zone.querySelector('.dz-queue-toolbar');
  if (toolbar) {
    const countPill = toolbar.querySelector('.dz-queue-count-pill');
    if (countPill) {
      countPill.textContent = `${_queue.length} ${_queue.length === 1 ? 'PDF' : 'PDFs'}`;
      countPill.style.background = color;
    }
    const infoText = toolbar.querySelector('.dz-queue-info-text');
    if (infoText) {
      infoText.textContent = `${totalPages} pages total · Drag PDF to reorder`;
    }
  } else {
    toolbar = document.createElement('div');
    toolbar.className = 'dz-queue-toolbar';
    toolbar.innerHTML = `
      <div class="dz-queue-toolbar-left">
        <span class="dz-queue-count-pill" style="background:${color}; color:#0A1F1C">
          ${_queue.length} ${_queue.length === 1 ? 'PDF' : 'PDFs'}
        </span>
        <span class="dz-queue-info-text">
          ${totalPages} pages total · Drag PDF to reorder
        </span>
      </div>
      <div class="dz-queue-toolbar-actions">
        <button type="button" class="dz-queue-add-btn" id="dz-merge-toolbar-add" title="Add more PDFs" style="color:${color}; border-color:color-mix(in srgb, ${color} 35%, transparent); background:color-mix(in srgb, ${color} 12%, transparent)">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          Add PDF
        </button>
        <button type="button" class="dz-queue-clear-btn" id="dz-merge-toolbar-clear" title="Clear all PDFs">
          Clear All
        </button>
      </div>
    `;

    toolbar.querySelector('#dz-merge-toolbar-add').addEventListener('click', (e) => {
      e.stopPropagation();
      const inp = document.getElementById('file-input');
      if (inp) { inp.multiple = true; inp.accept = '.pdf,application/pdf'; inp.click(); }
    });

    toolbar.querySelector('#dz-merge-toolbar-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      removeMergePanel();
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
  }

  // Scrollable Strip Container: update in-place without removing from zone
  let strip = zone.querySelector('.dz-merge-thumb-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'dz-merge-thumb-strip';
    zone.appendChild(strip);
  }

  strip.innerHTML = '';
  _queue.forEach((item, idx) => {
    const card = _buildThumbCard(item, idx, color);
    strip.appendChild(card);
  });

  // "Add more" card at the end of the strip
  const addBtn = document.createElement('button');
  addBtn.className = 'dz-merge-add-btn';
  addBtn.title = 'Add more PDFs';
  addBtn.style.setProperty('--merge-color', color);
  addBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span>Add PDF</span>`;
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const inp = document.getElementById('file-input');
    if (inp) { inp.multiple = true; inp.accept = '.pdf,application/pdf'; inp.click(); }
  });
  strip.appendChild(addBtn);

  // Wire drag-and-drop reorder on the new strip
  _initDragReorder(strip, color);
}

// ─── SINGLE CARD BUILDER ──────────────────────────────────────────────────────

function _buildThumbCard(item, idx, color) {
  const card = document.createElement('div');
  card.className = 'dz-merge-card';
  card.dataset.idx = String(idx);
  card.draggable = true;
  card.style.setProperty('--merge-color', color);

  const thumbContent = item.thumbnail
    ? `<img class="dz-merge-thumb-img" src="${item.thumbnail}"
            alt="Page 1 of ${_escHtml(item.file.name)}" draggable="false"/>`
    : `<svg class="dz-merge-thumb-fallback" viewBox="0 0 90 116" xmlns="http://www.w3.org/2000/svg">
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

  const shortName = item.file.name.length > 18
    ? item.file.name.slice(0, 15) + '…'
    : item.file.name;

  card.innerHTML = `
    <span class="dz-merge-ordinal" aria-label="Position ${idx + 1}">${idx + 1}</span>
    <div class="dz-merge-thumb-frame" style="border-color:${color}">
      ${thumbContent}
    </div>
    <div class="dz-merge-drag-hint" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="3" cy="3" r="1" fill="currentColor"/>
        <circle cx="7" cy="3" r="1" fill="currentColor"/>
        <circle cx="3" cy="7" r="1" fill="currentColor"/>
        <circle cx="7" cy="7" r="1" fill="currentColor"/>
      </svg>
    </div>
    <span class="dz-merge-card-name" title="${_escHtml(item.file.name)}">${_escHtml(shortName)}</span>
    <span class="dz-merge-page-count">${item.pageCount} pg</span>
    <button class="dz-merge-card-remove" title="Remove this file"
            aria-label="Remove ${_escHtml(item.file.name)}">&#x2715;</button>`;

  // Remove button
  card.querySelector('.dz-merge-card-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    _queue.splice(idx, 1);
    _renderThumbStrip();
    _renderMergePanel();
  });

  return card;
}

// ─── DRAG-TO-REORDER ──────────────────────────────────────────────────────────

function _initDragReorder(strip, color) {
  let _dragSrcIdx      = -1;
  let _scrollRaf       = null;
  let _lockedScrollTop = null;
  let _isCardDragging  = false;
  let _pinRaf          = null;

  function _onWheelDuringDrag(e) {
    if (_isCardDragging) {
      e.preventDefault();
    }
  }

  // Lock / unlock the outer scrollable container (#main-content).
  // We pin scrollTop in place without touching overflowY, so the scrollbar
  // never disappears, the drop-zone width never shifts, and the window
  // never scrolls/jumps to the top while reordering.
  function _lockMainScroll() {
    const mc = document.getElementById('main-content');
    if (!mc) return;
    _lockedScrollTop = mc.scrollTop;
    _isCardDragging  = true;

    // Attach synchronous scroll-clamping listener if not already bound
    if (!mc._dzScrollLockBound) {
      mc._dzScrollLockBound = true;
      mc.addEventListener('scroll', () => {
        if (_isCardDragging && _lockedScrollTop !== null) {
          if (mc.scrollTop !== _lockedScrollTop) {
            mc.scrollTop = _lockedScrollTop;
          }
        }
      }, { passive: false });
    }

    // Continuously clamp scrollTop via requestAnimationFrame during drag
    function _pinFrame() {
      if (!_isCardDragging) return;
      if (mc.scrollTop !== _lockedScrollTop) {
        mc.scrollTop = _lockedScrollTop;
      }
      _pinRaf = requestAnimationFrame(_pinFrame);
    }
    _pinRaf = requestAnimationFrame(_pinFrame);

    window.addEventListener('wheel', _onWheelDuringDrag, { passive: false });
  }

  function _unlockMainScroll() {
    _isCardDragging = false;
    if (_pinRaf !== null) {
      cancelAnimationFrame(_pinRaf);
      _pinRaf = null;
    }
    window.removeEventListener('wheel', _onWheelDuringDrag);
    const mc = document.getElementById('main-content');
    if (mc && _lockedScrollTop !== null) {
      mc.scrollTop = _lockedScrollTop;
    }
    _lockedScrollTop = null;
  }

  // Flag / unflag the drop zone during card drag so dropzone.js skips
  // adding/removing 'drag-active' class (which causes unnecessary reflow).
  function _lockDropZone() {
    const zone = document.getElementById('drop-zone');
    if (zone) zone.dataset.cardDragging = '1';
  }
  function _unlockDropZone() {
    const zone = document.getElementById('drop-zone');
    if (zone) delete zone.dataset.cardDragging;
  }

  // ── Controlled edge-scroll during drag ──────────────────────────────────────
  // The browser's native drag-scroll causes the strip to jump erratically.
  // We implement smooth edge-scroll ONLY if the strip actually has overflow.
  function _stopScrollRaf() {
    if (_scrollRaf !== null) { cancelAnimationFrame(_scrollRaf); _scrollRaf = null; }
  }

  function _edgeScroll(clientY) {
    _stopScrollRaf();
    if (strip.scrollHeight <= strip.clientHeight) return;

    const rect      = strip.getBoundingClientRect();
    const ZONE      = 60;   // px from edge to activate scroll
    const MAX_SPEED = 8;    // px per frame at the very edge

    function _frame() {
      const distTop = clientY - rect.top;
      const distBot = rect.bottom - clientY;
      let delta = 0;
      if (distTop < ZONE && distTop > 0)  delta = -MAX_SPEED * (1 - distTop / ZONE);
      if (distBot < ZONE && distBot > 0)  delta =  MAX_SPEED * (1 - distBot / ZONE);
      if (delta !== 0 && strip.scrollHeight > strip.clientHeight) {
        strip.scrollTop += delta;
        _scrollRaf = requestAnimationFrame(_frame);
      }
    }
    _scrollRaf = requestAnimationFrame(_frame);
  }

  // Prevent dragover from bubbling up to drop-zone
  strip.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _edgeScroll(e.clientY);
  }, { passive: false });

  strip.addEventListener('dragleave', (e) => {
    if (!strip.contains(e.relatedTarget)) _stopScrollRaf();
  });

  strip.addEventListener('dragend', () => { _stopScrollRaf(); _unlockMainScroll(); _unlockDropZone(); });
  strip.addEventListener('drop',    () => { _stopScrollRaf(); _unlockMainScroll(); _unlockDropZone(); });

  // ── Per-card drag handlers ──────────────────────────────────────────────────
  strip.querySelectorAll('.dz-merge-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      _dragSrcIdx = parseInt(card.dataset.idx, 10);
      card.classList.add('dz-merge-card--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(_dragSrcIdx));
      _lockDropZone();
      _lockMainScroll();
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dz-merge-card--dragging');
      strip.querySelectorAll('.dz-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-merge-card--drag-over'));
      _stopScrollRaf();
      _unlockMainScroll();
      _unlockDropZone();
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();    // stop bubbling to drop-zone
      e.dataTransfer.dropEffect = 'move';
      strip.querySelectorAll('.dz-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-merge-card--drag-over'));
      card.classList.add('dz-merge-card--drag-over');
      _edgeScroll(e.clientY);
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('dz-merge-card--drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _stopScrollRaf();
      _unlockMainScroll();
      _unlockDropZone();

      strip.querySelectorAll('.dz-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-merge-card--drag-over'));

      const targetIdx = parseInt(card.dataset.idx, 10);
      if (_dragSrcIdx === targetIdx || _dragSrcIdx < 0) {
        _dragSrcIdx = -1;
        return;
      }

      // Reorder _queue
      const moved = _queue.splice(_dragSrcIdx, 1)[0];
      _queue.splice(targetIdx, 0, moved);

      // Reorder the DOM card nodes in-place without destroying/recreating anything
      const cards = Array.from(strip.querySelectorAll('.dz-merge-card'));
      const srcCard = cards[_dragSrcIdx];
      const tgtCard = cards[targetIdx];
      if (srcCard && tgtCard) {
        if (_dragSrcIdx < targetIdx) {
          tgtCard.after(srcCard);
        } else {
          tgtCard.before(srcCard);
        }
        strip.querySelectorAll('.dz-merge-card').forEach((c, idx) => {
          c.dataset.idx = String(idx);
          const ord = c.querySelector('.dz-merge-ordinal');
          if (ord) {
            ord.textContent = String(idx + 1);
            ord.setAttribute('aria-label', `Position ${idx + 1}`);
          }
        });
      }
      _dragSrcIdx = -1;
    });
  });
}



// ─── MERGE PANEL (below drop zone) ────────────────────────────────────────────

/** Build / rebuild the merge action panel beneath the drop zone. */
function _renderMergePanel() {
  const existing = document.getElementById('merge-queue-panel');
  if (existing) existing.remove();

  if (_queue.length < 1) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#FF6B6B') : '#FF6B6B';

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id = 'merge-queue-panel';
  panel.className = 'merge-queue-panel';
  panel.style.setProperty('--merge-color', color);

  const totalPages = _queue.reduce((s, it) => s + it.pageCount, 0);
  const canMerge   = _queue.length >= 2;

  panel.innerHTML = `
    <div class="mqp-header">
      <span class="mqp-summary-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="3" width="6" height="8" rx="1.2" stroke="${color}" stroke-width="1.3"/>
          <rect x="9" y="3" width="6" height="8" rx="1.2" stroke="${color}" stroke-width="1.3"/>
          <path d="M7 7h2" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span class="mqp-summary-text">
          <strong>${_queue.length}</strong> file${_queue.length !== 1 ? 's' : ''}
          &nbsp;·&nbsp;
          <strong>${totalPages}</strong> page${totalPages !== 1 ? 's' : ''} total
        </span>
      </span>
      <button class="mqp-clear-btn" id="mqp-clear-btn" title="Remove all files">Clear all</button>
    </div>

    ${!canMerge ? `
    <div class="mqp-hint" id="mqp-hint">
      <span style="color:#F87171">Add at least one more PDF to merge.</span>
    </div>` : ''}

    <div class="mqp-actions">
      <input class="mqp-filename-input" id="mqp-filename-input"
             type="text" placeholder="Output filename (optional)"
             value="${_queue.length > 0 ? _queue[0].file.name.replace(/\.pdf$/i, '') + '_merged' : 'merged'}" maxlength="120" spellcheck="false"/>
      <span class="mqp-filename-ext">.pdf</span>
      <button class="mqp-merge-btn${canMerge ? '' : ' mqp-merge-btn--disabled'}"
              id="mqp-merge-btn" ${canMerge ? '' : 'disabled'}>
        Merge PDFs
      </button>
    </div>`;

  heroCard.appendChild(panel);

  // Animate in
  requestAnimationFrame(() => panel.classList.add('merge-queue-panel--visible'));

  // "Clear all"
  panel.querySelector('#mqp-clear-btn').addEventListener('click', () => {
    removeMergePanel();
    const zone = document.getElementById('drop-zone');
    if (zone) {
      resetZoneContent(zone);
      import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        const t = getActiveTool();
        if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
      }).catch(() => {});
    }
  });

  // "Merge PDFs"
  panel.querySelector('#mqp-merge-btn').addEventListener('click', () => {
    if (_queue.length < 2) return;
    const nameInput = panel.querySelector('#mqp-filename-input');
    const outName   = (nameInput ? nameInput.value.trim() : '') || 'merged';
    // Scroll the main content area back to the top before processing
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTop = 0;
    _submitMerge(outName);
  });
}

// ─── SCAN FLOW ────────────────────────────────────────────────────────────────

/**
 * Called when files are picked while the Merge tool is active.
 * Scans each new PDF (page count + thumbnail) then adds them to the queue.
 * @param {FileList|File[]} files
 */
export async function handleMergeFilesPicked(files) {
  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#FF6B6B') : '#FF6B6B';
  const zone  = document.getElementById('drop-zone');

  // Filter to PDFs only
  const allFiles = Array.from(files);
  const pdfs = allFiles.filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfs.length < allFiles.length) {
    pushNotification({
      type: 'warning',
      message: 'Invalid File Format. Please select a valid PDF file.'
    });
  }

  if (pdfs.length === 0) {
    return;
  }

  // Deduplicate: skip any file already in the queue (same name + size).
  const _key = (f) => `${f.name}::${f.size}`;
  const existing = new Set(_queue.map((item) => _key(item.file)));
  const newPdfs = pdfs.filter((f) => !existing.has(_key(f)));

  // All picked files were already in the queue — silently ignore.
  if (newPdfs.length === 0) return;

  // First batch: show full scan ring overlay over the empty zone.
  // Subsequent batches: queue already has items — skip the overlay entirely
  // so the existing thumbnail strip stays visible while new files are scanned.
  const isFirstBatch = _queue.length === 0;
  if (isFirstBatch) {
    showScanProgress(zone, color, `Scanning ${newPdfs.length} PDFs…`);
  }

  // Process files in concurrent batches of 4 with live progress label.
  // Do NOT call updateProgress() — it mutates stroke-dashoffset which fights the
  // CSS @keyframes spin animation and causes it to stutter/freeze.
  const BATCH_SIZE = 4;
  let processed = 0;
  for (let i = 0; i < newPdfs.length; i += BATCH_SIZE) {
    const chunk = newPdfs.slice(i, i + BATCH_SIZE);
    if (isFirstBatch) {
      const label = zone ? zone.querySelector('.dz-progress-label') : null;
      if (label) label.textContent = `Scanning ${processed} of ${newPdfs.length}…`;
    }

    await Promise.all(chunk.map(async (file) => {
      const fd1 = new FormData(); fd1.append('file', file);
      const fd2 = new FormData(); fd2.append('file', file);

      let pageCount = null;
      let thumbnail = null;

      try {
        const [countRes, thumbRes] = await Promise.all([
          fetch(`${BACKEND}/api/pdf/page-count`, { method: 'POST', body: fd1 }).catch(() => null),
          fetch(`${BACKEND}/api/pdf/thumbnail`,  { method: 'POST', body: fd2 }).catch(() => null),
        ]);
        if (countRes && countRes.ok) {
          const cj = await countRes.json();
          pageCount = cj.page_count || 1;
        }
        if (thumbRes && thumbRes.ok) {
          const tj = await thumbRes.json();
          thumbnail = tj.thumbnail || null;
        }
      } catch (_) {
        pageCount = null;
      }

      if (!pageCount) {
        try {
          const offlineInfo = await getOfflinePdfInfo(file, 0.5);
          pageCount = offlineInfo.pageCount || 1;
          thumbnail = offlineInfo.thumbnail || null;
        } catch (_) {
          pageCount = 1;
        }
      }

      _queue.push({ file, pageCount, thumbnail });
    }));

    processed += chunk.length;

    // Yield a paint frame so the browser can keep the spin animation smooth.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Only remove the scan-ring overlay if we actually showed one (first batch).
  if (isFirstBatch) {
    resetZoneContent(zone);
  }

  // Rebuild UI
  _renderThumbStrip();
  _renderMergePanel();
}

// ─── SUBMIT ───────────────────────────────────────────────────────────────────

async function _submitMerge(outputFilename) {
  const tool = getActiveTool();
  if (!tool) return;

  const zone  = document.getElementById('drop-zone');
  const color = tool.color || '#FF6B6B';

  // Remove thumbnail strip and merge panel immediately — restore zone to original size
  const strip = zone ? zone.querySelector('.dz-merge-thumb-strip') : null;
  if (strip) strip.remove();
  if (zone) zone.classList.remove('dz-has-merge-thumbs');

  const panel = document.getElementById('merge-queue-panel');
  if (panel) panel.remove();

  // Build multipart form data
  const fd = new FormData();
  _queue.forEach((item) => fd.append('files', item.file));
  fd.append('output_filename', outputFilename);
  fd.append('passwords', JSON.stringify(_queue.map(() => '')));

  // Show progress ring
  showProgress(zone, 0, color, 'Merging…');

  // Register job immediately so bar appears if user switches tools during upload
  const earlyFilename = `${outputFilename}.pdf`;
  setBgJob({ jobId: null, tool, filename: earlyFilename, progress: 5, state: 'submitting', sse: null });

  // POST to backend
  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/pdf/merger/merge`, { method: 'POST', body: fd });
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

  // Subscribe to SSE progress
  const sse    = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct  = 0;

  // Upgrade from 'submitting' to 'running' now that we have a real jobId + SSE
  setBgJob({ jobId, tool, filename: earlyFilename, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const { state, progress, error } = data;
    const pct = typeof progress === 'number' ? progress : lastPct;
    lastPct   = pct;

    const bg = getBgJob(jobId);
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

      const dlName = data.filename || `${outputFilename}.pdf`;

      const onReset = () => {
        removeMergePanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };

      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset), 200);
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (state === 'error') {
      showError(zone, error || 'Merge failed. Please try again.');
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?');
  };
}
