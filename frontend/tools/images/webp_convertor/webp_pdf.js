/**
 * tools/images/webp_convertor/webp_pdf.js
 * Thin wrapper — delegates everything to webp_convertor.js
 */
import { handleWebpFilesPicked, removeWebpPanel } from './webp_convertor.js';

export function handleWebpPdfFilePicked(files)  { return handleWebpFilesPicked(files, 'webp-pdf'); }
export function removeWebpPdfPanel()             { return removeWebpPanel(); }
