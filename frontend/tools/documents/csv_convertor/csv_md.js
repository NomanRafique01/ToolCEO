/**
 * tools/documents/csv_convertor/csv_md.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvMdFilePicked(file)  { return handleCsvFilePicked(file, 'csv-md'); }
export function removeCsvMdPanel()            { return removeCsvPanel(); }
