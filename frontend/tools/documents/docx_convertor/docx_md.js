/**
 * tools/documents/docx_convertor/docx_md.js
 * Thin wrapper — delegates everything to docx_convertor.js
 */
import { handleDocxFilePicked, removeDocxPanel } from './docx_convertor.js';

export function handleDocxMdFilePicked(file)  { return handleDocxFilePicked(file, 'docx-md'); }
export function removeDocxMdPanel()            { return removeDocxPanel(); }
