/**
 * notificationBanner.js
 *
 * Renders and manages the persistent notification banner that sits
 * below #topbar and above #main-content. The banner is injected as
 * a fixed strip at the top of the main content column (not inside the
 * sidebar).
 *
 * Sections (left -> middle -> right):
 *   LEFT   : Bell icon + "Notifications" label + red unread badge
 *   MIDDLE : Horizontally-scrollable row of notification pills
 *   RIGHT  : "View all" | "Dismiss" actions
 *
 * Subscribes to notificationStore so it re-renders on every change.
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
  success:  { color: '#00E5C0', icon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 8l2.5 2.5 3.5-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  error:    { color: '#F87171', icon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/><line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` },
  warning:  { color: '#FBBF24', icon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13H1.5L8 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="8" y1="6.5" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.5" r="0.7" fill="currentColor"/></svg>` },
  progress: { color: '#38BDF8', icon: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2"/><path d="M8 4.5v3.5l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
};

function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── MODAL ─────────────────────────────────────────────────────────────────────

function _buildModal() {
  const existing = document.getElementById('notif-modal-overlay');
  if (existing) { existing.remove(); return; }   // toggle

  markAllRead();

  const all = getAll();
  const overlay = document.createElement('div');
  overlay.id = 'notif-modal-overlay';
  overlay.className = 'notif-modal-overlay';

  overlay.innerHTML = `
    <div class="notif-modal" role="dialog" aria-modal="true" aria-label="Notification History">
      <div class="notif-modal-header">
        <span class="notif-modal-title">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
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
              const m = TYPE_META[n.type] || TYPE_META.success;
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

  // Close on overlay click
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

function _render(banner, notifications) {
  const unread = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) {
    banner.innerHTML = `
      <div class="nb-left">
        <svg class="nb-bell" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v3L2 11.5h12L12.5 9V6c0-2.5-2-4.5-4.5-4.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M6.5 12a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <span class="nb-label">Notifications</span>
      </div>
      <div class="nb-divider"></div>
      <div class="nb-middle nb-empty-state">No new notifications</div>
      <div class="nb-right" style="opacity:0;pointer-events:none">
        <button class="nb-viewall">View all</button>
        <span class="nb-sep">|</span>
        <button class="nb-dismiss">Dismiss</button>
      </div>`;
    return;
  }

  const pillsHtml = notifications.map((n) => {
    const m = TYPE_META[n.type] || TYPE_META.success;
    const isProgress = n.type === 'progress';
    return `
      <span class="nb-pill ${n.type === 'progress' ? 'nb-pill--progress' : ''}" style="--pill-color:${m.color}">
        <span class="nb-pill-icon" style="color:${m.color}">${m.icon}</span>
        <span class="nb-pill-msg">${_escHtml(n.message)}</span>
        ${!isProgress ? `<span class="nb-pill-time">${relTime(n.timestamp)}</span>` : ''}
      </span>`;
  }).join('');

  banner.innerHTML = `
    <div class="nb-left">
      <svg class="nb-bell" width="14" height="14" viewBox="0 0 16 16" fill="none">
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
  banner.querySelector('.nb-dismiss').addEventListener('click', () => { dismissAll(); });
}

// ─── INIT ──────────────────────────────────────────────────────────────────────

export function initNotificationBanner() {
  // Create the banner strip and insert it as the first child of #main-content
  let banner = document.getElementById('notification-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'notification-banner';
    banner.className = 'notification-banner';

    // Insert as a fixed strip below #topbar — it is positioned via CSS
    document.body.appendChild(banner);
  }

  // Initial render
  _render(banner, getAll());

  // Re-render on store changes
  subscribe((notifications) => {
    _render(banner, notifications);
  });

  // Tick relative timestamps every 30s
  setInterval(() => {
    const current = getAll();
    if (current.length > 0) _render(banner, current);
  }, 30_000);
}
