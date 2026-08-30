/**
 * tools/images/webp_convertor/webp_jpg.js
 * Thin wrapper — delegates everything to webp_convertor.js
 */
import { handleWebpFilesPicked, removeWebpPanel } from './webp_convertor.js';

export function handleWebpJpgFilePicked(files)  { return handleWebpFilesPicked(files, 'webp-jpg'); }
export function removeWebpJpgPanel()             { return removeWebpPanel(); }
