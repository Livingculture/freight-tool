const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const source = fs.readFileSync('userscripts/omni-workflow-navigation.user.js','utf8');
const body = `<style>body{margin:0;font:13px Arial}nav{background:#06346d;color:white;overflow:hidden;transform:translateZ(0)}ul{display:flex;flex-wrap:wrap;align-items:center;margin:0;padding:0;list-style:none}li a{display:block;padding:14px 8px;color:white;text-decoration:none;font-weight:700}</style>
<nav><ul><li><a href="/SalesOrders">Sales Orders</a></li><li><a href="/Quotes">Quotes</a></li><li><a href="/NewQuote">New Quote</a></li><li><a href="#">More</a></li></ul></nav><h1>Sales Orders</h1>`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1280,390]) {
      const page=await browser.newPage({viewport:{width,height:600}});
      await page.context().route('https://living-culture-workflow.vercel.app/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Workflow fixture</h1>'}));
      await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body}));
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=405');
      await page.addScriptTag({content:source});
      const link=page.locator('#lc-omni-workflow-nav-link');
      await link.waitFor();
      assert.equal(await link.getAttribute('aria-haspopup'),'menu');
      assert.equal(await page.locator('nav li').count(),5);
      assert.equal(await page.evaluate(()=>document.querySelector('nav li:last-child').textContent),'Workflow');
      await link.click();
      const menu=page.locator('#lc-omni-workflow-nav-menu');
      await menu.waitFor({state:'visible'});
      assert.equal(await menu.getByRole('menuitem').count(),12);
      assert(await page.evaluate(()=>document.getElementById('lc-omni-workflow-nav-menu').parentElement===document.body),'Menu escapes clipped/transformed native navigation');
      assert.equal(await menu.getByRole('menuitem',{name:'Jobs Overview',exact:true}).getAttribute('href'),'https://living-culture-workflow.vercel.app/jobs');
      assert.equal(await menu.getByRole('menuitem',{name:'Open Workflow',exact:true}).getAttribute('href'),'https://living-culture-workflow.vercel.app/','Default entry preserves last-screen restoration');
      await page.keyboard.press('Escape');
      assert.equal(await link.getAttribute('aria-expanded'),'false');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'lc-omni-workflow-nav-link');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Open Workflow');
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Weekly Sales');
      await page.keyboard.press('Home');
      const popupPromise=page.context().waitForEvent('page');
      await menu.getByRole('menuitem',{name:'Deliver',exact:true}).click();
      const popup=await popupPromise;
      await popup.waitForLoadState();
      assert.equal(popup.url(),'https://living-culture-workflow.vercel.app/?app=workflow&planner=deliveries');
      assert.equal(await popup.evaluate(()=>window.opener),null);
      await popup.close();
      assert.equal(await link.getAttribute('aria-expanded'),'false');
      await link.click();
      await page.mouse.click(4,580);
      await menu.waitFor({state:'hidden'});
      await link.click();
      await page.evaluate(()=>document.getElementById('lc-omni-workflow-nav-link').closest('li').remove());
      await link.waitFor();
      await page.waitForTimeout(100);
      assert.equal(await link.count(),1,'Header replacement adds one link, never duplicates');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Navigation must not create horizontal overflow');
      const bounds=await link.boundingBox();
      assert(bounds.width>0 && bounds.x+bounds.width<=width);
      await link.click();
      const menuBounds=await menu.boundingBox();
      assert(menuBounds.x>=0&&menuBounds.x+menuBounds.width<=width&&menuBounds.y+menuBounds.height<=600,'Dropdown stays within the viewport');
      await page.screenshot({path:`/tmp/lc-workflow-nav-${width}.png`});
      await page.close();
    }
    const core=await browser.newPage();
    await core.route('https://inventory.dearsystems.com/**',route=>route.fulfill({contentType:'text/html',body}));
    await core.goto('https://inventory.dearsystems.com/Sale');
    await core.addScriptTag({content:source});
    assert.equal(await core.locator('#lc-omni-workflow-nav-link').count(),0);
    console.log('PASS: Omni Workflow dropdown, main-page deep links, last-screen entry, keyboard/Escape/outside close, unclipped desktop/mobile positioning, safe new-tab navigation, rerender deduplication and Core exclusion. Browser fixture; no live records changed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
