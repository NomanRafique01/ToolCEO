const _toolFiles = new Map();
const _consumedToolIds = new Set();
let _isRestoringToolFiles = false;
let _suppressRestoreScan = true;

const DROPZONE_STATE_SELECTOR = [
  '.dz-progress-wrap', '.dz-download-wrap', '.dz-error-wrap',
  '.dz-pdf-thumb-wrap', '.dz-compress-thumb-wrap', '.dz-encrypt-thumb-wrap',
  '.dz-merge-thumb-strip', '.dz-queue-toolbar',
  '.dz-pdf-word-thumb-wrap', '.dz-pdf-excel-thumb-wrap', '.dz-pdf-html-thumb-wrap', '.dz-pdf-txt-thumb-wrap',
  '.dz-ebook-thumb-wrap', '.dz-docx-thumb-wrap', '.dz-pptx-thumb-wrap', '.dz-xlsx-thumb-wrap',
  '.dz-txt-thumb-wrap', '.dz-odt-thumb-wrap', '.dz-csv-thumb-wrap',
  '.dz-img-preview-wrap', '.dz-jpg-thumb-strip', '.dz-png-thumb-strip', '.dz-webp-thumb-strip', '.dz-svg-thumb-strip',
  '.dz-archive-thumb-strip', '.dz-extract-thumb-wrap', '.archive-extract-done-wrap',
  '.dz-arc-conv-thumb-wrap', '.dz-inspect-thumb-wrap', '.dz-split-thumb-wrap',
  '.dz-merge-arc-strip', '.dz-arc-protect-thumb-wrap', '.dz-arc-duplicate-thumb-wrap',
  '.dz-imgcmp-thumb-strip', '.dz-imgpdf-thumb-strip',
  '.dz-imgpdf-reorder-banner', '.dz-jpg-reorder-banner', '.dz-png-reorder-banner',
  '.dz-svg-reorder-banner', '.dz-webp-reorder-banner',
].join(', ');

function _cloneTool(tool) {
  if (!tool || !tool.id) return null;
  return {
    id: tool.id,
    label: tool.label,
    mainText: tool.mainText,
    subText: tool.subText,
    icon: tool.icon,
    color: tool.color,
    bg: tool.bg,
    tag: tool.tag,
    category: tool.category,
  };
}

function _fileKey(file) {
  return [
    file?.name || '',
    file?.size || 0,
    file?.lastModified || 0,
    file?.type || '',
  ].join('::');
}

function _dedupe(files) {
  const seen = new Set();
  return files.filter((file) => {
    const key = _fileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function saveToolFiles(tool, files, { mode = 'replace' } = {}) {
  if (!tool || !tool.id) return null;
  const incoming = Array.from(files || []).filter(Boolean);
  if (incoming.length === 0) return getToolFileState(tool.id);
  _consumedToolIds.delete(tool.id);

  const current = _toolFiles.get(tool.id);
  const nextFiles = mode === 'append' && current
    ? _dedupe([...current.files, ...incoming])
    : _dedupe(incoming);

  const state = {
    tool: _cloneTool(tool),
    files: nextFiles,
    dropZoneSnapshot: current?.dropZoneSnapshot || null,
    updatedAt: Date.now(),
  };
  _toolFiles.set(tool.id, state);
  return { ...state, files: state.files.slice() };
}

export function getToolFileState(toolId) {
  if (!toolId) return null;
  if (_consumedToolIds.has(toolId)) return null;
  const state = _toolFiles.get(toolId);
  if (!state) return null;
  return {
    ...state,
    files: state.files.slice(),
  };
}

export function clearToolFileState(toolId) {
  if (!toolId) return;
  _toolFiles.delete(toolId);
}

export function consumeToolFileState(toolId) {
  if (!toolId) return;
  _toolFiles.delete(toolId);
  _consumedToolIds.add(toolId);
}

export function clearAllToolFileStates() {
  _toolFiles.clear();
  _consumedToolIds.clear();
}

export function hasToolFileState(toolId) {
  const state = _toolFiles.get(toolId);
  return !!(state && state.files && state.files.length > 0);
}

export function saveToolDropZoneSnapshot(toolId, snapshot) {
  if (!toolId || !snapshot) return;
  if (_consumedToolIds.has(toolId)) return;
  const current = _toolFiles.get(toolId);
  if (!current) return;
  _toolFiles.set(toolId, {
    ...current,
    dropZoneSnapshot: {
      html: snapshot.html || '',
      classNames: Array.isArray(snapshot.classNames) ? snapshot.classNames.slice() : [],
      capturedAt: Date.now(),
    },
  });
}

export function captureToolDropZoneSnapshot(toolId, zone) {
  if (!toolId || !zone) return;
  if (_consumedToolIds.has(toolId)) return;
  const nodes = Array.from(zone.querySelectorAll(DROPZONE_STATE_SELECTOR))
    .filter((node) => !node.matches('.dz-progress-wrap, .dz-download-wrap, .dz-error-wrap'));
  if (nodes.length === 0) return;

  saveToolDropZoneSnapshot(toolId, {
    html: nodes.map((node) => node.outerHTML).join(''),
    classNames: Array.from(zone.classList).filter((name) => name.startsWith('dz-')),
  });
}

export function applyToolDropZoneSnapshot(toolId, zone) {
  const state = getToolFileState(toolId);
  const snapshot = state && state.dropZoneSnapshot;
  if (!zone || !snapshot || !snapshot.html) return false;

  zone.querySelectorAll(DROPZONE_STATE_SELECTOR).forEach((node) => node.remove());
  snapshot.classNames.forEach((name) => zone.classList.add(name));

  const template = document.createElement('template');
  template.innerHTML = snapshot.html;
  zone.appendChild(template.content.cloneNode(true));
  return true;
}

export function setRestoringToolFiles(isRestoring, { suppressScan = true } = {}) {
  _isRestoringToolFiles = isRestoring === true;
  _suppressRestoreScan = _isRestoringToolFiles ? suppressScan !== false : true;
}

export function isRestoringToolFiles() {
  return _isRestoringToolFiles;
}

export function shouldSuppressRestoreScan() {
  return _isRestoringToolFiles && _suppressRestoreScan;
}

window.toolceoFileState = {
  get: getToolFileState,
  save: saveToolFiles,
  clear: clearToolFileState,
  consume: consumeToolFileState,
  clearAll: clearAllToolFileStates,
  has: hasToolFileState,
  captureSnapshot: captureToolDropZoneSnapshot,
  applySnapshot: applyToolDropZoneSnapshot,
  saveSnapshot: saveToolDropZoneSnapshot,
  isRestoring: isRestoringToolFiles,
  shouldSuppressRestoreScan,
};
