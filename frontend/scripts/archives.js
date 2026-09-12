/**
 * Archives category browser.
 * Convert category now shows 5 format families, each with live conversion sub-tools.
 */

import { setBreadcrumb } from './navigation.js';
import { isFavourite } from './favourites.js';
import { FAMILY_COLORS } from './toolFamily.js';
import { setActiveTool } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';
import { ARCHIVE_CONVERT_IDS } from '../tools/archives/archive_convert.js';
import { handleArchiveFilesPicked } from '../tools/archives/archive_extract.js';

let _navigateToModule = null;
export function setNavigateToModule(fn) { _navigateToModule = fn; }

// ─── ZIP EXTRACT ROUTER ───────────────────────────────────────────────────────

let _activateNav = null;
/** Called by navigation.js after activateNav is defined. */
export function setActivateNavForArchives(fn) { _activateNav = fn; }

/**
 * Programmatically route a ZIP File object to the Archive Extract tool.
 * Navigates to Archives → Extract category, selects "ZIP Extract", then
 * hands the file to the extract handler — exactly as if the user dropped it.
 *
 * @param {File}     file        The ZIP file to extract.
 * @param {Function} [activateNav]  Optional override; falls back to stored ref.
 */
export function routeZipToExtractor(file, activateNav) {
  const nav = activateNav || _activateNav;
  if (!nav) return;

  // 1. Navigate sidebar to Archives
  nav('Archives');

  // 2. After Archives landing renders, drill into Extract category and pick ZIP tool
  setTimeout(() => {
    const container = document.getElementById('explore-section');
    if (!container) return;

    const extractCat = CATEGORIES.find((c) => c.id === 'extract');
    if (!extractCat) return;

    const tools = toolRecords(extractCat);
    const zipTool = tools.find((t) => t.id === 'archive-extract-zip');
    if (!zipTool) return;

    // Render the Extract category panel
    renderCategory(container, nav, extractCat);

    // Select the ZIP Extract card visually
    setTimeout(() => {
      const card = container.querySelector(`.fmt-card[data-id="archive-extract-zip"]`);
      if (card) {
        container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      }

      // Activate tool then hand file to handler
      setActiveTool(zipTool);
      scrollToDropZone();

      setTimeout(() => {
        handleArchiveFilesPicked(file);
      }, 80);
    }, 80);
  }, 150);
}

function _handleLockedClick(moduleId, toolLabel) {
  if (_navigateToModule) _navigateToModule(moduleId, toolLabel);
}

const COLORS = {
  archive: FAMILY_COLORS.archive,
  document: FAMILY_COLORS.document,
  image: FAMILY_COLORS.image,
  audio: FAMILY_COLORS.audio,
  video: FAMILY_COLORS.video,
  ebook: FAMILY_COLORS.ebook,
  data: FAMILY_COLORS.data,
  pink: '#F472B6',
  cyan: '#00E5C0',
  navy: '#0d0d1a',
};

const COLOR_BACKGROUNDS = {
  [COLORS.archive]: 'rgba(132,204,22,0.15)',
  [COLORS.document]: 'rgba(255,107,107,0.15)',
  [COLORS.image]: 'rgba(167,139,250,0.15)',
  [COLORS.audio]: 'rgba(251,146,60,0.15)',
  [COLORS.video]: 'rgba(56,189,248,0.15)',
  [COLORS.ebook]: 'rgba(251,191,36,0.15)',
  [COLORS.data]: 'rgba(45,212,191,0.15)',
  [COLORS.pink]: 'rgba(244,114,182,0.15)',
  [COLORS.cyan]: 'rgba(0,229,192,0.15)',
  '#EF4444': 'rgba(239,68,68,0.15)',
  '#06B6D4': 'rgba(6,182,212,0.15)',
  '#22C55E': 'rgba(34,197,94,0.15)',
  '#8B5CF6': 'rgba(139,92,246,0.15)',
  '#F59E0B': 'rgba(245,158,11,0.15)',
};

const ICONS = {
  // Archive box with compression bands — "Create"
  archive: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 8 6 4h12l3 4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 11.5h5M9.5 14.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="10" y="5" width="4" height="3" rx="0.5" stroke="currentColor" stroke-width="1.3"/></svg>`,
  // Bursting open box with upward arrow — "Extract"
  extract: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10h16v10H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 10 7 6h10l3 4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 3v9M9.5 5.5 12 3l2.5 2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 14h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  // Two files with bidirectional arrows — "Convert"
  convert: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="5" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="9" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M10 9h4M10 9l-1.5 1.5M14 9l1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 15h4M10 15l-1.5-1.5M14 15l1.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // Wrench over a gear — "Utility"
  utility: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="5" stroke="currentColor" stroke-width="1.7"/><circle cx="14" cy="14" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 4.5A2.5 2.5 0 0 1 9.5 7l-1.8 1.8A2.5 2.5 0 0 1 5 4.5zM7.7 8.8l1.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // Clean document with corner fold
  file: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3.5h8l4 4v13H6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3.5v4h4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12h6M9 16h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  // Folder with tab and contents line
  folder: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 8.5h17v11h-17z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3.5 8.5v-2h5.5l2 2h9" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 13h10M7 16.5h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

const TOOL_ICONS = [
  // ── CREATE TOOLS (offset 0) ──────────────────────────────────────────────────

  // [0] Files to ZIP — zipper pull over stacked files
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="9" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 9 6.5 5h11L21 9" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><rect x="10" y="5.5" width="4" height="3.5" rx="0.8" stroke="currentColor" stroke-width="1.3"/><path d="M11 7h2M11 5.5v-1h2v1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M8 14h8M8 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  // [1] Files to TAR — tape reel wrapping files
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 7 7 4h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 11h16" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M9 14.5h6M9 17h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 7h16" stroke="currentColor" stroke-width="1.4"/></svg>`,

  // [2] Files to TAR.GZ — compressed spring/coil wrapping box
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 8 6 5h12l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.5 5c0-1 1-1 1-2s-1-1-1-2M9.5 5c0-1 1-1 1-2s-1-1-1-2M12.5 5c0-1 1-1 1-2s-1-1-1-2M15.5 5c0-1 1-1 1-2s-1-1-1-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 13h8M8 16h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  // [3] Files to TAR.BZ2 — box with brick/block compression pattern
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 8 6 5h12l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 12h18M3 16h18" stroke="currentColor" stroke-width="1.2" stroke-dasharray="0"/><path d="M9 12v4M15 12v4" stroke="currentColor" stroke-width="1.2"/><path d="M6 16v4M12 16v4M18 16v4" stroke="currentColor" stroke-width="1.2"/></svg>`,

  // [4] Files to 7Z — bold "7" badge over archive
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8.5" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 8.5 6 5h12l3 3.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 11.5h5l-3.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 13.5h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [5] Folder to ZIP — open folder zipped shut
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h18v12H3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 8V6h5l2 2h11" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v8M10 12l2-2 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 17h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [6] Folder to 7Z — folder with 7 emblem
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h18v12H3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 8V6h5l2 2h11" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 11.5h6l-4 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 13.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,

  // [7] Files to RAR — business briefcase with files
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="9" width="20" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 9V7a4 4 0 0 1 8 0v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M2 15h20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="10" y="13.5" width="4" height="3" rx="0.8" stroke="currentColor" stroke-width="1.4"/><path d="M7 13v4M17 13v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="1.5 1.5"/></svg>`,

  // [8] Files to TAR.XZ — diamond-compression pattern over box
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 8 6 5h12l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 11 12 19l4-8M8 11h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // [9] Files to WIM — Windows disc/image icon
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="13" r="7" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="13" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M9 4l-1-2M12 4V2M15 4l1-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5.5 9.5 4 8M18.5 9.5 20 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // ── EXTRACT TOOLS (offset 8) ─────────────────────────────────────────────────

  // [10] ZIP Extract — box with arrow popping upward and unzipping
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11h16v9H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 11 7 8h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 5v7M9.5 7.5 12 5l2.5 2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="10" y="8.5" width="4" height="2.5" rx="0.5" stroke="currentColor" stroke-width="1.2"/></svg>`,

  // [11] RAR Extract — ribbon unrolling with arrow
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 10 7 7h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 7.5c0-2 3-2 4-2s4 0 4 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12 5V3M12 3l-2 2M12 3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 15h8M8 18h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [12] 7Z Extract — bold "7" splitting open
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10h16v10H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 10 7 7h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 4h6l-3.5 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 5.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12 13v5M10 15.5l2-2.5 2 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // [13] TAR Extract — tape unwinding arrow
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 10 7 7h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 13h16" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 2"/><path d="M10 4c-1 0-2 1-2 2s1 2 2 2h4c1 0 2-1 2-2s-1-2-2-2h-4z" stroke="currentColor" stroke-width="1.4"/><path d="M12 6V3M12 3l-2 2M12 3l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // [14] TAR.GZ Extract — coil unwinding upward
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 11 7 8h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 8c0-1 1-1 1-2s-1-1-1-2M10 8c0-1 1-1 1-2s-1-1-1-2M13 8c0-1 1-1 1-2s-1-1-1-2M16 8c0-1 1-1 1-2s-1-1-1-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 15.5h8M8 18h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [15] TAR.BZ2 Extract — brick block disassembling
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 11 7 8h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M4 15h16M9 11v4M15 11v4" stroke="currentColor" stroke-width="1.2"/><path d="M12 4l-3 4h6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 4V2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  // [16] TAR.XZ Extract — diamond pattern with exit arrow
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 11 7 8h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 15 12 11l3 4M9 15h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5V3M10 5l2-2 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // [17] GZ Extract — single wave decompressing
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 11 7 8h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6 4c1.5 1.5 3 1.5 4 0s2.5-1.5 4 0 2.5 1.5 4 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 6v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 16h8M8 18.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [18] BZ2 Extract — block letter B breaking open
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 10 7 7h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 3.5h3a2 2 0 0 1 0 4H9M9 3.5v7M9 7.5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 14.5h6M9 17h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [19] XZ Extract — X-mark with upward arrow (cross-compress release)
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 11 7 8h10l3 3" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 3.5 12 7.5l4-4M8 7.5l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 15h8M8 17.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [20] CAB Extract — cabinet drawer sliding open
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18" stroke="currentColor" stroke-width="1.7"/><path d="M8 9h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8 16h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="9" r="0.8" fill="currentColor"/><circle cx="12" cy="16" r="0.8" fill="currentColor"/></svg>`,

  // [21] DMG Extract — Apple disc image shape
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="14" rx="8" ry="5" stroke="currentColor" stroke-width="1.7"/><ellipse cx="12" cy="13" rx="8" ry="5" stroke="currentColor" stroke-width="1.7"/><path d="M4 11c0-3 3.6-5 8-5s8 2 8 5" stroke="currentColor" stroke-width="1.7"/><path d="M12 3v4M10 5l2-2 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  // ── CONVERT TOOLS (offset 21 in original, now correct offset) ──────────────

  // [22] ZIP to 7Z — two format badges with arrow between
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M4 10h4l-2 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 11.5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M10 12h4M12 10l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M16 10h4l-2.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 12h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,

  // [23] ZIP to TAR.GZ — zip badge to coil/wave badge
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M4 10h4l-2 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 12h4M12 10l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M15 10c.8.8 1.5.8 2 0s1.3-.8 2 0 1.3.8 2 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M15 13c.8.8 1.5.8 2 0s1.3-.8 2 0 1.3.8 2 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,

  // [24] RAR to ZIP — ribbon badge to zip badge
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M4 10h3a1 1 0 0 1 0 2H4M4 10v4M4 12h2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 12h4M12 10l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="16.5" y="9.5" width="3" height="2" rx="0.4" stroke="currentColor" stroke-width="1.2"/><path d="M17 11.5v2.5M19 11.5v2.5M17 14h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,

  // [25] 7Z to ZIP — 7 badge to zip badge
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M4 10h4l-2 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 12h4M12 14l2-2-2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="16.5" y="9.5" width="3" height="2" rx="0.4" stroke="currentColor" stroke-width="1.2"/><path d="M17 11.5v2.5M19 11.5v2.5M17 14h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,

  // [26] TAR to ZIP — tape reel to zip badge
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M4 10h6M4 12.5h6M4 15h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10 12h4M12 10l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="16.5" y="9.5" width="3" height="2" rx="0.4" stroke="currentColor" stroke-width="1.2"/><path d="M17 11.5v2.5M19 11.5v2.5M17 14h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,

  // [27] TAR.GZ to ZIP — coil/wave to zip badge
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M3 10c.8.8 1.5.8 2 0s1.3-.8 2 0 1.3.8 2 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M3 13c.8.8 1.5.8 2 0s1.3-.8 2 0 1.3.8 2 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10 12h4M12 10l2 2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="7" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="16.5" y="9.5" width="3" height="2" rx="0.4" stroke="currentColor" stroke-width="1.2"/><path d="M17 11.5v2.5M19 11.5v2.5M17 14h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,

  // ── UTILITY TOOLS (offset 27 in original, now correct) ─────────────────────

  // [28] Archive Inspector — magnifying glass over document list
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" stroke-width="1.7"/><path d="m14.5 14.5 5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 9h5M8 11.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,

  // [29] Archive Splitter — single archive splitting into two
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="4" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 13v3M12 16l-5 3h-2M12 16l5 3h2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="2" y="19" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.4"/><rect x="16" y="19" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M9 7h6M9 9.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,

  // [30] Archive Merger — two archives joining into one
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="4" width="7" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="15" y="4" width="7" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M9 8l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="8" y="17" width="8" height="5" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 13v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,

  // [31] Password Protect Archive — shield with lock (AES-256 ZIP/7Z/RAR)
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2L4 6v6c0 5.25 3.5 9.8 8 11 4.5-1.2 8-5.75 8-11V6L12 2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><rect x="9" y="10" width="6" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M10 10V8.5a2 2 0 0 1 4 0V10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="12.5" r="0.8" fill="currentColor"/></svg>`,

  // [32] Remove Archive Password — shield unlocked with key (ZIP/7Z/RAR)
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2L4 6v6c0 5.25 3.5 9.8 8 11 4.5-1.2 8-5.75 8-11V6L12 2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="10" cy="11" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M11.7 11h3.3M14 9.8v2.4M15.5 9.8v2.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M9 14l1-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,

  // [33] Duplicate Finder — two identical docs with equality sign
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="7.5" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M5 9h3.5M5 11.5h2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="13.5" y="5" width="7.5" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><path d="M15.5 9H19M15.5 11.5H18" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10.5 10.5h3M10.5 13h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
];

const CATEGORIES = [
  {
    id: 'compress-create',
    label: 'Create Tools',
    desc: 'ZIP, TAR, 7Z, RAR, WIM, ISO & more',
    icon: ICONS.archive,
    color: COLORS.ebook,
    bg: COLOR_BACKGROUNDS[COLORS.ebook],
    tag: 'Create',
    tools: [
      ['Files to ZIP',     'Create a ZIP archive from selected files.'],
      ['Files to TAR',     'Bundle selected files into a TAR archive.'],
      ['Files to TAR.GZ',  'Create a compressed TAR.GZ archive.'],
      ['Files to TAR.BZ2', 'Create a BZIP2-compressed TAR archive.'],
      ['Files to 7Z',      'Create a 7Z archive from selected files.'],
      ['Folder to ZIP',    'Compress a folder into a ZIP archive.'],
      ['Folder to 7Z',     'Compress a folder into a 7Z archive.'],
      ['Files to RAR',     'Create a RAR archive from selected files.'],
      ['Files to TAR.XZ',  'Create a high-compression TAR.XZ archive.'],
      ['Files to WIM',     'Create a Windows Imaging Format (WIM) archive.'],
    ],
  },
  {
    id: 'extract',
    label: 'Extract Tools',
    desc: 'ZIP, RAR, 7Z, TAR & more',
    icon: ICONS.extract,
    color: COLORS.cyan,
    bg: COLOR_BACKGROUNDS[COLORS.cyan],
    tag: 'Extract',
    tools: [
      ['ZIP Extract', 'Extract files from a ZIP archive.'],
      ['RAR Extract', 'Extract files from a RAR archive.'],
      ['7Z Extract', 'Extract files from a 7Z archive.'],
      ['TAR Extract', 'Extract files from a TAR archive.'],
      ['TAR.GZ Extract', 'Extract files from a TAR.GZ archive.'],
      ['TAR.BZ2 Extract', 'Extract files from a TAR.BZ2 archive.'],
      ['TAR.XZ Extract', 'Extract files from a TAR.XZ archive.'],
      ['GZ Extract', 'Extract files from a GZ archive.'],
      ['BZ2 Extract', 'Extract files from a BZ2 archive.'],
      ['XZ Extract', 'Extract files from an XZ archive.'],
      ['CAB Extract', 'Extract files from a CAB archive.'],
      ['DMG Extract', 'Extract files from a DMG image.'],
    ],
  },
  {
    id: 'convert',
    label: 'Convert Tools',
    desc: 'ZIP to 7Z, RAR to ZIP & more',
    icon: ICONS.convert,
    color: COLORS.video,
    bg: COLOR_BACKGROUNDS[COLORS.video],
    tag: 'Convert',
    tools: [
      ['ZIP to 7Z', 'Convert a ZIP archive into 7Z format.'],
      ['ZIP to TAR.GZ', 'Convert a ZIP archive into TAR.GZ format.'],
      ['RAR to ZIP', 'Convert a RAR archive into ZIP format.'],
      ['7Z to ZIP', 'Convert a 7Z archive into ZIP format.'],
      ['TAR to ZIP', 'Convert a TAR archive into ZIP format.'],
      ['TAR.GZ to ZIP', 'Convert a TAR.GZ archive into ZIP format.'],
    ],
  },
  {
    id: 'utility',
    label: 'Utility Tools',
    desc: 'Inspect, split, merge, protect & more',
    icon: ICONS.utility,
    color: COLORS.image,
    bg: COLOR_BACKGROUNDS[COLORS.image],
    tag: 'Utility',
    tools: [
      ['Archive Inspector', 'Inspect archive contents and metadata.'],
      ['Archive Splitter', 'Split a large archive into smaller parts.'],
      ['Archive Merger', 'Merge archive parts into one archive.'],
      ['Password Protect Archive', 'Add AES-256 password to archives (ZIP, 7Z, RAR).'],
      ['Remove Archive Password', 'Remove password & decrypt archives (ZIP, 7Z, RAR).'],
      ['Duplicate Finder in Archive', 'Find duplicate files inside an archive.'],
    ],
  },
];

// ─── ARCHIVE CONVERT CATEGORY DEFINITIONS ────────────────────────────────────

const CONVERT_CATEGORIES = [
  {
    id: 'conv-zip',
    label: 'ZIP Convert Tools',
    desc: 'Convert ZIP archives to 7Z, TAR, TAR.GZ, and RAR.',
    color: COLORS.archive,           // #84CC16 — lime
    bg: COLOR_BACKGROUNDS[COLORS.archive],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.zip',
    tools: [
      { id: 'arc-zip-to-7z',     label: 'ZIP to 7Z',     desc: 'Convert a ZIP archive into 7Z format.',    dstExt: '.7z',     color: COLORS.archive },
      { id: 'arc-zip-to-tar',    label: 'ZIP to TAR',    desc: 'Convert a ZIP archive into TAR format.',   dstExt: '.tar',    color: COLORS.data },
      { id: 'arc-zip-to-tar-gz', label: 'ZIP to TAR.GZ', desc: 'Convert a ZIP archive into TAR.GZ format.',dstExt: '.tar.gz', color: COLORS.audio },
      { id: 'arc-zip-to-rar',    label: 'ZIP to RAR',    desc: 'Convert a ZIP archive into RAR format.',   dstExt: '.rar',    color: COLORS.document },
    ],
  },
  {
    id: 'conv-tar',
    label: 'TAR Convert Tools',
    desc: 'Convert TAR archives to ZIP, 7Z, GZ, and RAR.',
    color: COLORS.data,              // #2DD4BF — teal
    bg: COLOR_BACKGROUNDS[COLORS.data],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.tar',
    tools: [
      { id: 'arc-tar-to-zip', label: 'TAR to ZIP', desc: 'Convert a TAR archive into ZIP format.', dstExt: '.zip', color: COLORS.archive },
      { id: 'arc-tar-to-7z',  label: 'TAR to 7Z',  desc: 'Convert a TAR archive into 7Z format.',  dstExt: '.7z',  color: COLORS.data },
      { id: 'arc-tar-to-gz',  label: 'TAR to GZ',  desc: 'Convert a TAR archive into GZ format.',  dstExt: '.gz',  color: COLORS.audio },
      { id: 'arc-tar-to-rar', label: 'TAR to RAR', desc: 'Convert a TAR archive into RAR format.', dstExt: '.rar', color: COLORS.ebook },
    ],
  },
  {
    id: 'conv-7z',
    label: '7Z Convert Tools',
    desc: 'Convert 7Z archives to ZIP, TAR, TAR.GZ, and RAR.',
    color: COLORS.image,             // #A78BFA — violet
    bg: COLOR_BACKGROUNDS[COLORS.image],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.7z',
    tools: [
      { id: 'arc-7z-to-zip',    label: '7Z to ZIP',    desc: 'Convert a 7Z archive into ZIP format.',     dstExt: '.zip',    color: COLORS.image },
      { id: 'arc-7z-to-tar',    label: '7Z to TAR',    desc: 'Convert a 7Z archive into TAR format.',     dstExt: '.tar',    color: COLORS.data },
      { id: 'arc-7z-to-tar-gz', label: '7Z to TAR.GZ', desc: 'Convert a 7Z archive into TAR.GZ format.',  dstExt: '.tar.gz', color: COLORS.audio },
      { id: 'arc-7z-to-rar',    label: '7Z to RAR',    desc: 'Convert a 7Z archive into RAR format.',     dstExt: '.rar',    color: '#EF4444' },
    ],
  },
  {
    id: 'conv-tar-gz',
    label: 'TAR.GZ Convert Tools',
    desc: 'Convert TAR.GZ archives to ZIP, 7Z, TAR, and RAR.',
    color: COLORS.audio,             // #FB923C — orange
    bg: COLOR_BACKGROUNDS[COLORS.audio],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.tar.gz',
    tools: [
      { id: 'arc-tar-gz-to-zip', label: 'TAR.GZ to ZIP', desc: 'Convert a TAR.GZ archive into ZIP format.', dstExt: '.zip', color: COLORS.archive },
      { id: 'arc-tar-gz-to-7z',  label: 'TAR.GZ to 7Z',  desc: 'Convert a TAR.GZ archive into 7Z format.',  dstExt: '.7z',  color: COLORS.image },
      { id: 'arc-tar-gz-to-tar', label: 'TAR.GZ to TAR', desc: 'Convert a TAR.GZ archive into TAR format.', dstExt: '.tar', color: COLORS.audio },
      { id: 'arc-tar-gz-to-rar', label: 'TAR.GZ to RAR', desc: 'Convert a TAR.GZ archive into RAR format.', dstExt: '.rar', color: COLORS.data },
    ],
  },
  {
    id: 'conv-rar',
    label: 'RAR Convert Tools',
    desc: 'Convert RAR archives to ZIP, 7Z, TAR, and TAR.GZ.',
    color: COLORS.document,          // #FF6B6B — red
    bg: COLOR_BACKGROUNDS[COLORS.document],
    icon: ICONS.convert,
    tag: 'Convert',
    srcExt: '.rar',
    tools: [
      { id: 'arc-rar-to-zip',    label: 'RAR to ZIP',    desc: 'Convert a RAR archive into ZIP format.',    dstExt: '.zip',    color: COLORS.archive },
      { id: 'arc-rar-to-7z',     label: 'RAR to 7Z',     desc: 'Convert a RAR archive into 7Z format.',     dstExt: '.7z',     color: COLORS.image },
      { id: 'arc-rar-to-tar',    label: 'RAR to TAR',    desc: 'Convert a RAR archive into TAR format.',    dstExt: '.tar',    color: COLORS.data },
      { id: 'arc-rar-to-tar-gz', label: 'RAR to TAR.GZ', desc: 'Convert a RAR archive into TAR.GZ format.', dstExt: '.tar.gz', color: COLORS.audio },
    ],
  },
];

// Enrich each sub-tool with bg + icon
CONVERT_CATEGORIES.forEach((cat) => {
  cat.tools = cat.tools.map((t) => ({
    ...t,
    bg: COLOR_BACKGROUNDS[t.color] || `rgba(128,128,128,0.15)`,
    icon: ICONS.convert,
    mainText: `Drop ${t.label.split(' to ')[0]} archive to convert`,
    subText: 'or click to browse',
    tag: 'Convert',
  }));
});

function backIcon() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function _tagClass(tag) {
  const t = (tag || '').toLowerCase();
  if (t === 'convert') return 'convert';
  if (t === 'create')  return 'create';
  if (t === 'extract') return 'extract';
  if (t === 'utility') return 'utility';
  return 'tool';
}

function cardHTML(item, tag, showFavorite = false) {
  const resolvedTag = tag || item.tag || '';
  const favorite = showFavorite && isFavourite(item.id);
  const starTitle = favorite ? 'Remove from Favourites' : 'Add to Favourites';
  const lockedModule = getLockedModuleId(item.id);
  const lockClass = lockedModule ? ' fmt-card--locked' : '';
  const lockedAttr = lockedModule ? ` data-locked-module="${lockedModule}"` : '';
  const star = showFavorite
    ? `<button class="card-fav-btn${favorite ? ' is-favourite' : ''}" type="button" title="${starTitle}" aria-label="${starTitle}" data-fav-id="${item.id}">${favorite ? '★' : '☆'}</button>`
    : '';
  return `<div class="fmt-card${lockClass}" data-id="${item.id}"${lockedAttr} style="--fmt-color:${item.color};--fmt-bg:${item.bg}">
    <div class="fmt-card-top">
      <div class="fmt-icon-box">${item.icon}</div>
      <span class="fmt-arrow" aria-hidden="true">›</span>
    </div>
    <div class="fmt-label" title="${item.label}">${item.label}</div>
    <div class="fmt-desc" title="${item.desc}">${item.desc}</div>
    ${resolvedTag ? `<div class="fmt-tag fmt-tag--${_tagClass(resolvedTag)}">${resolvedTag}</div>` : ''}
    ${star}
  </div>`;
}

function categoryCardHTML(category) {
  return cardHTML({ ...category, icon: category.icon }, category.tag || '', false);
}

function scrollToArchiveTools() {
  setTimeout(() => {
    const mainContent = document.getElementById('main-content');
    const exploreSection = document.getElementById('explore-section');
    if (mainContent && exploreSection) {
      mainContent.scrollTo({
        top: Math.max(0, exploreSection.offsetTop - 16),
        behavior: 'smooth',
      });
    }
  }, 60);
}

function scrollToDropZone() {
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
}

function toolRecords(category) {
  const archiveCreateIds = [
    'archive-files-zip', 'archive-files-tar', 'archive-files-tar-gz', 'archive-files-tar-bz2',
    'archive-files-7z', 'archive-folder-zip', 'archive-folder-7z',
    'archive-files-rar', 'archive-files-tar-xz',
    'archive-files-wim',
  ];
  const archiveExtractIds = [
    'archive-extract-zip', 'archive-extract-rar', 'archive-extract-7z', 'archive-extract-tar',
    'archive-extract-tar-gz', 'archive-extract-tar-bz2', 'archive-extract-tar-xz', 'archive-extract-gz',
    'archive-extract-bz2', 'archive-extract-xz', 'archive-extract-cab',
    'archive-extract-dmg',
  ];
  const iconOffsets = {
    'compress-create': 0,
    extract: 10,
    convert: 22,
    utility: 28,
  };
  const toolColors = {
    'compress-create': [
      COLORS.pink, COLORS.data, COLORS.audio, COLORS.document, COLORS.archive, COLORS.video, COLORS.ebook, COLORS.image,
      '#EF4444', '#06B6D4', '#22C55E', '#8B5CF6', '#F59E0B',
    ],
    extract: [COLORS.archive, COLORS.document, COLORS.image, COLORS.audio, COLORS.video, COLORS.ebook, COLORS.data, COLORS.archive, COLORS.audio, COLORS.video, COLORS.document, COLORS.image, COLORS.ebook],
    convert: [COLORS.archive, COLORS.document, COLORS.audio, COLORS.image, COLORS.data, COLORS.video],
    utility: [COLORS.archive, COLORS.image, COLORS.audio, COLORS.document, COLORS.ebook, COLORS.cyan],
  };
  // Stable IDs for utility tools
  const utilityIds = [
    'archive-inspect',   // Archive Inspector
    'archive-split',     // Archive Splitter
    'archive-merge',     // Archive Merger
    'archive-protect',   // Password Protect Archive
    'archive-unlock',    // Remove Archive Password
    'archive-duplicate', // Duplicate Finder in Archive
  ];

  return category.tools.map(([label, desc], index) => {
    const color = toolColors[category.id][index];
    const bg = COLOR_BACKGROUNDS[color] || `rgba(128,128,128,0.15)`;
    let id;
    if (category.id === 'compress-create')  id = archiveCreateIds[index];
    else if (category.id === 'extract')     id = archiveExtractIds[index];
    else if (category.id === 'utility')     id = utilityIds[index] || `utility-${index + 1}`;
    else                                    id = `${category.id}-${index + 1}`;
    return {
      id,
      label,
      desc,
      icon: TOOL_ICONS[iconOffsets[category.id] + index],
      color,
      bg,
      mainText: category.id === 'compress-create'
        ? 'Drop files to archive'
        : (category.id === 'extract'
          ? `Drop ${label.replace(' Extract', '')} archive to extract`
          : (id === 'archive-inspect'
            ? 'Drop any archive to inspect'
            : (id === 'archive-split'
              ? 'Drop archive to split into parts'
              : (id === 'archive-merge'
                ? 'Drop archive parts to merge'
                : (id === 'archive-protect'
                  ? 'Drop an archive to protect with a password'
                  : (id === 'archive-unlock'
                    ? 'Drop an encrypted archive to unlock'
                    : (id === 'archive-duplicate'
                      ? 'Drop an archive to find duplicate files'
                      : 'Drop a file to begin'))))))),
      subText: 'or click to browse',
    };
  });
}

// ─── CONVERT CATEGORY LANDING (5 family cards) ───────────────────────────────

function renderConvertLanding(container, activateNav) {
  setActiveTool(null);
  const convertCat = CATEGORIES.find((c) => c.id === 'convert');
  setBreadcrumb(['Dashboard', 'Archives', 'Convert Tools']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Archives">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${convertCat.bg};color:${convertCat.color}">${convertCat.icon}</div>
      <span class="explore-title">Archives — Convert</span>
    </div>
    <div class="fmt-grid archive-tool-grid">
      ${CONVERT_CATEGORIES.map((c) => cardHTML(c, 'Convert', false)).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderLanding(container, activateNav));
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      const convCat = CONVERT_CATEGORIES.find((c) => c.id === card.dataset.id);
      if (convCat) {
        renderConvertSubTools(container, activateNav, convCat);
        scrollToArchiveTools();
      }
    });
  });
}

// ─── CONVERT SUB-TOOLS (4 conversion pair cards per family) ──────────────────

function renderConvertSubTools(container, activateNav, convCat) {
  setActiveTool(null);
  setBreadcrumb(['Dashboard', 'Archives', 'Convert', convCat.label]);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Convert">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${convCat.bg};color:${convCat.color}">${convCat.icon}</div>
      <span class="explore-title">Archives — ${convCat.label}</span>
    </div>
    <div class="fmt-grid archive-tool-grid">
      ${convCat.tools.map((t) => cardHTML(t, 'Convert', true)).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderConvertLanding(container, activateNav));

  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tool = convCat.tools.find((t) => t.id === card.dataset.id);
      if (!tool) return;
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      // Select card + activate tool → dropzone will be updated
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      setActiveTool(tool);
      scrollToDropZone();
    });
  });
}

// ─── STANDARD CATEGORY LANDING ───────────────────────────────────────────────

function renderLanding(container, activateNav) {
  setActiveTool(null);
  setBreadcrumb(['Dashboard', 'Archives']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Dashboard">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${COLOR_BACKGROUNDS[COLORS.archive]};color:${COLORS.archive}">${ICONS.archive}</div>
      <span class="explore-title">Archives — Choose a category</span>
    </div>
    <div class="fmt-grid archive-category-grid">
      ${CATEGORIES.map(categoryCardHTML).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Dashboard'));
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const category = CATEGORIES.find((item) => item.id === card.dataset.id);
      if (category) {
        if (category.id === 'convert') {
          renderConvertLanding(container, activateNav);
        } else {
          renderCategory(container, activateNav, category);
        }
        scrollToArchiveTools();
      }
    });
  });
}

function renderCategory(container, activateNav, category) {
  setActiveTool(null);
  const tools = toolRecords(category);
  setBreadcrumb(['Dashboard', 'Archives', category.label]);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Archives">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${category.bg};color:${category.color}">${category.icon}</div>
      <span class="explore-title">Archives — ${category.label.replace(' Tools', '')}</span>
    </div>
    <div class="fmt-grid archive-tool-grid">
      ${tools.map((tool) => {
        let toolTag = 'Tool';
        if (category.id === 'compress-create') toolTag = 'Create';
        else if (category.id === 'extract') toolTag = 'Extract';
        else if (category.id === 'convert') toolTag = 'Convert';
        else if (category.id === 'utility') toolTag = 'Utility';
        return cardHTML(tool, toolTag, true);
      }).join('')}
    </div>
  `;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderLanding(container, activateNav));
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tool = tools.find((item) => item.id === card.dataset.id);
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      // Live tools: create, extract, inspector, splitter, merger — all use the drop zone
      const isDropZoneTool = (
        category.id === 'compress-create' ||
        category.id === 'extract' ||
        (tool && (
          tool.id === 'archive-inspect' ||
          tool.id === 'archive-split'   ||
          tool.id === 'archive-merge'   ||
          tool.id === 'archive-protect' ||
          tool.id === 'archive-unlock'  ||
          tool.id === 'archive-duplicate'
        ))
      );
      if (tool && isDropZoneTool) {
        container.querySelectorAll('.fmt-card').forEach((item) => item.classList.remove('selected'));
        card.classList.add('selected');
        setActiveTool(tool);
        scrollToDropZone();
      } else if (tool) {
        renderPlaceholder(container, activateNav, category, tool);
      }
    });
  });
}

function renderPlaceholder(container, activateNav, category, tool) {
  setBreadcrumb(['Dashboard', 'Archives', category.label, tool.label]);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to ${category.label}">${backIcon()}</button>
      <div class="fmt-category-icon" style="background:${tool.bg};color:${tool.color}">${tool.icon}</div>
      <span class="explore-title">${tool.label}</span>
    </div>
    <div class="archive-placeholder" style="--fmt-color:${tool.color};--fmt-bg:${tool.bg}">
      <div class="tool-icon-box">${tool.icon}</div>
      <h3>${tool.label}</h3>
      <p>${tool.desc}</p>
      <span class="fmt-tag">Tool panel coming soon</span>
    </div>
  `;
  container.querySelector('.fmt-back-btn').addEventListener('click', () => renderCategory(container, activateNav, category));
}

export function renderArchives(container, activateNav) {
  renderLanding(container, activateNav);
}
