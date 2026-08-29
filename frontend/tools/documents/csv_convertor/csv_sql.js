/**
 * tools/documents/csv_convertor/csv_sql.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvSqlFilePicked(file)  { return handleCsvFilePicked(file, 'csv-sql'); }
export function removeCsvSqlPanel()            { return removeCsvPanel(); }
