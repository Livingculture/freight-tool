const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const blindCase = process.argv.includes('--blind');
const feeCode = blindCase ? 'AS10140' : 'AS10037';
const feeName = blindCase ? 'Assembly Motorised Blind Under 4m' : 'Assembly Freestanding Motorised Pergola Tasman Up to 16m2';
const price = blindCase ? '500' : '2000';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of (process.argv.includes('--native') ? ['native', 'dismissed'] : ['dropdown', 'keyboard', 'native', 'dismissed'])) {
    const keyboardSelection = mode !== 'dropdown';
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: `
      <style>td,th{width:160px;height:42px;border:1px solid #ddd}table{border-collapse:collapse}input{width:130px}button{height:36px}</style>
      <label for="memo">Delivery Instructions</label><textarea id="memo" aria-label="Delivery Instructions"></textarea>
      <table><tr><th>Code</th><th>Product</th><th>Option1</th><th>Option2</th><th>Option3</th><th>Qty Ordered</th><th>Unit Price</th></tr>
      <tr><td>CS123</td><td>Tasman Motorised Freestanding Pergola</td><td>4 x 3m</td><td>Black</td><td></td><td>2</td><td>9999</td></tr>
      ${Array.from({ length: 3 }, () => '<tr><td class="code">Search...</td><td class="product">Search...</td><td></td><td></td><td></td><td><input value=""></td><td><input value=""></td></tr>').join('')}
      </table><button>Add a new line</button>` }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=388');
    await page.locator('body > table').evaluate(table => {
      const row = document.createElement('tr');
      row.id = 'option-placeholders';
      row.innerHTML = '<td>AS999</td><td>Assembly display test</td><td><span>#N/A</span></td><td>#N/A</td><td>#N/A</td><td>1</td><td>100</td>';
      table.appendChild(row);
    });
    if (blindCase) await page.locator('body > table tr').nth(1).evaluate(row => {
      row.children[1].textContent = 'Motorised Outdoor Blind';
      row.children[2].textContent = '3m';
    });
    await page.evaluate(({ keyboardSelection, mode, feeCode, feeName, price }) => {
      window.GM_xmlhttpRequest = options => setTimeout(() => options.onload({ status: 200, responseText: `Product Code,Name,Price\n${feeCode},${feeName},${price}` }), 10);
      for (const cell of document.querySelectorAll('td.code')) cell.addEventListener('click', () => {
        if (cell.querySelector('input')) return;
        cell.innerHTML = '<input>';
        const input = cell.firstChild;
        input.focus();
        if (keyboardSelection) {
          input.addEventListener('keydown', event => {
            if (event.which !== 13 || event.keyCode !== 13) return;
            if (!input.dataset.lookupReady || (mode === 'keyboard' && !document.getElementById('option'))) {
              window.prematureEnter = true;
              cell.textContent = input.value;
              return;
            }
            cell.textContent = input.value;
            cell.parentElement.querySelector('.product').textContent = feeName;
            cell.parentElement.children[5].querySelector('input').value = '2';
            const spacer = document.createElement('tr');
            spacer.innerHTML = '<td colspan="7" style="height:100px">Quote rerender moved the new fee row</td>';
            cell.parentElement.before(spacer);
            document.getElementById('option')?.remove();
          });
        }
        input.addEventListener('input', () => {
          setTimeout(() => {
          if (!input.isConnected) return;
          input.dataset.lookupReady = '1';
          if (mode === 'native') return;
          document.getElementById('option')?.remove();
          const rect = input.getBoundingClientRect();
          const option = document.createElement('div');
          option.id = 'option';
          option.setAttribute('role', 'option');
          option.textContent = input.value;
          option.style.cssText = `position:fixed;top:${rect.bottom}px;left:${rect.left}px;width:180px;height:32px;background:white;z-index:100`;
          option.addEventListener('click', () => {
            if (keyboardSelection) {
              if (mode === 'dismissed') option.remove();
              return;
            }
            cell.textContent = option.textContent;
            cell.parentElement.querySelector('.product').textContent = feeName;
            cell.parentElement.children[5].querySelector('input').value = '2';
            option.remove();
          });
          document.body.append(option);
          }, 1400);
        });
      });
      for (const cell of document.querySelectorAll('td.code')) cell.parentElement.children[5].querySelector('input').addEventListener('input', () => {
        window.quantityEdits = (window.quantityEdits || 0) + 1;
      });
    }, { keyboardSelection, mode, feeCode, feeName, price });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../userscripts/omni-install-fee-helper.user.js'), 'utf8') });
    const placeholders = await page.locator('#option-placeholders').evaluate(row => [...row.children].slice(2, 5).map(cell => ({ text: cell.textContent, color: getComputedStyle(cell).color })));
    assert.deepEqual(placeholders.map(cell => cell.text), ['#N/A', '#N/A', '#N/A'], 'Keep native saved values unchanged');
    assert.equal(placeholders[0].color, 'rgba(0, 0, 0, 0)');
    assert.equal(placeholders[1].color, 'rgba(0, 0, 0, 0)');
    assert.notEqual(placeholders[2].color, 'rgba(0, 0, 0, 0)', 'Only Option1 and Option2 placeholders are hidden');
    assert.notEqual(await page.locator('body > table tr').nth(1).locator('td').nth(2).evaluate(cell => getComputedStyle(cell).color), 'rgba(0, 0, 0, 0)', 'Keep real size values visible');
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('body > table td.code').filter({ hasText: feeCode }).count(), 0, 'Blank memo must not add fees');
    await page.locator('#memo').fill('No installation required');
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('body > table td.code').filter({ hasText: feeCode }).count(), 0, 'No installation required must not add fees');
    await page.locator('#memo').fill('Installation required\n\nTerms and conditions');
    await page.locator('body > table tr').nth(1).locator('td').nth(5).evaluate(cell => {
      cell.innerHTML = '<input value="2">'; cell.firstChild.focus();
    });
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('body > table td.code').filter({ hasText: feeCode }).count(), 0, 'Do not interrupt editing');
    if (keyboardSelection) await page.locator('body > table td.code').first().evaluate((cell, feeCode) => {
      cell.textContent = feeCode;
      cell.parentElement.children[5].querySelector('input').value = '1';
    }, feeCode);
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForFunction(price => document.querySelector('td.code')?.parentElement.children[6].querySelector('input').value === price, price);
    await page.waitForFunction(() => !document.getElementById('lc-omni-install-fee-button').disabled);
    const values = await page.locator('td.code').first().evaluate(cell => ({
      code: cell.textContent, quantity: cell.parentElement.children[5].querySelector('input').value,
      price: cell.parentElement.children[6].querySelector('input').value
    }));
    assert.deepEqual(values, { code: feeCode, quantity: '2', price });
    assert.equal(await page.evaluate(() => window.quantityEdits || 0), 0, 'Do not edit a quantity already filled correctly by Omni');
    assert.equal(await page.evaluate(() => Boolean(window.prematureEnter)), false, 'Never commit the code before search results arrive');
    assert.equal(await page.locator('#lc-omni-install-fee-root').locator('#modal').evaluate(modal => modal.classList.contains('open')), false);
    assert.equal(await page.locator('#lc-omni-install-fee-root').locator('#toast').evaluate(toast => toast.classList.contains('error')), false);
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('body > table td.code').filter({ hasText: feeCode }).count(), 1);
    await page.locator('#lc-omni-install-fee-button').click();
    assert.equal(await page.locator('body > table td.code').filter({ hasText: feeCode }).count(), 1);
    await page.locator('#lc-omni-install-fee-root').locator('.close').click();
    await page.locator('#memo').fill('No installation required');
    await page.locator('body > table tr').nth(1).locator('input').fill('3');
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('body > table td.code').filter({ hasText: feeCode }).count(), 1, 'Removing installation requirement prevents further fees');
    await page.locator('#memo').fill('Installation required');
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForFunction(feeCode => [...document.querySelectorAll('body > table td.code')]
      .filter(cell => cell.textContent === feeCode)
      .reduce((sum, cell) => sum + Number(cell.parentElement.children[5].querySelector('input').value), 0) === 3, feeCode);
    await page.waitForFunction(() => !document.getElementById('lc-omni-install-fee-button').disabled);
    assert.equal(await page.locator('#lc-omni-install-fee-root').locator('#toast').evaluate(toast => toast.classList.contains('error')), false);
    await page.screenshot({ path: '/tmp/lc-install-fees-auto.png' });
    console.log(`PASS browser (${blindCase ? 'blinds' : 'pergolas'}, ${mode}): automatic Enter, delayed autocomplete, memo gate, quantity increase, incomplete-row recovery`);
    await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
