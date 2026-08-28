/**
 * tools/documents/xlsx_convertor/xlsx_pdf.js
 * Thin wrapper — delegates everything to xlsx_convertor.js
 */
import { handleXlsxFilePicked, removeXlsxPanel } from './xlsx_convertor.js';

export function handleXlsxPdfFilePicked(file)  { return handleXlsxFilePicked(file, 'xlsx-pdf'); }
export function removeXlsxPdfPanel()            { return removeXlsxPanel(); }
