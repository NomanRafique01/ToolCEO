/**
 * tools/images/jpg_convertor/jpg_gif.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgGifFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-gif'); }
export function removeJpgGifPanel()             { return removeJpgPanel(); }
