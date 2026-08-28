/**
 * tools/documents/pptx_convertor/pptx_html.js
 * Thin wrapper — delegates everything to pptx_convertor.js
 */
import { handlePptxFilePicked, removePptxPanel } from './pptx_convertor.js';

export function handlePptxHtmlFilePicked(file)  { return handlePptxFilePicked(file, 'pptx-html'); }
export function removePptxHtmlPanel()            { return removePptxPanel(); }
