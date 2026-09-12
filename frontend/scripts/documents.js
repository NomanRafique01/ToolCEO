/**
 * documents.js
 * Renders the Documents format-selection grid and the PDF-specific
 * tools/conversions panel into the explore-section container.
 */

import { setActiveTool, onToolChange } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';
import { isFavourite as _isFavourite } from './favourites.js';

/** Thin local wrapper — avoids a circular import with navigation.js */
function setBreadcrumb(segments) {
  const bar = document.getElementById('breadcrumb-bar');
  if (!bar) return;
  bar.innerHTML = segments
    .map((seg, i) => {
      const isLast = i === segments.length - 1;
      const label = `<span class="bc-label${isLast ? ' bc-label--active' : ''}">${seg}</span>`;
      const sep = i < segments.length - 1 ? '<span class="bc-sep" aria-hidden="true">/</span>' : '';
      return `<span class="bc-segment">${label}${sep}</span>`;
    })
    .join('');
}

// Sync card selection highlight in the explore-tools grid whenever active tool changes
onToolChange((tool) => {
  const container = document.getElementById('explore-section');
  if (!container) return;
  container.querySelectorAll('.fmt-card').forEach((card) => {
    if (tool && card.dataset.id === tool.id) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
});

// ─── MODULE-LOCK NAVIGATION HOOK ──────────────────────────────────────────────
// Set by navigation.js so documents.js can redirect to the Modules page without
// a circular import.
let _navigateToModule = null;

/**
 * Called by navigation.js to wire up the redirect callback.
 * @param {Function} fn  (moduleId: string, toolLabel: string) => void
 */
export function setNavigateToModule(fn) {
  _navigateToModule = fn;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Build drop-zone copy for a given tool/conversion card.
 * @param {{ id: string, label: string, tag?: string }} item
 * @returns {{ mainText: string, subText: string }}
 */
function _dropTextFor(item) {
  const label = item.label;
  const isConvert = item.tag === 'Convert' || label.includes('→');

  if (isConvert) {
    // e.g. "PDF → DOCX"  →  "Drop file to Convert PDF → DOCX"
    return {
      mainText: `Drop file to Convert ${label}`,
      subText : `or click to select a file for ${label}`,
    };
  }

  // Tool cards  e.g. "Merge PDFs"
  return {
    mainText: `Select File to ${label}`,
    subText : `or click to pick your file`,
  };
}

/** Scroll #main-content so the drop-zone is visible, smoothly. */
function _scrollToDropZone() {
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── PDF TOOL CARDS ──────────────────────────────────────────────────────────

const PDF_TOOLS = [
  {
    id: 'merge',
    label: 'Merge PDFs',
    desc: 'Combine multiple PDFs into one',
    tag: 'Tool',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="6" height="8" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
      <rect x="9" y="3" width="6" height="8" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
      <path d="M7 7h2M10 7l-1.5 2M10 7l-1.5-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="4" y="11" width="8" height="3" rx="1" stroke="currentColor" stroke-width="1.2"/>
    </svg>`,
  },
  {
    id: 'split',
    label: 'Split PDF',
    desc: 'Extract pages into separate files',
    tag: 'Tool',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 1.5"/>
      <line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 1.5"/>
      <path d="M8 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'compress',
    label: 'Compress PDF',
    desc: 'Reduce file size without quality loss',
    tag: 'Tool',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M5 5l1.5 1.5M11 5l-1.5 1.5M5 11l1.5-1.5M11 11l-1.5-1.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'encrypt',
    label: 'Encrypt / Decrypt',
    desc: 'Password-protect or unlock PDFs',
    tag: 'Tool',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="8" cy="11" r="1.2" fill="currentColor"/>
      <line x1="8" y1="12.2" x2="8" y2="13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'rotate',
    label: 'Rotate / Delete Pages',
    desc: 'Rotate or delete individual or all pages',
    tag: 'Tool',
    color: '#00E5C0',
    bg: 'rgba(0, 229, 192, 0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <path d="M13 8a5 5 0 1 1-1.46-3.54" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M11 1v4h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'extractor',
    label: 'Extract Images',
    desc: 'Pull embedded images out of PDFs',
    tag: 'Tool',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="9" height="12" rx="1.4" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 2l3 3H8V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <rect x="5" y="6" width="9" height="7" rx="1.2" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="8" cy="8.3" r="0.9" stroke="currentColor" stroke-width="1"/>
      <path d="M5 12l2.4-2.4 1.8 1.8 1.4-1.4L14 12" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'watermark',
    label: 'WaterMark/Add Sign Pdf',
    desc: 'Add text watermarks or signatures',
    tag: 'Tool',
    color: '#38BDF8',
    bg: 'rgba(56,189,248,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <text x="3.5" y="11.5" font-size="7" font-weight="700" fill="currentColor" opacity="0.5" font-family="sans-serif">W</text>
      <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.35"/>
    </svg>`,
  },
  {
    id: 'editor',
    label: 'Edit PDF',
    desc: 'Prompt-based PDF editing workspace',
    tag: 'Tool',
    color: '#00E5C0',
    bg: 'rgba(0,229,192,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1.5l4 4H8V1.5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M4.5 10.5l.6-2 4.7-4.7a1.2 1.2 0 0 1 1.7 1.7L6.8 10.2l-2.3.3Z" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9.1 4.5l1.7 1.7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── PDF CONVERSION CARDS ─────────────────────────────────────────────────────

const PDF_CONVERSIONS = [
  {
    id: 'pdf-excel',
    label: 'PDF → Excel',
    desc: 'Extract tables from PDF into spreadsheet',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <line x1="9" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="9" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="11" y1="5" x2="11" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="13" y1="5" x2="13" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pdf-word',
    label: 'PDF → Word',
    desc: 'Convert PDF to editable Word',
    tag: 'Convert',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <line x1="11" y1="6" x2="13" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pdf-html',
    label: 'PDF → HTML',
    desc: 'Export PDF as a web page',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pdf-txt',
    label: 'PDF → TXT',
    desc: 'Extract plain text from PDF',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="10" y1="7.5" x2="15" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pdf-images',
    label: 'PDF → Images',
    desc: 'Export each page as PNG/JPG',
    tag: 'Convert',
    color: '#EAB308',
    bg: 'rgba(234,179,8,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="3" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="11" cy="5.5" r="0.9" stroke="currentColor" stroke-width="1"/>
      <path d="M9 8l2-2 2 2 1-1 1 1" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'pdf-ppt',
    label: 'PDF → PPT',
    desc: 'Convert PDF to PowerPoint slides',
    tag: 'Convert',
    color: '#F97316',
    bg: 'rgba(249,115,22,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M11 5h2a1 1 0 0 1 0 2h-2V5Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="8" x2="11" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'images-pdf',
    label: 'Images → PDF',
    desc: 'Bundle images into a PDF file',
    tag: 'Convert',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="3" cy="4" r="0.9" stroke="currentColor" stroke-width="1"/>
      <path d="M1 7l2-2 2 2 1-1 1 1" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── DOCX CONVERSION CARDS ────────────────────────────────────────────────────

// ─── PPTX CONVERSIONS ────────────────────────────────────────────────────────

const PPTX_CONVERSIONS = [
  {
    id: 'pptx-pdf',
    label: 'PPTX to PDF',
    desc: 'Convert PPTX to PDF',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pptx-html',
    label: 'PPTX to HTML',
    desc: 'Convert PPTX to HTML',
    ext: '.html',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pptx-images',
    label: 'PPTX to Images',
    desc: 'Convert each slide to PNG (delivered as ZIP)',
    ext: '.zip',
    tag: 'Convert',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="3.5" cy="5.5" r="0.9" fill="currentColor"/>
      <path d="M1 8l2.5-2.5L6 8l2-1.5 1 1" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="7" y="6" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="9.5" cy="8.5" r="0.9" fill="currentColor"/>
      <path d="M7 11l2.5-2.5L12 11l1-0.8 1 0.8" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'pptx-odp',
    label: 'PPTX to ODP',
    desc: 'Convert PPTX to ODP (LibreOffice Impress)',
    ext: '.odp',
    tag: 'Convert',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <rect x="10.5" y="6" width="3" height="2.5" rx="0.6" stroke="currentColor" stroke-width="1"/>
    </svg>`,
  },
  {
    id: 'pptx-txt',
    label: 'PPTX to TXT',
    desc: 'Extract text from PPTX',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="10" y1="7.5" x2="15" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pptx-repair',
    label: 'PPTX Repair',
    desc: 'Repair and compress PPTX via re-save',
    ext: '.pptx',
    tag: 'Repair',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="4" y="7" width="5" height="3.5" rx="1" stroke="currentColor" stroke-width="1.1"/>
      <path d="M11 8.5l1.5-1.5 1 1L12 9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
];

// ─── PPTX TOOLS PANEL ────────────────────────────────────────────────────────

export function renderPptxTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', 'PPTX']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Documents">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(251,146,60,0.15);color:#FB923C">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <rect x="4" y="7" width="5" height="3.5" rx="1" stroke="currentColor" stroke-width="1.1"/>
        </svg>
      </div>
      <span class="explore-title">PPTX — Conversions</span>
    </div>

    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      PPTX Conversions
    </div>
    <div class="fmt-grid">
      ${PPTX_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = PPTX_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

const XLSX_CONVERSIONS = [
  {
    id: 'xlsx-pdf',
    label: 'XLSX to PDF',
    desc: 'Convert XLSX to PDF',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'xlsx-csv',
    label: 'XLSX to CSV',
    desc: 'Convert XLSX to CSV',
    ext: '.csv',
    tag: 'Convert',
    color: '#84CC16',
    bg: 'rgba(132,204,22,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="7" x2="15" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="9" x2="15" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="5" x2="10" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="12.5" y1="5" x2="12.5" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'xlsx-json',
    label: 'XLSX to JSON',
    desc: 'Convert XLSX to JSON (all sheets)',
    ext: '.json',
    tag: 'Convert',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4.5c-.6 0-1 .4-1 1v1c0 .6-.4 1-1 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M13 4.5c.6 0 1 .4 1 1v1c0 .6.4 1 1 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M10 11c-.6 0-1-.4-1-1V9c0-.6-.4-1-1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M13 11c.6 0 1-.4 1-1V9c0-.6.4-1 1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'xlsx-html',
    label: 'XLSX to HTML',
    desc: 'Convert XLSX to HTML',
    ext: '.html',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'xlsx-ods',
    label: 'XLSX to ODS',
    desc: 'Convert XLSX to ODS (LibreOffice Calc)',
    ext: '.ods',
    tag: 'Convert',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="10.5" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="10.5" y1="9" x2="13.5" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'xlsx-txt',
    label: 'XLSX to TXT',
    desc: 'Extract text from XLSX spreadsheet',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="10" y1="7.5" x2="15" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── XLSX TOOLS PANEL ────────────────────────────────────────────────────────

export function renderXlsxTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', 'XLSX']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Documents">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(52,211,153,0.15);color:#34D399">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="4" y1="7" x2="10" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="10" y1="7" x2="4" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">XLSX — Conversions</span>
    </div>

    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      XLSX Conversions
    </div>
    <div class="fmt-grid">
      ${XLSX_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = XLSX_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

const DOCX_CONVERSIONS = [
  {
    id: 'docx-pdf',
    label: 'DOCX to PDF',
    desc: 'Convert DOCX to PDF',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'docx-html',
    label: 'DOCX to HTML',
    desc: 'Convert DOCX to HTML',
    ext: '.html',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'docx-txt',
    label: 'DOCX to TXT',
    desc: 'Convert DOCX to TXT',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="10" y1="7.5" x2="15" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'docx-odt',
    label: 'DOCX to ODT',
    desc: 'Convert DOCX to ODT',
    ext: '.odt',
    tag: 'Convert',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'docx-epub',
    label: 'DOCX to EPUB',
    desc: 'Convert DOCX to EPUB',
    ext: '.epub',
    tag: 'Convert',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 2s-2.5 1-2.5 4.5S12 11 12 11s2.5-1 2.5-4.5S12 2 12 2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="9.5" y1="6.5" x2="14.5" y2="6.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'docx-md',
    label: 'DOCX to Markdown',
    desc: 'Convert DOCX to Markdown',
    ext: '.md',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="4" x2="10" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M10 4l2 3 2-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="14" y1="4" x2="14" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── DOCX TOOLS PANEL ────────────────────────────────────────────────────────

export function renderDocxTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', 'DOCX']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Documents">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(96,165,250,0.15);color:#60A5FA">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="4" y1="7"  x2="10" y2="7"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="9"  x2="10" y2="9"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="11" x2="7"  y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">DOCX — Conversions</span>
    </div>

    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      DOCX Conversions
    </div>
    <div class="fmt-grid">
      ${DOCX_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = DOCX_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

// ─── DOCUMENT FORMAT CARDS (main Documents panel) ─────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

const TXT_CONVERSIONS = [
  {
    id: 'txt-pdf',
    label: 'TXT to PDF',
    desc: 'Convert TXT to PDF',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'txt-docx',
    label: 'TXT to DOCX',
    desc: 'Convert TXT to DOCX',
    ext: '.docx',
    tag: 'Convert',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="10.5" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10.5" y1="9" x2="13.5" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'txt-html',
    label: 'TXT to HTML',
    desc: 'Convert TXT to HTML',
    ext: '.html',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'txt-md',
    label: 'TXT to Markdown',
    desc: 'Convert TXT to Markdown',
    ext: '.md',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="9" y="10" font-family="monospace" font-size="7" fill="currentColor">#</text>
      <line x1="12" y1="6" x2="15" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="12" y1="8.5" x2="14" y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'txt-epub',
    label: 'TXT to EPUB',
    desc: 'Convert TXT to EPUB',
    ext: '.epub',
    tag: 'Convert',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="10" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <line x1="11" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'txt-odt',
    label: 'TXT to ODT',
    desc: 'Convert TXT to ODT',
    ext: '.odt',
    tag: 'Convert',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="10.5" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="10.5" y1="9" x2="13.5" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'txt-rtf',
    label: 'TXT to RTF',
    desc: 'Convert TXT to RTF',
    ext: '.rtf',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="10.5" y1="6" x2="13.5" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10.5" y1="8" x2="12.5" y2="8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── TXT TOOLS PANEL ─────────────────────────────────────────────────────────

export function renderTxtTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', 'TXT']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Documents">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(167,139,250,0.15);color:#A78BFA">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <line x1="4" y1="6"  x2="10" y2="6"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="10" x2="7"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">TXT — Conversions</span>
    </div>

    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      TXT Conversions
    </div>
    <div class="fmt-grid">
      ${TXT_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = TXT_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

// ─── ODT TOOLS PANEL ─────────────────────────────────────────────────────────

const CSV_CONVERSIONS = [
  {
    id: 'csv-json',
    label: 'CSV to JSON',
    desc: 'Convert CSV to JSON',
    ext: '.json',
    tag: 'Convert',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="9" y="10" font-family="monospace" font-size="6.5" fill="currentColor">{}</text>
    </svg>`,
  },
  {
    id: 'csv-xlsx',
    label: 'CSV to XLSX',
    desc: 'Convert CSV to XLSX',
    ext: '.xlsx',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <line x1="10" y1="5" x2="14" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="14" y1="5" x2="10" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv-html',
    label: 'CSV to HTML',
    desc: 'Convert CSV to HTML',
    ext: '.html',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv-md',
    label: 'CSV to Markdown',
    desc: 'Convert CSV to Markdown',
    ext: '.md',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="9" y="10" font-family="monospace" font-size="7" fill="currentColor">#</text>
      <line x1="12" y1="6" x2="15" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="12" y1="8.5" x2="14" y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv-pdf',
    label: 'CSV to PDF',
    desc: 'Convert CSV to PDF',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv-txt',
    label: 'CSV to TXT',
    desc: 'Convert CSV to TXT',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="10" y1="7.5" x2="15" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv-xml',
    label: 'CSV to XML',
    desc: 'Convert CSV to XML',
    ext: '.xml',
    tag: 'Convert',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.2 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.5 4l1.2 2.5-1.2 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11.5" y1="3.5" x2="13" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv-sql',
    label: 'CSV to SQL',
    desc: 'Convert CSV to SQL INSERT statements',
    ext: '.sql',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="12" cy="4.5" rx="3" ry="1.5" stroke="currentColor" stroke-width="1.1"/>
      <path d="M9 4.5v4c0 .83 1.34 1.5 3 1.5s3-.67 3-1.5v-4" stroke="currentColor" stroke-width="1.1"/>
      <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  },
];

const ODT_CONVERSIONS = [
  {
    id: 'odt-pdf',
    label: 'ODT to PDF',
    desc: 'Convert ODT to PDF',
    ext: '.pdf',
    tag: 'Convert',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="11" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt-docx',
    label: 'ODT to DOCX',
    desc: 'Convert ODT to DOCX',
    ext: '.docx',
    tag: 'Convert',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="10.5" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10.5" y1="9" x2="13.5" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt-html',
    label: 'ODT to HTML',
    desc: 'Convert ODT to HTML',
    ext: '.html',
    tag: 'Convert',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 4l-1.5 2.5L10 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M13 4l1.5 2.5L13 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="3.5" x2="12" y2="9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt-txt',
    label: 'ODT to TXT',
    desc: 'Convert ODT to TXT',
    ext: '.txt',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="10" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <line x1="10" y1="7.5" x2="15" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt-epub',
    label: 'ODT to EPUB',
    desc: 'Convert ODT to EPUB',
    ext: '.epub',
    tag: 'Convert',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M12 2s-2.5 1-2.5 4.5S12 11 12 11s2.5-1 2.5-4.5S12 2 12 2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="9.5" y1="6.5" x2="14.5" y2="6.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt-md',
    label: 'ODT to Markdown',
    desc: 'Convert ODT to Markdown',
    ext: '.md',
    tag: 'Convert',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="9" y="10" font-family="monospace" font-size="7" fill="currentColor">#</text>
      <line x1="12" y1="6" x2="15" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="12" y1="8.5" x2="14" y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt-rtf',
    label: 'ODT to RTF',
    desc: 'Convert ODT to RTF',
    ext: '.rtf',
    tag: 'Convert',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M4 2l3 3H4V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="10.5" y1="6" x2="13.5" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10.5" y1="8" x2="12.5" y2="8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
];

export function renderCsvTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', 'CSV']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Documents">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(132,204,22,0.15);color:#84CC16">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <line x1="4"  y1="6"  x2="4"  y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="7"  y1="6"  x2="7"  y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="10" y1="6"  x2="10" y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4"  y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4"  y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">CSV — Conversions</span>
    </div>

    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      CSV Conversions
    </div>
    <div class="fmt-grid">
      ${CSV_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = CSV_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export function renderOdtTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', 'ODT']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Documents">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(45,212,191,0.15);color:#2DD4BF">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">ODT — Conversions</span>
    </div>

    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      ODT Conversions
    </div>
    <div class="fmt-grid">
      ${ODT_CONVERSIONS.map((t) => cardHTML(t)).join('')}
    </div>
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = ODT_CONVERSIONS.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

const DOC_FORMATS = [
  {
    id: 'pdf',
    label: 'PDF Tools',
    desc: 'Tools & conversions for PDF',
    ext: '.pdf',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.15)',
    isPdfEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="8"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'docx',
    label: 'DOCX Tools',
    desc: 'Tools & conversions for DOCX',
    ext: '.docx',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    isDocxEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="7"  x2="10" y2="7"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="9"  x2="10" y2="9"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="11" x2="7"  y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'xlsx',
    label: 'XLSX Tools',
    desc: 'Tools & conversions for XLSX',
    ext: '.xlsx',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    isXlsxEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="7" x2="10" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="7" x2="4" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pptx',
    label: 'PPTX Tools',
    desc: 'Tools & conversions for PPTX',
    ext: '.pptx',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    isPptxEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="4" y="7" width="5" height="3.5" rx="1" stroke="currentColor" stroke-width="1.1"/>
    </svg>`,
  },
  {
    id: 'txt',
    label: 'TXT Tools',
    desc: 'Tools & conversions for TXT',
    ext: '.txt',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    isTxtEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4" y1="6"  x2="10" y2="6"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="7"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt',
    label: 'ODT Tools',
    desc: 'Tools & conversions for ODT',
    ext: '.odt',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    isOdtEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv',
    label: 'CSV Tools',
    desc: 'Tools & conversions for CSV',
    ext: '.csv',
    color: '#84CC16',
    bg: 'rgba(132,204,22,0.15)',
    isCsvEntry: true,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4"  y1="6"  x2="4"  y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="7"  y1="6"  x2="7"  y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="6"  x2="10" y2="12" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4"  y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4"  y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── HELPER: render a card ────────────────────────────────────────────────────


function cardHTML(item, extraClass = '') {
  const isEntry   = Boolean(item.isPdfEntry || item.isDocxEntry || item.isXlsxEntry || item.isPptxEntry || item.isTxtEntry || item.isOdtEntry || item.isCsvEntry);
  const locked    = getLockedModuleId(item.id) !== null;
  const lockClass = locked ? ' fmt-card--locked' : '';
  const lockedAttr = locked ? ` data-locked-module="${getLockedModuleId(item.id)}"` : '';
  const bottom = item.ext
    ? `<div class="fmt-ext">${item.ext}</div>`
    : (item.tag ? `<div class="fmt-tag fmt-tag--${String(item.tag).toLowerCase()}">${item.tag}</div>` : '');

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

/**
 * Handle a click on a locked card — navigate to Modules page and
 * highlight the required module.
 */
function _handleLockedClick(moduleId, toolLabel) {
  if (_navigateToModule) {
    _navigateToModule(moduleId, toolLabel);
  }
}

// ─── PDF TOOLS PANEL ─────────────────────────────────────────────────────────

export function renderPdfTools(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents', 'PDF']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Documents">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(255,107,107,0.15);color:#FF6B6B">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
          <line x1="4" y1="10" x2="8"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">PDF — Tools &amp; Conversions</span>
    </div>

    <div class="pdf-tools-swap" id="pdf-tools-swap">
      <div class="pdf-tools-card-view" id="pdf-tools-card-view">
        <div class="pdf-zone-label">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
            <rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
            <rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
            <rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
            <rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" stroke-width="1.4"/>
          </svg>
          PDF Tools
        </div>
        <div class="fmt-grid">
          ${PDF_TOOLS.map((t) => cardHTML(t)).join('')}
        </div>

        <div class="pdf-zone-label" style="margin-top:22px;">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
            <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          PDF Conversions
        </div>
        <div class="fmt-grid">
          ${PDF_CONVERSIONS.map((t) => cardHTML(t)).join('')}
        </div>
      </div>
    </div>
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  const allItems = [...PDF_TOOLS, ...PDF_CONVERSIONS];
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      // Locked card → redirect to Modules page
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = allItems.find((t) => t.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        const tool = {
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        };
        setActiveTool(tool);
        _scrollToDropZone();
      }
    });
  });
}

// ─── DOCUMENTS PANEL (main) ───────────────────────────────────────────────────

export function renderDocumentFormats(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Documents']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to all tools">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(255,107,107,0.15);color:#FF6B6B">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
            stroke="currentColor" stroke-width="1.3"/>
          <path d="M5 2h6a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.3"
            stroke-linecap="round"/>
          <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1"
            stroke-linecap="round"/>
          <line x1="4" y1="10" x2="8"  y2="10" stroke="currentColor" stroke-width="1.1"
            stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">Documents — Choose Format</span>
    </div>

    <div class="fmt-grid">
      ${DOC_FORMATS.map((f) => {
        let extra = '';
        if (f.isPdfEntry)  extra = 'fmt-card--pdf-entry';
        else if (f.isDocxEntry) extra = 'fmt-card--docx-entry';
        else if (f.isXlsxEntry) extra = 'fmt-card--xlsx-entry';
        else if (f.isPptxEntry) extra = 'fmt-card--pptx-entry';
        else if (f.isTxtEntry)  extra = 'fmt-card--txt-entry';
        else if (f.isOdtEntry)  extra = 'fmt-card--odt-entry';
        else if (f.isCsvEntry)  extra = 'fmt-card--csv-entry';
        return cardHTML(f, extra);
      }).join('')}
    </div>
  `;

  // Back → Dashboard
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });

  // PDF card → PDF tools panel
  const pdfCard = container.querySelector('.fmt-card--pdf-entry');
  if (pdfCard) {
    pdfCard.addEventListener('click', () => {
      renderPdfTools(container, activateNav);
    });
  }

  // DOCX card → DOCX conversions panel
  const docxCard = container.querySelector('.fmt-card--docx-entry');
  if (docxCard) {
    docxCard.addEventListener('click', () => {
      renderDocxTools(container, activateNav);
    });
  }

  // XLSX card → XLSX conversions panel
  const xlsxCard = container.querySelector('.fmt-card--xlsx-entry');
  if (xlsxCard) {
    xlsxCard.addEventListener('click', () => {
      renderXlsxTools(container, activateNav);
    });
  }

  // PPTX card → PPTX conversions panel
  const pptxCard = container.querySelector('.fmt-card--pptx-entry');
  if (pptxCard) {
    pptxCard.addEventListener('click', () => {
      renderPptxTools(container, activateNav);
    });
  }

  // TXT card → TXT conversions panel
  const txtCard = container.querySelector('.fmt-card--txt-entry');
  if (txtCard) {
    txtCard.addEventListener('click', () => {
      renderTxtTools(container, activateNav);
    });
  }

  // ODT card → ODT conversions panel
  const odtCard = container.querySelector('.fmt-card--odt-entry');
  if (odtCard) {
    odtCard.addEventListener('click', () => {
      renderOdtTools(container, activateNav);
    });
  }

  // CSV card → CSV conversions panel
  const csvCard = container.querySelector('.fmt-card--csv-entry');
  if (csvCard) {
    csvCard.addEventListener('click', () => {
      renderCsvTools(container, activateNav);
    });
  }

  // Other format card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card:not(.fmt-card--pdf-entry):not(.fmt-card--docx-entry):not(.fmt-card--xlsx-entry):not(.fmt-card--pptx-entry):not(.fmt-card--txt-entry):not(.fmt-card--odt-entry):not(.fmt-card--csv-entry)').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = DOC_FORMATS.find((f) => f.id === card.dataset.id);
      if (item) {
        const { mainText, subText } = _dropTextFor(item);
        setActiveTool({
          id: item.id, label: item.label, mainText, subText,
          icon: item.icon, color: item.color, bg: item.bg,
          tag: item.tag,
        });
        _scrollToDropZone();
      }
    });
  });
}

// Legacy export kept so old callers don't break
export function initDocuments() {}
