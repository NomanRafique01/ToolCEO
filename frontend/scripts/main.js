/**
 * main.js  (entry point)
 * Bootstraps all UI modules after the DOM is ready.
 * Navigation must load first — it imports the category renderers directly.
 */

import { initNavigation }   from './navigation.js';
import { initDropZone }     from './dropzone.js';
import { initQuickConvert } from './quickconvert.js';

document.addEventListener('DOMContentLoaded', () => {
  const { activateNav } = initNavigation();
  initDropZone();
  initQuickConvert();
});
