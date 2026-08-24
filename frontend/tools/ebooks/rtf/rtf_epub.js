/**
 * tools/ebooks/rtf/rtf_epub.js
 *
 * RTF → EPUB — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_rtf_epub_FilePicked(file) – call when a file is chosen
 *   removeEbook_rtf_epub_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'rtf-epub';

export function handleEbook_rtf_epub_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_rtf_epub_Panel() {
  removeEbookPanel();
}
