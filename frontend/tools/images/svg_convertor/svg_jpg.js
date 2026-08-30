/**
 * tools/images/svg_convertor/svg_jpg.js
 * Thin wrapper — delegates everything to svg_convertor.js
 */
import { handleSvgFilesPicked, removeSvgPanel } from './svg_convertor.js';

export function handleSvgJpgFilePicked(files)  { return handleSvgFilesPicked(files, 'svg-jpg'); }
export function removeSvgJpgPanel()             { return removeSvgPanel(); }
