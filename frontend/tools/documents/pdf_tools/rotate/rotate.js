/**
 * tools/documents/pdf_tools/rotate/rotate.js
 *
 * Owns the Rotate Pages view swap, PDF.js thumbnail rendering, rotation state,
 * and frontend save request.
 */

import { pushNotification } from '../../../../scripts/notificationStore.js';

const BACKEND = 'http://127.0.0.1:8000';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const THUMBNAIL_SCALE = 0.4;

let _fileInput = null;
let _selectedFile = null;
let _pdfDoc = null;
let _rotations = [];
let _renderToken = 0;

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _isPdfFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf';
}

function _baseName(filename) {
  return String(filename || 'document').replace(/\.[^.]+$/, '');
}

function _ensureFileInput() {
  if (_fileInput) return _fileInput;
  _fileInput = document.createElement('input');
  _fileInput.type = 'file';
  _fileInput.accept = '.pdf,application/pdf';
  _fileInput.style.display = 'none';
  document.body.appendChild(_fileInput);
  return _fileInput;
}

function _ensurePdfJs() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return Promise.resolve(window.pdfjsLib);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PDFJS_URL}"]`);
    const script = existing || document.createElement('script');

    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error('PDF.js did not initialize.'));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Could not load PDF.js.'));

    if (!existing) {
      script.src = PDFJS_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function _downloadBase64Pdf(base64, filename) {
  if (window.toolceo && window.toolceo.saveFileAs) {
    return window.toolceo.saveFileAs(filename, base64);
  }

  const bytes = atob(base64);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    const slice = bytes.slice(i, i + 8192);
    const arr = new Uint8Array(slice.length);
    for (let j = 0; j < slice.length; j += 1) arr[j] = slice.charCodeAt(j);
    chunks.push(arr);
  }

  const blob = new Blob(chunks, { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return Promise.resolve(true);
}

function _getSwapParts(container) {
  const swap = container.querySelector('#pdf-tools-swap');
  const cardView = container.querySelector('#pdf-tools-card-view');
  let viewer = container.querySelector('#rotate-viewer');

  if (swap && !viewer) {
    viewer = document.createElement('div');
    viewer.id = 'rotate-viewer';
    viewer.className = 'rotate-viewer';
    viewer.innerHTML = `
      <div class="rotate-topbar">
        <button class="rotate-back-btn" type="button" title="Back to PDF tools">
          <span aria-hidden="true">&larr;</span>
          <span>Back</span>
        </button>
        <div class="rotate-file-meta">
          <span class="rotate-file-name">No PDF selected</span>
          <span class="rotate-page-count">0 pages</span>
        </div>
        <div class="rotate-actions">
          <button class="rotate-action-btn" type="button" data-rotate-all="left">Rotate All Left &#8634;</button>
          <button class="rotate-action-btn" type="button" data-rotate-all="right">Rotate All Right &#8635;</button>
          <button class="rotate-action-btn rotate-save-btn" type="button">Apply &amp; Save</button>
        </div>
      </div>
      <div class="rotate-grid" role="list"></div>`;
    swap.appendChild(viewer);

    viewer.querySelector('.rotate-back-btn').addEventListener('click', () => _closeViewer(container));
    viewer.querySelector('[data-rotate-all="left"]').addEventListener('click', () => _rotateAll(-90, viewer));
    viewer.querySelector('[data-rotate-all="right"]').addEventListener('click', () => _rotateAll(90, viewer));
    viewer.querySelector('.rotate-save-btn').addEventListener('click', () => _applyAndSave(viewer));
  }

  return { swap, cardView, viewer };
}

function _showViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  cardView.style.opacity = '0';
  cardView.style.transform = 'translateY(8px)';
  setTimeout(() => {
    cardView.classList.add('rotate-hidden');
    viewer.classList.add('rotate-viewer--visible');
  }, 300);
}

function _closeViewer(container) {
  const { cardView, viewer } = _getSwapParts(container);
  if (!cardView || !viewer) return;

  _renderToken += 1;
  _selectedFile = null;
  _pdfDoc = null;
  _rotations = [];

  viewer.classList.remove('rotate-viewer--visible');
  cardView.classList.remove('rotate-hidden');
  requestAnimationFrame(() => {
    cardView.style.opacity = '1';
    cardView.style.transform = 'translateY(0)';
  });
}

function _showLoading(viewer, file) {
  viewer.querySelector('.rotate-file-name').textContent = file.name;
  viewer.querySelector('.rotate-page-count').textContent = 'Loading pages...';
  viewer.querySelector('.rotate-grid').innerHTML = `
    <div class="rotate-empty-state">Preparing PDF preview...</div>`;
}

function _buildPageCards(viewer, pageCount) {
  const grid = viewer.querySelector('.rotate-grid');
  grid.innerHTML = '';

  for (let i = 0; i < pageCount; i += 1) {
    const pageNumber = i + 1;
    const card = document.createElement('div');
    card.className = 'rotate-page-card';
    card.dataset.pageIndex = String(i);
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="rotate-thumb-stage">
        <div class="rotate-thumb-skeleton" aria-hidden="true"></div>
        <span class="rotate-badge"></span>
      </div>
      <div class="rotate-page-number">Page ${pageNumber}</div>
      <div class="rotate-page-actions">
        <button class="rotate-page-btn" type="button" title="Rotate page ${pageNumber} left" aria-label="Rotate page ${pageNumber} left">&#8634;</button>
        <button class="rotate-page-btn" type="button" title="Rotate page ${pageNumber} right" aria-label="Rotate page ${pageNumber} right">&#8635;</button>
      </div>`;

    const [leftBtn, rightBtn] = card.querySelectorAll('.rotate-page-btn');
    leftBtn.addEventListener('click', () => _rotatePage(i, -90, viewer));
    rightBtn.addEventListener('click', () => _rotatePage(i, 90, viewer));
    grid.appendChild(card);
  }
}

function _updatePageRotation(viewer, index) {
  const card = viewer.querySelector(`.rotate-page-card[data-page-index="${index}"]`);
  if (!card) return;

  const rotation = _rotations[index] || 0;
  const canvas = card.querySelector('canvas');
  const badge = card.querySelector('.rotate-badge');

  if (canvas) canvas.style.transform = `rotate(${rotation}deg)`;
  if (badge) {
    badge.textContent = `${rotation}deg`;
    badge.classList.toggle('rotate-badge--visible', rotation !== 0);
  }
}

function _rotatePage(index, delta, viewer) {
  _rotations[index] = ((_rotations[index] || 0) + delta + 360) % 360;
  _updatePageRotation(viewer, index);
}

function _rotateAll(delta, viewer) {
  _rotations = _rotations.map((value) => (value + delta + 360) % 360);
  _rotations.forEach((_, index) => _updatePageRotation(viewer, index));
}

async function _renderPage(pdfDoc, pageNumber, viewer, token) {
  const page = await pdfDoc.getPage(pageNumber);
  if (token !== _renderToken) return;

  const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  if (token !== _renderToken) return;

  const card = viewer.querySelector(`.rotate-page-card[data-page-index="${pageNumber - 1}"]`);
  const stage = card && card.querySelector('.rotate-thumb-stage');
  if (!stage) return;

  const skeleton = stage.querySelector('.rotate-thumb-skeleton');
  if (skeleton) skeleton.remove();
  stage.insertBefore(canvas, stage.querySelector('.rotate-badge'));
  _updatePageRotation(viewer, pageNumber - 1);
}

async function _loadPdfIntoViewer(container, file) {
  const { viewer } = _getSwapParts(container);
  if (!viewer) return;

  _selectedFile = file;
  _pdfDoc = null;
  _rotations = [];
  _renderToken += 1;
  const token = _renderToken;

  _showViewer(container);
  _showLoading(viewer, file);

  try {
    const pdfjsLib = await _ensurePdfJs();
    const buffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
    if (token !== _renderToken) return;

    _pdfDoc = pdfDoc;
    _rotations = Array(pdfDoc.numPages).fill(0);
    viewer.querySelector('.rotate-file-name').textContent = file.name;
    viewer.querySelector('.rotate-page-count').textContent = `${pdfDoc.numPages} page${pdfDoc.numPages === 1 ? '' : 's'}`;
    _buildPageCards(viewer, pdfDoc.numPages);

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      _renderPage(pdfDoc, pageNumber, viewer, token).catch(() => {
        const card = viewer.querySelector(`.rotate-page-card[data-page-index="${pageNumber - 1}"]`);
        const stage = card && card.querySelector('.rotate-thumb-stage');
        if (stage) stage.innerHTML = '<span class="rotate-empty-state">Preview failed</span>';
      });
    }
  } catch (err) {
    viewer.querySelector('.rotate-grid').innerHTML = `
      <div class="rotate-empty-state">Could not preview this PDF.</div>`;
    pushNotification({
      type: 'error',
      message: 'Could not read PDF',
      detail: err.message || 'Preview failed.',
    });
  }
}

async function _applyAndSave(viewer) {
  if (!_selectedFile || !_rotations.length) return;

  const btn = viewer.querySelector('.rotate-save-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const file = await _fileToBase64(_selectedFile);
    const res = await fetch(`${BACKEND}/api/rotate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, rotations: _rotations }),
    });
    const json = await res.json();
    if (!res.ok) {
      const detail = json.detail;
      throw new Error(typeof detail === 'string' ? detail : `Server error ${res.status}`);
    }

    const output = json.file || json.output || json.pdf || json.data;
    if (!output) throw new Error('Backend did not return a PDF.');

    const filename = `rotated_${_baseName(_selectedFile.name)}.pdf`;
    const saved = await _downloadBase64Pdf(output, filename);
    if (saved) {
      pushNotification({
        type: 'success',
        message: 'PDF Rotated',
        detail: filename,
      });
    }
  } catch (err) {
    pushNotification({
      type: 'error',
      message: 'Rotate failed',
      detail: err.message || 'Unable to save rotated PDF.',
    });
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

export function openRotateFilePicker(container, tool) {
  const input = _ensureFileInput();
  input.value = '';
  input.onchange = () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    if (!_isPdfFile(file)) {
      pushNotification({
        type: 'warning',
        message: 'Invalid File Format. Please select a valid PDF file.',
      });
      return;
    }

    _loadPdfIntoViewer(container, file);
  };

  input.click();
}
