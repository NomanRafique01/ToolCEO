/**
 * frontend/tools/shared/pdfRenderer.js
 *
 * High-performance, standalone offline PDF rendering engine.
 * Renders PDF pages, thumbnails, page grids, and page info 100% locally
 * in the browser without relying on an active backend or internet connection.
 */

let pdfJsPromise = null;

/**
 * Resolves the relative vendor URL reliably across file:// and http:// origins.
 */
function resolveVendorUrl(relativePath) {
  try {
    return new URL(relativePath, document.baseURI).href;
  } catch {
    return relativePath;
  }
}

/**
 * Ensures PDF.js vendor library and worker are loaded and configured offline.
 */
export async function ensurePdfJs() {
  const workerUrl = resolveVendorUrl('vendor/pdfjs/pdf.worker.min.js');

  if (window.pdfjsLib) {
    if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    return window.pdfjsLib;
  }

  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = new Promise((resolve, reject) => {
    const pdfJsUrl = resolveVendorUrl('vendor/pdfjs/pdf.min.js');

    let script = document.querySelector(`script[src*="pdf.min.js"]`);

    if (script && window.pdfjsLib) {
      if (window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      resolve(window.pdfjsLib);
      return;
    }

    if (!script) {
      script = document.createElement('script');
      script.src = pdfJsUrl;
      script.async = false;
      document.head.appendChild(script);
    }

    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts += 1;
      if (window.pdfjsLib) {
        clearInterval(checkInterval);
        if (window.pdfjsLib.GlobalWorkerOptions) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        }
        resolve(window.pdfjsLib);
      } else if (attempts > 300) {
        clearInterval(checkInterval);
        reject(new Error('Offline PDF.js library loading timed out.'));
      }
    }, 25);
  });

  return pdfJsPromise;
}

/**
 * Parses a PDF File, Blob, or ArrayBuffer offline into a PDF.js Document object.
 * @param {File|Blob|ArrayBuffer|Uint8Array} fileOrBuffer
 * @returns {Promise<any>} pdfDoc
 */
export async function loadPdfDocument(fileOrBuffer) {
  const pdfjsLib = await ensurePdfJs();
  let buffer;

  if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = fileOrBuffer;
  } else if (fileOrBuffer instanceof Uint8Array) {
    buffer = fileOrBuffer.buffer;
  } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
    buffer = await fileOrBuffer.arrayBuffer();
  } else {
    throw new Error('Unsupported PDF data format provided.');
  }

  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    cMapPacked: true,
    disableFontFace: false,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  return pdfDoc;
}

/**
 * Renders a PDF page (or document page number) onto a HTML5 Canvas element.
 * @param {any} pdfDocOrPage
 * @param {number|object} [pageNumOrOpts=1]
 * @param {HTMLCanvasElement} [targetCanvas]
 * @param {object} [options={}]
 */
export async function renderPdfPageToCanvas(pdfDocOrPage, pageNumOrOpts = 1, targetCanvas = null, options = {}) {
  let page;
  let renderOpts = options;
  let canvas = targetCanvas;

  if (typeof pdfDocOrPage.getPage === 'function') {
    const pageNum = typeof pageNumOrOpts === 'number' ? pageNumOrOpts : (renderOpts.pageNumber || 1);
    page = await pdfDocOrPage.getPage(pageNum);
  } else {
    page = pdfDocOrPage;
    if (pageNumOrOpts && typeof pageNumOrOpts === 'object' && !(pageNumOrOpts instanceof HTMLCanvasElement)) {
      renderOpts = pageNumOrOpts;
    }
  }

  if (pageNumOrOpts instanceof HTMLCanvasElement) {
    canvas = pageNumOrOpts;
  }

  if (!canvas) {
    canvas = document.createElement('canvas');
  }

  const scale = renderOpts.scale || 1.0;
  const rotation = renderOpts.rotation || 0;
  const viewport = page.getViewport({ scale, rotation });

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  return canvas;
}

/**
 * Renders a PDF page to a base64 Data URI string offline.
 * @param {any} pdfDocOrPage
 * @param {number|object} [pageNumOrScale=1.0]
 * @param {number} [scale=1.0]
 * @param {string} [format='image/jpeg']
 * @param {number} [quality=0.9]
 */
export async function renderPdfPageToDataUri(pdfDocOrPage, pageNumOrScale = 1.0, scale = 1.0, format = 'image/jpeg', quality = 0.9) {
  let page;
  let targetScale = scale;

  if (typeof pdfDocOrPage.getPage === 'function') {
    const pageNum = typeof pageNumOrScale === 'number' ? pageNumOrScale : 1;
    page = await pdfDocOrPage.getPage(pageNum);
  } else {
    page = pdfDocOrPage;
    targetScale = typeof pageNumOrScale === 'number' ? pageNumOrScale : 1.0;
  }

  const canvas = document.createElement('canvas');
  await renderPdfPageToCanvas(page, { scale: targetScale }, canvas);
  return canvas.toDataURL(format, quality);
}

/**
 * Extracts page count, page 1 dimensions, and page 1 thumbnail 100% offline.
 * @param {File|Blob|ArrayBuffer} fileOrBuffer
 * @param {number} [maxThumbScale=0.5]
 */
export async function getOfflinePdfInfo(fileOrBuffer, maxThumbScale = 0.5) {
  const pdfDoc = await loadPdfDocument(fileOrBuffer);
  const pageCount = pdfDoc.numPages;
  const page1 = await pdfDoc.getPage(1);
  const vp = page1.getViewport({ scale: 1.0 });

  const thumbScale = Math.min(maxThumbScale, 450 / Math.max(vp.width, vp.height, 1));
  const thumbnail = await renderPdfPageToDataUri(page1, thumbScale);

  return {
    pageCount,
    width: Math.round(vp.width),
    height: Math.round(vp.height),
    thumbnail,
    pdfDoc
  };
}

/**
 * Batch renders all pages of a PDF document with concurrency throttling and callback.
 * @param {any} pdfDoc
 * @param {Function} onPageRendered - (pageNum, canvas, dataUri, viewport) => void
 * @param {object} [options] - { scale: 1.0, batchSize: 4, token: any, isCancelled: () => boolean }
 */
export async function renderAllPageThumbnails(pdfDoc, onPageRendered, options = {}) {
  if (!pdfDoc) return;
  const numPages = pdfDoc.numPages;
  const scale = options.scale || 1.0;
  const batchSize = options.batchSize || 3;
  const isCancelled = options.isCancelled || (() => false);

  for (let i = 1; i <= numPages; i += batchSize) {
    if (isCancelled()) break;
    const batch = [];
    for (let p = i; p < i + batchSize && p <= numPages; p += 1) {
      batch.push(
        (async (pageNum) => {
          if (isCancelled()) return;
          try {
            const page = await pdfDoc.getPage(pageNum);
            if (isCancelled()) return;
            const canvas = document.createElement('canvas');
            await renderPdfPageToCanvas(page, { scale }, canvas);
            if (isCancelled()) return;
            const dataUri = canvas.toDataURL('image/jpeg', 0.88);
            if (isCancelled()) return;
            if (typeof onPageRendered === 'function') {
              onPageRendered(pageNum, canvas, dataUri, page.getViewport({ scale }));
            }
          } catch (err) {
            console.warn(`Failed rendering thumbnail for page ${pageNum}:`, err);
            if (typeof onPageRendered === 'function') {
              onPageRendered(pageNum, null, null, null, err);
            }
          }
        })(p)
      );
    }
    await Promise.all(batch);
  }
}
