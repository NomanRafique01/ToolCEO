/**
 * tools/documents/xlsx_convertor/xlsx_ods.js
 * Thin wrapper — delegates everything to xlsx_convertor.js
 */
import { handleXlsxFilePicked, removeXlsxPanel } from './xlsx_convertor.js';

export function handleXlsxOdsFilePicked(file)  { return handleXlsxFilePicked(file, 'xlsx-ods'); }
export function removeXlsxOdsPanel()            { return removeXlsxPanel(); }
