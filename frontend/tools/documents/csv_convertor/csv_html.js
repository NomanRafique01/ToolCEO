/**
 * tools/documents/csv_convertor/csv_html.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvHtmlFilePicked(file)  { return handleCsvFilePicked(file, 'csv-html'); }
export function removeCsvHtmlPanel()            { return removeCsvPanel(); }
