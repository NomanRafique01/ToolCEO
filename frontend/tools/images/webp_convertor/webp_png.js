/**
 * tools/images/webp_convertor/webp_png.js
 * Thin wrapper — delegates everything to webp_convertor.js
 */
import { handleWebpFilesPicked, removeWebpPanel } from './webp_convertor.js';

export function handleWebpPngFilePicked(files)  { return handleWebpFilesPicked(files, 'webp-png'); }
export function removeWebpPngPanel()             { return removeWebpPanel(); }
