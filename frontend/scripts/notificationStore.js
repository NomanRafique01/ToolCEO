/**
 * notificationStore.js
 *
 * Central in-memory notification store for ToolCEO.
 * Unified notification state with deduplication and auto-dismiss.
 *
 * API:
 *   pushNotification({ type, message, detail?, autoDismiss? }) -> id (string)
 *   updateNotification(id, patch)                              - mutate entry
 *   dismissAll()                                               - clear all
 *   dismissOne(id)                                             - remove single entry
 *   getAll()                                                   -> Notification[]
 *   getUnreadCount()                                           -> number (warning/error/success)
 *   subscribe(fn)                                              - change listener
 *   unsubscribe(fn)
 *
 * Notification shape:
 *   { id, type, message, detail, timestamp, read }
 *   type: 'success' | 'warning' | 'error' | 'info' | 'progress'
 *
 * Deduplication & Auto-dismiss rules:
 *   - Duplicate messages of same type refresh timestamp & timer instead of creating new pills
 *   - warning : auto-dismiss after 4 seconds (4000ms)
 *   - success : auto-dismiss after 8 seconds (8000ms)
 *   - info    : auto-dismiss after 5 seconds (5000ms)
 *   - error   : persistent until manually dismissed (or 10s if autoDismiss is true)
 */

let _store   = [];
let _counter = 0;
const _listeners = new Set();
const _timers   = new Map();

function _emit() {
  _listeners.forEach((fn) => {
    try { fn([..._store]); } catch (_) {}
  });
}

function _clearTimer(id) {
  if (_timers.has(id)) {
    clearTimeout(_timers.get(id));
    _timers.delete(id);
  }
}

export function pushNotification({ type = 'success', message = '', detail = '', autoDismiss } = {}) {
  // ── Deduplication: Check if an identical notification already exists ──────
  const existingIndex = _store.findIndex((n) => n.type === type && n.message === message);

  let item;
  if (existingIndex !== -1) {
    // Re-use existing item, update timestamp, move to front
    item = _store.splice(existingIndex, 1)[0];
    _clearTimer(item.id);
    item.timestamp = Date.now();
    item.read = false;
    if (detail) item.detail = detail;
    _store.unshift(item);
  } else {
    // Create new notification item
    const id = `notif-${++_counter}-${Date.now()}`;
    item = { id, type, message, detail, timestamp: Date.now(), read: false };
    _store.unshift(item);
  }

  if (_store.length > 50) {
    const removed = _store.splice(50);
    removed.forEach((r) => _clearTimer(r.id));
  }

  // ── Auto-dismiss scheduling ────────────────────────────────────────────────
  // Success & Info pills auto-dismiss after 4s via CSS countdown animation.
  // Warning & Error pills stay until manually dismissed by user.
  const shouldAutoDismiss = autoDismiss !== undefined 
    ? autoDismiss 
    : (type === 'success' || type === 'info');

  if (shouldAutoDismiss) {
    const ttl = 4800; // JS fallback buffer (CSS animationend fires at 4000ms)
    const tid = setTimeout(() => {
      dismissOne(item.id);
    }, ttl);
    _timers.set(item.id, tid);
  }

  _emit();
  return item.id;
}

export function updateNotification(id, patch = {}) {
  const item = _store.find((n) => n.id === id);
  if (!item) return;
  Object.assign(item, patch);
  _emit();
}

export function dismissAll() {
  _timers.forEach((tid) => clearTimeout(tid));
  _timers.clear();
  _store = [];
  _emit();
}

export function dismissOne(id) {
  _clearTimer(id);
  _store = _store.filter((n) => n.id !== id);
  _emit();
}

export function markAllRead() {
  _store.forEach((n) => { n.read = true; });
  _emit();
}

export function getAll() {
  return [..._store];
}

export function getUnreadCount() {
  return _store.filter((n) => !n.read && (n.type === 'warning' || n.type === 'error' || n.type === 'success')).length;
}

export function subscribe(fn)   { _listeners.add(fn); }
export function unsubscribe(fn) { _listeners.delete(fn); }
