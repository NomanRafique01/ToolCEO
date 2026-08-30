/**
 * tools/images/png_convertor/png_bmp.js
 * Thin wrapper — delegates everything to png_convertor.js
 */
import { handlePngFilesPicked, removePngPanel } from './png_convertor.js';

export function handlePngBmpFilePicked(files)  { return handlePngFilesPicked(files, 'png-bmp'); }
export function removePngBmpPanel()             { return removePngPanel(); }
