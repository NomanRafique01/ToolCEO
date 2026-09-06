/**
 * modules.js
 * Renders the Modules page — shows installable engine modules with
 * two-step Download → Install workflow, status badges, action buttons,
 * and a detail modal.
 */

import { pushNotification } from './notificationStore.js';
import {
  startModuleDownload,
  startModuleInstall,
  cancelActiveOperation,
  isDownloadActive,
  getActivePhase,
  getActiveDownloadModuleId,
  syncActiveDownload
} from './moduleDownload.js';

/** Thin local wrapper — avoids circular import with navigation.js */
function setBreadcrumb(segments) {
  const bar = document.getElementById('breadcrumb-bar');
  if (!bar) return;
  bar.innerHTML = segments
    .map((seg, i) => {
      const isLast = i === segments.length - 1;
      const label  = `<span class="bc-label${isLast ? ' bc-label--active' : ''}">${seg}</span>`;
      const sep    = i < segments.length - 1
        ? '<span class="bc-sep" aria-hidden="true">/</span>'
        : '';
      return `<span class="bc-segment">${label}${sep}</span>`;
    })
    .join('');
}

// ─── MODULE DEFINITIONS ───────────────────────────────────────────────────────

const MODULES = [
  {
    id: 'office',
    name: 'Office Module',
    engine: 'LibreOffice',
    size: '~350 MB',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    downloadUrl: 'https://github.com/NomanRafique01/ToolCEO/releases/download/modules-v1.0/office-module.zip',
    icon: `<svg width="28" height="28" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="4" y1="7"  x2="10" y2="7"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="9"  x2="10" y2="9"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="4" y1="11" x2="7"  y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
    unlocks: [
      'DOCX → PDF, HTML, ODT, EPUB, Markdown',
      'PPTX → PDF, HTML, Images, ODP',
      'XLSX → PDF, CSV, JSON, HTML, ODS',
      'ODT → PDF, DOCX, HTML, EPUB, RTF',
      'PDF → Word (DOCX)',
      'PDF → HTML',
    ],
    desc: 'Unlocks DOCX, PPTX, XLSX, ODT conversions and PDF to Word / HTML.',
  },
  {
    id: 'ocr',
    name: 'OCR Module',
    engine: 'Tesseract',
    size: '~50 MB',
    color: '#F472B6',
    bg: 'rgba(244,114,182,0.15)',
    downloadUrl: 'https://github.com/NomanRafique01/ToolCEO/releases/download/modules-v1.0/ocr-module.zip',
    icon: `<svg width="28" height="28" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <line x1="4" y1="7"  x2="9"  y2="7"  stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="4" y1="9"  x2="7"  y2="9"  stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <circle cx="12" cy="8" r="1.5" stroke="currentColor" stroke-width="1.1"/>
    </svg>`,
    unlocks: [
      'Scanned PDF → Word (DOCX)',
      'Scanned PDF → Excel (XLSX)',
      'Scanned PDF → HTML',
      'Scanned PDF → TXT',
      'Image (JPG/PNG/WEBP) → Text',
    ],
    desc: 'Unlocks OCR-powered conversions from scanned PDFs and images.',
  },
  {
    id: 'document',
    name: 'Document Module',
    engine: 'Pandoc',
    size: '~30 MB',
    color: '#34D399',
    bg: 'rgba(52,211,153,0.15)',
    downloadUrl: 'https://github.com/NomanRafique01/ToolCEO/releases/download/modules-v1.0/document-module.zip',
    icon: `<svg width="28" height="28" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M8 1l4 4H8V1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      <line x1="10" y1="4" x2="10" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M10 4l2 3 2-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="14" y1="4" x2="14" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`,
    unlocks: [
      'DOCX → EPUB',
      'DOCX → Markdown',
      'TXT → EPUB',
      'TXT → Markdown',
      'TXT → RTF',
      'ODT → EPUB',
      'ODT → Markdown',
      'ODT → RTF',
    ],
    desc: 'Unlocks markup and eBook format conversions via Pandoc.',
  },
  {
    id: 'ebook',
    name: 'eBook Module',
    engine: 'Calibre',
    size: '~150 MB',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    downloadUrl: 'https://github.com/NomanRafique01/ToolCEO/releases/download/modules-v1.0/ebook-module.zip',
    icon: `<svg width="28" height="28" viewBox="0 0 16 16" fill="none">
      <path d="M8 13s-4-2-7-2V3c3 0 7 2 7 2s4-2 7-2v8c-3 0-7 2-7 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      <line x1="8" y1="5" x2="8" y2="13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>`,
    unlocks: [
      'EPUB → MOBI',
      'EPUB → AZW3',
      'EPUB → FB2',
      'EPUB → RTF',
      'EPUB → PDF',
      'MOBI → EPUB',
      'FB2 → EPUB',
      'AZW3 → EPUB',
    ],
    desc: 'Unlocks full eBook format conversions via Calibre.',
  },
  {
    id: 'media',
    name: 'Media Module',
    engine: 'FFmpeg + 7-Zip',
    size: '~82 MB',
    color: '#FB923C',
    bg: 'rgba(251,146,60,0.15)',
    downloadUrl: 'https://github.com/NomanRafique01/ToolCEO/releases/download/modules-v1.0/media-module.zip',
    icon: `<svg width="28" height="28" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      <path d="M11 6.5l4-2v7l-4-2V6.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.1"/>
      <line x1="4" y1="3" x2="4"  y2="6" stroke="currentColor" stroke-width="1.1"/>
      <line x1="7" y1="3" x2="7"  y2="6" stroke="currentColor" stroke-width="1.1"/>
    </svg>`,
    unlocks: [
      'MP4 → MKV, AVI, MOV, WEBM',
      'MP3 → WAV, FLAC, AAC, OGG',
      'Archive tools — ZIP, 7Z, RAR (coming soon)',
    ],
    desc: 'Unlocks Audio/Video conversions and Archive tools (coming soon).',
  },
];

// In-memory status map { office: 'installed'|'downloaded'|'not_downloaded', ... }
let _currentStatuses = {};

// ─── MODULE STATUS ────────────────────────────────────────────────────────────

/**
 * Load module statuses from modules.json / filesystem via IPC.
 */
async function _loadStatuses() {
  try {
    if (window.electronAPI && window.electronAPI.readModulesJson) {
      _currentStatuses = await window.electronAPI.readModulesJson();
      return _currentStatuses;
    }
    const res  = await fetch('../modules.json');
    const data = await res.json();
    _currentStatuses = Object.fromEntries(
      Object.entries(data.modules || {}).map(([k, v]) => [k, v.status])
    );
    return _currentStatuses;
  } catch (_) {
    _currentStatuses = {};
    return {};
  }
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function _openModal(mod, status) {
  const existing = document.getElementById('modules-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modules-modal-overlay';
  overlay.className = 'mod-modal-overlay';
  overlay.dataset.moduleId = mod.id;

  const isInstalling = (isDownloadActive() && getActiveDownloadModuleId() === mod.id && getActivePhase() === 'installing') || status === 'installing';
  const isDownloading = (isDownloadActive() && getActiveDownloadModuleId() === mod.id && getActivePhase() === 'downloading') || status === 'downloading';
  const isInstalled = status === 'installed';
  const isDownloaded = status === 'downloaded';

  let footerButtonsHTML = '';
  if (isInstalled) {
    footerButtonsHTML = `
      <button class="mod-modal-btn mod-modal-btn--installed" disabled>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ✓ Installed
      </button>
      <button class="mod-modal-btn mod-modal-btn--secondary" id="mod-modal-close-btn">Close</button>`;
  } else if (isInstalling) {
    footerButtonsHTML = `
      <button class="mod-modal-btn mod-modal-btn--busy" disabled>
        <svg class="mod-spinner" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10"/>
        </svg>
        Installing…
      </button>
      <button class="mod-modal-btn mod-modal-btn--cancel" id="mod-modal-cancel-op">Cancel</button>`;
  } else if (isDownloading) {
    footerButtonsHTML = `
      <button class="mod-modal-btn mod-modal-btn--busy" disabled>
        <svg class="mod-spinner" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10"/>
        </svg>
        Downloading…
      </button>
      <button class="mod-modal-btn mod-modal-btn--cancel" id="mod-modal-cancel-op">Cancel</button>`;
  } else if (isDownloaded) {
    footerButtonsHTML = `
      <button class="mod-modal-btn mod-modal-btn--install-now" id="mod-modal-install-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Install Now
      </button>
      <button class="mod-modal-btn mod-modal-btn--secondary" id="mod-modal-later-btn">Install Later</button>`;
  } else {
    footerButtonsHTML = `
      <button class="mod-modal-btn mod-modal-btn--download" id="mod-modal-download-btn" style="--mod-color:${mod.color};--mod-bg:${mod.bg}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Download Module
      </button>
      <button class="mod-modal-btn mod-modal-btn--secondary" id="mod-modal-close-btn">Cancel</button>`;
  }

  overlay.innerHTML = `
    <div class="mod-modal" role="dialog" aria-modal="true" aria-label="${mod.name} details">
      <div class="mod-modal-header" style="--mod-color:${mod.color};--mod-bg:${mod.bg}">
        <div class="mod-modal-icon-wrap">
          <div class="mod-modal-icon" style="background:${mod.bg};color:${mod.color}">${mod.icon}</div>
        </div>
        <div class="mod-modal-title-area">
          <h2 class="mod-modal-title">${mod.name}</h2>
          <span class="mod-modal-engine">Engine: ${mod.engine} &nbsp;·&nbsp; ${mod.size}</span>
        </div>
        <button class="mod-modal-close" aria-label="Close">&#x2715;</button>
      </div>

      <div class="mod-modal-body">
        <p class="mod-modal-intro">
          By downloading and installing this module you unlock these conversion tools:
        </p>
        <ul class="mod-modal-tool-list">
          ${mod.unlocks.map((u) => `
            <li class="mod-modal-tool-item">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="mod-modal-check" style="color:${mod.color}">
                <path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${u}
            </li>`).join('')}
        </ul>
      </div>

      <div class="mod-modal-footer" id="mod-modal-footer">
        ${footerButtonsHTML}
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.mod-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const closeBtn = overlay.querySelector('#mod-modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', close);

  const laterBtn = overlay.querySelector('#mod-modal-later-btn');
  if (laterBtn) laterBtn.addEventListener('click', close);

  const downloadBtn = overlay.querySelector('#mod-modal-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      startModuleDownload(mod);
      close();
    });
  }

  const installBtn = overlay.querySelector('#mod-modal-install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', () => {
      startModuleInstall(mod);
      close();
    });
  }

  const cancelOpBtn = overlay.querySelector('#mod-modal-cancel-op');
  if (cancelOpBtn) {
    cancelOpBtn.addEventListener('click', () => {
      cancelActiveOperation(mod.id);
      close();
    });
  }
}

// ─── MAIN RENDERER ───────────────────────────────────────────────────────────

let _pendingLockContext = null;

export function setPendingLockContext(ctx) {
  _pendingLockContext = ctx;
}

export async function renderModules(container, activateNav) {
  window.__modulesActivateNav = activateNav;
  setBreadcrumb(['Dashboard', 'Modules']);

  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Dashboard">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(0,229,192,0.15);color:#00E5C0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1l2 2h4v4l2 2-2 2v4h-4l-2 2-2-2H2V9L0 7l2-2V1h4l2-2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </div>
      <span class="explore-title">Modules — Manage Engines</span>
    </div>
    <div class="mod-loading">Loading…</div>`;

  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });

  const statuses = await _loadStatuses();

  // Sync active operation from Electron if running
  if (window.electronAPI && window.electronAPI.getActiveModuleDownload) {
    try {
      const activeDl = await window.electronAPI.getActiveModuleDownload();
      if (activeDl && activeDl.moduleId) {
        syncActiveDownload(activeDl);
      }
    } catch (_) {}
  }

  // Build module cards
  const cardsHTML = MODULES.map((mod) => {
    const rawStatus = statuses[mod.id] || 'not_downloaded';
    const isInstalling = isDownloadActive() && getActiveDownloadModuleId() === mod.id && getActivePhase() === 'installing';
    const isDownloading = isDownloadActive() && getActiveDownloadModuleId() === mod.id && getActivePhase() === 'downloading';
    const isInstalled = rawStatus === 'installed';
    const isDownloaded = rawStatus === 'downloaded';

    let badgeClass = 'mod-card-badge--not-downloaded';
    let badgeText  = 'Not Downloaded';
    let btnHTML    = '';

    if (isInstalled) {
      badgeClass = 'mod-card-badge--installed';
      badgeText  = 'Installed';
      btnHTML = `
        <button class="mod-card-btn mod-card-btn--installed" disabled data-module-id="${mod.id}">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ✓ Installed
        </button>`;
    } else if (isInstalling) {
      badgeClass = 'mod-card-badge--installing';
      badgeText  = 'Installing… 0%';
      btnHTML = `
        <button class="mod-card-btn mod-card-btn--cancel" data-action="cancel" data-module-id="${mod.id}">
          Cancel
        </button>`;
    } else if (isDownloading) {
      badgeClass = 'mod-card-badge--downloading';
      badgeText  = 'Downloading… 0%';
      btnHTML = `
        <button class="mod-card-btn mod-card-btn--cancel" data-action="cancel" data-module-id="${mod.id}">
          Cancel
        </button>`;
    } else if (isDownloaded) {
      badgeClass = 'mod-card-badge--downloaded';
      badgeText  = 'Downloaded';
      btnHTML = `
        <button class="mod-card-btn mod-card-btn--install-now" data-action="install" data-module-id="${mod.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Install Now
        </button>`;
    } else {
      badgeClass = 'mod-card-badge--not-downloaded';
      badgeText  = 'Not Downloaded';
      btnHTML = `
        <button class="mod-card-btn mod-card-btn--download" data-action="download" data-module-id="${mod.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Download Module
        </button>`;
    }

    return `
      <div class="mod-card" data-module-id="${mod.id}"
           style="--mod-color:${mod.color};--mod-bg:${mod.bg}">
        <div class="mod-card-header">
          <div class="mod-card-icon">${mod.icon}</div>
          <span class="mod-card-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="mod-card-name">${mod.name}</div>
        <div class="mod-card-engine">Engine: ${mod.engine}</div>
        <div class="mod-card-size">${mod.size}</div>
        <ul class="mod-card-unlocks">
          ${mod.unlocks.slice(0, 3).map((u) => `<li>${u}</li>`).join('')}
          ${mod.unlocks.length > 3 ? `<li class="mod-card-unlocks-more">+${mod.unlocks.length - 3} more…</li>` : ''}
        </ul>
        <div class="mod-card-actions">
          ${btnHTML}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to Dashboard">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(0,229,192,0.15);color:#00E5C0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1l2 2h3v3l2 2-2 2v3h-3l-2 2-2-2H3V9L1 7l2-2V2h3l2-1Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </div>
      <span class="explore-title">Modules — Manage Engines</span>
    </div>

    <div class="pdf-zone-label">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="pdf-zone-icon">
        <path d="M8 1l2 2h3v3l2 2-2 2v3h-3l-2 2-2-2H3V9L1 7l2-2V3h3l2-2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
      </svg>
      Installable Engine Modules
    </div>

    <div class="mod-grid">
      ${cardsHTML}
    </div>`;

  // Back → Dashboard
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });

  // Event delegation on mod-grid for card and button clicks
  const modGrid = container.querySelector('.mod-grid');
  if (modGrid) {
    modGrid.addEventListener('click', (e) => {
      // 1. Check if action button was clicked
      const actionBtn = e.target.closest('.mod-card-btn');
      if (actionBtn) {
        e.stopPropagation();
        const modId = actionBtn.dataset.moduleId;
        const mod = MODULES.find((m) => m.id === modId);
        const action = actionBtn.dataset.action;

        if (!mod) return;

        if (action === 'download') {
          startModuleDownload(mod);
        } else if (action === 'install') {
          startModuleInstall(mod);
        } else if (action === 'cancel') {
          cancelActiveOperation(mod.id);
        }
        return;
      }

      // 2. Check if card was clicked (open modal)
      const card = e.target.closest('.mod-card');
      if (card) {
        const modId = card.dataset.moduleId;
        const mod = MODULES.find((m) => m.id === modId);
        const currentSt = _currentStatuses[modId] || 'not_downloaded';
        if (mod) _openModal(mod, currentSt);
      }
    });
  }

  // Locked-tool highlight context
  const ctx = _pendingLockContext;
  _pendingLockContext = null;

  if (ctx && ctx.moduleId) {
    const targetCard = container.querySelector(`.mod-card[data-module-id="${ctx.moduleId}"]`);
    const mod = MODULES.find((m) => m.id === ctx.moduleId);
    const toolLabel = ctx.toolLabel || 'This tool';
    const modName = mod ? mod.name : 'this module';
    const toolCount = mod ? (mod.unlocks.length - 1) : 0;

    pushNotification({
      type: 'warning',
      message: `You tried to open ${toolLabel}. This tool requires the ${modName} to be installed.`,
      detail: `Download and install the ${modName} below to access this and ${toolCount} other conversion tools.`,
      autoDismiss: true,
    });

    if (targetCard) {
      container.querySelectorAll('.mod-card--highlighted').forEach((c) => {
        c.classList.remove('mod-card--highlighted');
      });
      targetCard.classList.add('mod-card--highlighted');
      setTimeout(() => {
        const mainContent = document.getElementById('main-content');
        if (mainContent && targetCard) {
          const cardTop = targetCard.getBoundingClientRect().top
            + mainContent.scrollTop
            - (mainContent.getBoundingClientRect().top || 0)
            - 80;
          mainContent.scrollTo({ top: Math.max(0, cardTop), behavior: 'smooth' });
        } else if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    }
  }
}

/**
 * Directly update a module card and any open modal in the DOM without re-rendering the whole page.
 * @param {string} moduleId
 * @param {'not_downloaded' | 'downloading' | 'downloaded' | 'installing' | 'installed'} state
 * @param {number|null} percent
 */
export function updateModuleCardDOM(moduleId, state, percent = null) {
  _currentStatuses[moduleId] = state;
  const card = document.querySelector(`.mod-card[data-module-id="${moduleId}"]`);

  if (card) {
    const badge = card.querySelector('.mod-card-badge');
    const actions = card.querySelector('.mod-card-actions');
    const cleanPct = percent !== null ? Math.max(0, Math.min(100, Math.round(percent))) : 0;

    if (state === 'downloading') {
      if (badge) {
        badge.className = 'mod-card-badge mod-card-badge--downloading';
        badge.textContent = `Downloading… ${cleanPct}%`;
      }
      if (actions) {
        actions.innerHTML = `
          <button class="mod-card-btn mod-card-btn--cancel" data-action="cancel" data-module-id="${moduleId}">
            Cancel
          </button>`;
      }
    } else if (state === 'downloaded') {
      if (badge) {
        badge.className = 'mod-card-badge mod-card-badge--downloaded';
        badge.textContent = 'Downloaded';
      }
      if (actions) {
        actions.innerHTML = `
          <button class="mod-card-btn mod-card-btn--install-now" data-action="install" data-module-id="${moduleId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Install Now
          </button>`;
      }
    } else if (state === 'installing') {
      if (badge) {
        badge.className = 'mod-card-badge mod-card-badge--installing';
        badge.textContent = `Installing… ${cleanPct}%`;
      }
      if (actions) {
        actions.innerHTML = `
          <button class="mod-card-btn mod-card-btn--cancel" data-action="cancel" data-module-id="${moduleId}">
            Cancel
          </button>`;
      }
    } else if (state === 'installed') {
      if (badge) {
        badge.className = 'mod-card-badge mod-card-badge--installed';
        badge.textContent = 'Installed';
      }
      if (actions) {
        actions.innerHTML = `
          <button class="mod-card-btn mod-card-btn--installed" disabled data-module-id="${moduleId}">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ✓ Installed
          </button>`;
      }
    } else {
      // not_downloaded
      if (badge) {
        badge.className = 'mod-card-badge mod-card-badge--not-downloaded';
        badge.textContent = 'Not Downloaded';
      }
      if (actions) {
        actions.innerHTML = `
          <button class="mod-card-btn mod-card-btn--download" data-action="download" data-module-id="${moduleId}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Download Module
          </button>`;
      }
    }
  }

  // Update open modal if for this module
  const overlay = document.getElementById('modules-modal-overlay');
  if (overlay && overlay.dataset.moduleId === moduleId) {
    const footer = overlay.querySelector('#mod-modal-footer');
    if (footer) {
      const cleanPct = percent !== null ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
      if (state === 'downloading') {
        footer.innerHTML = `
          <button class="mod-modal-btn mod-modal-btn--busy" disabled>
            <svg class="mod-spinner" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10"/>
            </svg>
            Downloading… ${cleanPct}%
          </button>
          <button class="mod-modal-btn mod-modal-btn--cancel" id="mod-modal-cancel-op">Cancel</button>`;
        const cancelBtn = footer.querySelector('#mod-modal-cancel-op');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { cancelActiveOperation(moduleId); overlay.remove(); });
      } else if (state === 'downloaded') {
        footer.innerHTML = `
          <button class="mod-modal-btn mod-modal-btn--install-now" id="mod-modal-install-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Install Now
          </button>
          <button class="mod-modal-btn mod-modal-btn--secondary" id="mod-modal-later-btn">Install Later</button>`;
        const installBtn = footer.querySelector('#mod-modal-install-btn');
        if (installBtn) {
          const mod = MODULES.find((m) => m.id === moduleId);
          installBtn.addEventListener('click', () => { if (mod) startModuleInstall(mod); overlay.remove(); });
        }
        const laterBtn = footer.querySelector('#mod-modal-later-btn');
        if (laterBtn) laterBtn.addEventListener('click', () => overlay.remove());
      } else if (state === 'installing') {
        footer.innerHTML = `
          <button class="mod-modal-btn mod-modal-btn--busy" disabled>
            <svg class="mod-spinner" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10"/>
            </svg>
            Installing… ${cleanPct}%
          </button>
          <button class="mod-modal-btn mod-modal-btn--cancel" id="mod-modal-cancel-op">Cancel</button>`;
        const cancelBtn = footer.querySelector('#mod-modal-cancel-op');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { cancelActiveOperation(moduleId); overlay.remove(); });
      } else if (state === 'installed') {
        footer.innerHTML = `
          <button class="mod-modal-btn mod-modal-btn--installed" disabled>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ✓ Installed
          </button>
          <button class="mod-modal-btn mod-modal-btn--secondary" id="mod-modal-close-btn">Close</button>`;
        const closeBtn = footer.querySelector('#mod-modal-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
      } else {
        // not_downloaded
        const mod = MODULES.find((m) => m.id === moduleId);
        footer.innerHTML = `
          <button class="mod-modal-btn mod-modal-btn--download" id="mod-modal-download-btn" style="--mod-color:${mod?.color || '#00E5C0'};--mod-bg:${mod?.bg || 'rgba(0,229,192,0.15)'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Download Module
          </button>
          <button class="mod-modal-btn mod-modal-btn--secondary" id="mod-modal-close-btn">Cancel</button>`;
        const dlBtn = footer.querySelector('#mod-modal-download-btn');
        if (dlBtn) dlBtn.addEventListener('click', () => { if (mod) startModuleDownload(mod); overlay.remove(); });
        const closeBtn = footer.querySelector('#mod-modal-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
      }
    }
  }
}

// Global listener for real-time state changes
if (typeof window !== 'undefined' && !window.__moduleStateListenerRegistered) {
  window.__moduleStateListenerRegistered = true;
  window.addEventListener('module-state-changed', (e) => {
    if (e.detail && e.detail.moduleId) {
      updateModuleCardDOM(e.detail.moduleId, e.detail.state, e.detail.percent);
    }
  });
}
