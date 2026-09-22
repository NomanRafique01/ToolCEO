/**
 * about.js
 * Renders the professional About page for ToolCEO.
 * Called by navigation.js when the "About" nav item is activated.
 */

import { setBreadcrumb } from './navigation.js';

// --- Build info (loaded lazily once) -----------------------------------------
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

// --- Helpers -----------------------------------------------------------------

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

// --- Format coverage data ----------------------------------------------------
const FORMAT_COVERAGE = [
  { label: 'Documents', tools: 55,  color: '#FF6B6B', pct: 32 },
  { label: 'eBooks',    tools: 42,  color: '#FBBF24', pct: 24 },
  { label: 'Archives',  tools: 48,  color: '#84CC16', pct: 28 },
  { label: 'Images',    tools: 27,  color: '#A78BFA', pct: 16 },
  { label: 'Audio',     tools: 0,   color: '#FB923C', pct: 0, soon: true },
  { label: 'Video',     tools: 0,   color: '#38BDF8', pct: 0, soon: true },
];

// --- Key features ------------------------------------------------------------
const FEATURES = [
  {
    icon: svgIcon('<path d="M10 2L4 5v5c0 4 2.67 7.4 6 8.5 3.33-1.1 6-4.5 6-8.5V5L10 2Z" stroke-width="1.7"/>'),
    color: '#84CC16', bg: 'rgba(132,204,22,0.12)',
    name: '100% Offline',
    desc: 'Zero internet required. All processing is self-contained on your device.',
    detail: 'ToolCEO executes entirely on your local machine with no external network requirements. All conversion engines operate locally, guaranteeing rapid performance, zero latency, and complete independence from cloud services.',
  },
  {
    icon: svgIcon('<rect x="5" y="9" width="10" height="8" rx="2"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/><circle cx="10" cy="13" r="1" fill="currentColor"/>'),
    color: '#00E5C0', bg: 'rgba(0,229,192,0.12)',
    name: 'Data Privacy',
    desc: 'Your files are never uploaded. No telemetry, no tracking, no accounts.',
    detail: 'Privacy is foundational to ToolCEO. File operations occur exclusively on your hardware. There are no tracking scripts, telemetry collectors, user accounts, or external network requests during conversions. Your data belongs solely to you.',
  },
  {
    icon: svgIcon('<path d="M13 2 6 13h5l-1 9 7-11h-5l1-9Z"/>'),
    color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',
    name: 'High Performance',
    desc: 'Native engine with multi-threaded conversion for large files.',
    detail: 'Conversions are powered by optimized native binaries engineered for maximum speed and fidelity. Multi-threaded processing queues execute tasks in parallel, allowing multi-file batches and large files to complete as quickly as your hardware permits.',
  },
  {
    icon: svgIcon('<rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="15" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="15" width="7" height="7" rx="1.5"/><rect x="15" y="15" width="7" height="7" rx="1.5"/>'),
    color: '#A78BFA', bg: 'rgba(167,139,250,0.12)',
    name: '172+ Tools',
    desc: 'Documents, eBooks, Archives, Images, Audio, and Video in one unified workspace.',
    detail: 'Covering 172 specialized tools across seven major categories, ToolCEO unifies PDF management, eBook format conversion, archive utilities, and multimedia processing within a single coherent desktop environment.',
  },
  {
    icon: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.1 5.9A9 9 0 1 0 21 12"/><polyline points="21 3 21 9 15 9"/>'),
    color: '#FB923C', bg: 'rgba(251,146,60,0.12)',
    name: 'Batch Conversion',
    desc: 'Process multiple files simultaneously with live progress tracking.',
    detail: 'Import multiple files or entire folders to queue and convert them concurrently. Real-time progress indicators provide immediate visibility into conversion status, with finished files accessible the moment processing finishes.',
  },
  {
    icon: svgIcon('<path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 20h14"/>'),
    color: '#38BDF8', bg: 'rgba(56,189,248,0.12)',
    name: 'Modular Engine',
    desc: 'Download only the conversion engines you need. Lightweight by default.',
    detail: 'Heavy processing engines remain optional modules. The core application maintains a minimal footprint under 100 MB, enabling you to install, update, and manage only the specific conversion capabilities your work demands.',
  },
  {
    icon: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/><path d="M12 6v1m0 10v1M6 12h1m10 0h1"/>'),
    color: '#FB7185', bg: 'rgba(251,113,133,0.12)',
    name: 'Free & No Limits',
    desc: 'Completely free to use. No file size caps, no conversion limits, no subscriptions.',
    detail: 'ToolCEO is provided completely free of charge. There are no premium restrictions, file size ceilings, daily quotas, or recurring subscription fees. Convert as many files as you need, as often as your storage permits.',
  },
];

// --- Main renderer -----------------------------------------------------------

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
      buildIdEl.textContent = info.buildId.replace('build-', '').slice(0, 12) + '…';
    }
  });

  // Year for copyright
  const year = new Date().getFullYear();

  container.innerHTML = `
    <div class="about-page">

      <!-- --- HERO ----------------------------------------------------------- -->
      <div class="about-hero">
        <div class="about-hero-inner">
          <div class="about-hero-logo">
            <img src="assets/icon1.png" alt="ToolCEO" draggable="false" />
          </div>
          <div class="about-hero-text">
            <div class="about-hero-name">TOOLCEO</div>
            <div class="about-hero-tagline">
              The professional all-in-one offline file conversion suite, engineered for speed, absolute privacy, and uncompromised local reliability.
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

      <!-- --- STATS ---------------------------------------------------------- -->
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

      <!-- --- BODY (Full Width) ---------------------------------------------- -->
      <div class="about-body">

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
                <strong style="color:var(--text-primary)">ToolCEO</strong> is a high-performance, privacy-focused desktop application designed to provide comprehensive control over your file conversions entirely offline. Whether converting PDF documents, eBooks, archives, audio, video, or images, ToolCEO delivers precision, efficiency, and speed.
              </p>
              <p class="about-desc">
                Engineered for privacy-conscious professionals and power users, ToolCEO executes natively on your workstation without transmitting data to external servers. Your source and converted files remain strictly confidential on your local storage at all times.
              </p>
              <p class="about-desc">
                Featuring an intuitive interface and a modular architecture, ToolCEO allows you to install only the processing engines you require, maintaining optimal system performance and a lean footprint.
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

          <!-- Privacy Guarantee (Bottom Full Width) -->
          <div class="about-privacy-card">
            <div class="about-privacy-header">
              <div class="about-privacy-icon">
                ${svgIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 16 9"/>', 16, '#84CC16')}
              </div>
              <span class="about-privacy-title">Privacy Guarantee</span>
            </div>
            <p class="about-privacy-body">
              ToolCEO operates with a strict local-first architecture. We do not collect telemetry, track user behavior, or transmit your files across external networks. Every conversion executes directly on your hardware, ensuring your confidential data never leaves your workstation.
            </p>
          </div>

        </div><!-- /about-sections -->

      </div><!-- /about-body -->

      <!-- --- FOOTER --------------------------------------------------------- -->
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

  // --- Accordion: feature cards expand/collapse on click -------------------
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
