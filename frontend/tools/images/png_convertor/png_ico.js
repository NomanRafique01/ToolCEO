/**
 * tools/images/png_convertor/png_ico.js
 * Thin wrapper — delegates everything to png_convertor.js
 */
import { handlePngFilesPicked, removePngPanel } from './png_convertor.js';

export function handlePngIcoFilePicked(files)  { return handlePngFilesPicked(files, 'png-ico'); }
export function removePngIcoPanel()             { return removePngPanel(); }
