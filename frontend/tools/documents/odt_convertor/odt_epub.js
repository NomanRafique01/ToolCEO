/**
 * tools/documents/odt_convertor/odt_epub.js
 * Thin wrapper — delegates everything to odt_convertor.js
 */
import { handleOdtFilePicked, removeOdtPanel } from './odt_convertor.js';

export function handleOdtEpubFilePicked(file)  { return handleOdtFilePicked(file, 'odt-epub'); }
export function removeOdtEpubPanel()            { return removeOdtPanel(); }
