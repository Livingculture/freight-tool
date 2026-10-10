const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const start = source.indexOf('  function cloneCurrentQuote(');
const next = source.slice(start + 1).search(/\n  (?:async )?function /);
const clone = source.slice(start, start + next + 1);
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let copies = 0; let saves = 0;
    const mainNavigations = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) mainNavigations.push(frame.url()); });
    await page.route('https://go.cin7.com/**', async route => {
      const url = new URL(route.request().url());
      let body;
      if (url.pathname.includes('ShoppingCartAdmin')) {
        body = '<h1>Sales Orders</h1><h2>Admin - Customer - NZSO-15514</h2><button onclick="document.getElementById(\'copy\').hidden=false">Actions</button><a id="copy" target="_top" hidden href="/Cloud/TransactionEntry/TransactionEntry.aspx?newClone=1">Copy All Items</a>';
      } else if (url.searchParams.has('newClone')) {
        copies++;
        await new Promise(resolve => setTimeout(resolve, 350));
        body = '<h1>Living Culture</h1><div role="heading">New Quote</div><button onclick="location.href=\'/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=398\'">Save As Draft</button>';
      } else if (url.searchParams.get('OrderId') === '398') {
        saves++;
        body = '<h1>Living Culture</h1><h2>Edit Quote - Customer - NZSO-15515</h2>';
      } else body = '<h1>Edit Quote - Customer - NZSO-15514</h1><button id="clone">Clone Quote</button>';
      await route.fulfill({ contentType: 'text/html', body });
    });
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=397');
    await page.evaluate(() => {
      window.isOmniPage = () => true;
      window.omniHeadingDraft = () => ({ documentType: 'quote' });
      window.currentQuotePdfOrderId = () => '397';
      window.hubSpotGateOrderId = () => 'NZSO-15514';
      window.normalizeLabel = value => String(value).trim().toLowerCase();
      window.clean = value => String(value || '').trim();
      window.extractOrderId = value => String(value).match(/NZSO-\d+/)?.[0] || '';
      window.alert = message => { throw Error(message); };
    });
    await page.addScriptTag({ content: `const CLONE_QUOTE_BUTTON_ID='clone';\n${clone}\ndocument.getElementById('clone').onclick=cloneCurrentQuote;` });
    await page.locator('#clone').click();
    assert.equal(await page.locator('#clone').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#clone span').count(), 1, 'Spinner visible');
    await page.screenshot({ path: '/tmp/lc-clone-background-spinner.png' });
    assert(page.url().endsWith('OrderId=397'), 'Original stays visible during copy');
    await page.waitForURL('**OrderId=398');
    assert.equal(copies, 1);
    assert.equal(saves, 2, 'One worker save response plus parent opening finished clone');
    assert.equal(mainNavigations.length, 2, 'Only original and saved clone visible; no Admin or unsaved clone');
    console.log('PASS: Background native copy/save, visible spinner, one copy, only final saved quote navigation. Requests mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
