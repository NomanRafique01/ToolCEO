/**
 * tools/documents/pptx_convertor/pptx_odp.js
 * Thin wrapper — delegates everything to pptx_convertor.js
 */
import { handlePptxFilePicked, removePptxPanel } from './pptx_convertor.js';

export function handlePptxOdpFilePicked(file)  { return handlePptxFilePicked(file, 'pptx-odp'); }
export function removePptxOdpPanel()            { return removePptxPanel(); }
