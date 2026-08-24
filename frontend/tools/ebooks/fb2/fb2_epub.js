/**
 * tools/ebooks/fb2/fb2_epub.js
 *
 * FB2 → EPUB — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_fb2_epub_FilePicked(file) – call when a file is chosen
 *   removeEbook_fb2_epub_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'fb2-epub';

export function handleEbook_fb2_epub_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_fb2_epub_Panel() {
  removeEbookPanel();
}
