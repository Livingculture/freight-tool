const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=fs.readFileSync('userscripts/omni-receipt-pilot.user.js','utf8');
assert(!fs.readFileSync('userscripts/livingculture-all-in-one.user.js','utf8').includes('omni-receipt-pilot'),'Pilot must not be included in shared All-in-One');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try {
    for(const scenario of ['order5','receipt','heading-h5','heading-div','stale-state','missing-download','wrong-order']) {
      const context=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}});
      let worker, options, downloaded, receiptUrl, invoiceRequests=0;
      const errors=[];
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.searchParams.get('T')==='Invoice')invoiceRequests++;
        let html;
        if(url.pathname.includes('TransactionEntry')){const tag=scenario==='heading-h5'?'h5':scenario==='heading-div'?'div':'h4';html=`<${tag}>Edit Sales Order - Example Customer - NZSO-99001</${tag}><h3>Contact</h3><a href="/Cloud/ShoppingCartAdmin/Orders/OrderDetail.aspx?idOrder=432" target="_blank">Go to Admin</a><button id="normal">Download Receipt</button>`;}
        else if(url.pathname.includes('ShoppingCartAdmin'))html=`<h4>Admin - Example Customer - NZSO-${scenario==='wrong-order'?'99002':'99001'}</h4><a href="/Cloud/Docs/PDF/?T=Invoice&ID=987">Dynamic Invoice</a><a href="/Cloud/Docs/PDF/?T=${scenario==='receipt'?'Receipt':'Order%205'}&ID=987&SID=456&idWebSite=1">Dynamic Receipt</a>`;
        else {
          receiptUrl=url;
          html=scenario==='missing-download'?'<h3>Preparing document</h3>':'<button id="native">Download</button><script>document.getElementById("native").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["%PDF example"],{type:"application/pdf"}));a.download="example-receipt.pdf";a.click();};</script>';
        }
        return route.fulfill({contentType:'text/html',body:html});
      });
      await context.exposeBinding('openPilotTab',async(_,url,tabOptions)=>{
        options=tabOptions;worker=await context.newPage();worker.on('pageerror',e=>errors.push(e.message));worker.on('download',d=>downloaded=d.suggestedFilename());await worker.goto(url);
      });
      await context.addInitScript({content:`window.GM_openInTab=(url,options)=>{window.openPilotTab(url,options);return {};};window.GM_registerMenuCommand=(name,action)=>{window.pilotMenu=action;};if(${JSON.stringify(scenario)}==='stale-state'&&location.pathname.includes('TransactionEntry')&&!location.search.includes('lcReceiptPilot'))sessionStorage.setItem('lc-receipt-pilot-v1',JSON.stringify({id:'old',stage:'requested',startedAt:Date.now()}));document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true});`});
      const parent=await context.newPage();parent.on('pageerror',e=>errors.push(e.message));
      await parent.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=123');
      assert(await parent.getByRole('button',{name:'Receipt Test',exact:true}).isVisible());
      assert.equal(await parent.evaluate(()=>typeof window.pilotMenu),'function','Menu command confirms the standalone script loaded');
      await parent.evaluate(()=>localStorage.setItem('lc-quote-pdf-handoff-v2','untouched'));
      await parent.getByRole('button',{name:'Receipt Test',exact:true}).click();
      for(let i=0;i<100&&!worker;i++)await new Promise(r=>setTimeout(r,20));
      assert(worker);assert.deepEqual(options,{active:true,insert:true});
      if(scenario==='wrong-order'){
        await worker.waitForURL(/ShoppingCartAdmin/);await worker.getByText('Stopped: this tab opened a different order.',{exact:true}).waitFor();
        assert.equal(receiptUrl,undefined);
      } else {
        await worker.waitForURL(/\/Cloud\/Docs\/PDF/);
        if(scenario==='missing-download'){
          await worker.evaluate(()=>{const now=Date.now();Date.now=()=>now+181000;});
          await worker.getByText(/Stopped at receipt/).waitFor();assert.equal(downloaded,undefined);
        } else {
          await worker.getByText(/Step 3: Cin7 Download clicked/).waitFor();
          for(let i=0;i<100&&!downloaded;i++)await new Promise(r=>setTimeout(r,20));
          assert.equal(downloaded,'example-receipt.pdf','Native click produces an actual browser download in the fixture');
          assert.equal(receiptUrl.searchParams.get('ID'),'987','Use converted native ID, never reconstruct from edit order ID');
          assert.equal(receiptUrl.searchParams.get('SID'),'456');
        }
      }
      assert.equal(worker.isClosed(),false,'Keep visible test tab open for inspection');
      assert.equal(invoiceRequests,0);assert.equal(await parent.locator('#normal').textContent(),'Download Receipt');
      assert.equal(await parent.evaluate(()=>localStorage.getItem('lc-quote-pdf-handoff-v2')),'untouched','Do not modify shared download state');
      await worker.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value;}}}));
      await worker.getByRole('button',{name:'Copy diagnostics'}).click();
      const diagnostics=await worker.evaluate(()=>window.copied);
      assert(!/SID|https:|Example Customer|idWebSite/.test(diagnostics),'Diagnostics exclude native URL parameters and customer details');
      assert.equal(await worker.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await worker.getByRole('button',{name:'Stop test'}).click();assert.equal(await worker.evaluate(()=>sessionStorage.getItem('lc-receipt-pilot-v1')),null);
      assert.deepEqual(errors,[]);await context.close();
      console.log('PASS receipt pilot: '+scenario+'; isolated state, visible native flow, retained tab and safe diagnostics.');
    }
    const framed=await browser.newContext();
    await framed.route('**/*',route=>route.fulfill({contentType:'text/html',body:route.request().url().includes('TransactionEntry')?'<h5>Edit Sales Order - Example Customer - NZSO-99001</h5>':'<iframe style="width:800px;height:600px" src="/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=123"></iframe>'}));
    await framed.addInitScript({content:`document.addEventListener('DOMContentLoaded',()=>{${source}\n},{once:true});`});
    const shell=await framed.newPage();await shell.goto('https://go.cin7.com/Cloud/Shell.aspx');
    await shell.frameLocator('iframe').getByRole('button',{name:'Receipt Test',exact:true}).waitFor({state:'visible'});
    await framed.close();console.log('PASS receipt pilot: button appears inside embedded Omni order screen.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
