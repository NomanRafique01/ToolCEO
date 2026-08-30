/**
 * tools/images/jpg_convertor/jpg_tiff.js
 * Thin wrapper — delegates everything to jpg_convertor.js
 */
import { handleJpgFilesPicked, removeJpgPanel } from './jpg_convertor.js';

export function handleJpgTiffFilePicked(files)  { return handleJpgFilesPicked(files, 'jpg-tiff'); }
export function removeJpgTiffPanel()             { return removeJpgPanel(); }
