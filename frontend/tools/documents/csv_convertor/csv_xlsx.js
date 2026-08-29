/**
 * tools/documents/csv_convertor/csv_xlsx.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvXlsxFilePicked(file)  { return handleCsvFilePicked(file, 'csv-xlsx'); }
export function removeCsvXlsxPanel()            { return removeCsvPanel(); }
