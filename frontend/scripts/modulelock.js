/**
 * modulelock.js
 * Shared module-lock state for ToolCEO.
 *
 * Provides:
 *   loadModuleStatuses()      — fetch modules.json and cache statuses
 *   getModuleStatuses()       — return cached { office, ocr, document, ebook, media }
 *   getLockedModuleId(toolId) — return the required module id if the tool is locked, else null
 *   TOOL_MODULE_MAP           — the full tool-id → module-id mapping (exported for reference)
 *
 * Locked = the required module's status is NOT "installed".
 * Built-in tools are absent from the map — they are never locked.
 */

// ─── TOOL → MODULE MAPPING ────────────────────────────────────────────────────
// Only tools that require a module are listed here.
// Built-in tools (PyMuPDF, Pillow, pikepdf, pandas, etc.) are NOT in this map.

export const TOOL_MODULE_MAP = {
    // ── Media Module (7-Zip archive tools) ───────────────────────────────────
    'archive-files-zip': 'media',
    'archive-files-tar': 'media',
    'archive-files-tar-gz': 'media',
    'archive-files-tar-bz2': 'media',
    'archive-files-7z': 'media',
    'archive-folder-zip': 'media',
    'archive-folder-7z': 'media',
    'archive-extract-zip': 'media',
    'archive-extract-rar': 'media',
    'archive-extract-7z': 'media',
    'archive-extract-tar': 'media',
    'archive-extract-tar-gz': 'media',
    'archive-extract-tar-bz2': 'media',
    'archive-extract-tar-xz': 'media',
    'archive-extract-gz': 'media',
    'archive-extract-bz2': 'media',
    'archive-extract-xz': 'media',
    'archive-extract-cab': 'media',
    'archive-extract-iso': 'media',
    'archive-extract-dmg': 'media',
    'archive-protect': 'media',    // Password Protect Archive (ZIP/7Z/RAR — AES-256)
    'archive-unlock': 'media',     // Remove Archive Password  (ZIP/7Z/RAR)
    'archive-duplicate': 'media',  // Duplicate Finder in Archive
  
  // ── Office Module (LibreOffice) ───────────────────────────────────────────
  'docx-pdf'    : 'office',
  'docx-html'   : 'office',
  'docx-odt'    : 'office',
  'pptx-pdf'    : 'office',
  'pptx-html'   : 'office',
  'pptx-images' : 'office',
  'pptx-odp'    : 'office',
  'pptx-repair' : 'office',
  'xlsx-pdf'    : 'office',
  'xlsx-html'   : 'office',
  'xlsx-ods'    : 'office',
  'txt-pdf'     : 'office',
  'odt-pdf'     : 'office',
  'odt-docx'    : 'office',
  'odt-html'    : 'office',
  'odt-rtf'     : 'office',
  'csv-pdf'     : 'office',
  'pdf-word'    : 'office',   // primary / digital path — lock on Office Module
  'pdf-html'    : 'office',

  // ── OCR Module (Tesseract) ────────────────────────────────────────────────
  'pdf-excel'   : 'ocr',      // no digital-PDF-to-Excel path — lock on OCR
  'pdf-txt'     : 'ocr',
  'jpg-txt'     : 'ocr',
  'png-txt'     : 'ocr',
  'webp-txt'    : 'ocr',

  // ── Document Module (Pandoc) ──────────────────────────────────────────────
  'docx-txt'    : 'document',
  'docx-epub'   : 'document',
  'docx-md'     : 'document',
  'txt-docx'    : 'document',
  'txt-html'    : 'document',
  'txt-md'      : 'document',
  'txt-epub'    : 'document',
  'txt-odt'     : 'document',
  'txt-rtf'     : 'document',
  'odt-txt'     : 'document',
  'odt-epub'    : 'document',
  'odt-md'      : 'document',
  'pptx-txt'    : 'document',

  // ── eBook Module (Calibre) ────────────────────────────────────────────────
  // Every ebook conversion is identified by the pattern "ebook-<src>-<dst>"
  // (built by ebooks.js as `${fmtKey}-${item.id}`).
  // We also lock the ebook FORMAT entry cards themselves: "ebook-epub", etc.
  // The full list is handled dynamically in isEbookTool() below — see note.

  // ── Media Module (FFmpeg + 7-Zip) ────────────────────────────────────────
  // Audio format cards use bare IDs like 'mp3', 'wav', etc.
  'mp3'  : 'media',
  'wav'  : 'media',
  'flac' : 'media',
  'aac'  : 'media',
  'ogg'  : 'media',
  'wma'  : 'media',
  'm4a'  : 'media',
  'opus' : 'media',
};

// ─── MODULE DEFINITIONS (tool-count and display name) ─────────────────────────

export const MODULE_INFO = {
  office   : { name: 'Office Module',   toolCount: 19 },
  ocr      : { name: 'OCR Module',      toolCount:  5 },
  document : { name: 'Document Module', toolCount: 13 },
  ebook    : { name: 'eBook Module',    toolCount: 37 },
  media    : { name: 'Media Module',    toolCount: 8  },
};

// ─── CACHED STATE ─────────────────────────────────────────────────────────────

let _statuses = null; // { office: 'installed'|'not_installed', ... }

/**
 * Load and cache module statuses from modules.json.
 * Safe to call multiple times — subsequent calls reuse the cache.
 * @returns {Promise<Object>}  map of moduleId → status string
 */
export async function loadModuleStatuses() {
  if (_statuses) return _statuses;
  try {
    if (window.electronAPI && window.electronAPI.readModulesJson) {
      _statuses = await window.electronAPI.readModulesJson();
    } else {
      const res  = await fetch('../modules.json');
      const data = await res.json();
      _statuses  = Object.fromEntries(
        Object.entries(data.modules).map(([k, v]) => [k, v.status])
      );
    }
  } catch (_) {
    // On failure treat everything as not_installed (safe default)
    _statuses = {};
  }
  return _statuses;
}

/**
 * Invalidate the cached statuses — call this after a module is installed.
 */
export function invalidateModuleCache() {
  _statuses = null;
}

/**
 * Return the cached statuses synchronously.
 * Always call loadModuleStatuses() first and await it before using this.
 */
export function getModuleStatuses() {
  return _statuses || {};
}

/**
 * Returns true if the given tool id belongs to the eBook Module family.
 * eBook conversion ids follow the pattern: "<fmtKey>-<conversionId>"
 * e.g. "epub-mobi", "mobi-epub", "epub-pdf", "pdf-epub" etc.
 * The format entry card ids are "ebook-epub", "ebook-mobi", etc.
 */
const EBOOK_FORMAT_KEYS = new Set(['epub', 'mobi', 'fb2', 'azw3', 'rtf']);

export function isEbookTool(toolId) {
  if (!toolId) return false;
  // Format entry cards: "ebook-<fmt>"
  if (toolId.startsWith('ebook-')) return true;
  // Conversion cards: "<src>-<dst>" where both src and dst are ebook formats
  // OR where the prefix is an ebook format key
  const parts = toolId.split('-');
  if (parts.length >= 2 && EBOOK_FORMAT_KEYS.has(parts[0])) return true;
  return false;
}

/**
 * Returns the moduleId that must be installed for `toolId` to be usable,
 * or null if the tool is either built-in or its module is already installed.
 *
 * @param {string} toolId
 * @returns {string|null}  e.g. 'office', 'ocr', 'document', 'ebook', 'media', or null
 */
export function getLockedModuleId(toolId) {
  const statuses = getModuleStatuses();

  // eBook tools — checked dynamically
  if (isEbookTool(toolId)) {
    return statuses['ebook'] === 'installed' ? null : 'ebook';
  }

  const moduleId = TOOL_MODULE_MAP[toolId];
  if (!moduleId) return null;                          // built-in tool — never locked
  return statuses[moduleId] === 'installed' ? null : moduleId;
}

/**
 * Returns true if the given toolId is locked (module not installed).
 */
export function isToolLocked(toolId) {
  return getLockedModuleId(toolId) !== null;
}
