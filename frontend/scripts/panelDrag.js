/**
 * panelDrag.js
 *
 * Shared, reusable Windows-style drag utility for fixed-position panels.
 * Handles:
 *  - 100% reliable mouse/pointer dragging across viewport
 *  - 3px dead zone to distinguish clicks from drags
 *  - Viewport boundary clamping & window resize bounds
 *  - Collision / overlap prevention: two floating windows cannot drag onto each other
 *  - Vertical stacking: when both tool progress and module download are open,
 *    pushes the tool progress window neatly above the download progress bar
 *  - Automatic position reset when cancelled or hidden
 */

// ── Visibility Helpers ────────────────────────────────────────────────────────

export function isPanelHidden(panel) {
  if (!panel) return true;
  if (panel.id === 'mod-dl-panel') {
    return !panel.classList.contains('mod-dl-panel--visible');
  }
  if (panel.id === 'bg-job-bar') {
    return panel.style.display === 'none' || panel.children.length === 0;
  }
  return panel.style.display === 'none';
}

export function isPanelVisible(panel) {
  return !isPanelHidden(panel);
}

// ── Collision / Overlap Math ──────────────────────────────────────────────────

function boxesOverlap(x1, y1, w1, h1, x2, y2, w2, h2, gap = 8) {
  return !(
    x1 + w1 + gap <= x2 ||
    x1 >= x2 + w2 + gap ||
    y1 + h1 + gap <= y2 ||
    y1 >= y2 + h2 + gap
  );
}

function resolveFinalOverlap(panel, other, gap = 10) {
  if (!other || !isPanelVisible(other)) return;
  const a = panel.getBoundingClientRect();
  const b = other.getBoundingClientRect();
  if (b.width === 0 || b.height === 0) return;

  if (!boxesOverlap(a.left, a.top, a.width, a.height, b.left, b.top, b.width, b.height, gap)) {
    return;
  }

  // Push panel out along the nearest outside edge of other
  const dTop    = (a.bottom + gap) - b.top;     // move above
  const dBottom = (b.bottom + gap) - a.top;     // move below
  const dLeft   = (a.right + gap) - b.left;     // move left
  const dRight  = (b.right + gap) - a.left;     // move right

  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  let newLeft = a.left;
  let newTop  = a.top;

  if (minD === dTop) {
    newTop = b.top - a.height - gap;
  } else if (minD === dBottom) {
    newTop = b.bottom + gap;
  } else if (minD === dLeft) {
    newLeft = b.left - a.width - gap;
  } else {
    newLeft = b.right + gap;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  newLeft = Math.min(Math.max(0, newLeft), vw - a.width);
  newTop  = Math.min(Math.max(0, newTop),  vh - a.height);

  panel.style.left   = newLeft + 'px';
  panel.style.top    = newTop  + 'px';
  panel.style.right  = 'auto';
  panel.style.bottom = 'auto';
}

// ── Vertical Stacking Coordinator ─────────────────────────────────────────────

/**
 * Ensures that when both the module download panel and the background tool progress
 * bar are open, the tool progress bar is stacked directly above the download panel,
 * preventing any overlap at default positions.
 */
export function syncFloatingPanelsStack() {
  const modPanel = document.getElementById('mod-dl-panel');
  const bgBar    = document.getElementById('bg-job-bar');

  if (!bgBar) return;

  const isModOpen = isPanelVisible(modPanel);
  const isBgOpen  = isPanelVisible(bgBar);
  const isBgDragged = bgBar.dataset.dragged === 'true' || Boolean(bgBar.style.left);

  if (isModOpen && isBgOpen && !isBgDragged) {
    const modRect = modPanel.getBoundingClientRect();
    const modHeight = modRect.height || 145;
    const modBottom = Math.max(24, window.innerHeight - modRect.bottom);
    const targetBottom = modBottom + modHeight + 14;

    bgBar.style.bottom = `${targetBottom}px`;
    bgBar.style.right  = '24px';
    bgBar.style.top    = 'auto';
    bgBar.style.left   = 'auto';
    bgBar.style.transition = 'bottom 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
  } else if (!isBgDragged) {
    bgBar.style.bottom = '';
    bgBar.style.right  = '';
    bgBar.style.top    = '';
    bgBar.style.left   = '';
    bgBar.style.transition = 'bottom 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
  }
}

// ── makeDraggable ─────────────────────────────────────────────────────────────

/**
 * Make a fixed-position panel draggable via mouse / pointer.
 * @param {HTMLElement} panel   – the container to move
 * @param {HTMLElement} handle  – the drag handle (header, grip, or entire panel)
 * @param {Object}      [opts]
 * @param {boolean}     [opts.resetOnHide=false] – clear saved position on hide
 * @param {string}      [opts.dragClass]         – custom dragging class name
 * @param {Function}    [opts.getOtherPanel]     – function returning other panel for collision prevention
 * @returns {{ resetPosition: () => void, restorePosition: () => void }}
 */
export function makeDraggable(panel, handle, opts = {}) {
  if (!panel || !handle) return { resetPosition() {}, restorePosition() {} };

  const state = {
    savedPosition: null, // { left, top } in CSS px
    isDragging: false,
    startX: 0,
    startY: 0,
    panelStartX: 0,
    panelStartY: 0,
    lastGoodLeft: 0,
    lastGoodTop: 0,
    hasMoved: false,
  };

  const DEAD_ZONE = 3; // px
  const COLLISION_GAP = 8; // px between panels
  let _preventClick = false;

  // ── Pointer Handlers ──────────────────────────────────────────────────────

  function onPointerDown(e) {
    // Only primary button
    if (e.button !== 0) return;

    // Ignore interactive elements
    if (e.target.closest('button, a, input, select, textarea, [data-bg-save], [data-bg-view], [data-bg-close]')) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.panelStartX = rect.left;
    state.panelStartY = rect.top;
    state.lastGoodLeft = rect.left;
    state.lastGoodTop  = rect.top;
    state.hasMoved = false;
    state.isDragging = true;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerUp, { passive: false });
  }

  function onPointerMove(e) {
    if (!state.isDragging) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (!state.hasMoved) {
      if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;
      state.hasMoved = true;
      panel.classList.add('panel-dragging');
      if (opts.dragClass) panel.classList.add(opts.dragClass);
      panel.style.transition = 'none';
      try { window.getSelection().removeAllRanges(); } catch (_) {}
    }

    if (e.cancelable) e.preventDefault();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panel.offsetWidth || 380;
    const ph = panel.offsetHeight || 140;

    let candLeft = Math.min(Math.max(0, state.panelStartX + dx), vw - pw);
    let candTop  = Math.min(Math.max(0, state.panelStartY + dy), vh - ph);

    // Collision avoidance with other panel
    const other = opts.getOtherPanel ? opts.getOtherPanel() : null;
    if (other && isPanelVisible(other)) {
      const bRect = other.getBoundingClientRect();
      if (bRect.width > 0 && bRect.height > 0) {
        if (boxesOverlap(candLeft, candTop, pw, ph, bRect.left, bRect.top, bRect.width, bRect.height, COLLISION_GAP)) {
          // Candidate position overlaps other panel. Try horizontal or vertical sliding:
          const canMoveX = !boxesOverlap(candLeft, state.lastGoodTop, pw, ph, bRect.left, bRect.top, bRect.width, bRect.height, COLLISION_GAP);
          const canMoveY = !boxesOverlap(state.lastGoodLeft, candTop, pw, ph, bRect.left, bRect.top, bRect.width, bRect.height, COLLISION_GAP);

          if (canMoveX) {
            candTop = state.lastGoodTop;
          } else if (canMoveY) {
            candLeft = state.lastGoodLeft;
          } else {
            // Push against other panel's boundary based on entry angle
            if (state.lastGoodLeft + pw <= bRect.left) {
              candLeft = Math.min(candLeft, bRect.left - pw - COLLISION_GAP);
            } else if (state.lastGoodLeft >= bRect.right) {
              candLeft = Math.max(candLeft, bRect.right + COLLISION_GAP);
            } else if (state.lastGoodTop + ph <= bRect.top) {
              candTop = Math.min(candTop, bRect.top - ph - COLLISION_GAP);
            } else if (state.lastGoodTop >= bRect.bottom) {
              candTop = Math.max(candTop, bRect.bottom + COLLISION_GAP);
            } else {
              candLeft = state.lastGoodLeft;
              candTop  = state.lastGoodTop;
            }
          }
        }
      }
    }

    candLeft = Math.min(Math.max(0, candLeft), vw - pw);
    candTop  = Math.min(Math.max(0, candTop),  vh - ph);

    state.lastGoodLeft = candLeft;
    state.lastGoodTop  = candTop;

    panel.style.left   = candLeft + 'px';
    panel.style.top    = candTop  + 'px';
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    panel.dataset.dragged = 'true';
  }

  function onPointerUp() {
    if (!state.isDragging) return;
    state.isDragging = false;

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    panel.classList.remove('panel-dragging');
    if (opts.dragClass) panel.classList.remove(opts.dragClass);
    panel.style.transition = '';

    if (state.hasMoved) {
      state.savedPosition = {
        left: panel.style.left,
        top:  panel.style.top,
      };
      panel.dataset.dragged = 'true';

      const other = opts.getOtherPanel ? opts.getOtherPanel() : null;
      resolveFinalOverlap(panel, other, COLLISION_GAP);

      _preventClick = true;
      setTimeout(() => {
        _preventClick = false;
      }, 100);
    }
  }

  handle.addEventListener('pointerdown', onPointerDown);

  // Suppress clicks on child elements if a drag just completed
  panel.addEventListener('click', (e) => {
    if (_preventClick) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      _preventClick = false;
    }
  }, true);

  // ── Returned API ──────────────────────────────────────────────────────────

  function resetPosition() {
    state.savedPosition = null;
    panel.dataset.dragged = 'false';
    panel.style.left   = '';
    panel.style.top    = '';
    panel.style.right  = '';
    panel.style.bottom = '';
    syncFloatingPanelsStack();
  }

  function restorePosition() {
    if (!state.savedPosition) {
      resetPosition();
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panel.offsetWidth || 380;
    const ph = panel.offsetHeight || 140;
    let left = parseInt(state.savedPosition.left, 10);
    let top  = parseInt(state.savedPosition.top, 10);

    left = Math.min(Math.max(0, left), vw - pw);
    top  = Math.min(Math.max(0, top),  vh - ph);

    panel.style.left   = left + 'px';
    panel.style.top    = top  + 'px';
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    panel.dataset.dragged = 'true';
  }

  // Auto-reset when panel is hidden/cancelled
  if (opts.resetOnHide) {
    const observer = new MutationObserver(() => {
      if (state.isDragging) return;
      if (isPanelHidden(panel)) {
        if (state.savedPosition || panel.dataset.dragged === 'true' || panel.style.left) {
          resetPosition();
        }
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  // Handle window resizing
  window.addEventListener('resize', () => {
    if (state.savedPosition) {
      restorePosition();
    } else {
      syncFloatingPanelsStack();
    }
  });

  return { resetPosition, restorePosition };
}
