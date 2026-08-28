/**
 * tools/documents/pptx_convertor/pptx_txt.js
 * Thin wrapper — delegates everything to pptx_convertor.js
 */
import { handlePptxFilePicked, removePptxPanel } from './pptx_convertor.js';

export function handlePptxTxtFilePicked(file)  { return handlePptxFilePicked(file, 'pptx-txt'); }
export function removePptxTxtPanel()            { return removePptxPanel(); }
