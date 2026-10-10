const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const source = fs.readFileSync('userscripts/omni-workflow-navigation.user.js','utf8');
const body = `<style>body{margin:0;font:13px Arial}nav{background:#06346d;color:white}ul{display:flex;flex-wrap:wrap;align-items:center;margin:0;padding:0;list-style:none}li a{display:block;padding:14px 8px;color:white;text-decoration:none;font-weight:700}</style>
<nav><ul><li><a href="/SalesOrders">Sales Orders</a></li><li><a href="/Quotes">Quotes</a></li><li><a href="/NewQuote">New Quote</a></li><li><a href="#">More</a></li></ul></nav><h1>Sales Orders</h1>`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1280,390]) {
      const page=await browser.newPage({viewport:{width,height:600}});
      await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body}));
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=405');
      await page.addScriptTag({content:source});
      const link=page.locator('#lc-omni-workflow-nav-link');
      await link.waitFor();
      assert.equal(await link.getAttribute('href'),'https://living-culture-workflow.vercel.app/');
      assert.equal(await link.getAttribute('target'),'_blank');
      assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
      assert.equal(await page.locator('nav li').count(),5);
      assert.equal(await page.evaluate(()=>document.querySelector('nav li:last-child').textContent),'Workflow');
      await page.evaluate(()=>document.querySelector('nav').outerHTML=document.querySelector('nav').outerHTML.replace(/<li[^>]*><a id="lc-omni-workflow-nav-link"[\s\S]*?<\/li>/,''));
      await link.waitFor();
      await page.waitForTimeout(100);
      assert.equal(await link.count(),1,'Header replacement adds one link, never duplicates');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Navigation must not create horizontal overflow');
      const bounds=await link.boundingBox();
      assert(bounds.width>0 && bounds.x+bounds.width<=width);
      await page.screenshot({path:`/tmp/lc-workflow-nav-${width}.png`});
      await page.close();
    }
    const core=await browser.newPage();
    await core.route('https://inventory.dearsystems.com/**',route=>route.fulfill({contentType:'text/html',body}));
    await core.goto('https://inventory.dearsystems.com/Sale');
    await core.addScriptTag({content:source});
    assert.equal(await core.locator('#lc-omni-workflow-nav-link').count(),0);
    console.log('PASS: Omni top-nav placement, safe new-tab link, rerender deduplication, desktop/mobile sizing and Core exclusion. Browser fixture; no live records changed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
