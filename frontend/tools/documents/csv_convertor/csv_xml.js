/**
 * tools/documents/csv_convertor/csv_xml.js
 * Thin wrapper — delegates everything to csv_convertor.js
 */
import { handleCsvFilePicked, removeCsvPanel } from './csv_convertor.js';

export function handleCsvXmlFilePicked(file)  { return handleCsvFilePicked(file, 'csv-xml'); }
export function removeCsvXmlPanel()            { return removeCsvPanel(); }
