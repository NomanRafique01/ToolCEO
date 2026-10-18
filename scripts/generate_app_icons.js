'use strict';

/**
 * scripts/generate_app_icons.js
 * 
 * 1. Takes the master icon from assets/New Icon.png.
 * 2. Removes any solid/checkerboard white or light-gray background via BFS flood fill.
 * 3. De-fringes and softens the anti-aliased cyan edge for seamless dark/light UI blending.
 * 4. Writes the transparent master icon to:
 *    - assets/New Icon.png
 *    - assets/icon.png
 *    - assets/icon1.png
 *    - frontend/assets/icon.png
 *    - frontend/assets/icon1.png
 * 5. Generates the Windows multi-resolution ICO (16, 24, 32, 48, 64, 128, 256) with transparency.
 * 6. Generates all branded Microsoft Store / AppX / MSIX tile assets in assets/appx/.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Jimp } = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'New Icon.png');

const DESTINATIONS_PNG = [
  path.join(ROOT, 'assets', 'icon.png'),
  path.join(ROOT, 'assets', 'icon1.png'),
  path.join(ROOT, 'frontend', 'assets', 'icon.png'),
  path.join(ROOT, 'frontend', 'assets', 'icon1.png'),
];

const TARGET_ICO = path.join(ROOT, 'assets', 'icon.ico');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Remove fake white/checkerboard background and defringe edges.
 */
function makeTransparent(sourceImg) {
  const w = sourceImg.bitmap.width;
  const h = sourceImg.bitmap.height;
  const bgMask = new Uint8Array(w * h);
  const queue = [];

  function isBgColor(x, y) {
    const p = sourceImg.getPixelColor(x, y);
    const a = p & 0xff;
    if (a < 10) return true; // already transparent
    const r = (p >> 24) & 0xff;
    const g = (p >> 16) & 0xff;
    const b = (p >> 8) & 0xff;
    const diff = Math.max(r, g, b) - Math.min(r, g, b);
    return r >= 190 && g >= 190 && b >= 190 && diff <= 25;
  }

  // Push all outer border pixels
  for (let x = 0; x < w; x++) {
    if (isBgColor(x, 0)) { queue.push(x, 0); bgMask[x] = 1; }
    if (isBgColor(x, h - 1)) { queue.push(x, h - 1); bgMask[(h - 1) * w + x] = 1; }
  }
  for (let y = 0; y < h; y++) {
    if (isBgColor(0, y) && !bgMask[y * w]) { queue.push(0, y); bgMask[y * w] = 1; }
    if (isBgColor(w - 1, y) && !bgMask[y * w + w - 1]) { queue.push(w - 1, y); bgMask[y * w + w - 1] = 1; }
  }

  // BFS flood fill
  let head = 0;
  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];

    const neighbors = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const idx = ny * w + nx;
        if (!bgMask[idx] && isBgColor(nx, ny)) {
          bgMask[idx] = 1;
          queue.push(nx, ny);
        }
      }
    }
  }

  const out = sourceImg.clone();

  // 1. Clear background pixels to fully transparent
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bgMask[idx] === 1) {
        out.setPixelColor(0x00000000, x, y);
      }
    }
  }

  // 2. Defringe boundary pixels (remove white matte/halo)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bgMask[idx] === 1) continue;

      let nearBg = false;
      for (const [dx, dy] of [[1,0], [-1,0], [0,1], [0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && bgMask[ny * w + nx] === 1) {
          nearBg = true;
          break;
        }
      }

      if (nearBg) {
        const p = out.getPixelColor(x, y);
        const r = (p >> 24) & 0xff;
        const g = (p >> 16) & 0xff;
        const b = (p >> 8) & 0xff;
        const diff = Math.max(r, g, b) - Math.min(r, g, b);

        if (diff < 160 && (g > 140 || b > 140)) {
          const alphaFactor = Math.max(0, Math.min(1, 1 - (r / 250)));
          const newA = Math.round(alphaFactor * 255);
          if (newA < 15) {
            out.setPixelColor(0x00000000, x, y);
          } else {
            const newR = Math.max(0, Math.round(r - (1 - alphaFactor) * 250));
            const newColor = ((newR & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (newA & 0xff);
            out.setPixelColor(newColor >>> 0, x, y);
          }
        }
      }
    }
  }

  return out;
}

async function generateIco(sourceImg, outPath) {
  const images = [];
  for (const size of ICO_SIZES) {
    const clone = sourceImg.clone();
    clone.resize({ w: size, h: size });
    const data = await clone.getBuffer('image/png');
    images.push({ size, data });
  }

  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(images.length, 4); // count

  let offset = headerSize;
  images.forEach((img, idx) => {
    const entry = 6 + idx * 16;
    header[entry] = img.size === 256 ? 0 : img.size;
    header[entry + 1] = img.size === 256 ? 0 : img.size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(img.data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += img.data.length;
  });

  const fullIco = Buffer.concat([header, ...images.map((i) => i.data)]);
  fs.writeFileSync(outPath, fullIco);
  console.log(`[icons] ✓ Generated transparent Windows multi-res ICO: ${path.relative(ROOT, outPath)} (${fullIco.length} bytes)`);
}

async function main() {
  const srcToUse = fs.existsSync(path.join(ROOT, 'test_transparent.png'))
    ? path.join(ROOT, 'test_transparent.png')
    : SOURCE;

  if (!fs.existsSync(srcToUse)) {
    throw new Error(`Source icon not found at: ${srcToUse}`);
  }

  console.log(`[icons] Loading source icon: ${path.relative(ROOT, srcToUse)}...`);
  const rawImg = await Jimp.read(srcToUse);

  // Check if the source already has transparency (alpha < 255 on any corner pixel)
  const hasTransparency = (() => {
    const corners = [[0, 0], [rawImg.bitmap.width - 1, 0], [0, rawImg.bitmap.height - 1], [rawImg.bitmap.width - 1, rawImg.bitmap.height - 1]];
    return corners.some(([x, y]) => (rawImg.getPixelColor(x, y) & 0xff) < 10);
  })();

  let transparentImg;
  if (hasTransparency) {
    console.log(`[icons] Source already has transparent background, skipping BG removal.`);
    transparentImg = rawImg;
  } else {
    console.log(`[icons] Processing transparency & edge defringing...`);
    transparentImg = makeTransparent(rawImg);
  }

  const pngBuffer = await transparentImg.getBuffer('image/png');

  // 1. Write clean transparent PNG to all targets
  for (const dest of DESTINATIONS_PNG) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, pngBuffer);
    console.log(`[icons] ✓ Updated transparent PNG: ${path.relative(ROOT, dest)}`);
  }

  // 2. Generate multi-resolution Windows ICO
  await generateIco(transparentImg, TARGET_ICO);

  // 3. Generate Microsoft Store / MSIX / AppX visual assets
  console.log('[icons] Generating Microsoft Store / AppX visual assets from transparent icon...');
  const storeScript = path.join(ROOT, 'scripts', 'generate_store_icons.js');
  const storeResult = spawnSync(process.execPath, [storeScript], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });

  if (storeResult.status !== 0) {
    throw new Error(`Store icons generation exited with code ${storeResult.status}`);
  }

  console.log('[icons] ✓ All icons generated with 100% transparent background.');
}

main().catch((err) => {
  console.error('[icons] ❌ Error generating application icons:', err);
  process.exit(1);
});
