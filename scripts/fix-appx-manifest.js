'use strict';

const fs = require('fs');

module.exports = async function fixAppxManifest(manifestPath) {
  let manifest = await fs.promises.readFile(manifestPath, 'utf8');

  manifest = manifest.replace(
    /(<Logo>)([^<]+)(<\/Logo>)/,
    '$1assets\\StoreLogo.png$3'
  );

  manifest = manifest.replace(
    /<uap:VisualElements\b([^>]*)>/,
    (match, attrs) => {
      const nextAttrs = setXmlAttr(
        setXmlAttr(attrs, 'Square150x150Logo', 'assets\\Square150x150Logo.png'),
        'Square44x44Logo',
        'assets\\Square44x44Logo.png'
      );
      return `<uap:VisualElements${nextAttrs}>`;
    }
  );

  manifest = manifest.replace(
    /<uap:DefaultTile\b([^>]*?)(\/>|>[\s\S]*?<\/uap:DefaultTile>)/,
    (match, attrs, close) => {
      let nextAttrs = attrs;
      nextAttrs = setXmlAttr(nextAttrs, 'Square71x71Logo', 'assets\\Square71x71Logo.png');
      nextAttrs = setXmlAttr(nextAttrs, 'Square310x310Logo', 'assets\\Square310x310Logo.png');
      nextAttrs = setXmlAttr(nextAttrs, 'Wide310x150Logo', 'assets\\Wide310x150Logo.png');
      return `<uap:DefaultTile${nextAttrs}${close}`;
    }
  );

  await fs.promises.writeFile(manifestPath, manifest);
};

function setXmlAttr(attrs, name, value) {
  const attr = `${name}="${value}"`;
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (re.test(attrs)) {
    return attrs.replace(re, ` ${attr}`);
  }
  return `${attrs} ${attr}`;
}
