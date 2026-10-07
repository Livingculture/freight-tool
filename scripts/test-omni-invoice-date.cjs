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
    await page.setContent('<div><span>Created Date</span><input value="1-1-2020"></div><div><label><b>3</b> Invoice Date</label><div><input id="date"><input id="time"></div></div>');
    await page.evaluate(() => {
      window.type = 'sales-order';
      window.isOmniPage = () => true;
      window.omniHeadingDraft = () => ({ documentType: window.type });
      window.scheduleOmniWorkflowSync = () => {};
      window.normalizeLabel = value => value.trim().toLowerCase();
      window.changed = 0;
      document.getElementById('date').addEventListener('change', () => window.changed++);
    });
    await page.addScriptTag({ content: extract('localDateKey') + extract('fillOmniInvoiceDate') + extract('installOmniInvoiceDateHooks') });
    await page.evaluate(() => {
      installOmniInvoiceDateHooks();
      const save = document.createElement('button'); save.textContent = 'Save';
      save.onclick = () => { window.savedDate = document.getElementById('date').value; };
      document.body.appendChild(save);
    });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await page.evaluate(() => window.savedDate), await page.locator('#date').inputValue(), 'Fill before native Save handler');
    assert.match(await page.locator('#date').inputValue(), /^\d{1,2}-\d{1,2}-\d{4}$/);
    assert.match(await page.locator('#time').inputValue(), /^\d{1,2}:\d{2} (am|pm)$/);
    assert.equal(await page.evaluate(() => window.changed), 1);
    await page.locator('#date').fill('2-2-2024');
    await page.evaluate(() => fillOmniInvoiceDate());
    assert.equal(await page.locator('#date').inputValue(), '2-2-2024');
    await page.locator('#date').fill('');
    await page.evaluate(() => { window.type = 'quote'; fillOmniInvoiceDate(); });
    assert.equal(await page.locator('#date').inputValue(), '');
    await page.evaluate(() => { window.type = 'sales-order'; document.dispatchEvent(new Event('lc-omni-wecom-payment-sent')); });
    assert.notEqual(await page.locator('#date').inputValue(), '');
    console.log('PASS: Invoice date/time populated, change event fired, existing dates preserved, quotes unchanged.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
