/**
 * tools/ebooks/mobi/mobi_fb2.js
 *
 * MOBI → FB2 — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_mobi_fb2_FilePicked(file) – call when a file is chosen
 *   removeEbook_mobi_fb2_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'mobi-fb2';

export function handleEbook_mobi_fb2_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_mobi_fb2_Panel() {
  removeEbookPanel();
}
