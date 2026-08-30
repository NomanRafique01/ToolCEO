/**
 * tools/images/jpg_convertor/jpg_webp.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgWebpFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-webp'); }
export function removeJpgWebpPanel()             { return removeJpgPanel(); }
