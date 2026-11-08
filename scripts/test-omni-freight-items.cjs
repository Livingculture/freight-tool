const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('userscripts/omni-cin7-lc-freight.user.js', 'utf8');
const names = ['clean', 'normaliseQuantity', 'isVisible', 'isInjectedPanelElement', 'getItemsFromOmniProductTable'];
const functions = names.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  assert(start > 0, name);
  const tail = source.slice(start + 1);
  const next = tail.search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}).join('\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 800 } });
    const rows = [
      ['CS19237-2', 1],
      ['CS19239-2', 2],
      ['CS19238-2', 1],
      ['CS19137-2-1', 1],
      ['AS10176', 1]
    ];
    await page.setContent(`<style>
      table{border-collapse:collapse}th,td{width:180px;height:34px;border:1px solid #ccc}
      .code{width:220px}.qty{width:160px}
    </style><table><thead><tr><th class="code">Code</th><th>Product</th><th class="qty">Qty Ordered</th></tr></thead><tbody>${rows.map(([sku, qty]) => `<tr><td class="code"><input value="${sku}"></td><td>Product</td><td class="qty"><input value="${qty}"></td></tr>`).join('')}</tbody></table>`);
    await page.addScriptTag({ content: functions });
    const items = await page.evaluate(() => getItemsFromOmniProductTable());
    assert.deepEqual(items, [
      { sku: 'CS19237-2', quantity: 1 },
      { sku: 'CS19239-2', quantity: 2 },
      { sku: 'CS19238-2', quantity: 1 },
      { sku: 'CS19137-2-1', quantity: 1 }
    ]);
    console.log('PASS: Omni freight detects every commercial line, including multi-part SKUs, preserves quantities and excludes assembly services.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
