/**
 * tools/ebooks/epub/epub_rtf.js
 *
 * EPUB → RTF — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_epub_rtf_FilePicked(file) – call when a file is chosen
 *   removeEbook_epub_rtf_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'epub-rtf';

export function handleEbook_epub_rtf_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_epub_rtf_Panel() {
  removeEbookPanel();
}
