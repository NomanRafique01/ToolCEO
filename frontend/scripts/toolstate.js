/**
 * toolstate.js
 * Central store for the currently-selected tool/conversion.
 * Drop zone reads from here; fmt-card and tool-card clicks write to it.
 */

/** @type {{ id: string, label: string, mainText: string, subText: string } | null} */
let _activeTool = null;

/** Listeners called when the active tool changes. */
const _listeners = [];

/**
 * Set the active tool and notify all listeners.
 * @param {{ id: string, label: string, mainText: string, subText: string } | null} tool
 */
export function setActiveTool(tool) {
  _activeTool = tool;
  _listeners.forEach((fn) => fn(tool));
}

/** @returns {{ id: string, label: string, mainText: string, subText: string } | null} */
export function getActiveTool() {
  return _activeTool;
}

/** @param {(tool: object | null) => void} fn */
export function onToolChange(fn) {
  _listeners.push(fn);
}
