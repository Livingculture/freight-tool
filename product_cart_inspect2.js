const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const productUrl = 'https://livingculture.co.nz/collections/outdoor-living/products/lutyens-garden-bench';
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const allButtons = await page.$$eval('button, a', els => els.map(e => ({tag:e.tagName, text:e.innerText.trim(), class:e.className, visible: e.offsetParent !== null, outerHTML:e.outerHTML}))); 
  const relevant = allButtons.filter(el => /add|cart|bag|buy|checkout/i.test(el.text));
  console.log('RELEVANT BUTTONS', JSON.stringify(relevant, null, 2));
  const addButtons = await page.$$eval('button', els => els.map(e => ({text:e.innerText.trim(), class:e.className, visible: e.offsetParent !== null})).filter(el=> /add|cart|bag/i.test(el.text)));
  console.log('BUTTONS WITH ADD/CART', JSON.stringify(addButtons, null, 2));
  const selects = await page.$$eval('select', els => els.map(e => ({name:e.name, id:e.id, class:e.className, outerHTML: e.outerHTML})).slice(0,20));
  console.log('SELECTS', JSON.stringify(selects, null, 2));
  const inputs = await page.$$eval('input', els => els.map(e => ({name:e.name, id:e.id, type:e.type, placeholder:e.placeholder, class:e.className, outerHTML:e.outerHTML})).slice(0,40));
  console.log('INPUTS', JSON.stringify(inputs, null, 2));
  await browser.close();
})();
