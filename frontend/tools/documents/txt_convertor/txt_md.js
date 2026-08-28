/**
 * tools/documents/txt_convertor/txt_md.js
 * Thin wrapper — delegates everything to txt_convertor.js
 */
import { handleTxtFilePicked, removeTxtPanel } from './txt_convertor.js';

export function handleTxtMdFilePicked(file)  { return handleTxtFilePicked(file, 'txt-md'); }
export function removeTxtMdPanel()            { return removeTxtPanel(); }
