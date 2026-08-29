/**
 * tools/documents/csv_convertor/csv_txt.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvTxtFilePicked(file)  { return handleCsvFilePicked(file, 'csv-txt'); }
export function removeCsvTxtPanel()            { return removeCsvPanel(); }
