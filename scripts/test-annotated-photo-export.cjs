const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-livingculture-workflow.user.js'), 'utf8');
const start = source.indexOf('  async function encodeAnnotatedCustomerPhoto(');
const end = source.indexOf('  function customerPhotoBlob(', start);
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: source.slice(start, end) });
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 4000; canvas.height = 3000;
      const context = canvas.getContext('2d');
      const data = context.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] = Math.random() * 255; data.data[i + 1] = Math.random() * 255;
        data.data[i + 2] = Math.random() * 255; data.data[i + 3] = 255;
      }
      context.putImageData(data, 0, 0);
      context.fillStyle = '#ff0000'; context.fillRect(1000, 1450, 2000, 100);
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const blob = await encodeAnnotatedCustomerPhoto(canvas);
      const image = await createImageBitmap(blob);
      const preview = document.createElement('canvas');
      preview.width = image.width; preview.height = image.height;
      preview.getContext('2d').drawImage(image, 0, 0);
      const pixel = [...preview.getContext('2d').getImageData(image.width / 2, image.height / 2, 1, 1).data];
      return { pngBytes: png.size, bytes: blob.size, type: blob.type, width: image.width, height: image.height, originalWidth: canvas.width, pixel };
    });
    assert(result.pngBytes > 4.5 * 1024 * 1024, 'Reproduce a photo that exceeds the request limit');
    assert(result.bytes <= 3 * 1024 * 1024);
    assert.equal(result.type, 'image/jpeg');
    assert(result.width <= 2560);
    assert.equal(result.width / result.height, 4 / 3);
    assert.equal(result.originalWidth, 4000, 'Do not resize the editor itself');
    assert(result.pixel[0] > 200 && result.pixel[1] < 50 && result.pixel[2] < 50, 'Preserve the red annotation');
    console.log(`PASS: ${result.pngBytes} byte PNG becomes ${result.bytes} byte JPEG; dimensions, annotation and original canvas preserved`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
