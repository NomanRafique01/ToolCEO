/**
 * tools/images/svg_convertor/svg_png.js
 * Thin wrapper — delegates everything to svg_convertor.js
 */
import { handleSvgFilesPicked, removeSvgPanel } from './svg_convertor.js';

export function handleSvgPngFilePicked(files)  { return handleSvgFilesPicked(files, 'svg-png'); }
export function removeSvgPngPanel()             { return removeSvgPanel(); }
