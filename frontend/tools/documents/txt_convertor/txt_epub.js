/**
 * tools/documents/txt_convertor/txt_epub.js
 * Thin wrapper — delegates everything to txt_convertor.js
 */
import { handleTxtFilePicked, removeTxtPanel } from './txt_convertor.js';

export function handleTxtEpubFilePicked(file)  { return handleTxtFilePicked(file, 'txt-epub'); }
export function removeTxtEpubPanel()            { return removeTxtPanel(); }
