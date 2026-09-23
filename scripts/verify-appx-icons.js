'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { Jimp } = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const EXPECTED_MANIFEST_REFS = [
  'assets\\StoreLogo.png',
  'assets\\AppList.png',
  'assets\\MedTile.png',
  'assets\\SmallTile.png',
  'assets\\WideTile.png',
  'assets\\LargeTile.png',
];

const EXPECTED_IMAGES = [
  ['assets/StoreLogo.png', 50, 50],
  ['assets/StoreLogo.scale-100.png', 50, 50],
  ['assets/StoreLogo.scale-125.png', 63, 63],
  ['assets/StoreLogo.scale-150.png', 75, 75],
  ['assets/StoreLogo.scale-200.png', 100, 100],
  ['assets/StoreLogo.scale-400.png', 200, 200],
  ['assets/AppList.png', 44, 44],
  ['assets/AppList.scale-100.png', 44, 44],
  ['assets/AppList.scale-125.png', 55, 55],
  ['assets/AppList.scale-150.png', 66, 66],
  ['assets/AppList.scale-200.png', 88, 88],
  ['assets/AppList.scale-400.png', 176, 176],
  ['assets/SmallTile.scale-100.png', 71, 71],
  ['assets/SmallTile.scale-125.png', 89, 89],
  ['assets/SmallTile.scale-150.png', 107, 107],
  ['assets/SmallTile.scale-200.png', 142, 142],
  ['assets/SmallTile.scale-400.png', 284, 284],
  ['assets/MedTile.scale-100.png', 150, 150],
  ['assets/MedTile.scale-125.png', 188, 188],
  ['assets/MedTile.scale-150.png', 225, 225],
  ['assets/MedTile.scale-200.png', 300, 300],
  ['assets/MedTile.scale-400.png', 600, 600],
  ['assets/WideTile.scale-100.png', 310, 150],
  ['assets/WideTile.scale-125.png', 388, 188],
  ['assets/WideTile.scale-150.png', 465, 225],
  ['assets/WideTile.scale-200.png', 620, 300],
  ['assets/WideTile.scale-400.png', 1240, 600],
  ['assets/LargeTile.scale-100.png', 310, 310],
  ['assets/LargeTile.scale-125.png', 388, 388],
  ['assets/LargeTile.scale-150.png', 465, 465],
  ['assets/LargeTile.scale-200.png', 620, 620],
  ['assets/LargeTile.scale-400.png', 1240, 1240],
];

const TARGET_SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256];

for (const size of TARGET_SIZES) {
  EXPECTED_IMAGES.push([`assets/AppList.targetsize-${size}.png`, size, size]);
  EXPECTED_IMAGES.push([`assets/AppList.targetsize-${size}_altform-unplated.png`, size, size]);
  EXPECTED_IMAGES.push([`assets/AppList.targetsize-${size}_altform-lightunplated.png`, size, size]);
}

function findAppx() {
  const requested = process.argv[2];
  if (requested) {
    const fullPath = path.resolve(requested);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`APPX file not found: ${fullPath}`);
    }
    return fullPath;
  }

  const appxFiles = fs
    .readdirSync(DIST)
    .filter((name) => name.toLowerCase().endsWith('.appx'))
    .map((name) => path.join(DIST, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (appxFiles.length === 0) {
    throw new Error(`No .appx file found in ${DIST}`);
  }

  return appxFiles[0];
}

function getEntry(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) {
    throw new Error(`Missing package entry: ${name}`);
  }
  return entry;
}

function countOpaquePixels(image) {
  let opaque = 0;
  for (let index = 3; index < image.bitmap.data.length; index += 4) {
    if (image.bitmap.data[index] !== 0) {
      opaque++;
    }
  }
  return opaque;
}

async function verifyImage(zip, name, width, height) {
  const entry = getEntry(zip, name);
  const image = await Jimp.read(entry.getData());

  if (image.bitmap.width !== width || image.bitmap.height !== height) {
    throw new Error(
      `${name} has ${image.bitmap.width}x${image.bitmap.height}; expected ${width}x${height}`
    );
  }

  if (countOpaquePixels(image) === 0) {
    throw new Error(`${name} is fully transparent`);
  }
}

async function main() {
  const appx = findAppx();
  const zip = new AdmZip(appx);
  const manifestEntry = getEntry(zip, 'AppxManifest.xml');
  const manifest = manifestEntry.getData().toString('utf8');

  for (const manifestRef of EXPECTED_MANIFEST_REFS) {
    if (!manifest.includes(manifestRef)) {
      throw new Error(`AppxManifest.xml does not reference ${manifestRef}`);
    }
  }

  for (const [name, width, height] of EXPECTED_IMAGES) {
    await verifyImage(zip, name, width, height);
  }

  console.log(`[verify-appx-icons] OK: ${path.relative(ROOT, appx)} contains branded Store tile assets.`);
}

main().catch((err) => {
  console.error('[verify-appx-icons] FAILED:', err.message);
  process.exit(1);
});
