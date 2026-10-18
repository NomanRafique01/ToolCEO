const { Jimp } = require('jimp');
Jimp.read('assets/icon.png').then(img => {
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1],[Math.floor(w/2),0],[0,Math.floor(h/2)]];
  corners.forEach(([x,y]) => {
    const p = img.getPixelColor(x,y);
    const r = (p >> 24) & 0xff;
    const g = (p >> 16) & 0xff;
    const b = (p >> 8) & 0xff;
    const a = p & 0xff;
    console.log('Pixel(' + x + ',' + y + '): r=' + r + ' g=' + g + ' b=' + b + ' a=' + a + (a === 0 ? ' TRANSPARENT' : ' OPAQUE'));
  });
});
