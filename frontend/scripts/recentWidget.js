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
    const convText = inFmt && outFmt ? `${inFmt} → ${outFmt}` : (outFmt || inFmt || 'FILE');
    const badge = getFormatBadge(item.output_format || item.input_format, item.category);
    const timeAgo = formatTimeAgo(item.converted_at);

    return `
      <li class="recent-item" data-path="${escapeAttr(item.output_path || '')}" data-id="${item.id}" data-time="${escapeAttr(item.converted_at || '')}" title="Open containing folder in Explorer: ${escapeAttr(item.output_path || filename)}">
        <div class="file-type-icon" style="${badge.style}">${escapeHtml(badge.label)}</div>
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

