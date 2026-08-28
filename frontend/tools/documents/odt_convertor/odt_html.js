/**
 * tools/documents/odt_convertor/odt_html.js
 * Thin wrapper — delegates everything to odt_convertor.js
 */
import { handleOdtFilePicked, removeOdtPanel } from './odt_convertor.js';

export function handleOdtHtmlFilePicked(file)  { return handleOdtFilePicked(file, 'odt-html'); }
export function removeOdtHtmlPanel()            { return removeOdtPanel(); }
