/**
 * tools/images/jpg_convertor/jpg_png.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgPngFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-png'); }
export function removeJpgPngPanel()             { return removeJpgPanel(); }
