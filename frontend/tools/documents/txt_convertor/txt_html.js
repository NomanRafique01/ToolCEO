/**
 * tools/documents/txt_convertor/txt_html.js
 * Thin wrapper — delegates everything to txt_convertor.js
 */
import { handleTxtFilePicked, removeTxtPanel } from './txt_convertor.js';

export function handleTxtHtmlFilePicked(file)  { return handleTxtFilePicked(file, 'txt-html'); }
export function removeTxtHtmlPanel()            { return removeTxtPanel(); }
