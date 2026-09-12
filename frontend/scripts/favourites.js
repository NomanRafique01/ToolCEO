/**
 * favourites.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Favourites system for ToolCEO.
 *
 * Requirements:
 *   - Stars ONLY on actual tool cards where clicking selects the tool.
 *   - Persisted to localStorage under key 'toolceo_favourites'.
 *   - Favourites sidebar route:
 *       • Heading: "★ Favourite Tools"
 *       • If no favourites: centered empty state
 *       • If favourites: same 4-column card grid, clicking card selects the tool,
 *         clicking star live-removes it from the view.
 *   - Fast, reliable, zero performance impact (NO MutationObserver DOM loops).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { setActiveTool } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';
import { setPendingLockContext } from './modules.js';

let _navigateToModule = null;

export function setNavigateToModule(fn) {
  _navigateToModule = fn;
}

// ── Storage helpers ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'toolceo_favourites';
const META_KEY    = 'toolceo_favourites_meta';

export function getFavourites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavourites(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch { /* storage full / disabled */ }
}

export function isFavourite(toolId) {
  return getFavourites().includes(toolId);
}

// ── Tool Registry ──────────────────────────────────────────────────────────────

const _toolRegistry = new Map();

function _loadMetaFromStorage() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([id, spec]) => {
        if (!_toolRegistry.has(id)) _toolRegistry.set(id, spec);
      });
    }
  } catch {}
}

function _saveSingleMeta(id, spec) {
  try {
    const raw = localStorage.getItem(META_KEY);
    const obj = (raw ? JSON.parse(raw) : {}) || {};
    obj[id] = spec;
    localStorage.setItem(META_KEY, JSON.stringify(obj));
  } catch {}
}

// Pre-seeded registry for primary selectable tools
const PRESEEDED_TOOLS = [
  // PDF Tools
  { id: 'merge', label: 'Merge PDFs', desc: 'Combine multiple PDFs into one', color: '#FF6B6B', bg: 'rgba(255,107,107,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="6" height="8" rx="1.2" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="3" width="6" height="8" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M7 7h2M10 7l-1.5 2M10 7l-1.5-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="4" y="11" width="8" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>' },
  { id: 'split', label: 'Split PDF', desc: 'Extract pages into separate files', color: '#FB923C', bg: 'rgba(251,146,60,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 1.5"/><line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 1.5"/><path d="M8 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' },
  { id: 'compress', label: 'Compress PDF', desc: 'Reduce file size without quality loss', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M5 5l1.5 1.5M11 5l-1.5 1.5M5 11l1.5-1.5M11 11l-1.5-1.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>' },
  { id: 'encrypt', label: 'Encrypt / Decrypt', desc: 'Password-protect or unlock PDFs', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="11" r="1.2" fill="currentColor"/><line x1="8" y1="12.2" x2="8" y2="13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
  { id: 'rotate', label: 'Rotate / Delete Pages', desc: 'Rotate or delete individual or all pages', color: '#00E5C0', bg: 'rgba(0,229,192,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M13 8a5 5 0 1 1-1.46-3.54" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M11 1v4h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
  { id: 'extractor', label: 'Extract Images', desc: 'Pull embedded images out of PDFs', color: '#F472B6', bg: 'rgba(244,114,182,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="9" height="12" rx="1.4" stroke="currentColor" stroke-width="1.3"/><path d="M8 2l3 3H8V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="5" y="6" width="9" height="7" rx="1.2" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8.3" r="0.9" stroke="currentColor" stroke-width="1"/><path d="M5 12l2.4-2.4 1.8 1.8 1.4-1.4L14 12" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'watermark', label: 'WaterMark/Add Sign Pdf', desc: 'Add text watermarks or signatures', color: '#38BDF8', bg: 'rgba(56,189,248,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><text x="3.5" y="11.5" font-size="7" font-weight="700" fill="currentColor" opacity="0.5" font-family="sans-serif">W</text><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.35"/></svg>' },
  { id: 'editor', label: 'Edit PDF', desc: 'Prompt-based PDF editing workspace', color: '#00E5C0', bg: 'rgba(0,229,192,0.15)', tag: 'Tool', bottomHTML: '<div class="fmt-tag fmt-tag--tool">Tool</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="2" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5l4 4H8V1.5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M4.5 10.5l.6-2 4.7-4.7a1.2 1.2 0 0 1 1.7 1.7L6.8 10.2l-2.3.3Z" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.1 4.5l1.7 1.7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>' },

  // PDF Conversions
  { id: 'pdf-excel', label: 'PDF → Excel', desc: 'Extract tables from PDF into spreadsheet', color: '#34D399', bg: 'rgba(52,211,153,0.15)', tag: 'Convert', bottomHTML: '<div class="fmt-tag fmt-tag--convert">Convert</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><line x1="9" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="9" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="11" y1="5" x2="11" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><line x1="13" y1="5" x2="13" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>' },
  { id: 'pdf-word', label: 'PDF → Word', desc: 'Convert PDF to editable Word', color: '#60A5FA', bg: 'rgba(96,165,250,0.15)', tag: 'Convert', bottomHTML: '<div class="fmt-tag fmt-tag--convert">Convert</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><line x1="11" y1="6" x2="13" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><line x1="11" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>' },
  { id: 'pdf-html', label: 'PDF → HTML', desc: 'Export PDF as a web page', color: '#FB923C', bg: 'rgba(251,146,60,0.15)', tag: 'Convert', bottomHTML: '<div class="fmt-tag fmt-tag--convert">Convert</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>' },

  // Audio Formats (each selects an audio conversion tool)
  { id: 'mp3', label: 'MP3', desc: 'MPEG Audio Layer III', color: '#FB923C', bg: 'rgba(251,146,60,0.15)', bottomHTML: '<div class="fmt-ext">.mp3</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="9" r="3" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="9" r="1" fill="currentColor"/><path d="M11 9V4l3-1v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'wav', label: 'WAV', desc: 'Waveform Audio File', color: '#60A5FA', bg: 'rgba(96,165,250,0.15)', bottomHTML: '<div class="fmt-ext">.wav</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><polyline points="1,8 3,8 4,4 5,12 6,6 7,10 8,8 9,5 10,11 11,7 12,9 13,8 15,8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>' },
  { id: 'flac', label: 'FLAC', desc: 'Free Lossless Audio Codec', color: '#34D399', bg: 'rgba(52,211,153,0.15)', bottomHTML: '<div class="fmt-ext">.flac</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="5" y1="4" x2="5" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="11" y1="4" x2="11" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="2" y1="6" x2="2" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="14" y1="6" x2="14" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>' },
  { id: 'aac', label: 'AAC', desc: 'Advanced Audio Coding', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', bottomHTML: '<div class="fmt-ext">.aac</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M5 12V6l3-2 3 2v6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
  { id: 'ogg', label: 'OGG', desc: 'Ogg Vorbis Audio', color: '#FBBF24', bg: 'rgba(251,191,36,0.15)', bottomHTML: '<div class="fmt-ext">.ogg</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 8a2.5 2.5 0 0 1 5 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="8" cy="8" r="1" fill="currentColor"/></svg>' },
  { id: 'wma', label: 'WMA', desc: 'Windows Media Audio', color: '#F472B6', bg: 'rgba(244,114,182,0.15)', bottomHTML: '<div class="fmt-ext">.wma</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="4" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M6 7l3-2v6l-3-2V7Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 6.5a2.5 2.5 0 0 1 0 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' },
  { id: 'm4a', label: 'M4A', desc: 'MPEG-4 Audio', color: '#2DD4BF', bg: 'rgba(45,212,191,0.15)', bottomHTML: '<div class="fmt-ext">.m4a</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="9" r="3" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="9" r="1" fill="currentColor"/><line x1="11" y1="9" x2="14" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="14" y1="9" x2="14" y2="5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="14" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
  { id: 'opus', label: 'OPUS', desc: 'Opus Interactive Audio', color: '#84CC16', bg: 'rgba(132,204,22,0.15)', bottomHTML: '<div class="fmt-ext">.opus</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M4 10V6l4-2 4 2v4l-4 2-4-2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><line x1="8" y1="4" x2="8" y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>' },

  // Image Compressor
  { id: 'image_compressor', label: 'Image Compressor', desc: 'Compress images offline, any format', color: '#F472B6', bg: 'rgba(244,114,182,0.15)', tag: 'Compress', bottomHTML: '<div class="fmt-tag fmt-tag--compress">Compress</div>', iconHTML: '<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 4 v4 M9 6 h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' },
];

PRESEEDED_TOOLS.forEach((spec) => {
  _toolRegistry.set(spec.id, spec);
});

_loadMetaFromStorage();

function _scrapeFromCard(cardEl) {
  const id = cardEl.dataset.id || cardEl.dataset.format || null;
  if (!id) return null;

  const labelEl  = cardEl.querySelector('.fmt-label, .tool-name');
  const descEl   = cardEl.querySelector('.fmt-desc, .tool-formats');
  const iconEl   = cardEl.querySelector('.fmt-icon-box, .tool-icon-box');
  const bottomEl = cardEl.querySelector('.fmt-ext, .fmt-tag');

  const color = cardEl.style.getPropertyValue('--fmt-color').trim() || '#00E5C0';
  const bg    = cardEl.style.getPropertyValue('--fmt-bg').trim()    || 'rgba(0,229,192,0.15)';

  const spec = {
    id,
    label     : labelEl  ? labelEl.textContent.trim()  : id,
    desc      : descEl   ? descEl.textContent.trim()   : '',
    color,
    bg,
    iconHTML  : iconEl   ? iconEl.innerHTML             : '',
    bottomHTML: bottomEl ? bottomEl.outerHTML           : '',
    dataId    : cardEl.dataset.id || null,
    dataFormat: cardEl.dataset.format || null,
  };

  _toolRegistry.set(id, spec);
  _saveSingleMeta(id, spec);
  return spec;
}

// ── Star Toggle Logic ──────────────────────────────────────────────────────────

export function toggleFavouriteById(toolId, cardEl = null) {
  if (cardEl && !_toolRegistry.has(toolId)) {
    _scrapeFromCard(cardEl);
  }

  const favs = getFavourites();
  const idx  = favs.indexOf(toolId);
  if (idx === -1) {
    favs.push(toolId);
  } else {
    favs.splice(idx, 1);
  }
  saveFavourites(favs);
  return favs.includes(toolId); // true = now favourited
}

// ── Global click delegation for star buttons ───────────────────────────────────

let _delegationBound = false;

function _bindStarDelegation() {
  if (_delegationBound) return;
  _delegationBound = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.card-fav-btn');
    if (!btn) return;

    // NEVER trigger card click / tool navigation
    e.stopPropagation();
    e.preventDefault();

    const id = btn.dataset.favId;
    if (!id) return;

    const cardEl = btn.closest('.tool-card, .fmt-card');

    const alreadyFav = isFavourite(id);
    if (!alreadyFav) {
      // Trying to add to favourites — verify the tool's required module is installed
      const lockedMod = (cardEl && cardEl.dataset.lockedModule) || getLockedModuleId(id);
      if (lockedMod) {
        const toolLabel = cardEl?.querySelector('.fmt-label, .tool-card-title, .fmt-title')?.textContent?.trim()
          || _toolRegistry.get(id)?.label
          || id;
        if (_navigateToModule) {
          _navigateToModule(lockedMod, toolLabel);
        }
        return;
      }
    }

    const nowFav = toggleFavouriteById(id, cardEl);

    // Sync all star buttons for this id currently in the DOM
    document.querySelectorAll(`.card-fav-btn[data-fav-id="${CSS.escape(id)}"]`).forEach((b) => {
      b.textContent = nowFav ? '★' : '☆';
      b.title       = nowFav ? 'Remove from Favourites' : 'Add to Favourites';
      b.setAttribute('aria-label', b.title);
      b.classList.toggle('is-favourite', nowFav);
    });

    // In Favourites view: unstarring immediately removes card from view
    if (!nowFav) {
      const favGrid = document.getElementById('fav-grid-container');
      if (favGrid && cardEl && cardEl.classList.contains('fav-page-card')) {
        cardEl.remove();
        if (favGrid.querySelectorAll('.fmt-card').length === 0) {
          favGrid.innerHTML = _emptyStateHTML();
        }
      }
    }
  }, true); // capture phase
}

// ── Favourites Page Renderer ───────────────────────────────────────────────────

function _emptyStateHTML() {
  return '<div class="fav-empty-state"><div class="fav-empty-icon">☆</div><p class="fav-empty-text">No favourites yet. Star a tool to add it here.</p></div>';
}

function _buildFavCardHTML(spec) {
  const lockedMod  = getLockedModuleId(spec.id);
  const lockClass  = lockedMod ? ' fmt-card--locked' : '';
  const lockedAttr = lockedMod ? ` data-locked-module="${lockedMod}"` : '';
  const dataAttr = spec.dataFormat
    ? `data-format="${spec.dataFormat}" data-id="${spec.id}"`
    : `data-id="${spec.id}"`;

  const starBtn = `<button class="card-fav-btn is-favourite" type="button" title="Remove from Favourites" aria-label="Remove from Favourites" data-fav-id="${spec.id}" style="color:${spec.color || '#00E5C0'}">★</button>`;

  return `<div class="fmt-card fav-page-card${lockClass}" ${dataAttr}${lockedAttr} style="--fmt-color:${spec.color};--fmt-bg:${spec.bg}"><div class="fmt-card-top"><div class="fmt-icon-box">${spec.iconHTML}</div><span class="fmt-arrow">›</span></div><div class="fmt-label">${spec.label}</div><div class="fmt-desc">${spec.desc}</div>${spec.bottomHTML || ''}${starBtn}</div>`;
}

function _buildFavCardHTML_byId(id) {
  const spec = _toolRegistry.get(id);
  if (!spec) {
    const lockedMod  = getLockedModuleId(id);
    const lockClass  = lockedMod ? ' fmt-card--locked' : '';
    const lockedAttr = lockedMod ? ` data-locked-module="${lockedMod}"` : '';
    return `<div class="fmt-card fav-page-card${lockClass}" data-id="${id}"${lockedAttr} style="--fmt-color:#00E5C0;--fmt-bg:rgba(0,229,192,0.15)"><div class="fmt-card-top"><div class="fmt-icon-box"><svg width="26" height="26" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/></svg></div><span class="fmt-arrow">›</span></div><div class="fmt-label">${id}</div><div class="fmt-desc">Favourited Tool</div><button class="card-fav-btn is-favourite" type="button" title="Remove from Favourites" aria-label="Remove from Favourites" data-fav-id="${id}" style="color:#00E5C0">★</button></div>`;
  }
  return _buildFavCardHTML(spec);
}

export function renderFavourites(container) {
  // Update breadcrumb
  const bar = document.getElementById('breadcrumb-bar');
  if (bar) {
    bar.innerHTML = '<span class="bc-segment"><span class="bc-label">Dashboard</span><span class="bc-sep" aria-hidden="true">/</span></span><span class="bc-segment"><span class="bc-label bc-label--active">Favourites</span></span>';
  }

  const favIds = getFavourites();

  container.innerHTML =
    '<div class="explore-header">' +
    '<span class="explore-title">★ Favourite Tools</span>' +
    '</div>' +
    '<div id="fav-grid-container">' +
    (favIds.length === 0
      ? _emptyStateHTML()
      : `<div class="fmt-grid">${favIds.map(_buildFavCardHTML_byId).join('')}</div>`) +
    '</div>';

  if (favIds.length === 0) return;

  // Wire card clicks: selecting a tool in Favourites view activates it in the dropzone!
  container.querySelectorAll('.fav-page-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.id || card.dataset.format || null;
      const lockedMod = (card && card.dataset.lockedModule) || (id ? getLockedModuleId(id) : null);
      if (lockedMod) {
        const spec = id ? _toolRegistry.get(id) : null;
        const toolLabel = spec?.label || card.querySelector('.fmt-label')?.textContent?.trim() || id || 'This tool';
        if (_navigateToModule) {
          _navigateToModule(lockedMod, toolLabel);
        }
        return;
      }

      const spec = id ? _toolRegistry.get(id) : null;
      if (!spec) return;

      const isConvert = (spec.tag === 'Convert') || spec.label.includes('→') || spec.label.includes('to');
      const mainText  = isConvert
        ? `Drop file to Convert to ${spec.label}`
        : `Select File to ${spec.label}`;
      const subText   = isConvert
        ? `or click to select a file for ${spec.label} conversion`
        : `or click to pick your file`;

      setActiveTool({
        id      : spec.id,
        label   : spec.label,
        mainText: mainText,
        subText : subText,
        icon    : spec.iconHTML,
        color   : spec.color,
        bg      : spec.bg,
        tag     : spec.tag || (isConvert ? 'Convert' : 'Tool'),
      });

      // Highlight selected card visually
      container.querySelectorAll('.fav-page-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      // Smooth scroll to hero dropzone
      const mc = document.getElementById('main-content');
      if (mc) mc.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/**
 * On fresh install or when a new build is detected, clear favourites so the app
 * starts completely brand new with zero favourite tools.
 */
export async function checkCleanInstallFavourites() {
  try {
    let currentBuildId = null;
    if (window.electronAPI && window.electronAPI.getBuildInfo) {
      const info = await window.electronAPI.getBuildInfo();
      currentBuildId = info ? info.buildId : null;
    }
    if (!currentBuildId) {
      try {
        const res = await fetch('./build-info.json');
        if (res.ok) {
          const info = await res.json();
          currentBuildId = info ? info.buildId : null;
        }
      } catch (_) {}
    }

    if (currentBuildId) {
      const storedBuildId = localStorage.getItem('toolceo_installed_build_id');
      if (storedBuildId !== currentBuildId) {
        console.log(`[ToolCEO] New install/build detected (${currentBuildId}). Clearing favourites for fresh install.`);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(META_KEY);
        _toolRegistry.clear();
        localStorage.setItem('toolceo_installed_build_id', currentBuildId);
      }
    }
  } catch (err) {
    console.warn('[ToolCEO] Error checking clean install state for favourites:', err);
  }
}

// ── Public init ───────────────────────────────────────────────────────────────

export function initFavourites(options = {}) {
  checkCleanInstallFavourites();
  if (options.navigateToModule) {
    _navigateToModule = options.navigateToModule;
  } else if (options.activateNav && !_navigateToModule) {
    _navigateToModule = (moduleId, toolLabel) => {
      setPendingLockContext({ moduleId, toolLabel });
      options.activateNav('Modules');
    };
  }
  _bindStarDelegation();
}
