/**
 * tools/documents/pptx_convertor/pptx_pdf.js
 * Thin wrapper — delegates everything to pptx_convertor.js
 */
import { handlePptxFilePicked, removePptxPanel } from './pptx_convertor.js';

export function handlePptxPdfFilePicked(file)  { return handlePptxFilePicked(file, 'pptx-pdf'); }
export function removePptxPdfPanel()            { return removePptxPanel(); }
