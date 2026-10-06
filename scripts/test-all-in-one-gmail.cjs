const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
execFileSync(process.execPath, [path.join(__dirname, 'bundle-all-in-one-gmail.cjs'), '--check']);
const directory = path.join(__dirname, '../userscripts');
const loader = fs.readFileSync(path.join(directory, 'livingculture-all-in-one.user.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://mail.google.com/**', route => route.fulfill({
      body: `<html><head><meta charset="utf-8"><script nonce="lc-test">${loader}</script></head><body></body></html>`, contentType: 'text/html',
      headers: { 'Content-Security-Policy': "script-src 'nonce-lc-test'; style-src 'unsafe-inline'" }
    }));
    await page.addInitScript(() => {
      window.GM_getResourceText = () => { throw new Error('Gmail must not need remote code resources'); };
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
    });
    await page.goto('https://mail.google.com/mail/u/0/');
    assert.deepEqual(await page.evaluate(() => window.__lcAllInOneStatus.errors), []);
    assert.equal(await page.evaluate(() => window.__lcAllInOneStatus.loaded.length), 4);
    await page.locator('#lc-gmail-drawings-button').waitFor({ state: 'visible' });
    await page.locator('#lc-gmail-care-guides-button').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#lc-gmail-add-quote-hint').count(), 0);
    await page.screenshot({ path: '/tmp/lc-all-in-one-gmail-inbox.png' });
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
    async function checkAttachmentRow() {
      const layout = await page.evaluate(() => {
        const toolbar = document.getElementById('lc-gmail-attachment-toolbar');
        const ids = ['lc-gmail-drawings-button', 'lc-gmail-care-guides-button', 'lc-gmail-add-quote-hint'];
        return {
          adjacent: toolbar.nextSibling?.id === ids[2],
          boxes: ids.map(id => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return { left: rect.left, right: rect.right, middle: rect.top + rect.height / 2 };
          })
        };
      });
      assert(layout.adjacent, 'Toolbar must sit immediately before Add Quote');
      assert(layout.boxes[0].right <= layout.boxes[1].left);
      assert(layout.boxes[1].right <= layout.boxes[2].left);
      assert(Math.abs(layout.boxes[0].middle - layout.boxes[2].middle) < 2, 'Buttons must share one centred row');
    }
    await checkAttachmentRow();
    await page.setViewportSize({ width: 800, height: 700 });
    await page.waitForTimeout(600);
    await checkAttachmentRow();
    await page.screenshot({ path: '/tmp/lc-gmail-attachment-row.png' });
    await page.setViewportSize({ width: 1200, height: 900 });
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
    console.log('PASS: Gmail tools load under strict CSP; Drawings and Care Guides sit before Add Quote on one row across resized viewports and survive compose removal. No emails sent.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
