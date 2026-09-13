/**
 * video.js
 * Renders the Video category placeholder into the explore-section container.
 * Called by navigation.js when the user clicks "Video".
 */

import { setBreadcrumb } from './navigation.js';

let _navigateToModule = null;
export function setNavigateToModule(fn) { _navigateToModule = fn; }

export function renderVideoFormats(container, activateNav) {
  setBreadcrumb(['Dashboard', 'Video']);
  container.innerHTML = `
    <div class="explore-header">
      <button class="fmt-back-btn" title="Back to all tools">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="fmt-category-icon" style="background:rgba(56,189,248,0.15);color:#38BDF8">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M11 6.5l4-2v7l-4-2V6.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.1"/>
          <line x1="4" y1="3" x2="4"  y2="6" stroke="currentColor" stroke-width="1.1"/>
          <line x1="7" y1="3" x2="7"  y2="6" stroke="currentColor" stroke-width="1.1"/>
        </svg>
      </div>
      <span class="explore-title">Video — Tools &amp; Conversions</span>
    </div>

    <div class="fmt-grid">
      <div class="img-coming-soon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" class="img-coming-soon-icon">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p class="img-coming-soon-title">Coming Soon</p>
        <p class="img-coming-soon-sub">Video tools and conversions are being added. Check back soon.</p>
      </div>
    </div>
  `;

  // Back button → restore the Explore Tools grid
  container.querySelector('.fmt-back-btn').addEventListener('click', () => {
    activateNav('Dashboard');
  });
}

export function initVideo() {}
