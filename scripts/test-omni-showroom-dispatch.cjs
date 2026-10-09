const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const names = ['omniFullyDispatchedInputs', 'omniFullyDispatchedState', 'claimOmniCollectionDispatch', 'fillOmniShowroomDispatch', 'checkOmniShowroomCollection', 'omniCollectionDispatchAllowed'];
const functions = names.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}).join('\n');
const attempts = 'const collectionDispatchAttempts = new Set();let omniQuoteConversionLoaded=false;const omniHasStockShortage=()=>false;';
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ timezoneId: 'UTC' });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('https://go.cin7.com/test');
    await page.setContent('<div style="display:flex;gap:40px"><div><label><b>2</b> Fully Dispatched</label><div><input id="dispatch"><input id="dispatch-time"></div></div><div><label>Invoice Date</label><div><input id="invoice" value="7-10-2026"><input value="8:36 pm"></div></div></div><button id="save">Save As Draft</button>');
    await page.addScriptTag({ content: `const clean=value=>String(value||'').trim();const normalizeLabel=value=>clean(value).toLowerCase();const isVisible=node=>node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0;const isOmniPage=()=>true;let heading={orderId:'NZSO-15516',documentType:'sales-order'};const omniHeadingDraft=()=>heading;const API_KEY='';const OMNI_ORDER_SYNC_API_URL='https://workflow.test/api/omni/orders';let requests=[];let saved=0;let changes=0;document.getElementById('save').onclick=()=>saved++;document.getElementById('dispatch').onchange=()=>changes++;const GM_xmlhttpRequest=options=>requests.push(options);${attempts}${functions}` });
    const collected = { orderNumber: 'NZSO-15516', collectedAt: '2026-10-08T12:59:00.000Z' };
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), { ...collected, orderNumber: 'NZSO-999' }), false);
    await page.evaluate(() => checkOmniShowroomCollection());
    assert.equal(await page.evaluate(() => requests.length), 1);
    await page.evaluate(() => checkOmniShowroomCollection());
    assert.equal(await page.evaluate(() => requests.length), 1, 'Concurrent lookups do not duplicate requests');
    assert.equal(await page.evaluate(() => JSON.parse(requests[0].data).action),'fulfillment-dispatch');
    await page.evaluate(c => requests[0].onload({ status: 200, responseText: JSON.stringify({ fulfillmentDispatch: {orderNumber:c.orderNumber,dispatchedAt:c.collectedAt} }) }), collected);
    assert.equal(await page.locator('#dispatch').inputValue(), '9-10-2026', 'Use Auckland collection date, not host timezone or today');
    assert.equal(await page.locator('#dispatch-time').inputValue(), '1:59 am');
    assert.equal(await page.locator('#invoice').inputValue(), '7-10-2026', 'Invoice Date is untouched');
    assert.equal(await page.evaluate(() => saved), 0, 'Do not auto-approve or save other unsaved order edits');
    assert.equal(await page.evaluate(() => changes), 1, 'Omni receives native change event');
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collected), false, 'Existing date is never overwritten');
    await page.evaluate(() => checkOmniShowroomCollection());
    assert.equal(await page.evaluate(() => requests.length), 1, 'Filled orders stop polling');
    await page.locator('#dispatch').fill('');
    await page.locator('#dispatch-time').fill('');
    await page.evaluate(() => { document.getElementById('dispatch').type='date';document.getElementById('dispatch-time').type='time'; });
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collected), false, 'Clearing a rejected date must not restart the autofill');
    const recollected = { orderNumber:collected.orderNumber, dispatchedAt: '2026-10-08T12:59:01.000Z' };
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), recollected), true, 'A genuinely new collection can fill again');
    assert.equal(await page.locator('#dispatch').inputValue(), '2026-10-09');
    assert.equal(await page.locator('#dispatch-time').inputValue(), '01:59');
    await page.locator('#dispatch').fill('');
    await page.evaluate(() => document.getElementById('dispatch').readOnly=true);
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collected), false);
    await page.evaluate(() => { document.getElementById('dispatch').readOnly=false;heading.documentType='quote'; });
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), collected), false, 'Quotes are not updated');
    await page.evaluate(() => heading.documentType='sales-order');
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), { ...collected, collectedAt: 'invalid' }), false);
    const rejected = { ...collected, collectedAt: '2026-10-08T13:00:00.000Z' };
    await page.evaluate(c => {
      window.stockWarnings=0;
      document.getElementById('dispatch').onchange=() => {
        stockWarnings++;
        document.getElementById('dispatch').value='';
        fillOmniShowroomDispatch(c);
      };
    }, rejected);
    await page.evaluate(c => fillOmniShowroomDispatch(c), rejected);
    for(let i=0;i<5;i++) await page.evaluate(c => fillOmniShowroomDispatch(c), rejected);
    assert.equal(await page.evaluate(() => stockWarnings), 1, 'Stock rejection cannot loop through reentrant or repeated sync callbacks');
    await page.evaluate(() => collectionDispatchAttempts.clear());
    assert.equal(await page.evaluate(c => fillOmniShowroomDispatch(c), rejected), false, 'Session marker survives script restart/page reload');
    assert.equal(await page.evaluate(() => stockWarnings), 1);
    console.log('PASS: Collection date/time fills exact NZSO sales order using Auckland time, preserves existing/readonly dates and invoice fields, native events fire, no approval/save is triggered. Browser/API mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
