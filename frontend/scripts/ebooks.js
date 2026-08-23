/**
 * ebooks.js
 * All eBook-related UI: the format picker and per-format conversion sub-panels.
 * Imported by navigation.js; completely independent of documents.js.
 *
 * Navigation flow:
 *   Ebooks (sidebar / explore card)
 *     → renderEbookFormats()          — 7 format cards (PDF, EPUB, MOBI, FB2, TXT, RTF, AZW3)
 *       → renderEbookConversions()    — conversion cards for the chosen format
 */

import { setBreadcrumb }          from './navigation.js';
import { setActiveTool }          from './toolstate.js';

// ─── THEME MAP ────────────────────────────────────────────────────────────────
// One entry per supported ebook format.  color/bg are the CSS custom-property
// values injected on every card in that format's sub-panel.

const FORMAT_THEME = {
  pdf:  { color: '#FF6B6B', bg: 'rgba(255,107,107,0.15)' },
  epub: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)'  },
  mobi: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)'  },
  fb2:  { color: '#10B981', bg: 'rgba(16,185,129,0.15)'  },
  txt:  { color: '#A78BFA', bg: 'rgba(167,139,250,0.15)' },
  rtf:  { color: '#FBBF24', bg: 'rgba(251,191,36,0.15)'  },
  azw3: { color: '#38BDF8', bg: 'rgba(56,189,248,0.15)'  },
};

// ─── FORMAT PICKER CARDS (top-level Ebooks panel) ─────────────────────────────

const EBOOK_FORMATS = [
  {
    id: 'ebook-pdf',
    fmt: 'pdf',
    label: 'PDF',
    desc: 'Portable Document Format eBook',
    ...FORMAT_THEME.pdf,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="8"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'ebook-epub',
    fmt: 'epub',
    label: 'EPUB',
    desc: 'Standard eBook format for all readers',
    ...FORMAT_THEME.epub,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="9" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 1v13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="6" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="6" y1="7" x2="9" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="6" y1="9" x2="8" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'ebook-mobi',
    fmt: 'mobi',
    label: 'MOBI',
    desc: 'Amazon Kindle legacy eBook format',
    ...FORMAT_THEME.mobi,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="9" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 1v13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M7 5l1.5 2.5L7 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'ebook-fb2',
    fmt: 'fb2',
    label: 'FB2',
    desc: 'FictionBook 2 — popular in Eastern Europe',
    ...FORMAT_THEME.fb2,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="9" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 1v13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <text x="6.5" y="10" font-size="6" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
    </svg>`,
  },
  {
    id: 'ebook-txt',
    fmt: 'txt',
    label: 'TXT',
    desc: 'Plain text eBook',
    ...FORMAT_THEME.txt,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4" y1="6"  x2="10" y2="6"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="8"  x2="10" y2="8"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="10" x2="7"  y2="10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'ebook-rtf',
    fmt: 'rtf',
    label: 'RTF',
    desc: 'Rich Text Format eBook',
    ...FORMAT_THEME.rtf,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4" y1="6"   x2="10" y2="6"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="4" y1="8.5" x2="9"  y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="11"  x2="6"  y2="11"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'ebook-azw3',
    fmt: 'azw3',
    label: 'AZW3',
    desc: 'Amazon Kindle Format 8 (KF8)',
    ...FORMAT_THEME.azw3,
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="9" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5 1v13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M7 4l2 4-2 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="13" cy="7.5" r="2" stroke="currentColor" stroke-width="1.2"/>
      <line x1="13" y1="10.5" x2="13" y2="13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`,
  },
];

// ─── PER-FORMAT CONVERSION CARDS ─────────────────────────────────────────────
// For each source format, one entry per target format.
// All cards inside a sub-panel share the source format's color/bg theme.

const CONVERSIONS = {

  // ── PDF → * ───────────────────────────────────────────────────────────────
  pdf: [
    {
      id: 'pdf-epub',
      label: 'PDF → EPUB',
      desc: 'Convert PDF to reflowable EPUB eBook',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="5" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3.5 2l2.5 2.5H3.5V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M6 8l2 1.5L6 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'pdf-mobi',
      label: 'PDF → MOBI',
      desc: 'Convert PDF to Kindle MOBI format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="5" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3.5 2l2.5 2.5H3.5V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M6 8l2 1.5L6 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      id: 'pdf-fb2',
      label: 'PDF → FB2',
      desc: 'Convert PDF to FictionBook 2 format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="5" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3.5 2l2.5 2.5H3.5V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M6 8l2 1.5L6 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="12" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
      </svg>`,
    },
    {
      id: 'pdf-txt',
      label: 'PDF → TXT',
      desc: 'Extract plain text from PDF eBook',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="5" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3.5 2l2.5 2.5H3.5V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M6 8l2 1.5L6 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="9" y1="4"  x2="15" y2="4"  stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="9" y1="9"  x2="13" y2="9"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'pdf-rtf',
      label: 'PDF → RTF',
      desc: 'Convert PDF to Rich Text Format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="5" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3.5 2l2.5 2.5H3.5V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M6 8l2 1.5L6 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="10.5" y1="5"   x2="13.5" y2="5"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="10.5" y1="7"   x2="13"   y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10.5" y1="9"   x2="11.5" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'pdf-azw3',
      label: 'PDF → AZW3',
      desc: 'Convert PDF to Kindle AZW3 (KF8)',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="5" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3.5 2l2.5 2.5H3.5V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M6 8l2 1.5L6 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ],

  // ── EPUB → * ──────────────────────────────────────────────────────────────
  epub: [
    {
      id: 'epub-pdf',
      label: 'EPUB → PDF',
      desc: 'Convert EPUB eBook to PDF',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <line x1="10" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'epub-mobi',
      label: 'EPUB → MOBI',
      desc: 'Convert EPUB to Kindle MOBI',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      id: 'epub-fb2',
      label: 'EPUB → FB2',
      desc: 'Convert EPUB to FictionBook 2',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="12" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
      </svg>`,
    },
    {
      id: 'epub-txt',
      label: 'EPUB → TXT',
      desc: 'Extract plain text from EPUB',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="9" y1="4"   x2="15" y2="4"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="9" y1="9"   x2="13" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'epub-rtf',
      label: 'EPUB → RTF',
      desc: 'Convert EPUB to Rich Text Format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="10.5" y1="5"   x2="13.5" y2="5"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="10.5" y1="7"   x2="13"   y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10.5" y1="9"   x2="11.5" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'epub-azw3',
      label: 'EPUB → AZW3',
      desc: 'Convert EPUB to Kindle AZW3 (KF8)',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ],

  // ── MOBI → * ──────────────────────────────────────────────────────────────
  mobi: [
    {
      id: 'mobi-pdf',
      label: 'MOBI → PDF',
      desc: 'Convert Kindle MOBI to PDF',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <line x1="10" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'mobi-epub',
      label: 'MOBI → EPUB',
      desc: 'Convert Kindle MOBI to EPUB',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'mobi-fb2',
      label: 'MOBI → FB2',
      desc: 'Convert Kindle MOBI to FictionBook 2',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="12" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
      </svg>`,
    },
    {
      id: 'mobi-txt',
      label: 'MOBI → TXT',
      desc: 'Extract plain text from MOBI',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="9" y1="4"   x2="15" y2="4"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="9" y1="9"   x2="13" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'mobi-rtf',
      label: 'MOBI → RTF',
      desc: 'Convert MOBI to Rich Text Format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="10.5" y1="5"   x2="13.5" y2="5"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="10.5" y1="7"   x2="13"   y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10.5" y1="9"   x2="11.5" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'mobi-azw3',
      label: 'MOBI → AZW3',
      desc: 'Convert Kindle MOBI to AZW3 (KF8)',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ],

  // ── FB2 → * ───────────────────────────────────────────────────────────────
  fb2: [
    {
      id: 'fb2-pdf',
      label: 'FB2 → PDF',
      desc: 'Convert FictionBook 2 to PDF',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="4" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <line x1="10" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'fb2-epub',
      label: 'FB2 → EPUB',
      desc: 'Convert FictionBook 2 to EPUB',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="4" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'fb2-mobi',
      label: 'FB2 → MOBI',
      desc: 'Convert FictionBook 2 to Kindle MOBI',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="4" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      id: 'fb2-txt',
      label: 'FB2 → TXT',
      desc: 'Extract plain text from FictionBook 2',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="4" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="9" y1="4"   x2="15" y2="4"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="9" y1="9"   x2="13" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'fb2-rtf',
      label: 'FB2 → RTF',
      desc: 'Convert FictionBook 2 to Rich Text Format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="4" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="10.5" y1="5"   x2="13.5" y2="5"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="10.5" y1="7"   x2="13"   y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10.5" y1="9"   x2="11.5" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'fb2-azw3',
      label: 'FB2 → AZW3',
      desc: 'Convert FictionBook 2 to Kindle AZW3',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="4" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ],

  // ── TXT → * ───────────────────────────────────────────────────────────────
  txt: [
    {
      id: 'txt-pdf',
      label: 'TXT → PDF',
      desc: 'Convert plain text file to PDF',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="5"   x2="5.5" y2="5"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="2.5" y1="7"   x2="5.5" y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="2.5" y1="9"   x2="4.5" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <line x1="10" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'txt-epub',
      label: 'TXT → EPUB',
      desc: 'Convert plain text to EPUB eBook',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="5"   x2="5.5" y2="5"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="2.5" y1="7"   x2="5.5" y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'txt-mobi',
      label: 'TXT → MOBI',
      desc: 'Convert plain text to Kindle MOBI',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="5"   x2="5.5" y2="5"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="2.5" y1="7"   x2="5.5" y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      id: 'txt-fb2',
      label: 'TXT → FB2',
      desc: 'Convert plain text to FictionBook 2',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="5"   x2="5.5" y2="5"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="2.5" y1="7"   x2="5.5" y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="12" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
      </svg>`,
    },
    {
      id: 'txt-rtf',
      label: 'TXT → RTF',
      desc: 'Convert plain text to Rich Text Format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="5"   x2="5.5" y2="5"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="2.5" y1="7"   x2="5.5" y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="10.5" y1="5"   x2="13.5" y2="5"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="10.5" y1="7"   x2="13"   y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10.5" y1="9"   x2="11.5" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'txt-azw3',
      label: 'TXT → AZW3',
      desc: 'Convert plain text to Kindle AZW3',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="5"   x2="5.5" y2="5"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="2.5" y1="7"   x2="5.5" y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ],

  // ── RTF → * ───────────────────────────────────────────────────────────────
  rtf: [
    {
      id: 'rtf-pdf',
      label: 'RTF → PDF',
      desc: 'Convert Rich Text Format to PDF',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="4.5" x2="5.5" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="2.5" y1="6.5" x2="5"   y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="2.5" y1="8.5" x2="3.5" y2="8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <line x1="10" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'rtf-epub',
      label: 'RTF → EPUB',
      desc: 'Convert Rich Text Format to EPUB',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="4.5" x2="5.5" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="2.5" y1="6.5" x2="5"   y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'rtf-mobi',
      label: 'RTF → MOBI',
      desc: 'Convert Rich Text Format to Kindle MOBI',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="4.5" x2="5.5" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="2.5" y1="6.5" x2="5"   y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      id: 'rtf-fb2',
      label: 'RTF → FB2',
      desc: 'Convert Rich Text Format to FictionBook 2',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="4.5" x2="5.5" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="2.5" y1="6.5" x2="5"   y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="12" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
      </svg>`,
    },
    {
      id: 'rtf-txt',
      label: 'RTF → TXT',
      desc: 'Strip formatting — convert RTF to plain text',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="4.5" x2="5.5" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="2.5" y1="6.5" x2="5"   y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="9" y1="4"   x2="15" y2="4"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="9" y1="9"   x2="13" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'rtf-azw3',
      label: 'RTF → AZW3',
      desc: 'Convert Rich Text Format to Kindle AZW3',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="2.5" y1="4.5" x2="5.5" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="2.5" y1="6.5" x2="5"   y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ],

  // ── AZW3 → * ──────────────────────────────────────────────────────────────
  azw3: [
    {
      id: 'azw3-pdf',
      label: 'AZW3 → PDF',
      desc: 'Convert Kindle AZW3 to PDF',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
        <path d="M12 2l3 3h-3V2Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        <line x1="10" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10" y1="9" x2="12" y2="9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'azw3-epub',
      label: 'AZW3 → EPUB',
      desc: 'Convert Kindle AZW3 to EPUB',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="5" x2="14" y2="5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="12" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'azw3-mobi',
      label: 'AZW3 → MOBI',
      desc: 'Convert Kindle AZW3 to legacy MOBI',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M12.5 5l1 2-1 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      id: 'azw3-fb2',
      label: 'AZW3 → FB2',
      desc: 'Convert Kindle AZW3 to FictionBook 2',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M11 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <text x="12" y="9" font-size="4.5" font-weight="700" fill="currentColor" font-family="sans-serif">fb</text>
      </svg>`,
    },
    {
      id: 'azw3-txt',
      label: 'AZW3 → TXT',
      desc: 'Extract plain text from Kindle AZW3',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="9" y1="4"   x2="15" y2="4"   stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="9" y1="9"   x2="13" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'azw3-rtf',
      label: 'AZW3 → RTF',
      desc: 'Convert Kindle AZW3 to Rich Text Format',
      tag: 'Convert',
      icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <path d="M3 2v9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M4 4.5l1.5 3-1.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 8l2 1.5L7 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="9" y="2" width="6" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <line x1="10.5" y1="5"   x2="13.5" y2="5"   stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="10.5" y1="7"   x2="13"   y2="7"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        <line x1="10.5" y1="9"   x2="11.5" y2="9"   stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      </svg>`,
    },
  ],
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Shared card HTML builder — same pattern used in documents.js */
function cardHTML(item, extraClass = '') {
  const bottom = `<div class="fmt-tag fmt-tag--convert">${item.tag}</div>`;
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

/** Format picker card (top-level, no tag bottom) */
function formatCardHTML(item) {
  return `
    <div class="fmt-card fmt-card--ebook-fmt" data-fmt="${item.fmt}" data-id="${item.id}"
         style="--fmt-color:${item.color};--fmt-bg:${item.bg}">
      <div class="fmt-card-top">
        <div class="fmt-icon-box">${item.icon}</div>
        <span class="fmt-arrow">›</span>
      </div>
      <div class="fmt-label">${item.label}</div>
      <div class="fmt-desc">${item.desc}</div>
      <div class="fmt-tag fmt-tag--tool">Convert</div>
    </div>`;
}

function _scrollToDropZone() {
  const mc = document.getElementById('main-content');
  if (mc) mc.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── SUB-PANEL: conversions for one ebook format ──────────────────────────────

function renderEbookConversions(container, activateNav, fmtKey) {
  const fmt   = EBOOK_FORMATS.find((f) => f.fmt === fmtKey);
  const cards = CONVERSIONS[fmtKey] || [];
  const theme = FORMAT_THEME[fmtKey];

  // Apply the source format's color to every conversion card
  const themedCards = cards.map((c) => ({ ...c, color: theme.color, bg: theme.bg }));

  setBreadcrumb(['Dashboard', 'eBooks', fmt.label]);

  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to eBooks">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon"
           style="background:${theme.bg};color:${theme.color}">
        ${fmt.icon}
      </div>
      <span class="explore-title">${fmt.label} — Convert to…</span>
    </div>

    <div class="fmt-grid">
      ${themedCards.map((c) => cardHTML(c)).join('')}
    </div>
  `;

  // Back → ebook picker
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    renderEbookFormats(container, activateNav);
  });

  // Card click → set active tool
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const item = themedCards.find((c) => c.id === card.dataset.id);
      if (item) {
        setActiveTool({
          id      : item.id,
          label   : item.label,
          mainText: `Drop file to Convert ${item.label}`,
          subText : `or click to select a file for ${item.label}`,
          icon    : item.icon,
          color   : item.color,
          bg      : item.bg,
          tag     : 'Convert',
        });
        _scrollToDropZone();
      }
    });
  });
}

// ─── TOP-LEVEL EBOOK PANEL ────────────────────────────────────────────────────

/**
 * Renders the eBook format-picker into `container`.
 * Clicking a format card drills into that format's conversion sub-panel.
 *
 * @param {HTMLElement} container   - #explore-section
 * @param {Function}    activateNav - navigation.js activateNav()
 * @param {string}      [backTo='Dashboard'] - where the back button navigates
 */
export function renderEbookFormats(container, activateNav, backTo = 'Dashboard') {
  const crumbs = backTo === 'Documents'
    ? ['Dashboard', 'Documents', 'eBooks']
    : ['Dashboard', 'eBooks'];
  setBreadcrumb(crumbs);

  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(251,191,36,0.15);color:#FBBF24">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 13s-4-2-7-2V3c3 0 7 2 7 2s4-2 7-2v8c-3 0-7 2-7 2Z"
            stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <line x1="8" y1="5" x2="8" y2="13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">eBooks — Choose Format</span>
    </div>

    <div class="fmt-grid">
      ${EBOOK_FORMATS.map((f) => formatCardHTML(f)).join('')}
    </div>
  `;

  // Back → previous panel
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav(backTo);
  });

  // Format card → drill into conversions sub-panel
  container.querySelectorAll('.fmt-card--ebook-fmt').forEach((card) => {
    card.addEventListener('click', () => {
      renderEbookConversions(container, activateNav, card.dataset.fmt);
    });
  });
}
