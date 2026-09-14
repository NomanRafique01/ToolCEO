/**
 * about.js
 * Renders the professional About page for ToolCEO.
 * Called by navigation.js when the "About" nav item is activated.
 */

import { setBreadcrumb } from './navigation.js';

// Ã¢â€â‚¬Ã¢â€â‚¬ Build info (loaded lazily once) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
let _buildInfo = null;
async function getBuildInfo() {
  if (_buildInfo) return _buildInfo;
  try {
    const r = await fetch('../build-info.json');
    _buildInfo = await r.json();
  } catch (_) {
    _buildInfo = { buildDate: null };
  }
  return _buildInfo;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function formatBuildDate(iso) {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return iso;
  }
}

function svgIcon(path, size = 16, stroke = 'currentColor') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Format coverage data Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const FORMAT_COVERAGE = [
  { label: 'Documents', tools: 55,  color: '#FF6B6B', pct: 32 },
  { label: 'eBooks',    tools: 42,  color: '#FBBF24', pct: 24 },
  { label: 'Archives',  tools: 48,  color: '#84CC16', pct: 28 },
  { label: 'Images',    tools: 27,  color: '#A78BFA', pct: 16 },
  { label: 'Audio',     tools: 0,   color: '#FB923C', pct: 0, soon: true },
  { label: 'Video',     tools: 0,   color: '#38BDF8', pct: 0, soon: true },
];

// Ã¢â€â‚¬Ã¢â€â‚¬ Key features Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const FEATURES = [
  {
    icon: svgIcon('<path d="M10 2L4 5v5c0 4 2.67 7.4 6 8.5 3.33-1.1 6-4.5 6-8.5V5L10 2Z" stroke-width="1.7"/>'),
    color: '#84CC16', bg: 'rgba(132,204,22,0.12)',
    name: '100% Offline',
    desc: 'Zero internet required. All processing is self-contained on your device.',
    detail: 'ToolCEO runs entirely on your local machine Ã¢â‚¬â€ no internet connection is ever needed. All conversion engines are bundled or downloaded once and stored locally. This means fast conversions with no latency, no downtime, and no dependency on third-party servers.',
  },
  {
    icon: svgIcon('<rect x="5" y="9" width="10" height="8" rx="2"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/><circle cx="10" cy="13" r="1" fill="currentColor"/>'),
    color: '#00E5C0', bg: 'rgba(0,229,192,0.12)',
    name: 'Data Privacy',
    desc: 'Your files are never uploaded. No telemetry, no tracking, no accounts.',
    detail: 'Privacy is built into ToolCEO at every level. Files are read and written only on your device. There is no account system, no analytics SDK, no crash reporting service, and zero network calls during conversion. Your data belongs exclusively to you.',
  },
  {
    icon: svgIcon('<path d="M13 2 6 13h5l-1 9 7-11h-5l1-9Z"/>'),
    color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',
    name: 'High Performance',
    desc: 'Native engine with multi-threaded conversion for large files.',
    detail: 'Conversions are handled by native, compiled engines Ã¢â‚¬â€ LibreOffice, Calibre, Ghostscript, FFmpeg Ã¢â‚¬â€ that are optimized for speed and correctness. Batch jobs run in parallel worker threads so large files and multi-file queues process as fast as your hardware allows.',
  },
  {
    icon: svgIcon('<rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="15" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="15" width="7" height="7" rx="1.5"/><rect x="15" y="15" width="7" height="7" rx="1.5"/>'),
    color: '#A78BFA', bg: 'rgba(167,139,250,0.12)',
    name: '172+ Tools',
    desc: 'Documents, eBooks, Archives, Images, Audio & Video Ã¢â‚¬â€ all in one place.',
    detail: 'From PDF splitting and merging, to eBook format conversion across 42 combinations, to archive creation and extraction Ã¢â‚¬â€ ToolCEO covers 172 distinct tools across 7 categories. All accessible from a single unified interface, no need to install separate apps.',
  },
  {
    icon: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.1 5.9A9 9 0 1 0 21 12"/><polyline points="21 3 21 9 15 9"/>'),
    color: '#FB923C', bg: 'rgba(251,146,60,0.12)',
    name: 'Batch Conversion',
    desc: 'Process multiple files simultaneously with live progress tracking.',
    detail: 'Drop an entire folder of files and ToolCEO will queue and process them all. A live progress bar shows per-file status in real time. Completed files appear in the output panel immediately, so you can download while the rest are still converting.',
  },
  {
    icon: svgIcon('<path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 20h14"/>'),
    color: '#38BDF8', bg: 'rgba(56,189,248,0.12)',
    name: 'Modular Engine',
    desc: 'Download only the conversion engines you need. Lightweight by default.',
    detail: 'Heavy conversion engines like Calibre and LibreOffice are optional modules. The core app ships lean Ã¢â‚¬â€ under 100 MB Ã¢â‚¬â€ and you download only what you actually use. Each module is verified, stored locally, and managed entirely from the Modules page.',
  },
  {
    icon: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/><path d="M12 6v1m0 10v1M6 12h1m10 0h1"/>'),
    color: '#FB7185', bg: 'rgba(251,113,133,0.12)',
    name: 'Free & No Limits',
    desc: 'Completely free to use. No file size caps, no conversion limits, no subscriptions.',
    detail: 'ToolCEO is and always will be free. There are no premium tiers, no per-conversion fees, no file size restrictions, and no daily limits. Convert as many files as you want, as large as your disk allows Ã¢â‚¬â€ forever, with no strings attached.',
  },
];

// Ã¢â€â‚¬Ã¢â€â‚¬ Technology stack Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const TECH_STACK = [
  { name: 'Electron',   role: 'Desktop shell',     color: '#38BDF8' },
  { name: 'Python',     role: 'Conversion engine',  color: '#FBBF24' },
  { name: 'SQLite',     role: 'Local history DB',   color: '#FB923C' },
  { name: 'PDF.js',     role: 'PDF rendering',      color: '#FF6B6B' },
  { name: 'Fuse.js',    role: 'Offline search',     color: '#A78BFA' },
  { name: 'HTML/CSS/JS','role': 'UI layer',         color: '#84CC16' },
];

// Ã¢â€â‚¬Ã¢â€â‚¬ Main renderer Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export async function renderAbout(container) {
  // Mark dashboard panel & body
  const dashPanel = document.getElementById('dashboard-panel');
  if (dashPanel) dashPanel.classList.add('about-active');
  document.body.classList.add('about-active');

  const searchArea = document.querySelector('.topbar-search-area');
  if (searchArea) searchArea.style.display = 'none';

  // Breadcrumb
  setBreadcrumb(['Dashboard', 'About']);

  // Build info (async, non-blocking for initial render)
  getBuildInfo().then((info) => {
    const dateEl = document.getElementById('about-build-date');
    if (dateEl) dateEl.textContent = formatBuildDate(info.buildDate);
    const buildIdEl = document.getElementById('about-build-id');
    if (buildIdEl && info.buildId) {
      buildIdEl.textContent = info.buildId.replace('build-', '').slice(0, 12) + 'Ã¢â‚¬Â¦';
    }
  });

  // Year for copyright
  const year = new Date().getFullYear();

  container.innerHTML = `
    <div class="about-page">

      <!-- Ã¢â€â‚¬Ã¢â€â‚¬ HERO Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ -->
      <div class="about-hero">
        <div class="about-hero-inner">
          <div class="about-hero-logo">
            <img src="assets/icon.png" alt="ToolCEO" draggable="false" />
          </div>
          <div class="about-hero-text">
            <div class="about-hero-name">TOOLCEO</div>
            <div class="about-hero-tagline">
              The professional all-in-one offline file conversion suite.
              Built for speed, privacy, and reliability Ã¢â‚¬â€ no cloud, no compromise.
            </div>
            <div class="about-hero-badges">
              <span class="about-badge about-badge--version">
                ${svgIcon('<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 11)}
                v1.0.0
              </span>
              <span class="about-badge about-badge--offline">
                ${svgIcon('<path d="M10 2L4 5v5c0 4 2.67 7.4 6 8.5 3.33-1.1 6-4.5 6-8.5V5L10 2Z" stroke-width="1.7"/><polyline points="9 12 11 14 16 9"/>', 11)}
                100% Offline
              </span>
              <span class="about-badge about-badge--platform">
                ${svgIcon('<rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/>', 11)}
                Windows
              </span>
              <span class="about-badge about-badge--build">
                ${svgIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="9" y1="4" x2="9" y2="9"/>', 11)}
                Build 2026
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Ã¢â€â‚¬Ã¢â€â‚¬ STATS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ -->
      <div class="about-stats">
        <div class="about-stat">
          <div class="about-stat-value">172+</div>
          <div class="about-stat-label">Total Tools</div>
        </div>
        <div class="about-stat">
          <div class="about-stat-value">100+</div>
          <div class="about-stat-label">File Formats</div>
        </div>
        <div class="about-stat">
          <div class="about-stat-value">7</div>
          <div class="about-stat-label">Categories</div>
        </div>
        <div class="about-stat">
          <div class="about-stat-value">5</div>
          <div class="about-stat-label">Open Source Engines</div>
        </div>
      </div>

      <!-- Ã¢â€â‚¬Ã¢â€â‚¬ BODY (2 columns) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ -->
      <div class="about-body">

        <!-- LEFT: sections -->
        <div class="about-sections">

          <!-- What is ToolCEO -->
          <div class="about-section">
            <div class="about-section-header">
              <div class="about-section-icon" style="background:rgba(0,229,192,0.12);color:#00E5C0;">
                ${svgIcon('<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 15)}
              </div>
              <span class="about-section-title">What is ToolCEO?</span>
            </div>
            <div class="about-section-body">
              <p class="about-desc">
                <strong style="color:var(--text-primary)">ToolCEO</strong> is a high-performance, privacy-first desktop application
                that gives you complete control over your file conversions Ã¢â‚¬â€ entirely offline. Whether you're converting
                PDF documents, eBooks, archives, or images, ToolCEO handles it all with precision and speed.
              </p>
              <p class="about-desc">
                Designed for professionals and power users who demand reliability, ToolCEO runs natively on your device
                without ever uploading your files to a server. Your data stays on your machine Ã¢â‚¬â€ always.
              </p>
              <p class="about-desc">
                With a clean, intuitive interface and a modular engine architecture, ToolCEO lets you download only the
                conversion modules you need, keeping the application lightweight and focused.
              </p>
            </div>
          </div>

          <!-- Key Features -->
          <div class="about-section">
            <div class="about-section-header">
              <div class="about-section-icon" style="background:rgba(251,191,36,0.12);color:#FBBF24;">
                ${svgIcon('<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>', 15)}
              </div>
              <span class="about-section-title">Key Features</span>
              <span class="about-feature-hint">Click any card to expand</span>
            </div>
            <div class="about-section-body">
              <div class="about-features" id="about-features-grid">
                ${FEATURES.map((f, i) => `
                  <div class="about-feature about-feature--accordion" data-idx="${i}" style="--feat-color:${f.color};">
                    <div class="about-feature-summary">
                      <div class="about-feature-icon" style="background:${f.bg};color:${f.color};">
                        ${f.icon}
                      </div>
                      <div class="about-feature-text">
                        <div class="about-feature-name">${f.name}</div>
                        <div class="about-feature-desc">${f.desc}</div>
                      </div>
                      <div class="about-feature-chevron">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>
                    <div class="about-feature-detail">
                      <p class="about-feature-detail-text">${f.detail}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Format Coverage -->
          <div class="about-section">
            <div class="about-section-header">
              <div class="about-section-icon" style="background:rgba(167,139,250,0.12);color:#A78BFA;">
                ${svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="3 9 21 9"/><polyline points="9 21 9 9"/>', 15)}
              </div>
              <span class="about-section-title">Format Coverage</span>
            </div>
            <div class="about-section-body">
              <div class="about-format-row" id="about-format-row">
                ${FORMAT_COVERAGE.map(f => `
                  <div class="about-format-item">
                    <span class="about-format-label">${f.label}</span>
                    <div class="about-format-bar">
                      <div class="about-format-fill" data-pct="${f.pct}"
                           style="background:${f.color};width:0%;"></div>
                    </div>
                    <span class="about-format-count" style="color:${f.color};">
                      ${f.soon ? 'Soon' : f.tools + ' tools'}
                    </span>
                  </div>
                `).join('')}
              </div>
            </div><!-- /about-section-body -->
          </div><!-- /about-section -->

        </div><!-- /about-sections -->

        <!-- RIGHT: sidebar -->
        <div class="about-sidebar">

          <!-- App Info -->
          <div class="about-info-card">
            <div class="about-info-card-title">Application Info</div>
            <div class="about-info-rows">
              <div class="about-info-row">
                <span class="about-info-key">Application</span>
                <span class="about-info-val">ToolCEO</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">Version</span>
                <span class="about-info-val about-info-val--accent">1.0.0</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">Platform</span>
                <span class="about-info-val">Windows</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">Architecture</span>
                <span class="about-info-val">x64</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">Network Access</span>
                <span class="about-info-val about-info-val--green">Offline Only</span>
              </div>
            </div>
          </div>

          <!-- Tech Stack -->
          <div class="about-info-card">
            <div class="about-info-card-title">Technology Stack</div>
            <div class="about-tech-list">
              ${TECH_STACK.map(t => `
                <div class="about-tech-item">
                  <div class="about-tech-dot" style="background:${t.color};"></div>
                  <span class="about-tech-name">${t.name}</span>
                  <span class="about-tech-role">${t.role}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Privacy Guarantee -->
          <div class="about-privacy-card">
            <div class="about-privacy-header">
              <div class="about-privacy-icon">
                ${svgIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 16 9"/>', 16, '#84CC16')}
              </div>
              <span class="about-privacy-title">Privacy Guarantee</span>
            </div>
            <p class="about-privacy-body">
              ToolCEO <strong style="color:#84CC16;">never</strong> uploads your files, collects usage data,
              or requires an account. All conversions are performed locally using offline engines.
              There is zero cloud dependency Ã¢â‚¬â€ your data never leaves your device.
            </p>
          </div>

          <!-- Conversion Engines -->
          <div class="about-info-card">
            <div class="about-info-card-title">Conversion Engines</div>
            <div class="about-info-rows">
              <div class="about-info-row">
                <span class="about-info-key">Documents</span>
                <span class="about-info-val about-info-val--purple">LibreOffice</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">eBooks</span>
                <span class="about-info-val about-info-val--amber">Calibre</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">Archives</span>
                <span class="about-info-val about-info-val--green">7-Zip / zipfile</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">PDF</span>
                <span class="about-info-val about-info-val--accent">Ghostscript</span>
              </div>
              <div class="about-info-row">
                <span class="about-info-key">Images</span>
                <span class="about-info-val" style="color:#FF6B6B;">Pillow / FFmpeg</span>
              </div>
            </div>
          </div>

        </div><!-- /about-sidebar -->

      </div><!-- /about-body -->

      <!-- Ã¢â€â‚¬Ã¢â€â‚¬ FOOTER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ -->
      <div class="about-footer">
        <span class="about-footer-copy">
          &copy; ${year} <strong>ToolCEO</strong>. All rights reserved. Built with care for privacy and performance.
        </span>
        <div class="about-footer-links">
          <span class="about-footer-link" title="ToolCEO is provided as-is without warranty">License &amp; Terms</span>
          <span class="about-footer-link" title="We collect zero user data">Privacy Policy</span>
          <span class="about-footer-link" title="Third-party open-source engines">Open Source</span>
        </div>
      </div>

    </div><!-- /about-page -->
  `;

  // Animate format bars after render
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.about-format-fill').forEach((el) => {
        const pct = parseInt(el.dataset.pct || '0', 10);
        el.style.width = pct + '%';
      });
    }, 120);
  });

  // â”€â”€ Accordion: feature cards expand/collapse on click â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  requestAnimationFrame(() => {
    document.querySelectorAll('.about-feature--accordion').forEach((card) => {
      const detail  = card.querySelector('.about-feature-detail');
      const chevron = card.querySelector('.about-feature-chevron');
      if (!detail) return;
      detail.style.maxHeight = '0px';
      detail.style.overflow  = 'hidden';

      card.addEventListener('click', () => {
        const isOpen = card.classList.contains('about-feature--open');
        // Collapse any already-open sibling
        document.querySelectorAll('.about-feature--accordion.about-feature--open').forEach((other) => {
          if (other === card) return;
          other.classList.remove('about-feature--open');
          const od = other.querySelector('.about-feature-detail');
          const oc = other.querySelector('.about-feature-chevron');
          if (od) od.style.maxHeight = '0px';
          if (oc) oc.style.transform = 'rotate(0deg)';
        });
        if (isOpen) {
          card.classList.remove('about-feature--open');
          detail.style.maxHeight = '0px';
          if (chevron) chevron.style.transform = 'rotate(0deg)';
        } else {
          card.classList.add('about-feature--open');
          detail.style.maxHeight = detail.scrollHeight + 'px';
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
      });
    });
  });
}
