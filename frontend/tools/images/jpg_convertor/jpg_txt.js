/**
 * tools/images/jpg_convertor/jpg_txt.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgTxtFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-txt'); }
export function removeJpgTxtPanel()             { return removeJpgPanel(); }
