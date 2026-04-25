const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const productUrl = 'https://livingculture.co.nz/collections/outdoor-living/products/lutyens-garden-bench';
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const btn = document.querySelector('button[name="add"]');
    if (btn) {
      btn.click();
    }
  });
  await page.waitForTimeout(4000);
  await page.goto('https://livingculture.co.nz/cart', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const inputs = await page.$$eval('input', nodes => nodes.map(n => ({name:n.name, id:n.id, type:n.type, placeholder:n.placeholder, class:n.className, outerHTML:n.outerHTML})).slice(0,120));
  console.log('INPUT COUNT', inputs.length);
  const addressInputs = inputs.filter(i => /address|postcode|suburb|city/i.test(i.name + ' ' + i.id + ' ' + i.placeholder + ' ' + i.class));
  console.log('ADDRESS INPUTS', JSON.stringify(addressInputs, null, 2));
  const text = await page.textContent('body');
  console.log('BODY TEXT SNIPPET', text.slice(0, 1000));
  await browser.close();
})();
