/**
 * tools/ebooks/azw3/azw3_txt.js
 *
 * AZW3 → TXT — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_azw3_txt_FilePicked(file) – call when a file is chosen
 *   removeEbook_azw3_txt_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'azw3-txt';

export function handleEbook_azw3_txt_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_azw3_txt_Panel() {
  removeEbookPanel();
}
