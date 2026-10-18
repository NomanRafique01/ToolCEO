'use strict';

const { Jimp } = require('jimp');
const fs = require('fs');

async function processIcon() {
  const img = await Jimp.read('assets/New Icon.png');
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  const bgMask = new Uint8Array(w * h);
  const queue = [];

  function isBgColor(x, y) {
    const p = img.getPixelColor(x, y);
    const r = (p >> 24) & 0xff;
    const g = (p >> 16) & 0xff;
    const b = (p >> 8) & 0xff;
    const diff = Math.max(r, g, b) - Math.min(r, g, b);
    return r >= 195 && g >= 195 && b >= 195 && diff <= 22;
  }

  // Push border pixels
  for (let x = 0; x < w; x++) {
    if (isBgColor(x, 0)) { queue.push(x, 0); bgMask[x] = 1; }
    if (isBgColor(x, h - 1)) { queue.push(x, h - 1); bgMask[(h - 1) * w + x] = 1; }
  }
  for (let y = 0; y < h; y++) {
    if (isBgColor(0, y) && !bgMask[y * w]) { queue.push(0, y); bgMask[y * w] = 1; }
    if (isBgColor(w - 1, y) && !bgMask[y * w + w - 1]) { queue.push(w - 1, y); bgMask[y * w + w - 1] = 1; }
  }

  // BFS
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

  console.log(`Background pixels marked: ${queue.length / 2}`);

  // Create clean image with transparency
  const out = img.clone();

  // 1. Clear background to transparent
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bgMask[idx] === 1) {
        out.setPixelColor(0x00000000, x, y);
      }
    }
  }

  // 2. Defringe boundary pixels (pixels next to background)
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

        // If it's a transition pixel (partially white/cyan)
        if (diff < 150 && (g > 150 || b > 150)) {
          // Calculate alpha from red level (white has r=255, cyan has r=0)
          const alphaFactor = Math.max(0, Math.min(1, 1 - (r / 250)));
          const newA = Math.round(alphaFactor * 255);
          if (newA < 15) {
            out.setPixelColor(0x00000000, x, y);
          } else {
            // Remove white color cast
            const newR = Math.max(0, Math.round(r - (1 - alphaFactor) * 250));
            const newColor = ((newR & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (newA & 0xff);
            out.setPixelColor(newColor >>> 0, x, y);
          }
        }
      }
    }
  }

  // Save the transparent version
  await out.write('test_transparent.png');
  console.log('Saved test_transparent.png');

  // Now copy to all icon locations
  const pngBuffer = await out.getBuffer('image/png');
  
  const destinations = [
    'assets/icon.png',
    'assets/icon1.png',
    'frontend/assets/icon.png',
    'frontend/assets/icon1.png',
  ];

  for (const dest of destinations) {
    fs.writeFileSync(dest, pngBuffer);
    console.log(`Updated: ${dest}`);
  }

  // Generate ICO
  const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of ICO_SIZES) {
    const clone = out.clone();
    clone.resize({ w: size, h: size });
    const data = await clone.getBuffer('image/png');
    images.push({ size, data });
  }

  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

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
  fs.writeFileSync('assets/icon.ico', fullIco);
  console.log(`Generated assets/icon.ico (${fullIco.length} bytes)`);

  console.log('\n✓ All icons updated with transparent background!');
}

processIcon().catch(console.error);
