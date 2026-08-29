/**
 * tools/documents/csv_convertor/csv_json.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvJsonFilePicked(file)  { return handleCsvFilePicked(file, 'csv-json'); }
export function removeCsvJsonPanel()            { return removeCsvPanel(); }
