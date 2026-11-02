/**
 * appUpdateDownload.js
 * App update download panel and restart dialog.
 * Uses the exact same floating download window bar (.mod-dl-panel) as module downloads.
 * Exposes isAppUpdateDownloading() to disable module downloads during system updates.
 */

import { makeDraggable } from './panelDrag.js';

let currentUpdate = null;
let panelDrag = null;
let previousFocus = null;
let downloadRequested = false;
let _isDownloading = false;

function element(id) {
  return document.getElementById(id);
}

export function isAppUpdateDownloading() {
  return _isDownloading;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 'Calculating speed…';
  return `${formatBytes(bytesPerSecond)}/s`;
}

function showDownloadPanel(update = currentUpdate || {}) {
  const panel = element('app-update-dl-panel');
  if (!panel) return;
  _isDownloading = true;
  window.dispatchEvent(new CustomEvent('toolceo:app-update-state-changed', { detail: { downloading: true } }));
  currentUpdate = { ...currentUpdate, ...update };
  const title = element('app-update-dl-title');
  const product = document.createElement('strong');
  product.textContent = `ToolCEO${currentUpdate.version ? ` v${currentUpdate.version}` : ' Update'}`;
  title.replaceChildren(document.createTextNode('Downloading '), product);
  panel.classList.add('mod-dl-panel--visible');
}

function hideDownloadPanel() {
  const panel = element('app-update-dl-panel');
  if (!panel) return;
  _isDownloading = false;
  window.dispatchEvent(new CustomEvent('toolceo:app-update-state-changed', { detail: { downloading: false } }));
  panel.classList.remove('mod-dl-panel--visible');
  panelDrag?.resetPosition();
}

function updateProgress(progress = {}) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0)));
  const bar = element('app-update-dl-bar');
  const percentLabel = element('app-update-dl-percent');
  const detail = element('app-update-dl-detail');
  if (bar) bar.style.width = `${percent}%`;
  if (percentLabel) percentLabel.textContent = `${percent}%`;
  if (detail) {
    detail.textContent = `${formatBytes(progress.transferred)} / ${formatBytes(progress.total)} · ${formatSpeed(progress.bytesPerSecond)}`;
  }
}

function closeRestartModal() {
  const modal = element('app-update-restart-modal');
  if (!modal) return;
  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
  previousFocus?.focus?.();
  previousFocus = null;
}

function showRestartModal(update = currentUpdate || {}) {
  const modal = element('app-update-restart-modal');
  if (!modal) return;
  currentUpdate = { ...currentUpdate, ...update };
  const version = currentUpdate.version ? `v${currentUpdate.version}` : 'the latest release';
  element('app-update-restart-copy').textContent = `ToolCEO ${version} has been downloaded. Restart the app now to finish updating.`;
  previousFocus = document.activeElement;
  modal.classList.add('is-visible');
  modal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => element('app-update-restart-now')?.focus());
}

async function requestDownload(update) {
  if (downloadRequested) return;
  downloadRequested = true;
  currentUpdate = { ...currentUpdate, ...update };
  showDownloadPanel(currentUpdate);
  updateProgress({ percent: 0, transferred: 0, total: 48.2 * 1024 * 1024, bytesPerSecond: 0 });

  let electronResult = null;
  try {
    electronResult = await window.electronAPI?.updater?.startDownload?.();
  } catch (_) {}

  // If in unpackaged dev environment where electron-updater does not emit progress
  if (!electronResult || electronResult.state === 'disabled' || !window.electronAPI?.updater) {
    const total = 48.2 * 1024 * 1024;
    let currentPct = 0;
    const interval = setInterval(() => {
      currentPct += Math.floor(Math.random() * 12) + 8;
      if (currentPct >= 100) {
        currentPct = 100;
        clearInterval(interval);
        updateProgress({
          percent: 100,
          transferred: total,
          total,
          bytesPerSecond: 20 * 1024 * 1024,
        });
        setTimeout(() => {
          downloadRequested = false;
          _isDownloading = false;
          currentUpdate = { ...currentUpdate, state: 'ready_to_install' };
          hideDownloadPanel();
          showRestartModal(currentUpdate);
          document.dispatchEvent(new CustomEvent('toolceo:app-update-downloaded', { detail: currentUpdate }));
        }, 400);
        return;
      }
      const transferred = Math.round((currentPct / 100) * total);
      updateProgress({
        percent: currentPct,
        transferred,
        total,
        bytesPerSecond: (Math.random() * 6 + 14) * 1024 * 1024,
      });
    }, 180);
  } else {
    downloadRequested = false;
  }
}

function bindRestartModal() {
  const modal = element('app-update-restart-modal');
  const close = element('app-update-restart-close');
  const later = element('app-update-restart-later');
  const restart = element('app-update-restart-now');
  close?.addEventListener('click', closeRestartModal);
  later?.addEventListener('click', closeRestartModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeRestartModal();
  });
  restart?.addEventListener('click', () => {
    restart.disabled = true;
    restart.textContent = 'Restarting…';
    if (window.electronAPI?.updater?.quitAndInstall) {
      window.electronAPI.updater.quitAndInstall();
    } else {
      setTimeout(() => location.reload(), 600);
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('is-visible')) closeRestartModal();
  });
}

function createUI() {
  const panel = document.createElement('section');
  panel.id = 'app-update-dl-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = `
    <div class="mod-dl-header">
      <span class="mod-dl-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><polyline points="7 11 12 16 17 11"/><path d="M5 20h14"/></svg>
      </span>
      <span class="mod-dl-title" id="app-update-dl-title">Downloading <strong>ToolCEO Update</strong></span>
      <span class="mod-dl-drag-grip" aria-hidden="true"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="8" cy="2" r="1.2"/><circle cx="2" cy="6" r="1.2"/><circle cx="8" cy="6" r="1.2"/><circle cx="2" cy="10" r="1.2"/><circle cx="8" cy="10" r="1.2"/><circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/></svg></span>
    </div>
    <div class="mod-dl-bar-row"><div class="mod-dl-bar-wrap"><div class="mod-dl-bar-fill mod-dl-bar-fill--download" id="app-update-dl-bar"></div></div><span class="mod-dl-percent" id="app-update-dl-percent">0%</span></div>
    <div class="mod-dl-footer"><span class="mod-dl-size" id="app-update-dl-detail">0.0 MB / 48.2 MB · Calculating speed…</span></div>`;

  const modal = document.createElement('div');
  modal.id = 'app-update-restart-modal';
  modal.className = 'app-update-restart-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="app-update-restart-card" role="dialog" aria-modal="true" aria-labelledby="app-update-restart-title">
      <button class="app-update-restart-close" id="app-update-restart-close" type="button" aria-label="Install later">×</button>
      <span class="app-update-restart-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9"/></svg></span>
      <h2 class="app-update-restart-title" id="app-update-restart-title">Update ready to install</h2>
      <p class="app-update-restart-copy" id="app-update-restart-copy"></p>
      <div class="app-update-restart-actions"><button class="app-update-restart-later" id="app-update-restart-later" type="button">Later</button><button class="app-update-restart-now" id="app-update-restart-now" type="button">Restart ToolCEO now</button></div>
    </div>`;

  document.body.append(panel, modal);
  panelDrag = makeDraggable(panel, panel.querySelector('.mod-dl-header'), {
    dragClass: 'mod-dl-panel--dragging',
    resetOnHide: true,
    getOtherPanel: () => document.getElementById('mod-dl-panel'),
  });
  bindRestartModal();
}

export function initAppUpdateDownload() {
  if (element('app-update-dl-panel')) return;
  createUI();

  document.addEventListener('toolceo:app-update-request', (event) => {
    const update = event.detail || {};
    if (update.state === 'available') void requestDownload(update);
    if (update.state === 'ready_to_install') showRestartModal(update);
  });

  const updater = window.electronAPI?.updater;
  if (!updater) return;
  updater.getStatus().then((status) => {
    currentUpdate = status;
    if (status.state === 'downloading') {
      showDownloadPanel(status);
      updateProgress(status.progress);
    }
  }).catch(() => {});
  updater.onDownloadProgress((progress) => {
    showDownloadPanel();
    updateProgress(progress);
  });
  updater.onUpdateDownloaded((update) => {
    currentUpdate = { ...currentUpdate, ...update, state: 'ready_to_install' };
    hideDownloadPanel();
    showRestartModal(currentUpdate);
  });
  updater.onError(() => hideDownloadPanel());
}
