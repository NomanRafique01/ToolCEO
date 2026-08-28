/**
 * tools/documents/docx_convertor/docx_odt.js
 * Thin wrapper — delegates everything to docx_convertor.js
 */
import { handleDocxFilePicked, removeDocxPanel } from './docx_convertor.js';

export function handleDocxOdtFilePicked(file)  { return handleDocxFilePicked(file, 'docx-odt'); }
export function removeDocxOdtPanel()            { return removeDocxPanel(); }
