/**
 * headerSearch.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal header search bar UI component and live quick-launcher.
 *
 * Responsibilities (UI ONLY):
 *   • Render the search dropdown, filter chips, keyboard navigation.
 *   • Delegate ALL search logic to searchEngine.js (Fuse.js powered).
 *   • On tool selection: activate the full tool spec, exit any conflicting
 *     panel state (modules-active / recent-active), and scroll to top.
 *
 * The search bar visual design, Ctrl+K shortcut, chip filters,
 * and dropdown animations are kept exactly as-is.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { setActiveTool }                             from './toolstate.js';
import { getLockedModuleId }                         from './modulelock.js';
import { setPendingLockContext }                     from './modules.js';
import { initSearchEngine, searchTools, getSuggestedTools, getToolById } from './searchEngine.js';

let _activateNav  = null;
let activeFilter  = 'all';
let selectedIndex = -1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToolIconHTML(tool) {
  if (tool.icon) return tool.icon;
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v4l3 3"/>
  </svg>`;
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

// ─── Init ────────────────────────────────────────────────────────────────────

export function initHeaderSearch({ activateNav } = {}) {
  _activateNav = activateNav;

  // Pre-warm the search engine immediately (non-blocking, fast)
  try { initSearchEngine(); } catch (_) {}

  const searchWrap     = document.getElementById('header-search-wrap');
  const searchInput    = document.getElementById('header-search-input');
  const searchClear    = document.getElementById('header-search-clear');
  const searchDropdown = document.getElementById('header-search-dropdown');
  const searchResults  = document.getElementById('header-search-results');
  const filterChips    = document.querySelectorAll('.header-search-chip');
  const shortcutBadge  = searchWrap ? searchWrap.querySelector('.header-search-shortcut') : null;

  if (!searchWrap || !searchInput || !searchDropdown || !searchResults) return;

  // Mac shortcut label
  if (shortcutBadge && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
    shortcutBadge.innerHTML = '<kbd>⌘</kbd><kbd>K</kbd>';
  }

  // ── Dropdown open/close ────────────────────────────────────────────────────

  function openDropdown() {
    searchDropdown.style.display = 'block';
    searchWrap.classList.add('is-focused');
    renderResults();
  }

  function closeDropdown() {
    searchDropdown.style.display = 'none';
    searchWrap.classList.remove('is-focused');
    selectedIndex = -1;
  }

  // ── Results rendering ──────────────────────────────────────────────────────

  function renderResults() {
    const query = (searchInput.value || '').trim();

    // Show / hide clear button
    if (searchClear) {
      searchClear.style.display = query.length > 0 ? 'flex' : 'none';
    }

    // Get results from the search engine
    let results;
    let sectionTitle;

    if (query) {
      results      = searchTools(query, activeFilter, 15);
      sectionTitle = results.length > 0
        ? `Matching Tools (${results.length})`
        : '';
    } else {
      results      = getSuggestedTools(activeFilter, 8);
      sectionTitle = 'Popular &amp; Suggested Tools';
    }

    // ── Empty state ──────────────────────────────────────────────────────────
    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="header-search-empty">
          <svg class="header-search-empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11" stroke-dasharray="2 2"/>
          </svg>
          <div class="header-search-empty-title">No tools found</div>
          <div class="header-search-empty-sub">No results for &ldquo;${escapeHTML(query)}&rdquo;. Try another format or keyword.</div>
        </div>
      `;
      selectedIndex = -1;
      return;
    }

    // ── Result items ─────────────────────────────────────────────────────────
    let html = `<div class="header-search-section-title">${sectionTitle}</div>`;

    results.forEach((tool, index) => {
      const isLocked  = !!getLockedModuleId(tool.id);
      const badgeText = isLocked ? 'Locked' : (tool.ext || tool.familyLabel || 'Tool');
      const isSelected = index === selectedIndex;

      html += `
        <div class="header-search-item${isSelected ? ' is-selected' : ''}"
             data-tool-id="${escapeHTML(tool.id)}"
             data-index="${index}"
             style="--item-color:${tool.color || '#00E5C0'}; --item-bg:${tool.bg || 'rgba(0,229,192,0.12)'}">
          <div class="header-search-item-icon">${getToolIconHTML(tool)}</div>
          <div class="header-search-item-body">
            <div class="header-search-item-title">${escapeHTML(tool.label)}</div>
            <div class="header-search-item-desc">${escapeHTML(tool.desc || '')}</div>
          </div>
          <span class="header-search-item-badge">${escapeHTML(badgeText)}</span>
          <span class="header-search-item-arrow">›</span>
        </div>
      `;
    });

    searchResults.innerHTML = html;

    // Bind click on each result item
    searchResults.querySelectorAll('.header-search-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        selectToolById(itemEl.dataset.toolId);
      });
    });
  }

  // ── Tool Selection Logic ───────────────────────────────────────────────────

  function selectToolById(toolId) {
    // Resolve the full enriched tool spec from the search engine
    const tool = getToolById(toolId);
    if (!tool) return;

    closeDropdown();
    searchInput.blur();

    // Module lock guard
    const lockedMod = getLockedModuleId(tool.id);
    if (lockedMod) {
      setPendingLockContext({ moduleId: lockedMod, toolLabel: tool.label });
      if (typeof _activateNav === 'function') _activateNav('Modules');
      return;
    }

    // ── Exit any conflicting dashboard states ──────────────────────────────
    const dashPanel = document.getElementById('dashboard-panel');
    if (dashPanel) {
      const inModules = dashPanel.classList.contains('modules-active');
      const inRecent  = dashPanel.classList.contains('recent-active');
      if (inModules || inRecent) {
        dashPanel.classList.remove('modules-active', 'recent-active');
        // Switch sidebar highlight back to Dashboard without losing the tool
        if (typeof _activateNav === 'function') {
          // We only need the nav highlight update; we must NOT let activateNav
          // call setActiveTool(null) or replace the explore grid.
          // So we patch sidebar highlight directly here instead:
          document.querySelectorAll('.nav-item, [data-label]').forEach((n) => {
            n.classList.remove('active');
            if (n.dataset && n.dataset.label === 'Dashboard') n.classList.add('active');
          });
        }
      }
    }

    // ── Activate the tool via the full object (not just ID) ────────────────
    // Pass the complete spec so _updateDropZone gets label, mainText, subText,
    // icon, color, bg, tag — exactly as card clicks do in documents.js / images.js.
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

    // ── Scroll to top so the drop zone is immediately visible ──────────────
    // Force #main-content (the fixed scroll root) to top: 0.
    // We do it immediately AND in the next animation frame to win any race
    // with the drop zone re-render triggered by setActiveTool / onToolChange.
    const mainContent = document.getElementById('main-content');
    function _scrollToTop() {
      if (mainContent) mainContent.scrollTop = 0;
    }
    _scrollToTop();
    requestAnimationFrame(_scrollToTop);
  }

  // ── Event Listeners ────────────────────────────────────────────────────────

  searchInput.addEventListener('focus', openDropdown);
  searchInput.addEventListener('input', () => {
    selectedIndex = -1;
    openDropdown();
  });

  if (searchClear) {
    searchClear.addEventListener('click', (e) => {
      e.stopPropagation();
      searchInput.value = '';
      selectedIndex = -1;
      searchInput.focus();
      renderResults();
    });
  }

  // Filter chips
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter  = chip.dataset.filter || 'all';
      selectedIndex = -1;
      renderResults();
      searchInput.focus();
    });
  });

  // Keyboard navigation inside search input
  searchInput.addEventListener('keydown', (e) => {
    const items = searchResults.querySelectorAll('.header-search-item');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelectedHighlight(items);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelectedHighlight(items);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length > 0) {
        const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const targetEl    = items[targetIndex];
        if (targetEl) selectToolById(targetEl.dataset.toolId);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
      searchInput.blur();
    }
  });

  function updateSelectedHighlight(items) {
    items.forEach((item, i) => {
      if (i === selectedIndex) {
        item.classList.add('is-selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('is-selected');
      }
    });
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!searchWrap.contains(e.target)) closeDropdown();
  });

  // Global Ctrl+K / Cmd+K shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      if (document.body.classList.contains('about-active') || document.getElementById('dashboard-panel')?.classList.contains('about-active')) {
        return;
      }
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      openDropdown();
    }
  });
}
