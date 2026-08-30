/**
 * tools/images/jpg_convertor/jpg_pdf.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgPdfFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-pdf'); }
export function removeJpgPdfPanel()             { return removeJpgPanel(); }
