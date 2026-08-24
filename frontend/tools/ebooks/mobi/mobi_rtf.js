/**
 * tools/ebooks/mobi/mobi_rtf.js
 *
 * MOBI → RTF — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_mobi_rtf_FilePicked(file) – call when a file is chosen
 *   removeEbook_mobi_rtf_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'mobi-rtf';

export function handleEbook_mobi_rtf_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_mobi_rtf_Panel() {
  removeEbookPanel();
}
