/**
 * tools/ebooks/azw3/azw3_mobi.js
 *
 * AZW3 → MOBI — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_azw3_mobi_FilePicked(file) – call when a file is chosen
 *   removeEbook_azw3_mobi_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'azw3-mobi';

export function handleEbook_azw3_mobi_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_azw3_mobi_Panel() {
  removeEbookPanel();
}
