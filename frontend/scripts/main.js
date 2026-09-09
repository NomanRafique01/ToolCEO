/**
 * main.js  (entry point)
 * Bootstraps all UI modules after the DOM is ready.
 * Navigation must load first — it imports the category renderers directly.
 */

import { initNavigation }           from './navigation.js';
import { initDropZone }             from './dropzone.js';
import { initQuickConvert }         from './quickconvert.js';
import { initNotificationBanner }   from './notificationBanner.js';
import { initVaultFileHandler }     from './vaultFileHandler.js';
import { initModuleDownloadPanel }  from './moduleDownload.js';
import { initFavourites }           from './favourites.js';
import { initHistoryTracker }       from './historyTracker.js';
import { initRecentWidget }         from './recentWidget.js';

const loadingStartedAt = performance.now();

document.addEventListener('DOMContentLoaded', () => {
  const { activateNav } = initNavigation();
  initDropZone();
  initQuickConvert();
  initNotificationBanner();
  initModuleDownloadPanel();
  initFavourites({ activateNav });
  initHistoryTracker();
  initRecentWidget();

  // Register Electron IPC listener for .tceo double-click / CLI open events.
  // navContext is passed so the handler can drive the sidebar navigation.
  initVaultFileHandler({ activateNav });

  const elapsed = performance.now() - loadingStartedAt;
  const minimumDisplayTime = Math.max(0, 4000 - elapsed);
  setTimeout(() => {
    const loadingScreen = document.getElementById('app-loading');
    if (loadingScreen) loadingScreen.classList.add('is-hidden');
  }, minimumDisplayTime);
});
