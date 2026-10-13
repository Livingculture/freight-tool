const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const start=source.indexOf('  function openStaffHelpPopup()');
const end=source.indexOf('\n  function runButtonPass()',start);
const functions=source.slice(start,end);
assert(source.includes("const STAFF_GUIDE_URL = 'https://living-culture-freight.vercel.app/omni-help.html'"));
(async()=>{
  const browser=await chromium.launch();
  try{
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="tools"></div></body></html>'}));
      await page.context().route('https://living-culture-freight.vercel.app/**',route=>{
        const name=path.basename(new URL(route.request().url()).pathname);
        assert(['omni-help.html','omni-help.css','omni-help.js','connected-workflow-guide.html','omni-workflow-hubspot-guide.pdf','staff-button-guide.html','staff-button-guide.js','staff-button-guide.pdf'].includes(name));
        const type=name.endsWith('.pdf')?'application/pdf':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html';
        return route.fulfill({contentType:type,body:fs.readFileSync(`public/${name}`)});
      });
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx');
      await page.addScriptTag({content:`const OMNI_TOOLS_BAR_ID='tools',STAFF_HELP_BAR_ID='old',STAFF_HELP_BUTTON_ID='help',STAFF_HELP_DIALOG_ID='lc-omni-staff-help-dialog',STAFF_GUIDE_URL='https://living-culture-freight.vercel.app/omni-help.html';const isOmniPage=()=>true;${functions};addStaffHelpButton();`});
      const help=page.getByRole('button',{name:'Staff Guide',exact:true});
      await help.click();
      const dialog=page.getByRole('dialog',{name:'Living Culture Staff Guide'});
      const guide=page.frameLocator('iframe[title="Living Culture staff reference"]');
      await guide.getByRole('heading',{name:'Using Omni',exact:true}).waitFor();
      await guide.getByRole('heading',{name:'Drawing approvals',exact:true}).waitFor();
      assert.equal(await guide.getByRole('tab',{name:'Using Omni'}).getAttribute('aria-selected'),'true');
      assert.equal(await guide.locator('#connections-frame').getAttribute('src'),null,'Diagram loads only when selected');
      await page.screenshot({path:`/tmp/omni-combined-help-using-${width}.png`});
      await guide.getByRole('tab',{name:'How Everything Connects'}).click();
      const connected=guide.frameLocator('#connections-frame');
      await connected.getByRole('heading',{name:'Omni + Workflow + HubSpot',exact:true}).waitFor();
      assert.equal(await connected.locator('.sheet').count(),3);
      assert.equal(await guide.locator('#panel-omni').isVisible(),false);
      assert.equal(await connected.getByRole('link',{name:'Download the PDF'}).getAttribute('href'),'omni-workflow-hubspot-guide.pdf');
      for(const frame of page.frames().filter(frame=>frame.url().startsWith('https://living-culture-freight.vercel.app/'))){
        assert(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Each guide fits its frame');
      }
      await page.screenshot({path:`/tmp/omni-combined-help-connections-${width}.png`});
      await guide.getByRole('tab',{name:'How Everything Connects'}).focus();await page.keyboard.press('ArrowLeft');
      assert.equal(await guide.getByRole('tab',{name:'Using Omni'}).getAttribute('aria-selected'),'true','Keyboard tabs work');
      await guide.locator('#button-reference summary').click();
      const reference=guide.frameLocator('#reference-frame');
      await reference.getByRole('searchbox',{name:'Search help'}).fill('Clone Quote');
      assert(await reference.locator('#section-1 .help-item-title').getByText('Clone Quote',{exact:true}).isVisible(),'Existing searchable reference remains available');
      await reference.getByRole('searchbox',{name:'Search help'}).fill('Prepare Approval Email');
      assert(await reference.locator('.help-item-title').getByText('Prepare Approval Email / customer response',{exact:true}).isVisible(),'Drawing approval instructions are searchable from the Omni Staff Guide');
      assert.equal(page.context().pages().length,1,'Help stays in one popup');
      await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://living-culture-freight.vercel.app',source:window,data:{type:'lc-staff-help-close'}})));
      assert(await dialog.isVisible(),'Forged close messages are ignored');
      await reference.getByRole('searchbox',{name:'Search help'}).focus();await page.keyboard.press('Escape');
      await dialog.waitFor({state:'detached'});
      await page.waitForFunction(()=>document.body.style.overflow==='');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'help');
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
      await help.click();await guide.getByRole('tab',{name:'How Everything Connects'}).click();
      await connected.getByRole('link',{name:'Download the PDF'}).focus();await page.keyboard.press('Escape');
      await dialog.waitFor({state:'detached'});
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS: Combined Help tabs, connection diagram, existing searchable button reference, keyboard navigation, nested Escape, safe close handling, focus restoration and desktop/mobile fit. Browser fixture; no live record writes.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
