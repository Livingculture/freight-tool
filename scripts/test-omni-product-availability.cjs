const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.route('https://go.cin7.com/**', route => {
      const url = route.request().url();
      if (url.includes('/Cloud/ShoppingCartAdmin/Products/ProductsList.aspx')) {
        return route.fulfill({ contentType: 'text/html', body: `
          <style>td,th{width:120px;height:36px}</style>
          <table><tr><th>Code</th><th>Stock Avail</th><th>SOH</th><th>Virtual Stock</th><th>Holding Stock</th><th>Incoming Stock</th><th>Supplier Stock</th></tr>
          <tr><td>LC1001</td><td>8</td><td>10</td><td>7</td><td>2</td><td>4</td><td>1</td></tr></table>
          <input placeholder="Search"><button>Search</button>` });
      }
      return route.fulfill({ contentType: 'text/html', body: `
        <style>td,th{width:150px;height:40px}</style>
        <table id="quote-lines"><tr><th>Code</th><th>Product</th><th>Qty Ordered</th></tr>
        <tr><td><input value=""><span>LC1001</span></td><td><input value=""><span>Outdoor chair</span></td><td><input value=""><span>2</span></td></tr></table>` });
    });

    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=123');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../userscripts/omni-product-availability.user.js'), 'utf8') });
    await page.waitForFunction(() => document.getElementById('lc-omni-quote-stock')?.shadowRoot?.querySelector('tbody tr td'));
    const cells = await page.locator('#lc-omni-quote-stock').locator('tbody tr td').allTextContents();
    assert.deepEqual(cells.slice(0, 3), ['LC1001', 'Outdoor chair', '2'], 'Saved line text is read when Omni reopens it with blank editors');
    await page.waitForFunction(() => document.getElementById('lc-omni-quote-stock')?.shadowRoot?.querySelectorAll('tbody tr td').length === 10);
    const completed = await page.locator('#lc-omni-quote-stock').locator('tbody tr td').allTextContents();
    assert.deepEqual(completed, ['LC1001', 'Outdoor chair', '2', '8', '10', '7', '2', '4', '1', '0']);
    console.log('PASS: Existing Omni line items automatically restore their stock display after reopening a quote.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
