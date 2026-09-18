/**
 * scripts/generate_store_icons.js
 * Generates all required Microsoft Store (MSIX/AppX) icon assets
 * from assets/icon.png into assets/appx/
 *
 * Usage: node scripts/generate_store_icons.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { Jimp } = require('jimp');

const SRC  = path.resolve(__dirname, '../assets/icon.png');
const OUT  = path.resolve(__dirname, '../assets/appx');

const ICONS = [
  // StoreLogo
  { file: 'StoreLogo.png',                     w: 50,   h: 50   },
  { file: 'StoreLogo.scale-100.png',            w: 50,   h: 50   },
  { file: 'StoreLogo.scale-125.png',            w: 63,   h: 63   },
  { file: 'StoreLogo.scale-150.png',            w: 75,   h: 75   },
  { file: 'StoreLogo.scale-200.png',            w: 100,  h: 100  },
  { file: 'StoreLogo.scale-400.png',            w: 200,  h: 200  },
  // Square44
  { file: 'Square44x44Logo.png',                w: 44,   h: 44   },
  { file: 'Square44x44Logo.scale-100.png',      w: 44,   h: 44   },
  { file: 'Square44x44Logo.scale-125.png',      w: 55,   h: 55   },
  { file: 'Square44x44Logo.scale-150.png',      w: 66,   h: 66   },
  { file: 'Square44x44Logo.scale-200.png',      w: 88,   h: 88   },
  { file: 'Square44x44Logo.scale-400.png',      w: 176,  h: 176  },
  { file: 'Square44x44Logo.targetsize-16.png',  w: 16,   h: 16   },
  { file: 'Square44x44Logo.targetsize-24.png',  w: 24,   h: 24   },
  { file: 'Square44x44Logo.targetsize-32.png',  w: 32,   h: 32   },
  { file: 'Square44x44Logo.targetsize-48.png',  w: 48,   h: 48   },
  { file: 'Square44x44Logo.targetsize-256.png', w: 256,  h: 256  },
  // Square71
  { file: 'Square71x71Logo.png',                w: 71,   h: 71   },
  { file: 'Square71x71Logo.scale-100.png',      w: 71,   h: 71   },
  { file: 'Square71x71Logo.scale-125.png',      w: 89,   h: 89   },
  { file: 'Square71x71Logo.scale-150.png',      w: 107,  h: 107  },
  { file: 'Square71x71Logo.scale-200.png',      w: 142,  h: 142  },
  { file: 'Square71x71Logo.scale-400.png',      w: 284,  h: 284  },
  // Square150
  { file: 'Square150x150Logo.png',              w: 150,  h: 150  },
  { file: 'Square150x150Logo.scale-100.png',    w: 150,  h: 150  },
  { file: 'Square150x150Logo.scale-125.png',    w: 188,  h: 188  },
  { file: 'Square150x150Logo.scale-150.png',    w: 225,  h: 225  },
  { file: 'Square150x150Logo.scale-200.png',    w: 300,  h: 300  },
  { file: 'Square150x150Logo.scale-400.png',    w: 600,  h: 600  },
  // Square310
  { file: 'Square310x310Logo.png',              w: 310,  h: 310  },
  { file: 'Square310x310Logo.scale-100.png',    w: 310,  h: 310  },
  { file: 'Square310x310Logo.scale-125.png',    w: 388,  h: 388  },
  { file: 'Square310x310Logo.scale-150.png',    w: 465,  h: 465  },
  { file: 'Square310x310Logo.scale-200.png',    w: 620,  h: 620  },
  { file: 'Square310x310Logo.scale-400.png',    w: 1240, h: 1240 },
  // Wide310x150
  { file: 'Wide310x150Logo.png',                w: 310,  h: 150  },
  { file: 'Wide310x150Logo.scale-100.png',      w: 310,  h: 150  },
  { file: 'Wide310x150Logo.scale-125.png',      w: 388,  h: 188  },
  { file: 'Wide310x150Logo.scale-150.png',      w: 465,  h: 225  },
  { file: 'Wide310x150Logo.scale-200.png',      w: 620,  h: 300  },
  { file: 'Wide310x150Logo.scale-400.png',      w: 1240, h: 600  },
];

async function generateIcon(src, outPath, w, h) {
  const img = await Jimp.read(src);

  if (w === h) {
    img.resize({ w, h });
    await img.write(outPath);
  } else {
    // Wide tile: fit inside canvas centered on transparent bg
    const ratio = Math.min(w / img.width, h / img.height);
    const nw = Math.round(img.width  * ratio);
    const nh = Math.round(img.height * ratio);
    img.resize({ w: nw, h: nh });
    const canvas = new Jimp({ width: w, height: h, color: 0x00000000 });
    const x = Math.floor((w - nw) / 2);
    const y = Math.floor((h - nh) / 2);
    canvas.composite(img, x, y);
    await canvas.write(outPath);
  }
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('ERROR: Source not found: ' + SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  console.log('\nGenerating Microsoft Store icons -> ' + OUT + '\n');

  let ok = 0, fail = 0;
  for (const { file, w, h } of ICONS) {
    const outPath = path.join(OUT, file);
    try {
      await generateIcon(SRC, outPath, w, h);
      console.log('  OK  ' + file.padEnd(52) + w + 'x' + h);
      ok++;
    } catch (err) {
      console.error('  FAIL ' + file + ' -- ' + err.message);
      fail++;
    }
  }

  console.log('\n--------------------------------------------------');
  console.log('Generated: ' + ok + '   Failed: ' + fail);
  console.log('Output: ' + OUT);
  console.log('\nAdd to package.json "appx" section:');
  console.log('  "assets": "assets/appx"\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
