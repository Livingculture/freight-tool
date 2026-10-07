const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const start = source.indexOf('  function omniFullyDispatchedState(');
const next = source.slice(start + 1).search(/\n  (?:async )?function /);
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div style="display:flex;gap:40px"><div><label>Created Date</label><div><input value="7-10-2026"><input value="5:17 pm"></div></div><div><label><b>2</b> Fully Dispatched</label><div><input id="dispatch"><input></div></div><div><label>Invoice Date</label><div><input value="7-10-2026"><input value="8:36 pm"></div></div></div>');
    await page.evaluate(() => {
      window.clean = value => String(value || '').trim();
      window.normalizeLabel = value => String(value || '').trim().toLowerCase();
      window.isVisible = node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
    });
    await page.addScriptTag({ content: source.slice(start, start + next + 1) });
    assert.equal(await page.evaluate(() => omniFullyDispatchedState()), false, 'Blank dispatch must not read Invoice Date');
    await page.locator('#dispatch').fill('8-10-2026');
    assert.equal(await page.evaluate(() => omniFullyDispatchedState()), true);
    await page.locator('#dispatch').fill('5:17 pm');
    assert.equal(await page.evaluate(() => omniFullyDispatchedState()), false, 'Time is not a dispatch date');
    await page.setContent('<label>Invoice Date</label><input value="7-10-2026">');
    assert.equal(await page.evaluate(() => omniFullyDispatchedState()), null, 'Absent dispatch is unknown');
    console.log('PASS: Blank Fully Dispatched never borrows Invoice Date; genuine date true, time false, absent field unknown.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
