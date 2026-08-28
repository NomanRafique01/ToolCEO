/**
 * tools/documents/xlsx_convertor/xlsx_html.js
 * Thin wrapper — delegates everything to xlsx_convertor.js
 */
import { handleXlsxFilePicked, removeXlsxPanel } from './xlsx_convertor.js';

export function handleXlsxHtmlFilePicked(file)  { return handleXlsxFilePicked(file, 'xlsx-html'); }
export function removeXlsxHtmlPanel()            { return removeXlsxPanel(); }
