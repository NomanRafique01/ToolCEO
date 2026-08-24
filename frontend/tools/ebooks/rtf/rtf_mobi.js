/**
 * tools/ebooks/rtf/rtf_mobi.js
 *
 * RTF → MOBI — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_rtf_mobi_FilePicked(file) – call when a file is chosen
 *   removeEbook_rtf_mobi_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'rtf-mobi';

export function handleEbook_rtf_mobi_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_rtf_mobi_Panel() {
  removeEbookPanel();
}
