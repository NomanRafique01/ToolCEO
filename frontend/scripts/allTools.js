/**
 * allTools.js
 * Master All Tools directory rendering all conversion and utility tool cards
 * from Documents, Images, eBooks, and Archives ordered family-wise.
 */

import { setBreadcrumb } from './navigation.js';
import { setActiveTool } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';
import { isFavourite } from './favourites.js';
import { getAllDocumentTools } from './documents.js';
import { getAllImageTools } from './images.js';
import { getAllEbookTools } from './ebooks.js';
import { getAllArchiveTools } from './archives.js';

let _navigateToModule = null;
export function setNavigateToModule(fn) {
  _navigateToModule = fn;
}

function _handleLockedClick(moduleId, toolLabel) {
  if (_navigateToModule) {
    _navigateToModule(moduleId, toolLabel);
  }
}

function _scrollToDropZone() {
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── FAMILY / CATEGORY DEFINITIONS ───────────────────────────────────────────

const FAMILIES = [
  {
    id: 'document',
    name: 'Documents',
    color: '#FF6B6B',
    bg: 'rgba(255, 107, 107, 0.12)',
    desc: 'PDF Suite, Word, Excel, PowerPoint & OpenDocument utilities',
    highlights: [
      'PDF Tools & Utilities',
      'PDF Conversions',
      'Word & Excel Tools',
      'PowerPoint Presentations',
      'Text & OpenDocument',
    ],
    icon: `<svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 2h6a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="8"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
    getTools: getAllDocumentTools,
  },
  {
    id: 'image',
    name: 'Images',
    color: '#A78BFA',
    bg: 'rgba(167, 139, 250, 0.12)',
    desc: 'Lossless compression, raster & vector graphics conversions',
    highlights: [
      'Smart Image Compressor',
      'JPG & PNG Suite',
      'WebP Modern Formats',
      'SVG Vector Graphics',
      'Multi-Format Converter',
    ],
    icon: `<svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.5" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    getTools: getAllImageTools,
  },
  {
    id: 'ebook',
    name: 'eBooks',
    color: '#FBBF24',
    bg: 'rgba(251, 191, 36, 0.12)',
    desc: 'Digital reading formats, e-reader conversions & cross-publishing',
    highlights: [
      'EPUB & MOBI Reader',
      'Kindle AZW3 Suite',
      'PDF to eBook Converter',
      'FB2, TXT & RTF Formats',
      'Cross-Format Publishing',
    ],
    icon: `<svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M8 13s-4-2-7-2V3c3 0 7 2 7 2s4-2 7-2v8c-3 0-7 2-7 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      <line x1="8" y1="5" x2="8" y2="13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
    getTools: getAllEbookTools,
  },
  {
    id: 'archive',
    name: 'Archives',
    color: '#84CC16',
    bg: 'rgba(132, 204, 22, 0.12)',
    desc: 'High-ratio compression, multi-volume archives & extraction',
    highlights: [
      'ZIP & 7-Zip Archiver',
      'Multi-Format Extraction',
      'Split & Merge Utilities',
      'Password Encryption',
      'TAR & Compression Engines',
    ],
    icon: `<svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M1 5h14v2H1V5Z" stroke="currentColor" stroke-width="1.1"/>
      <line x1="8" y1="2"  x2="8"  y2="5"  stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="6" y1="3"  x2="10" y2="3"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="7" y1="8"  x2="9"  y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="7" y1="10" x2="9"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
    getTools: getAllArchiveTools,
  },
];

// ─── CARD HTML BUILDER ────────────────────────────────────────────────────────

function buildCardHTML(item) {
  const lockedId = getLockedModuleId(item.id);
  const lockClass = lockedId ? ' fmt-card--locked' : '';
  const lockedAttr = lockedId ? ` data-locked-module="${lockedId}"` : '';

  const bottom = item.ext
    ? `<div class="fmt-ext">${item.ext}</div>`
    : (item.tag ? `<div class="fmt-tag fmt-tag--${String(item.tag).toLowerCase()}">${item.tag}</div>` : '');

  const fav = isFavourite(item.id);
  const starCls = fav ? ' is-favourite' : '';
  const starCh = fav ? '★' : '☆';
  const starTitle = fav ? 'Remove from Favourites' : 'Add to Favourites';
  const starBtn = `<button class="card-fav-btn${starCls}" type="button" title="${starTitle}" aria-label="${starTitle}" data-fav-id="${item.id}">${starCh}</button>`;

  return `
    <div class="fmt-card${lockClass}" data-id="${item.id}" data-family="${item.family}"${lockedAttr}
         style="--fmt-color:${item.color};--fmt-bg:${item.bg}">
      <div class="fmt-card-top">
        <div class="fmt-icon-box">${item.icon}</div>
        <span class="fmt-arrow">›</span>
      </div>
      <div class="fmt-label" title="${item.label}">${item.label}</div>
      <div class="fmt-desc" title="${item.desc}">${item.desc}</div>
      ${bottom}
      ${starBtn}
    </div>
  `;
}

// ─── MAIN RENDERER ────────────────────────────────────────────────────

export function renderAllTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'All Tools']);

  // Gather all tools grouped by category/family
  const familyData = FAMILIES.map((f) => ({
    ...f,
    tools: f.getTools(),
  }));

  const allToolsFlat = familyData.flatMap((f) => f.tools);
  const totalCount = allToolsFlat.length;

  container.innerHTML = `
    <!-- Top Header -->
    <div class="all-tools-header">
      <div class="all-tools-header-left">
        <button class="fmt-back-btn all-tools-back-btn" title="Back to Dashboard">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="fmt-category-icon" style="background:rgba(0,229,192,0.15);color:#00E5C0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          </svg>
        </div>
        <div>
          <div class="all-tools-title-row">
            <span class="explore-title">All Tools</span>
            <span class="all-tools-count-badge">${totalCount} tools</span>
          </div>
          <p class="all-tools-subtitle">Browse all offline tools and conversions, organized by category.</p>
        </div>
      </div>
    </div>

    <!-- Category Filter Pills Bar -->
    <div class="all-tools-pills-bar">
      <button type="button" class="all-tools-pill active" data-family="all">
        All <span class="all-tools-pill-badge">${totalCount}</span>
      </button>
      ${familyData.map((f) => `
        <button type="button" class="all-tools-pill" data-family="${f.id}" style="--pill-color:${f.color}">
          <span class="all-tools-pill-dot" style="background:${f.color}"></span>
          ${f.name} <span class="all-tools-pill-badge">${f.tools.length}</span>
        </button>
      `).join('')}
    </div>

    <!-- Master Directory Container -->
    <div id="all-tools-directory" class="all-tools-directory">
      ${familyData.map((f) => `
        <section class="all-tools-family-section" data-family="${f.id}">
          <div class="all-tools-family-banner" style="--fam-color:${f.color};--fam-bg:${f.bg}">
            <div class="all-tools-family-header-left">
              <div class="all-tools-family-icon">${f.icon}</div>
              <div class="all-tools-family-title-wrap">
                <h2 class="all-tools-family-title">${f.name}</h2>
                <span class="all-tools-family-count">${f.tools.length} tools</span>
              </div>
            </div>
            <div class="all-tools-family-tags" aria-label="${f.name} tool categories">
              ${f.highlights.map((h) => `
                <span class="all-tools-family-chip">
                  <span class="all-tools-chip-dot"></span>
                  ${h}
                </span>
              `).join('')}
            </div>
          </div>
          <div class="fmt-grid all-tools-grid">
            ${f.tools.map(buildCardHTML).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;

  // ─── EVENT HANDLERS ─────────────────────────────────────────────────────────

  // Back button → Dashboard
  container.querySelector('.all-tools-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });

  // ─── CARD CLICKS (IDENTICAL LOAD LOGIC) ──────────────────────────────────────
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Ignore if favourite star was clicked (handled globally)
      if (e.target.closest('.card-fav-btn')) return;

      const toolId = card.dataset.id;
      const tool = allToolsFlat.find((t) => t.id === toolId);
      if (!tool) return;

      // Check module lock
      if (card.classList.contains('fmt-card--locked')) {
        const lockedMod = card.dataset.lockedModule || getLockedModuleId(toolId);
        _handleLockedClick(lockedMod, tool.label);
        return;
      }

      // Mark card visually selected across the view
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      // Activate tool in dropzone
      setActiveTool(tool);

      // Smooth scroll up to drop zone
      _scrollToDropZone();
    });
  });

  // ─── FILTERING BY CATEGORY PILLS ───────────────────────────────────────────
  let activeFamily = 'all';
  const pills = container.querySelectorAll('.all-tools-pill');
  const sections = container.querySelectorAll('.all-tools-family-section');

  function applyFilter() {
    sections.forEach((sec) => {
      const fam = sec.dataset.family;
      const matchesFam = activeFamily === 'all' || activeFamily === fam;
      sec.style.display = matchesFam ? 'block' : 'none';
    });
  }

  // Pill click
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      activeFamily = pill.dataset.family;
      applyFilter();
    });
  });
}
