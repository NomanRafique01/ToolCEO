/**
 * dropzone.js
 * Wires up the file drop zone: click-to-browse, drag-over highlight,
 * drag-leave reset, drop handling with tool-selection guard,
 * full hero-card + drop-zone morphing when a tool is selected,
 * and the "no tool" warning banner.
 */

import { getActiveTool, onToolChange } from './toolstate.js';

// ─── WARNING BANNER ───────────────────────────────────────────────────────────

let _bannerEl    = null;
let _bannerTimer = null;

function _ensureBanner() {
  if (_bannerEl) return;

  _bannerEl = document.createElement('div');
  _bannerEl.className = 'tool-warning-banner';
  _bannerEl.innerHTML = `
    <div class="tool-warning-inner">
      <svg class="tool-warning-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M10 2.5L1.5 17.5h17L10 2.5Z"
              stroke="#FBBF24" stroke-width="1.6"
              stroke-linejoin="round" stroke-linecap="round"/>
        <line x1="10" y1="8.5" x2="10" y2="12"
              stroke="#FBBF24" stroke-width="1.7" stroke-linecap="round"/>
        <circle cx="10" cy="14.5" r="0.9" fill="#FBBF24"/>
      </svg>
      <span class="tool-warning-text">Please Select a Tool First</span>
    </div>
  `;

  const root = document.getElementById('main-content') || document.body;
  root.appendChild(_bannerEl);
}

export function showNoToolWarning() {
  _ensureBanner();

  if (_bannerTimer) {
    clearTimeout(_bannerTimer);
    clearTimeout(_bannerEl._fadeTimer);
    _bannerEl.classList.remove('tool-warning-banner--fade');
    void _bannerEl.offsetWidth; // force reflow → restart animation
  }

  _bannerEl.classList.add('tool-warning-banner--visible');

  _bannerTimer = setTimeout(() => {
    _bannerEl.classList.add('tool-warning-banner--fade');
    _bannerEl._fadeTimer = setTimeout(() => {
      _bannerEl.classList.remove('tool-warning-banner--visible', 'tool-warning-banner--fade');
      _bannerTimer = null;
    }, 500);
  }, 3000);
}

// ─── DEFAULT STATE ────────────────────────────────────────────────────────────

const DEFAULT_ICON_SVG = `
  <svg class="drop-icon" viewBox="0 0 48 48" width="48" height="48" fill="none"
       xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="4" width="26" height="34" rx="3" stroke="#00E5C0" stroke-width="1.5"/>
    <path d="M34 4l6 6H34V4Z" stroke="#00E5C0" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="24" y1="46" x2="24" y2="34" stroke="#00E5C0" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="18" y1="40" x2="24" y2="34" stroke="#00E5C0" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="30" y1="40" x2="24" y2="34" stroke="#00E5C0" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

const DEFAULT_MAIN  = 'Drop files anywhere to convert';
const DEFAULT_SUB   = 'or click to browse';
const DEFAULT_PRIV  = 'Your files never leave your device.';
const DEFAULT_TITLE = 'Welcome back, CEO';
const DEFAULT_HINT  = 'Drag anywhere';
const DEFAULT_SUBT  = 'The all-in-one offline file converter for Windows.';

// ─── HERO + DROP ZONE MORPH ───────────────────────────────────────────────────

/**
 * Scale the tool's 26×26 icon SVG up to 48×48 for the drop-zone slot.
 * The icon string comes from the card data (already an <svg …> string).
 * We just replace the width/height attributes.
 */
function _scaledIcon(svgString, color) {
  return svgString
    .replace(/width="26"/, 'width="48"')
    .replace(/height="26"/, 'height="48"')
    .replace(/class="[^"]*"/, '')           // strip any existing class
    .replace('<svg', `<svg class="drop-icon" style="color:${color}"`)
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)
    .replace(/fill="currentColor"/g,   `fill="${color}"`);
}

/**
 * Builds the tag badge HTML shown inside the hero header when a tool is active.
 * Mirrors the .fmt-tag style from documents.css.
 */
function _tagBadge(tag, color, bg) {
  if (!tag) return '';
  const isConvert = tag.toLowerCase() === 'convert';
  const badgeColor = isConvert ? '#38BDF8' : color;
  const badgeBg    = isConvert ? 'rgba(56,189,248,0.12)' : bg;
  const badgeBorder = isConvert ? 'rgba(56,189,248,0.3)' : `${color}4D`;
  return `<span class="hero-tool-badge"
    style="color:${badgeColor};background:${badgeBg};border-color:${badgeBorder}">
    ${tag}
  </span>`;
}

function _updateDropZone(tool) {
  const zone    = document.getElementById('drop-zone');
  const mainEl  = zone && zone.querySelector('.drop-main-text');
  const subEl   = zone && zone.querySelector('.drop-browse');
  const privEl  = zone && zone.querySelector('.drop-private');
  const iconSlot = zone && zone.querySelector('.drop-icon');

  const heroHeader  = document.querySelector('.hero-card-header');
  const heroTitleEl = heroHeader && heroHeader.querySelector('.hero-title');
  const heroSubEl   = heroHeader && heroHeader.querySelector('.hero-subtitle');
  const heroHintEl  = heroHeader && heroHeader.querySelector('.hero-hint');

  if (!zone || !mainEl || !subEl || !privEl) return;

  // ── RESET ──────────────────────────────────────────────────────────────────
  if (!tool) {
    // Drop zone
    if (iconSlot) iconSlot.outerHTML = DEFAULT_ICON_SVG;
    mainEl.textContent = DEFAULT_MAIN;
    subEl.textContent  = DEFAULT_SUB;
    privEl.textContent = DEFAULT_PRIV;
    zone.removeAttribute('style');
    zone.classList.remove('drop-zone--tool-active');

    // Hero header
    if (heroTitleEl) {
      heroTitleEl.textContent = DEFAULT_TITLE;
      heroTitleEl.style.color = '';
    }
    if (heroSubEl) {
      heroSubEl.innerHTML = DEFAULT_SUBT;
    }
    if (heroHintEl) {
      heroHintEl.textContent = DEFAULT_HINT;
      heroHintEl.style.color = '';
    }
    return;
  }

  // ── TOOL SELECTED ──────────────────────────────────────────────────────────
  const { label, mainText, subText, icon, color, bg, tag } = tool;

  // ── Drop zone: swap icon, text, and theme ──────────────────────────────────
  const currentIcon = zone.querySelector('.drop-icon');
  if (currentIcon && icon) {
    currentIcon.outerHTML = _scaledIcon(icon, color);
  }

  mainEl.textContent = mainText;
  subEl.textContent  = subText;
  privEl.textContent = 'Your files never leave your device.';

  // Apply themed border + background matching the card
  zone.style.setProperty('--dz-color', color);
  zone.style.setProperty('--dz-bg', bg);
  zone.classList.add('drop-zone--tool-active');

  // ── Hero header: swap title to "<Tool> Selected" ────────────────────────────
  if (heroTitleEl) {
    heroTitleEl.textContent = `${label} Selected`;
    heroTitleEl.style.color = color;
  }

  if (heroSubEl) {
    heroSubEl.innerHTML = `
      <span class="hero-selected-row">
        <span class="hero-selected-dot" style="background:${color}"></span>
        Ready to process your file
        ${_tagBadge(tag, color, bg)}
      </span>`;
  }

  if (heroHintEl) {
    heroHintEl.textContent = 'Drop or click below';
    heroHintEl.style.color = color;
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function initDropZone() {
  const dropZone  = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  if (!dropZone || !fileInput) return;

  // Keep the hero + drop zone in sync with tool-state changes
  onToolChange(_updateDropZone);

  // ── Click ──────────────────────────────────────────────────────────────────
  dropZone.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    if (!getActiveTool()) { showNoToolWarning(); return; }
    fileInput.click();
  });

  // ── Drag over ─────────────────────────────────────────────────────────────
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });

  // ── Drag leave ────────────────────────────────────────────────────────────
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
  });

  // ── Drop ──────────────────────────────────────────────────────────────────
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    if (!getActiveTool()) { showNoToolWarning(); return; }
    // TODO: pass e.dataTransfer.files to the conversion pipeline
  });
}
