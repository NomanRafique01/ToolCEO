/**
 * images.js
 * Images category — format cards and per-format sub-panels.
 *
 * Follows the exact same structure as documents.js:
 *   • IMG_FORMATS array (7+ entries)
 *   • cardHTML() helper (local copy, same signature as documents.js)
 *   • renderXxxTools() per format — currently shows "Coming Soon"
 *   • renderImageFormats() — top-level grid shown when "Images" nav is clicked
 */

import { setActiveTool } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';
import { isFavourite as _isFavourite } from './favourites.js';

// ─── MODULE-LOCK NAVIGATION HOOK ──────────────────────────────────────────────
let _navigateToModule = null;
export function setNavigateToModule(fn) { _navigateToModule = fn; }

function _handleLockedClick(moduleId, toolLabel) {
  if (_navigateToModule) _navigateToModule(moduleId, toolLabel);
}

// ─── PNG CONVERSION SUB-CARDS ─────────────────────────────────────────────────

const PNG_CONVERSIONS = [
  {
    id: 'png-jpg',
    label: 'PNG to JPG',
    desc: 'Convert PNG to JPG (removes transparency)',
    ext: '.jpg',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'png-webp',
    label: 'PNG to WEBP',
    desc: 'Convert PNG to modern WEBP format',
    ext: '.webp',
    tag: 'Convert',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 2.5 2.5 2-2 5.5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'png-pdf',
    label: 'PNG to PDF',
    desc: 'Embed PNG image into a PDF document',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M3 1h7l3 3v11H3V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 1v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><text x="4" y="12" font-size="5" fill="currentColor" font-weight="bold">PDF</text></svg>`,
  },
  {
    id: 'png-bmp',
    label: 'PNG to BMP',
    desc: 'Convert PNG to uncompressed BMP',
    ext: '.bmp',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><rect x="3.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/><rect x="8.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="3.5" y1="11" x2="12.5" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'png-tiff',
    label: 'PNG to TIFF',
    desc: 'Convert PNG to TIFF format',
    ext: '.tiff',
    tag: 'Convert',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 4 4 2-3 4 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'png-ico',
    label: 'PNG to ICO',
    desc: 'Convert PNG to multi-size ICO icon',
    ext: '.ico',
    tag: 'Convert',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>`,
  },
  {
    id: 'png-txt',
    label: 'PNG to TXT (OCR)',
    desc: 'Extract text from PNG image using OCR',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="4" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  },
];

// ─── WEBP CONVERSION SUB-CARDS ────────────────────────────────────────────────

const WEBP_CONVERSIONS = [
  {
    id: 'webp-jpg',
    label: 'WEBP to JPG',
    desc: 'Convert WEBP to JPG (removes transparency)',
    ext: '.jpg',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'webp-png',
    label: 'WEBP to PNG',
    desc: 'Convert WEBP to lossless PNG',
    ext: '.png',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l3.5-3.5 3 3 2-2 5.5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'webp-pdf',
    label: 'WEBP to PDF',
    desc: 'Embed WEBP image into a PDF document',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M3 1h7l3 3v11H3V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 1v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><text x="4" y="12" font-size="5" fill="currentColor" font-weight="bold">PDF</text></svg>`,
  },
  {
    id: 'webp-bmp',
    label: 'WEBP to BMP',
    desc: 'Convert WEBP to uncompressed BMP',
    ext: '.bmp',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><rect x="3.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/><rect x="8.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/><line x1="3.5" y1="11" x2="12.5" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'webp-tiff',
    label: 'WEBP to TIFF',
    desc: 'Convert WEBP to TIFF format',
    ext: '.tiff',
    tag: 'Convert',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 4 4 2-3 4 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'webp-ico',
    label: 'WEBP to ICO',
    desc: 'Convert WEBP to multi-size ICO icon',
    ext: '.ico',
    tag: 'Convert',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>`,
  },
  {
    id: 'webp-txt',
    label: 'WEBP to TXT (OCR)',
    desc: 'Extract text from WEBP image using OCR',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="4" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  },
];

// ─── JPG CONVERSION SUB-CARDS ─────────────────────────────────────────────────

const JPG_CONVERSIONS = [
  {
    id: 'jpg-png',
    label: 'JPG to PNG',
    desc: 'Convert JPG image to lossless PNG',
    ext: '.png',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l3.5-3.5 3 3 2-2 5.5 4" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'jpg-webp',
    label: 'JPG to WEBP',
    desc: 'Convert JPG to modern WEBP format',
    ext: '.webp',
    tag: 'Convert',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l4-4 2.5 2.5 2-2 5.5 5" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'jpg-pdf',
    label: 'JPG to PDF',
    desc: 'Embed JPG image into a PDF document',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <path d="M3 1h7l3 3v11H3V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M10 1v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <text x="4" y="12" font-size="5" fill="currentColor" font-weight="bold">PDF</text>
    </svg>`,
  },
  {
    id: 'jpg-bmp',
    label: 'JPG to BMP',
    desc: 'Convert JPG to uncompressed BMP',
    ext: '.bmp',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <rect x="3.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
      <rect x="8.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
      <line x1="3.5" y1="11" x2="12.5" y2="11" stroke="currentColor" stroke-width="1.1"
        stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'jpg-tiff',
    label: 'JPG to TIFF',
    desc: 'Convert JPG to TIFF format',
    ext: '.tiff',
    tag: 'Convert',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l4-4 4 4 2-3 4 5" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'jpg-ico',
    label: 'JPG to ICO',
    desc: 'Convert JPG to multi-size ICO icon',
    ext: '.ico',
    tag: 'Convert',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/>
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/>
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/>
    </svg>`,
  },
  {
    id: 'jpg-gif',
    label: 'JPG to GIF',
    desc: 'Convert JPG to palette-quantized GIF',
    ext: '.gif',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <path d="M9.5 6.5 A3.5 3.5 0 1 0 9.5 9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>
      <line x1="9.5" y1="7.5" x2="11.5" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'jpg-txt',
    label: 'JPG to TXT (OCR)',
    desc: 'Extract text from JPG image using OCR',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="4" y1="9" x2="10" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── SVG CONVERSION SUB-CARDS ─────────────────────────────────────────────────

const SVG_CONVERSIONS = [
  {
    id: 'svg-png',
    label: 'SVG to PNG',
    desc: 'Convert SVG to PNG',
    ext: '.png',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l3.5-3.5 3 3 2-2 5.5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'svg-jpg',
    label: 'SVG to JPG',
    desc: 'Convert SVG to JPG',
    ext: '.jpg',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'svg-webp',
    label: 'SVG to WEBP',
    desc: 'Convert SVG to WEBP',
    ext: '.webp',
    tag: 'Convert',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/><path d="M1 12l4-4 2.5 2.5 2-2 5.5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'svg-pdf',
    label: 'SVG to PDF',
    desc: 'Convert SVG to PDF',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M3 1h7l3 3v11H3V1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 1v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><text x="4" y="12" font-size="5" fill="currentColor" font-weight="bold">PDF</text></svg>`,
  },
];

function _dropTextForJpg(item) {
  const srcLabel = item.id.split('-')[0].toUpperCase();
  return {
    mainText: `Drop a ${srcLabel} file to ${item.tag.toLowerCase()}`,
    subText: 'or click to browse',
  };
}

// ─── BREADCRUMB HELPER ────────────────────────────────────────────────────────
// Local copy — avoids a circular import with navigation.js (which imports us).
function setBreadcrumb(segments) {
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

// ─── SCROLL HELPER ───────────────────────────────────────────────────────────
function _scrollToDropZone() {
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── IMAGE FORMAT DEFINITIONS ─────────────────────────────────────────────────

const IMG_FORMATS = [
  {
    id: 'jpg',
    label: 'JPG Tools',
    desc: 'Tools & conversions for JPG',
    ext: '.jpg',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    isJpgEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'png',
    label: 'PNG Tools',
    desc: 'Tools & conversions for PNG',
    ext: '.png',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    isPngEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l3.5-3.5 3 3 2-2 5.5 4" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'webp',
    label: 'WEBP Tools',
    desc: 'Tools & conversions for WEBP',
    ext: '.webp',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    isWebpEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l4-4 2.5 2.5 2-2 5.5 5" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'svg',
    label: 'SVG Tools',
    desc: 'Tools & conversions for SVG',
    ext: '.svg',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    isSvgEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 11 L8 5 L12 11" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 9 h4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'gif',
    label: 'GIF Tools',
    desc: 'Tools & conversions for GIF',
    ext: '.gif',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    isGifEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <path d="M9.5 6.5 A3.5 3.5 0 1 0 9.5 9.5" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" fill="none"/>
      <line x1="9.5" y1="7.5" x2="11.5" y2="7.5" stroke="currentColor" stroke-width="1.1"
        stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'bmp',
    label: 'BMP Tools',
    desc: 'Tools & conversions for BMP',
    ext: '.bmp',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    isBmpEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <rect x="3.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
      <rect x="8.5" y="4.5" width="4" height="4" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
      <line x1="3.5" y1="11" x2="12.5" y2="11" stroke="currentColor" stroke-width="1.1"
        stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'tiff',
    label: 'TIFF Tools',
    desc: 'Tools & conversions for TIFF',
    ext: '.tiff',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    isTiffEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l4-4 4 4 2-3 4 5" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'image_compressor',
    label: 'Image Compressor',
    desc: 'Compress images offline, any format',
    ext: '.jpg .png .webp +3',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
    tag: 'Compress',
    isImgCompressorEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="5.5" cy="6" r="1.3" stroke="currentColor" stroke-width="1.1"/>
      <path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11 4 v4 M9 6 h4" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── HELPER: render a card ────────────────────────────────────────────────────

function cardHTML(item, extraClass = '') {
  const isEntry    = Boolean(item.isJpgEntry || item.isPngEntry || item.isWebpEntry || item.isSvgEntry || item.isGifEntry || item.isBmpEntry || item.isTiffEntry);
  const locked     = getLockedModuleId(item.id) !== null;
  const lockClass  = locked ? ' fmt-card--locked' : '';
  const lockedAttr = locked ? ` data-locked-module="${getLockedModuleId(item.id)}"` : '';
  const bottom = item.ext
    ? `<div class="fmt-ext">${item.ext}</div>`
    : `<div class="fmt-tag fmt-tag--${item.tag.toLowerCase()}">${item.tag}</div>`;

  let starBtn = '';
  if (!isEntry) {
    const fav       = _isFavourite(item.id);
    const starCls   = fav ? ' is-favourite' : '';
    const starCh    = fav ? '\u2605' : '\u2606';
    const starTitle = fav ? 'Remove from Favourites' : 'Add to Favourites';
    starBtn = `<button class="card-fav-btn${starCls}" type="button" title="${starTitle}" aria-label="${starTitle}" data-fav-id="${item.id}">${starCh}</button>`;
  }

  return `
    <div class="fmt-card${extraClass ? ' ' + extraClass : ''}${lockClass}" data-id="${item.id}"${lockedAttr}
         style="--fmt-color:${item.color};--fmt-bg:${item.bg}">
      <div class="fmt-card-top">
        <div class="fmt-icon-box">${item.icon}</div>
        <span class="fmt-arrow">›</span>
      </div>
      <div class="fmt-label">${item.label}</div>
      <div class="fmt-desc">${item.desc}</div>
      ${bottom}
      ${starBtn}
    </div>`;
}

// ─── COMING SOON PLACEHOLDER ──────────────────────────────────────────────────

function _comingSoonHTML() {
  return `
    <div class="img-coming-soon">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" class="img-coming-soon-icon">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
        <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p class="img-coming-soon-title">Coming Soon</p>
      <p class="img-coming-soon-sub">Tools for this format are being added. Check back soon.</p>
    </div>`;
}

// ─── BACK BUTTON SVG ──────────────────────────────────────────────────────────

const _backSVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ─── PER-FORMAT SUB-PANELS ────────────────────────────────────────────────────

export function renderJpgTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images', 'JPG']);
  const fmt = IMG_FORMATS.find((f) => f.id === 'jpg');
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Images">${_backSVG}</button>
      <div class="fmt-category-icon" style="background:${fmt.bg};color:${fmt.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">JPG — Tools &amp; Conversions</span>
    </div>
    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      JPG Conversions
    </div>
    <div class="fmt-grid">
      ${JPG_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>`;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Images'));

  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const item = JPG_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextForJpg(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg, tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

export function renderPngTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images', 'PNG']);
  const fmt = IMG_FORMATS.find((f) => f.id === 'png');
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Images">${_backSVG}</button>
      <div class="fmt-category-icon" style="background:${fmt.bg};color:${fmt.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">PNG — Tools &amp; Conversions</span>
    </div>
    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      PNG Conversions
    </div>
    <div class="fmt-grid">
      ${PNG_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>`;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Images'));

  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const item = PNG_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextForJpg(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg, tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

export function renderWebpTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images', 'WEBP']);
  const fmt = IMG_FORMATS.find((f) => f.id === 'webp');
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Images">${_backSVG}</button>
      <div class="fmt-category-icon" style="background:${fmt.bg};color:${fmt.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">WEBP — Tools &amp; Conversions</span>
    </div>
    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      WEBP Conversions
    </div>
    <div class="fmt-grid">
      ${WEBP_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>`;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Images'));

  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const item = WEBP_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextForJpg(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg, tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

export function renderSvgTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images', 'SVG']);
  const fmt = IMG_FORMATS.find((f) => f.id === 'svg');
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Images">${_backSVG}</button>
      <div class="fmt-category-icon" style="background:${fmt.bg};color:${fmt.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">SVG — Tools &amp; Conversions</span>
    </div>
    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      SVG Conversions
    </div>
    <div class="fmt-grid">
      ${SVG_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>`;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Images'));

  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const item = SVG_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextForJpg(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg, tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

export function renderGifTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images', 'GIF']);
  const fmt = IMG_FORMATS.find((f) => f.id === 'gif');
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Images">${_backSVG}</button>
      <div class="fmt-category-icon" style="background:${fmt.bg};color:${fmt.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">GIF — Tools &amp; Conversions</span>
    </div>
    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      GIF Tools
    </div>
    <div class="fmt-grid">${_comingSoonHTML()}</div>`;
  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Images'));
}

export function renderBmpTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images', 'BMP']);
  const fmt = IMG_FORMATS.find((f) => f.id === 'bmp');
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Images">${_backSVG}</button>
      <div class="fmt-category-icon" style="background:${fmt.bg};color:${fmt.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">BMP — Tools &amp; Conversions</span>
    </div>
    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      BMP Tools
    </div>
    <div class="fmt-grid">${_comingSoonHTML()}</div>`;
  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Images'));
}

export function renderTiffTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images', 'TIFF']);
  const fmt = IMG_FORMATS.find((f) => f.id === 'tiff');
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Images">${_backSVG}</button>
      <div class="fmt-category-icon" style="background:${fmt.bg};color:${fmt.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">TIFF — Tools &amp; Conversions</span>
    </div>
    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
        <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      TIFF Tools
    </div>
    <div class="fmt-grid">${_comingSoonHTML()}</div>`;
  container.querySelector('.fmt-back-btn').addEventListener('click', () => activateNav('Images'));
}

// ─── IMAGES PANEL (main — format picker) ─────────────────────────────────────

export function renderImageFormats(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Images']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to all tools">
        ${_backSVG}
      </button>
      <div class="fmt-category-icon" style="background:rgba(167,139,250,0.15);color:#A78BFA">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
          <circle cx="5.5" cy="6" r="1.5" stroke="currentColor" stroke-width="1.1"/>
          <path d="M1 12l4-4 3 3 2-2 5 4" stroke="currentColor" stroke-width="1.2"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="explore-title">Images — Choose Format</span>
    </div>

    <div class="fmt-grid">
      ${IMG_FORMATS.map((f) => {
        let extra = '';
        if (f.isJpgEntry)          extra = 'fmt-card--jpg-entry';
        else if (f.isPngEntry)     extra = 'fmt-card--png-entry';
        else if (f.isWebpEntry)    extra = 'fmt-card--webp-entry';
        else if (f.isSvgEntry)     extra = 'fmt-card--svg-entry';
        else if (f.isGifEntry)     extra = 'fmt-card--gif-entry';
        else if (f.isBmpEntry)     extra = 'fmt-card--bmp-entry';
        else if (f.isTiffEntry)    extra = 'fmt-card--tiff-entry';
        else if (f.isImgCompressorEntry) extra = 'fmt-card--img-compressor-entry';
        return cardHTML(f, extra);
      }).join('')}
    </div>
  `;

  // Back → Dashboard
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });

  // JPG card → JPG sub-panel
  const jpgCard = container.querySelector('.fmt-card--jpg-entry');
  if (jpgCard) jpgCard.addEventListener('click', () => renderJpgTools(container, activateNav));

  // PNG card → PNG sub-panel
  const pngCard = container.querySelector('.fmt-card--png-entry');
  if (pngCard) pngCard.addEventListener('click', () => renderPngTools(container, activateNav));

  // WEBP card → WEBP sub-panel
  const webpCard = container.querySelector('.fmt-card--webp-entry');
  if (webpCard) webpCard.addEventListener('click', () => renderWebpTools(container, activateNav));

  // SVG card → SVG sub-panel
  const svgCard = container.querySelector('.fmt-card--svg-entry');
  if (svgCard) svgCard.addEventListener('click', () => renderSvgTools(container, activateNav));

  // GIF card → GIF sub-panel
  const gifCard = container.querySelector('.fmt-card--gif-entry');
  if (gifCard) gifCard.addEventListener('click', () => renderGifTools(container, activateNav));

  // BMP card → BMP sub-panel
  const bmpCard = container.querySelector('.fmt-card--bmp-entry');
  if (bmpCard) bmpCard.addEventListener('click', () => renderBmpTools(container, activateNav));

  // TIFF card → TIFF sub-panel
  const tiffCard = container.querySelector('.fmt-card--tiff-entry');
  if (tiffCard) tiffCard.addEventListener('click', () => renderTiffTools(container, activateNav));

  // Image Compressor card → open tool directly (no sub-panel)
  const cmpCard = container.querySelector('.fmt-card--img-compressor-entry');
  if (cmpCard) {
    cmpCard.addEventListener('click', () => {
      const fmt = IMG_FORMATS.find((f) => f.id === 'image_compressor');
      if (!fmt) return;
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      cmpCard.classList.add('selected');
      setActiveTool({
        id: fmt.id,
        label: fmt.label,
        mainText: 'Drop one or more images to compress',
        subText: 'or click to browse — mixed formats supported',
        icon: fmt.icon,
        color: fmt.color,
        bg: fmt.bg,
        tag: fmt.tag,
      });
      _scrollToDropZone();
    });
  }
}

// Legacy export kept so old callers don't break
export function initImages() {}
