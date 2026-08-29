/**
 * tools/documents/csv_convertor/csv_pdf.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvPdfFilePicked(file)  { return handleCsvFilePicked(file, 'csv-pdf'); }
export function removeCsvPdfPanel()            { return removeCsvPanel(); }
