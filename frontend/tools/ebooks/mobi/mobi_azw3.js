/**
 * tools/ebooks/mobi/mobi_azw3.js
 *
 * MOBI → AZW3 — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_mobi_azw3_FilePicked(file) – call when a file is chosen
 *   removeEbook_mobi_azw3_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'mobi-azw3';

export function handleEbook_mobi_azw3_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_mobi_azw3_Panel() {
  removeEbookPanel();
}
