/**
 * tools/images/png_convertor/png_pdf.js
 * Thin wrapper — delegates everything to png_convertor.js
 */
import { handlePngFilesPicked, removePngPanel } from './png_convertor.js';

export function handlePngPdfFilePicked(files)  { return handlePngFilesPicked(files, 'png-pdf'); }
export function removePngPdfPanel()             { return removePngPanel(); }
