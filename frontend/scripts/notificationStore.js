/**
 * notificationStore.js
 *
 * Central in-memory notification store for ToolCEO.
 * Unified notification state across the entire application.
 *
 * API:
 *   pushNotification({ type, message, detail?, autoDismiss? }) -> id (string)
 *   updateNotification(id, patch)                              - mutate entry
 *   dismissAll()                                               - clear all
 *   dismissOne(id)                                             - remove single entry
 *   getAll()                                                   -> Notification[]
 *   getUnreadCount()                                           -> number (success/warning/error)
 *   subscribe(fn)                                              - change listener
 *   unsubscribe(fn)
 *
 * Notification shape:
 *   { id, type, message, detail, timestamp, read }
 *   type: 'success' | 'warning' | 'error' | 'info' | 'progress'
 *
 * Auto-dismiss rules:
 *   - success : auto-remove after 8 seconds
 *   - info    : auto-remove after 5 seconds
 *   - warning : stays until manually dismissed
 *   - error   : stays until manually dismissed
 */

let _store   = [];
let _counter = 0;
const _listeners = new Set();

function _emit() {
  _listeners.forEach((fn) => {
    try { fn([..._store]); } catch (_) {}
  });
}

export function pushNotification({ type = 'success', message = '', detail = '', autoDismiss } = {}) {
  const id = `notif-${++_counter}-${Date.now()}`;
  const item = { id, type, message, detail, timestamp: Date.now(), read: false };
  
  _store.unshift(item);
  if (_store.length > 50) _store.length = 50;

  // Determine auto-dismiss behavior
  const shouldAutoDismiss = autoDismiss !== undefined 
    ? autoDismiss 
    : (type === 'success' || type === 'info');

  if (shouldAutoDismiss) {
    const ttl = type === 'info' ? 5000 : 8000;
    setTimeout(() => {
      dismissOne(id);
    }, ttl);
  }

  _emit();
  return id;
}

export function updateNotification(id, patch = {}) {
  const item = _store.find((n) => n.id === id);
  if (!item) return;
  Object.assign(item, patch);
  _emit();
}

export function dismissAll() {
  _store = [];
  _emit();
}

export function dismissOne(id) {
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
  // Only increment badge for warning, error, and success notifications
  return _store.filter((n) => !n.read && (n.type === 'warning' || n.type === 'error' || n.type === 'success')).length;
}

export function subscribe(fn)   { _listeners.add(fn); }
export function unsubscribe(fn) { _listeners.delete(fn); }
