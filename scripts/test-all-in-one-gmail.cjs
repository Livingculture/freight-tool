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
      window.completedUploads = [];
      window.GM_xmlhttpRequest = options => {
        const data = typeof options.data === 'string' ? JSON.parse(options.data) : {};
        if (options.method === 'POST' || options.method === 'PUT') {
          if (data.action === 'complete') window.completedUploads.push(data.quoteNumbers);
          const body = data.action === 'prepare'
            ? { ok: true, signedUrl: 'https://example.invalid/mock-upload', storagePath: 'pending/test.pdf' }
            : { ok: true, deals: [{ id: 'mock-deal' }] };
          setTimeout(() => options.onload({ status: 200, responseText: JSON.stringify(body) }), 0);
          return;
        }
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
    await page.evaluate(() => {
      const compose = document.createElement('div');
      compose.setAttribute('role', 'dialog');
      compose.innerHTML = '<input name="subjectbox" value="NZSO-15502 - Customer"><input type="file" id="mock-attachment">';
      document.body.appendChild(compose);
    });
    await page.locator('#mock-attachment').setInputFiles({ name: 'drawing.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF mock') });
    await page.waitForFunction(() => window.completedUploads.length === 1);
    assert.deepEqual(await page.evaluate(() => window.completedUploads), [['NZSO-15502']]);
    await page.locator('#mock-attachment').dispatchEvent('change');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.completedUploads.length), 1, 'Do not upload the same file twice');
    await page.evaluate(() => {
      document.querySelector('[role="dialog"]').remove();
      const compose = document.createElement('div');
      compose.setAttribute('role', 'dialog');
      compose.innerHTML = '<input name="subjectbox" value="NZSO-15502 - Customer"><input type="file" id="mock-attachment">';
      document.body.appendChild(compose);
    });
    await page.locator('#mock-attachment').setInputFiles({ name: 'NZSO-15503.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF mock') });
    await page.waitForFunction(() => window.completedUploads.length === 2);
    assert.deepEqual(await page.evaluate(() => window.completedUploads[1]), ['NZSO-15503'], 'A named quote PDF uses its own quote number');
    await page.evaluate(() => {
      document.querySelector('[role="dialog"]').remove();
      const compose = document.createElement('div');
      compose.setAttribute('role', 'dialog');
      compose.innerHTML = '<input name="subjectbox" value="SFOR12345 - Core customer"><input type="file" id="mock-attachment">';
      document.body.appendChild(compose);
    });
    await page.locator('#mock-attachment').setInputFiles({ name: 'core-guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF mock') });
    await page.waitForFunction(() => window.completedUploads.length === 3);
    assert.deepEqual(await page.evaluate(() => window.completedUploads[2]), ['SFOR12345']);
    await page.evaluate(() => {
      document.querySelector('[role="dialog"]').remove();
      document.getElementById('lc-gmail-hubspot-attachment-status')?.remove();
      const compose = document.createElement('div');
      compose.setAttribute('role', 'dialog');
      compose.innerHTML = '<input name="subjectbox" value="Team meeting"><input type="file" id="mock-attachment">';
      document.body.appendChild(compose);
    });
    await page.locator('#mock-attachment').setInputFiles({ name: 'agenda.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF mock') });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.completedUploads.length), 3, 'Ordinary email must not upload to HubSpot');
    assert.equal(await page.locator('#lc-gmail-hubspot-attachment-status').count(), 0, 'Ordinary attachments must not show a quote-number warning');
    assert.deepEqual(errors, []);
    console.log('PASS: Strict-CSP Gmail buttons and attachment row; NZSO subjects, quote filenames, SFOR compatibility and upload deduplication. All uploads mocked; no emails sent.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
