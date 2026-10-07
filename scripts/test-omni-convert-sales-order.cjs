const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-livingculture-workflow.user.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="toolbar"><button id="site">Site Visit</button><button id="review">Quote Review</button><button id="hubspot">HubSpot Deal</button><button id="download">Download Quote</button></div><section id="footer"><button id="save">Save</button><button id="admin">Go to Admin</button></section>' }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=397');
    await page.evaluate(() => {
      window.complete = false; window.documentType = 'quote'; window.converted = 0; window.adminOpened = 0; window.confirmed = true;
      window.isOmniPage = () => true;
      window.hubSpotGateOrderId = () => 'NZSO-15512';
      window.omniHeadingDraft = () => ({ documentType: window.documentType });
      window.isHubSpotStepComplete = () => window.complete;
      window.normalizeLabel = value => String(value).trim().toLowerCase();
      window.styleInlineButton = button => { button.style.cssText = 'background:#063b78;color:white;border:0;border-radius:4px;'; };
      window.wireActionButton = button => button.addEventListener('click', convertQuoteToSalesOrder);
      window.leftmostOmniSaveButton = () => document.getElementById('save');
      window.omniFooterPanel = () => document.getElementById('footer');
      window.confirm = () => window.confirmed;
      window.alert = message => { throw Error(message); };
      document.getElementById('admin').onclick = () => { window.adminOpened++; };
    });
    const functions = ['currentQuotePdfOrderId', 'placeOmniActionButton', 'layoutOmniWorkflowButtons', 'nativeConvertToSalesOrderControl', 'convertQuoteToSalesOrder', 'continueConvertToSalesOrderFromAdmin', 'addConvertToSalesOrderButton'];
    await page.addScriptTag({ content: `const CONVERT_ORDER_BUTTON_ID='lc-convert-sales-order-button', CONVERT_ORDER_INTENT_KEY='convert-intent', QUOTE_PDF_BUTTON_ID='download', BUTTON_ID='site', QUOTE_REVIEW_BUTTON_ID='review', HUBSPOT_BUTTON_ID='hubspot', OMNI_TOOLS_BAR_ID='toolbar';\n${functions.map(extract).join('\n')}` });
    await page.evaluate(() => { addConvertToSalesOrderButton(); convertQuoteToSalesOrder(); });
    assert.equal(await page.locator('#lc-convert-sales-order-button').count(), 0);
    assert.equal(await page.evaluate(() => window.adminOpened), 0, 'Do not bypass HubSpot gate');
    await page.evaluate(() => { window.complete = true; addConvertToSalesOrderButton(); layoutOmniWorkflowButtons(); });
    const button = page.locator('#lc-convert-sales-order-button');
    assert(await button.isVisible());
    assert(await page.evaluate(() => document.getElementById('lc-convert-sales-order-button').previousElementSibling.id === 'download'));
    await page.screenshot({ path: '/tmp/lc-convert-sales-order-button.png' });
    await page.evaluate(() => { window.confirmed = false; });
    await button.click();
    assert.equal(await page.evaluate(() => window.adminOpened), 0, 'Cancellation must do nothing');
    await page.evaluate(() => { window.confirmed = true; });
    await button.click();
    assert.equal(await page.evaluate(() => window.adminOpened), 1);
    await page.evaluate(() => {
      const native = document.createElement('button'); native.id = 'native-convert'; native.textContent = 'Convert to Sales Order';
      native.onclick = () => { window.converted++; }; document.body.appendChild(native);
      continueConvertToSalesOrderFromAdmin();
    });
    await page.waitForFunction(() => window.converted === 1);
    await page.evaluate(() => continueConvertToSalesOrderFromAdmin());
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => window.converted), 1, 'Consume the navigation intent exactly once');
    await page.evaluate(() => {
      sessionStorage.setItem('convert-intent', JSON.stringify({ orderId: '999', quoteNumber: 'NZSO-OTHER', at: Date.now() }));
      continueConvertToSalesOrderFromAdmin();
      window.documentType = 'sales-order'; addConvertToSalesOrderButton();
    });
    assert.equal(await button.count(), 0, 'Hide on sales orders');
    assert.equal(await page.evaluate(() => window.converted), 1, 'Never convert a different quote');
    console.log('PASS: Hidden until HubSpot, adjacent toolbar button, cancel, native admin conversion intent exactly once, wrong-quote protection and sales-order hiding. Conversion mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
