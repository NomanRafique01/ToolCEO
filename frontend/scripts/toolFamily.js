/**
 * frontend/scripts/toolFamily.js
 *
 * Dedicated resolver for tool families and their theme colors.
 * Maps output/input formats and categories to the exact ToolCEO family:
 *   - Documents: Red       (#FF6B6B)
 *   - Images:    Purple    (#A78BFA)
 *   - Audio:     Orange    (#FB923C)
 *   - Video:     Sky Blue  (#38BDF8)
 *   - Ebooks:    Amber     (#FBBF24)
 *   - Archives:  Lime      (#84CC16)
 *   - Data:      Teal      (#2DD4BF)
 */

export const FAMILY_COLORS = {
  document: '#FF6B6B',
  image:    '#A78BFA',
  audio:    '#FB923C',
  video:    '#38BDF8',
  ebook:    '#FBBF24',
  archive:  '#84CC16',
  data:     '#2DD4BF',
};

const FORMAT_TO_FAMILY = {
  // Documents (Red #FF6B6B)
  pdf:  'document',
  docx: 'document',
  doc:  'document',
  odt:  'document',
  txt:  'document',
  rtf:  'document',
  html: 'document',
  htm:  'document',
  md:   'document',
  pptx: 'document',
  ppt:  'document',
  odp:  'document',

  // Images (Purple #A78BFA)
  png:  'image',
  jpg:  'image',
  jpeg: 'image',
  webp: 'image',
  svg:  'image',
  gif:  'image',
  bmp:  'image',
  tiff: 'image',
  tif:  'image',
  ico:  'image',
  avif: 'image',
  heic: 'image',
  heif: 'image',

  // Audio (Orange #FB923C)
  mp3:  'audio',
  wav:  'audio',
  flac: 'audio',
  aac:  'audio',
  ogg:  'audio',
  wma:  'audio',
  m4a:  'audio',
  opus: 'audio',

  // Video (Sky blue #38BDF8)
  mp4:  'video',
  webm: 'video',
  mkv:  'video',
  avi:  'video',
  mov:  'video',
  flv:  'video',
  wmv:  'video',

  // Ebooks (Amber / Yellow #FBBF24)
  epub: 'ebook',
  mobi: 'ebook',
  azw3: 'ebook',
  fb2:  'ebook',

  // Archives (Lime #84CC16)
  zip:  'archive',
  rar:  'archive',
  '7z': 'archive',
  tar:  'archive',
  gz:   'archive',

  // Data (Teal #2DD4BF)
  csv:  'data',
  json: 'data',
  xml:  'data',
  sql:  'data',
  yaml: 'data',
  yml:  'data',
  xlsx: 'data',
  xls:  'data',
  ods:  'data',
};

function extractExt(str) {
  if (!str) return '';
  const cleaned = String(str).toLowerCase().trim();
  if (cleaned.includes('.')) {
    return cleaned.split('.').pop().trim();
  }
  return cleaned.replace(/^\./, '').trim();
}

export function getToolFamily(inputFormat, inputFilename, outputFormat, categoryFallback) {
  const inExt = extractExt(inputFormat);
  if (inExt && FORMAT_TO_FAMILY[inExt]) {
    return FORMAT_TO_FAMILY[inExt];
  }

  const inFileNameExt = extractExt(inputFilename);
  if (inFileNameExt && FORMAT_TO_FAMILY[inFileNameExt]) {
    return FORMAT_TO_FAMILY[inFileNameExt];
  }

  const outExt = extractExt(outputFormat);
  if (outExt && FORMAT_TO_FAMILY[outExt]) {
    return FORMAT_TO_FAMILY[outExt];
  }

  const cat = String(categoryFallback || '').toLowerCase().trim();
  if (FAMILY_COLORS[cat]) {
    return cat;
  }

  return 'document';
}

export function getToolFamilyColor(inputFormat, inputFilename, outputFormat, categoryFallback) {
  const family = getToolFamily(inputFormat, inputFilename, outputFormat, categoryFallback);
  return FAMILY_COLORS[family] || '#FF6B6B';
}
