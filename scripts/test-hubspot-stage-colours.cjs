const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../userscripts/hubspot-contrast-colours.user.js'), 'utf8');
const fixture = `<!doctype html><style>
body{font:16px Arial;padding:24px;background:white} [role=grid]{width:min(650px,100%)}
[role=row]{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #ddd;padding:14px 0}
a{color:#01a4bd;text-decoration:none}.native{display:inline-block;border-radius:7px;padding:5px 9px;background:#008036;color:#01a4bd;font-weight:bold}
</style><main><div role="grid"><div role="row"><div role="columnheader" aria-colindex="1">Deal Stage</div><div role="columnheader" aria-colindex="2">Customer</div></div>
<div role="row"><div role="gridcell" aria-colindex="1"><a href="#"><span id="pill" class="native"><span id="label">Quote sent (Opp Deal)</span></span></a></div><div role="gridcell" aria-colindex="2"><a href="#">Test customer</a></div></div></div></main>`;

(async () => {
  const browser = await chromium.launch();
  try {
    for(const width of [1200,390]) {
      const page = await browser.newPage({ viewport:{ width, height:700 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.fulfill({ contentType:'text/html', body:fixture }));
      await page.goto('https://app.hubspot.com/colour-test');
      await page.addScriptTag({ content:source });
      async function colour(background) {
        try {
          await page.waitForFunction(bg => getComputedStyle(document.getElementById('pill')).backgroundColor === bg && getComputedStyle(document.getElementById('label')).color === 'rgb(17, 17, 17)', background, { timeout:3000 });
        } catch(error) {
          console.error(await page.evaluate(() => ({ pill:document.getElementById('pill').outerHTML, background:getComputedStyle(document.getElementById('pill')).backgroundColor, text:getComputedStyle(document.getElementById('label')).color, styled:[...document.querySelectorAll('.lc-hubspot-pastel-stage')].map(node => node.outerHTML) })));
          throw error;
        }
      }
      await colour('rgb(248, 221, 234)');
      await page.evaluate(() => { document.getElementById('label').firstChild.data = 'Paid (Opp Deal)'; });
      await colour('rgb(223, 238, 247)');
      await page.evaluate(() => {
        const pill = document.getElementById('pill');
        pill.className = 'native';
        pill.style.cssText = 'background:#008036;color:#01a4bd';
      });
      await colour('rgb(223, 238, 247)');
      await page.evaluate(() => {
        document.getElementById('pill').outerHTML = '<span id="pill" class="native"><span id="label">Ready To Install (Opp Deal)</span></span>';
      });
      await colour('rgb(247, 221, 213)');
      assert.equal(await page.locator('[role=gridcell]').first().evaluate(cell => cell.classList.contains('lc-hubspot-pastel-stage')), false, 'Only the pill is coloured, not the entire table cell');
      await page.evaluate(() => {
        window.pillMutations = 0;
        new MutationObserver(items => { window.pillMutations += items.length; }).observe(document.getElementById('pill'), { attributes:true, subtree:true });
      });
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.pillMutations), 0, 'Observer settles without continuously rewriting styles');
      await page.screenshot({ path:`/tmp/lc-hubspot-stage-live-${width}.png`, fullPage:true });
      await page.evaluate(() => localStorage.setItem('lcHubSpotColourSettingsV4', JSON.stringify({ default:'#ffedcc', pillText:'#111111' })));
      await page.reload();
      await page.addScriptTag({ content:source });
      await page.evaluate(() => { document.getElementById('label').firstChild.data = 'Paid (Opp Deal)'; });
      await colour('rgb(255, 237, 204)');
      assert.deepEqual(errors, []);
      console.log(`PASS: HubSpot live text changes, class/style replacement, pill replacement, nested grid contrast, saved custom colours and no observer loop at ${width}px. Fixture only; no HubSpot records changed.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
