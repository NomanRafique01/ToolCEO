/**
 * mobileJobMirror.js
 *
 * Bridges the desktop conversion pipeline to the paired phone session.
 * mobileTransferModal registers the active QR session here; toolstate.js
 * links a jobId when a tool execution starts and unlinks it when the user
 * cancels or closes the result card. The phone then reads live progress
 * from the session status endpoint — no desktop push loop needed.
 *
 * Deliberately dependency-free so both toolstate.js and
 * mobileTransferModal.js can import it without creating cycles.
 */

let _sessionId = null;
let _sessionToolId = null;
let _linkedJobId = null;

const _backend = () => window.TOOLCEO_BACKEND_URL || 'http://127.0.0.1:8765';

export function bindMirrorSession(sessionId, toolId = null) {
  _sessionId = sessionId ? String(sessionId) : null;
  _sessionToolId = toolId ? String(toolId) : null;
  _linkedJobId = null;
}

export function unbindMirrorSession() {
  _sessionId = null;
  _sessionToolId = null;
  _linkedJobId = null;
}

function _sameTool(toolId) {
  return !_sessionToolId || !toolId || String(toolId) === _sessionToolId;
}

export function linkMirrorJob(jobId, filename = '', toolId = null) {
  if (!_sessionId || !jobId) return;
  if (!_sameTool(toolId)) return;
  const id = String(jobId);
  if (_linkedJobId === id) return;
  _linkedJobId = id;
  fetch(`${_backend()}/api/mobile/session/${_sessionId}/job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: id, filename: filename || '' }),
  }).catch(() => {});
}

export function unlinkMirrorJob(toolId = null) {
  if (!_sessionId) return;
  if (!_sameTool(toolId)) return;
  _linkedJobId = null;
  fetch(`${_backend()}/api/mobile/session/${_sessionId}/job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: null }),
  }).catch(() => {});
}
