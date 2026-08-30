/**
 * tools/images/png_convertor/png_tiff.js
 * Thin wrapper — delegates everything to png_convertor.js
 */
import { handlePngFilesPicked, removePngPanel } from './png_convertor.js';

export function handlePngTiffFilePicked(files)  { return handlePngFilesPicked(files, 'png-tiff'); }
export function removePngTiffPanel()             { return removePngPanel(); }
