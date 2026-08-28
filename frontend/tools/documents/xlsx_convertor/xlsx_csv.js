/**
 * tools/documents/xlsx_convertor/xlsx_csv.js
 * Thin wrapper — delegates everything to xlsx_convertor.js
 */
import { handleXlsxFilePicked, removeXlsxPanel } from './xlsx_convertor.js';

export function handleXlsxCsvFilePicked(file)  { return handleXlsxFilePicked(file, 'xlsx-csv'); }
export function removeXlsxCsvPanel()            { return removeXlsxPanel(); }
