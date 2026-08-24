/**
 * tools/ebooks/mobi/mobi_txt.js
 *
 * MOBI → TXT — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_mobi_txt_FilePicked(file) – call when a file is chosen
 *   removeEbook_mobi_txt_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'mobi-txt';

export function handleEbook_mobi_txt_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_mobi_txt_Panel() {
  removeEbookPanel();
}
