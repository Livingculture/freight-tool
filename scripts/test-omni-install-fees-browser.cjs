const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: `
      <style>td,th{width:160px;height:42px;border:1px solid #ddd}table{border-collapse:collapse}input{width:130px}button{height:36px}</style>
      <table><tr><th>Code</th><th>Product</th><th>Option1</th><th>Option2</th><th>Option3</th><th>Qty Ordered</th><th>Unit Price</th></tr>
      <tr><td>CS123</td><td>Tasman Motorised Freestanding Pergola</td><td>4 x 3m</td><td>Black</td><td></td><td>2</td><td>9999</td></tr>
      ${Array.from({ length: 3 }, () => '<tr><td class="code">Search...</td><td class="product">Search...</td><td></td><td></td><td></td><td><input value=""></td><td><input value=""></td></tr>').join('')}
      </table><button>Add a new line</button>` }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=388');
    await page.evaluate(() => {
      window.GM_xmlhttpRequest = options => setTimeout(() => options.onload({ status: 200, responseText: 'Product Code,Name,Price\nAS10037,Assembly Freestanding Motorised Pergola Tasman Up to 16m2,2000' }), 10);
      for (const cell of document.querySelectorAll('td.code')) cell.addEventListener('click', () => {
        if (cell.querySelector('input')) return;
        cell.innerHTML = '<input>';
        const input = cell.firstChild;
        input.focus();
        input.addEventListener('input', () => {
          document.getElementById('option')?.remove();
          const rect = input.getBoundingClientRect();
          const option = document.createElement('div');
          option.id = 'option';
          option.setAttribute('role', 'option');
          option.textContent = input.value;
          option.style.cssText = `position:fixed;top:${rect.bottom}px;left:${rect.left}px;width:180px;height:32px;background:white;z-index:100`;
          option.addEventListener('click', () => {
            cell.textContent = option.textContent;
            cell.parentElement.querySelector('.product').textContent = 'Assembly Freestanding Motorised Pergola Tasman Up to 16m2';
            option.remove();
          });
          document.body.append(option);
        });
      });
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../userscripts/omni-install-fee-helper.user.js'), 'utf8') });
    await page.locator('#lc-omni-install-fee-button').click();
    await page.waitForFunction(() => !document.getElementById('lc-omni-install-fee-button').disabled);
    const values = await page.locator('td.code').first().evaluate(cell => ({
      code: cell.textContent, quantity: cell.parentElement.children[5].querySelector('input').value,
      price: cell.parentElement.children[6].querySelector('input').value
    }));
    assert.deepEqual(values, { code: 'AS10037', quantity: '2', price: '2000' });
    await page.locator('#lc-omni-install-fee-root').locator('.close').click();
    await page.locator('#lc-omni-install-fee-button').click();
    await page.waitForFunction(() => !document.getElementById('lc-omni-install-fee-button').disabled);
    assert.equal(await page.locator('body > table td.code').filter({ hasText: 'AS10037' }).count(), 1);
    await page.screenshot({ path: '/tmp/lc-install-fees-auto.png' });
    console.log('PASS browser: matched fee inserted, quantity 2, price 2000, repeat click does not duplicate');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
