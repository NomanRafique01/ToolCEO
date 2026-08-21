/**
 * notificationStore.js
 *
 * Central in-memory notification store for ToolCEO.
 * No external dependencies — pure vanilla JS module.
 *
 * API:
 *   pushNotification({ type, message, detail? })  -> id (string)
 *   updateNotification(id, patch)                  - mutate an existing entry
 *   dismissAll()                                   - clear everything
 *   dismissOne(id)                                 - remove a single entry
 *   getAll()                                       -> Notification[]
 *   getUnreadCount()                               -> number
 *   subscribe(fn)                                  - called on every change
 *   unsubscribe(fn)
 *
 * Notification shape:
 *   { id, type, message, detail, timestamp, read }
 *   type: 'success' | 'error' | 'warning' | 'progress'
 */

let _store   = [];
let _counter = 0;
const _listeners = new Set();

function _emit() {
  _listeners.forEach((fn) => {
    try { fn([..._store]); } catch (_) {}
  });
}

export function pushNotification({ type = 'success', message = '', detail = '' } = {}) {
  const id = `notif-${++_counter}-${Date.now()}`;
  _store.unshift({ id, type, message, detail, timestamp: Date.now(), read: false });
  if (_store.length > 50) _store.length = 50;
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

export function getAll()         { return [..._store]; }
export function getUnreadCount() { return _store.filter((n) => !n.read).length; }
export function subscribe(fn)    { _listeners.add(fn); }
export function unsubscribe(fn)  { _listeners.delete(fn); }
