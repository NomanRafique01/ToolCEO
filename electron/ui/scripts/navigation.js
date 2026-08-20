/**
 * navigation.js
 * Handles sidebar nav activation, page title, explore-section swapping,
 * and breadcrumb bar updates.
 *
 * When a category nav item is clicked (Documents, Audio, Images, etc.) the
 * "Explore Tools" grid inside the dashboard is replaced with that category's
 * format cards.  Clicking Dashboard restores the original grid.
 *
 * The sidebar, topbar, hero card, drop zone, breadcrumb bar, recent
 * panel, and features strip are all UNTOUCHED — only the explore-section
 * inner content changes.
 */

import { renderDocumentFormats } from './documents.js';
import { renderAudioFormats }    from './audio.js';

// ── Category → renderer map ──────────────────────────────────────────────────
// Add future categories here.  Value is a function(container) that fills it.
const CATEGORY_RENDERERS = {
  Documents : renderDocumentFormats,
  Audio     : renderAudioFormats,
};

// The original "Explore Tools" grid HTML is captured once on first load so we
// can always restore it exactly when Dashboard is selected.
let originalExploreHTML = null;

// ── Breadcrumb ───────────────────────────────────────────────────────────────

/**
 * Renders the breadcrumb bar from an array of segment strings.
 * The last segment is styled as the active (bright) item.
 * @param {string[]} segments  e.g. ['Dashboard'] or ['Dashboard', 'Documents', 'PDF']
 */
export function setBreadcrumb(segments) {
  const bar = document.getElementById('breadcrumb-bar');
  if (!bar) return;

  bar.innerHTML = segments
    .map((seg, i) => {
      const isLast = i === segments.length - 1;
      const label = `<span class="bc-label${isLast ? ' bc-label--active' : ''}">${seg}</span>`;
      const sep   = i < segments.length - 1
        ? '<span class="bc-sep" aria-hidden="true">/</span>'
        : '';
      return `<span class="bc-segment">${label}${sep}</span>`;
    })
    .join('');
}

export function initNavigation() {
  const navItems    = document.querySelectorAll('.nav-item');
  const pageTitle   = document.getElementById('page-title');
  const exploreSection = document.getElementById('explore-section');

  // Capture the default grid HTML on boot
  if (exploreSection && originalExploreHTML === null) {
    originalExploreHTML = exploreSection.innerHTML;
  }

  // Seed breadcrumb on first load
  setBreadcrumb(['Dashboard']);

  function activateNav(label) {
    // ── Sidebar highlight ────────────────────────────────────────────────
    navItems.forEach((n) => n.classList.remove('active'));
    const target = [...navItems].find((n) => n.dataset.label === label);
    if (target) {
      target.classList.add('active');
      pageTitle.textContent = label;
    }

    // ── Breadcrumb update ────────────────────────────────────────────────
    if (label === 'Dashboard') {
      setBreadcrumb(['Dashboard']);
    } else {
      setBreadcrumb(['Dashboard', label]);
    }

    // ── Explore-section swap ─────────────────────────────────────────────
    if (!exploreSection) return;

    if (CATEGORY_RENDERERS[label]) {
      // Inject category format grid
      CATEGORY_RENDERERS[label](exploreSection, activateNav);
    } else {
      // Restore default Explore Tools grid (Dashboard or unmapped items)
      exploreSection.innerHTML = originalExploreHTML;
      bindToolCardClicks(activateNav);
    }
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => activateNav(item.dataset.label));
  });

  // Bind tool-card clicks on the default grid
  bindToolCardClicks(activateNav);

  return { activateNav };
}

// Called after restoring the original grid so tool-card clicks keep working
export function bindToolCardClicks(activateNav) {
  document.querySelectorAll('.tool-card').forEach((card) => {
    card.addEventListener('click', () => {
      const label = card.dataset.nav;
      if (label) activateNav(label);
    });
  });
}
