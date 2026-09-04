/**
 * audio.js
 * Renders the Audio format-selection grid into the explore-section container.
 * Called by navigation.js when the user clicks "Audio".
 * The rest of the dashboard stays untouched.
 */

import { setBreadcrumb } from './navigation.js';
import { setActiveTool } from './toolstate.js';
import { getLockedModuleId } from './modulelock.js';

// ─── MODULE-LOCK NAVIGATION HOOK ──────────────────────────────────────────────
let _navigateToModule = null;
export function setNavigateToModule(fn) { _navigateToModule = fn; }

function _handleLockedClick(moduleId, toolLabel) {
  if (_navigateToModule) _navigateToModule(moduleId, toolLabel);
}

/** Scroll #main-content so the drop-zone is visible. */
function _scrollToDropZone() {
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });
}

const AUDIO_FORMATS = [
  {
    id: 'mp3',
    label: 'MP3',
    desc: 'MPEG Audio Layer III',
    ext: '.mp3',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="9" r="3" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="8" cy="9" r="1" fill="currentColor"/>
      <path d="M11 9V4l3-1v3" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: 'wav',
    label: 'WAV',
    desc: 'Waveform Audio File',
    ext: '.wav',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <polyline points="1,8 3,8 4,4 5,12 6,6 7,10 8,8 9,5 10,11 11,7 12,9 13,8 15,8"
        stroke="currentColor" stroke-width="1.2" stroke-linecap="round"
        stroke-linejoin="round" fill="none"/>
    </svg>`,
  },
  {
    id: 'flac',
    label: 'FLAC',
    desc: 'Free Lossless Audio Codec',
    ext: '.flac',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <line x1="8"  y1="2"  x2="8"  y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="5"  y1="4"  x2="5"  y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="11" y1="4"  x2="11" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="2"  y1="6"  x2="2"  y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="14" y1="6"  x2="14" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'aac',
    label: 'AAC',
    desc: 'Advanced Audio Coding',
    ext: '.aac',
    color: '#A78BFA',
    bg: 'rgba(167,139,250,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <path d="M5 12V6l3-2 3 2v6" stroke="currentColor" stroke-width="1.3"
        stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'ogg',
    label: 'OGG',
    desc: 'Ogg Vorbis Audio',
    ext: '.ogg',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5.5 8a2.5 2.5 0 0 1 5 0" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round"/>
      <circle cx="8" cy="8" r="1" fill="currentColor"/>
    </svg>`,
  },
  {
    id: 'wma',
    label: 'WMA',
    desc: 'Windows Media Audio',
    ext: '.wma',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="5" width="4" height="6" rx="1" stroke="currentColor" stroke-width="1.3"/>
      <path d="M6 7l3-2v6l-3-2V7Z" stroke="currentColor" stroke-width="1.2"
        stroke-linejoin="round"/>
      <path d="M11 6.5a2.5 2.5 0 0 1 0 3" stroke="currentColor" stroke-width="1.3"
        stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'm4a',
    label: 'M4A',
    desc: 'MPEG-4 Audio',
    ext: '.m4a',
    color: '#2DD4BF',
    bg: 'rgba(45,212,191,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="9" r="3" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="8" cy="9" r="1" fill="currentColor"/>
      <line x1="11" y1="9" x2="14" y2="9" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round"/>
      <line x1="14" y1="9" x2="14" y2="5" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round"/>
      <line x1="14" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.2"
        stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'opus',
    label: 'OPUS',
    desc: 'Opus Interactive Audio',
    ext: '.opus',
    color: '#84CC16',
    bg: 'rgba(132,204,22,0.15)',
    icon: `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
      <path d="M4 10V6l4-2 4 2v4l-4 2-4-2Z" stroke="currentColor" stroke-width="1.3"
        stroke-linejoin="round"/>
      <line x1="8" y1="4" x2="8" y2="12" stroke="currentColor" stroke-width="1.1"
        stroke-linecap="round"/>
    </svg>`,
  },
];

/**
 * Replaces the content of `container` (the explore-section element) with the
 * Audio format-selection grid.  The back arrow restores the default grid.
 *
 * @param {HTMLElement} container  - #explore-section
 * @param {Function}    activateNav - navigation.js activateNav()
 */
export function renderAudioFormats(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Audio']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to all tools">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(251,146,60,0.15);color:#FB923C">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="8"  y1="2"  x2="8"  y2="14" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round"/>
          <line x1="5"  y1="4"  x2="5"  y2="12" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round"/>
          <line x1="11" y1="4"  x2="11" y2="12" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round"/>
          <line x1="2"  y1="6"  x2="2"  y2="10" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round"/>
          <line x1="14" y1="6"  x2="14" y2="10" stroke="currentColor" stroke-width="1.4"
            stroke-linecap="round"/>
        </svg>
      </div>
      <span class="explore-title">Audio — Choose Output Format</span>
    </div>

    <div class="fmt-grid">
      ${AUDIO_FORMATS.map((f) => {
        const locked     = getLockedModuleId(f.id) !== null;
        const lockClass  = locked ? ' fmt-card--locked' : '';
        const lockedAttr = locked ? ` data-locked-module="${getLockedModuleId(f.id)}"` : '';
        return `
        <div class="fmt-card${lockClass}" data-format="${f.id}"${lockedAttr}
             style="--fmt-color:${f.color};--fmt-bg:${f.bg}">
          <div class="fmt-card-top">
            <div class="fmt-icon-box">${f.icon}</div>
            <span class="fmt-arrow">›</span>
          </div>
          <div class="fmt-label">${f.label}</div>
          <div class="fmt-desc">${f.desc}</div>
          <div class="fmt-ext">${f.ext}</div>
        </div>`;
      }).join('')}
    </div>
  `;

  // Back button → restore the Explore Tools grid
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });

  // Format card selection highlight + tool-state update
  container.querySelectorAll('.fmt-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('fmt-card--locked')) {
        _handleLockedClick(card.dataset.lockedModule, card.querySelector('.fmt-label')?.textContent || '');
        return;
      }
      container.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      const fmt = AUDIO_FORMATS.find((f) => f.id === card.dataset.format);
      if (fmt) {
        setActiveTool({
          id      : fmt.id,
          label   : fmt.label,
          mainText: `Drop file to Convert to ${fmt.label}`,
          subText : `or click to select a file for ${fmt.label} conversion`,
          icon    : fmt.icon,
          color   : fmt.color,
          bg      : fmt.bg,
          tag     : null,
        });
        _scrollToDropZone();
      }
    });
  });
}

// Legacy export kept so old callers don't break
export function initAudio() {}
