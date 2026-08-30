/**
 * tools/images/webp_convertor/webp_tiff.js
 * Thin wrapper — delegates everything to webp_convertor.js
 */
import { handleWebpFilesPicked, removeWebpPanel } from './webp_convertor.js';

export function handleWebpTiffFilePicked(files)  { return handleWebpFilesPicked(files, 'webp-tiff'); }
export function removeWebpTiffPanel()             { return removeWebpPanel(); }
