/**
 * tools/documents/txt_convertor/txt_rtf.js
 * Thin wrapper — delegates everything to txt_convertor.js
 */
import { handleTxtFilePicked, removeTxtPanel } from './txt_convertor.js';

export function handleTxtRtfFilePicked(file)  { return handleTxtFilePicked(file, 'txt-rtf'); }
export function removeTxtRtfPanel()            { return removeTxtPanel(); }
