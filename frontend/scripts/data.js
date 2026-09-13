/**
 * data.js
 * Renders the Data category placeholder into the explore-section container.
 * Called by navigation.js when the user clicks "Data".
 */

import { setBreadcrumb } from './navigation.js';

let _navigateToModule = null;
export function setNavigateToModule(fn) { _navigateToModule = fn; }

export function renderDataFormats(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Data']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to all tools">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(45,212,191,0.15);color:#2DD4BF">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor" stroke-width="1.3"/>
          <path d="M3 4v4c0 1.1 2.24 2 5 2s5-.9 5-2V4" stroke="currentColor" stroke-width="1.3"/>
          <path d="M3 8v4c0 1.1 2.24 2 5 2s5-.9 5-2V8" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      </div>
      <span class="explore-title">Data — Tools &amp; Conversions</span>
    </div>

    <div class="fmt-grid">
      <div class="img-coming-soon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" class="img-coming-soon-icon">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p class="img-coming-soon-title">Coming Soon</p>
        <p class="img-coming-soon-sub">Data tools and conversions are being added. Check back soon.</p>
      </div>
    </div>
  `;

  // Back button → restore the Explore Tools grid
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });
}

export function initData() {}
