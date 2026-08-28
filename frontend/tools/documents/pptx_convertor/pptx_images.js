/**
 * tools/documents/pptx_convertor/pptx_images.js
 * Thin wrapper — delegates everything to pptx_convertor.js
 */
import { handlePptxFilePicked, removePptxPanel } from './pptx_convertor.js';

export function handlePptxImagesFilePicked(file)  { return handlePptxFilePicked(file, 'pptx-images'); }
export function removePptxImagesPanel()            { return removePptxPanel(); }
