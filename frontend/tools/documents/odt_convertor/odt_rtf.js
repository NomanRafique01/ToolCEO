/**
 * tools/documents/odt_convertor/odt_rtf.js
 * Thin wrapper — delegates everything to odt_convertor.js
 */
import { handleOdtFilePicked, removeOdtPanel } from './odt_convertor.js';

export function handleOdtRtfFilePicked(file)  { return handleOdtFilePicked(file, 'odt-rtf'); }
export function removeOdtRtfPanel()            { return removeOdtPanel(); }
