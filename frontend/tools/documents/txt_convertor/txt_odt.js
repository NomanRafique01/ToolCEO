/**
 * tools/documents/txt_convertor/txt_odt.js
 * Thin wrapper — delegates everything to txt_convertor.js
 */
import { handleTxtFilePicked, removeTxtPanel } from './txt_convertor.js';

export function handleTxtOdtFilePicked(file)  { return handleTxtFilePicked(file, 'txt-odt'); }
export function removeTxtOdtPanel()            { return removeTxtPanel(); }
