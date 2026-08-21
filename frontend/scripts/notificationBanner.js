/**
 * notificationBanner.js
 *
 * Renders and manages the persistent notification banner strip.
 * Features a premium frosted glass HUD bar directly below topbar with CSS animations.
 *
 * Supported Types:
 *   success  -> green icon  (auto-dismisses after 6s via CSS countdown)
 *   warning  -> amber icon  (stays until user dismisses)
 *   error    -> red icon    (stays until user dismisses)
 *   info     -> blue icon   (auto-dismisses after 6s via CSS countdown)
 *   progress -> blue icon   (active background processing)
 */

import {
  subscribe, getAll, getUnreadCount,
  dismissAll, dismissOne, markAllRead,
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
      dismissOne(id);
      const row = overlay.querySelector(`[data-id="${id}"]`);
      if (row) row.remove();
      const body = overlay.querySelector('.notif-modal-body');
      if (body && !body.querySelector('.notif-modal-row')) {
        body.innerHTML = `<p class="notif-modal-empty">No notifications yet.</p>`;
      }
    });
  });
}

// ─── BANNER RENDER ─────────────────────────────────────────────────────────────

let _prevNotifCount = 0;

function _render(banner, notifications) {
  const unread = getUnreadCount();
  const currentCount = notifications.length;

  if (currentCount > 0 && _prevNotifCount === 0) {
    banner.classList.remove('notification-banner--empty', 'nb-collapse');
    banner.classList.add('nb-expand');
  } else if (currentCount === 0 && _prevNotifCount > 0) {
    banner.classList.remove('nb-expand');
    banner.classList.add('nb-collapse');
    setTimeout(() => {
      banner.classList.remove('nb-collapse');
      banner.classList.add('notification-banner--empty');
    }, 250);
  } else if (currentCount === 0) {
    banner.classList.add('notification-banner--empty');
  } else {
    banner.classList.remove('notification-banner--empty', 'nb-collapse');
  }

  _prevNotifCount = currentCount;

  if (notifications.length === 0) {
    banner.innerHTML = `
      <div class="nb-left">
        <svg class="nb-bell" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v3L2 11.5h12L12.5 9V6c0-2.5-2-4.5-4.5-4.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M6.5 12a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <span class="nb-label">Notifications</span>
      </div>
      <div class="nb-divider"></div>
      <div class="nb-middle nb-empty-state">No active notifications</div>
      <div class="nb-right" style="opacity:0;pointer-events:none">
        <button class="nb-viewall">View all</button>
        <span class="nb-sep">|</span>
        <button class="nb-dismiss">Dismiss</button>
      </div>`;
    return;
  }

  const pillsHtml = notifications.map((n) => {
    const m = TYPE_META[n.type] || TYPE_META.info;
    const isProgress = n.type === 'progress';
    const isAutoDismiss = n.type === 'success' || n.type === 'info';

    return `
      <span class="nb-pill ${isProgress ? 'nb-pill--progress' : ''}" style="--pill-color:${m.color}" data-id="${_escHtml(n.id)}">
        <span class="nb-pill-icon" style="color:${m.color}">${m.icon}</span>
        <span class="nb-pill-msg">${_escHtml(n.message)}</span>
        ${!isProgress ? `<span class="nb-pill-time">${relTime(n.timestamp)}</span>` : ''}
        <button class="nb-pill-x" data-pill-x="${_escHtml(n.id)}" title="Dismiss">&times;</button>
        ${isAutoDismiss ? `<span class="nb-pill-progress" data-progress-id="${_escHtml(n.id)}"></span>` : ''}
      </span>`;
  }).join('');

  banner.innerHTML = `
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
        ${pillsHtml}
      </div>
    </div>
    <div class="nb-right">
      <button class="nb-viewall">View all</button>
      <span class="nb-sep">|</span>
      <button class="nb-dismiss">Dismiss</button>
    </div>`;

  banner.querySelector('.nb-viewall').addEventListener('click', _buildModal);

  const dismissAllBtn = banner.querySelector('.nb-dismiss');
  if (dismissAllBtn) {
    dismissAllBtn.addEventListener('click', () => {
      const pills = banner.querySelectorAll('.nb-pill');
      if (pills.length === 0) {
        dismissAll();
        return;
      }
      pills.forEach((p) => p.classList.add('nb-pill--dismissing'));
      setTimeout(() => {
        dismissAll();
      }, 200);
    });
  }

  // Attach inline dismiss handlers for individual pills with slide-out animation
  banner.querySelectorAll('[data-pill-x]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.pillX;
      const pill = btn.closest('.nb-pill');
      if (pill) {
        pill.classList.add('nb-pill--dismissing');
        pill.addEventListener('animationend', () => {
          dismissOne(id);
        }, { once: true });
      } else {
        dismissOne(id);
      }
    });
  });

  // Attach CSS countdown animationend listeners for auto-dismissable pills
  banner.querySelectorAll('.nb-pill-progress').forEach((bar) => {
    bar.addEventListener('animationend', (e) => {
      if (e.animationName !== 'pillCountdown') return;
      const id = bar.dataset.progressId;
      const pill = banner.querySelector(`.nb-pill[data-id="${id}"]`);
      if (pill) {
        pill.classList.add('nb-pill--dismissing');
        pill.addEventListener('animationend', () => {
          dismissOne(id);
        }, { once: true });
      } else {
        dismissOne(id);
      }
    });
  });
}

// ─── INIT ──────────────────────────────────────────────────────────────────────

export function initNotificationBanner() {
  let banner = document.getElementById('notification-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'notification-banner';
    banner.className = 'notification-banner';
    document.body.appendChild(banner);
  }

  _render(banner, getAll());

  subscribe((notifications) => {
    _render(banner, notifications);
  });

  setInterval(() => {
    const current = getAll();
    if (current.length > 0) _render(banner, current);
  }, 30_000);
}
