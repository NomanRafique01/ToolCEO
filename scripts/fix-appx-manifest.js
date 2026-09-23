'use strict';

const fs = require('fs');

const VISUAL_ASSETS = {
  packageLogo: 'assets\\StoreLogo.png',
  appList: 'assets\\AppList.png',
  mediumTile: 'assets\\MedTile.png',
  smallTile: 'assets\\SmallTile.png',
  wideTile: 'assets\\WideTile.png',
  largeTile: 'assets\\LargeTile.png',
};

module.exports = async function fixAppxManifest(manifestPath) {
  let manifest = await fs.promises.readFile(manifestPath, 'utf8');

  manifest = manifest.replace(
    /(<Logo>)([^<]+)(<\/Logo>)/,
    `$1${VISUAL_ASSETS.packageLogo}$3`
  );

  manifest = manifest.replace(
    /<uap:VisualElements\b([^>]*)>([\s\S]*?)<\/uap:VisualElements>/,
    (match, attrs, body) => {
      let nextAttrs = attrs;
      nextAttrs = setXmlAttr(nextAttrs, 'Square150x150Logo', VISUAL_ASSETS.mediumTile);
      nextAttrs = setXmlAttr(nextAttrs, 'Square44x44Logo', VISUAL_ASSETS.appList);
      nextAttrs = setXmlAttr(nextAttrs, 'BackgroundColor', 'transparent');

      const nextBody = setDefaultTile(body);
      return `<uap:VisualElements${nextAttrs}>${nextBody}</uap:VisualElements>`;
    }
  );

  await fs.promises.writeFile(manifestPath, manifest, 'utf8');
};

function setDefaultTile(body) {
  const defaultTileRe = /<uap:DefaultTile\b([^>]*?)(\/>|>[\s\S]*?<\/uap:DefaultTile>)/;

  if (defaultTileRe.test(body)) {
    return body.replace(defaultTileRe, (match, attrs, close) => {
      const nextAttrs = setDefaultTileAttrs(attrs);
      return `<uap:DefaultTile${nextAttrs}${close}`;
    });
  }

  const defaultTile = [
    '        <uap:DefaultTile',
    `          Square71x71Logo="${VISUAL_ASSETS.smallTile}"`,
    `          Square310x310Logo="${VISUAL_ASSETS.largeTile}"`,
    `          Wide310x150Logo="${VISUAL_ASSETS.wideTile}"`,
    '          ShortName="ToolCEO" />',
  ].join('\n');

  return `${body}\n${defaultTile}\n`;
}

function setDefaultTileAttrs(attrs) {
  let nextAttrs = attrs;
  nextAttrs = setXmlAttr(nextAttrs, 'Square71x71Logo', VISUAL_ASSETS.smallTile);
  nextAttrs = setXmlAttr(nextAttrs, 'Square310x310Logo', VISUAL_ASSETS.largeTile);
  nextAttrs = setXmlAttr(nextAttrs, 'Wide310x150Logo', VISUAL_ASSETS.wideTile);
  nextAttrs = setXmlAttr(nextAttrs, 'ShortName', 'ToolCEO');
  return nextAttrs;
}

function setXmlAttr(attrs, name, value) {
  const attr = `${name}="${value}"`;
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (re.test(attrs)) {
    return attrs.replace(re, ` ${attr}`);
  }
  return `${attrs} ${attr}`;
}
