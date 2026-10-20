const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const source = fs.readFileSync('userscripts/caribbean-stock.user.js', 'utf8');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const fixture of [
      {
        url: 'https://inventory.dearsystems.com/Sale',
        guideId: 'lc-core-pergola-guide-button',
        toolbarId: 'core-tools'
      },
      {
        url: 'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx',
        guideId: 'lc-omni-pergola-guide-button',
        toolbarId: 'lc-omni-workflow-tools-bar'
      }
    ]) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route(`${new URL(fixture.url).origin}/**`, route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>New Quote - Test Customer - NZSO-17012</h1><div id="page"></div></body></html>'
      }));
      await page.goto(fixture.url);
      await page.addScriptTag({ content: `window.GM_getValue=(_,fallback)=>fallback;window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};${source}` });

      await page.locator('#lc-caribbean-stock-button').waitFor();
      assert.equal(await page.locator('#lc-caribbean-stock-button').evaluate(button => getComputedStyle(button).position), 'fixed', 'Temporary fallback is fixed only before the guide loads');

      await page.evaluate(({ guideId, toolbarId }) => {
        const toolbar = document.createElement('div');
        toolbar.id = toolbarId;
        toolbar.style.display = 'flex';
        const before = document.createElement('button');
        before.textContent = 'Install Fees';
        const guide = document.createElement('button');
        guide.id = guideId;
        guide.className = 'quote-tool';
        guide.textContent = 'Pergola Guide';
        toolbar.append(before, guide);
        document.getElementById('page').appendChild(toolbar);
      }, fixture);

      await page.waitForFunction(guideId => {
        const guide = document.getElementById(guideId);
        const stock = document.getElementById('lc-caribbean-stock-button');
        return stock?.previousElementSibling === guide;
      }, fixture.guideId);
      assert.equal(await page.locator('#lc-caribbean-stock-button').evaluate(button => getComputedStyle(button).position), 'static');
      assert.equal(await page.locator(`#${fixture.toolbarId} > #lc-caribbean-stock-button`).count(), 1);
      assert.equal(await page.locator('#lc-caribbean-stock-button').getAttribute('class'), 'quote-tool', 'Button inherits the Pergola Guide styling class');

      await page.evaluate(({ guideId, toolbarId }) => {
        const old = document.getElementById(toolbarId);
        const replacement = document.createElement('div');
        replacement.id = toolbarId;
        replacement.style.display = 'flex';
        replacement.innerHTML = `<button>Install Fees</button><button id="${guideId}" class="quote-tool">Pergola Guide</button><button>Temporary</button>`;
        old.replaceWith(replacement);
      }, fixture);
      await page.waitForFunction(guideId => document.getElementById('lc-caribbean-stock-button')?.previousElementSibling?.id === guideId, fixture.guideId);
      assert.equal(await page.locator('#lc-caribbean-stock-button').count(), 1, 'Core redraws never create a duplicate');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: Caribbean Stock moves from its temporary fallback to immediately after Pergola Guide in Core and Omni, survives redraws, and never duplicates.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
