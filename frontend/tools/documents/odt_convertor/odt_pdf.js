/**
 * tools/documents/odt_convertor/odt_pdf.js
 * Thin wrapper — delegates everything to odt_convertor.js
 */
import { handleOdtFilePicked, removeOdtPanel } from './odt_convertor.js';

export function handleOdtPdfFilePicked(file)  { return handleOdtFilePicked(file, 'odt-pdf'); }
export function removeOdtPdfPanel()            { return removeOdtPanel(); }
