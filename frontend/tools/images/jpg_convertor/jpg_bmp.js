/**
 * tools/images/jpg_convertor/jpg_bmp.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgBmpFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-bmp'); }
export function removeJpgBmpPanel()             { return removeJpgPanel(); }
