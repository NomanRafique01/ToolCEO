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
 *   - all non-progress notifications remain visible for 6 seconds
 *   - error   : persistent until manually dismissed (or 10s if autoDismiss is true)
 */

import { isRestoringToolFiles } from './fileState.js';

let _store   = [];
let _history = [];
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

export function pushNotification({ type = 'success', message = '', detail = '', autoDismiss, allowDuringRestore = false } = {}) {
  if (!allowDuringRestore && isRestoringToolFiles() && (type === 'warning' || type === 'info')) {
    return null;
  }

  // ── Deduplication: Check if an identical notification already exists ──────
  const existingIndex = _store.findIndex((n) => n.type === type && n.message === message);

  let item;
  if (existingIndex !== -1) {
    // Re-use existing item, update timestamp, move to front
    item = _store.splice(existingIndex, 1)[0];
    _clearTimer(item.id);
    item.timestamp = Date.now();
    item.read = false;
    item.autoDismiss = autoDismiss === true;
    if (detail) item.detail = detail;
    _store.unshift(item);
  } else {
    // Create new notification item
    const id = `notif-${++_counter}-${Date.now()}`;
    item = { id, type, message, detail, timestamp: Date.now(), read: false, autoDismiss: autoDismiss === true };
    _store.unshift(item);
  }

  // Update persistent history
  const hIdx = _history.findIndex((n) => n.id === item.id || (n.type === item.type && n.message === item.message));
  if (hIdx !== -1) {
    _history.splice(hIdx, 1);
  }
  _history.unshift({ ...item });
  if (_history.length > 50) _history.length = 50;

  if (_store.length > 50) {
    const removed = _store.splice(50);
    removed.forEach((r) => _clearTimer(r.id));
  }

  _emit();
  return item.id;
}

export function updateNotification(id, patch = {}) {
  const item = _store.find((n) => n.id === id);
  if (item) Object.assign(item, patch);
  const hItem = _history.find((n) => n.id === id);
  if (hItem) Object.assign(hItem, patch);
  _emit();
}

export function dismissAll() {
  _timers.forEach((tid) => clearTimeout(tid));
  _timers.clear();
  _store = [];
  _history = [];
  _emit();
}

export function dismissOne(id) {
  _clearTimer(id);
  _store = _store.filter((n) => n.id !== id);
  _emit();
}

export function removeHistoryItem(id) {
  _history = _history.filter((n) => n.id !== id);
  dismissOne(id);
}

export function markAllRead() {
  _store.forEach((n) => { n.read = true; });
  _history.forEach((n) => { n.read = true; });
  _emit();
}

export function getAll() {
  return [..._history];
}

export function getUnreadCount() {
  return _store.filter((n) => !n.read && (n.type === 'warning' || n.type === 'error' || n.type === 'success')).length;
}

export function subscribe(fn)   { _listeners.add(fn); }
export function unsubscribe(fn) { _listeners.delete(fn); }
