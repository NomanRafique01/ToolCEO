/**
 * frontend/scripts/historyTracker.js
 *
 * Utility helpers for conversion-history recording.
 *
 * The actual recording happens in the Electron main process — the
 * `save-file-dialog` IPC handler accepts an optional `conversionMeta`
 * 3rd argument and writes to SQLite after a successful save.
 *
 * This module exports:
 *   - buildConversionMeta(opts)   → the object to pass as 3rd arg
 *   - getCategoryFromFormat(ext)  → category string
 *   - initHistoryTracker()        → no-op (kept for backward compat)
 */

import { getActiveTool } from './toolstate.js';

// Format -> Category mapping
const CATEGORY_MAP = {
  // Document
  pdf: 'document', docx: 'document', doc: 'document',
  pptx: 'document', ppt: 'document', xlsx: 'document',
  xls: 'document', odt: 'document', odp: 'document',
  ods: 'document', txt: 'document', rtf: 'document',
  html: 'document', htm: 'document', md: 'document',

  // Image
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  svg: 'image', bmp: 'image', tiff: 'image', tif: 'image',
  heic: 'image', heif: 'image', gif: 'image', ico: 'image', avif: 'image',

  // Audio
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio',
  ogg: 'audio', wma: 'audio', m4a: 'audio', opus: 'audio',

  // Video
  mp4: 'video', webm: 'video', avi: 'video', mkv: 'video',
  mov: 'video', flv: 'video', wmv: 'video',

  // Ebook
  epub: 'ebook', mobi: 'ebook', azw3: 'ebook', fb2: 'ebook',

  // Archive
  zip: 'archive', rar: 'archive', '7z': 'archive',
  tar: 'archive', gz: 'archive',

  // Data
  csv: 'data', json: 'data', xml: 'data',
  yaml: 'data', yml: 'data', sql: 'data',
};

/**
 * Derives category from format extension.
 * @param {string} format
 * @returns {string}
 */
export function getCategoryFromFormat(format) {
  const ext = (format || '').toLowerCase().replace(/^\./, '').trim();
  return CATEGORY_MAP[ext] || 'document';
}

/**
 * Extracts extension from a filename.
 * @param {string} filename
 * @returns {string}
 */
function getExt(filename) {
  if (!filename) return '';
  const idx = filename.lastIndexOf('.');
  return idx !== -1 ? filename.substring(idx + 1).toLowerCase() : '';
}

/**
 * Build the conversionMeta object to pass as the 3rd argument to
 * window.toolceo.saveFileAs(filename, base64, conversionMeta).
 *
 * The main process will use this to write a row into the SQLite history DB.
 *
 * @param {Object} [opts]
 * @param {string} [opts.originalFilename] - source file name
 * @param {string} [opts.inputFormat]      - source extension (e.g. 'docx')
 * @param {string} [opts.outputFilename]   - target file name
 * @param {string} [opts.category]         - document|image|audio|video|ebook|archive|data
 * @returns {Object} conversionMeta
 */
export function buildConversionMeta(opts = {}) {
  const activeTool = getActiveTool();
  const outName    = opts.outputFilename || '';
  const outExt     = getExt(outName);

  let inExt    = opts.inputFormat  || '';
  let origName = opts.originalFilename || '';
  let cat      = opts.category || '';

  // Try to infer from active tool
  if (activeTool) {
    if (!origName && activeTool.sourceFilename) {
      origName = activeTool.sourceFilename;
    }
    if (!inExt && origName) {
      inExt = getExt(origName);
    }
    if (!cat && activeTool.category) {
      cat = activeTool.category.toLowerCase();
    }
    // If input extension still unknown, extract from tool id (e.g. 'pdf-docx')
    if (!inExt && activeTool.id) {
      const parts = String(activeTool.id).toLowerCase().split(/[-_]/);
      if (parts.length >= 2 && parts[0] && parts[0] !== parts[1]) {
        inExt = parts[0];
      }
    }
  }

  // Fallbacks
  if (!inExt) {
    if (outExt === 'zip') {
      if (outName.toLowerCase().includes('split_pdf') || origName.toLowerCase().includes('split_pdf')) {
        inExt = 'pdf';
      } else if (cat === 'image') {
        inExt = 'jpg';
      } else {
        inExt = 'file';
      }
    } else {
      inExt = outExt || 'file';
    }
  }
  if (!origName) {
    const stem = outName.replace(/\.[^/.]+$/, '') || 'input';
    origName = `${stem}.${inExt}`;
  }
  if (!cat) {
    cat = outExt === 'zip' && inExt && inExt !== 'file' ? getCategoryFromFormat(inExt) : getCategoryFromFormat(outExt);
  }

  return {
    original_filename: origName,
    input_format:      inExt.replace(/^\./, ''),
    category:          cat,
  };
}

/**
 * No-op — kept for backward compatibility with main.js import.
 * The actual history recording now happens in the main process.
 */
export function initHistoryTracker() {
  // intentionally empty — recording is handled by main process
}