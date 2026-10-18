const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: `
      <style>td,th{width:150px;height:42px;border:1px solid #ddd}table{border-collapse:collapse}input{width:130px}</style>
      <label>Delivery Instructions<textarea aria-label="Delivery Instructions">Installation required</textarea></label>
      <table id="quote"><tr><th>Code</th><th>Product</th><th>Option1</th><th>Option2</th><th>Option3</th><th>Qty Ordered</th><th>Unit Price</th></tr>
      <tr><td>CS123</td><td>Tasman Motorised Freestanding Louvre Roof Aluminium Pergola</td><td>4 x 3m</td><td>Black</td><td></td><td>1</td><td>9999</td></tr></table>
      <button>Add a new line</button>` }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=456');
    await page.evaluate(() => {
      window.blankLineAddedAt = 0;
      window.codeEditorReplaced = false;
      window.setTimeout(() => {
        const row = document.createElement('tr');
        row.innerHTML = '<td class="code">Search...</td><td class="product">Search...</td><td></td><td></td><td></td><td><input value="1"></td><td><input value="2000"></td>';
        document.getElementById('quote').appendChild(row);
        window.blankLineAddedAt = performance.now();
        const codeCell = row.querySelector('.code');
        codeCell.addEventListener('click', () => {
          if (codeCell.querySelector('input')) return;
          codeCell.innerHTML = '<input>';
          const input = codeCell.firstChild;
          input.focus();
          const watch = editor => editor.addEventListener('input', () => {
            if (!window.codeEditorReplaced) {
              window.codeEditorReplaced = true;
              const replacement = document.createElement('input');
              editor.replaceWith(replacement);
              replacement.focus();
              watch(replacement);
              return;
            }
            window.setTimeout(() => {
            if (!editor.isConnected || document.getElementById('fee-option')) return;
            const option = document.createElement('div');
            option.id = 'fee-option'; option.setAttribute('role', 'option'); option.textContent = editor.value;
            option.style.cssText = 'position:fixed;left:20px;top:500px;width:180px;height:32px;background:white';
            option.addEventListener('click', () => {
              codeCell.textContent = option.textContent;
              row.querySelector('.product').textContent = 'Assembly Freestanding Motorised Pergola Tasman Up to 16m²';
              option.remove();
            });
            document.body.appendChild(option);
            }, 100);
          });
          watch(input);
        });
      }, 1600);
    });
    await page.addInitScript(() => {});
    await page.evaluate(() => {
      window.GM_xmlhttpRequest = options => window.setTimeout(() => options.onload({
        status: 200,
        responseText: 'Product Code,Name,Price\nAS10037,Assembly Freestanding Motorised Pergola Tasman Up to 16m²,2000'
      }), 10);
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../userscripts/omni-install-fee-helper.user.js'), 'utf8') });
    await page.waitForFunction(() => [...document.querySelectorAll('#quote td')].some(cell => cell.textContent === 'AS10037'), null, { timeout: 15000 });
    assert(await page.evaluate(() => window.blankLineAddedAt > 0), 'The blank line was deliberately added after automatic matching began');
    assert.equal(await page.evaluate(() => window.codeEditorReplaced), true, 'The fixture reproduced Omni replacing the first Code editor');
    assert.equal(await page.locator('#quote td').filter({ hasText: /^AS10037$/ }).count(), 1);
    console.log('PASS: Automatic installation waits for Omni to create its delayed blank product line.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
