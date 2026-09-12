/**
 * frontend/scripts/recentWidget.js
 *
 * Drives the "Recent Conversions" widget on the ToolCEO dashboard.
 * - Loads recent conversions from the local SQLite history DB.
 * - Displays clean empty state if no conversions exist (fresh install or history cleared).
 * - Shows format badge with category colors, truncated filename with tooltip,
 *   source -> destination format indicator, relative time ("Just now", "2 mins ago"),
 *   and success checkmark.
 * - Clicking any item reveals and highlights the converted file in Windows Explorer.
 * - Updates in real time when new conversions complete.
 */

import { showToast } from './recent.js';
import { getArchiveFileIconSvg, getArchiveFormatLabel } from '../tools/shared/archiveIcon.js';
import { getToolFamilyColor } from './toolFamily.js';

// Format -> category / color mapping for badges
const FORMAT_THEMES = {
  pdf:  { bg: '#1A3D38', color: '#00E5C0' },
  docx: { bg: '#1A2E3D', color: '#5BB8F5' },
  doc:  { bg: '#1A2E3D', color: '#5BB8F5' },
  odt:  { bg: '#1A2E3D', color: '#5BB8F5' },
  txt:  { bg: '#1A2E3D', color: '#5BB8F5' },
  rtf:  { bg: '#1A2E3D', color: '#5BB8F5' },
  pptx: { bg: '#3D251A', color: '#F97316' },
  ppt:  { bg: '#3D251A', color: '#F97316' },
  xlsx: { bg: '#1A3D2C', color: '#34D399' },
  xls:  { bg: '#1A3D2C', color: '#34D399' },
  png:  { bg: '#1A3D2A', color: '#00E5C0' },
  jpg:  { bg: '#1A3D2A', color: '#00E5C0' },
  jpeg: { bg: '#1A3D2A', color: '#00E5C0' },
  webp: { bg: '#1A3D2A', color: '#00E5C0' },
  svg:  { bg: '#2D3A1A', color: '#A3E635' },
  gif:  { bg: '#1A3D2A', color: '#00E5C0' },
  bmp:  { bg: '#1A3D2A', color: '#00E5C0' },
  mp3:  { bg: '#2A1A3D', color: '#A78BFA' },
  wav:  { bg: '#2A1A3D', color: '#A78BFA' },
  flac: { bg: '#2A1A3D', color: '#A78BFA' },
  aac:  { bg: '#2A1A3D', color: '#A78BFA' },
  ogg:  { bg: '#2A1A3D', color: '#A78BFA' },
  mp4:  { bg: '#3D2A1A', color: '#F5A35B' },
  mkv:  { bg: '#3D2A1A', color: '#F5A35B' },
  avi:  { bg: '#3D2A1A', color: '#F5A35B' },
  mov:  { bg: '#3D2A1A', color: '#F5A35B' },
  webm: { bg: '#3D2A1A', color: '#F5A35B' },
  epub: { bg: '#3D1A2A', color: '#F472B6' },
  mobi: { bg: '#3D1A2A', color: '#F472B6' },
  azw3: { bg: '#3D1A2A', color: '#F472B6' },
  zip:  { bg: '#3D351A', color: '#FCD34D' },
  rar:  { bg: '#3D351A', color: '#FCD34D' },
  '7z': { bg: '#3D351A', color: '#FCD34D' },
  tar:  { bg: '#3D351A', color: '#FCD34D' },
  gz:   { bg: '#3D351A', color: '#FCD34D' },
  bz2:  { bg: '#3D351A', color: '#FCD34D' },
  xz:   { bg: '#3D351A', color: '#FCD34D' },
  csv:  { bg: '#1A3D33', color: '#34D399' },
  json: { bg: '#1A3D33', color: '#34D399' },
  xml:  { bg: '#1A3D33', color: '#34D399' },
};

/**
 * Calculates human-readable relative time string.
 * e.g. "Just now", "2 mins ago", "1 hour ago", "Yesterday"
 * @param {string} dtStr
 * @returns {string}
 */
export function formatTimeAgo(dtStr) {
  if (!dtStr) return 'Just now';
  try {
    const isIso = dtStr.includes('T');
    const parsedStr = isIso
      ? (dtStr.includes('Z') || dtStr.includes('+') ? dtStr : dtStr + 'Z')
      : dtStr.replace(' ', 'T') + 'Z';
    const date = new Date(parsedStr);
    const time = date.getTime();
    if (isNaN(time)) return 'Just now';

    const now = Date.now();
    const diffSec = Math.floor((now - time) / 1000);

    if (diffSec < 45) return 'Just now';
    if (diffSec < 90) return '1 min ago';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mins ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  } catch (_) {
    return 'Just now';
  }
}

/**
 * Returns badge styling and formatted badge label.
 * @param {string} format
 * @param {string} category
 * @returns {{ label: string, style: string }}
 */
export function getFormatBadge(format, category) {
  const fmt = (format || '').toLowerCase().replace(/^\./, '').trim();
  const theme = FORMAT_THEMES[fmt] || {
    document: { bg: '#1A2E3D', color: '#5BB8F5' },
    image:    { bg: '#1A3D2A', color: '#00E5C0' },
    audio:    { bg: '#2A1A3D', color: '#A78BFA' },
    video:    { bg: '#3D2A1A', color: '#F5A35B' },
    ebook:    { bg: '#3D1A2A', color: '#F472B6' },
    archive:  { bg: '#3D351A', color: '#FCD34D' },
    data:     { bg: '#1A3D33', color: '#34D399' },
  }[(category || 'document').toLowerCase()] || { bg: '#1A3D38', color: '#00E5C0' };

  const label = (fmt || category || 'FILE').toUpperCase().slice(0, 5);
  const style = `--icon-bg:${theme.bg};--icon-color:${theme.color};`;

  return { label, style };
}

/* ─────────────────────────────────────────────────────────────────────────
 * getSidebarDocThumbSvg — dark-themed 90×116 thumbnail for the sidebar
 * widget. Same card base as getArchiveFileIconSvg (dark tinted bg + dog-ear
 * corner + solid badge bar) with category-specific interior graphics.
 * ───────────────────────────────────────────────────────────────────────── */
let _docThumbSeq = 0;
function getSidebarDocThumbSvg(format, color) {
  const fmt = (format || 'FILE').toUpperCase().slice(0, 6);
  const c = color || '#00E5C0';
  const uid = ++_docThumbSeq;
  const labelFs = fmt.length >= 5 ? 8 : (fmt.length === 4 ? 9 : 10);

  // ── interior graphic per category ────────────────────────────────────────
  let body = '';

  if (fmt === 'PDF') {
    // Bold red "PDF" band + document lines
    body = `
      <rect x="8" y="28" width="74" height="28" rx="3" fill="${c}" opacity="0.9"/>
      <text x="45" y="47" font-family="Arial,sans-serif" font-size="16" font-weight="900"
            fill="#081918" text-anchor="middle" dominant-baseline="middle">PDF</text>
      <line x1="12" y1="66" x2="78" y2="66" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
      <line x1="12" y1="74" x2="78" y2="74" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <line x1="12" y1="82" x2="55" y2="82" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.28"/>`;

  } else if (['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'BMP', 'TIFF', 'TIF', 'ICO', 'SVG', 'AVIF'].includes(fmt)) {
    // Photo frame with landscape scene
    body = `
      <rect x="10" y="20" width="70" height="56" rx="4" fill="${c}" fill-opacity="0.14" stroke="${c}" stroke-width="1.5" stroke-opacity="0.6"/>
      <circle cx="26" cy="34" r="7" fill="${c}" opacity="0.7"/>
      <path d="M10 56 L28 36 L44 52 L56 42 L80 76 L10 76 Z" fill="${c}" fill-opacity="0.45"/>
      <line x1="10" y1="56" x2="80" y2="56" stroke="${c}" stroke-width="0.8" stroke-opacity="0.3"/>`;

  } else if (['EPUB', 'MOBI', 'AZW3', 'FB2', 'RTF'].includes(fmt)) {
    // Book with spine and pages
    body = `
      <rect x="20" y="18" width="50" height="62" rx="3" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="1.8"/>
      <rect x="20" y="18" width="8" height="62" rx="2" fill="${c}" opacity="0.55"/>
      <line x1="34" y1="30" x2="64" y2="30" stroke="${c}" stroke-width="1.5" stroke-linecap="round" opacity="0.65"/>
      <line x1="34" y1="39" x2="64" y2="39" stroke="${c}" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
      <line x1="34" y1="48" x2="60" y2="48" stroke="${c}" stroke-width="1.5" stroke-linecap="round" opacity="0.38"/>
      <line x1="34" y1="57" x2="56" y2="57" stroke="${c}" stroke-width="1.5" stroke-linecap="round" opacity="0.28"/>`;

  } else if (['MP3', 'WAV', 'FLAC', 'AAC', 'OGG', 'WMA', 'M4A'].includes(fmt)) {
    // Waveform equalizer bars
    body = `
      <line x1="14" y1="64" x2="14" y2="72" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
      <line x1="24" y1="52" x2="24" y2="84" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="34" y1="44" x2="34" y2="88" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
      <line x1="44" y1="56" x2="44" y2="80" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
      <line x1="54" y1="42" x2="54" y2="90" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
      <line x1="64" y1="54" x2="64" y2="82" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.75"/>
      <line x1="74" y1="62" x2="74" y2="74" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`;

  } else if (['MP4', 'WEBM', 'MKV', 'AVI', 'MOV', 'FLV'].includes(fmt)) {
    // Film strip + play button
    body = `
      <rect x="8" y="26" width="74" height="48" rx="4" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-width="1.5" stroke-opacity="0.6"/>
      <rect x="8" y="26" width="10" height="48" fill="${c}" opacity="0.35"/>
      <rect x="72" y="26" width="10" height="48" fill="${c}" opacity="0.35"/>
      <line x1="8" y1="37" x2="82" y2="37" stroke="${c}" stroke-width="1" stroke-opacity="0.3"/>
      <line x1="8" y1="63" x2="82" y2="63" stroke="${c}" stroke-width="1" stroke-opacity="0.3"/>
      <polygon points="36,38 36,62 62,50" fill="${c}" opacity="0.9"/>`;

  } else if (['XLSX', 'XLS', 'CSV', 'ODS', 'JSON', 'XML', 'SQL', 'YAML', 'YML'].includes(fmt)) {
    // Spreadsheet grid
    body = `
      <rect x="8" y="22" width="74" height="58" rx="3" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.2" stroke-opacity="0.5"/>
      <line x1="8" y1="36" x2="82" y2="36" stroke="${c}" stroke-width="1.5" stroke-opacity="0.6"/>
      <line x1="8" y1="50" x2="82" y2="50" stroke="${c}" stroke-width="1.5" stroke-opacity="0.45"/>
      <line x1="8" y1="64" x2="82" y2="64" stroke="${c}" stroke-width="1.5" stroke-opacity="0.35"/>
      <line x1="35" y1="22" x2="35" y2="80" stroke="${c}" stroke-width="1.2" stroke-opacity="0.4"/>
      <line x1="60" y1="22" x2="60" y2="80" stroke="${c}" stroke-width="1.2" stroke-opacity="0.4"/>
      <rect x="8" y="22" width="27" height="14" rx="0" fill="${c}" opacity="0.3"/>`;

  } else if (['PPTX', 'PPT', 'ODP'].includes(fmt)) {
    // Slide with title bar
    body = `
      <rect x="8" y="24" width="74" height="52" rx="4" fill="${c}" fill-opacity="0.14" stroke="${c}" stroke-width="1.5" stroke-opacity="0.6"/>
      <rect x="8" y="24" width="74" height="16" rx="4" fill="${c}" opacity="0.45"/>
      <line x1="16" y1="52" x2="50" y2="52" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
      <line x1="16" y1="62" x2="42" y2="62" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
      <circle cx="62" cy="57" r="10" fill="${c}" fill-opacity="0.22" stroke="${c}" stroke-width="1.2"/>`;

  } else {
    // Generic document (DOCX, TXT, ODT, HTML, MD, etc.)
    body = `
      <polygon points="58,18 80,40 58,40" fill="${c}" opacity="0.35"/>
      <polyline points="58,18 58,40 80,40" fill="none" stroke="${c}" stroke-width="1.4" opacity="0.55"/>
      <line x1="12" y1="52" x2="74" y2="52" stroke="${c}" stroke-width="2.5" stroke-linecap="round" opacity="0.65"/>
      <line x1="12" y1="62" x2="74" y2="62" stroke="${c}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
      <line x1="12" y1="72" x2="52" y2="72" stroke="${c}" stroke-width="2.5" stroke-linecap="round" opacity="0.35"/>`;
  }

  return `<svg class="sidebar-doc-thumb-svg" viewBox="0 0 90 116" width="90" height="116"
      preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="sdt_bg_${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${c}" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    <!-- card background -->
    <rect x="3" y="3" width="84" height="110" rx="8"
          fill="url(#sdt_bg_${uid})" stroke="${c}" stroke-width="1.5" stroke-opacity="0.38"/>
    <!-- dog-ear corner fold -->
    <polygon points="62,3 87,28 62,28" fill="${c}" opacity="0.32"/>
    <polyline points="62,3 62,28 87,28" fill="none" stroke="${c}" stroke-width="1.4" opacity="0.55"/>
    <!-- interior -->
    ${body}
    <!-- bottom badge bar -->
    <rect x="3" y="91" width="84" height="22" rx="0" fill="${c}" opacity="0.92"/>
    <text x="45" y="102" font-family="Arial,sans-serif" font-size="${labelFs}" font-weight="800"
          fill="#081918" text-anchor="middle" dominant-baseline="middle" letter-spacing="0.5">${fmt}</text>
  </svg>`;
}


/**
 * Renders up to 5 conversions in the Dashboard Recent Conversions widget.
 */
export async function renderDashboardRecent() {
  const listEl = document.getElementById('dashboard-recent-list');
  const emptyEl = document.getElementById('dashboard-recent-empty');
  if (!listEl) return;

  let items = [];
  try {
    if (window.electronAPI && window.electronAPI.getAllConversions) {
      items = await window.electronAPI.getAllConversions();
    }
  } catch (err) {
    console.warn('[recentWidget] Failed to fetch conversions:', err);
  }

  // Handle empty state (fresh install or cleared history)
  if (!items || items.length === 0) {
    listEl.innerHTML = '';
    listEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  // Conversions exist: display list, hide empty state
  if (emptyEl) emptyEl.style.display = 'none';
  listEl.style.display = 'block';

  // Take top 5 most recent
  const recentItems = items.slice(0, 5);

  listEl.innerHTML = recentItems.map((item) => {
    const filename = item.output_filename || item.original_filename || 'Converted File';
    const inFmt = (item.input_format || '').toUpperCase();
    const outFmt = (item.output_format || '').toUpperCase();

    // ── Smart conversion label (same logic as Recent page) ──────
    let convText = '';
    const outFileLower = (item.output_filename || '').toLowerCase();
    const origFileLower = (item.original_filename || '').toLowerCase();
    let cat = (item.category || '').toLowerCase();
    let origExt = origFileLower.includes('.') ? origFileLower.split('.').pop().toUpperCase() : inFmt;
    let outExt = outFileLower.includes('.') ? outFileLower.split('.').pop().toUpperCase() : outFmt;

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

    const isArchiveFamily =
      (cat === 'archive' && !zipInner && ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(origExt)) ||
      (cat === 'archive' && ['RAR', '7Z', 'TAR', 'GZ'].includes(origExt)) ||
      (cat === 'archive' && ['TAR', '7Z', 'RAR', 'GZ'].includes(outExt) && origExt === 'ZIP');
    const archiveLabel = getArchiveFormatLabel(item.output_filename || outFmt || outExt);
    const isArchiveOutput = ['ZIP', 'RAR', '7Z', 'TAR', 'TAR.GZ', 'TAR.BZ2'].includes(archiveLabel);
    const isArchiveCreation = cat === 'archive' && isArchiveOutput
      && (!origExt || ['ARCHIVE', 'FILE'].includes(origExt));

    if (isArchiveCreation) {
      convText = `FILES TO ${archiveLabel}`;
    } else if (outExt === 'ZIP' && !isArchiveFamily) {
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
      convText = `${displayIn} → ${displayInner}`;
    } else if (inFmt && outFmt && inFmt === outFmt && inFmt !== 'ZIP') {
      if (outFileLower.includes('compress') || outFileLower.includes('compre')) {
        convText = `${outFmt} → Compressed`;
      } else if (outFileLower.includes('rotat')) {
        convText = `${outFmt} → Rotated`;
      } else if (outFileLower.includes('merge') || outFileLower.includes('combined')) {
        convText = `${outFmt} → Merged`;
      } else if (outFileLower.includes('split')) {
        convText = `${outFmt} → Split`;
      } else {
        convText = `${outFmt} → Processed`;
      }
    } else {
      const displayIn = origExt || inFmt || 'FILE';
      const displayOut = outExt || outFmt || 'FILE';
      convText = `${displayIn} → ${displayOut}`;
    }

    const badge = getFormatBadge(item.output_format || item.input_format, item.category);
    // Resolve the best format + color for non-archive thumbnail
    const outFmtLower = (outExt || outFmt || '').toLowerCase().replace(/^\./, '');
    const thumbColor = FORMAT_THEMES[outFmtLower]?.color
      || getToolFamilyColor(
          (item.input_format || '').toLowerCase(),
          item.original_filename,
          outFmtLower,
          item.category
        )
      || badge.style.match(/--icon-color:([^;]+)/)?.[1]
      || '#00E5C0';

    const archiveIcon = isArchiveOutput
      ? `<span class="file-type-icon file-type-icon--archive" aria-label="${archiveLabel} archive">${getArchiveFileIconSvg(archiveLabel, '#84CC16')}</span>`
      : `<span class="file-type-icon file-type-icon--doc" aria-label="${escapeAttr(outExt || outFmt || 'file')}">${getSidebarDocThumbSvg(outExt || outFmt || item.output_format || 'FILE', thumbColor)}</span>`;
    const timeAgo = formatTimeAgo(item.converted_at);

    return `
      <li class="recent-item" data-path="${escapeAttr(item.output_path || '')}" data-id="${item.id}" data-time="${escapeAttr(item.converted_at || '')}" title="Open containing folder in Explorer: ${escapeAttr(item.output_path || filename)}">
        ${archiveIcon}
        <div class="file-info">
          <span class="file-name" title="${escapeAttr(filename)}">${escapeHtml(filename)}</span>
          <span class="file-conv">${escapeHtml(convText)}</span>
        </div>
        <div class="file-meta">
          <span class="file-time">${escapeHtml(timeAgo)}</span>
          <svg class="check-icon" viewBox="0 0 16 16" width="16" height="16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </li>
    `;
  }).join('');

  // Wire click handlers on items to reveal in file manager
  listEl.querySelectorAll('.recent-item').forEach((li) => {
    li.addEventListener('click', async () => {
      const filePath = li.dataset.path;
      if (!filePath) {
        showToast('File path not available');
        return;
      }

      try {
        if (window.electronAPI && window.electronAPI.showItemInFolder) {
          const opened = await window.electronAPI.showItemInFolder(filePath);
          if (!opened) {
            showToast('File no longer exists at this location');
          }
        }
      } catch (err) {
        console.error('[recentWidget] Failed to open folder:', err);
        showToast('Unable to open folder');
      }
    });
  });
}

/**
 * Updates relative time text on existing DOM elements without re-rendering.
 */
function updateRelativeTimes() {
  const timeSpans = document.querySelectorAll('#dashboard-recent-list .recent-item');
  timeSpans.forEach((li) => {
    const rawTime = li.dataset.time;
    const timeSpan = li.querySelector('.file-time');
    if (rawTime && timeSpan) {
      timeSpan.textContent = formatTimeAgo(rawTime);
    }
  });
}

/**
 * Initializes the Dashboard Recent Conversions widget and event listeners.
 */
export function initRecentWidget() {
  // Initial load
  renderDashboardRecent();

  // Periodically refresh relative time ago (every minute)
  setInterval(updateRelativeTimes, 60000);

  // Subscribe to real-time conversion events from Electron main process
  if (window.electronAPI) {
    if (window.electronAPI.onConversionRecorded) {
      window.electronAPI.onConversionRecorded(() => {
        renderDashboardRecent();
      });
    }
    if (window.electronAPI.onConversionCleared) {
      window.electronAPI.onConversionCleared(() => {
        renderDashboardRecent();
      });
    }
    if (window.electronAPI.onConversionDeleted) {
      window.electronAPI.onConversionDeleted(() => {
        renderDashboardRecent();
      });
    }
  }

  // Fallback: listen for DOM window custom event
  window.addEventListener('conversion-saved', () => {
    renderDashboardRecent();
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

