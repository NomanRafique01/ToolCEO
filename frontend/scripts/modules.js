/**
 * modules.js
 * Renders the Modules page — shows installable engine modules with
 * status badges, install buttons, and a detail modal.
 *
 * Module install status is read from modules.json (project root) via
 * the Electron IPC bridge.  Clicking "Install Module" sets the status
 * to "installed" in that file and updates the UI in-place.
 */

import { pushNotification }                          from './notificationStore.js';
import { startModuleDownload, isDownloadActive } from './moduleDownload.js';

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

// ─── MODULE STATUS ────────────────────────────────────────────────────────────

/**
 * Load module statuses from modules.json.
 * In Electron the file is read via IPC; in browser dev we fall back to fetch.
 * Returns a map: { office: 'not_installed', ... }
 */
async function _loadStatuses() {
  try {
    if (window.electronAPI && window.electronAPI.readModulesJson) {
      return await window.electronAPI.readModulesJson();
    }
    // Fallback: fetch from the same origin (works in browser dev mode)
    const res  = await fetch('../modules.json');
    const data = await res.json();
    return Object.fromEntries(
      Object.entries(data.modules).map(([k, v]) => [k, v.status])
    );
  } catch (_) {
    // If the file can't be read, treat everything as not_installed
    return {};
  }
}

/**
 * Persist updated status back to modules.json.
 * Only wired up when running inside Electron.
 */
async function _saveStatus(moduleId, status) {
  try {
    if (window.electronAPI && window.electronAPI.writeModulesJson) {
      await window.electronAPI.writeModulesJson(moduleId, status);
    }
  } catch (_) {
    // silently ignore if IPC not available
  }
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function _openModal(mod, isInstalled) {
  // Remove any existing modal
  const existing = document.getElementById('modules-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modules-modal-overlay';
  overlay.className = 'mod-modal-overlay';

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
          By downloading this module you will get access to these tools:
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

      <div class="mod-modal-footer">
        ${isInstalled
          ? `<button class="mod-modal-btn mod-modal-btn--installed" disabled>
               <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                 <path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
               Installed
             </button>`
          : isDownloadActive()
            ? `<button class="mod-modal-btn mod-modal-btn--install" disabled title="A download is already in progress" style="--mod-color:${mod.color};--mod-bg:${mod.bg}">
                 A download is already in progress
               </button>`
            : `<button class="mod-modal-btn mod-modal-btn--install" data-module-id="${mod.id}" style="--mod-color:${mod.color};--mod-bg:${mod.bg}">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                   <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                   <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                 </svg>
                 Install Module
               </button>`}
        <button class="mod-modal-btn mod-modal-btn--secondary" id="mod-modal-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Close handlers
  const close = () => overlay.remove();
  overlay.querySelector('.mod-modal-close').addEventListener('click', close);
  overlay.querySelector('#mod-modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Install handler — starts the real download and closes the modal
  const installBtn = overlay.querySelector('.mod-modal-btn--install');
  if (installBtn && !installBtn.disabled) {
    installBtn.addEventListener('click', () => {
      startModuleDownload(mod);
      close();
    });
  }
}

// ─── MAIN RENDERER ───────────────────────────────────────────────────────────

/**
 * Pending locked-tool context — set by navigation.js before calling renderModules.
 * Shape: { moduleId: string, toolLabel: string } | null
 */
let _pendingLockContext = null;

/**
 * Called by navigation.js when a locked card was clicked.
 * The next renderModules() call will scroll to and highlight the given module.
 */
export function setPendingLockContext(ctx) {
  _pendingLockContext = ctx;
}

export async function renderModules(container, activateNav) {
  // Stash activateNav for the modal's install handler
  window.__modulesActivateNav = activateNav;

  setBreadcrumb(['Dashboard', 'Modules']);

  // Show loading state immediately
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

  // Build module cards
  const cardsHTML = MODULES.map((mod) => {
    const installed = statuses[mod.id] === 'installed';
    return `
      <div class="mod-card" data-module-id="${mod.id}"
           style="--mod-color:${mod.color};--mod-bg:${mod.bg}">
        <div class="mod-card-header">
          <div class="mod-card-icon">${mod.icon}</div>
          <span class="mod-card-badge ${installed ? 'mod-card-badge--installed' : 'mod-card-badge--not-installed'}">
            ${installed ? 'Installed' : 'Not Installed'}
          </span>
        </div>
        <div class="mod-card-name">${mod.name}</div>
        <div class="mod-card-engine">Engine: ${mod.engine}</div>
        <div class="mod-card-size">${mod.size}</div>
        <ul class="mod-card-unlocks">
          ${mod.unlocks.slice(0, 3).map((u) => `<li>${u}</li>`).join('')}
          ${mod.unlocks.length > 3 ? `<li class="mod-card-unlocks-more">+${mod.unlocks.length - 3} more…</li>` : ''}
        </ul>
        <button class="mod-card-btn ${installed ? 'mod-card-btn--installed' : 'mod-card-btn--install'}"
                ${installed ? 'disabled' : ''}
                data-module-id="${mod.id}">
          ${installed
            ? `<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                 <path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>
               Installed`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                 <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                 <path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
               </svg>
               Install Module`}
        </button>
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

  // Card & button click → open modal
  container.querySelectorAll('.mod-card').forEach((card) => {
    const modId  = card.dataset.moduleId;
    const mod    = MODULES.find((m) => m.id === modId);
    const installed = statuses[modId] === 'installed';

    // Clicking the card body (not the button) opens modal
    card.addEventListener('click', (e) => {
      if (e.target.closest('.mod-card-btn')) return;
      if (mod) _openModal(mod, installed);
    });

    // Clicking the install button directly also opens modal
    const btn = card.querySelector('.mod-card-btn--install');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mod) _openModal(mod, false);
      });
    }
  });

  // ── Locked-tool highlight ──────────────────────────────────────────────────
  // If the user clicked a locked tool card elsewhere, we were given context
  // specifying which module to scroll to and highlight.
  const ctx = _pendingLockContext;
  _pendingLockContext = null; // consume it

  if (ctx && ctx.moduleId) {
    // Find the matching module card
    const targetCard = container.querySelector(`.mod-card[data-module-id="${ctx.moduleId}"]`);

    // Build the notification message
    const mod       = MODULES.find((m) => m.id === ctx.moduleId);
    const toolLabel = ctx.toolLabel || 'This tool';
    const modName   = mod ? mod.name : 'this module';
    const toolCount = mod ? (mod.unlocks.length - 1) : 0;

    pushNotification({
      type      : 'warning',
      message   : `You tried to open ${toolLabel}. This tool requires the ${modName} to be installed.`,
      detail    : `Install the ${modName} below to get access to this and ${toolCount} other conversion tools.`,
      autoDismiss: true,
    });

    if (targetCard) {
      // Remove any previous highlight
      container.querySelectorAll('.mod-card--highlighted').forEach((c) => {
        c.classList.remove('mod-card--highlighted');
      });

      // Add highlight class (CSS drives the pulse animation)
      targetCard.classList.add('mod-card--highlighted');

      // Scroll to the target card smoothly
      setTimeout(() => {
        const mainContent = document.getElementById('main-content');
        if (mainContent && targetCard) {
          const cardTop = targetCard.getBoundingClientRect().top
            + mainContent.scrollTop
            - (mainContent.getBoundingClientRect().top || 0)
            - 80; // offset for header
          mainContent.scrollTo({ top: Math.max(0, cardTop), behavior: 'smooth' });
        } else if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    }
  }
}
