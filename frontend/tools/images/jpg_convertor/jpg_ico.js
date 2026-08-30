/**
 * tools/images/jpg_convertor/jpg_ico.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgIcoFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-ico'); }
export function removeJpgIcoPanel()             { return removeJpgPanel(); }
