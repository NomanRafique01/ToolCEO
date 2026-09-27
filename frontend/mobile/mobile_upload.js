/**
 * Phone transfer page — theming + upload + job-mirror logic.
 *
 * The desktop links a jobId to this session via the /job endpoint;
 * the /status poll returns a live `job` snapshot. This module reacts
 * to that snapshot to show the progress ring, download card, or
 * cancelled state — all in perfect sync with the desktop.
 */
(function () {
  const params    = new URLSearchParams(window.location.search);
  const sessionId = window.MOBILE_SESSION_ID || params.get('session') || '';
  let selectedItems   = [];
  let sessionEnded    = false;
  let statusPollTimer = null;
  let pickingFiles    = false;
  let uploadingFiles  = false;
  let sendingFiles    = false;
  let disconnectTimer = null;

  // Job-mirror state
  let _activeJobId   = null;   // jobId currently mirrored
  let _wasShowingJob = false;  // were we showing a job view?
  let _jobDoneShown  = false;  // guard: don't re-trigger done view
  let _jobDownloadStarted = false;

  const DEFAULT_COLOR = '#00E5C0';
  const DEFAULT_BG    = 'rgba(0, 229, 192, 0.15)';

  function readEmbeddedTheme() {
    const el = document.getElementById('mobile-theme');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (_) {
      return null;
    }
  }

  function isSafeIcon(svg) {
    if (typeof svg !== 'string') return false;
    const s = svg.trim();
    if (!s.toLowerCase().startsWith('<svg') || s.length > 20000) return false;
    const lower = s.toLowerCase();
    return !lower.includes('<script') && !lower.includes('javascript:');
  }

  function scaledIcon(svgString, color, size, className) {
    const cls = className || 'drop-icon';
    return svgString
      .replace(/width="26"/, `width="${size}"`)
      .replace(/height="26"/, `height="${size}"`)
      .replace(/class="[^"]*"/, '')
      .replace('<svg', `<svg class="${cls}" style="color:${color}"`)
      .replace(`<svg class="${cls}"`, `<svg width="${size}" height="${size}" class="${cls}"`)
      .replace(/stroke="currentColor"/g, `stroke="${color}"`)
      .replace(/fill="currentColor"/g, `fill="${color}"`);
  }

  function applyTheme(theme) {
    if (!theme) return;
    const color = theme.color || DEFAULT_COLOR;
    const bg = theme.bg || DEFAULT_BG;
    const root = document.documentElement;
    root.style.setProperty('--dz-color', color);
    root.style.setProperty('--dz-bg', bg);
    root.style.setProperty('--accent', color);
    root.style.setProperty('--accent-hover', color);
    root.style.setProperty('--primary', color);

    const nameEl = document.getElementById('tool-name');
    if (nameEl && theme.tool_name) nameEl.textContent = theme.tool_name;

    const tagEl = document.getElementById('tool-tag');
    if (tagEl) {
      if (theme.tag) {
        tagEl.textContent = theme.tag;
        tagEl.hidden = false;
      } else {
        tagEl.hidden = true;
      }
    }

    const mainEl = document.getElementById('drop-main-text');
    if (mainEl) {
      mainEl.textContent = theme.mainText || 'Select files to send';
    }

    const subEl = document.getElementById('drop-sub-text');
    if (subEl) subEl.textContent = theme.subText || 'Browse files from your phone';

    if (isSafeIcon(theme.icon)) {
      const headerBox = document.getElementById('tool-icon-box');
      if (headerBox) headerBox.innerHTML = scaledIcon(theme.icon, color, 22, 'tool-header-icon');

      const dropSlot = document.getElementById('drop-icon-slot');
      if (dropSlot) dropSlot.innerHTML = scaledIcon(theme.icon, color, 48, 'drop-icon');
    }
    _themeData = { ..._themeData, ...theme };
    const saveCard = document.getElementById('mobile-save-card');
    if (saveCard) {
      saveCard.style.setProperty('--save-color', color);
    }
    const ringFill = document.getElementById('job-ring-fill');
    if (ringFill) {
      ringFill.setAttribute('stroke', color);
    }


    const formatLabel = theme.format_label || _themeData.format_label;
    const hintEl = document.getElementById('drop-format-hint');
    if (hintEl) {
      if (formatLabel && formatLabel !== 'files') {
        hintEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Accepts: <strong>${formatLabel}</strong>`;
        hintEl.style.display = 'inline-flex';
      } else {
        hintEl.style.display = 'none';
      }
    }

    const galleryInput = document.getElementById('file-input-gallery');
    if (galleryInput && theme.accept_attr) {
      galleryInput.accept = theme.accept_attr;
    }

    const cameraBtn = document.getElementById('take-photo-btn');
    const galleryBtn = document.getElementById('choose-gallery-btn');
    const galleryLabel = document.getElementById('choose-gallery-label');
    if (cameraBtn) {
      if (theme.allows_camera === false) {
        cameraBtn.hidden = true;
        cameraBtn.classList.add('is-camera-dimmed');
        cameraBtn.title = 'Camera capture not supported for this tool';
        galleryBtn?.classList.add('is-single-action');
        if (galleryLabel) galleryLabel.textContent = 'Browse Files';
      } else {
        cameraBtn.hidden = false;
        cameraBtn.classList.remove('is-camera-dimmed');
        cameraBtn.title = '';
        galleryBtn?.classList.remove('is-single-action');
        if (galleryLabel) galleryLabel.textContent = 'Browse Files';
      }
    }


  }

  let _themeData = readEmbeddedTheme() || {};
  applyTheme(_themeData);
  ensureDropzoneOverlays();

  let heartbeatTimer = null;

  function sendDisconnect() {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    disconnectTimer = setTimeout(() => {
      disconnectTimer = null;
      // Mobile browsers briefly hide/pagehide the page while opening the
      // native picker. Only disconnect after that transition settles.
      if (!sessionId || sessionEnded || pickingFiles || uploadingFiles || document.visibilityState === 'visible') return;
      const url = `/api/mobile/session/${sessionId}/disconnect`;
      let sent = false;
      try {
        sent = navigator.sendBeacon(url, '');
      } catch (_) {}
      if (!sent) {
        fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
      }
    }, 1500);
  }

  function resumeSession() {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    pickingFiles = false;
    if (!sessionId || sessionEnded) return;
    fetch(`/api/mobile/session/${sessionId}/ping?resume=1`, { method: 'POST', keepalive: true }).catch(() => {});
  }

  function resumeIfIdle() {
    if (pickingFiles || uploadingFiles) return;
    resumeSession();
  }

  function armFilePick() {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    pickingFiles = true;
    if (!sessionId || sessionEnded) return;
    fetch(`/api/mobile/session/${sessionId}/picking`, { method: 'POST', keepalive: true }).catch(() => {});
  }

  function startHeartbeat() {
    if (heartbeatTimer || !sessionId) return;
    heartbeatTimer = setInterval(() => {
      if (sessionEnded || pickingFiles) return;
      if (document.visibilityState !== 'visible') return;
      fetch(`/api/mobile/session/${sessionId}/ping`, { method: 'POST' }).catch(() => {});
    }, 2000);
  }

  if (sessionId) {
    fetch(`/api/mobile/session/${sessionId}/ping`, { method: 'POST' }).catch(() => {});
    fetch(`/api/mobile/session/${sessionId}/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) applyTheme(data); })
      .catch(() => {});
    startHeartbeat();
  }

  // File pickers hide this tab on mobile. Do not send a disconnect beacon here:
  // pagehide/visibilitychange are also emitted during multi-file selection and
  // upload. The server heartbeat is the authoritative abandoned-page check.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeIfIdle();
  });
  window.addEventListener('pageshow', resumeIfIdle);
  window.addEventListener('focus', resumeIfIdle);

  // Intentionally no pagehide/beforeunload disconnect handler. Mobile
  // browsers use those events for the native file picker as well.

  // ── View switcher ────────────────────────────────────────────────────────

  const ALL_VIEWS = [
    'form-view', 'success-view', 'disconnected-view',
  ];

  function _switchToView(viewId) {
    ALL_VIEWS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = (id === viewId) ? (id === 'form-view' ? '' : 'flex') : 'none';
    });
  }

  // ── Ensure dropzone overlays match desktop exact DOM ──────────────────────
  function ensureDropzoneOverlays() {
    const dz = document.getElementById('mobile-dropzone');
    if (!dz) return;

    // Remove any legacy detached views outside dropzone
    const legacyProgress = document.querySelector('main > #job-progress-view');
    if (legacyProgress) legacyProgress.remove();
    const legacyDone = document.querySelector('main > #job-done-view');
    if (legacyDone) legacyDone.remove();

    let pWrap = document.getElementById('job-progress-view');
    if (!pWrap || !dz.contains(pWrap)) {
      if (pWrap) pWrap.remove();
      pWrap = document.createElement('div');
      pWrap.className = 'dz-progress-wrap';
      pWrap.id = 'job-progress-view';
      pWrap.style.display = 'none';
      pWrap.innerHTML = `
        <div class="dz-progress-content">
          <svg class="dz-ring-svg" width="110" height="110" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle class="dz-ring-glow" cx="55" cy="55" r="28"/>
            <circle class="dz-ring-track" cx="55" cy="55" r="40"/>
            <circle class="dz-ring-fill" id="job-ring-fill" cx="55" cy="55" r="40" stroke="var(--dz-color, #00E5C0)" stroke-dasharray="251.327 251.327" stroke-dashoffset="251.327" style="transform-origin:55px 55px"/>
          </svg>
          <div class="dz-ring-center">
            <span class="dz-pct" id="job-ring-pct">0%</span>
            <span class="dz-progress-label" id="job-progress-label">PROCESSING</span>
          </div>
        </div>
      `;
      dz.appendChild(pWrap);
    }

    let dWrap = document.getElementById('job-done-view');
    if (!dWrap || !dz.contains(dWrap)) {
      if (dWrap) dWrap.remove();
      dWrap = document.createElement('div');
      dWrap.className = 'dz-download-wrap';
      dWrap.id = 'job-done-view';
      dWrap.style.display = 'none';
      dWrap.innerHTML = `
        <div class="dz-save-card" id="mobile-save-card" style="--save-color: var(--dz-color, #00E5C0)">
          <button class="dz-save-close" id="job-close-btn" type="button" title="Close download window" aria-label="Close download window">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div class="dz-save-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="dz-save-info">
            <span class="dz-save-name" id="job-done-filename" title=""></span>
            <span class="dz-save-ext" id="job-done-ext">File ready to download</span>
          </div>
          <button class="dz-save-btn" id="job-download-btn" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
              <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
            </svg>Download File
          </button>
          <div class="dz-save-done" id="job-save-done">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
              <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Downloaded successfully
          </div>
        </div>
      `;
      dz.appendChild(dWrap);
    }

    _wireJobEvents();
  }

  function _wireJobEvents() {
    const closeBtn = document.getElementById('job-close-btn');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        dismissJobView();
      };
    }

    const dlBtn = document.getElementById('job-download-btn');
    if (dlBtn) {
      dlBtn.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!_activeJobId || _jobDownloadStarted) return;
        _jobDownloadStarted = true;

        const origHtml = dlBtn.innerHTML;
        dlBtn.disabled = true;
        dlBtn.textContent = 'Downloading…';

        try {
          const downloadUrl = `/api/download/${_activeJobId}`;
          const fn = document.getElementById('job-done-filename')?.textContent || 'download';

          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = fn;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          dlBtn.style.display = 'none';
          const doneCheck = document.getElementById('job-save-done');
          if (doneCheck) doneCheck.classList.add('dz-save-done--visible');
          dismissJobView();
        } catch (err) {
          _jobDownloadStarted = false;
          dlBtn.disabled = false;
          dlBtn.innerHTML = origHtml;
        }
      };
    }
  }

  // ── Job-mirror helpers (Desktop Ring Circumference r=40: 2 * π * 40 ≈ 251.327) ──

  const RING_CIRCUMFERENCE = 2 * Math.PI * 40; // ≈ 251.327

  function _updateRing(pct) {
    const fill  = document.getElementById('job-ring-fill');
    const pctEl = document.getElementById('job-ring-pct');
    const color = _themeData.color || DEFAULT_COLOR;
    if (fill) {
      const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
      const offset = RING_CIRCUMFERENCE * (1 - clamped / 100);
      fill.style.strokeDashoffset = String(offset);
      fill.setAttribute('stroke', color);
    }
    if (pctEl) pctEl.textContent = `${Math.round(pct || 0)}%`;
  }

  function showJobProgress(pct, filename) {
    ensureDropzoneOverlays();
    _wasShowingJob = true;
    _switchToView('form-view');

    const dz = document.getElementById('mobile-dropzone');
    const progressWrap = document.getElementById('job-progress-view');
    const doneWrap = document.getElementById('job-done-view');
    const chips = document.getElementById('action-chips');
    const syncBar = document.getElementById('mobile-sync-bar');

    if (dz) {
      dz.classList.add('dz-state-processing');
      dz.classList.remove('dz-state-done');
    }
    if (chips) chips.style.display = 'none';
    if (syncBar) syncBar.style.display = 'none';
    if (doneWrap) doneWrap.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'flex';

    const label = document.getElementById('job-progress-label');
    if (label) label.textContent = pct < 100 ? 'PROCESSING' : 'FINISHING UP';
    _updateRing(pct);
  }

  function showJobDone(jobId, filename) {
    ensureDropzoneOverlays();
    if (_jobDoneShown && _activeJobId === jobId) return;
    _activeJobId  = jobId;
    _wasShowingJob = true;
    _jobDoneShown  = true;
    _jobDownloadStarted = false;

    _switchToView('form-view');

    const dz = document.getElementById('mobile-dropzone');
    const progressWrap = document.getElementById('job-progress-view');
    const doneWrap = document.getElementById('job-done-view');
    const chips = document.getElementById('action-chips');
    const syncBar = document.getElementById('mobile-sync-bar');

    if (dz) {
      dz.classList.remove('dz-state-processing');
      dz.classList.add('dz-state-done');
    }
    if (chips) chips.style.display = 'none';
    if (syncBar) syncBar.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'none';
    if (doneWrap) doneWrap.style.display = 'flex';

    const fnEl = document.getElementById('job-done-filename');
    if (fnEl) {
      fnEl.textContent = filename || 'downloaded-file';
      fnEl.title = filename || '';
    }

    const extEl = document.getElementById('job-done-ext');
    if (extEl) {
      const ext = (filename && filename.includes('.')) ? filename.split('.').pop().toUpperCase() : '';
      extEl.textContent = ext ? `${ext} file — ready to download` : 'File ready to download';
    }

    const dlBtn = document.getElementById('job-download-btn');
    const doneCheck = document.getElementById('job-save-done');
    if (dlBtn) {
      dlBtn.style.display = 'flex';
      dlBtn.disabled = false;
      dlBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             style="display:inline;vertical-align:middle;margin-right:5px" aria-hidden="true">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>Download File`;
    }
    if (doneCheck) {
      doneCheck.classList.remove('dz-save-done--visible');
    }
  }

  function showJobCancelled(reason) {
    _activeJobId   = null;
    _wasShowingJob = false;
    _jobDoneShown  = false;
    resetToEmptyDropzone();
  }

  function dismissJobView() {
    const jobId = _activeJobId;
    if (sessionId) {
      fetch(`/api/mobile/session/${sessionId}/job_dismiss`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {});
    }
    _activeJobId = null;
    _wasShowingJob = false;
    _jobDoneShown = false;
    _jobDownloadStarted = false;
    resetForMoreFiles();
  }

  function setConnectionBadge(mode) {
    const badge = document.querySelector('.status-badge');
    if (!badge) return;
    const label = badge.querySelector('span:last-child');
    badge.classList.remove('is-receiving');
    badge.classList.toggle('is-sending', mode === 'sending');
    if (label) label.textContent = mode === 'sending' ? 'Sending Files' : 'Connected';
  }

  function showDisconnectedScreen(reason) {
    sessionEnded = true;
    pickingFiles = false;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (statusPollTimer) { clearTimeout(statusPollTimer); statusPollTimer = null; }
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge) {
      statusBadge.style.background  = 'rgba(239, 68, 68, 0.12)';
      statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      statusBadge.style.color       = '#F87171';
      statusBadge.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#EF4444;display:inline-block"></span> Disconnected';
    }
    const descEl = document.getElementById('disconnected-desc');
    if (reason === 'cancelled' && descEl) {
      descEl.innerHTML = 'The desktop closed this transfer session.<br>Scan a new QR code to start again.';
    }
    _switchToView('disconnected-view');
  }

  // ── Status polling (Adaptive timer: 750ms while job runs, 2000ms idle) ──

  let _pollInterval = 2000;
  async function _pollSessionStatus() {
    if (sessionEnded) return;
    try {
      const res = await fetch(`/api/mobile/session/${sessionId}/status`);
      if (res.status === 404) {
        showDisconnectedScreen('cancelled');
        return;
      }
      const data = await res.json();

      // A desktop close/save clears the mirrored job. Return the phone to
      // its normal drop zone instead of leaving a stale download card open.
      if (data.pending_job_clear) {
        fetch(`/api/mobile/session/${sessionId}/job_dismiss_ack`, {
          method: 'POST',
          keepalive: true,
        }).catch(() => {});
      }

      if (data.status === 'uploading') {
        setConnectionBadge('sending');
      } else if (data.status === 'completed') {
        setConnectionBadge('connected');
      } else if (data.status === 'connected' && !data.files_count) {
        setConnectionBadge('connected');
      }

      if (data.status === 'cancelled') {
        showDisconnectedScreen('cancelled');
        return;
      }

      // ── Job mirror ────────────────────────────────────────────────────
      const job = data.job;
      if (job) {
        _activeJobId = job.job_id || _activeJobId;
        if (job.cancelled || job.state === 'error') {
          showJobCancelled('desktop');
          _pollInterval = 2000;
        } else if (job.state === 'done') {
          showJobDone(job.job_id, job.filename);
          _pollInterval = 2000;
        } else {
          showJobProgress(job.progress || 0, job.filename);
          _pollInterval = 750; // Smooth real-time progress update
        }
      } else if (_wasShowingJob) {
        _wasShowingJob = false;
        _activeJobId = null;
        _jobDoneShown = false;
        _jobDownloadStarted = false;
        resetToEmptyDropzone();
        _pollInterval = 2000;
      } else {
        _pollInterval = 2000;
      }
    } catch (_) {}

    if (!sessionEnded) {
      statusPollTimer = setTimeout(_pollSessionStatus, _pollInterval);
    }
  }

  if (sessionId) {
    statusPollTimer = setTimeout(_pollSessionStatus, 800);
  }

  // ── File picker setup ────────────────────────────────────────────────────

  const dropzone        = document.getElementById('mobile-dropzone');
  const galleryInput    = document.getElementById('file-input-gallery');
  const cameraInput     = document.getElementById('file-input-camera');
  const previewSection  = document.getElementById('preview-section');
  const previewGrid     = document.getElementById('preview-grid');
  const fileCount       = document.getElementById('file-count');
  const sendBtn         = document.getElementById('send-btn');
  const sendBtnText     = document.getElementById('send-btn-text');
  const progressContainer = document.getElementById('progress-container');
  const progressBar     = document.getElementById('progress-bar');
  const formView        = document.getElementById('form-view');
  const successView     = document.getElementById('success-view');

  // ── Format Validation & Invalid Format Notification ────────────────────

  let _activeToastTimeout = null;

  function showMobileTransferNotification({ title = 'Files Sent', message = '', detail = '' } = {}) {
    const existing = document.getElementById('mobile-transfer-toast');
    if (existing) existing.remove();
    if (_activeToastTimeout) clearTimeout(_activeToastTimeout);

    const toast = document.createElement('div');
    toast.className = 'mobile-toast mobile-toast--success';
    toast.id = 'mobile-transfer-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <div class="mobile-toast-header">
        <div class="mobile-toast-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5"></path>
          </svg>
        </div>
        <div class="mobile-toast-title-group">
          <div class="mobile-toast-title">${_esc(title)}</div>
          ${detail ? `<div class="mobile-toast-subtitle">${_esc(detail)}</div>` : ''}
        </div>
        <button type="button" class="mobile-toast-close" aria-label="Dismiss">✕</button>
      </div>
      ${message ? `<div class="mobile-toast-body">${_esc(message)}</div>` : ''}
    `;
    document.body.appendChild(toast);

    const dismiss = () => {
      if (_activeToastTimeout) clearTimeout(_activeToastTimeout);
      toast.classList.add('is-dismissing');
      setTimeout(() => toast.remove(), 260);
    };
    toast.querySelector('.mobile-toast-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
    _activeToastTimeout = setTimeout(dismiss, 4000);
  }

  function showInvalidFormatToast({ title, subtitle, message, formatLabel }) {
    const existing = document.getElementById('mobile-invalid-toast');
    if (existing) existing.remove();
    if (_activeToastTimeout) clearTimeout(_activeToastTimeout);

    const toast = document.createElement('div');
    toast.className = 'mobile-toast';
    toast.id = 'mobile-invalid-toast';
    toast.setAttribute('role', 'alert');

    toast.innerHTML = `
      <div class="mobile-toast-header">
        <div class="mobile-toast-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <div class="mobile-toast-title-group">
          <div class="mobile-toast-title">${title || 'Invalid Format'}</div>
          ${subtitle ? `<div class="mobile-toast-subtitle">${subtitle}</div>` : ''}
        </div>
        <button type="button" class="mobile-toast-close" id="mobile-toast-close" aria-label="Dismiss">✕</button>
      </div>
      <div class="mobile-toast-body">${message}</div>
      <div class="mobile-toast-req-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4"></polyline>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
        <span>Please select: <strong>${formatLabel || 'the right format'}</strong></span>
      </div>
    `;

    document.body.appendChild(toast);

    function dismissToast() {
      if (_activeToastTimeout) clearTimeout(_activeToastTimeout);
      toast.classList.add('is-dismissing');
      setTimeout(() => toast.remove(), 260);
    }

    toast.querySelector('#mobile-toast-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast();
    });

    toast.addEventListener('click', dismissToast);

    _activeToastTimeout = setTimeout(dismissToast, 4800);
  }

  function triggerShakeAndHaptic() {
    try { navigator.vibrate?.([50, 70, 50]); } catch (_) {}
    if (dropzone) {
      dropzone.classList.remove('is-invalid-shake');
      void dropzone.offsetWidth; // trigger reflow
      dropzone.classList.add('is-invalid-shake');
      setTimeout(() => dropzone.classList.remove('is-invalid-shake'), 500);
    }
  }

  function isFileAccepted(file) {
    const allowed = _themeData.allowed_exts;
    if (!allowed || allowed.includes('*')) return true;

    const fname = (file.name || '').toLowerCase();
    for (const ext of allowed) {
      if (fname.endsWith(ext.toLowerCase())) return true;
    }
    const ext = '.' + fname.split('.').pop();
    if (allowed.includes(ext.toLowerCase())) return true;

    // Camera image fallback if tool allows camera
    if (_themeData.allows_camera && file.type && file.type.startsWith('image/')) {
      const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tiff', '.tif', '.svg', '.avif', '.heic', '.heif'];
      if (allowed.some((e) => imgExts.includes(e))) return true;
    }

    return false;
  }

  function _esc(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function _createItem(file) {
    let thumbnail = null;
    if (file.type.startsWith('image/')) {
      try {
        thumbnail = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
      } catch (_) {}
    }
    return {
      file,
      thumbnail,
      id: Math.random().toString(36).slice(2),
    };
  }

  dropzone?.addEventListener('click', (e) => {
    if (e.target.closest('.dz-jpg-card') || e.target.closest('.dz-jpg-add-btn') || e.target.closest('.dz-jpg-reorder-banner')) return;
    if (selectedItems.length > 0) return;
    armFilePick();
    galleryInput?.click();
  });

  document.getElementById('choose-gallery-btn')?.addEventListener('click', () => {
    armFilePick();
    galleryInput?.click();
  });

  const photoBtn = document.getElementById('take-photo-btn');
  photoBtn?.addEventListener('click', (e) => {
    if (_themeData.allows_camera === false) {
      e.preventDefault();
      e.stopPropagation();
      triggerShakeAndHaptic();
      const toolName = _themeData.tool_name || 'This tool';
      const formatLabel = _themeData.format_label || 'documents';
      showInvalidFormatToast({
        title: 'Invalid Format',
        subtitle: toolName,
        message: `Camera capture is not supported for ${toolName}.`,
        formatLabel: formatLabel,
      });
      return;
    }
    armFilePick();
    cameraInput?.click();
  });

  ['pointerdown', 'touchstart'].forEach((evt) => {
    dropzone?.addEventListener(evt, (e) => {
      if (e.target.closest('.dz-jpg-card') || e.target.closest('.dz-jpg-add-btn') || e.target.closest('.dz-jpg-reorder-banner')) return;
      if (selectedItems.length > 0) return;
      armFilePick();
    }, { passive: true });
    document.getElementById('choose-gallery-btn')?.addEventListener(evt, armFilePick, { passive: true });
    photoBtn?.addEventListener(evt, (e) => {
      if (_themeData.allows_camera === false) return;
      armFilePick();
    }, { passive: true });
  });

  galleryInput?.addEventListener('click', armFilePick);
  cameraInput?.addEventListener('click', (e) => {
    if (_themeData.allows_camera === false) {
      e.preventDefault();
      return;
    }
    armFilePick();
  });

  // ── Drag & Drop into Mobile Dropzone ─────────────────────────────────────
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-active');
  });
  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-active');
  });
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    if (e.dataTransfer?.files?.length) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  });

  async function addFiles(newFiles) {
    const valid = [];
    const invalid = [];

    for (const file of newFiles) {
      if (isFileAccepted(file)) {
        valid.push(file);
      } else {
        invalid.push(file);
      }
    }

    if (invalid.length > 0) {
      triggerShakeAndHaptic();
      const toolName = _themeData.tool_name || 'This tool';
      const formatLabel = _themeData.format_label || 'the required format';
      let detailMsg;
      if (invalid.length === 1) {
        detailMsg = `"${invalid[0].name}" has an invalid format and cannot be loaded into ${toolName}.`;
      } else {
        detailMsg = `${invalid.length} files have an invalid format and cannot be loaded into ${toolName}.`;
      }
      showInvalidFormatToast({
        title: 'Invalid Format',
        subtitle: toolName,
        message: detailMsg,
        formatLabel: formatLabel,
      });
    }

    if (valid.length > 0) {
      // Keep the session protected until the complete batch has finished
      // uploading, not just until the native picker closes.
      pickingFiles = true;
      const supportsMulti = _themeData.supports_multi !== false;
      if (!supportsMulti) {
        selectedItems = [];
      }

      for (const file of valid) {
        const item = await _createItem(file);
        selectedItems.push(item);
      }

      renderDropzoneStrip();
      pickingFiles = false;
      resumeSession();
    } else {
      resumeSession();
    }
  }

  galleryInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) addFiles(Array.from(e.target.files));
    else resumeSession();
    galleryInput.value = '';
  });

  cameraInput?.addEventListener('change', (e) => {
    if (e.target.files?.length) addFiles(Array.from(e.target.files));
    else resumeSession();
    cameraInput.value = '';
  });
  galleryInput?.addEventListener('cancel', () => { pickingFiles = false; resumeSession(); });
  cameraInput?.addEventListener('cancel', () => { pickingFiles = false; resumeSession(); });

  // ── Render Drop Zone Strip (Mirrors Desktop ToolCEO) ─────────────────────
  function renderDropzoneStrip() {
    const dz = document.getElementById('mobile-dropzone');
    const strip = document.getElementById('mobile-thumb-strip');
    const chips = document.getElementById('action-chips');
    const syncBar = document.getElementById('mobile-sync-bar');
    const syncText = document.getElementById('mobile-sync-text');
    const sendPanel = document.getElementById('mobile-send-panel');
    const sendCount = document.getElementById('mobile-send-count');
    const pendingItems = selectedItems.filter((item) => !item.sent);
    if (!dz || !strip) return;

    if (selectedItems.length === 0) {
      dz.classList.remove('dz-has-thumbs');
      if (syncBar) syncBar.style.display = 'none';
      strip.style.display = 'none';
      strip.innerHTML = '';
      if (chips) chips.style.display = 'flex';
      if (sendPanel) sendPanel.style.display = 'none';
      return;
    }

    dz.classList.add('dz-has-thumbs');
    if (chips) chips.style.display = 'none';
    if (syncBar) syncBar.style.display = (sendingFiles || selectedItems.some((item) => item.sent)) ? 'flex' : 'none';
    if (syncText) syncText.textContent = sendingFiles
      ? 'Sending files to desktop…'
      : 'Files sent to desktop — ready in workspace';
    if (sendPanel) sendPanel.style.display = pendingItems.length > 0 ? 'flex' : 'none';
    if (sendCount) sendCount.textContent = `${pendingItems.length} file${pendingItems.length === 1 ? '' : 's'} selected`;

    const color = _themeData.color || DEFAULT_COLOR;

    strip.innerHTML = '';
    strip.style.display = 'flex';

    selectedItems.forEach((item, idx) => {
      strip.appendChild(_buildCard(item, idx, color));
    });

    // Append "+ Add [Ext]" card button inside strip if multi-file is supported
    const supportsMulti = _themeData.supports_multi !== false;
    if (supportsMulti) {
      const ext = (_themeData.allowed_exts && _themeData.allowed_exts[0] !== '*')
        ? (_themeData.allowed_exts[0].replace('.', '').toUpperCase())
        : 'File';
      const addBtn = document.createElement('button');
      addBtn.className = 'dz-jpg-add-btn';
      addBtn.type = 'button';
      addBtn.title = `Add more ${ext} files`;
      addBtn.style.setProperty('--dz-color', color);
      addBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <line x1="10" y1="4" x2="10" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span>Add ${ext}</span>
      `;
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        armFilePick();
        galleryInput?.click();
      });
      strip.appendChild(addBtn);
    }
  }

  function _buildCard(item, idx, color) {
    const card = document.createElement('div');
    card.className = `dz-jpg-card${item.sent ? ' is-sent' : ''}`;
    card.dataset.idx = String(idx);
    card.style.setProperty('--dz-color', color);

    const shortName = item.file.name.length > 16
      ? item.file.name.slice(0, 13) + '…'
      : item.file.name;

    let thumbContent;
    if (item.thumbnail) {
      thumbContent = `<img class="dz-jpg-thumb-img" src="${item.thumbnail}" alt="${_esc(item.file.name)}" draggable="false"/>`;
    } else {
      const ext = item.file.name.split('.').pop() || 'file';
      const kb = (item.file.size / 1024).toFixed(0);
      thumbContent = `
        <div class="dz-jpg-thumb-doc">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span class="doc-ext">${_esc(ext.toUpperCase())}</span>
          <span class="doc-size">${kb} KB</span>
        </div>`;
    }

    const ordinalHTML = `<span class="dz-jpg-ordinal" aria-label="File ${idx + 1}">${idx + 1}</span>`;
    const removeButton = item.sent || sendingFiles
      ? ''
      : '<button class="dz-jpg-card-remove" type="button" aria-label="Remove">&#x2715;</button>';

    card.innerHTML = `
      ${ordinalHTML}
      <div class="dz-jpg-thumb-frame">
        ${thumbContent}
      </div>
      <span class="dz-jpg-card-name" title="${_esc(item.file.name)}">${_esc(shortName)}</span>
      ${removeButton}
    `;

    const removeBtn = card.querySelector('.dz-jpg-card-remove');
    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const curIdx = parseInt(card.dataset.idx, 10);
      const removeIdx = !isNaN(curIdx) && curIdx >= 0 ? curIdx : idx;
      const removedItem = selectedItems[removeIdx];
      if (!removedItem) return;

      selectedItems.splice(removeIdx, 1);

      // Notify desktop to remove this file from its queue
      if (sessionId && removedItem.serverId) {
        fetch(`/api/mobile/session/${sessionId}/remove`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_id: removedItem.serverId || '',
            filename: removedItem.serverName || removedItem.file.name,
          }),
        }).catch(() => {});
      }

      if (selectedItems.length === 0) {
        resetToEmptyDropzone();
        // Clear all from desktop too
        if (sessionId) {
          fetch(`/api/mobile/session/${sessionId}/clear`, { method: 'POST' }).catch(() => {});
        }
      } else {
        renderDropzoneStrip();
      }
    });

    return card;
  }

  // ── Background Upload to Desktop Session ─────────────────────────────────
  function sendSelectedFiles() {
    if (sendingFiles || !sessionId) return;
    const items = selectedItems.filter((item) => !item.sent);
    if (items.length === 0) return;
    uploadFilesToDesktop(items.map((item) => item.file), items);
  }

  document.getElementById('mobile-send-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    sendSelectedFiles();
  });

  function uploadFilesToDesktop(files, items = []) {
    if (!sessionId || !files || files.length === 0) return;
    sendingFiles = true;
    uploadingFiles = true;
    setConnectionBadge('sending');
    const sendBtn = document.getElementById('mobile-send-btn');
    const sendBtnText = sendBtn?.querySelector('span');
    if (sendBtn) sendBtn.disabled = true;
    if (sendBtnText) sendBtnText.textContent = 'Sending…';
    renderDropzoneStrip();
    // Re-arm the server-side picker lease after the native picker returns;
    // some browsers fire focus/visibility events before the input change.
    fetch(`/api/mobile/session/${sessionId}/picking`, { method: 'POST', keepalive: true }).catch(() => {});
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const progressReady = fetch(`/api/mobile/session/${sessionId}/transfer-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        progress: 0,
        received: 0,
        total: totalBytes,
        batch_id: batchId,
        reset: true,
      }),
    }).catch(() => null);

    const pContainer = document.getElementById('progress-container');
    const pBar = document.getElementById('progress-bar');
    if (pContainer) pContainer.style.display = 'block';
    if (pBar) pBar.style.width = '15%';

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/mobile/upload/${sessionId}`, true);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && pBar) {
          const progress = Math.round((e.loaded / e.total) * 100);
          pBar.style.width = `${progress}%`;
          fetch(`/api/mobile/session/${sessionId}/transfer-progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              progress,
              received: e.loaded,
              total: e.total,
              batch_id: batchId,
            }),
          }).catch(() => {});
        }
      };
      xhr.onload = () => {
        uploadingFiles = false;
        pickingFiles = false;
        sendingFiles = false;
        setConnectionBadge('connected');
        if (pBar) pBar.style.width = '100%';
        let sentCount = files.length;
        try {
          const result = JSON.parse(xhr.responseText || '{}');
          sentCount = (result.files || []).length || sentCount;
          (result.files || []).forEach((uploaded, index) => {
            const source = files[index];
            const item = items.find((candidate) => candidate.file === source);
            if (item) {
              item.serverId = uploaded.id || null;
              item.serverName = uploaded.name || source.name;
              item.sent = true;
            }
          });
        } catch (_) {}
        showMobileTransferNotification({
          title: 'Files Sent',
          message: `${sentCount} file${sentCount === 1 ? '' : 's'} sent to your desktop workspace.`,
          detail: 'Ready in ToolCEO',
        });
        if (sendBtn) sendBtn.disabled = false;
        if (sendBtnText) sendBtnText.textContent = 'Send to Desktop';
        renderDropzoneStrip();
        setTimeout(() => {
          if (pContainer) pContainer.style.display = 'none';
          if (pBar) pBar.style.width = '0%';
        }, 400);
        resumeSession();
      };
      xhr.onerror = () => {
        uploadingFiles = false;
        pickingFiles = false;
        sendingFiles = false;
        if (sendBtn) sendBtn.disabled = false;
        if (sendBtnText) sendBtnText.textContent = 'Send to Desktop';
        renderDropzoneStrip();
        if (pContainer) pContainer.style.display = 'none';
        resumeSession();
      };
      // Establish the new batch before the multipart request can emit
      // progress events. This prevents a previous batch from winning a race.
      progressReady.finally(() => xhr.send(formData));
    } catch (_) {
      uploadingFiles = false;
      pickingFiles = false;
      sendingFiles = false;
      if (sendBtn) sendBtn.disabled = false;
      if (sendBtnText) sendBtnText.textContent = 'Send to Desktop';
      renderDropzoneStrip();
      if (pContainer) pContainer.style.display = 'none';
      resumeSession();
    }
  }

  // ── Reset to Empty Dropzone ──────────────────────────────────────────────
  function resetToEmptyDropzone() {
    selectedItems = [];
    _activeJobId   = null;
    _jobDoneShown  = false;
    _wasShowingJob = false;
    sendingFiles = false;

    const dz = document.getElementById('mobile-dropzone');
    if (dz) {
      dz.classList.remove('dz-has-thumbs', 'dz-state-processing', 'dz-state-done');
    }

    const progressWrap = document.getElementById('job-progress-view');
    if (progressWrap) progressWrap.style.display = 'none';

    const doneWrap = document.getElementById('job-done-view');
    if (doneWrap) doneWrap.style.display = 'none';

    const syncBar = document.getElementById('mobile-sync-bar');
    if (syncBar) syncBar.style.display = 'none';

    const strip = document.getElementById('mobile-thumb-strip');
    if (strip) {
      strip.innerHTML = '';
      strip.style.display = 'none';
    }

    const chips = document.getElementById('action-chips');
    if (chips) chips.style.display = 'flex';

    const pContainer = document.getElementById('progress-container');
    if (pContainer) pContainer.style.display = 'none';

    const sendPanel = document.getElementById('mobile-send-panel');
    if (sendPanel) sendPanel.style.display = 'none';

    resumeSession();
  }

  function resetForMoreFiles() {
    resetToEmptyDropzone();
    _switchToView('form-view');
    if (sessionId) {
      fetch(`/api/mobile/session/${sessionId}/clear`, { method: 'POST' }).catch(() => {});
    }
  }

  document.getElementById('send-more-btn')?.addEventListener('click', resetForMoreFiles);
})();
