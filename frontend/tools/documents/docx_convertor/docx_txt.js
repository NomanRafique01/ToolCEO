/**
 * tools/documents/docx_convertor/docx_txt.js
 * Thin wrapper — delegates everything to docx_convertor.js
 */
import { handleDocxFilePicked, removeDocxPanel } from './docx_convertor.js';

export function handleDocxTxtFilePicked(file)  { return handleDocxFilePicked(file, 'docx-txt'); }
export function removeDocxTxtPanel()            { return removeDocxPanel(); }
