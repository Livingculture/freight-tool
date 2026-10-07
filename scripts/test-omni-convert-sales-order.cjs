const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-livingculture-workflow.user.js'), 'utf8');
function extract(name) {
  const start = new RegExp(`  (?:async )?function ${name}\\(`).exec(source).index;
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="toolbar"><button id="site">Site Visit</button><button id="review">Quote Review</button><button id="hubspot">HubSpot Deal</button><button id="download">Download Quote</button></div><section id="footer"><button id="save">Save</button><button id="admin">Go to Admin</button></section>' }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=397');
    await page.addStyleTag({ content: 'body { padding-top:200px; }' });
    await page.evaluate(() => {
      window.complete = false; window.documentType = 'quote'; window.converted = 0; window.adminOpened = 0; window.confirmed = true;
      window.isOmniPage = () => true;
      window.hubSpotGateOrderId = () => 'NZSO-15512';
      window.omniHeadingDraft = () => ({ documentType: window.documentType });
      window.isHubSpotStepComplete = () => window.complete;
      window.normalizeLabel = value => String(value).trim().toLowerCase();
      window.styleInlineButton = button => { button.style.cssText = 'background:#063b78;color:white;border:0;border-radius:4px;'; };
      window.wireActionButton = button => button.addEventListener('pointerdown', event => { event.preventDefault(); if (button.id === 'lc-clone-quote-button') cloneCurrentQuote(); else void convertQuoteToSalesOrder(button, event); });
      window.findButtonByLabel = label => Array.from(document.querySelectorAll('button')).find(button => button.textContent.toLowerCase() === label.toLowerCase());
      window.clean = value => String(value || '').trim();
      window.visibleOmniControl = () => document.getElementById('save');
      window.readValueNearLabel = () => '';
      window.leftmostOmniSaveButton = () => document.getElementById('save');
      window.omniFooterPanel = () => document.getElementById('footer');
      window.confirm = () => window.confirmed;
      window.alert = message => { throw Error(message); };
      document.getElementById('admin').onclick = () => { window.adminOpened++; };
    });
    const functions = ['currentQuotePdfOrderId', 'placeOmniActionButton', 'layoutOmniWorkflowButtons', 'nativeConvertToSalesOrderControl', 'confirmConvertToSalesOrder', 'convertQuoteToSalesOrder', 'continueConvertToSalesOrderFromAdmin', 'addConvertToSalesOrderButton', 'addCloneQuoteButton', 'nativeCopyAllItemsControl', 'cloneCurrentQuote', 'continueCloneQuoteFromAdmin', 'clickNativeCloneAction', 'continueSaveClonedQuote'];
    await page.addScriptTag({ content: `const CLONE_QUOTE_SAVE_KEY='clone-save', CLONE_QUOTE_BUTTON_ID='lc-clone-quote-button', CLONE_QUOTE_INTENT_KEY='clone-intent', CONVERT_ORDER_BUTTON_ID='lc-convert-sales-order-button', CONVERT_ORDER_INTENT_KEY='convert-intent', QUOTE_PDF_BUTTON_ID='download', BUTTON_ID='site', QUOTE_REVIEW_BUTTON_ID='review', HUBSPOT_BUTTON_ID='hubspot', OMNI_TOOLS_BAR_ID='toolbar';\n${functions.map(extract).join('\n')}` });
    await page.evaluate(() => { addConvertToSalesOrderButton(); convertQuoteToSalesOrder(); });
    assert.equal(await page.locator('#lc-convert-sales-order-button').count(), 0);
    assert.equal(await page.evaluate(() => window.adminOpened), 0, 'Do not bypass HubSpot gate');
    await page.evaluate(() => {
      window.copied = 0;
      addCloneQuoteButton();
      const wrong = document.createElement('button'); wrong.textContent = 'Copy Selected Items'; wrong.onclick = () => { throw Error('Must copy ALL items'); }; document.body.appendChild(wrong);
    });
    await page.locator('#lc-clone-quote-button').click();
    assert.equal(await page.evaluate(() => window.adminOpened), 1, 'Clone does not require HubSpot');
    await page.evaluate(() => {
      const actions = document.createElement('button'); actions.textContent = 'Actions';
      actions.onclick = () => {
        const copy = document.createElement('button'); copy.id = 'native-copy'; copy.textContent = 'Copy All Items';
        copy.onclick = () => { window.copied++; }; document.body.appendChild(copy);
      };
      document.body.appendChild(actions);
      continueCloneQuoteFromAdmin();
    });
    await page.waitForFunction(() => window.copied === 1);
    await page.evaluate(() => continueCloneQuoteFromAdmin());
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => window.copied), 1, 'Clone intent consumed once');
    await page.locator('#lc-clone-quote-button').click();
    assert.equal(await page.evaluate(() => window.copied), 2, 'Use native Copy All Items when available');
    await page.evaluate(() => {
      sessionStorage.setItem('clone-intent', JSON.stringify({ orderId: '999', quoteNumber: 'NZSO-OTHER', at: Date.now() }));
      continueCloneQuoteFromAdmin();
      window.adminOpened = 0; window.complete = true; addConvertToSalesOrderButton(); layoutOmniWorkflowButtons();
    });
    assert.equal(await page.evaluate(() => window.copied), 2, 'Never clone a different quote');
    const button = page.locator('#lc-convert-sales-order-button');
    assert(await button.isVisible());
    assert(await page.evaluate(() => document.getElementById('lc-convert-sales-order-button').previousElementSibling.id === 'lc-clone-quote-button'));
    assert(await page.evaluate(() => document.getElementById('lc-clone-quote-button').previousElementSibling.id === 'download'));
    await page.screenshot({ path: '/tmp/lc-convert-sales-order-button.png' });
    await button.click();
    const popup = page.locator('#lc-convert-order-confirm');
    assert(await popup.isVisible());
    assert.equal(await page.evaluate(() => window.adminOpened), 0, 'The opening click must not confirm');
    await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => window.adminOpened), 0, 'Cancellation must do nothing');
    const box = await button.boundingBox();
    await button.click();
    const confirmBox = await popup.getByRole('button', { name: 'Convert', exact: true }).boundingBox();
    assert(Math.abs(box.x + box.width / 2 - confirmBox.x - confirmBox.width / 2) < 2);
    assert(Math.abs(box.y + box.height / 2 - confirmBox.y - confirmBox.height / 2) < 2);
    await page.screenshot({ path: '/tmp/lc-convert-order-confirm.png' });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.adminOpened === 1);
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
    await button.click();
    await page.keyboard.press('Escape');
    assert.equal(await popup.count(), 0);
    await button.click();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.converted === 2);
    await page.setViewportSize({ width: 390, height: 700 });
    await button.click();
    const mobileBox = await popup.getByRole('dialog').boundingBox();
    assert(mobileBox.x >= 8 && mobileBox.x + mobileBox.width <= 382);
    assert(mobileBox.y >= 8 && mobileBox.y + mobileBox.height <= 692);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      sessionStorage.setItem('convert-intent', JSON.stringify({ orderId: '999', quoteNumber: 'NZSO-OTHER', at: Date.now() }));
      continueConvertToSalesOrderFromAdmin();
      window.documentType = 'sales-order'; addConvertToSalesOrderButton(); addCloneQuoteButton();
    });
    assert.equal(await button.count(), 0, 'Hide on sales orders');
    assert.equal(await page.locator('#lc-clone-quote-button').count(), 0, 'Clone only quotes');
    assert.equal(await page.evaluate(() => window.converted), 2, 'Never convert a different quote');
    console.log('PASS: Clone Quote toolbar order, Copy All Items directly and via one-time Admin handoff, wrong-quote protection, quote-only display; conversion gating and confirmation preserved. Native actions mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
