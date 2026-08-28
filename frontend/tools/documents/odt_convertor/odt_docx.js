/**
 * tools/documents/odt_convertor/odt_docx.js
 * Thin wrapper — delegates everything to odt_convertor.js
 */
import { handleOdtFilePicked, removeOdtPanel } from './odt_convertor.js';

export function handleOdtDocxFilePicked(file)  { return handleOdtFilePicked(file, 'odt-docx'); }
export function removeOdtDocxPanel()            { return removeOdtPanel(); }
