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
    if (!activeTool) return true;
    // Hide ALL states for the currently active tool — the tool's own panel
    // shows the result inline; showing it in the bg bar too is redundant/confusing.
    return !job.tool || job.tool.id !== activeTool.id;
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

  _bgJobs.set(key, {
    ...existing,
    ...incoming,
    clientId: key,
    notified: existing ? existing.notified : false,
  });
  syncBgJobBar();
  return key;
}

export function getBgJob(jobId = null) {
  if (jobId) return _bgJobs.get(String(jobId)) || null;
  return _pickFallbackJob();
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

export function syncBgJobBar() {
  const bar = document.getElementById('bg-job-bar');
  if (!bar) return;

  const jobs = _visibleJobs();
  if (jobs.length === 0) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  bar.style.display = 'block';
  bar.innerHTML = jobs.map(_renderBgJob).join('');

  bar.querySelectorAll('[data-bg-view]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const job = _bgJobs.get(btn.dataset.bgView);
      if (job && job.tool) {
        document.dispatchEvent(new CustomEvent('bg-job-switch', { detail: { tool: job.tool } }));
      }
    };
  });

  bar.querySelectorAll('[data-bg-save]').forEach((saveBtn) => {
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

  bar.querySelectorAll('[data-bg-close]').forEach((closeX) => {
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

  if ((state === 'done' || state === 'error') && !job.notified) {
    job.notified = true;
    pushNotification({
      type: state === 'done' ? 'success' : 'error',
      message: `${label} ${state === 'done' ? 'completed' : 'failed'}`,
      detail: filename || '',
      autoDismiss: false,
    });
  }

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
      : `<span class="bg-job-badge bg-job-badge--running"><span class="bg-job-dot" style="background:${color}"></span>${state === 'submitting' ? 'Uploading...' : 'Executing in background'}</span>`;

  const actionBtn = state === 'done' && (jobId || job.blob)
    ? `<button type="button" class="bg-job-btn bg-job-btn--save" data-bg-save="${key}">Save As...</button>`
    : state === 'running'
      ? `<button type="button" class="bg-job-btn bg-job-btn--view" data-bg-view="${key}">View Tool</button>`
      : '';

  const clickableLeft = (job.tool) ? `data-bg-view="${key}" style="cursor:pointer" title="Switch to ${_esc(label)}"` : '';

  return `
    <div class="bg-job-card" style="--bg-job-color:${color};--bg-job-bg:${bg}">
      <div class="bg-job-header">
        <div class="bg-job-left" ${clickableLeft}>
          <div class="bg-job-icon">${iconHtml}</div>
          <span class="bg-job-name">${_esc(label)}</span>
          ${statusBadge}
        </div>
        <div class="bg-job-right">
          <span class="bg-job-pct">${state === 'error' ? 'Err' : `${pct}%`}</span>
          ${actionBtn}
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

onToolChange(() => syncBgJobBar());
