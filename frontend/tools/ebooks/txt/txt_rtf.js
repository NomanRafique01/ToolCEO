/**
 * tools/ebooks/txt/txt_rtf.js
 *
 * TXT → RTF — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_txt_rtf_FilePicked(file) – call when a file is chosen
 *   removeEbook_txt_rtf_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'txt-rtf';

export function handleEbook_txt_rtf_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_txt_rtf_Panel() {
  removeEbookPanel();
}
