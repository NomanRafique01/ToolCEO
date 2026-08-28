/**
 * tools/documents/pptx_convertor/pptx_repair.js
 * Thin wrapper — delegates everything to pptx_convertor.js
 */
import { handlePptxFilePicked, removePptxPanel } from './pptx_convertor.js';

export function handlePptxRepairFilePicked(file)  { return handlePptxFilePicked(file, 'pptx-repair'); }
export function removePptxRepairPanel()            { return removePptxPanel(); }
