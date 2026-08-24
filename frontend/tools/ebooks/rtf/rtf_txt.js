/**
 * tools/ebooks/rtf/rtf_txt.js
 *
 * RTF → TXT — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_rtf_txt_FilePicked(file) – call when a file is chosen
 *   removeEbook_rtf_txt_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'rtf-txt';

export function handleEbook_rtf_txt_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_rtf_txt_Panel() {
  removeEbookPanel();
}
