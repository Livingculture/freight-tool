const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1184, height: 900 } });
    const html = path.resolve(__dirname, '../public/connected-workflow-guide.html');
    await page.goto(pathToFileURL(html).href);
    assert.equal(await page.locator('.sheet').count(), 3);
    assert.match(await page.locator('body').innerText(), /removing payment|Removing payment/);
    assert(!/30 seconds/.test(await page.locator('body').innerText()));
    await page.emulateMedia({ media: 'print' });
    assert(await page.locator('.sheet').evaluateAll(sheets => sheets.every(sheet => {
      const bounds = sheet.getBoundingClientRect();
      return [...sheet.children].every(child => child.getBoundingClientRect().bottom <= bounds.bottom + 1);
    })), 'All content fits the existing three-page layout');
    const pdf = path.resolve(__dirname, '../public/omni-workflow-hubspot-guide.pdf');
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    assert.equal((fs.readFileSync(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 3);
    await page.emulateMedia({ media: 'screen' });
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Guide fits ${width}px`);
      await page.screenshot({ path: `/tmp/lc-updated-workflow-guide-${width}.png`, fullPage: true });
    }
    await page.goto(pathToFileURL(path.resolve(__dirname, '../public/staff-button-guide.html')).href);
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('searchbox', { name: 'Search help' }).fill('Payment corrections');
      const topic = page.locator('.help-item').filter({ hasText: 'Payment corrections' });
      await topic.locator('summary').click();
      assert.match(await topic.innerText(), /Wait On Customer/);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `/tmp/lc-updated-staff-guide-${width}.png`, fullPage: true });
      await page.getByRole('searchbox', { name: 'Search help' }).fill('');
      if (await topic.getAttribute('open') !== null) await topic.locator('summary').click();
    }
    console.log('PASS: Updated content, existing three-page PDF, desktop/iPad/mobile fit.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
