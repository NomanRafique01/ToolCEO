/**
 * tools/images/png_convertor/png_webp.js
 * Thin wrapper — delegates everything to png_convertor.js
 */
import { handlePngFilesPicked, removePngPanel } from './png_convertor.js';

export function handlePngWebpFilePicked(files)  { return handlePngFilesPicked(files, 'png-webp'); }
export function removePngWebpPanel()             { return removePngPanel(); }
