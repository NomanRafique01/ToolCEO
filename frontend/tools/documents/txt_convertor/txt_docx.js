/**
 * tools/documents/txt_convertor/txt_docx.js
 * Thin wrapper — delegates everything to txt_convertor.js
 */
import { handleTxtFilePicked, removeTxtPanel } from './txt_convertor.js';

export function handleTxtDocxFilePicked(file)  { return handleTxtFilePicked(file, 'txt-docx'); }
export function removeTxtDocxPanel()            { return removeTxtPanel(); }
