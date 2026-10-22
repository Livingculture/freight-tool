const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const loader = fs.readFileSync('userscripts/livingculture-all-in-one.user.js', 'utf8');
const stock = fs.readFileSync('userscripts/caribbean-stock.user.js', 'utf8');
const app = 'https://script.google.com/a/macros/livingculture.co.nz/s/AKfycbwmxFo0-94s8lBr9jDjmMWk6FbxZKTaUDaUi9k3OW3MuSIi4QOmiCuqvm-1IJJlLJ5ZtA/exec';
assert.match(loader, /@resource\s+caribbeanStock https:\/\/raw\.githubusercontent\.com\/Livingculture\/freight-tool\/[a-f0-9]{40}\/userscripts\/caribbean-stock\.user\.js/);
assert.match(loader, /@version\s+0\.1\.179/);
assert.match(loader, /const isCin7CoreSale = isCin7Core && \/\^\\\/Sale/);
assert.match(loader, /enabled: isOmniQuote \|\| isCin7CoreSale/);

(async () => {
  const browser = await chromium.launch();
  try {
    for (const fixture of [
      {url:'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx',title:'Edit Quote - Customer Name - NZSO-17012',show:true,anchor:'lc-omni-china-warehouse-button'},
      {url:'https://inventory.dearsystems.com/Sale#test',title:'Sale SFOR12345',show:true,anchor:'lc-quote-review-inline-button-v1'},
      {url:'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx',title:'Edit Sales Order - Customer Name - NZSO-17012',show:false},
      {url:'https://go.cin7.com/Cloud/Dashboard/HomePageDashboard.aspx',title:'Dashboard',show:false},
      {url:'https://inventory.dearsystems.com/Dashboard',title:'Dashboard',show:false},
      {url:'https://app.hubspot.com/contacts/test',title:'Deals',show:false},
    ]) {
      for (const standalone of fixture.show ? ['off','before','after'] : ['off']) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => route.fulfill({contentType:'text/html',body:`<h1>${fixture.title}</h1><label for="rep">Sales Rep:</label><select id="rep"><option>PEN-Steve</option></select><div style="display:flex"><button id="${fixture.anchor || 'unused'}" style="position:static">Warehouse / Guide</button></div>`}));
        await page.goto(fixture.url);
        await page.evaluate(stock => {
          window.GM_getResourceText = name => name === 'caribbeanStock' ? stock : '/* Unrelated component mocked. */';
          window.GM_getValue = (_, fallback) => fallback;
          window.GM_setValue = () => {};
          window.GM_registerMenuCommand = () => {};
          window.GM_xmlhttpRequest = () => { throw Error('No stock write or external request is needed to launch'); };
          window.opened = [];
          window.open = (url) => { window.opened.push(url); return {focus(){}}; };
          window.prompt = () => { throw Error('Staff must not have to enter the app URL'); };
        }, stock);
        if (standalone === 'before') await page.addScriptTag({content:stock});
        await page.addScriptTag({content:loader});
        if (standalone === 'after') await page.addScriptTag({content:stock});
        await page.waitForTimeout(100);
        const button = page.locator('#lc-caribbean-stock-button');
        assert.equal(await button.count(), fixture.show ? 1 : 0);
        if (fixture.show) {
          assert(await page.evaluate(()=>window.__lcAllInOneStatus.loaded.includes('caribbean-stock.user.js')));
          assert.equal(await button.evaluate((node, id)=>node.previousElementSibling?.id===id,fixture.anchor),true);
          await button.click();
          const opened = await page.evaluate(()=>window.opened);
          assert.equal(opened.length,1,'Standalone plus All-in-One opens only one stock window');
          const url = new URL(opened[0]), params = new URLSearchParams(url.hash.slice(1));
          assert.equal(url.origin + url.pathname,app);
          assert.equal(params.get('quote'),fixture.url.includes('dearsystems')?'SFOR12345':'NZSO-17012');
          assert.equal(params.get('rep'),'PEN-Steve');
          if(!fixture.url.includes('dearsystems'))assert.equal(params.get('customer'),'Customer Name');
        }
        assert.deepEqual(errors,[]);
        await page.close();
      }
    }
    console.log('PASS: All-in-One launches the pinned Caribbean Stock component on Omni/Core quotes, preserves placement and context, requires no URL setup, stays off other screens, and opens once with the standalone script before or after it. Other components mocked; no live stock changes.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
