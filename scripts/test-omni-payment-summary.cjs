const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const start = source.indexOf('  function omniPaymentSummary(');
const next = source.slice(start + 1).search(/\n  (?:async )?function /);
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [paid, owing, status] of [[12899.99, 0, 'PAID'], [6449.99, 6450, 'PART PAID'], [0, 12899.99, 'UNPAID']]) {
      await page.setContent(`<p>Total Paid: ${paid.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</p><p>Total Owing: ${owing.toFixed(2)}</p><p>Invoiced Total 0.0000</p>`);
      await page.addScriptTag({ content: source.slice(start, start + next + 1) });
      const result = await page.evaluate(() => omniPaymentSummary());
      assert.equal(result.total, 12899.99);
      assert.equal(result.paidAmount, paid);
      assert.equal(result.balanceDue, owing);
      assert.equal(result.paymentStatus, status);
      assert.equal(result.paid, status === 'PAID');
    }
    await page.setContent('<p>Invoice Total $12899.99</p><p>Created Date 7-10-2026</p>');
    assert.equal((await page.evaluate(() => omniPaymentSummary())).paid, null, 'Unknown is not unpaid');
    await page.setContent('<p>Total Paid: 0.00</p><p>Total Owing: 0.00</p>');
    assert.equal((await page.evaluate(() => omniPaymentSummary())).paid, false, 'An empty zero-value quote is not paid');
    console.log('PASS: Omni full/partial/unpaid amounts, zero balances, unknown payment information and zero totals. Browser mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
