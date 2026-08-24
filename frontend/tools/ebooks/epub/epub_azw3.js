/**
 * tools/ebooks/epub/epub_azw3.js
 *
 * EPUB → AZW3 — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_epub_azw3_FilePicked(file) – call when a file is chosen
 *   removeEbook_epub_azw3_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'epub-azw3';

export function handleEbook_epub_azw3_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_epub_azw3_Panel() {
  removeEbookPanel();
}
