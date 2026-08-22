'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.join(__dirname, '..');
const sourcePath = path.join(rootDir, 'assets', 'fileimage.png');
const iconsDir = path.join(rootDir, 'assets', 'icons');
const resourcesDir = path.join(rootDir, 'resources');

const icoPath = path.join(iconsDir, 'fileicon.ico');
const pngPath = path.join(iconsDir, 'fileicon.png');
const icnsPath = path.join(iconsDir, 'fileicon.icns');
const resourceIcoPath = path.join(resourcesDir, 'tceo-file-icon.ico');
const resourcePngPath = path.join(resourcesDir, 'tceo-file-icon.png');
const resourceIcnsPath = path.join(resourcesDir, 'tceo-file-icon.icns');

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icnsChunks = [
  ['ic04', 16],
  ['ic05', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];

function writeUInt32BE(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

async function renderPng(size) {
  return sharp(sourcePath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function writeIco(targetPath) {
  const images = await Promise.all(icoSizes.map(async (size) => ({ size, data: await renderPng(size) })));
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = image.size === 256 ? 0 : image.size;
    header[entry + 1] = image.size === 256 ? 0 : image.size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  fs.writeFileSync(targetPath, Buffer.concat([header, ...images.map((image) => image.data)]));
}

async function writeIcns(targetPath) {
  const chunks = await Promise.all(icnsChunks.map(async ([type, size]) => {
    const data = await renderPng(size);
    return Buffer.concat([Buffer.from(type, 'ascii'), writeUInt32BE(data.length + 8), data]);
  }));
  const totalSize = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  fs.writeFileSync(targetPath, Buffer.concat([Buffer.from('icns', 'ascii'), writeUInt32BE(totalSize), ...chunks]));
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source icon: ${sourcePath}`);
  }

  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  await writeIco(icoPath);
  await sharp(sourcePath)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(pngPath);
  await writeIcns(icnsPath);

  fs.copyFileSync(icoPath, resourceIcoPath);
  fs.copyFileSync(pngPath, resourcePngPath);
  fs.copyFileSync(icnsPath, resourceIcnsPath);

  console.log(`Generated ${path.relative(rootDir, icoPath)}`);
  console.log(`Generated ${path.relative(rootDir, pngPath)}`);
  console.log(`Generated ${path.relative(rootDir, icnsPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
