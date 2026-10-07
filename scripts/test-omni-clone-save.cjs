const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Edit Quote - Customer - NZSO-15514</h1><button id="save">Save</button>' }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=397');
    await page.evaluate(() => {
      window.draft = { documentType: 'quote', orderId: 'NZSO-15514', customerName: 'Customer' };
      window.internalId = '397'; window.saves = 0;
      window.isOmniPage = () => true;
      window.omniHeadingDraft = () => window.draft;
      window.hubSpotGateOrderId = () => window.draft.orderId;
      window.currentQuotePdfOrderId = () => window.internalId;
      window.clean = value => String(value || '').trim();
      window.visibleOmniControl = () => document.getElementById('save');
      window.readValueNearLabel = () => 'Customer';
      window.alert = message => { throw Error(message); };
      document.getElementById('save').onclick = () => window.saves++;
    });
    await page.addScriptTag({ content: `const CLONE_QUOTE_SAVE_KEY='clone-save';\n${extract('clickNativeCloneAction')}\n${extract('continueSaveClonedQuote')}` });
    await page.evaluate(() => clickNativeCloneAction({ click() {} }));
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.saves), 0, 'Never save original');
    await page.evaluate(() => {
      window.draft.orderId = 'NZSO-15515'; window.internalId = '398';
      document.getElementById('save').disabled = true;
    });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.saves), 0, 'Wait until Save enabled');
    await page.evaluate(() => { document.getElementById('save').disabled = false; });
    await page.waitForFunction(() => window.saves === 1);
    await page.evaluate(() => continueSaveClonedQuote());
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.saves), 1, 'Save once only');
    await page.evaluate(() => {
      sessionStorage.setItem('clone-save', JSON.stringify({ at: Date.now() - 121000, orderId: '397', quoteNumber: 'NZSO-15514' }));
      continueSaveClonedQuote();
    });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('clone-save')), null, 'Discard expired intent');
    await page.evaluate(() => {
      window.draft = { documentType: 'quote', orderId: '', customerName: '' };
      document.querySelector('h1').textContent = 'New Quote';
      sessionStorage.setItem('clone-save', JSON.stringify({ at: Date.now(), orderId: '397', quoteNumber: 'NZSO-15514', customerName: 'Customer' }));
      continueSaveClonedQuote();
    });
    await page.waitForFunction(() => window.saves === 2);
    console.log('PASS: Original untouched, cloned quote waits for enabled Save, saves once, expired intent discarded. Native save mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
