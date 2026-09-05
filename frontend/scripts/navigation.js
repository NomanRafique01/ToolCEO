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

import { renderDocumentFormats, setNavigateToModule as setDocNav } from './documents.js';
import { renderEbookFormats,    setNavigateToModule as setEbookNav } from './ebooks.js';
import { renderAudioFormats,    setNavigateToModule as setAudioNav } from './audio.js';
import { renderImageFormats,    setNavigateToModule as setImgNav } from './images.js';
import { renderModules, setPendingLockContext } from './modules.js';
import { setActiveTool }         from './toolstate.js';
import { loadModuleStatuses }    from './modulelock.js';

// ── Category → renderer map ──────────────────────────────────────────────────
// Add future categories here.  Value is a function(container) that fills it.
const CATEGORY_RENDERERS = {
  Documents : renderDocumentFormats,
  Audio     : renderAudioFormats,
  Ebooks    : renderEbookFormats,
  Images    : renderImageFormats,
  Modules   : renderModules,
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

  // Load module statuses early so all renderers see them synchronously.
  // The promise is fire-and-forget; renderers called before it resolves will
  // treat everything as not_installed (the safe default).
  loadModuleStatuses();

  // ── Wire up the locked-card → Modules redirect for all category scripts ────
  function navigateToModule(moduleId, toolLabel) {
    setPendingLockContext({ moduleId, toolLabel });
    activateNav('Modules');
  }
  setDocNav(navigateToModule);
  setEbookNav(navigateToModule);
  setAudioNav(navigateToModule);
  setImgNav(navigateToModule);

  function activateNav(label) {
    // ── Sidebar highlight ────────────────────────────────────────────────
    navItems.forEach((n) => n.classList.remove('active'));
    const target = [...navItems].find((n) => n.dataset.label === label);
    if (target) {
      target.classList.add('active');
      if (pageTitle) pageTitle.textContent = label;
    }

    // ── Breadcrumb update ────────────────────────────────────────────────
    if (label === 'Dashboard') {
      setBreadcrumb(['Dashboard']);
    } else {
      setBreadcrumb(['Dashboard', label]);
    }

    // ── Dashboard hero/recent columns visibility ─────────────────────────
    const dashPanel = document.getElementById('dashboard-panel');
    if (dashPanel) {
      if (label === 'Modules') {
        dashPanel.classList.add('modules-active');
      } else {
        dashPanel.classList.remove('modules-active');
      }
    }

    // ── Explore-section swap ─────────────────────────────────────────────
    if (!exploreSection) return;

    if (CATEGORY_RENDERERS[label]) {
      // Inject category format grid
      CATEGORY_RENDERERS[label](exploreSection, activateNav);
    } else {
      // Restore default Explore Tools grid (Dashboard or unmapped items)
      // Clear any active tool so the hero card resets to its default state
      setActiveTool(null);
      exploreSection.innerHTML = originalExploreHTML;
      bindToolCardClicks(activateNav);
    }

    exploreSection.classList.remove('explore-swap-fade');
    void exploreSection.offsetWidth;
    exploreSection.classList.add('explore-swap-fade');

    // ── Scroll explore section into view so the user sees the tools ──────
    // #main-content is a fixed-position scroll container, so we must scroll it
    // directly rather than using scrollIntoView (which doesn't cross fixed roots).
    setTimeout(() => {
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.scrollTo({ top: exploreSection.offsetTop - 16, behavior: 'smooth' });
      }
    }, 60);
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
      if (label) {
        // Clear any previously selected tool when jumping to a new category
        setActiveTool(null);
        activateNav(label);
      }
    });
  });
}
