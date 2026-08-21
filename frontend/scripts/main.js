/**
 * main.js  (entry point)
 * Bootstraps all UI modules after the DOM is ready.
 * Navigation must load first — it imports the category renderers directly.
 */

import { initNavigation }          from './navigation.js';
import { initDropZone }            from './dropzone.js';
import { initQuickConvert }        from './quickconvert.js';
import { initNotificationBanner }  from './notificationBanner.js';
import { initVaultFileHandler }    from './vaultFileHandler.js';

document.addEventListener('DOMContentLoaded', () => {
  const { activateNav } = initNavigation();
  initDropZone();
  initQuickConvert();
  initNotificationBanner();

  // Register Electron IPC listener for .tceo double-click / CLI open events.
  // navContext is passed so the handler can drive the sidebar navigation.
  initVaultFileHandler({ activateNav });
});
