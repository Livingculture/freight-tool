const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://livingculture.co.nz/cart', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const inputs = await page.$$eval('input', nodes => nodes.map(n => ({name:n.name, id:n.id, type:n.type, placeholder:n.placeholder, class:n.className, outerText:n.outerText || ''})).slice(0,120));
  console.log(JSON.stringify(inputs, null, 2));
  const addressInputs = await page.$$eval('input', nodes => nodes.filter(n => /address|postcode|suburb|city/i.test(n.name + ' ' + n.id + ' ' + n.placeholder + ' ' + n.className)).map(n=>({name:n.name,id:n.id,placeholder:n.placeholder,class:n.className,outerHTML:n.outerHTML})));
  console.log('ADDRESS CANDIDATES', JSON.stringify(addressInputs,null,2));
  const labels = await page.$$eval('label', nodes => nodes.map(n => n.textContent.trim()).slice(0,120));
  console.log(JSON.stringify(labels,null,2));
  await browser.close();
})();
