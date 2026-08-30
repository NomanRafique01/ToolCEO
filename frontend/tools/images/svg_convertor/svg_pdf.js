/**
 * tools/images/svg_convertor/svg_pdf.js
 * Thin wrapper — delegates everything to svg_convertor.js
 */
import { handleSvgFilesPicked, removeSvgPanel } from './svg_convertor.js';

export function handleSvgPdfFilePicked(files)  { return handleSvgFilesPicked(files, 'svg-pdf'); }
export function removeSvgPdfPanel()             { return removeSvgPanel(); }
