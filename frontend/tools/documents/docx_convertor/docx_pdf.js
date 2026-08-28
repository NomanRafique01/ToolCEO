/**
 * tools/documents/docx_convertor/docx_pdf.js
 * Thin wrapper — delegates everything to docx_convertor.js
 */
import { handleDocxFilePicked, removeDocxPanel } from './docx_convertor.js';

export function handleDocxPdfFilePicked(file)  { return handleDocxFilePicked(file, 'docx-pdf'); }
export function removeDocxPdfPanel()            { return removeDocxPanel(); }
