/**
 * documents.js
 * Renders the Documents format-selection grid and the PDF-specific
 * tools/conversions panel into the explore-section container.
 */

import { setBreadcrumb } from './navigation.js';
import { setActiveTool } from './toolstate.js';

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
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M5 5l1.5 1.5M11 5l-1.5 1.5M5 11l1.5-1.5M11 11l-1.5-1.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'rotate',
    label: 'Rotate Pages',
    desc: 'Rotate individual or all pages',
    tag: 'Tool',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <path d="M13 8a5 5 0 1 1-1.46-3.54" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M11 1v4h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
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
    id: 'watermark',
    label: 'Watermark',
    desc: 'Add text or image watermarks',
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
    id: 'ocr',
    label: 'OCR PDF',
    desc: 'Extract text from scanned PDFs',
    tag: 'Tool',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <line x1="3" y1="7" x2="7" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="3" y1="9" x2="6" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M11 5h3M11 8h3M11 11h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M9.5 4.5l1 1.5-1 1.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'metadata',
    label: 'PDF Metadata',
    desc: 'View and edit PDF properties',
    tag: 'Tool',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="5" y1="7.5" x2="11" y2="7.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="5" y1="10" x2="8" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <circle cx="11" cy="11.5" r="2.5" stroke="currentColor" stroke-width="1.2"/>
      <line x1="11" y1="10.8" x2="11" y2="11.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="11" cy="10" r="0.5" fill="currentColor"/>
    </svg>`,
  },
];

// ─── PDF CONVERSION CARDS ─────────────────────────────────────────────────────

const PDF_CONVERSIONS = [
  {
    id: 'pdf-docx',
    label: 'PDF → DOCX',
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
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
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
    id: 'docx-pdf',
    label: 'DOCX → PDF',
    desc: 'Convert Word document to PDF',
    tag: 'Convert',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <line x1="3" y1="6" x2="5" y2="6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="3" y1="8" x2="5" y2="8" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M7 9l2 1.5L7 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="9" y="2" width="6" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
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

// ─── DOCUMENT FORMAT CARDS (main Documents panel) ─────────────────────────────

const DOC_FORMATS = [
  {
    id: 'pdf',
    label: 'PDF',
    desc: 'Portable Document Format',
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
    label: 'DOCX',
    desc: 'Microsoft Word Document',
    ext: '.docx',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
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
    label: 'XLSX',
    desc: 'Microsoft Excel Spreadsheet',
    ext: '.xlsx',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="7" x2="10" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10" y1="7" x2="4" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'pptx',
    label: 'PPTX',
    desc: 'Microsoft PowerPoint',
    ext: '.pptx',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="4" y="7" width="5" height="3.5" rx="1" stroke="currentColor" stroke-width="1.1"/>
    </svg>`,
  },
  {
    id: 'txt',
    label: 'TXT',
    desc: 'Plain Text File',
    ext: '.txt',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4" y1="6"  x2="10" y2="6"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="7"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'rtf',
    label: 'RTF',
    desc: 'Rich Text Format',
    ext: '.rtf',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4" y1="6"   x2="10" y2="6"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="4" y1="8.5" x2="9"  y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="11"  x2="6"  y2="11"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'odt',
    label: 'ODT',
    desc: 'OpenDocument Text',
    ext: '.odt',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'csv',
    label: 'CSV',
    desc: 'Comma-Separated Values',
    ext: '.csv',
    color: '#84CC16',
    bg: 'rgba(132,204,22,0.15)',
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
  const bottom = item.ext
    ? `<div class="fmt-ext">${item.ext}</div>`
    : `<div class="fmt-tag fmt-tag--${item.tag.toLowerCase()}">${item.tag}</div>`;
  return `
    <div class="fmt-card${extraClass ? ' ' + extraClass : ''}" data-id="${item.id}"
         style="--fmt-color:${item.color};--fmt-bg:${item.bg}">
      <div class="fmt-card-top">
        <div class="fmt-icon-box">${item.icon}</div>
        <span class="fmt-arrow">›</span>
      </div>
      <div class="fmt-label">${item.label}</div>
      <div class="fmt-desc">${item.desc}</div>
      ${bottom}
    </div>`;
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
  `;

  // Back → Documents panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Documents');
  });

  // Card selection highlight + tool-state update
  const allItems = [...PDF_TOOLS, ...PDF_CONVERSIONS];
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = allItems.find((t) => t.id === card.dataset.id);
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
      ${DOC_FORMATS.map((f) => cardHTML(f, f.isPdfEntry ? 'fmt-card--pdf-entry' : '')).join('')}
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

  // Other format card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card:not(.fmt-card--pdf-entry)').forEach((card) => {
    card.addEventListener('click', () => {
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
