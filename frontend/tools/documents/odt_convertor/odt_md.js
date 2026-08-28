/**
 * tools/documents/odt_convertor/odt_md.js
 * Thin wrapper — delegates everything to odt_convertor.js
 */
import { handleOdtFilePicked, removeOdtPanel } from './odt_convertor.js';

export function handleOdtMdFilePicked(file)  { return handleOdtFilePicked(file, 'odt-md'); }
export function removeOdtMdPanel()            { return removeOdtPanel(); }
