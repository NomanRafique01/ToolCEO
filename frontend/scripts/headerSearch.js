/**
 * headerSearch.js
 * Universal header search bar UI component and live quick-launcher.
 * Provides instant search across all conversion tools, keyboard shortcuts (Ctrl+K),
 * category filtering, and tool activation.
 */

import { getAllDocumentTools } from './documents.js';
import { getAllImageTools } from './images.js';
import { getAllEbookTools } from './ebooks.js';
import { getAllArchiveTools } from './archives.js';
import { setActiveTool } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';
import { setPendingLockContext } from './modules.js';

let _activateNav = null;
let allToolsList = [];
let activeFilter = 'all';
let selectedIndex = -1;

function initToolsList() {
  try {
    const docTools = typeof getAllDocumentTools === 'function' ? getAllDocumentTools() : [];
    const imgTools = typeof getAllImageTools === 'function' ? getAllImageTools() : [];
    const ebTools = typeof getAllEbookTools === 'function' ? getAllEbookTools() : [];
    const arcTools = typeof getAllArchiveTools === 'function' ? getAllArchiveTools() : [];

    allToolsList = [
      ...docTools.map(t => ({ ...t, family: 'document', familyLabel: 'Document' })),
      ...imgTools.map(t => ({ ...t, family: 'image', familyLabel: 'Image' })),
      ...ebTools.map(t => ({ ...t, family: 'ebook', familyLabel: 'eBook' })),
      ...arcTools.map(t => ({ ...t, family: 'archive', familyLabel: 'Archive' }))
    ];
  } catch (err) {
    console.warn('[HeaderSearch] Could not pre-cache tools list:', err);
    allToolsList = [];
  }
}

/**
 * Renders an SVG icon for a tool or fallback
 */
function getToolIconHTML(tool) {
  if (tool.icon) return tool.icon;
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v4l3 3"/>
  </svg>`;
}

export function initHeaderSearch({ activateNav } = {}) {
  _activateNav = activateNav;

  const searchWrap = document.getElementById('header-search-wrap');
  const searchInput = document.getElementById('header-search-input');
  const searchClear = document.getElementById('header-search-clear');
  const searchDropdown = document.getElementById('header-search-dropdown');
  const searchResults = document.getElementById('header-search-results');
  const filterChips = document.querySelectorAll('.header-search-chip');
  const shortcutBadge = searchWrap ? searchWrap.querySelector('.header-search-shortcut') : null;

  if (!searchWrap || !searchInput || !searchDropdown || !searchResults) {
    return;
  }

  // Detect Mac vs Windows/Linux for shortcut label
  if (shortcutBadge && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
    shortcutBadge.innerHTML = '<kbd>⌘</kbd><kbd>K</kbd>';
  }

  initToolsList();

  function openDropdown() {
    if (allToolsList.length === 0) initToolsList();
    searchDropdown.style.display = 'block';
    searchWrap.classList.add('is-focused');
    renderResults();
  }

  function closeDropdown() {
    searchDropdown.style.display = 'none';
    searchWrap.classList.remove('is-focused');
    selectedIndex = -1;
  }

  function getFilteredTools() {
    const query = (searchInput.value || '').trim().toLowerCase();

    return allToolsList.filter((tool) => {
      // Family filter
      if (activeFilter !== 'all' && tool.family !== activeFilter) {
        return false;
      }

      // Query filter
      if (!query) return true;

      const label = (tool.label || '').toLowerCase();
      const desc = (tool.desc || '').toLowerCase();
      const ext = (tool.ext || '').toLowerCase();
      const id = (tool.id || '').toLowerCase();

      return label.includes(query) || desc.includes(query) || ext.includes(query) || id.includes(query);
    });
  }

  function renderResults() {
    const query = (searchInput.value || '').trim();
    const filtered = getFilteredTools();

    // Show or hide clear button
    if (searchClear) {
      searchClear.style.display = query.length > 0 ? 'flex' : 'none';
    }

    if (filtered.length === 0) {
      searchResults.innerHTML = `
        <div class="header-search-empty">
          <svg class="header-search-empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11" stroke-dasharray="2 2"/>
          </svg>
          <div class="header-search-empty-title">No tools found</div>
          <div class="header-search-empty-sub">No results for "${escapeHTML(query)}". Try another format or keyword.</div>
        </div>
      `;
      selectedIndex = -1;
      return;
    }

    // If no query is entered, limit to top 10 suggested tools
    const displayList = query ? filtered.slice(0, 15) : filtered.slice(0, 8);
    const sectionTitle = query ? `Matching Tools (${filtered.length})` : 'Popular & Suggested Tools';

    let html = `<div class="header-search-section-title">${sectionTitle}</div>`;

    displayList.forEach((tool, index) => {
      const isLocked = !!getLockedModuleId(tool.id);
      const badgeText = isLocked ? 'Locked' : (tool.ext || tool.familyLabel || 'Tool');
      const isSelected = index === selectedIndex;

      html += `
        <div class="header-search-item${isSelected ? ' is-selected' : ''}" data-tool-id="${tool.id}" data-index="${index}"
             style="--item-color:${tool.color || '#00E5C0'}; --item-bg:${tool.bg || 'rgba(0,229,192,0.12)'}">
          <div class="header-search-item-icon">${getToolIconHTML(tool)}</div>
          <div class="header-search-item-body">
            <div class="header-search-item-title">${escapeHTML(tool.label)}</div>
            <div class="header-search-item-desc">${escapeHTML(tool.desc)}</div>
          </div>
          <span class="header-search-item-badge">${badgeText}</span>
          <span class="header-search-item-arrow">›</span>
        </div>
      `;
    });

    searchResults.innerHTML = html;

    // Bind item clicks
    searchResults.querySelectorAll('.header-search-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const toolId = itemEl.dataset.toolId;
        selectToolById(toolId);
      });
    });
  }

  function selectToolById(toolId) {
    const tool = allToolsList.find((t) => t.id === toolId);
    if (!tool) return;

    closeDropdown();
    searchInput.blur();

    const lockedMod = getLockedModuleId(tool.id);
    if (lockedMod) {
      setPendingLockContext({ moduleId: lockedMod, toolLabel: tool.label });
      if (typeof _activateNav === 'function') {
        _activateNav('Modules');
      }
      return;
    }

    // Switch to dashboard/workspace if in modules or recent
    if (typeof _activateNav === 'function') {
      const dashPanel = document.getElementById('dashboard-panel');
      if (dashPanel && (dashPanel.classList.contains('modules-active') || dashPanel.classList.contains('recent-active'))) {
        _activateNav('Dashboard');
      }
    }

    // Activate the tool
    setActiveTool(tool.id);

    // Smooth scroll to drop zone
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ── Event Listeners ──

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

  // Filter chips click
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter || 'all';
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
        const targetEl = items[targetIndex];
        if (targetEl) {
          selectToolById(targetEl.dataset.toolId);
        }
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

  // Global document click to close dropdown
  document.addEventListener('click', (e) => {
    if (!searchWrap.contains(e.target)) {
      closeDropdown();
    }
  });

  // Global Ctrl + K / Cmd + K shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      openDropdown();
    }
  });
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
