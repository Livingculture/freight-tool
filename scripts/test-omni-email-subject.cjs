const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const app = fs.readFileSync('../living-culture-email-helper/index.html', 'utf8');
const helper = fs.readFileSync('userscripts/omni-email-helper-compose.user.js', 'utf8')
  .replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, '');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://living-culture-email-helper.vercel.app/**', route => route.fulfill({
      body: app,
      contentType: 'text/html'
    }));
    await page.goto('https://living-culture-email-helper.vercel.app/?theme=omni&embedded=1&quote=NZSO-18196&first=Allen&product=Atlantic%20Pergola');
    await page.addScriptTag({ content: helper });
    const subject = page.locator('#subject-output');
    await assert.doesNotReject(() => subject.waitFor());
    await page.waitForTimeout(2600);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#order').inputValue(), 'NZSO-18196');
    assert.equal(await subject.inputValue(), 'NZSO-18196');
    const buttons = page.locator('#template-buttons button');
    assert((await buttons.count()) > 10, 'Email templates must remain available');
    for (const index of [0, 4, 9]) {
      await buttons.nth(index).click();
      await page.waitForTimeout(20);
      assert.equal(await subject.inputValue(), 'NZSO-18196');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: every generated Omni email subject contains only the NZSO number; email bodies and template selection remain available. Browser fixture only; no email sent.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
