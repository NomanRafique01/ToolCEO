import { pushNotification } from './notificationStore.js';

let _activeTool = null;
const _listeners = [];

export function setActiveTool(tool) {
  _activeTool = tool;
  _listeners.forEach((fn) => fn(tool));
}

export function getActiveTool() {
  return _activeTool;
}

export function onToolChange(fn) {
  _listeners.push(fn);
}

const _bgJobs = new Map();
let _bgSeq = 0;
let _renderScheduled = false;

function _makeClientId() {
  _bgSeq += 1;
  return `local-bg-${Date.now()}-${_bgSeq}`;
}

function _pickFallbackJob() {
  const activeTool = getActiveTool();
  const jobs = [..._bgJobs.values()].reverse();
  return jobs.find((job) => activeTool && job.tool && job.tool.id === activeTool.id)
    || jobs.find((job) => job.state === 'running' || job.state === 'submitting')
    || jobs[0]
    || null;
}

function _visibleJobs() {
  const activeTool = getActiveTool();
  return [..._bgJobs.values()].filter((job) => {
    // Extract jobs (noNotify) that are done are always hidden — they are
    // cleared silently when the user switches away, no card ever shown.
    if (job.noNotify && job.state === 'done') return false;

    // The active tool renders its own progress/result UI, so do not duplicate
    // that job in the sidebar bar once it is running or completed.
    const isActiveToolJob =
      activeTool && job.tool && job.tool.id === activeTool.id;
    const isOwnedByActiveTool =
      job.state === 'running' || job.state === 'submitting' || job.state === 'done';
    if (isActiveToolJob && isOwnedByActiveTool) return false;
    return true;
  });
}

export function setBgJob(job) {
  if (!job) return null;
  const incoming = { ...job };
  let key = incoming.jobId ? String(incoming.jobId) : incoming.clientId || _makeClientId();
  let existing = _bgJobs.get(key);

  if (incoming.jobId && !existing) {
    for (const [candidateKey, candidate] of _bgJobs.entries()) {
      const sameTool = candidate.tool && incoming.tool && candidate.tool.id === incoming.tool.id;
      const sameFile = (candidate.filename || '') === (incoming.filename || '');
      if (!candidate.jobId && sameTool && sameFile) {
        existing = candidate;
        _bgJobs.delete(candidateKey);
        key = String(incoming.jobId);
        break;
      }
    }
  }

  if (existing && existing.sse && existing.sse !== incoming.sse) {
    try { existing.sse.close(); } catch (_) {}
  }

  const prevNotified = existing ? existing.notified : false;
  const prevPending  = existing ? existing.pendingNotify : false;

  // If this update transitions the job to a terminal state (done/error) and
  // the user is currently on this tool, mark it as pending so that
  // onToolChange fires the notification when they navigate away.
  const terminalState = incoming.state === 'done' || incoming.state === 'error';
  const wasTerminal   = existing && (existing.state === 'done' || existing.state === 'error');
  let pendingNotify = prevPending;
  if (terminalState && !wasTerminal && !prevNotified) {
    const activeTool = getActiveTool();
    const onThisTool = activeTool && incoming.tool && activeTool.id === incoming.tool.id;
    if (onThisTool) {
      pendingNotify = true;
    }
  }

  _bgJobs.set(key, {
    ...existing,
    ...incoming,
    clientId: key,
    notified: prevNotified,
    pendingNotify,
  });
  syncBgJobBar();
  return key;
}

export function getBgJob(jobId = null) {
  if (jobId) return _bgJobs.get(String(jobId)) || null;
  return _pickFallbackJob();
}

export function getBgJobForTool(toolId) {
  if (!toolId) return null;
  const jobs = [..._bgJobs.values()].reverse();
  return jobs.find((job) => job.tool && job.tool.id === toolId) || null;
}

export function clearBgJob(jobIdOrSilent = null, maybeSilent = false) {
  let key = null;
  let silent = maybeSilent;

  if (typeof jobIdOrSilent === 'boolean') {
    silent = jobIdOrSilent;
  } else if (jobIdOrSilent) {
    key = String(jobIdOrSilent);
  } else {
    const fallback = _pickFallbackJob();
    key = fallback ? fallback.clientId : null;
  }

  const job = key ? _bgJobs.get(key) : null;
  if (job && job.sse) {
    try { job.sse.close(); } catch (_) {}
  }
  if (key) _bgJobs.delete(key);

  syncBgJobBar();
  if (!silent) {
    document.dispatchEvent(new CustomEvent('bg-job-cleared', { detail: { jobId: key } }));
  }
}

function _renderStatusBadge(state, color) {
  if (state === 'done') {
    return '<span class="bg-job-badge bg-job-badge--done">&#10003; Completed</span>';
  }
  if (state === 'error') {
    return '<span class="bg-job-badge bg-job-badge--error">Failed</span>';
  }
  return '';
}

function _renderActionBtn(state, jobId, blob, key, noSave) {
  if (state === 'done' && !noSave && (jobId || blob)) {
    return `<button type="button" class="bg-job-btn bg-job-btn--save" data-bg-save="${key}">Save As...</button>`;
  }
  if (state === 'running') {
    return `<button type="button" class="bg-job-btn bg-job-btn--view" data-bg-view="${key}">View Tool</button>`;
  }
  return '';
}

function _renderBgJobBar() {
  const bar = document.getElementById('bg-job-bar');
  if (!bar) return;

  const jobs = _visibleJobs();
  if (jobs.length === 0) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  bar.style.display = 'flex';

  const existingCards = new Map();
  bar.querySelectorAll('.bg-job-card[data-job-key]').forEach((card) => {
    existingCards.set(card.dataset.jobKey, card);
  });

  const activeKeys = new Set();

  jobs.forEach((job) => {
    const key = String(job.clientId || job.jobId || '');
    activeKeys.add(key);

    const color = (job.tool && job.tool.color) || '#00E5C0';
    const bg = (job.tool && job.tool.bg) || 'rgba(0,229,192,0.12)';
    const label = (job.tool && job.tool.label) || 'Tool Task';
    const pct = Math.max(5, Math.min(100, Math.round(job.progress || 5)));
    const { state, filename, jobId } = job;

    if ((state === 'done' || state === 'error') && !job.notified) {
      const activeTool = getActiveTool();
      const onThisTool = activeTool && job.tool && activeTool.id === job.tool.id;
      if (onThisTool) {
        // User is currently on this tool — defer notification until they navigate away.
        job.pendingNotify = true;
      } else {
        // User is on a different tool — fire immediately, once.
        job.notified = true;
        job.pendingNotify = false;
        pushNotification({
          type: state === 'done' ? 'success' : 'error',
          message: `${label} ${state === 'done' ? 'completed' : 'failed'}`,
          detail: filename || '',
          autoDismiss: false,
        });
      }
    }

    let card = existingCards.get(key);
    if (!card) {
      // Create new card
      const temp = document.createElement('div');
      temp.innerHTML = _renderBgJob(job);
      card = temp.firstElementChild;
      bar.appendChild(card);
      _bindCardEvents(card);
    } else {
      // Surgically update existing card without re-animating or blinking
      card.style.setProperty('--bg-job-color', color);
      card.style.setProperty('--bg-job-bg', bg);

      const nameEl = card.querySelector('.bg-job-name');
      if (nameEl) nameEl.textContent = label;

      const fileEl = card.querySelector('.bg-job-file');
      if (fileEl) fileEl.textContent = filename || '';

      const pctEl = card.querySelector('.bg-job-pct');
      if (pctEl) pctEl.textContent = state === 'error' ? 'Err' : `${pct}%`;

      const fillEl = card.querySelector('.bg-job-fill');
      if (fillEl) {
        fillEl.style.width = `${pct}%`;
        fillEl.style.background = color;
      }

      const badgeContainer = card.querySelector('.bg-job-badge-container');
      if (badgeContainer) {
        badgeContainer.innerHTML = _renderStatusBadge(state, color);
      }

      const actionContainer = card.querySelector('.bg-job-action-container');
      if (actionContainer) {
        const expectedAction = _renderActionBtn(state, jobId, job.blob, key, job.noSave);
        if (actionContainer.innerHTML !== expectedAction) {
          actionContainer.innerHTML = expectedAction;
          _bindCardEvents(card);
        }
      }
    }
  });

  // Remove cards that are no longer in jobs
  existingCards.forEach((card, key) => {
    if (!activeKeys.has(key)) {
      card.remove();
    }
  });
}

// Coalesce rapid SSE progress events into one DOM update per paint frame.
export function syncBgJobBar() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  const render = () => {
    _renderScheduled = false;
    _renderBgJobBar();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(render);
  else setTimeout(render, 16);
}

function _bindCardEvents(card) {
  card.querySelectorAll('[data-bg-view]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const job = _bgJobs.get(btn.dataset.bgView);
      if (job && job.tool) {
        document.dispatchEvent(new CustomEvent('bg-job-switch', { detail: { tool: job.tool } }));
      }
    };
  });

  card.querySelectorAll('[data-bg-save]').forEach((saveBtn) => {
    saveBtn.onclick = async (e) => {
      e.stopPropagation();
      const job = _bgJobs.get(saveBtn.dataset.bgSave);
      if (!job) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      try {
        if (job.blob) {
          await _saveBlobFile(job.blob, job.filename);
        } else {
          await _downloadJobFile(job.jobId, job.filename);
        }
        saveBtn.textContent = 'Saved';
        clearBgJob(job.clientId, true);
      } catch (_) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save As...';
      }
    };
  });

  card.querySelectorAll('[data-bg-close]').forEach((closeX) => {
    closeX.onclick = (e) => {
      e.stopPropagation();
      clearBgJob(closeX.dataset.bgClose);
    };
  });
}

function _renderBgJob(job) {
  const { tool, progress, state, filename, jobId, clientId } = job;
  const color = (tool && tool.color) || '#00E5C0';
  const bg = (tool && tool.bg) || 'rgba(0,229,192,0.12)';
  const label = (tool && tool.label) || 'Tool Task';
  const pct = Math.max(5, Math.min(100, Math.round(progress || 5)));
  const key = _esc(clientId || jobId || '');

  const iconHtml = (tool && tool.icon)
    ? tool.icon
        .replace(/width="[0-9]+"/, 'width="18"')
        .replace(/height="[0-9]+"/, 'height="18"')
        .replace(/class="[^"]*"/, '')
        .replace('<svg', '<svg style="color:currentColor"')
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
         <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
         <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
       </svg>`;

  const statusBadge = state === 'done'
    ? '<span class="bg-job-badge bg-job-badge--done">&#10003; Completed</span>'
    : state === 'error'
      ? '<span class="bg-job-badge bg-job-badge--error">Failed</span>'
      : '';

  const actionBtn = state === 'done' && !job.noSave && (jobId || job.blob)
    ? `<button type="button" class="bg-job-btn bg-job-btn--save" data-bg-save="${key}">Save As...</button>`
    : state === 'running'
      ? `<button type="button" class="bg-job-btn bg-job-btn--view" data-bg-view="${key}">View Tool</button>`
      : '';

  const clickableLeft = (job.tool) ? `data-bg-view="${key}" style="cursor:pointer" title="Switch to ${_esc(label)}"` : '';

  return `
    <div class="bg-job-card" data-job-key="${key}" style="--bg-job-color:${color};--bg-job-bg:${bg}">
      <div class="bg-job-header">
        <div class="bg-job-left" ${clickableLeft}>
          <div class="bg-job-icon">${iconHtml}</div>
          <span class="bg-job-name">${_esc(label)}</span>
          <span class="bg-job-badge-container">${_renderStatusBadge(state, color)}</span>
        </div>
        <div class="bg-job-right">
          <span class="bg-job-pct">${state === 'error' ? 'Err' : `${pct}%`}</span>
          <span class="bg-job-action-container">${_renderActionBtn(state, jobId, job.blob, key, job.noSave)}</span>
          <button type="button" class="bg-job-close-x" data-bg-close="${key}" title="Dismiss" aria-label="Dismiss background job">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="bg-job-file">${_esc(filename)}</div>
      <div class="bg-job-track">
        <div class="bg-job-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
}

function _esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function _saveBlobFile(blob, filename) {
  const arrayBuf = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuf);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  if (window.toolceo && window.toolceo.saveFileAs) {
    const outExt = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    const tool = _activeTool;
    let inExt = '';
    let origName = '';
    let cat = '';
    if (tool) {
      if (tool.sourceFilename) { origName = tool.sourceFilename; inExt = origName.includes('.') ? origName.split('.').pop().toLowerCase() : ''; }
      if (tool.category) cat = tool.category.toLowerCase();
      if (!inExt && tool.id) { const p = String(tool.id).toLowerCase().split(/[-_]/); if (p.length >= 2 && p[0] !== p[1]) inExt = p[0]; }
    }
    if (!inExt) inExt = outExt || 'file';
    if (!origName) origName = (filename.replace(/\.[^/.]+$/, '') || 'input') + '.' + inExt;
    const meta = { original_filename: origName, input_format: inExt, category: cat || 'document' };
    const savedPath = await window.toolceo.saveFileAs(filename, base64, meta);
    if (!savedPath) throw new Error('Save cancelled');
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

async function _downloadJobFile(jobId, filename) {
  const res = await fetch(`http://127.0.0.1:8000/api/download/${jobId}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const blob = await res.blob();
  await _saveBlobFile(blob, filename);
}

onToolChange((newTool) => {
  // Jobs marked noNotify (e.g. archive-extract) are silently cleared when the
  // user navigates away after completion — no banner, no bg-job card.
  const keysToDelete = [];
  _bgJobs.forEach((job, key) => {
    if (!job.noNotify) return;
    if (job.state !== 'done' && job.state !== 'error') return;
    const stillOnTool = newTool && job.tool && newTool.id === job.tool.id;
    if (stillOnTool) return;
    if (job.sse) { try { job.sse.close(); } catch (_) {} }
    keysToDelete.push(key);
  });
  keysToDelete.forEach((k) => _bgJobs.delete(k));

  // Fire deferred "completion" notifications for any terminal job that:
  //   a) was explicitly marked pendingNotify (job completed while user was on it
  //      and setBgJob caught the transition), OR
  //   b) reached a terminal state via direct mutation (e.g. bg.state = 'done')
  //      without going through setBgJob — those have notified=false and
  //      pendingNotify=false but are no longer for the current active tool.
  _bgJobs.forEach((job) => {
    if (job.noNotify) return; // already handled above
    const isTerminal = job.state === 'done' || job.state === 'error';
    if (!isTerminal || job.notified) return;
    const stillOnTool = newTool && job.tool && newTool.id === job.tool.id;
    if (stillOnTool) return; // still on same tool — keep deferring
    job.notified = true;
    job.pendingNotify = false;
    const label = (job.tool && job.tool.label) || 'Tool Task';
    pushNotification({
      type: job.state === 'done' ? 'success' : 'error',
      message: `${label} ${job.state === 'done' ? 'completed' : 'failed'}`,
      detail: job.filename || '',
      autoDismiss: false,
    });
  });
  syncBgJobBar();
});
