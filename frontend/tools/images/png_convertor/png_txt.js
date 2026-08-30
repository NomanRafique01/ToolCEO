/**
 * tools/images/png_convertor/png_txt.js
 * Thin wrapper — delegates everything to png_convertor.js
 */
import { handlePngFilesPicked, removePngPanel } from './png_convertor.js';

export function handlePngTxtFilePicked(files)  { return handlePngFilesPicked(files, 'png-txt'); }
export function removePngTxtPanel()             { return removePngPanel(); }
