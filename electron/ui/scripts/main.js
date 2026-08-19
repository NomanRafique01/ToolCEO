/**
 * main.js  (entry point)
 * Bootstraps all UI modules after the DOM is ready.
 * Import order matters: navigation must load before dashboard
 * so that activateNav() is available to tool-card clicks.
 */

import { initNavigation }   from './navigation.js';
import { initDropZone }     from './dropzone.js';
import { initQuickConvert } from './quickconvert.js';

document.addEventListener('DOMContentLoaded', () => {
  const { activateNav } = initNavigation();
  initDropZone();
  initQuickConvert();

  // ── Explore Tools card clicks ───────────────────────────
  document.querySelectorAll('.tool-card').forEach((card) => {
    card.addEventListener('click', () => {
      const label = card.dataset.nav;
      if (label) activateNav(label);
    });
  });
});
