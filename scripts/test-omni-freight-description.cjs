const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-cin7-lc-freight.user.js', 'utf8');
const names = ['clean', 'moneyToNumber', 'isVisible', 'isInjectedPanelElement', 'getAllVisiblePageElements',
  'findOmniFreightLabel', 'findOmniFreightInputs', 'syncFreightDescriptionDropdown', 'ensureFreightDescriptionDropdown',
  'setOmniInputValue', 'fillOmniFreightFields'];
const functions = names.map(name => {
  const start = source.indexOf(`  function ${name}(`);
  assert(start > 0, name);
  const tail = source.slice(start + 1);
  const next = tail.search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}).join('\n');
const options = ['Ship from Auckland', 'Ship from Chch', 'Collect from Warehouse', 'Collect from Showroom'];
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
    await page.setContent(`<style>body{font:14px Arial;margin:24px}.row{display:flex;align-items:center;gap:4px;margin:8px 0}label{width:85px;text-align:right}input{height:34px;border:1px solid #9eb7bc;border-radius:4px;padding:4px 8px;box-sizing:border-box;font:14px Arial}.description{width:230px}.amount{width:100px;text-align:right}</style><h1>Edit Quote - Customer - NZSO-15512</h1><form><div class="row"><label>Freight</label><input class="description" id="description" name="FreightDescription" value="Collect"><input class="amount" id="amount" name="FreightAmount" value="579.00"></div><div class="row"><label>Surcharge</label><input class="description" id="surcharge" value="Surcharge description"><input class="amount" value="0.00"></div><div class="row"><label>Discount</label><input class="description" id="discount" value="Deal"><input class="amount" value="250.00"></div></form>`);
    const original = await page.locator('#description').boundingBox();
    await page.addScriptTag({ content: `const FREIGHT_DESCRIPTION_SELECT_ID='lc-omni-freight-description-select';const FREIGHT_DESCRIPTION_OPTIONS=${JSON.stringify(options)};let freightDescriptionInput=null;let freightDescriptionDisplay='';let freightDescriptionSyncCleanup=null;${functions}` });
    await page.evaluate(() => {
      window.nativeChanges = 0;
      document.getElementById('description').addEventListener('change', () => window.nativeChanges++);
      ensureFreightDescriptionDropdown(); ensureFreightDescriptionDropdown();
    });
    const dropdown = page.getByRole('combobox', { name: 'Freight description' });
    assert.equal(await dropdown.count(), 1);
    assert.equal(await dropdown.inputValue(), 'Collect', 'Preserve the current legacy description');
    const box = await dropdown.boundingBox();
    assert.equal(box.width, original.width);
    assert.equal(box.height, original.height);
    for (const value of options) {
      assert.equal(await page.locator('datalist option').filter({ hasText: value }).count(), 1);
      await dropdown.fill(value);
      await dropdown.blur();
      assert.equal(await page.locator('#description').inputValue(), value);
      assert.equal(await page.evaluate(() => new FormData(document.querySelector('form')).get('FreightDescription')), value, 'Native saved field retains chosen value');
      assert.equal(await page.locator('#amount').inputValue(), '579.00', 'Description choice never changes the charge');
    }
    assert.equal(await page.evaluate(() => window.nativeChanges), 4, 'Each manual choice fires the native change once');
    await dropdown.fill('Deliver to side gate after 10am');
    await page.evaluate(() => ensureFreightDescriptionDropdown());
    assert.equal(await dropdown.inputValue(), 'Deliver to side gate after 10am', 'Periodic sync preserves custom typing');
    assert.equal(await page.evaluate(() => new FormData(document.querySelector('form')).get('FreightDescription')), 'Deliver to side gate after 10am', 'Custom typing updates the native saved field');
    await dropdown.blur();
    assert.equal(await page.locator('#amount').inputValue(), '579.00');
    assert.equal(await page.locator('#surcharge').inputValue(), 'Surcharge description');
    assert.equal(await page.locator('#discount').inputValue(), 'Deal');
    assert.equal(await page.evaluate(() => fillOmniFreightFields('$145.25', 'Ship from Auckland')), true);
    assert.equal(await dropdown.inputValue(), 'Ship from Auckland');
    assert.equal(await page.locator('#description').inputValue(), 'Ship from Auckland');
    assert.equal(await page.locator('#amount').inputValue(), '145.25', 'Calculator still writes the amount, not the description control');
    await page.evaluate(() => fillOmniFreightFields('$250.00', 'Ship from Auckland + Christchurch'));
    assert.equal(await dropdown.inputValue(), 'Ship from Auckland + Christchurch', 'Special calculator wording is not truncated');
    assert.equal(await page.locator('datalist option').count(), 4, 'Custom wording does not duplicate the preset suggestions');
    await dropdown.fill('Collect from Warehouse');
    await dropdown.blur();
    await page.evaluate(() => fillOmniFreightFields('$0.00', ''));
    assert.equal(await dropdown.inputValue(), 'Collect from Warehouse', 'Blank calculator method preserves the description');
    assert.equal(await page.locator('#amount').inputValue(), '0.00');
    await page.screenshot({ path: '/tmp/lc-freight-description-desktop.png' });
    await page.evaluate(() => {
      document.querySelector('h1').textContent = 'Edit Sales Order - Customer - NZSO-15512';
      const old = document.getElementById('description');
      const replacement = old.cloneNode();
      replacement.style.display = '';
      replacement.value = 'Collect from Showroom';
      old.replaceWith(replacement);
      ensureFreightDescriptionDropdown();
    });
    assert.equal(await dropdown.count(), 1, 'Re-render does not duplicate the dropdown');
    assert.equal(await dropdown.inputValue(), 'Collect from Showroom');
    await dropdown.fill('Ship from Chch');
    await dropdown.blur();
    assert.equal(await page.locator('#description').inputValue(), 'Ship from Chch');
    await page.evaluate(() => { document.getElementById('description').readOnly = true; ensureFreightDescriptionDropdown(); });
    assert(await dropdown.isDisabled(), 'Read-only native fields remain read-only');
    await page.evaluate(() => { document.getElementById('description').readOnly = false; document.getElementById('lc-omni-freight-description-select').remove(); ensureFreightDescriptionDropdown(); });
    assert.equal(await dropdown.inputValue(), 'Ship from Chch', 'Recover a removed dropdown without losing the native field');
    await page.setViewportSize({ width: 480, height: 750 });
    await page.screenshot({ path: '/tmp/lc-freight-description-mobile.png' });
    assert.equal(await dropdown.count(), 1);
    await page.setContent('<div style="display:flex;align-items:center;gap:4px"><label>Freight</label><input id="amount-only" name="FreightAmount" value="42.00"></div>');
    await page.evaluate(() => ensureFreightDescriptionDropdown());
    assert.equal(await dropdown.count(), 0, 'Do not replace an amount-only freight row with a description dropdown');
    assert.equal(await page.evaluate(() => fillOmniFreightFields('$37.00', 'Ship from Auckland')), true);
    assert.equal(await page.locator('#amount-only').inputValue(), '37.00');
    console.log('PASS: Four freight choices save through native inputs, charges stay unchanged on manual selection, calculator autofill and custom methods remain intact, and re-render/read-only handling works.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
