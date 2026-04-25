const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const productUrl = 'https://livingculture.co.nz/collections/outdoor-living/products/lutyens-garden-bench';
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const buttons = await page.$$eval('button, input[type=submit], a', els => els.slice(0,20).map(e => ({tag:e.tagName, text:e.innerText, class:e.className, type:e.type || ''})));
  console.log('first buttons', JSON.stringify(buttons, null, 2));
  const addToCartBtn = await page.$('button[data-add-to-cart], button.add-to-cart, button[name="add"], button[type="submit"]:has-text("Add to cart"), button:has-text("Add to cart"), button:has-text("Add to bag"), input[type=submit][value*="Add"]');
  console.log('add btn found', !!addToCartBtn);
  if (addToCartBtn) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
      addToCartBtn.click()
    ]);
  }
  await page.waitForTimeout(4000);
  await page.goto('https://livingculture.co.nz/cart', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const addressInputs = await page.$$eval('input', nodes => nodes.filter(n => /address|postcode|suburb|city/i.test(n.name + ' ' + n.id + ' ' + n.placeholder + ' ' + n.className)).map(n=>({name:n.name,id:n.id,type:n.type,placeholder:n.placeholder,class:n.className,outerHTML:n.outerHTML})));
  console.log('ADDRESS INPUTS', JSON.stringify(addressInputs, null, 2));
  const clickable = await page.$$eval('button, a', nodes=>nodes.map(n=>({tag:n.tagName.toLowerCase(), text:n.innerText.trim(), class:n.className, outerHTML:n.outerHTML})).slice(0,60));
  console.log(JSON.stringify(clickable,null,2));
  await browser.close();
})();
