/**
 * searchEngine.js
 * Dedicated offline search service for ToolCEO.
 * Uses Fuse.js for fuzzy matching with typo tolerance, keyword enrichment, and synonym support.
 */

import Fuse from '../vendor/fuse/fuse.mjs';
import { getAllDocumentTools } from './documents.js';
import { getAllImageTools }    from './images.js';
import { getAllEbookTools }    from './ebooks.js';
import { getAllArchiveTools }  from './archives.js';

// ─── Internal State ───────────────────────────────────────────────────────────
let _fuseInstance = null;
let _toolIndex    = [];
let _initDone     = false;

// ─── Synonym / Keyword Dictionary ─────────────────────────────────────────────
const SYNONYM_MAP = {
  'pdf':        'pdf document portable acrobat',
  'word':       'word docx microsoft document text write',
  'excel':      'excel xlsx spreadsheet sheet rows columns calculate',
  'powerpoint': 'powerpoint pptx presentation slides deck',
  'ppt':        'powerpoint pptx presentation slides deck',
  'pptx':       'powerpoint presentation slides',
  'docx':       'word document microsoft text',
  'xlsx':       'excel spreadsheet sheet microsoft',
  'csv':        'csv comma separated spreadsheet data table',
  'odt':        'odt opendocument text libreoffice',
  'txt':        'txt text plain ascii raw',
  'rtf':        'rtf rich text',
  'html':       'html web page webpage browser',
  'md':         'md markdown text',
  'compress':   'compress reduce shrink optimize quality smaller size',
  'compressor': 'compress reduce shrink optimize quality smaller size',
  'split':      'split divide separate cut pages',
  'merge':      'merge combine join unite multiple files',
  'combine':    'merge combine join unite multiple files',
  'rotate':     'rotate flip orientation pages turn',
  'encrypt':    'encrypt protect password secure lock',
  'protect':    'encrypt protect password secure lock',
  'watermark':  'watermark stamp logo text overlay',
  'edit':       'edit modify annotate pdf editor',
  'extract':    'extract pull out contents unpack',
  'convert':    'convert change transform format',
  'repair':     'repair fix corrupt damaged',
  'image':      'image picture photo graphic visual',
  'jpg':        'jpg jpeg photo image picture',
  'jpeg':       'jpg jpeg photo image picture',
  'png':        'png image transparent',
  'webp':       'webp modern image web',
  'svg':        'svg vector scalable graphic',
  'bmp':        'bmp bitmap image',
  'tiff':       'tiff tif image graphic print',
  'ico':        'ico icon favicon',
  'zip':        'zip archive compress bundle pack create',
  'unzip':      'unzip extract open decompress archive zip',
  'rar':        'rar archive winrar compressed',
  '7z':         '7z 7zip archive compressed',
  'tar':        'tar tarball archive linux unix',
  'gz':         'gz gzip compress linux archive',
  'archive':    'archive compress zip pack bundle files',
  'pack':       'archive compress zip bundle create',
  'epub':       'epub ebook reader digital book',
  'mobi':       'mobi kindle ebook reader amazon',
  'azw3':       'azw3 kindle ebook amazon reader',
  'fb2':        'fb2 fictionbook ebook reader',
  'ebook':      'ebook epub mobi kindle reader digital book',
  'book':       'ebook epub mobi kindle reader digital',
  'kindle':     'kindle mobi azw3 amazon ebook',
};

// ─── Enrichment ───────────────────────────────────────────────────────────────
function _buildKeywords(tool) {
  const parts = [];
  const idTokens = (tool.id || '').split(/[-_]/).filter(Boolean);
  parts.push(...idTokens);
  const labelTokens = (tool.label || '').toLowerCase().split(/[\s\/,]+/).filter(Boolean);
  parts.push(...labelTokens);
  if (tool.ext)         parts.push(tool.ext.replace('.', ''));
  if (tool.desc)        parts.push(tool.desc.toLowerCase());
  if (tool.subCategory) parts.push(tool.subCategory.toLowerCase());
  if (tool.family)      parts.push(tool.family.toLowerCase());
  if (tool.tag)         parts.push((tool.tag || '').toLowerCase());
  const synonyms = [];
  parts.forEach((token) => {
    if (SYNONYM_MAP[token]) synonyms.push(SYNONYM_MAP[token]);
  });
  parts.push(...synonyms);
  return [...new Set(parts)].join(' ');
}

function _enrich(tool, family, familyLabel) {
  return {
    ...tool,
    family     : tool.family      || family,
    familyLabel: tool.familyLabel || familyLabel,
    mainText   : tool.mainText    || '',
    subText    : tool.subText     || '',
    tag        : tool.tag         || familyLabel || '',
    _keywords  : _buildKeywords(tool),
  };
}

function _buildIndex() {
  try {
    const docTools = (typeof getAllDocumentTools === 'function' ? getAllDocumentTools() : [])
      .map((t) => _enrich(t, 'document', 'Document'));
    const imgTools = (typeof getAllImageTools === 'function' ? getAllImageTools() : [])
      .map((t) => _enrich(t, 'image', 'Image'));
    const ebTools = (typeof getAllEbookTools === 'function' ? getAllEbookTools() : [])
      .map((t) => _enrich(t, 'ebook', 'eBook'));
    const arcTools = (typeof getAllArchiveTools === 'function' ? getAllArchiveTools() : [])
      .map((t) => _enrich(t, 'archive', 'Archive'));
    _toolIndex = [...docTools, ...imgTools, ...ebTools, ...arcTools];
  } catch (err) {
    console.warn('[SearchEngine] Failed to build tool index:', err);
    _toolIndex = [];
  }
}

function _buildFuse() {
  _fuseInstance = new Fuse(_toolIndex, {
    keys: [
      { name: 'label',     weight: 0.40 },
      { name: '_keywords', weight: 0.30 },
      { name: 'id',        weight: 0.15 },
      { name: 'ext',       weight: 0.10 },
      { name: 'desc',      weight: 0.05 },
    ],
    threshold      : 0.38,
    distance       : 200,
    ignoreLocation : true,
    includeScore   : true,
    minMatchCharLength: 2,
    findAllMatches : false,
    useExtendedSearch: false,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-warm the search engine. Called once at app boot.
 */
export function initSearchEngine() {
  if (_initDone) return;
  _initDone = true;
  _buildIndex();
  _buildFuse();
  console.log(`[SearchEngine] Initialised. ${_toolIndex.length} tools indexed.`);
}

/**
 * Fuzzy search tools.
 * @param {string} query
 * @param {string} filter  'all' | 'document' | 'image' | 'ebook' | 'archive'
 * @param {number} limit
 * @returns {object[]}
 */
export function searchTools(query = '', filter = 'all', limit = 15) {
  if (!_initDone || !_fuseInstance) initSearchEngine();
  const q = query.trim();

  let pool = _toolIndex;
  if (filter && filter !== 'all') {
    pool = _toolIndex.filter((t) => t.family === filter);
  }

  if (!q) return pool.slice(0, limit);

  // Run Fuse on the filtered pool by constructing a focused instance when needed
  const searchFuse = (filter && filter !== 'all')
    ? new Fuse(pool, _fuseInstance.options)
    : _fuseInstance;

  const results = searchFuse.search(q, { limit });
  const items = results.map((r) => r.item);

  // Fallback: substring match if Fuse finds nothing
  if (items.length === 0 && q.length >= 1) {
    const ql = q.toLowerCase();
    return pool.filter((t) =>
      t.label.toLowerCase().includes(ql) ||
      t._keywords.includes(ql) ||
      (t.id || '').toLowerCase().includes(ql)
    ).slice(0, limit);
  }

  return items;
}

/**
 * Return curated suggestions when query is empty.
 * @param {string} filter
 * @param {number} limit
 * @returns {object[]}
 */
export function getSuggestedTools(filter = 'all', limit = 8) {
  if (!_initDone) initSearchEngine();
  let pool = _toolIndex;
  if (filter && filter !== 'all') {
    pool = _toolIndex.filter((t) => t.family === filter);
  }
  return pool.slice(0, limit);
}

/**
 * Get the full enriched tool spec by ID.
 * @param {string} toolId
 * @returns {object|null}
 */
export function getToolById(toolId) {
  if (!_initDone) initSearchEngine();
  return _toolIndex.find((t) => t.id === toolId) || null;
}

/**
 * Total number of indexed tools.
 * @returns {number}
 */
export function getToolCount() {
  if (!_initDone) initSearchEngine();
  return _toolIndex.length;
}
