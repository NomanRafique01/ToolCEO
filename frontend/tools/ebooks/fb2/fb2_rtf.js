/**
 * tools/ebooks/fb2/fb2_rtf.js
 *
 * FB2 → RTF — thin wrapper around the shared ebook base.
 * All logic lives in tools/ebooks/shared/ebook_base.js
 *
 * Exports:
 *   handleEbook_fb2_rtf_FilePicked(file) – call when a file is chosen
 *   removeEbook_fb2_rtf_Panel()           – teardown on tool change
 */

import {
  handleEbookFilePicked,
  removeEbookPanel,
} from '../shared/ebook_base.js';

const _TOOL_ID = 'fb2-rtf';

export function handleEbook_fb2_rtf_FilePicked(file) {
  handleEbookFilePicked(file, _TOOL_ID);
}

export function removeEbook_fb2_rtf_Panel() {
  removeEbookPanel();
}
