/**
 * tools/shared/pptxThumb.js
 *
 * Pure-browser PPTX first-slide thumbnail extractor.
 * No dependencies — reads the ZIP central directory from a File/Blob ArrayBuffer.
 *
 * A .pptx file is a ZIP archive.  PowerPoint and LibreOffice both embed a
 * pre-rendered thumbnail at:
 *   docProps/thumbnail.jpeg  (most common, PowerPoint 2007+)
 *   docProps/thumbnail.png
 *   ppt/slides/thumbnails/thumbnail.jpeg  (older path)
 *
 * Strategy: parse the End-of-Central-Directory record → walk the central
 * directory entries (which always have correct compressed/uncompressed sizes,
 * unlike local file headers that may have zeros when data-descriptor is used)
 * → locate the thumbnail entry → read & decompress → base64 data-URI.
 *
 * Exports:
 *   getPptxThumbnail(file)  → Promise<string|null>  (data-URI or null)
 */

/** Candidate thumbnail paths inside a PPTX ZIP, in priority order. */
const _THUMB_PATHS = [
  'docProps/thumbnail.jpeg',
  'docProps/thumbnail.jpg',
  'docProps/thumbnail.png',
  'docProps/thumbnail.wmf',
  'ppt/slides/thumbnails/thumbnail.jpeg',
  'ppt/slides/thumbnails/thumbnail.jpg',
  'ppt/slides/thumbnails/thumbnail.png',
];

function _u16le(dv, off) { return dv.getUint16(off, true); }
function _u32le(dv, off) { return dv.getUint32(off, true); }

/**
 * Find the End-of-Central-Directory record (EOCD).
 * Signature: 0x06054b50.  It sits at (fileSize - 22) for ZIPs with no comment,
 * but scan backwards up to 65535+22 bytes to handle ZIPs with a comment.
 */
function _findEocd(dv, len) {
  const SIG = 0x06054b50;
  const maxSearch = Math.min(len, 65535 + 22);
  for (let i = len - 22; i >= len - maxSearch; i--) {
    if (_u32le(dv, i) === SIG) return i;
  }
  return -1;
}

/**
 * Extract the first-slide thumbnail from a PPTX File/Blob.
 * @param  {File|Blob} file
 * @returns {Promise<string|null>}  base64 data-URI or null
 */
export async function getPptxThumbnail(file) {
  let buffer;
  try { buffer = await file.arrayBuffer(); } catch { return null; }

  const dv  = new DataView(buffer);
  const u8  = new Uint8Array(buffer);
  const len = u8.length;

  // ── 1. Find EOCD ────────────────────────────────────────────────────────────
  const eocdOff = _findEocd(dv, len);
  if (eocdOff < 0) return null;

  const cdCount  = _u16le(dv, eocdOff + 8);   // number of central-dir entries
  const cdSize   = _u32le(dv, eocdOff + 12);  // size of central directory
  const cdOffset = _u32le(dv, eocdOff + 16);  // offset of central directory

  if (cdOffset + cdSize > len) return null;

  // ── 2. Walk central directory ────────────────────────────────────────────────
  const CD_SIG = 0x02014b50;
  let   cdPos  = cdOffset;
  let   best   = null;            // { localHeaderOff, compressedSize, method, name }
  let   bestPriority = _THUMB_PATHS.length;

  for (let i = 0; i < cdCount; i++) {
    if (cdPos + 46 > len) break;
    if (_u32le(dv, cdPos) !== CD_SIG) break;

    const method       = _u16le(dv, cdPos + 10);
    const compSize     = _u32le(dv, cdPos + 20);
    const nameLen      = _u16le(dv, cdPos + 28);
    const extraLen     = _u16le(dv, cdPos + 30);
    const commentLen   = _u16le(dv, cdPos + 32);
    const localHdrOff  = _u32le(dv, cdPos + 42);

    if (cdPos + 46 + nameLen > len) break;

    const nameBytes = u8.slice(cdPos + 46, cdPos + 46 + nameLen);
    let name = '';
    try { name = new TextDecoder('utf-8').decode(nameBytes); } catch { name = ''; }

    // Check against priority list (case-insensitive)
    const nameLower = name.replace(/\\/g, '/');
    const pri = _THUMB_PATHS.findIndex(
      (p) => p.toLowerCase() === nameLower.toLowerCase()
    );

    if (pri !== -1 && pri < bestPriority) {
      bestPriority = pri;
      best = { localHeaderOff: localHdrOff, compressedSize: compSize, method, name };
    }

    // Also catch any thumbnail we may have missed in the list
    if (pri === -1 && best === null) {
      const nl = nameLower.toLowerCase();
      if (
        (nl.startsWith('docprops/thumbnail') || nl.includes('thumbnails/thumbnail')) &&
        (nl.endsWith('.jpeg') || nl.endsWith('.jpg') || nl.endsWith('.png'))
      ) {
        best = { localHeaderOff: localHdrOff, compressedSize: compSize, method, name };
        bestPriority = _THUMB_PATHS.length - 1;
      }
    }

    cdPos += 46 + nameLen + extraLen + commentLen;
  }

  if (!best) return null;

  // ── 3. Read actual data from local file header ───────────────────────────────
  const lh = best.localHeaderOff;
  if (lh + 30 > len) return null;
  if (_u32le(dv, lh) !== 0x04034b50) return null;   // local header signature

  const lhNameLen  = _u16le(dv, lh + 26);
  const lhExtraLen = _u16le(dv, lh + 28);
  const dataStart  = lh + 30 + lhNameLen + lhExtraLen;
  const dataEnd    = dataStart + best.compressedSize;

  if (dataEnd > len) return null;

  const compBytes = u8.slice(dataStart, dataEnd);

  // ── 4. Decompress if needed ─────────────────────────────────────────────────
  let raw;
  if (best.method === 0) {
    // Stored — no compression
    raw = compBytes;
  } else if (best.method === 8) {
    // DEFLATE — use native DecompressionStream
    try {
      const ds     = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();
      writer.write(compBytes);
      writer.close();
      const chunks = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      raw = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { raw.set(c, off); off += c.length; }
    } catch {
      return null;
    }
  } else {
    return null; // unsupported compression
  }

  // ── 5. Build data-URI ───────────────────────────────────────────────────────
  const nameLower = best.name.toLowerCase();
  const mime = nameLower.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < raw.length; i += CHUNK) {
    binary += String.fromCharCode(...raw.subarray(i, i + CHUNK));
  }
  try {
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
