const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root='/Users/steveforeman/projects/workflow-speed-fix/public';
const source=fs.readFileSync('userscripts/omni-warranty-guide.user.js','utf8');
const body='<style>body{font:14px Arial;margin:0}.tools{display:flex;flex-wrap:wrap;gap:10px;padding:20px}.tools button{height:38px}</style><div id="lc-omni-workflow-tools-bar" class="tools"><button>Jobs Overview</button><button>Help</button></div>';
(async()=>{
  const browser=await chromium.launch();
  try{
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:850}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.context().route('https://living-culture-workflow.vercel.app/**',route=>{
        const filename=path.basename(new URL(route.request().url()).pathname);
        assert(['warranty-guide.html','warranty-guide.css','warranty-guide.js','warranty-infographic.png','warranty-infographic-2.png','living-culture-warranty-infographic.pdf'].includes(filename));
        return route.fulfill({contentType:filename.endsWith('.png')?'image/png':filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(root,filename))});
      });
      await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body}));
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=405');
      await page.addScriptTag({content:source});await page.addScriptTag({content:source});
      const button=page.getByRole('button',{name:'Warranty',exact:true});assert.equal(await button.count(),1);
      await button.click();const dialog=page.locator('#lc-omni-warranty-dialog');await dialog.waitFor();
      const guide=page.frameLocator('#lc-omni-warranty-dialog iframe');
      await guide.locator('img').first().waitFor();
      await page.waitForFunction(()=>{const frame=document.querySelector('iframe');return !!frame;});
      assert.equal(await guide.locator('img').count(),2);
      await guide.locator('img').first().evaluate(el=>el.decode());
      assert.equal(await guide.locator('img').first().evaluate(el=>el.naturalWidth),1500);
      assert.equal(await guide.getByRole('link',{name:'Full terms',exact:true}).getAttribute('href'),'https://livingculture.co.nz/pages/warranty-information');
      const frame=page.frames().find(frame=>frame.url().includes('/warranty-guide.html'));
      assert.equal(await guide.getByRole('link',{name:'Open PDF',exact:true}).getAttribute('href'),'/living-culture-warranty-infographic.pdf');
      assert.equal(await guide.getByRole('link',{name:'Download PDF',exact:true}).getAttribute('download'),'Living Culture Warranty Infographic.pdf');
      await guide.locator('img').nth(1).scrollIntoViewIfNeeded();
      await frame.waitForFunction(()=>document.querySelectorAll('img')[1].complete && document.querySelectorAll('img')[1].naturalWidth>0);
      await guide.locator('img').nth(1).evaluate(el=>el.decode());
      assert.equal(await guide.locator('img').nth(1).evaluate(el=>el.naturalHeight),7320);
      const text=guide.locator('#text-version');if(!await text.evaluate(el=>el.open))await text.locator('summary').click();
      assert((await text.innerText()).includes('25 years'));assert((await text.innerText()).includes('French Dickson'));
      assert((await text.innerText()).includes('Confirm the applicable date.'));
      assert(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert(await dialog.evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
      await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://living-culture-workflow.vercel.app',source:window,data:{type:'lc-warranty-close'}})));
      assert(await dialog.evaluate(el=>el.open),'Forged close messages are rejected');
      await frame.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:`/tmp/lc-warranty-${width}.png`});
      await guide.locator('summary').focus();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.activeElement.id),'lc-omni-warranty-button');
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
      await button.click();await page.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'});
      await page.evaluate(()=>document.getElementById('lc-omni-warranty-button').remove());await button.waitFor();
      assert.equal(await button.count(),1);assert.deepEqual(errors,[]);await page.close();
    }
    const core=await browser.newPage();await core.route('https://inventory.dearsystems.com/**',route=>route.fulfill({contentType:'text/html',body}));await core.goto('https://inventory.dearsystems.com/Sale');await core.addScriptTag({content:source});assert.equal(await core.locator('#lc-omni-warranty-button').count(),0);
    console.log('PASS: Warranty button, both PDF page previews, original PDF links, text summary, responsive popup, trusted Escape/Close, restored focus/scroll and Core exclusion. Local assets and Omni fixture; no live writes.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
