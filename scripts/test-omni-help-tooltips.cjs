const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('userscripts/omni-help-tooltips.user.js', 'utf8');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://go.cin7.com/**', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><style>body{font:16px Arial;margin:30px}button{margin:5px;padding:10px}</style></head><body>
        <h1>Edit Quote - Test Customer - NZSO-17099 <span id="lc-omni-heading-actions"><button id="lc-omni-staff-help-button" title="Old short tip">Staff Guide</button></span></h1>
        <div id="lc-omni-workflow-tools-bar"><button id="lc-site-visit-inline-button-v2">Site Visit</button><button id="lc-quote-pdf-download-button-v1">Download Quote</button></div>
        <div id="lc-omni-website-shortcuts"><button>Tasman</button><button>Dining Tables</button></div>
        <div id="lc-omni-quote-stock"></div>
      </body></html>`
    }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx');
    await page.addScriptTag({ content: source });
    await page.addScriptTag({ content: source });

    const toggle = page.locator('#lc-omni-help-tips-toggle');
    await toggle.waitFor();
    assert.equal(await toggle.textContent(), 'Help Tips: On');
    assert.equal(await page.locator('#lc-omni-heading-actions > #lc-omni-help-tips-toggle').count(), 1, 'Toggle belongs with heading tools');
    assert.equal(await page.locator('#lc-omni-staff-help-button').getAttribute('title'), null, 'Native titles are suppressed while rich tips are on');

    await page.locator('#lc-site-visit-inline-button-v2').hover();
    await page.waitForFunction(() => document.querySelector('#lc-omni-help-tooltip')?.dataset.open === 'true');
    let tip = await page.locator('#lc-omni-help-tooltip').innerText();
    assert.match(tip, /Book or update a site visit/);
    assert.match(tip, /Workflow/);

    await page.locator('#lc-omni-website-shortcuts button', { hasText: 'Tasman' }).hover();
    await page.waitForTimeout(320);
    tip = await page.locator('#lc-omni-help-tooltip').innerText();
    assert.match(tip, /mounting type, model, size and colour/);

    await page.evaluate(() => {
      const host = document.getElementById('lc-omni-quote-stock');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button id="refresh">Refresh</button><a id="products" href="#">Open Products</a>';
    });
    await page.waitForFunction(() => document.querySelector('#lc-omni-quote-stock').shadowRoot.querySelector('#refresh')?.dataset.lcHelpTip === '1');
    await page.evaluate(() => document.querySelector('#lc-omni-quote-stock').shadowRoot.querySelector('#refresh').focus());
    tip = await page.locator('#lc-omni-help-tooltip').innerText();
    assert.match(tip, /Reload the latest available information/);

    await toggle.click();
    assert.equal(await toggle.textContent(), 'Help Tips: Off');
    assert.equal(await page.evaluate(() => localStorage.getItem('lc-omni-help-tooltips-enabled-v1')), 'false');
    assert.equal(await page.locator('#lc-omni-staff-help-button').getAttribute('title'), 'Old short tip', 'Original titles return when rich tips are off');
    await page.locator('#lc-quote-pdf-download-button-v1').hover();
    await page.waitForTimeout(350);
    assert.notEqual(await page.locator('#lc-omni-help-tooltip').getAttribute('data-open'), 'true');

    await page.reload();
    await page.addScriptTag({ content: source });
    await page.locator('#lc-omni-help-tips-toggle').waitFor();
    assert.equal(await page.locator('#lc-omni-help-tips-toggle').textContent(), 'Help Tips: Off', 'Saved setting survives a new page load');
    await page.locator('#lc-omni-help-tips-toggle').click();
    assert.equal(await page.locator('#lc-omni-help-tips-toggle').textContent(), 'Help Tips: On');

    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'lc-omni-install-fee-button';
      button.textContent = 'Install Fees';
      document.body.appendChild(button);
    });
    await page.waitForFunction(() => document.querySelector('#lc-omni-install-fee-button')?.dataset.lcHelpTip === '1');
    await page.locator('#lc-omni-install-fee-button').focus();
    tip = await page.locator('#lc-omni-help-tooltip').innerText();
    assert.match(tip, /approved installation services/);

    assert.equal(await page.locator('#lc-omni-help-tips-toggle').count(), 1, 'Standalone and All-in-One loading together still creates only one toggle');
    assert.deepEqual(errors, []);
    console.log('PASS: Omni Help Tips default on, rich explanations, dynamic controls, shadow panels, keyboard focus, persistent off/on switch and no duplicate toggle.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
