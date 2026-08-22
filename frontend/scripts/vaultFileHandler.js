/**
 * frontend/scripts/vaultFileHandler.js
 *
 * Handles the 'vault-file-open' IPC event sent by the Electron main process
 * when a .tceo file is opened from the OS file manager (or passed via CLI).
 *
 * Flow when a .tceo file open is received:
 *  1. Navigate sidebar to "Documents"
 *  2. Render the PDF Tools panel inside the explore-section
 *  3. Activate the "Encrypt / Decrypt" tool (sets active tool state)
 *  4. Scroll to drop zone
 *  5. Build a File object from the local path via IPC (main reads the file)
 *  6. Call handleEncryptFilePicked() — this is identical to a user drag-drop
 *  7. Push an info notification: "Vault file detected — enter your password to unlock"
 *
 * The renderer ends up on the Vault Unlock screen with the file pre-loaded
 * and the password input focused.
 */

import { setActiveTool }           from './toolstate.js';
import { pushNotification }        from './notificationStore.js';
import { handleEncryptFilePicked } from '../tools/documents/pdf_tools/encrypt/encrypt.js';

// Encrypt tool definition (mirrors the entry in documents.js PDF_TOOLS)
const ENCRYPT_TOOL = {
  id       : 'encrypt',
  label    : 'Encrypt / Decrypt',
  mainText : 'Select File to Encrypt / Decrypt',
  subText  : 'or click to pick your file',
  tag      : 'Tool',
  color    : '#FBBF24',
  bg       : 'rgba(251,191,36,0.15)',
  icon     : `<svg width="26" height="26" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
    <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="8" cy="11" r="1.2" fill="currentColor"/>
    <line x1="8" y1="12.2" x2="8" y2="13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`,
};

/** True once the first vault file open has been handled (prevents double-fire). */
let _handling = false;

/**
 * Navigates the app to the Encrypt/Decrypt tool and loads the given .tceo file.
 * @param {string} filePath  Absolute path to the .tceo file on disk.
 * @param {{ activateNav: (label: string) => void }} navContext
 */
async function _openVaultFile(filePath, navContext) {
  if (_handling) return;
  _handling = true;

  try {
    // ── 1. Navigate to Documents → PDF Tools ───────────────────────────────────
    const { activateNav } = navContext;

    // Navigate sidebar to Documents first
    activateNav('Documents');

    // Give the Documents panel a tick to render, then click into PDF tools
    await _tick(80);

    const exploreSection = document.getElementById('explore-section');
    if (exploreSection) {
      // Click the PDF format card (marked fmt-card--pdf-entry) programmatically
      const pdfCard = exploreSection.querySelector('.fmt-card--pdf-entry');
      if (pdfCard) {
        pdfCard.click();
        await _tick(80);
      }
    }

    // ── 2. Set the Encrypt/Decrypt tool as active ────────────────────────────
    setActiveTool(ENCRYPT_TOOL);

    // Highlight the encrypt card in the grid
    await _tick(40);
    const encCard = document.querySelector('.fmt-card[data-id="encrypt"]');
    if (encCard) {
      document.querySelectorAll('.fmt-card').forEach((c) => c.classList.remove('selected'));
      encCard.classList.add('selected');
    }

    // Scroll to drop zone
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

    // ── 3. Read the file via IPC and build a File object ─────────────────────
    if (!window.toolceo || !window.toolceo.readLocalFile) {
      throw new Error('toolceo.readLocalFile is not available');
    }

    const result = await window.toolceo.readLocalFile(filePath);

    if (!result.ok) {
      throw new Error(result.error || 'Failed to read vault file');
    }

    // Reconstruct a real File object from the ArrayBuffer
    const blob = new Blob([result.buffer], { type: 'application/octet-stream' });
    const file  = new File([blob], result.name, {
      type         : 'application/octet-stream',
      lastModified : Date.now(),
    });

    // ── 4. Push the info notification ────────────────────────────────────────
    pushNotification({
      type    : 'info',
      message : 'Vault file detected — enter your password to unlock',
      detail  : result.name,
    });

    // ── 5. Hand the file off to the encrypt module ────────────────────────────
    // handleEncryptFilePicked auto-detects .tceo and shows the Vault Unlock tab
    await _tick(120);
    await handleEncryptFilePicked(file);

    // ── 6. Focus the password input ──────────────────────────────────────────
    await _tick(400); // wait for panel animation
    const passInput = document.querySelector('#vlt-pass');
    if (passInput) passInput.focus();

  } catch (err) {
    console.error('[VaultFileHandler] Failed to open vault file:', err);
    pushNotification({
      type    : 'error',
      message : 'Failed to open Vault file',
      detail  : err.message || String(err),
    });
  } finally {
    _handling = false;
  }
}

/** Resolves after `ms` milliseconds. */
function _tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialises the vault-file-open IPC listener.
 * Must be called after DOMContentLoaded with the navContext from initNavigation().
 *
 * @param {{ activateNav: (label: string) => void }} navContext
 * @returns {() => void}  Cleanup / unsubscribe function
 */
export function initVaultFileHandler(navContext) {
  if (!window.toolceo || !window.toolceo.onVaultFileOpen) {
    // Running outside Electron (e.g., browser dev mode) — skip silently
    return () => {};
  }

  const unsubscribe = window.toolceo.onVaultFileOpen((filePath) => {
    if (!filePath || !filePath.toLowerCase().endsWith('.tceo')) return;
    _openVaultFile(filePath, navContext);
  });

  return unsubscribe;
}
