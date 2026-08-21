/** @type {{ id: string, label: string, mainText: string, subText: string, color?: string, icon?: string } | null} */
let _activeTool = null;

/** Listeners called when the active tool changes. */
const _listeners = [];

/**
 * Set the active tool and notify all listeners.
 * @param {{ id: string, label: string, mainText: string, subText: string } | null} tool
 */
export function setActiveTool(tool) {
  _activeTool = tool;
  _listeners.forEach((fn) => fn(tool));
}

/** @returns {{ id: string, label: string, mainText: string, subText: string } | null} */
export function getActiveTool() {
  return _activeTool;
}

/** @param {(tool: object | null) => void} fn */
export function onToolChange(fn) {
  _listeners.push(fn);
}

// ─── BACKGROUND JOB TRACKING ──────────────────────────────────────────────────

let _activeBgJob    = null;
let _bgJobDoneHandled = false;

export function setBgJob(job) {
  if (_activeBgJob && _activeBgJob.sse && _activeBgJob.sse !== job.sse) {
    try { _activeBgJob.sse.close(); } catch (_) {}
  }
  _activeBgJob = job;
  _bgJobDoneHandled = false;   // reset so new job can auto-switch on done
  syncBgJobBar();
}

export function getBgJob() {
  return _activeBgJob;
}

export function clearBgJob() {
  if (_activeBgJob && _activeBgJob.sse) {
    try { _activeBgJob.sse.close(); } catch (_) {}
  }
  _activeBgJob = null;
  syncBgJobBar();
  document.dispatchEvent(new CustomEvent('bg-job-cleared'));
}

export function syncBgJobBar() {
  const bar = document.getElementById('bg-job-bar');
  if (!bar) return;

  if (!_activeBgJob) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  // Only show when user is viewing a DIFFERENT tool than the one executing.
  // Immediately hide when they return to the executing tool so the normal
  // dropzone progress bar is visible instead.
  const activeTool = getActiveTool();
  const isShifted  = !activeTool || activeTool.id !== _activeBgJob.tool.id;

  if (!isShifted) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  const { tool, progress, state, filename, jobId } = _activeBgJob;
  const color = (tool && tool.color) || '#00E5C0';
  const bg    = (tool && tool.bg)    || 'rgba(0,229,192,0.12)';
  const label = (tool && tool.label) || 'Tool Task';
  const pct   = Math.max(10, Math.min(100, Math.round(progress || 10)));

  bar.style.display = 'block';
  bar.style.setProperty('--bg-job-color', color);
  bar.style.setProperty('--bg-job-bg', bg);

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

  let statusBadge = '';
  let actionBtn   = '';

  if (state === 'submitting') {
    statusBadge = `
      <span class="bg-job-badge bg-job-badge--running">
        <span class="bg-job-dot" style="background:${color}"></span>
        Uploading&hellip;
      </span>`;
    actionBtn = '';
  } else if (state === 'running') {
    statusBadge = `
      <span class="bg-job-badge bg-job-badge--running">
        <span class="bg-job-dot" style="background:${color}"></span>
        Executing in background
      </span>`;
    actionBtn = `
      <button type="button" class="bg-job-btn bg-job-btn--view" id="bg-job-switch-btn">
        View Tool
      </button>`;
  } else if (state === 'done') {
    statusBadge = `
      <span class="bg-job-badge bg-job-badge--done">&#10003; Completed</span>`;
    actionBtn = `
      <button type="button" class="bg-job-btn bg-job-btn--save" id="bg-job-save-btn">
        Save As&hellip;
      </button>`;

    // Auto-switch back to the executing tool — once per job.
    // isShifted will then be false and the bar hides automatically.
    if (!_bgJobDoneHandled) {
      _bgJobDoneHandled = true;
      const doneJob = _activeBgJob;
      document.dispatchEvent(new CustomEvent('bg-job-switch', { detail: { tool: doneJob.tool } }));
    }
  } else if (state === 'error') {
    statusBadge = `
      <span class="bg-job-badge bg-job-badge--error">Failed</span>`;
    actionBtn = '';
  }

  bar.innerHTML = `
    <div class="bg-job-card">
      <div class="bg-job-header">
        <div class="bg-job-left">
          <div class="bg-job-icon">${iconHtml}</div>
          <span class="bg-job-name">${_esc(label)}</span>
          ${statusBadge}
        </div>
        <div class="bg-job-right">
          <span class="bg-job-pct">${state === 'error' ? 'Err' : `${pct}%`}</span>
          ${actionBtn}
          <button type="button" class="bg-job-close-x" id="bg-job-close-x" title="Dismiss" aria-label="Dismiss background job">
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

  const switchBtn = bar.querySelector('#bg-job-switch-btn');
  if (switchBtn) {
    switchBtn.onclick = (e) => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent('bg-job-switch', {
        detail: { tool: _activeBgJob.tool }
      }));
    };
  }

  const saveBtn = bar.querySelector('#bg-job-save-btn');
  if (saveBtn) {
    saveBtn.onclick = async (e) => {
      e.stopPropagation();
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving\u2026';
      try {
        await _downloadJobFile(jobId, filename);
        saveBtn.textContent = '\u2713 Saved';
        clearBgJob();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save As\u2026';
      }
    };
  }

  const closeX = bar.querySelector('#bg-job-close-x');
  if (closeX) {
    closeX.onclick = (e) => {
      e.stopPropagation();
      clearBgJob();
    };
  }
}


function _esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function _downloadJobFile(jobId, filename) {
  const res = await fetch(`http://127.0.0.1:8000/api/download/${jobId}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const blob     = await res.blob();
  const arrayBuf = await blob.arrayBuffer();
  const uint8    = new Uint8Array(arrayBuf);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  if (window.toolceo && window.toolceo.saveFileAs) {
    const savedPath = await window.toolceo.saveFileAs(filename, base64);
    if (!savedPath) throw new Error('Save cancelled');
  } else {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}

onToolChange(() => syncBgJobBar());
