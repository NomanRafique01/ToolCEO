/**
 * scripts/generate_store_icons.js
 * Generates Microsoft Store / MSIX visual assets from the branded ToolCEO icon.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'icon.png');
const OUT = path.join(ROOT, 'assets', 'appx');

const SCALES = [
  { suffix: 'scale-100', factor: 1 },
  { suffix: 'scale-125', factor: 1.25 },
  { suffix: 'scale-150', factor: 1.5 },
  { suffix: 'scale-200', factor: 2 },
  { suffix: 'scale-400', factor: 4 },
];

const APP_LIST_TARGET_SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256];

const RESOURCES = [
  { name: 'AppList', w: 44, h: 44, scales: true, targetSizes: true },
  { name: 'SmallTile', w: 71, h: 71, scales: true, lightTile: true },
  { name: 'MedTile', w: 150, h: 150, scales: true, lightTile: true },
  { name: 'WideTile', w: 310, h: 150, scales: true, lightTile: true },
  { name: 'LargeTile', w: 310, h: 310, scales: true, lightTile: true },
  { name: 'StoreLogo', w: 50, h: 50, scales: true, lightStore: true },
];

const LEGACY_ALIASES = [
  { from: 'AppList', to: 'Square44x44Logo', targetSizes: true },
  { from: 'SmallTile', to: 'Square71x71Logo' },
  { from: 'MedTile', to: 'Square150x150Logo' },
  { from: 'WideTile', to: 'Wide310x150Logo' },
  { from: 'LargeTile', to: 'Square310x310Logo' },
];

function pickSource() {
  if (!fs.existsSync(SRC)) {
    throw new Error('No source icon found. Expected assets/icon.png.');
  }
  return SRC;
}

async function writeFittedIcon(source, outPath, width, height) {
  const img = source.clone();
  const ratio = Math.min(width / img.bitmap.width, height / img.bitmap.height);
  const fittedWidth = Math.max(1, Math.round(img.bitmap.width * ratio));
  const fittedHeight = Math.max(1, Math.round(img.bitmap.height * ratio));

  img.resize({ w: fittedWidth, h: fittedHeight });

  const canvas = new Jimp({ width, height, color: 0x00000000 });
  canvas.composite(
    img,
    Math.floor((width - fittedWidth) / 2),
    Math.floor((height - fittedHeight) / 2)
  );
  await canvas.write(outPath);
}

async function copyPng(fromName, toName) {
  await fs.promises.copyFile(path.join(OUT, fromName), path.join(OUT, toName));
}

function scaledName(name, scale) {
  return `${name}.${scale.suffix}.png`;
}

function targetSizeName(name, size, suffix = '') {
  return `${name}.targetsize-${size}${suffix}.png`;
}

async function generateResource(source, resource) {
  await writeFittedIcon(source, path.join(OUT, `${resource.name}.png`), resource.w, resource.h);

  if (resource.scales) {
    for (const scale of SCALES) {
      const width = Math.round(resource.w * scale.factor);
      const height = Math.round(resource.h * scale.factor);
      const baseName = scaledName(resource.name, scale);
      await writeFittedIcon(source, path.join(OUT, baseName), width, height);

      if (resource.lightTile) {
        await copyPng(baseName, `${resource.name}.${scale.suffix}_altform-colorful_theme-light.png`);
      }

      if (resource.lightStore) {
        await copyPng(baseName, `${resource.name}.${scale.suffix}_altform-colorful_theme-light.png`);
      }
    }
  }

  if (resource.targetSizes) {
    for (const size of APP_LIST_TARGET_SIZES) {
      const baseName = targetSizeName(resource.name, size);
      await writeFittedIcon(source, path.join(OUT, baseName), size, size);
      await copyPng(baseName, targetSizeName(resource.name, size, '_altform-unplated'));
      await copyPng(baseName, targetSizeName(resource.name, size, '_altform-lightunplated'));
    }
  }
}

async function generateLegacyAliases() {
  for (const alias of LEGACY_ALIASES) {
    await copyPng(`${alias.from}.png`, `${alias.to}.png`);

    for (const scale of SCALES) {
      const sourceName = scaledName(alias.from, scale);
      await copyPng(sourceName, scaledName(alias.to, scale));

      const lightVariant = `${alias.from}.${scale.suffix}_altform-colorful_theme-light.png`;
      if (fs.existsSync(path.join(OUT, lightVariant))) {
        await copyPng(lightVariant, `${alias.to}.${scale.suffix}_altform-colorful_theme-light.png`);
      }
    }

    if (alias.targetSizes) {
      for (const size of APP_LIST_TARGET_SIZES) {
        for (const suffix of ['', '_altform-unplated', '_altform-lightunplated']) {
          await copyPng(targetSizeName(alias.from, size, suffix), targetSizeName(alias.to, size, suffix));
        }
      }
    }
  }
}

async function main() {
  const src = pickSource();
  const source = await Jimp.read(src);

  fs.mkdirSync(OUT, { recursive: true });
  console.log(`[icons] Generating Microsoft Store visual assets from ${path.relative(ROOT, src)}`);

  for (const resource of RESOURCES) {
    await generateResource(source, resource);
  }
  await generateLegacyAliases();

  console.log(`[icons] Wrote branded APPX assets to ${path.relative(ROOT, OUT)}`);
}

module.exports = { main };

if (require.main === module) {
  main().catch((err) => {
    console.error('[icons] Fatal:', err.message);
    process.exit(1);
  });
}
