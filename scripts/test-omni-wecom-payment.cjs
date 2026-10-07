const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../userscripts/cin7-wecom-payment-message.user.js'), 'utf8');
const reps = fs.readFileSync(path.join(__dirname, '../userscripts/livingculture-reps.json'), 'utf8');
const staff = JSON.parse(reps);
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: `
      <h1>Edit Sales Order - Customer - NZSO-15502</h1>
      <table><tr><th>Payment Type</th><th>Amount<br>NZD</th><th>Date</th><th>Comments</th></tr>
      <tr><td><select><option>EFTPOS</option></select></td><td><input value="12,899.99"></td><td><input value="7-10-2026 7:17 pm"></td><td><input></td></tr></table>
      <button>Add a new payment</button><p>Total Paid: 12,899.99</p><p>Total Owing: 0.00</p>` }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=397');
    await page.evaluate(reps => {
      window.GM_getResourceText = () => reps;
      window.sent = [];
      window.GM_xmlhttpRequest = options => { window.sent.push(JSON.parse(options.data)); options.onload({ status: 200, responseText: '{"errcode":0}' }); };
    }, reps);
    await page.addScriptTag({ content: source });
    const button = page.locator('#lc-send-as-wecom-payment-btn');
    await button.waitFor({ state: 'visible' });
    assert(await page.evaluate(() => document.getElementById('lc-wecom-payment-wrapper').previousElementSibling.textContent === 'Add a new payment'));
    await button.click();
    assert.equal(await page.locator('#lc-send-as-wecom-menu button').count(), staff.length);
    await page.locator('#lc-send-as-wecom-menu').getByRole('button', { name: 'PEN-Steve', exact: true }).click();
    const preview = page.locator('#lc-wecom-payment-confirm-overlay textarea');
    assert.equal(await preview.inputValue(), 'NZSO-15502 EFTPOS payment $12,899.99 paid in full — Steve, PEN');
    assert.equal(await page.evaluate(() => window.sent.length), 0, 'Selecting a rep must not send');
    await page.screenshot({ path: '/tmp/lc-omni-wecom-payment.png' });
    await page.locator('#lc-wecom-payment-confirm-overlay').getByRole('button', { name: 'Send to WeCom', exact: true }).click();
    assert.equal(await page.evaluate(() => window.sent.length), 1, 'Send only after explicit confirmation');
    await page.evaluate(() => {
      document.querySelector('table input').value = '6,449.99';
      document.querySelectorAll('p')[0].textContent = 'Total Paid: 6,449.99';
      document.querySelectorAll('p')[1].textContent = 'Total Owing: 6,449.99';
    });
    await button.click();
    await page.locator('#lc-send-as-wecom-menu').getByRole('button', { name: 'PEN-Steve', exact: true }).click();
    assert((await preview.inputValue()).includes('50% deposit'));
    assert.equal(await page.evaluate(() => window.sent.length), 1);
    const core = await browser.newPage();
    await core.route('https://inventory.dearsystems.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Invoice SO-123</h1><p>Invoice memo</p><div>Total NZD 100.00</div><h2>Payment</h2><button>+ Payment</button><table><tr><td>7/10/2026</td><td>EFTPOS</td><td>100.00</td></tr></table><p>Balance due (NZD) 0.00</p>' }));
    await core.goto('https://inventory.dearsystems.com/Sale');
    await core.evaluate(reps => {
      window.GM_getResourceText = () => reps;
      window.GM_xmlhttpRequest = () => { throw Error('Do not send a live Core message'); };
    }, reps);
    await core.addScriptTag({ content: source });
    await core.locator('#lc-send-as-wecom-payment-btn').click();
    await core.locator('#lc-send-as-wecom-menu').getByRole('button', { name: 'PEN-Steve', exact: true }).click();
    assert.equal(await core.locator('#lc-wecom-payment-confirm-overlay textarea').inputValue(), 'SO-123 EFTPOS payment $100.00 paid in full — Steve, PEN');
    console.log('PASS: Omni payment table detection, rep list, NZSO full-payment and deposit previews, explicit confirmation. WeCom requests mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
