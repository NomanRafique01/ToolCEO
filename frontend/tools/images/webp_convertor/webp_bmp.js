/**
 * tools/images/webp_convertor/webp_bmp.js
 * Thin wrapper — delegates everything to webp_convertor.js
 */
import { handleWebpFilesPicked, removeWebpPanel } from './webp_convertor.js';

export function handleWebpBmpFilePicked(files)  { return handleWebpFilesPicked(files, 'webp-bmp'); }
export function removeWebpBmpPanel()             { return removeWebpPanel(); }
