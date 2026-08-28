/**
 * tools/documents/xlsx_convertor/xlsx_txt.js
 * Thin wrapper — delegates everything to xlsx_convertor.js
 */
import { handleXlsxFilePicked, removeXlsxPanel } from './xlsx_convertor.js';

export function handleXlsxTxtFilePicked(file)  { return handleXlsxFilePicked(file, 'xlsx-txt'); }
export function removeXlsxTxtPanel()            { return removeXlsxPanel(); }
