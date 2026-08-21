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

  // Remove old strip
  const old = zone.querySelector('.dz-merge-thumb-strip');
  if (old) old.remove();

  if (_queue.length === 0) {
    zone.classList.remove('dz-has-merge-thumbs');
    return;
  }

  zone.classList.add('dz-has-merge-thumbs');

  const strip = document.createElement('div');
  strip.className = 'dz-merge-thumb-strip';

  _queue.forEach((item, idx) => {
    const card = _buildThumbCard(item, idx, color);
    strip.appendChild(card);
  });

  // "Add more" button at the end
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

  zone.appendChild(strip);

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
            style="--merge-color:${color}" aria-label="Remove ${_escHtml(item.file.name)}">&#x2715;</button>`;

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
  let _dragSrcIdx = -1;

  strip.querySelectorAll('.dz-merge-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      _dragSrcIdx = parseInt(card.dataset.idx, 10);
      card.classList.add('dz-merge-card--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(_dragSrcIdx));
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dz-merge-card--dragging');
      strip.querySelectorAll('.dz-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-merge-card--drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      strip.querySelectorAll('.dz-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-merge-card--drag-over'));
      card.classList.add('dz-merge-card--drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('dz-merge-card--drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetIdx = parseInt(card.dataset.idx, 10);
      if (_dragSrcIdx === targetIdx || _dragSrcIdx < 0) return;

      // Reorder _queue
      const moved = _queue.splice(_dragSrcIdx, 1)[0];
      _queue.splice(targetIdx, 0, moved);
      _dragSrcIdx = -1;

      _renderThumbStrip();
      _renderMergePanel();
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

    <div class="mqp-hint" id="mqp-hint">
      ${canMerge
        ? `Drag the PDFs above to change the merge order.`
        : `<span style="color:#F87171">Add at least one more PDF to merge.</span>`}
    </div>

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
  const pdfs = Array.from(files).filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfs.length === 0) {
    showError(zone, 'Please select PDF files only.');
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
    showScanProgress(zone, color);
  }

  // Scan each new (non-duplicate) file sequentially to keep progress honest
  for (const file of newPdfs) {
    const fd1 = new FormData(); fd1.append('file', file);
    const fd2 = new FormData(); fd2.append('file', file);

    let pageCount = 1;
    let thumbnail = null;

    try {
      const [countRes, thumbRes] = await Promise.all([
        fetch(`${BACKEND}/api/pdf/page-count`, { method: 'POST', body: fd1 }),
        fetch(`${BACKEND}/api/pdf/thumbnail`,  { method: 'POST', body: fd2 }),
      ]);
      if (countRes.ok) {
        const cj = await countRes.json();
        pageCount = cj.page_count || 1;
      }
      if (thumbRes.ok) {
        const tj = await thumbRes.json();
        thumbnail = tj.thumbnail || null;
      }
    } catch (_) {
      // Non-fatal — show fallback icon, use page count 1
    }

    _queue.push({ file, pageCount, thumbnail });
  }

  // Only remove the scan-ring overlay if we actually showed one (first batch).
  // For subsequent batches the zone never entered scanning state, so calling
  // resetZoneContent would be a no-op at best and could flicker at worst.
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
