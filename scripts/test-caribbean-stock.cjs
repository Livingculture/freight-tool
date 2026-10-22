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
        guideId: 'lc-quote-review-inline-button-v1',
        toolbarId: 'core-tools'
      },
      {
        url: 'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx',
        guideId: 'lc-omni-china-warehouse-button',
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
      await page.evaluate(() => {
        window.legacyClicks = 0;
        window.openedStockWindows = 0;
        window.open = () => { window.openedStockWindows += 1; return { opener:null, focus(){} }; };
        const legacy = document.createElement('button');
        legacy.id = 'lc-caribbean-stock-button';
        legacy.textContent = 'Caribbean Stock';
        legacy.addEventListener('click', () => { window.legacyClicks += 1; });
        document.body.appendChild(legacy);
      });
      await page.addScriptTag({ content: `window.GM_getValue=(_,fallback)=>fallback;window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};${source}` });

      await page.locator('#lc-caribbean-stock-button').waitFor();
      assert.equal(await page.locator('#lc-caribbean-stock-button').evaluate(button => getComputedStyle(button).position), 'fixed', 'Temporary fallback is fixed only before the guide loads');

      await page.evaluate(({ guideId, toolbarId }) => {
        const toolbar = document.createElement('div');
        toolbar.id = toolbarId;
        toolbar.style.cssText = guideId === 'lc-omni-china-warehouse-button'
          ? 'display:flex'
          : 'display:flex;position:relative;width:1100px;height:50px';
        const before = document.createElement('button');
        before.textContent = 'Install Fees';
        const guide = document.createElement('button');
        guide.id = guideId;
        guide.className = 'quote-tool';
        guide.textContent = guideId === 'lc-omni-china-warehouse-button' ? 'Foshan Warehouse' : 'Quote Review';
        guide.style.cssText = guideId === 'lc-omni-china-warehouse-button'
          ? 'position:absolute;left:200px;top:300px;width:145px;height:36px'
          : 'position:absolute;left:450px;top:8px;width:120px;height:36px';
        toolbar.append(before, guide);
        document.getElementById('page').appendChild(toolbar);
      }, fixture);

      await page.waitForFunction(guideId => {
        const guide = document.getElementById(guideId);
        const stock = document.getElementById('lc-caribbean-stock-button');
        return stock?.previousElementSibling === guide;
      }, fixture.guideId);
      assert.equal(await page.locator('#lc-caribbean-stock-button').evaluate(button => getComputedStyle(button).position), 'absolute');
      assert.equal(await page.locator(`#${fixture.toolbarId} > #lc-caribbean-stock-button`).count(), 1);
      assert.equal(await page.locator('#lc-caribbean-stock-button').getAttribute('class'), 'quote-tool', 'Button inherits its neighbouring action styling class');
      const gap = await page.evaluate(guideId => {
        const anchor = document.getElementById(guideId).getBoundingClientRect();
        const stock = document.getElementById('lc-caribbean-stock-button').getBoundingClientRect();
        return { horizontal: Math.round(stock.left - anchor.right), vertical: Math.round(stock.top - anchor.top) };
      }, fixture.guideId);
      assert.deepEqual(gap, { horizontal: 8, vertical: 0 }, fixture.guideId === 'lc-omni-china-warehouse-button'
        ? 'Omni button sits directly to the right of Foshan Warehouse'
        : 'Core button sits directly to the right of Quote Review');
      await page.locator('#lc-caribbean-stock-button').click();
      assert.equal(await page.evaluate(() => window.legacyClicks), 0, 'Current component replaces stale standalone click handlers');
      assert.equal(await page.evaluate(() => window.openedStockWindows), 1, 'Current stock launcher opens exactly one window');

      await page.evaluate(({ guideId, toolbarId }) => {
        const old = document.getElementById(toolbarId);
        const replacement = document.createElement('div');
        replacement.id = toolbarId;
        replacement.style.cssText = guideId === 'lc-omni-china-warehouse-button'
          ? 'display:flex'
          : 'display:flex;position:relative;width:1100px;height:50px';
        const style = guideId === 'lc-omni-china-warehouse-button'
          ? 'position:absolute;left:240px;top:320px;width:145px;height:36px'
          : 'position:absolute;left:470px;top:8px;width:120px;height:36px';
        replacement.innerHTML = `<button>Install Fees</button><button id="${guideId}" class="quote-tool" style="${style}">${guideId === 'lc-omni-china-warehouse-button' ? 'Foshan Warehouse' : 'Quote Review'}</button><button>Temporary</button>`;
        old.replaceWith(replacement);
      }, fixture);
      await page.waitForFunction(guideId => document.getElementById('lc-caribbean-stock-button')?.previousElementSibling?.id === guideId, fixture.guideId);
      assert.equal(await page.locator('#lc-caribbean-stock-button').count(), 1, 'Core redraws never create a duplicate');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: Caribbean Stock sits beside Quote Review in Core and beside Foshan Warehouse in Omni, survives redraws, and never duplicates.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
