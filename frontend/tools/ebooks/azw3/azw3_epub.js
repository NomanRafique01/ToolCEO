/**
 * tools/ebooks/azw3/azw3_epub.js
 *
 * AZW3 → EPUB — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_azw3_epub_FilePicked(file) – call when a file is chosen
 *   removeEbook_azw3_epub_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'azw3-epub';

export function handleEbook_azw3_epub_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_azw3_epub_Panel() {
  removeEbookPanel();
}
