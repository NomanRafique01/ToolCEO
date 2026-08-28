/**
 * tools/documents/txt_convertor/txt_pdf.js
 * Thin wrapper — delegates everything to txt_convertor.js
 */
import { handleTxtFilePicked, removeTxtPanel } from './txt_convertor.js';

export function handleTxtPdfFilePicked(file)  { return handleTxtFilePicked(file, 'txt-pdf'); }
export function removeTxtPdfPanel()            { return removeTxtPanel(); }
