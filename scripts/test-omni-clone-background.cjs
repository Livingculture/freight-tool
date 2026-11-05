const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}

const functions = [
  'nativeCopyAllItemsControl',
  'cloneCurrentQuote',
  'continueCloneQuoteFromAdmin',
  'clickNativeCloneAction',
  'continueSaveClonedQuote'
].map(extract).join('\n');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let copies = 0;
    let saves = 0;
    await page.route('https://go.cin7.com/**', async route => {
      const url = new URL(route.request().url());
      let body;
      if (url.pathname.includes('ShoppingCartAdmin')) {
        await new Promise(resolve => setTimeout(resolve, 300));
        body = '<h1>Admin - Customer - NZSO-15514</h1><button id="actions" onclick="document.getElementById(\'copy\').hidden=false">Actions</button><a id="copy" hidden target="_blank" href="/Cloud/TransactionEntry/TransactionEntry.aspx?newClone=1">Copy All Items</a>';
      } else if (url.searchParams.has('newClone')) {
        copies++;
        body = '<h1>New Quote - Customer</h1><button id="save" onclick="location.href=\'/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=398\'">Save As Draft</button>';
      } else if (url.searchParams.get('OrderId') === '398') {
        saves++;
        body = '<h1>Edit Quote - Customer - NZSO-15515</h1>';
      } else {
        body = '<h1>Edit Quote - Customer - NZSO-15514</h1><button id="clone">Clone Quote</button><a id="admin" target="_blank" href="/Cloud/ShoppingCartAdmin/Orders/OrderDetail.aspx?idOrder=397">Go to Admin</a>';
      }
      await route.fulfill({ contentType: 'text/html', body });
    });

    await page.addInitScript({ content: `
      const CLONE_QUOTE_BUTTON_ID = 'clone';
      const CLONE_QUOTE_INTENT_KEY = 'clone-intent';
      const CLONE_QUOTE_SAVE_KEY = 'clone-save';
      const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
      const normalizeLabel = value => clean(value).toLowerCase().replace(/[*:]/g, '').trim();
      const findButtonByLabel = label => Array.from(document.querySelectorAll('a,button,input')).find(node => normalizeLabel(node.textContent || node.value || '') === normalizeLabel(label));
      const isOmniPage = () => /\\/Cloud\\/TransactionEntry\\/TransactionEntry\\.aspx/i.test(location.pathname);
      const orderNumber = () => (document.querySelector('h1')?.textContent || '').match(/NZSO-\\d+/)?.[0] || '';
      const currentQuotePdfOrderId = () => new URL(location.href).searchParams.get('OrderId') || new URL(location.href).searchParams.get('idOrder') || '';
      const hubSpotGateOrderId = () => orderNumber();
      const omniHeadingDraft = () => ({ documentType:'quote', orderId:orderNumber(), customerName:'Customer' });
      const readValueNearLabel = () => 'Customer';
      const visibleOmniControl = label => Array.from(document.querySelectorAll('button')).find(node => normalizeLabel(node.textContent) === normalizeLabel(label));
      window.alerts = [];
      window.alert = message => window.alerts.push(message);
      ${functions}
      addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('clone')) document.getElementById('clone').onclick = cloneCurrentQuote;
        if (/ShoppingCartAdmin/i.test(location.pathname)) continueCloneQuoteFromAdmin();
        if (isOmniPage()) continueSaveClonedQuote();
      });
    ` });

    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=397');
    await page.locator('#clone').click();
    await page.waitForURL('**OrderId=398');
    assert.equal(page.context().pages().length, 1, 'Keep the native Admin and Copy actions in the current tab');
    assert.equal(copies, 1, 'Use Copy All Items once');
    assert.equal(saves, 1, 'Save the clone once');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('clone-intent')), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('clone-save')), null);
    assert.deepEqual(await page.evaluate(() => window.alerts), []);
    console.log('PASS: Clone Quote uses visible native Admin flow, forces same-tab actions, and automatically saves once. Requests mocked.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
