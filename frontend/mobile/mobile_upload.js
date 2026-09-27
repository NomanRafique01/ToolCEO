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
  let selectedFiles   = [];
  let sessionEnded    = false;
  let statusPollTimer = null;
  let pickingFiles    = false;

  // Job-mirror state
  let _activeJobId   = null;   // jobId currently mirrored
  let _wasShowingJob = false;  // were we showing a job view?
  let _jobDoneShown  = false;  // guard: don't re-trigger done view

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
      if (theme.mainText) mainEl.textContent = theme.mainText;
      else if (theme.tool_name) mainEl.textContent = `Select File to ${theme.tool_name}`;
    }

    const subEl = document.getElementById('drop-sub-text');
    if (subEl && theme.subText) subEl.textContent = theme.subText;

    if (isSafeIcon(theme.icon)) {
      const headerBox = document.getElementById('tool-icon-box');
      if (headerBox) headerBox.innerHTML = scaledIcon(theme.icon, color, 22, 'tool-header-icon');

      const dropSlot = document.getElementById('drop-icon-slot');
      if (dropSlot) dropSlot.innerHTML = scaledIcon(theme.icon, color, 48, 'drop-icon');
    }
    _themeData = { ..._themeData, ...theme };

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
    if (cameraBtn) {
      if (theme.allows_camera === false) {
        cameraBtn.classList.add('is-camera-dimmed');
        cameraBtn.title = 'Camera capture not supported for this tool';
      } else {
        cameraBtn.classList.remove('is-camera-dimmed');
        cameraBtn.title = '';
      }
    }
  }

  let _themeData = readEmbeddedTheme() || {};
  applyTheme(_themeData);

  let heartbeatTimer = null;

  function sendDisconnect() {
    if (!sessionId || sessionEnded || pickingFiles) return;
    const url = `/api/mobile/session/${sessionId}/disconnect`;
    let sent = false;
    try {
      sent = navigator.sendBeacon(url, '');
    } catch (_) {}
    if (!sent) {
      fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    }
  }

  function resumeSession() {
    pickingFiles = false;
    if (!sessionId || sessionEnded) return;
    fetch(`/api/mobile/session/${sessionId}/ping`, { method: 'POST', keepalive: true }).catch(() => {});
  }

  function armFilePick() {
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

  // File pickers hide this tab — tell the desktop first, then skip disconnect.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resumeSession();
      return;
    }
    if (!pickingFiles) sendDisconnect();
  });
  window.addEventListener('pageshow', resumeSession);
  window.addEventListener('focus', resumeSession);

  window.addEventListener('pagehide', () => {
    if (pickingFiles) return;
    sendDisconnect();
  });
  window.addEventListener('beforeunload', () => {
    if (pickingFiles) return;
    sendDisconnect();
  });

  // ── View switcher ────────────────────────────────────────────────────────

  const ALL_VIEWS = [
    'form-view', 'success-view', 'disconnected-view',
    'job-progress-view', 'job-done-view',
  ];

  function _switchToView(viewId) {
    ALL_VIEWS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = (id === viewId) ? (id === 'form-view' ? '' : 'flex') : 'none';
    });
  }

  // ── Job-mirror helpers ───────────────────────────────────────────────────

  const RING_CIRCUMFERENCE = 2 * Math.PI * 34; // ≈ 213.63

  function _updateRing(pct) {
    const fill  = document.getElementById('job-ring-fill');
    const pctEl = document.getElementById('job-ring-pct');
    if (fill) {
      const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, pct)) / 100);
      fill.style.strokeDashoffset = String(offset);
    }
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  }

  function showJobProgress(pct, filename) {
    _wasShowingJob = true;
    const label = document.getElementById('job-progress-label');
    const fnEl  = document.getElementById('job-progress-filename');
    if (label) label.textContent = pct < 100 ? 'Processing on Desktop…' : 'Finishing up…';
    if (fnEl)  fnEl.textContent  = filename || '';
    _updateRing(pct);
    _switchToView('job-progress-view');
  }

  function showJobDone(jobId, filename) {
    if (_jobDoneShown && _activeJobId === jobId) return;
    _activeJobId  = jobId;
    _wasShowingJob = true;
    _jobDoneShown  = true;

    const dlBtn = document.getElementById('job-download-btn');
    if (dlBtn) {
      dlBtn.href     = `/api/download/${jobId}`;
      dlBtn.download = filename || 'download';
    }
    const fnEl = document.getElementById('job-done-filename');
    if (fnEl) fnEl.textContent = filename || '';
    _switchToView('job-done-view');
  }

  function showJobCancelled(reason) {
    _activeJobId   = null;
    _wasShowingJob = false;
    _jobDoneShown  = false;
    const descEl = document.getElementById('disconnected-desc');
    if (descEl) {
      descEl.innerHTML = reason === 'phone'
        ? 'You cancelled the operation.<br>Files are still ready on desktop.'
        : 'The desktop cancelled the operation.<br>You can send more files if needed.';
    }
    _switchToView('disconnected-view');
  }

  function showDisconnectedScreen(reason) {
    sessionEnded = true;
    pickingFiles = false;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
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

  // ── Status polling (handles session state + job mirror) ──────────────────

  if (sessionId) {
    statusPollTimer = setInterval(async () => {
      if (sessionEnded) { clearInterval(statusPollTimer); return; }
      try {
        const res = await fetch(`/api/mobile/session/${sessionId}/status`);
        if (res.status === 404) {
          clearInterval(statusPollTimer);
          showDisconnectedScreen('cancelled');
          return;
        }
        const data = await res.json();

        if (data.status === 'cancelled') {
          clearInterval(statusPollTimer);
          showDisconnectedScreen('cancelled');
          return;
        }

        // ── Job mirror ────────────────────────────────────────────────────
        const job = data.job;
        if (job) {
          _activeJobId = job.job_id || _activeJobId;
          if (job.cancelled || job.state === 'error') {
            showJobCancelled('desktop');
          } else if (job.state === 'done') {
            showJobDone(job.job_id, job.filename);
          } else {
            showJobProgress(job.progress || 0, job.filename);
          }
        } else if (_wasShowingJob) {
          _wasShowingJob = false;
          if (!_jobDoneShown) {
            _activeJobId = null;
            const sv = document.getElementById('success-view');
            if (sv && sv.style.display === 'none') _switchToView('success-view');
          }
        }
      } catch (_) {}
    }, 2000);
  }

  // ── Cancel button on phone ───────────────────────────────────────────────

  document.getElementById('job-cancel-btn')?.addEventListener('click', () => {
    const jid = _activeJobId;
    if (!jid) return;
    fetch(`/api/cancel/${jid}`, { method: 'POST' }).catch(() => {});
    _activeJobId  = null;
    _jobDoneShown = false;
    showJobCancelled('phone');
  });

  // ── "Send More" from done view ───────────────────────────────────────────

  document.getElementById('job-new-btn')?.addEventListener('click', () => {
    _activeJobId   = null;
    _wasShowingJob = false;
    _jobDoneShown  = false;
    resetForMoreFiles();
  });

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
      <div class="mobile-toast-progress">
        <div class="mobile-toast-progress-fill"></div>
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

  dropzone?.addEventListener('click', () => {
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
    dropzone?.addEventListener(evt, armFilePick, { passive: true });
    document.getElementById('choose-gallery-btn')?.addEventListener(evt, armFilePick, { passive: true });
    photoBtn?.addEventListener(evt, (e) => {
      if (_themeData.allows_camera === false) {
        // Prevent default arming on touch if camera is not allowed
        return;
      }
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

  // ── Drag & Drop on Mobile/Tablet Dropzone ─────────────────────────────────
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

  function addFiles(newFiles) {
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
        const rejected = invalid[0].name;
        detailMsg = `"${rejected}" has an invalid format and cannot be loaded into ${toolName}.`;
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
      for (const file of valid) selectedFiles.push(file);
      renderPreviews();
    }
  }

  galleryInput?.addEventListener('change', (e) => {
    pickingFiles = false;
    resumeSession();
    if (e.target.files?.length) addFiles(Array.from(e.target.files));
    galleryInput.value = '';
  });

  cameraInput?.addEventListener('change', (e) => {
    pickingFiles = false;
    resumeSession();
    if (e.target.files?.length) addFiles(Array.from(e.target.files));
    cameraInput.value = '';
  });
  galleryInput?.addEventListener('cancel', () => { pickingFiles = false; resumeSession(); });
  cameraInput?.addEventListener('cancel', () => { pickingFiles = false; resumeSession(); });

  function renderPreviews() {
    if (!previewGrid || !previewSection || !sendBtn || !sendBtnText || !fileCount) return;
    previewGrid.innerHTML = '';
    if (selectedFiles.length === 0) {
      previewSection.style.display = 'none';
      sendBtn.disabled = true;
      sendBtnText.textContent = 'Send to Desktop';
      return;
    }

    previewSection.style.display = 'block';
    fileCount.textContent = `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`;
    sendBtn.disabled = false;
    sendBtnText.textContent = `Send ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''} to PC`;

    selectedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'preview-item';

      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        item.appendChild(img);
      } else {
        const doc = document.createElement('div');
        doc.className = 'preview-item-doc';
        const strong = document.createElement('strong');
        strong.textContent = file.name.slice(0, 16);
        const span = document.createElement('span');
        span.textContent = `${(file.size / 1024).toFixed(0)} KB`;
        doc.appendChild(strong);
        doc.appendChild(span);
        item.appendChild(doc);
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        selectedFiles.splice(index, 1);
        renderPreviews();
      };
      item.appendChild(removeBtn);
      previewGrid.appendChild(item);
    });
  }

  sendBtn?.addEventListener('click', async () => {
    if (selectedFiles.length === 0 || !sessionId) return;

    sendBtn.disabled = true;
    sendBtnText.textContent = 'Sending...';
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressBar) progressBar.style.width = '10%';

    const formData = new FormData();
    for (const file of selectedFiles) formData.append('files', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/mobile/upload/${sessionId}`, true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && progressBar) {
          progressBar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (progressBar) progressBar.style.width = '100%';
          resumeSession();
          setTimeout(() => {
            if (formView) formView.style.display = 'none';
            if (successView) successView.style.display = 'flex';
            sendBtn.disabled = false;
            if (progressContainer) progressContainer.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
          }, 300);
        } else {
          alert('Upload failed. Please try again.');
          sendBtn.disabled = false;
          sendBtnText.textContent = 'Retry Sending';
          if (progressContainer) progressContainer.style.display = 'none';
        }
      };

      xhr.onerror = () => {
        alert('Network error. Ensure your phone and PC are connected to the same Wi-Fi.');
        sendBtn.disabled = false;
        sendBtnText.textContent = 'Retry Sending';
        if (progressContainer) progressContainer.style.display = 'none';
      };

      xhr.send(formData);
    } catch (err) {
      alert('Error: ' + err.message);
      sendBtn.disabled = false;
      sendBtnText.textContent = 'Retry Sending';
      if (progressContainer) progressContainer.style.display = 'none';
    }
  });

  function resetForMoreFiles() {
    selectedFiles = [];
    renderPreviews();
    if (successView) successView.style.display = 'none';
    if (formView) formView.style.display = '';
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    resumeSession();
  }

  document.getElementById('send-more-btn')?.addEventListener('click', resetForMoreFiles);
})();
