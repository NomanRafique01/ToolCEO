/**
 * tools/images/svg_convertor/svg_webp.js
 * Thin wrapper — delegates everything to svg_convertor.js
 */
import { handleSvgFilesPicked, removeSvgPanel } from './svg_convertor.js';

export function handleSvgWebpFilePicked(files)  { return handleSvgFilesPicked(files, 'svg-webp'); }
export function removeSvgWebpPanel()             { return removeSvgPanel(); }
