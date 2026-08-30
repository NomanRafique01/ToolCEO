/**
 * tools/images/webp_convertor/webp_txt.js
 * Thin wrapper — delegates everything to webp_convertor.js
 */
import { handleWebpFilesPicked, removeWebpPanel } from './webp_convertor.js';

export function handleWebpTxtFilePicked(files)  { return handleWebpFilesPicked(files, 'webp-txt'); }
export function removeWebpTxtPanel()             { return removeWebpPanel(); }
