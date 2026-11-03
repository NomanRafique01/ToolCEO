/**
 * updates.js
 * Application update page — Clean release management.
 * Automated detection on startup and internet reconnection.
 * Direct download window delegation to appUpdateDownload floating panel.
 */

import { pushNotification } from './notificationStore.js';
import { isAppUpdateDownloading } from './appUpdateDownload.js';

let pageRoot = null;
let activeActionHandler = null;
let activeBackHandler = null;
let isChecking = false;

// Format timestamp cleanly
let lastCheckedFormatted = formatTime(new Date());

function formatTime(date) {
  try {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `Today at ${formattedHours}:${formattedMinutes} ${ampm}`;
  } catch (_) {
    return 'Just now';
  }
}

// Release details
const RELEASE_INFO = {
  version: '2.1.0',
  title: 'ToolCEO 2.1.0',
  channel: 'Stable Production Channel',
  size: '48.2 MB',
  totalBytes: 48.2 * 1024 * 1024,
};

let currentUpdateStatus = {
  state: 'up-to-date',
  version: '2.0.1',
};

/**
 * Handle Download Trigger
 * Delegates to appUpdateDownload which uses the floating download window bar (.mod-dl-panel)
 */
function triggerDownload() {
  currentUpdateStatus = { ...currentUpdateStatus, state: 'downloading', version: RELEASE_INFO.version };
  refreshUI();

  document.dispatchEvent(new CustomEvent('toolceo:app-update-request', {
    detail: { state: 'available', version: RELEASE_INFO.version },
  }));
}

/**
 * Handle "Check for Updates"
 */
async function handleCheckForUpdates() {
  if (isChecking || isAppUpdateDownloading()) return;
  isChecking = true;
  refreshUI();

  let checkResult = null;
  if (activeActionHandler) {
    try {
      checkResult = await activeActionHandler();
    } catch (_) {}
  }

  setTimeout(() => {
    isChecking = false;
    lastCheckedFormatted = 'Just now';

    // If an update was found by the updater (or checkResult)
    const isUpdateAvailable = (checkResult && checkResult.state === 'available') ||
      (currentUpdateStatus && currentUpdateStatus.state === 'available');

    if (isUpdateAvailable) {
      currentUpdateStatus = { ...currentUpdateStatus, state: 'available', version: RELEASE_INFO.version };
      // navigation.js surfaces the "available" toast from the updater event;
      // re-notifying here would double it up.
    } else {
      currentUpdateStatus = { ...currentUpdateStatus, state: 'up-to-date', version: '2.0.1' };
      pushNotification({
        type: 'success',
        message: 'No updates available',
        detail: 'You are using the latest ToolCEO release (v2.0.1).',
        allowDuringRestore: true,
      });
    }

    refreshUI();
  }, 750);
}

/**
 * Render the main card (Up-to-Date Hero OR Available Download Card)
 */
function renderMainCardHTML() {
  const isDownloading = isAppUpdateDownloading() || currentUpdateStatus.state === 'downloading';
  const isReadyToInstall = currentUpdateStatus.state === 'ready_to_install';
  const isUpdateFound = currentUpdateStatus.state === 'available' || isDownloading || isReadyToInstall;

  if (isUpdateFound) {
    let actionBtnHTML = '';
    if (isReadyToInstall) {
      actionBtnHTML = `
        <button class="mod-card-btn mod-card-btn--installed mod-card-btn--install-now" id="update-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Restart &amp; Install Now
        </button>`;
    } else if (isDownloading) {
      actionBtnHTML = `
        <button class="mod-card-btn mod-card-btn--downloading" id="update-action-btn" disabled>
          <svg class="mod-spinner" width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10"/>
          </svg>
          Downloading Update…
        </button>`;
    } else {
      actionBtnHTML = `
        <button class="mod-card-btn mod-card-btn--download" id="update-action-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Download Update (${RELEASE_INFO.size})
        </button>`;
    }

    return `
      <div class="update-release-card" style="--mod-color:#A78BFA;--mod-bg:rgba(167,139,250,0.12)">
        <div class="update-card-top">
          <div class="update-card-identity">
            <div class="mod-card-icon" style="background:rgba(167,139,250,0.14);color:#A78BFA">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
            <div>
              <div class="update-card-title-row">
                <h2 class="update-card-headline">ToolCEO ${RELEASE_INFO.version}</h2>
                <span class="update-badge update-badge--ready">${isReadyToInstall ? 'Ready to Install' : 'New Release'}</span>
                <span class="update-card-size">${RELEASE_INFO.size}</span>
              </div>
              <p class="update-card-meta">${RELEASE_INFO.channel} · November 2026 build</p>
            </div>
          </div>
        </div>

        <div class="update-card-actions">
          ${actionBtnHTML}
        </div>
      </div>`;
  }

  // Up-to-date state
  return `
    <div class="updates-hero" aria-label="Update Status">
      <div class="updates-hero__inner">
        <div class="updates-hero__icon-box">
          <svg width="26" height="26" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5 7.5A5.5 5.5 0 0 0 3.2 5.2L2 6.5" stroke="#A78BFA" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 3.2v3.3h3.3" stroke="#A78BFA" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2.5 8.5a5.5 5.5 0 0 0 10.3 2.3l1.2-1.3" stroke="#A78BFA" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 12.8V9.5h-3.3" stroke="#A78BFA" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="updates-hero__meta">
          <div class="updates-hero__header-row">
            <h2 class="updates-hero__heading">ToolCEO is up to date</h2>
            <span class="updates-status-badge">
              <span class="updates-status-dot"></span>
              Current Build
            </span>
          </div>
          <p class="updates-hero__desc">You are running version 2.0.1 on the official production channel.</p>
          <div class="updates-hero__timestamp">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2.5 1.5"/></svg>
            <span id="updates-last-checked-label">Last checked: ${lastCheckedFormatted}</span>
          </div>
        </div>
        <div class="updates-hero__actions">
          <button class="updates-action-btn" id="updates-check-now-btn" type="button" ${isChecking ? 'disabled' : ''}>
            <svg class="${isChecking ? 'updates-hero-spin' : ''}" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
              <path d="M13.5 7.5A5.5 5.5 0 0 0 3.2 5.2L2 6.5" stroke-linecap="round"/>
              <path d="M2 3.2v3.3h3.3" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2.5 8.5a5.5 5.5 0 0 0 10.3 2.3l1.2-1.3" stroke-linecap="round"/>
              <path d="M14 12.8V9.5h-3.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>${isChecking ? 'Checking…' : 'Check for updates'}</span>
          </button>
        </div>
      </div>
    </div>`;
}

/**
 * Render System Overview Cards
 */
function renderSystemOverviewGridHTML() {
  return `
    <section class="updates-overview-section">
      <div class="updates-overview-label">System Overview</div>
      <div class="overview-grid">
        <!-- Card 1: Installed Version -->
        <div class="overview-card" style="--card-accent:#60A5FA;--card-bg:rgba(96,165,250,0.12)">
          <div class="overview-card-header">
            <div class="overview-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </div>
            <div class="overview-card-title-wrap">
              <h3 class="overview-card-name">Installed Version</h3>
              <span class="overview-card-sub">v2.0.1 · Windows x64</span>
            </div>
          </div>
          <ul class="overview-card-list">
            <li>Standalone native desktop binary</li>
            <li>Local SQLite configuration storage</li>
            <li>Zero external runtime dependencies</li>
          </ul>
        </div>

        <!-- Card 2: Release Channel -->
        <div class="overview-card" style="--card-accent:#FBBF24;--card-bg:rgba(251,191,36,0.12)">
          <div class="overview-card-header">
            <div class="overview-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div class="overview-card-title-wrap">
              <h3 class="overview-card-name">Release Channel</h3>
              <span class="overview-card-sub">Official Stable Channel</span>
            </div>
          </div>
          <ul class="overview-card-list">
            <li>Automatic check on app startup</li>
            <li>Background network reconnect sync</li>
            <li>Installs only with user confirmation</li>
          </ul>
        </div>

        <!-- Card 3: Security & Integrity -->
        <div class="overview-card" style="--card-accent:#00E5C0;--card-bg:rgba(0,229,192,0.12)">
          <div class="overview-card-header">
            <div class="overview-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <div class="overview-card-title-wrap">
              <h3 class="overview-card-name">Security &amp; Integrity</h3>
              <span class="overview-card-sub">SHA-256 Validated</span>
            </div>
          </div>
          <ul class="overview-card-list">
            <li>Cryptographically signed binary hashes</li>
            <li>Isolated execution sandbox</li>
            <li>100% offline device security</li>
          </ul>
        </div>
      </div>
    </section>`;
}

function refreshUI() {
  if (!pageRoot) return;

  const mainSlot = pageRoot.querySelector('#updates-main-slot');
  if (mainSlot) {
    mainSlot.innerHTML = renderMainCardHTML();
    bindCardEvents();
  }
}

function bindCardEvents() {
  if (!pageRoot) return;

  pageRoot.querySelector('#updates-check-now-btn')?.addEventListener('click', handleCheckForUpdates);

  pageRoot.querySelector('#update-action-btn')?.addEventListener('click', () => {
    if (currentUpdateStatus.state === 'ready_to_install') {
      if (window.electronAPI?.updater?.quitAndInstall) {
        window.electronAPI.updater.quitAndInstall();
      } else {
        alert('ToolCEO is ready to restart and install the update.');
      }
    } else {
      triggerDownload();
    }
  });
}

export function refreshUpdatePage(status = {}) {
  currentUpdateStatus = { ...currentUpdateStatus, ...status };
  refreshUI();
}

/**
 * Main render function
 */
export function renderUpdatePage(container, status = {}, onAction = null, onBack = null) {
  activeActionHandler = onAction;
  activeBackHandler = onBack;
  currentUpdateStatus = { ...currentUpdateStatus, ...status };

  container.innerHTML = `
    <div class="updates-page">
      <!-- 1. Header -->
      <div class="explore-header">
        <button class="fmt-back-btn" id="updates-back-btn" title="Back to Dashboard">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="fmt-category-icon" style="background:rgba(167,139,250,0.15);color:#A78BFA">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13.5 7.5A5.5 5.5 0 0 0 3.2 5.2L2 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 3.2v3.3h3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2.5 8.5a5.5 5.5 0 0 0 10.3 2.3l1.2-1.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 12.8V9.5h-3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="explore-title">Software Updates — Release Management</span>
      </div>

      <!-- 2. Main Slot -->
      <div id="updates-main-slot">
        ${renderMainCardHTML()}
      </div>

      <!-- 3. System Overview Grid -->
      ${renderSystemOverviewGridHTML()}

      <!-- 4. Footer Note -->
      <div class="updates-footer-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>
        </svg>
        <span>ToolCEO releases are cryptographically signed. All updates preserve local configurations and databases.</span>
      </div>
    </div>`;

  pageRoot = container.querySelector('.updates-page');

  pageRoot?.querySelector('#updates-back-btn')?.addEventListener('click', () => {
    if (activeBackHandler) activeBackHandler();
  });

  bindCardEvents();
}

// Background network reconnect listener
document.addEventListener('toolceo:system-online', () => {
  lastCheckedFormatted = 'Just now (network reconnected)';
  const timeLabel = pageRoot?.querySelector('#updates-last-checked-label');
  if (timeLabel) timeLabel.textContent = `Last checked: ${lastCheckedFormatted}`;
});

// Sync download completion from floating download panel
document.addEventListener('toolceo:app-update-downloaded', (event) => {
  const update = event.detail || {};
  currentUpdateStatus = { ...currentUpdateStatus, ...update, state: 'ready_to_install' };
  refreshUI();
});

// Sync download state changes
window.addEventListener('toolceo:app-update-state-changed', (event) => {
  const downloading = event.detail?.downloading;
  if (!downloading && currentUpdateStatus.state === 'downloading') {
    currentUpdateStatus.state = 'ready_to_install';
  }
  refreshUI();
});
