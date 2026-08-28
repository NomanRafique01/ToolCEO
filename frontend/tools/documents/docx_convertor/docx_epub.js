/**
 * tools/documents/docx_convertor/docx_epub.js
 * Thin wrapper — delegates everything to docx_convertor.js
 */
import { handleDocxFilePicked, removeDocxPanel } from './docx_convertor.js';

export function handleDocxEpubFilePicked(file)  { return handleDocxFilePicked(file, 'docx-epub'); }
export function removeDocxEpubPanel()            { return removeDocxPanel(); }
