/**
 * frontend/scripts/recent.js
 *
 * Recent Page Redesign for ToolCEO:
 * - No drop zone: history only
 * - Grid layout: large thumbnail cards (OS file explorer icons view, 4-5 per row)
 * - Category-specific styled visual tile preview in brand colors:
 *     document: clean file sheet with bold format and accent stripes
 *     image: camera / photo landscape frame with format badge
 *     audio: sound equalizer / waveform visualization with format badge
 *     video: cinema film-strip with perforated borders
 *     ebook: hardbound book cover with embossed title and bookmark
 *     archive: secure locked / zipped container with zipper teeth
 *     data: spreadsheet / relational table cells grid
 * - Filename with ellipsis truncation
 * - Input -> Output format badge in cyan (e.g. PDF -> EPUB)
 * - Formatted date & time (e.g. 14 Jan 2025 · 03:42 PM)
 * - Status dot: green for success, red for failed
 * - Hover: card lift + folder icon (show in folder) + trash icon (delete entry)
 * - Click: open file if exists, inline toast if no longer available
 * - Empty state: clean centered SVG illustration and copy
 */

import { setBreadcrumb } from './navigation.js';
import { getOfflinePdfInfo } from '../tools/shared/pdfRenderer.js';
import { getToolFamily, getToolFamilyColor } from './toolFamily.js';

// Cache for generated data URLs to avoid re-rendering
const THUMB_CACHE = new Map();

/**
 * Format ISO datetime string to: "14 Jan 2025 · 03:42 PM"
 * @param {string} dtStr
 * @returns {string}
 */
export function formatConversionDate(dtStr) {
  if (!dtStr) return 'Just now';
  try {
    const d = new Date(dtStr.includes('Z') || dtStr.includes('+') ? dtStr : dtStr.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return dtStr;

    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours.toString().padStart(2, '0') : '12';

    return `${day} ${month} ${year} · ${hours}:${minutes} ${ampm}`;
  } catch (_) {
    return dtStr;
  }
}

/**
 * Format bytes to readable size
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Format signature accent colors matching ToolCEO categories and tools
const FORMAT_COLORS = {
  // Spreadsheets / Data
  xlsx: '#EAB308',
  xls:  '#EAB308',
  csv:  '#34D399',
  ods:  '#34D399',
  json: '#34D399',
  xml:  '#34D399',
  sql:  '#34D399',
  yaml: '#34D399',
  yml:  '#34D399',

  // Documents
  docx: '#38BDF8',
  doc:  '#38BDF8',
  odt:  '#818CF8',
  txt:  '#94A3B8',
  rtf:  '#5BB8F5',
  html: '#FB923C',
  htm:  '#FB923C',
  md:   '#38BDF8',

  // Presentations
  pptx: '#FB923C',
  ppt:  '#FB923C',
  odp:  '#FB923C',

  // PDF
  pdf:  '#EF4444',

  // eBooks
  epub: '#F472B6',
  mobi: '#F472B6',
  azw3: '#F472B6',
  fb2:  '#F472B6',

  // Archives
  zip:  '#EAB308',
  rar:  '#EAB308',
  '7z': '#EAB308',
  tar:  '#EAB308',
  gz:   '#EAB308',

  // Audio
  mp3:  '#A78BFA',
  wav:  '#60A5FA',
  flac: '#34D399',
  aac:  '#A78BFA',
  ogg:  '#FBBF24',
  wma:  '#A78BFA',
  m4a:  '#A78BFA',

  // Video
  mp4:  '#F5A35B',
  webm: '#F5A35B',
  mkv:  '#F5A35B',
  avi:  '#F5A35B',
  mov:  '#F5A35B',
  flv:  '#F5A35B',
};

const CATEGORY_COLORS = {
  document: '#FF6B6B',
  data:     '#2DD4BF',
  ebook:    '#FBBF24',
  archive:  '#84CC16',
  audio:    '#FB923C',
  video:    '#38BDF8',
  image:    '#A78BFA',
};

/**
 * Generates custom authentic SVG thumbnail for ZIP archives sized 90×116
 * (equal to the size of the PDF thumbnail).
 */
export function getCustomZipFolderSvg() {
  return `
    <svg class="win-custom-zip-svg" viewBox="0 0 90 116" width="90" height="116" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="zipBackGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#E8B946"/>
          <stop offset="100%" stop-color="#C9982E"/>
        </linearGradient>
        <linearGradient id="zipFrontGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFDE7A"/>
          <stop offset="50%" stop-color="#F7C844"/>
          <stop offset="100%" stop-color="#E5AF28"/>
        </linearGradient>
        <linearGradient id="zipTrackGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#27272A"/>
          <stop offset="50%" stop-color="#52525B"/>
          <stop offset="100%" stop-color="#27272A"/>
        </linearGradient>
        <linearGradient id="zipPullGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="50%" stop-color="#E2E8F0"/>
          <stop offset="100%" stop-color="#94A3B8"/>
        </linearGradient>
        <filter id="zipDropShadow" x="-15%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.45"/>
        </filter>
      </defs>

      <!-- Back folder flap with top tab -->
      <g filter="url(#zipDropShadow)">
        <path d="M 8,15 C 8,11.5 10.5,9 14,9 L 36,9 L 43,15 L 76,15 C 79.5,15 82,17.5 82,21 L 82,103 C 82,106.5 79.5,109 76,109 L 14,109 C 10.5,109 8,106.5 8,103 Z" fill="url(#zipBackGrad)"/>
      </g>

      <!-- Inner document sheet peaking slightly -->
      <rect x="14" y="14" width="62" height="32" rx="2" fill="#FFFFFF" opacity="0.95"/>
      <line x1="20" y1="19" x2="40" y2="19" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="20" y1="24" x2="56" y2="24" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round"/>

      <!-- Front folder flap -->
      <g filter="url(#zipDropShadow)">
        <path d="M 8,26 C 8,22.5 10.5,20 14,20 L 76,20 C 79.5,20 82,22.5 82,26 L 82,103 C 82,106.5 79.5,109 76,109 L 14,109 C 10.5,109 8,106.5 8,103 Z" fill="url(#zipFrontGrad)"/>
      </g>

      <!-- Vertical metallic zipper track down center -->
      <rect x="41" y="9" width="8" height="100" fill="url(#zipTrackGrad)" rx="1"/>

      <!-- Metallic zipper teeth -->
      <line x1="41" y1="12" x2="44.5" y2="12" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="15" x2="49" y2="15" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="18" x2="44.5" y2="18" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="21" x2="49" y2="21" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="24" x2="44.5" y2="24" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="27" x2="49" y2="27" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="30" x2="44.5" y2="30" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="33" x2="49" y2="33" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="36" x2="44.5" y2="36" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="39" x2="49" y2="39" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="42" x2="44.5" y2="42" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="45" x2="49" y2="45" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="48" x2="44.5" y2="48" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="51" x2="49" y2="51" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="54" x2="44.5" y2="54" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="57" x2="49" y2="57" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="60" x2="44.5" y2="60" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="63" x2="49" y2="63" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="66" x2="44.5" y2="66" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="69" x2="49" y2="69" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="72" x2="44.5" y2="72" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="75" x2="49" y2="75" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="78" x2="44.5" y2="78" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="81" x2="49" y2="81" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="84" x2="44.5" y2="84" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="87" x2="49" y2="87" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="90" x2="44.5" y2="90" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="93" x2="49" y2="93" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="96" x2="44.5" y2="96" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="99" x2="49" y2="99" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="41" y1="102" x2="44.5" y2="102" stroke="#F1F5F9" stroke-width="1.5"/>
      <line x1="45.5" y1="105" x2="49" y2="105" stroke="#F1F5F9" stroke-width="1.5"/>

      <!-- Zipper slider body -->
      <rect x="39" y="46" width="12" height="15" rx="2" fill="url(#zipPullGrad)" stroke="#64748B" stroke-width="1"/>
      <rect x="41" y="48" width="8" height="4" rx="1" fill="#475569"/>

      <!-- Zipper pull tab with ring hole -->
      <path d="M 42,59 L 48,59 L 49,74 C 49,76.5 47,78 45,78 C 43,78 41,76.5 41,74 Z" fill="url(#zipPullGrad)" stroke="#64748B" stroke-width="1"/>
      <circle cx="45" cy="70" r="2" fill="#475569"/>

      <!-- ZIP Badge in bottom right -->
      <rect x="52" y="87" width="24" height="16" rx="3" fill="#18181B" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <text x="64" y="99" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="9" font-weight="900" fill="#FCD34D" text-anchor="middle">ZIP</text>
    </svg>
  `;
}

/**
 * Generates identical thumbnail SVG to what appears in the tool drop zone,
 * sized 90×116 (equal to the size of the PDF thumbnail).
 *
 * @param {string} format  e.g. "XLSX", "CSV", "DOCX", "EPUB"
 * @param {string} color   accent color e.g. "#34D399"
 */
export function getDropZoneDocThumbSvg(format, color) {
  const fmt = (format || 'DOC').toUpperCase().slice(0, 6);
  const safeColor = color || '#00E5C0';

  let fontSize = 12;
  if (fmt.length >= 5) fontSize = 10;
  else if (fmt.length <= 3) fontSize = 13;

  let contentGraphics = '';
  if (['CSV', 'XLS', 'XLSX', 'ODS'].includes(fmt)) {
    // Spreadsheet / table grid lines (matching drop zone)
    contentGraphics = `
      <line x1="12" y1="78" x2="78" y2="78" stroke="#dddddd" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="12" y1="87" x2="78" y2="87" stroke="#dddddd" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="12" y1="96" x2="78" y2="96" stroke="#dddddd" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="30" y1="78" x2="30" y2="106" stroke="#eeeeee" stroke-width="1" stroke-linecap="round"/>
      <line x1="54" y1="78" x2="54" y2="106" stroke="#eeeeee" stroke-width="1" stroke-linecap="round"/>
    `;
  } else if (['PPTX', 'PPT', 'ODP'].includes(fmt)) {
    // Presentation slide outline (matching drop zone)
    contentGraphics = `
      <rect x="12" y="80" width="40" height="28" rx="2" fill="none" stroke="#dddddd" stroke-width="1.5"/>
      <line x1="12" y1="89" x2="52" y2="89" stroke="#eeeeee" stroke-width="1"/>
      <line x1="22" y1="80" x2="22" y2="108" stroke="#eeeeee" stroke-width="1"/>
    `;
  } else if (['MP3', 'WAV', 'FLAC', 'AAC', 'OGG', 'WMA', 'M4A', 'AUDIO'].includes(fmt)) {
    // Audio waveform bars
    contentGraphics = `
      <line x1="16" y1="92" x2="16" y2="98" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
      <line x1="24" y1="85" x2="24" y2="105" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
      <line x1="32" y1="80" x2="32" y2="110" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
      <line x1="40" y1="88" x2="40" y2="102" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
      <line x1="48" y1="78" x2="48" y2="112" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
      <line x1="56" y1="84" x2="56" y2="106" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
      <line x1="64" y1="89" x2="64" y2="101" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
      <line x1="72" y1="93" x2="72" y2="97" stroke="#cccccc" stroke-width="2" stroke-linecap="round"/>
    `;
  } else if (['MP4', 'WEBM', 'MKV', 'AVI', 'MOV', 'FLV', 'VIDEO'].includes(fmt)) {
    // Video play box
    contentGraphics = `
      <rect x="18" y="78" width="54" height="28" rx="3" fill="none" stroke="#dddddd" stroke-width="1.5"/>
      <polygon points="41,86 52,92 41,98" fill="${safeColor}"/>
    `;
  } else {
    // Standard document lines (DOCX, TXT, ODT, EPUB, MOBI, JSON, HTML, XML, etc.)
    contentGraphics = `
      <line x1="12" y1="80" x2="78" y2="80" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
      <line x1="12" y1="89" x2="78" y2="89" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
      <line x1="12" y1="98" x2="55" y2="98" stroke="#dddddd" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  return `
    <svg class="win-doc-thumb-icon" viewBox="0 0 90 116" width="90" height="116" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="90" height="116" fill="#ffffff"/>
      <polygon points="62,0 90,28 62,28" fill="#e0e0e0"/>
      <polyline points="62,0 62,28 90,28" fill="none" stroke="#cccccc" stroke-width="1"/>
      <rect x="0" y="42" width="90" height="26" fill="${safeColor}"/>
      <text x="45" y="60" font-family="Arial,sans-serif" font-size="${fontSize}"
            font-weight="bold" fill="#ffffff"
            text-anchor="middle" dominant-baseline="middle">${fmt}</text>
      ${contentGraphics}
    </svg>
  `;
}



/**
 * Generates file preview tile HTML for Recent conversions.
 * Sized 90×116 matching the PDF thumbnail size.
 */
function renderPreviewTile(category, format, filename, inputFormat, originalFilename) {
  let fmt = (format || '').toUpperCase().trim();
  const fname = (filename || '').toLowerCase().trim();

  // If format is not directly passed, derive from filename extension
  if (!fmt && fname.includes('.')) {
    fmt = fname.split('.').pop().toUpperCase();
  }
  if (!fmt) fmt = 'FILE';

  const family = getToolFamily(inputFormat, originalFilename, fmt, category);
  const color = getToolFamilyColor(inputFormat, originalFilename, fmt, category);

  // 1. ZIP / Archive: Custom SVG thumbnail equal to PDF thumbnail size (90×116)
  if (fmt === 'ZIP' || fname.endsWith('.zip') || ['RAR', '7Z', 'TAR', 'GZ'].includes(fmt)) {
    return `
      <div class="win-tile-container win-tile--zip">
        <div class="win-zip-preview-sheet">
          ${getCustomZipFolderSvg()}
        </div>
      </div>
    `;
  }

  // 2. PDF: Drop zone document thumbnail — tinted with input family theme color
  if (fmt === 'PDF') {
    return `
      <div class="win-tile-container win-tile--pdf">
        <div class="win-pdf-preview-sheet">
          ${getDropZoneDocThumbSvg('PDF', color)}
        </div>
      </div>
    `;
  }

  // 3. Images: Direct preview sheet — frame tinted with input family theme color
  if (['PNG', 'JPG', 'JPEG', 'WEBP', 'SVG', 'GIF', 'BMP', 'TIFF', 'TIF', 'ICO', 'AVIF'].includes(fmt) || fname.match(/\.(png|jpg|jpeg|webp|svg|gif|bmp|tiff|tif|ico|avif)$/i)) {
    return `
      <div class="win-tile-container win-tile--image">
        <div class="win-image-frame">
          <svg class="win-img-placeholder" viewBox="0 0 48 38" fill="none">
            <rect x="1" y="1" width="46" height="36" rx="2" fill="#1E293B" stroke="${color}" stroke-width="1.5" stroke-opacity="0.5"/>
            <circle cx="14" cy="12" r="4" fill="${color}"/>
            <path d="M4 32L16 16L27 28L34 20L44 32H4Z" fill="${color}" fill-opacity="0.6"/>
          </svg>
        </div>
      </div>
    `;
  }

  // 4. All other formats (Documents #FF6B6B, Data #2DD4BF, Ebooks #FBBF24, Audio #FB923C, Video #38BDF8)
  return `
    <div class="win-tile-container win-tile--doc">
      <div class="win-doc-preview-sheet" style="border:2px solid ${color};">
        ${getDropZoneDocThumbSvg(fmt, color)}
      </div>
    </div>
  `;
}

/**
 * Displays an inline floating toast message
 * @param {string} message
 */
export function showToast(message) {
  let toast = document.getElementById('recent-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'recent-toast';
    toast.className = 'recent-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.remove('recent-toast--visible');
  void toast.offsetWidth;
  toast.classList.add('recent-toast--visible');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('recent-toast--visible');
  }, 2800);
}

/**
 * Main renderer for Recent page
 * @param {HTMLElement} container - #explore-section
 * @param {Function} activateNav - Navigation activateNav handler
 */
export async function renderRecent(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Recent']);

  // Fetch conversions from SQLite database
  let items = [];
  try {
    if (window.electronAPI && window.electronAPI.getAllConversions) {
      items = await window.electronAPI.getAllConversions();
    }
  } catch (err) {
    console.error('[recent] Failed to fetch history:', err);
  }

  // Header template
  const headerHtml = `
    <div class="explore-header recent-page-header">
      <div class="recent-header-left">
        <button class="fmt-back-btn" id="recent-back-btn" title="Back to dashboard">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="fmt-category-icon" style="background:rgba(244,114,182,0.15);color:#F472B6">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
            <line x1="8" y1="5" x2="8"  y2="8"  stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="explore-title">Conversion History</span>
        <span class="recent-count-pill">${items.length} ${items.length === 1 ? 'file' : 'files'}</span>
      </div>
      ${
        items.length > 0
          ? `<button class="recent-clear-btn" id="recent-clear-btn" title="Clear all history">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Clear History</span>
            </button>`
          : ''
      }
    </div>
  `;

  // Empty state template (Section 4 spec)
  if (!items || items.length === 0) {
    container.innerHTML = `
      ${headerHtml}
      <div class="recent-empty-state">
        <div class="recent-empty-icon-wrap">
          <svg class="recent-empty-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="28" stroke="rgba(0, 229, 192, 0.2)" stroke-width="2.5" stroke-dasharray="4 4"/>
            <circle cx="32" cy="32" r="22" fill="rgba(8, 25, 24, 0.6)" stroke="rgba(0, 229, 192, 0.4)" stroke-width="1.8"/>
            <line x1="32" y1="20" x2="32" y2="33" stroke="#00E5C0" stroke-width="2.2" stroke-linecap="round"/>
            <line x1="32" y1="33" x2="41" y2="38" stroke="#00E5C0" stroke-width="2.2" stroke-linecap="round"/>
            <circle cx="32" cy="33" r="2.2" fill="#00E5C0"/>
          </svg>
        </div>
        <h3 class="recent-empty-title">No conversions yet</h3>
        <p class="recent-empty-subtitle">Your converted files will appear here</p>
      </div>
    `;

    const backBtn = container.querySelector('#recent-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => activateNav('Dashboard'));
    }
    return;
  }

  // Grid layout template (Section 3 spec)
  const cardsHtml = items
    .map((item) => {
      const isSuccess = item.status === 'success';
      const inFmt = (item.input_format || '').toUpperCase();
      const outFmt = (item.output_format || '').toUpperCase();

      // ── Smart format badge label ──────────────────────────────
      let formatBadge = '';
      const outFileLower = (item.output_filename || '').toLowerCase();
      const origFileLower = (item.original_filename || '').toLowerCase();
      let cat = (item.category || '').toLowerCase();

      // Derive actual input extension from original filename
      let origExt = origFileLower.includes('.')
        ? origFileLower.split('.').pop().toUpperCase()
        : inFmt;
      // Derive actual output extension from output filename
      let outExt = outFileLower.includes('.')
        ? outFileLower.split('.').pop().toUpperCase()
        : outFmt;

      // Inner format if the output is a ZIP holding files (from AdmZip inspection)
      let zipInner = (item.zip_inner_format || '').toUpperCase();
      if (!zipInner && outExt === 'ZIP') {
        if (outFileLower.includes('split_pdf') || origFileLower.includes('split_pdf')) {
          zipInner = 'PDF';
        } else if (outFileLower.includes('to_png') || origFileLower.includes('to_png')) {
          zipInner = 'PNG';
        } else if (outFileLower.includes('to_webp') || origFileLower.includes('to_webp')) {
          zipInner = 'WEBP';
        } else if (outFileLower.includes('to_jpg') || origFileLower.includes('to_jpg')) {
          zipInner = 'JPG';
        }
      }

      // Check if this conversion was performed in an archive family tool
      // (e.g. converting ZIP to another archive format, extracting an archive, or RAR/7Z to ZIP)
      const isArchiveFamily =
        (cat === 'archive' && !zipInner && ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(origExt)) ||
        (cat === 'archive' && ['RAR', '7Z', 'TAR', 'GZ'].includes(origExt)) ||
        (cat === 'archive' && ['TAR', '7Z', 'RAR', 'GZ'].includes(outExt) && origExt === 'ZIP');

      let resolvedInExt = origExt || inFmt || 'FILE';
      let resolvedCat = cat;

      // Case 1: Output is a ZIP holding converted files (Images, Documents, Split PDFs, etc.)
      if (outExt === 'ZIP' && !isArchiveFamily) {
        let displayIn = origExt;
        if (!displayIn || displayIn === 'ZIP') {
          if (zipInner === 'PDF') {
            displayIn = 'PDF';
          } else if (['WEBP', 'PNG', 'JPG', 'JPEG', 'AVIF', 'SVG', 'GIF'].includes(zipInner)) {
            displayIn = 'JPG';
          } else {
            displayIn = inFmt && inFmt !== 'ZIP' ? inFmt : 'FILE';
          }
        }

        const displayInner = zipInner || (outFmt !== 'ZIP' ? outFmt : 'FILE');
        formatBadge = `${displayIn} → ${displayInner}`;
        resolvedInExt = displayIn;
        if (cat === 'archive') {
          resolvedCat = displayInner === 'PDF' ? 'document' : 'image';
        }
      }
      // Case 2: Same input and output format → special operation (compress, rotate, etc.)
      else if (inFmt && outFmt && inFmt === outFmt && inFmt !== 'ZIP') {
        const outNameLower = outFileLower;
        if (outNameLower.includes('compress') || outNameLower.includes('compre')) {
          formatBadge = `${outFmt} → Compressed`;
        } else if (outNameLower.includes('rotat')) {
          formatBadge = `${outFmt} → Rotated`;
        } else if (outNameLower.includes('merge') || outNameLower.includes('combined')) {
          formatBadge = `${outFmt} → Merged`;
        } else if (outNameLower.includes('split')) {
          formatBadge = `${outFmt} → Split`;
        } else if (outNameLower.includes('watermark')) {
          formatBadge = `${outFmt} → Watermarked`;
        } else if (outNameLower.includes('protect') || outNameLower.includes('encrypt')) {
          formatBadge = `${outFmt} → Protected`;
        } else if (outNameLower.includes('unlock') || outNameLower.includes('decrypt')) {
          formatBadge = `${outFmt} → Unlocked`;
        } else {
          formatBadge = `${outFmt} → Processed`;
        }
      }
      // Case 3: Archive family tools (e.g. ZIP → TAR) or normal conversions
      else {
        const displayIn = origExt || inFmt || 'FILE';
        const displayOut = outExt || outFmt || 'FILE';
        formatBadge = `${displayIn} → ${displayOut}`;
      }

      // ── Badge color & thumbnail from input tool family theme ────────
      const badgeColor = getToolFamilyColor(resolvedInExt, item.original_filename, outExt || outFmt, resolvedCat);

      const tileHtml = renderPreviewTile(
        resolvedCat,
        outExt || outFmt || inFmt,
        item.output_filename || item.original_filename,
        resolvedInExt,
        item.original_filename
      );
      const dateStr = formatConversionDate(item.converted_at);
      const filename = item.output_filename || item.original_filename || 'Converted File';

      return `
        <div class="recent-card" data-id="${item.id}" data-path="${escapeAttr(item.output_path || '')}">
          <div class="recent-card-tile">
            ${tileHtml}
            <div class="recent-hover-actions">
              <button class="recent-action-btn action-folder" title="Open file location in Explorer" data-action="folder" data-path="${escapeAttr(item.output_path || '')}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
              <button class="recent-action-btn action-delete" title="Delete from history" data-action="delete" data-id="${item.id}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="recent-card-body">
            <div class="recent-card-filename" title="${escapeAttr(filename)}">${escapeHtml(filename)}</div>
            <div class="recent-card-meta">
              <span class="recent-format-badge" style="color:${badgeColor};background:${badgeColor}1a;">${escapeHtml(formatBadge)}</span>
              <span class="recent-status-dot ${isSuccess ? 'status-dot--success' : 'status-dot--failed'}" title="${isSuccess ? 'Converted successfully' : 'Conversion failed'}"></span>
            </div>
            <div class="recent-card-date">${dateStr}</div>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    ${headerHtml}
    <div class="recent-grid">
      ${cardsHtml}
    </div>
  `;

  // Back button
  const backBtn = container.querySelector('#recent-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => activateNav('Dashboard'));
  }

  // Clear all button
  const clearBtn = container.querySelector('#recent-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.electronAPI && window.electronAPI.clearAllConversions) {
        await window.electronAPI.clearAllConversions();
        renderRecent(container, activateNav);
      }
    });
  }

  // Wire card click and hover action buttons
  const cards = container.querySelectorAll('.recent-card');
  cards.forEach((card) => {
    // Card main click -> open file if exists or show toast
    card.addEventListener('click', async (e) => {
      // Don't trigger if an action button was clicked
      if (e.target.closest('.recent-action-btn')) return;

      const filePath = card.dataset.path;
      if (!filePath) {
        showToast('File no longer available');
        return;
      }

      let exists = false;
      try {
        if (window.electronAPI && window.electronAPI.checkFileExists) {
          exists = await window.electronAPI.checkFileExists(filePath);
        }
      } catch (_) {
        exists = false;
      }

      if (exists) {
        try {
          if (window.electronAPI && window.electronAPI.openPath) {
            await window.electronAPI.openPath(filePath);
          } else if (window.toolceo && window.toolceo.invoke) {
            await window.toolceo.invoke('shell:openPath', filePath);
          }
        } catch (_) {
          showToast('File no longer available');
        }
      } else {
        showToast('File no longer available');
      }
    });

    // Folder button -> show in file explorer
    const folderBtn = card.querySelector('.action-folder');
    if (folderBtn) {
      folderBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const filePath = folderBtn.dataset.path;
        if (!filePath) {
          showToast('File path not available');
          return;
        }

        try {
          if (window.electronAPI && window.electronAPI.showItemInFolder) {
            await window.electronAPI.showItemInFolder(filePath);
          } else if (window.toolceo && window.toolceo.invoke) {
            await window.toolceo.invoke('shell:showItemInFolder', filePath);
          }
        } catch (err) {
          console.error('[recent] Failed to show item in folder:', err);
        }
      });
    }

    // Delete button -> remove from database and animate card removal
    const deleteBtn = card.querySelector('.action-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        if (!id) return;

        try {
          if (window.electronAPI && window.electronAPI.deleteConversion) {
            await window.electronAPI.deleteConversion(id);
          }
          card.classList.add('recent-card--removing');
          setTimeout(() => {
            card.remove();
            const remaining = container.querySelectorAll('.recent-card');
            const pill = container.querySelector('.recent-count-pill');
            if (pill) {
              pill.textContent = `${remaining.length} ${remaining.length === 1 ? 'file' : 'files'}`;
            }
            if (remaining.length === 0) {
              renderRecent(container, activateNav);
            }
          }, 240);
        } catch (err) {
          console.error('[recent] Failed to delete conversion:', err);
        }
      });
    }

    // ── Load Real OS Thumbnail or PDF Page Preview asynchronously ──
    const filePath = card.dataset.path;
    const tileContainer = card.querySelector('.win-tile-container');
    if (filePath && tileContainer) {
      (async () => {
        const lowerPath = filePath.toLowerCase();

        // 1. If in cache, apply immediately
        if (THUMB_CACHE.has(filePath)) {
          const cached = THUMB_CACHE.get(filePath);
          if (cached) {
            tileContainer.innerHTML = cached;
            return;
          }
        }

        // 2. If it's a PDF, try generating actual page 1 thumbnail preview
        if (lowerPath.endsWith('.pdf')) {
          try {
            if (window.toolceo && window.toolceo.readLocalFile) {
              const res = await window.toolceo.readLocalFile(filePath);
              if (res && res.ok && res.buffer) {
                const info = await getOfflinePdfInfo(res.buffer, 0.6);
                if (info && info.thumbnail) {
                  const thumbHtml = `
                    <div class="win-pdf-preview-sheet">
                      <img src="${info.thumbnail}" class="win-pdf-preview-img" alt="PDF preview" />
                      <span class="win-pdf-corner-badge">PDF</span>
                    </div>
                  `;
                  THUMB_CACHE.set(filePath, thumbHtml);
                  tileContainer.innerHTML = thumbHtml;
                  return;
                }
              }
            }
          } catch (_) {
            // PDF render failed, continue to OS icon
          }
        }

        // 3. If it's an image file, load direct preview
        if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.bmp', '.gif'].some(ext => lowerPath.endsWith(ext))) {
          try {
            if (window.toolceo && window.toolceo.readLocalFile) {
              const res = await window.toolceo.readLocalFile(filePath);
              if (res && res.ok && res.buffer) {
                const blob = new Blob([res.buffer]);
                const blobUrl = URL.createObjectURL(blob);
                const imgHtml = `
                  <div class="win-img-preview-sheet">
                    <img src="${blobUrl}" class="win-real-img" alt="Image preview" />
                  </div>
                `;
                THUMB_CACHE.set(filePath, imgHtml);
                tileContainer.innerHTML = imgHtml;
                return;
              }
            }
          } catch (_) {}
        }

        // 4. For all other files (and non-rendered PDF/images), drop zone style thumbnails
        // and custom SVG ZIP thumbnails are preserved exactly as generated.
      })();
    }
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
