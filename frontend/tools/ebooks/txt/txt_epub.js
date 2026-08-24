/**
 * tools/ebooks/txt/txt_epub.js
 *
 * TXT → EPUB — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_txt_epub_FilePicked(file) – call when a file is chosen
 *   removeEbook_txt_epub_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'txt-epub';

export function handleEbook_txt_epub_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_txt_epub_Panel() {
  removeEbookPanel();
}
