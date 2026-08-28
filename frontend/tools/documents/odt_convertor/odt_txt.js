/**
 * tools/documents/odt_convertor/odt_txt.js
 * Thin wrapper — delegates everything to odt_convertor.js
 */
import { handleOdtFilePicked, removeOdtPanel } from './odt_convertor.js';

export function handleOdtTxtFilePicked(file)  { return handleOdtFilePicked(file, 'odt-txt'); }
export function removeOdtTxtPanel()            { return removeOdtPanel(); }
