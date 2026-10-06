const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const directory = path.join(__dirname, '../userscripts');
const loader = fs.readFileSync(path.join(directory, 'livingculture-all-in-one.user.js'), 'utf8');
const resources = Object.fromEntries([...loader.matchAll(/^\/\/ @resource\s+(\w+)\s+\S+\/([^/?]+)(?:\?.*)?$/gm)]
  .filter(([, name]) => name.startsWith('gmail'))
  .map(([, name, file]) => [name, fs.readFileSync(path.join(directory, file), 'utf8')]));

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://mail.google.com/**', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('https://mail.google.com/mail/u/0/');
    await page.evaluate(resources => {
      window.GM_getResourceText = name => resources[name];
      window.GM_getValue = (_, fallback) => fallback;
      window.GM_setValue = () => {};
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = options => {
        const payload = JSON.stringify([[['drawing-id', null, 'Pergola drawing.pdf', 'application/pdf']]]);
        const responseText = options.url.includes('drive.google.com')
          ? `window['_DRIVE_ivd'] = '${payload}'`
          : JSON.stringify({ files: [] });
        setTimeout(() => options.onload({ status: 200, responseText }), 0);
      };
    }, resources);
    await page.addScriptTag({ content: loader });
    assert.deepEqual(await page.evaluate(() => window.__lcAllInOneStatus.errors), []);
    assert.equal(await page.evaluate(() => window.__lcAllInOneStatus.loaded.length), 4);
    await page.locator('#lc-gmail-drawings-button').waitFor({ state: 'visible' });
    await page.locator('#lc-gmail-care-guides-button').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#lc-gmail-add-quote-hint').count(), 0);
    // Gmail creates compose windows after the userscript has already started.
    await page.evaluate(() => {
      const compose = document.createElement('div');
      compose.setAttribute('role', 'dialog');
      compose.style.cssText = 'position:fixed;right:20px;bottom:20px;width:600px;height:650px;background:white';
      compose.innerHTML = '<div aria-label="Message Body" contenteditable="true" style="height:500px">Draft</div><div><button command="+Att" aria-label="Attach files">Paperclip</button></div>';
      document.body.appendChild(compose);
    });
    await page.locator('#lc-gmail-drawings-button').waitFor({ state: 'visible' });
    await page.locator('#lc-gmail-care-guides-button').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#lc-gmail-add-quote-hint').innerText(), 'Add Quote →');
    assert(await page.evaluate(() => document.getElementById('lc-gmail-add-quote-hint').nextSibling.matches('[command="+Att"]')));
    await page.locator('#lc-gmail-drawings-button').dispatchEvent('pointerdown');
    await page.locator('#lc-gmail-drawings-panel').waitFor({ state: 'visible' });
    await page.locator('#lc-gmail-care-guides-button').dispatchEvent('pointerdown');
    await page.locator('#lc-gmail-care-guides-panel').waitFor({ state: 'visible' });
    await page.screenshot({ path: '/tmp/lc-all-in-one-gmail.png' });
    await page.evaluate(() => document.querySelector('[role="dialog"]').remove());
    await page.waitForTimeout(600);
    assert(await page.locator('#lc-gmail-attachment-toolbar').isVisible());
    assert.equal(await page.locator('#lc-gmail-add-quote-hint').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: Gmail tools load; Drawings and Care Guides remain visible in the inbox and compose. Paperclip label follows compose. Popups open without sending email.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
