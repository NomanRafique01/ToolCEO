/**
 * tools/documents/xlsx_convertor/xlsx_json.js
 * Thin wrapper — delegates everything to xlsx_convertor.js
 */
import { handleXlsxFilePicked, removeXlsxPanel } from './xlsx_convertor.js';

export function handleXlsxJsonFilePicked(file)  { return handleXlsxFilePicked(file, 'xlsx-json'); }
export function removeXlsxJsonPanel()            { return removeXlsxPanel(); }
