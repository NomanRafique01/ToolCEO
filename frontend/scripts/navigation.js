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

import { renderDocumentFormats, renderDocumentToolView, setNavigateToModule as setDocNav } from './documents.js';
import { renderEbookFormats,    renderEbookToolView,    setNavigateToModule as setEbookNav } from './ebooks.js';
import { renderImageFormats,    renderImageToolView,    setNavigateToModule as setImgNav } from './images.js';
import { renderModules, setPendingLockContext } from './modules.js';
import { renderFavourites, setNavigateToModule as setFavNav } from './favourites.js';
import { renderRecent } from './recent.js';
import { renderArchives, renderArchiveToolView, setNavigateToModule as setArchiveNav, setActivateNavForArchives, routeZipToExtractor } from './archives.js';
import { renderAllTools, setNavigateToModule as setAllToolsNav } from './allTools.js';
import { renderAbout }           from './about.js';
import { setActiveTool }         from './toolstate.js';
import { loadModuleStatuses }    from './modulelock.js';
import { setZipExtractRouter }   from '../tools/shared/progress.js';

// ── Category → renderer map ──────────────────────────────────────────────────
// Add future categories here.  Value is a function(container) that fills it.
const CATEGORY_RENDERERS = {
  Documents  : renderDocumentFormats,
  Ebooks     : renderEbookFormats,
  Images     : renderImageFormats,
  Modules    : renderModules,
  Favorites  : renderFavourites,
  Favourites : renderFavourites,
  Recent     : renderRecent,
  Archives   : renderArchives,
  'All Tools': renderAllTools,
  AllTools   : renderAllTools,
  About      : renderAbout,
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
  setImgNav(navigateToModule);
  setArchiveNav(navigateToModule);
  setFavNav(navigateToModule);
  setAllToolsNav(navigateToModule);

  function activateNav(label) {
    // ── Sidebar highlight ────────────────────────────────────────────────
    navItems.forEach((n) => n.classList.remove('active'));
    const target = [...navItems].find((n) => n.dataset.label === label || (label === 'Favourites' && n.dataset.label === 'Favorites') || (label === 'Favorites' && n.dataset.label === 'Favourites'));
    if (target) {
      target.classList.add('active');
      if (pageTitle) pageTitle.textContent = (label === 'Favorites' || label === 'Favourites') ? 'Favourites' : label;
    }

    // ── Breadcrumb update ────────────────────────────────────────────────
    if (label === 'Dashboard') {
      setBreadcrumb(['Dashboard']);
    } else if (label === 'Favorites' || label === 'Favourites') {
      setBreadcrumb(['Dashboard', 'Favourites']);
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

      if (label === 'Recent') {
        dashPanel.classList.add('recent-active');
        setActiveTool(null);
      } else {
        dashPanel.classList.remove('recent-active');
      }

      if (label === 'Favorites' || label === 'Favourites') {
        setActiveTool(null);
      }

      if (label === 'About') {
        dashPanel.classList.add('about-active');
        document.body.classList.add('about-active');
      } else {
        dashPanel.classList.remove('about-active');
        document.body.classList.remove('about-active');
      }

      const searchArea = document.querySelector('.topbar-search-area');
      if (searchArea) {
        if (label === 'About') {
          searchArea.style.display = 'none';
          const searchInput = document.getElementById('header-search-input');
          if (searchInput) searchInput.blur();
          const searchDropdown = document.getElementById('header-search-dropdown');
          if (searchDropdown) searchDropdown.style.display = 'none';
        } else {
          searchArea.style.display = '';
        }
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

  // ── Wire activateNav into archives and progress for ZIP extract shortcut ────
  setActivateNavForArchives(activateNav);
  setZipExtractRouter((file) => routeZipToExtractor(file, activateNav));

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      setActiveTool(null);
      activateNav(item.dataset.label);
    });
  });

  // Bind View All link on dashboard recent panel
  const viewAllBtn = document.querySelector('.recent-view-all');
  if (viewAllBtn) {
    viewAllBtn.style.cursor = 'pointer';
    viewAllBtn.addEventListener('click', () => activateNav('Recent'));
  }

  // Bind tool-card clicks on the default grid
  bindToolCardClicks(activateNav);

  /**
   * Navigates directly to a tool's dedicated category & format panel,
   * clearing any conflicting states (Modules, Recent, About, etc.),
   * activating the tool in the hero dropzone, and selecting its card.
   * @param {object} tool  The enriched tool spec from searchEngine / toolstate
   */
  function navigateToTool(tool) {
    if (!tool) return;

    // 1. Resolve family and category navigation label
    const family = (tool.family || '').toLowerCase();
    let navLabel = 'Documents';
    if (family === 'document') navLabel = 'Documents';
    else if (family === 'image') navLabel = 'Images';
    else if (family === 'ebook') navLabel = 'Ebooks';
    else if (family === 'archive') navLabel = 'Archives';
    else if (tool.familyLabel) {
      const fl = tool.familyLabel.toLowerCase();
      if (fl.includes('doc')) navLabel = 'Documents';
      else if (fl.includes('img') || fl.includes('image')) navLabel = 'Images';
      else if (fl.includes('ebook') || fl.includes('book')) navLabel = 'Ebooks';
      else if (fl.includes('archive') || fl.includes('zip')) navLabel = 'Archives';
    }

    // 2. Clear any conflicting panel states (modules-active, recent-active, about-active)
    const dashPanel = document.getElementById('dashboard-panel');
    if (dashPanel) {
      dashPanel.classList.remove('modules-active', 'recent-active', 'about-active');
    }
    document.body.classList.remove('about-active');

    const searchArea = document.querySelector('.topbar-search-area');
    if (searchArea) searchArea.style.display = '';

    // 3. Update sidebar nav items highlight to the target category
    navItems.forEach((n) => {
      n.classList.remove('active');
      if (n.dataset && n.dataset.label === navLabel) {
        n.classList.add('active');
      }
    });

    if (pageTitle) pageTitle.textContent = navLabel;

    // 4. Render the specific category tool view into exploreSection
    if (exploreSection) {
      if (navLabel === 'Documents') {
        renderDocumentToolView(exploreSection, activateNav, tool.id);
      } else if (navLabel === 'Images') {
        renderImageToolView(exploreSection, activateNav, tool.id);
      } else if (navLabel === 'Ebooks') {
        renderEbookToolView(exploreSection, activateNav, tool.id);
      } else if (navLabel === 'Archives') {
        renderArchiveToolView(exploreSection, activateNav, tool.id);
      } else if (CATEGORY_RENDERERS[navLabel]) {
        CATEGORY_RENDERERS[navLabel](exploreSection, activateNav);
      }

      exploreSection.classList.remove('explore-swap-fade');
      void exploreSection.offsetWidth;
      exploreSection.classList.add('explore-swap-fade');
    }

    // 5. Activate the tool in toolstate (this updates the hero dropzone)
    setActiveTool({
      id      : tool.id,
      label   : tool.label,
      mainText: tool.mainText,
      subText : tool.subText,
      icon    : tool.icon    || null,
      color   : tool.color   || '#00E5C0',
      bg      : tool.bg      || 'rgba(0,229,192,0.12)',
      tag     : tool.tag     || tool.familyLabel || 'Tool',
    });

    // 6. Highlight the card in the explore grid
    if (exploreSection) {
      const card = exploreSection.querySelector(`.fmt-card[data-id="${tool.id}"]`);
      if (card) {
        exploreSection.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      }
    }

    // 7. Scroll to top so hero dropzone with the selected tool is immediately visible
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollTop = 0;
      requestAnimationFrame(() => { mainContent.scrollTop = 0; });
    }
  }

  return { activateNav, navigateToTool };
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
