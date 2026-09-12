/**
 * frontend/tools/archives/archive_merger.js
 *
 * Archive Merger — combine multiple archive files into one merged archive.
 *
 * UX identical to PDF merger (merger.js):
 *  - Multi-file thumbnail card strip inside the drop zone
 *  - Drag-to-reorder cards
 *  - Queue toolbar: Add More, Clear All, part count pill
 *  - Settings panel: output name + output format selector + Merge button
 *  - Progress ring → showDownload (SSE) → bg job bar
 */

import { getActiveTool, setBgJob, getBgJob, syncBgJobBar, clearBgJob } from '../../scripts/toolstate.js';
import {
  showProgress,
  updateProgress,
  resetZoneContent,
  showDownload,
  showError,
} from '../shared/progress.js';
import { getArchiveFileIconSvg, getArchiveFormatLabel } from '../shared/archiveIcon.js';

const BACKEND = 'http://127.0.0.1:8000';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
/** @type {Array<{file: File, id: number}>} */
let _queue          = [];
let _nextId         = 0;
let _selectedFormat = 'zip';

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const p = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** p)).toFixed(p ? 1 : 0)} ${units[p]}`;
}

function _cleanStem(filename) {
  let name = filename || 'merged_archive';
  for (const ext of ['.tar.gz', '.tar.bz2', '.tar.xz', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']) {
    if (name.toLowerCase().endsWith(ext)) { name = name.slice(0, -ext.length); break; }
  }
  // Strip numeric part suffix like .001 .002
  name = name.replace(/\.\d{3}$/, '');
  return name || 'merged_archive';
}

function _totalSize() {
  return _queue.reduce((s, item) => s + item.file.size, 0);
}

// ─── PUBLIC TEARDOWN ──────────────────────────────────────────────────────────
export function removeArchiveMergerPanel() {
  const panel = document.getElementById('arc-merger-queue-panel');
  if (panel) panel.remove();

  const zone = document.getElementById('drop-zone');
  if (zone) {
    zone.querySelector('.dz-arc-merge-strip')?.remove();
    zone.querySelector('.dz-arc-merge-toolbar')?.remove();
    zone.classList.remove('dz-has-arc-merge-thumbs');
  }

  _queue          = [];
  _nextId         = 0;
  _selectedFormat = 'zip';
}

// ─── THUMBNAIL STRIP ──────────────────────────────────────────────────────────

function _renderThumbStrip() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#00E5C0') : '#00E5C0';

  if (_queue.length === 0) {
    zone.querySelector('.dz-arc-merge-toolbar')?.remove();
    zone.querySelector('.dz-arc-merge-strip')?.remove();
    zone.classList.remove('dz-has-arc-merge-thumbs');
    return;
  }

  zone.classList.add('dz-has-arc-merge-thumbs');

  const totalSize = _totalSize();

  // ── Toolbar ──────────────────────────────────────────────────────────────
  let toolbar = zone.querySelector('.dz-arc-merge-toolbar');
  if (toolbar) {
    const pill = toolbar.querySelector('.dz-arc-merge-count-pill');
    if (pill) {
      pill.textContent = `${_queue.length} file${_queue.length !== 1 ? 's' : ''}`;
      pill.style.background = color;
    }
    const info = toolbar.querySelector('.dz-arc-merge-info-text');
    if (info) info.textContent = `${_fmt(totalSize)} total · Drag to reorder`;
  } else {
    toolbar = document.createElement('div');
    toolbar.className = 'dz-arc-merge-toolbar';
    toolbar.innerHTML = `
      <div class="dz-arc-merge-toolbar-left">
        <span class="dz-arc-merge-count-pill" style="background:${color}; color:#0A1F1C">
          ${_queue.length} file${_queue.length !== 1 ? 's' : ''}
        </span>
        <span class="dz-arc-merge-info-text">
          ${_fmt(totalSize)} total · Drag to reorder
        </span>
      </div>
      <div class="dz-arc-merge-toolbar-actions">
        <button type="button" class="dz-queue-add-btn" id="dam-toolbar-add" title="Add more files" style="color:${color}; border-color:color-mix(in srgb, ${color} 35%, transparent); background:color-mix(in srgb, ${color} 12%, transparent)">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          Add File
        </button>
        <button type="button" class="dz-queue-clear-btn" id="dam-toolbar-clear" title="Clear all files">
          Clear All
        </button>
      </div>
    `;

    toolbar.querySelector('#dam-toolbar-add').addEventListener('click', (e) => {
      e.stopPropagation();
      const inp = document.getElementById('file-input');
      if (inp) { inp.multiple = true; inp.removeAttribute('accept'); inp.click(); }
    });

    toolbar.querySelector('#dam-toolbar-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      removeArchiveMergerPanel();
      const z = document.getElementById('drop-zone');
      if (z) {
        resetZoneContent(z);
        import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
          const t = getActiveTool();
          if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
        }).catch(() => {});
      }
    });

    zone.appendChild(toolbar);
  }

  // ── Scrollable strip ──────────────────────────────────────────────────────
  let strip = zone.querySelector('.dz-arc-merge-strip');
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'dz-arc-merge-strip';
    zone.appendChild(strip);
  }

  strip.innerHTML = '';
  _queue.forEach((item, idx) => {
    const card = _buildCard(item, idx, color);
    strip.appendChild(card);
  });

  // "Add more" card at end of strip
  const addBtn = document.createElement('button');
  addBtn.className = 'dz-arc-merge-add-card';
  addBtn.title = 'Add more files';
  addBtn.style.setProperty('--arc-merge-color', color);
  addBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
    <span>Add File</span>`;
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const inp = document.getElementById('file-input');
    if (inp) { inp.multiple = true; inp.removeAttribute('accept'); inp.click(); }
  });
  strip.appendChild(addBtn);

  // Wire drag-to-reorder
  _initDragReorder(strip, color);
}

// ─── CARD BUILDER ──────────────────────────────────────────────────────────────

function _buildCard(item, idx, color) {
  const card = document.createElement('div');
  card.className = 'dz-arc-merge-card';
  card.dataset.idx = String(idx);
  card.draggable = true;
  card.style.setProperty('--arc-merge-color', color);

  const fmt = getArchiveFormatLabel(item.file.name);
  const svg = getArchiveFileIconSvg(fmt, color);

  const shortName = item.file.name.length > 18
    ? item.file.name.slice(0, 15) + '…'
    : item.file.name;

  card.innerHTML = `
    <span class="dz-arc-merge-ordinal" aria-label="Position ${idx + 1}">${idx + 1}</span>
    <div class="dz-arc-merge-thumb-frame" style="border-color:${color}">
      ${svg}
    </div>
    <div class="dz-arc-merge-drag-hint" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="3" cy="3" r="1" fill="currentColor"/>
        <circle cx="7" cy="3" r="1" fill="currentColor"/>
        <circle cx="3" cy="7" r="1" fill="currentColor"/>
        <circle cx="7" cy="7" r="1" fill="currentColor"/>
      </svg>
    </div>
    <span class="dz-arc-merge-card-name" title="${_esc(item.file.name)}">${_esc(shortName)}</span>
    <span class="dz-arc-merge-size-badge">${_fmt(item.file.size)}</span>
    <button class="dz-arc-merge-card-remove" title="Remove this file"
            aria-label="Remove ${_esc(item.file.name)}">&#x2715;</button>`;

  card.querySelector('.dz-arc-merge-card-remove').addEventListener('click', (e) => {
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
    if (_isCardDragging) e.preventDefault();
  }

  function _lockMainScroll() {
    const mc = document.getElementById('main-content');
    if (!mc) return;
    _lockedScrollTop = mc.scrollTop;
    _isCardDragging  = true;

    if (!mc._dzArcMergeScrollLockBound) {
      mc._dzArcMergeScrollLockBound = true;
      mc.addEventListener('scroll', () => {
        if (_isCardDragging && _lockedScrollTop !== null) {
          if (mc.scrollTop !== _lockedScrollTop) mc.scrollTop = _lockedScrollTop;
        }
      }, { passive: false });
    }

    function _pinFrame() {
      if (!_isCardDragging) return;
      if (mc.scrollTop !== _lockedScrollTop) mc.scrollTop = _lockedScrollTop;
      _pinRaf = requestAnimationFrame(_pinFrame);
    }
    _pinRaf = requestAnimationFrame(_pinFrame);
    window.addEventListener('wheel', _onWheelDuringDrag, { passive: false });
  }

  function _unlockMainScroll() {
    _isCardDragging = false;
    if (_pinRaf !== null) { cancelAnimationFrame(_pinRaf); _pinRaf = null; }
    window.removeEventListener('wheel', _onWheelDuringDrag);
    const mc = document.getElementById('main-content');
    if (mc && _lockedScrollTop !== null) mc.scrollTop = _lockedScrollTop;
    _lockedScrollTop = null;
  }

  function _lockDropZone() {
    const zone = document.getElementById('drop-zone');
    if (zone) zone.dataset.cardDragging = '1';
  }
  function _unlockDropZone() {
    const zone = document.getElementById('drop-zone');
    if (zone) delete zone.dataset.cardDragging;
  }

  function _stopScrollRaf() {
    if (_scrollRaf !== null) { cancelAnimationFrame(_scrollRaf); _scrollRaf = null; }
  }

  function _edgeScroll(clientY) {
    _stopScrollRaf();
    if (strip.scrollHeight <= strip.clientHeight) return;
    const rect = strip.getBoundingClientRect();
    const ZONE = 60; const MAX_SPEED = 8;
    function _frame() {
      const distTop = clientY - rect.top;
      const distBot = rect.bottom - clientY;
      let delta = 0;
      if (distTop < ZONE && distTop > 0) delta = -MAX_SPEED * (1 - distTop / ZONE);
      if (distBot < ZONE && distBot > 0) delta =  MAX_SPEED * (1 - distBot / ZONE);
      if (delta !== 0 && strip.scrollHeight > strip.clientHeight) {
        strip.scrollTop += delta;
        _scrollRaf = requestAnimationFrame(_frame);
      }
    }
    _scrollRaf = requestAnimationFrame(_frame);
  }

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

  strip.querySelectorAll('.dz-arc-merge-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      _dragSrcIdx = parseInt(card.dataset.idx, 10);
      card.classList.add('dz-arc-merge-card--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(_dragSrcIdx));
      _lockDropZone();
      _lockMainScroll();
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dz-arc-merge-card--dragging');
      strip.querySelectorAll('.dz-arc-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-arc-merge-card--drag-over'));
      _stopScrollRaf();
      _unlockMainScroll();
      _unlockDropZone();
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      strip.querySelectorAll('.dz-arc-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-arc-merge-card--drag-over'));
      card.classList.add('dz-arc-merge-card--drag-over');
      _edgeScroll(e.clientY);
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('dz-arc-merge-card--drag-over');
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _stopScrollRaf();
      _unlockMainScroll();
      _unlockDropZone();

      strip.querySelectorAll('.dz-arc-merge-card--drag-over')
           .forEach((c) => c.classList.remove('dz-arc-merge-card--drag-over'));

      const targetIdx = parseInt(card.dataset.idx, 10);
      if (_dragSrcIdx === targetIdx || _dragSrcIdx < 0) { _dragSrcIdx = -1; return; }

      const moved = _queue.splice(_dragSrcIdx, 1)[0];
      _queue.splice(targetIdx, 0, moved);

      const cards = Array.from(strip.querySelectorAll('.dz-arc-merge-card'));
      const srcCard = cards[_dragSrcIdx];
      const tgtCard = cards[targetIdx];
      if (srcCard && tgtCard) {
        if (_dragSrcIdx < targetIdx) tgtCard.after(srcCard);
        else tgtCard.before(srcCard);

        strip.querySelectorAll('.dz-arc-merge-card').forEach((c, idx) => {
          c.dataset.idx = String(idx);
          const ord = c.querySelector('.dz-arc-merge-ordinal');
          if (ord) { ord.textContent = String(idx + 1); ord.setAttribute('aria-label', `Position ${idx + 1}`); }
        });
      }
      _dragSrcIdx = -1;
    });
  });
}

// ─── MERGE PANEL (below drop zone) ────────────────────────────────────────────

function _renderMergePanel() {
  const existing = document.getElementById('arc-merger-queue-panel');
  let preservedName = null;
  if (existing) {
    const prevInp = existing.querySelector('#amqp-filename-input');
    if (prevInp && prevInp.value.trim()) preservedName = prevInp.value.trim();
    existing.remove();
  }

  if (_queue.length < 1) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#00E5C0') : '#00E5C0';

  const heroCard = document.querySelector('.hero-card');
  if (!heroCard) return;

  const panel = document.createElement('div');
  panel.id = 'arc-merger-queue-panel';
  panel.className = 'arc-merger-queue-panel';
  panel.style.setProperty('--arc-merge-color', color);

  const canMerge = _queue.length >= 2;
  const firstStem = _cleanStem(_queue[0].file.name);
  const initialName = preservedName || `${firstStem}_merged`;

  const fmtOptions = [
    { v: 'zip',  l: 'ZIP (.zip)', ext: '.zip' },
    { v: '7z',   l: '7Z (.7z)',   ext: '.7z'  },
    { v: 'tar',  l: 'TAR (.tar)', ext: '.tar' },
  ];
  const activeFmt = fmtOptions.find((o) => o.v === _selectedFormat) || fmtOptions[0];

  panel.innerHTML = `
    <div class="amqp-header">
      <span class="amqp-summary-badge">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="3" width="6" height="8" rx="1.2" stroke="${color}" stroke-width="1.3"/>
          <rect x="9" y="3" width="6" height="8" rx="1.2" stroke="${color}" stroke-width="1.3"/>
          <path d="M7 7h2" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span class="amqp-summary-text">
          <strong>${_queue.length}</strong> file${_queue.length !== 1 ? 's' : ''}
          &nbsp;·&nbsp;
          <strong>${_fmt(_totalSize())}</strong> total
        </span>
      </span>
      <button class="amqp-clear-btn" id="amqp-clear-btn" title="Remove all files">Clear all</button>
    </div>

    ${!canMerge ? `
    <div class="amqp-hint" id="amqp-hint">
      <span style="color:#F87171">Add at least one more file to merge.</span>
    </div>` : ''}

    <div class="amqp-actions">
      <div class="amqp-format-group">
        <label class="amqp-format-label" for="amqp-fmt-select">Output</label>
        <div class="amqp-select-wrap">
          <select class="amqp-format-select" id="amqp-fmt-select" title="Output format">
            ${fmtOptions.map((o) => `<option value="${o.v}"${o.v === activeFmt.v ? ' selected' : ''}>${o.l}</option>`).join('')}
          </select>
          <svg class="amqp-select-arrow" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <div class="amqp-filename-wrap">
        <input class="amqp-filename-input" id="amqp-filename-input"
               type="text" placeholder="Output filename (optional)"
               value="${_esc(initialName)}" maxlength="120" spellcheck="false"/>
        <span class="amqp-filename-ext" id="amqp-filename-ext">${activeFmt.ext}</span>
      </div>

      <button class="amqp-merge-btn${canMerge ? '' : ' amqp-merge-btn--disabled'}"
              id="amqp-merge-btn" ${canMerge ? '' : 'disabled'}>
        Merge
      </button>
    </div>`;

  heroCard.appendChild(panel);

  // Animate in
  requestAnimationFrame(() => panel.classList.add('arc-merger-queue-panel--visible'));

  // Wire format change to update dynamic extension badge
  const fmtSelect = panel.querySelector('#amqp-fmt-select');
  const extEl     = panel.querySelector('#amqp-filename-ext');
  const extMap    = { zip: '.zip', '7z': '.7z', tar: '.tar' };

  if (fmtSelect) {
    fmtSelect.addEventListener('change', () => {
      _selectedFormat = fmtSelect.value;
      if (extEl) extEl.textContent = extMap[_selectedFormat] || '.zip';
    });
  }

  // "Clear all"
  panel.querySelector('#amqp-clear-btn').addEventListener('click', () => {
    removeArchiveMergerPanel();
    const zone = document.getElementById('drop-zone');
    if (zone) {
      resetZoneContent(zone);
      import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
        const t = getActiveTool();
        if (t && _updateDropZoneForTool) _updateDropZoneForTool(t);
      }).catch(() => {});
    }
  });

  // "Merge"
  panel.querySelector('#amqp-merge-btn').addEventListener('click', () => {
    if (_queue.length < 2) return;
    const nameInput = panel.querySelector('#amqp-filename-input');
    const outName = (nameInput ? nameInput.value.trim() : '') || firstStem + '_merged';
    const outFmt  = fmtSelect ? fmtSelect.value : (_selectedFormat || 'zip');
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTop = 0;
    _submitMerge(outName, outFmt);
  });
}

// ─── PUBLIC FILE HANDLER ──────────────────────────────────────────────────────

export function handleArchiveMergerFilesPicked(files) {
  const fileArray = Array.from(files);
  if (!fileArray.length) return;

  const tool  = getActiveTool();
  const color = tool ? (tool.color || '#00E5C0') : '#00E5C0';

  // Deduplicate: skip any file already in the queue (same name + size).
  const _key = (f) => `${f.name}::${f.size}`;
  const existing = new Set(_queue.map((item) => _key(item.file)));
  const newFiles = fileArray.filter((f) => !existing.has(_key(f)));

  if (newFiles.length === 0) return;

  // Add all new files to queue
  newFiles.forEach((f) => {
    _queue.push({ file: f, id: _nextId++ });
  });

  // Rebuild UI
  _renderThumbStrip();
  _renderMergePanel();

  // Scroll to top so the drop zone is visible
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── SUBMIT MERGE ─────────────────────────────────────────────────────────────
async function _submitMerge(outputName, outputFormat) {
  const tool = getActiveTool();
  if (!tool || _queue.length === 0) return;

  const zone    = document.getElementById('drop-zone');
  const color   = tool.color || '#00E5C0';
  const parts   = [..._queue];
  const extMap  = { zip: '.zip', '7z': '.7z', tar: '.tar' };
  const ext     = extMap[outputFormat] || '.zip';
  const earlyName = `${outputName}${ext}`;

  // Clear queue + UI before showing progress
  _queue = []; _nextId = 0;
  document.getElementById('arc-merger-queue-panel')?.remove();
  zone?.querySelector('.dz-arc-merge-strip')?.remove();
  zone?.querySelector('.dz-arc-merge-toolbar')?.remove();
  zone?.classList.remove('dz-has-arc-merge-thumbs');

  const fd = new FormData();
  parts.forEach(({ file }) => fd.append('files', file));
  fd.append('output_filename', outputName);
  fd.append('output_format', outputFormat);

  showProgress(zone, 10, color, 'Merging…', tool.id);
  setBgJob({ jobId: null, tool, filename: earlyName, progress: 5, state: 'submitting', sse: null });

  let jobId;
  try {
    const res  = await fetch(`${BACKEND}/api/archives/merge`, { method: 'POST', body: fd });
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
    showError(zone, `Upload failed: ${err.message}`, tool.id);
    clearBgJob();
    return;
  }

  const sse    = new EventSource(`${BACKEND}/api/progress/${jobId}`);
  let lastPct  = 0;
  setBgJob({ jobId, tool, filename: earlyName, progress: 10, state: 'running', sse });

  sse.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    const rawPct = typeof data.progress === 'number' ? data.progress : lastPct;
    const pct    = Math.max(lastPct, rawPct);
    lastPct = pct;

    const bg = getBgJob(jobId);
    if (bg && bg.jobId === jobId) {
      bg.progress = Math.max(10, Math.min(100, pct));
      bg.state    = data.state === 'done' ? 'done' : (data.state === 'error' ? 'error' : 'running');
      if (data.filename) bg.filename = data.filename;
      syncBgJobBar();
    }

    if (data.state === 'running' || data.state === 'pending') {
      updateProgress(zone, Math.max(10, Math.min(90, pct)), color, tool.id);
      return;
    }

    sse.close();

    if (data.state === 'done') {
      updateProgress(zone, 100, color, tool.id);
      removeArchiveMergerPanel();
      const dlName = data.filename || earlyName;
      const onReset = () => {
        removeArchiveMergerPanel();
        const activeTool = getActiveTool();
        if (activeTool) {
          import('../../scripts/dropzone.js').then(({ _updateDropZoneForTool }) => {
            if (_updateDropZoneForTool) _updateDropZoneForTool(activeTool);
          }).catch(() => {});
        }
      };
      setTimeout(() => showDownload(zone, dlName, jobId, color, onReset, tool.id), 200);
      if (getActiveTool()?.id === tool.id) {
        document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    if (data.state === 'error') {
      showError(zone, data.error || 'Merge failed. Please try again.', tool.id);
    }
  };

  sse.onerror = () => {
    sse.close();
    showError(zone, 'Lost connection to backend. Is the server running?', tool.id);
  };
}
