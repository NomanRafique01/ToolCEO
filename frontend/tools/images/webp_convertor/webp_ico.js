/**
 * tools/images/webp_convertor/webp_ico.js
 * Thin wrapper — delegates everything to webp_convertor.js
 */
import { handleWebpFilesPicked, removeWebpPanel } from './webp_convertor.js';

export function handleWebpIcoFilePicked(files)  { return handleWebpFilesPicked(files, 'webp-ico'); }
export function removeWebpIcoPanel()             { return removeWebpPanel(); }
