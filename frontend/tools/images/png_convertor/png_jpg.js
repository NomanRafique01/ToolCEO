/**
 * tools/images/png_convertor/png_jpg.js
 * Thin wrapper — delegates everything to png_convertor.js
 */
import { handlePngFilesPicked, removePngPanel } from './png_convertor.js';

export function handlePngJpgFilePicked(files)  { return handlePngFilesPicked(files, 'png-jpg'); }
export function removePngJpgPanel()             { return removePngPanel(); }
