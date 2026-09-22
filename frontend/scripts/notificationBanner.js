/**
 * notificationBanner.js
 *
 * Renders and manages the persistent notification banner strip.
 * Features a premium frosted glass HUD bar directly below topbar with CSS animations.
 *
 * Zero-Notification behavior:
 *   - When 0 notifications exist, banner is completely hidden (display: none).
 *   - When 1+ notifications arrive, banner slides down cleanly from top.
 *   - When all notifications expire/dismiss, waits 400ms delay, then slides up & hides.
 */

import {
  subscribe, getAll, getUnreadCount,
  dismissAll, dismissOne, removeHistoryItem, markAllRead,
} from './notificationStore.js';

// ─── RELATIVE TIME ─────────────────────────────────────────────────────────────

function relTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)   return 'just now';
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── ICONS ─────────────────────────────────────────────────────────────────────

const TYPE_META = {
  success: {
    color: '#00E5C0',
    icon: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2.5 2.5 3.5-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  error: {
    color: '#F87171',
    icon: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
  },
  warning: {
    color: '#FBBF24',
    icon: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="8" y1="6.5" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.7" fill="currentColor"/></svg>`
  },
  info: {
    color: '#38BDF8',
    icon: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="7.5" x2="8" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5" r="0.8" fill="currentColor"/></svg>`
  },
  progress: {
    color: '#38BDF8',
    icon: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/><path d="M8 4.5v3.5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
};

function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── MODAL ─────────────────────────────────────────────────────────────────────

function _buildModal() {
  const existing = document.getElementById('notif-modal-overlay');
  if (existing) { existing.remove(); return; }

  markAllRead();

  const all = getAll();
  const overlay = document.createElement('div');
  overlay.id = 'notif-modal-overlay';
  overlay.className = 'notif-modal-overlay';

  overlay.innerHTML = `
    <div class="notif-modal" role="dialog" aria-modal="true" aria-label="Notification History">
      <div class="notif-modal-header">
        <span class="notif-modal-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v3L2 11.5h12L12.5 9V6c0-2.5-2-4.5-4.5-4.5Z" stroke="#00E5C0" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M6.5 12a1.5 1.5 0 0 0 3 0" stroke="#00E5C0" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Notification History
        </span>
        <button id="notif-modal-close" class="notif-modal-close" title="Close">&times;</button>
      </div>
      <div class="notif-modal-body">
        ${all.length === 0
          ? `<p class="notif-modal-empty">No notifications yet.</p>`
          : all.map((n) => {
              const m = TYPE_META[n.type] || TYPE_META.info;
              return `
                <div class="notif-modal-row" data-id="${_escHtml(n.id)}">
                  <span class="notif-modal-row-icon" style="color:${m.color}">${m.icon}</span>
                  <div class="notif-modal-row-body">
                    <span class="notif-modal-row-msg">${_escHtml(n.message)}</span>
                    ${n.detail ? `<span class="notif-modal-row-detail">${_escHtml(n.detail)}</span>` : ''}
                  </div>
                  <span class="notif-modal-row-time">${relTime(n.timestamp)}</span>
                  <button class="notif-modal-row-x" data-dismiss="${_escHtml(n.id)}" title="Dismiss">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                      <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>`;
            }).join('')
        }
      </div>
      <div class="notif-modal-footer">
        <button id="notif-modal-dismiss-all" class="notif-modal-dismiss-all">Clear all</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector('#notif-modal-close').onclick = () => overlay.remove();

  const clearBtn = overlay.querySelector('#notif-modal-dismiss-all');
  if (clearBtn) {
    clearBtn.onclick = () => { dismissAll(); overlay.remove(); };
  }

  overlay.querySelectorAll('[data-dismiss]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.dismiss;
      removeHistoryItem(id);
      const row = overlay.querySelector(`[data-id="${id}"]`);
      if (row) row.remove();
      const body = overlay.querySelector('.notif-modal-body');
      if (body && !body.querySelector('.notif-modal-row')) {
        body.innerHTML = `<p class="notif-modal-empty">No notifications yet.</p>`;
      }
    });
  });
}

// ─── BANNER STATE & QUEUE ───────────────────────────────────────────────────

let _bannerEl = null;
let _activeItem = null;
let _activeStartTime = 0;
let _displayQueue = [];
let _activeTimer = null;
let _closeTimer = null;
let _isDismissing = false;
let _shownIds = new Set();
let _isBannerVisible = false;

function _updateActivePillDOM(item) {
  if (!_bannerEl || !_activeItem || _activeItem.id !== item.id) return;
  _activeItem = item;
  const msgEl = _bannerEl.querySelector('.nb-pill-msg');
  if (msgEl) msgEl.textContent = item.message || '';
  const timeEl = _bannerEl.querySelector('.nb-pill-time');
  if (timeEl && item.type !== 'progress') timeEl.textContent = relTime(item.timestamp);
}

function _renderBannerWithActiveItem() {
  if (!_bannerEl || !_activeItem) return;

  const unread = getUnreadCount();
  const n = _activeItem;
  const m = TYPE_META[n.type] || TYPE_META.info;
  const isProgress = n.type === 'progress';
  const isAutoDismiss = n.autoDismiss === true;

  if (_closeTimer) {
    clearTimeout(_closeTimer);
    _closeTimer = null;
  }

  document.body.classList.add('has-active-banner');
  _bannerEl.classList.remove('nb-hidden', 'nb-slide-up');
  if (!_isBannerVisible) {
    _bannerEl.classList.add('nb-slide-down');
    _isBannerVisible = true;
  }

  // Strictly ONE pill rendered in the banner track (two or three never appear together)
  const pillHtml = `
    <span class="nb-pill ${isProgress ? 'nb-pill--progress' : ''}" style="--pill-color:${m.color}" data-id="${_escHtml(n.id)}" data-auto-dismiss="${isAutoDismiss ? 'true' : 'false'}" title="${_escHtml(n.message)}">
      <span class="nb-pill-icon" style="color:${m.color}">${m.icon}</span>
      <span class="nb-pill-msg">${_escHtml(n.message)}</span>
      ${!isProgress ? `<span class="nb-pill-time">${relTime(n.timestamp)}</span>` : ''}
      <button class="nb-pill-x" data-pill-x="${_escHtml(n.id)}" title="Dismiss">&times;</button>
    </span>`;

  _bannerEl.innerHTML = `
    <div class="nb-left">
      <svg class="nb-bell" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v3L2 11.5h12L12.5 9V6c0-2.5-2-4.5-4.5-4.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        <path d="M6.5 12a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <span class="nb-label">Notifications</span>
      ${unread > 0 ? `<span class="nb-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </div>
    <div class="nb-divider"></div>
    <div class="nb-middle">
      <div class="nb-pills-track">
        ${pillHtml}
      </div>
    </div>
    <div class="nb-right">
      <button class="nb-viewall">View all</button>
      <span class="nb-sep">|</span>
      <button class="nb-dismiss">Dismiss</button>
    </div>`;

  _bannerEl.querySelector('.nb-viewall').addEventListener('click', _buildModal);

  const dismissAllBtn = _bannerEl.querySelector('.nb-dismiss');
  if (dismissAllBtn) {
    dismissAllBtn.addEventListener('click', () => {
      _displayQueue = [];
      _transitionToNext(true);
    });
  }

  const dismissBtn = _bannerEl.querySelector('[data-pill-x]');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _transitionToNext(false);
    });
  }
}

function _showNextInQueue() {
  if (_isDismissing) return;
  if (!_bannerEl) return;

  if (_displayQueue.length === 0) {
    _activeItem = null;
    _hideBanner();
    return;
  }

  _activeItem = _displayQueue.shift();
  _shownIds.add(_activeItem.id);
  _activeStartTime = Date.now();

  _renderBannerWithActiveItem();

  if (_activeTimer) {
    clearTimeout(_activeTimer);
    _activeTimer = null;
  }

  if (_displayQueue.length > 0) {
    // If multiple notifications are queued, display current for 3.5 seconds
    _activeTimer = setTimeout(() => {
      _transitionToNext();
    }, 3500);
  } else {
    // All notifications disappear smoothly after 4.5 seconds (active progress pills are exempt)
    if (_activeItem.type !== 'progress') {
      _activeTimer = setTimeout(() => {
        _transitionToNext();
      }, 4500);
    }
  }
}

function _transitionToNext(isDismissAll = false) {
  if (_isDismissing) return;
  _isDismissing = true;

  if (_activeTimer) {
    clearTimeout(_activeTimer);
    _activeTimer = null;
  }

  if (isDismissAll) {
    _displayQueue = [];
  }

  const pill = _bannerEl ? _bannerEl.querySelector('.nb-pill') : null;
  if (pill) {
    pill.classList.add('nb-pill--dismissing');
  }

  setTimeout(() => {
    if (isDismissAll) {
      dismissAll();
    } else if (_activeItem) {
      dismissOne(_activeItem.id);
    }

    _activeItem = null;
    _isDismissing = false;

    if (isDismissAll || _displayQueue.length === 0) {
      _hideBanner();
    } else {
      _showNextInQueue();
    }
  }, 220);
}

function _hideBanner() {
  if (!_bannerEl) return;
  if (_closeTimer) clearTimeout(_closeTimer);

  if (_isBannerVisible) {
    _bannerEl.classList.remove('nb-slide-down');
    _bannerEl.classList.add('nb-slide-up');
    document.body.classList.remove('has-active-banner');
    _isBannerVisible = false;

    _closeTimer = setTimeout(() => {
      if (!_activeItem && _displayQueue.length === 0) {
        _bannerEl.classList.add('nb-hidden');
        _bannerEl.classList.remove('nb-slide-up');
        _bannerEl.innerHTML = '';
      }
    }, 250);
  } else {
    _bannerEl.classList.add('nb-hidden');
    _bannerEl.classList.remove('nb-slide-down', 'nb-slide-up');
    document.body.classList.remove('has-active-banner');
    _bannerEl.innerHTML = '';
  }
}

function _handleNotificationUpdates(allNotifications) {
  if (!_bannerEl) return;

  if (!allNotifications || allNotifications.length === 0) {
    _displayQueue = [];
    if (_activeItem) {
      _transitionToNext(true);
    } else {
      _hideBanner();
    }
    return;
  }

  // Sync incoming notifications
  let hasNew = false;
  for (const n of allNotifications) {
    if (_activeItem && _activeItem.id === n.id) {
      _updateActivePillDOM(n);
      continue;
    }
    if (_shownIds.has(n.id)) {
      continue;
    }
    const queuedIdx = _displayQueue.findIndex((item) => item.id === n.id);
    if (queuedIdx !== -1) {
      _displayQueue[queuedIdx] = n;
      continue;
    }
    _displayQueue.push(n);
    hasNew = true;
  }

  if (!_activeItem && !_isDismissing) {
    _showNextInQueue();
  } else if (_activeItem && !_isDismissing && hasNew && _displayQueue.length > 0) {
    // Another notification was fired! Check if active notification has shown for 3.5s:
    const elapsed = Date.now() - _activeStartTime;
    if (elapsed >= 3500) {
      _transitionToNext();
    } else {
      const remaining = 3500 - elapsed;
      if (_activeTimer) clearTimeout(_activeTimer);
      _activeTimer = setTimeout(() => {
        _transitionToNext();
      }, Math.max(50, remaining));
    }
  }
}

// ─── INIT ──────────────────────────────────────────────────────────────────────

export function initNotificationBanner() {
  _bannerEl = document.getElementById('notification-banner');
  if (!_bannerEl) {
    _bannerEl = document.createElement('div');
    _bannerEl.id = 'notification-banner';
    _bannerEl.className = 'notification-banner nb-hidden';
    document.body.appendChild(_bannerEl);
  }

  _handleNotificationUpdates(getAll());

  subscribe((notifications) => {
    _handleNotificationUpdates(notifications);
  });

  setInterval(() => {
    if (_activeItem) _updateActivePillDOM(_activeItem);
  }, 15000);
}
