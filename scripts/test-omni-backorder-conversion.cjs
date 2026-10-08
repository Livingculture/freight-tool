const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const names = ['tableHeaderMap', 'indexForHeader', 'cellText', 'omniFullyDispatchedInputs', 'omniFullyDispatchedState',
  'finishOmniConversionNavigation', 'omniHasStockShortage', 'omniCollectionDispatchAllowed',
  'claimOmniCollectionDispatch', 'fillOmniShowroomDispatch', 'checkOmniShowroomCollection'];
const functions = names.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}).join('\n');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: '<body></body>' }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?idCustomerAppsLink=1327919&OrderId=401&ConvertQuoteToSalesOrder=Yes');
    await page.setContent('<div><label>2 Fully Dispatched</label><div><input id="dispatch"><input id="time"></div></div><table><tr><th>Code</th><th>Product</th><th>Stock</th><th>1 Qty Ordered</th><th>2 Qty Dispatch</th></tr><tr><td>SOFA-1</td><td>Sofa set</td><td>FIFO 1 x</td><td>1</td><td><input id="qty-dispatch" value="0"></td></tr><tr><td>PART-1</td><td>Sofa component</td><td id="stock">0 available FIFO</td><td>2</td><td></td></tr><tr><td>AS10037</td><td>Assembly Sofa</td><td>0 available FIFO</td><td>1</td><td></td></tr></table><input id="invoice" value="8-10-2026"><button id="approve">Approve</button>');
    await page.addScriptTag({ content: `const clean=value=>String(value||'').trim();const normalizeLabel=value=>clean(value).toLowerCase();const isVisible=node=>node.getBoundingClientRect().width>0;const isOmniPage=()=>true;let documentType='sales-order';const omniHeadingDraft=()=>({documentType,orderId:'NZSO-15516'});let omniQuoteConversionLoaded=false;const collectionDispatchAttempts=new Set();const API_KEY='';const OMNI_ORDER_SYNC_API_URL='https://workflow.test';let requests=[];const GM_xmlhttpRequest=options=>requests.push(options);window.warnings=0;document.getElementById('dispatch').onchange=()=>warnings++;${functions}` });
    const collection = { orderNumber: 'NZSO-15516', collectedAt: '2026-10-08T09:41:00.000Z' };
    assert.equal(await page.evaluate(() => omniHasStockShortage()), true, 'BOM component shortages count even if parent shows FIFO quantity');
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collection), false);
    await page.evaluate(() => { finishOmniConversionNavigation(); checkOmniShowroomCollection(); });
    assert(!page.url().includes('ConvertQuoteToSalesOrder'), 'Refresh must not repeat conversion action');
    assert(page.url().includes('OrderId=401') && page.url().includes('idCustomerAppsLink=1327919'));
    assert.equal(await page.evaluate(() => requests.length), 0);
    assert.equal(await page.locator('#dispatch').inputValue(), '');
    assert.equal(await page.locator('#qty-dispatch').inputValue(), '0');
    assert.equal(await page.locator('#invoice').inputValue(), '8-10-2026');
    assert(await page.locator('#approve').isEnabled(), 'Native approval stays available; no suppression of stock validation');
    await page.locator('#stock').evaluate(node => node.textContent='3 available FIFO');
    assert.equal(await page.evaluate(() => omniHasStockShortage()), false, 'Assembly/service zero stock is ignored');
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collection), false, 'Fresh conversion never auto-dispatches, even if stock is present');
    await page.evaluate(() => omniQuoteConversionLoaded=false);
    await page.locator('#stock').evaluate(node => node.textContent='-1 available FIFO');
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collection), false, 'Negative stock still blocks auto-dispatch after reload');
    await page.locator('#stock').evaluate(node => node.textContent='1 available FIFO');
    assert.equal(await page.evaluate(() => omniHasStockShortage()), true, 'Partial available quantity is insufficient for full dispatch');
    assert.equal(await page.evaluate(() => warnings), 0, 'No dispatch events or stock alerts triggered on conversion/backorder');
    await page.locator('#stock').evaluate(node => node.textContent='2 available FIFO');
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collection), true, 'Normal collected sales order can autofill once enough stock is shown');
    assert.equal(await page.evaluate(() => warnings), 1);
    await page.locator('#dispatch').fill('');
    await page.evaluate(() => { documentType='quote';history.replaceState(null,'','?OrderId=401&ConvertQuoteToSalesOrder=Yes');finishOmniConversionNavigation(); });
    assert(page.url().includes('ConvertQuoteToSalesOrder'), 'Do not remove conversion request before Omni becomes a sales order');
    console.log('PASS: Quote conversion/backordered stock never auto-dispatches; safe navigation cleanup; BOM shortages, partial/negative stock and services handled; native approval and existing quantities/dates preserved. Browser/API mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
