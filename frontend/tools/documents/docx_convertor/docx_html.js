/**
 * tools/documents/docx_convertor/docx_html.js
 * Thin wrapper — delegates everything to docx_convertor.js
 */
import { handleDocxFilePicked, removeDocxPanel } from './docx_convertor.js';

export function handleDocxHtmlFilePicked(file)  { return handleDocxFilePicked(file, 'docx-html'); }
export function removeDocxHtmlPanel()            { return removeDocxPanel(); }
