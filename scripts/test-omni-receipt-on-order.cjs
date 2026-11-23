const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const loader = fs.readFileSync('userscripts/livingculture-all-in-one.user.js','utf8');
function extract(text,name) {
  const start = new RegExp(`  (?:async )?function ${name}\\(`).exec(text)?.index;
  assert.notEqual(start,undefined,name);
  const rest = text.slice(start), next = rest.slice(1).search(/\n  (?:async )?function /);
  return rest.slice(0,next+1);
}
const helpers = ['quotePdfTemplateLabel','quotePdfTemplateMatches','saveQuotePdfBuffer','quotePdfTimeout',
  'receiptAdminUrlOnOrder','requestReceiptHrefOnOrder','downloadSignedQuotePdf','downloadReceiptOnOrder','downloadCurrentQuotePdf']
  .map(name=>extract(source,name)).join('\n');
const resource = `const QUOTE_PDF_TIMEOUT_MS=1000,QUOTE_PDF_RECEIPT_TIMEOUT_MS=1500,QUOTE_PDF_RETRY_MS=20;
  const normalizeLabel=value=>String(value||'').replace(/\\s+/g,' ').trim().toLowerCase();
  const omniHeadingDraft=()=>({documentType:'sales-order',orderId:'NZSO-99001A'});
  ${helpers}
  document.getElementById('receipt').onclick=()=>void downloadCurrentQuotePdf(document.getElementById('receipt'),'receipt');`;
(async()=>{
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || undefined});
  try {
    for (const scenario of ['direct','onclick','javascript-href','receipt-template','preparing','blocked-auto',
      'wrong-order','missing-receipt','admin-http-error','pdf-http-error','invalid-pdf','unreadable-admin']) {
      const context = await browser.newContext({acceptDownloads:true});
      let pdfRequests=0, downloads=[], requests=[], errors=[];
      const adminUrl='/Cloud/ShoppingCartAdmin/Orders/OrderDetail.aspx?idOrder=987&idCustomerAppsLink=1';
      const entryUrl='https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=123';
      await context.route('https://go.cin7.com/**',async route=>{
        const url=new URL(route.request().url());requests.push(url);
        if (url.pathname.includes('TransactionEntry')) {
          const admin=scenario==='unreadable-admin'?'<button>Go to Admin</button>':scenario==='onclick'
            ? `<input type="button" value="Go to Admin" onclick="window.location.href='${adminUrl}'">`
            : scenario==='javascript-href'?`<a href="javascript:window.open('${adminUrl}')">Go to Admin</a>`
            : `<a href="${adminUrl}" target="_top">Go to Admin</a>`;
          return route.fulfill({contentType:'text/html',body:`<h4>Edit Sales Order - Example - NZSO-99001A</h4>${admin}<input id="notes" value="Unsaved fictional note"><button id="receipt">Download Receipt</button>`});
        }
        if (url.pathname.includes('ShoppingCartAdmin')) return route.fulfill({status:scenario==='admin-http-error'?403:200,contentType:'text/html',
          body:`<h4>Admin - Example - ${scenario==='wrong-order'?'NZSO-99001':'NZSO-99001A'}</h4><a href="/Cloud/Docs/PDF/?T=Invoice&ID=987">Dynamic Invoice</a>`+
          (scenario==='missing-receipt'?'':`<a href="/Cloud/Docs/PDF/?T=${scenario==='receipt-template'?'Receipt':'Order%205'}&ID=987&SID=456">PDF</a>`)});
        pdfRequests++;
        if(scenario==='invalid-pdf'||scenario==='preparing'&&pdfRequests===1) return route.fulfill({contentType:'text/html',body:'<html>Preparing fictional receipt</html>'});
        return route.fulfill({status:scenario==='pdf-http-error'?403:200,contentType:'application/pdf',
          body:Buffer.from('%PDF-1.7\n'+'fictional receipt '.repeat(80)+'\n%%EOF')});
      });
      const page=await context.newPage();
      page.on('download',download=>downloads.push(download.suggestedFilename()));
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(entryUrl);
      await page.evaluate(({resource,scenario})=>{
        window.alerts=[];window.alert=message=>window.alerts.push(message);
        window.GM_getResourceText=()=>resource;
        window.GM_getValue=()=>{};window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};
        window.GM_openInTab=()=>{throw new Error('Receipt must not open a tab');};
        window.open=()=>{throw new Error('Receipt must not open a window');};
        window.GM_xmlhttpRequest=options=>{
          fetch(options.url).then(async response=>{
            const result={status:response.status};
            if(options.responseType==='arraybuffer') result.response=await response.arrayBuffer();
            else result.responseText=await response.text();
            options.onload(result);
          }).catch(()=>options.onerror());
        };
        if(scenario==='blocked-auto')document.addEventListener('click',event=>{
          if(event.target.tagName==='A'&&event.target.href.startsWith('blob:')&&!event.isTrusted)event.preventDefault();
        },true);
        localStorage.setItem('lc-unrelated-test','keep');
      },{resource,scenario});
      // Use All-in-One's real resource executor and grant injection, not standalone execution.
      await page.addScriptTag({content:`(()=>{const status={loaded:[],skipped:[],errors:[]};const gmailComponents={};
        ${extract(loader,'execute').split('\n  components.filter')[0]}
        execute({resource:'workflow',file:'omni-livingculture-workflow.user.js',enabled:true});
        window.loaderTestStatus=status;})();`});
      assert.deepEqual(await page.evaluate(()=>window.loaderTestStatus.errors),[]);
      await page.locator('#receipt').click();
      await page.waitForFunction(()=>document.querySelector('#receipt').disabled===false,null,{timeout:5000});
      const failure=['wrong-order','missing-receipt','admin-http-error','pdf-http-error','invalid-pdf','unreadable-admin'].includes(scenario);
      if(failure){
        assert.equal(downloads.length,0,scenario);
        assert.equal((await page.evaluate(()=>window.alerts)).length,1,scenario);
        assert.equal(await page.locator('#lc-receipt-save-panel').count(),0);
      }else{
        assert.deepEqual(await page.evaluate(()=>window.alerts),[]);
        if(scenario==='blocked-auto'){
          assert.equal(downloads.length,0);
          await page.getByRole('link',{name:'Save receipt PDF'}).click();
        }
        await page.waitForTimeout(100);
        assert.deepEqual(downloads,['NZSO-99001A-receipt.pdf']);
        assert.equal(pdfRequests,scenario==='preparing'?2:1);
        assert.equal(requests.at(-1).searchParams.get('ID'),'987');
        assert.equal(requests.at(-1).searchParams.get('SID'),'456');
        await page.getByRole('button',{name:'Close',exact:true}).click();
        assert.equal(await page.locator('#lc-receipt-save-panel').count(),0);
      }
      assert.equal(page.url(),entryUrl,'No navigation of current Omni screen');
      assert.equal(context.pages().length,1,'No background or foreground tabs');
      assert.equal(await page.locator('iframe').count(),0,'No frame navigation');
      assert.equal(await page.locator('#notes').inputValue(),'Unsaved fictional note');
      assert.equal(await page.locator('#receipt').innerText(),'Download Receipt');
      assert.equal(await page.evaluate(()=>localStorage.getItem('lc-unrelated-test')),'keep');
      assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('lc-quote-pdf-handoff')).length),0);
      assert.deepEqual(errors,[]);
      if(['wrong-order','missing-receipt','admin-http-error','unreadable-admin'].includes(scenario))assert.equal(pdfRequests,0);
      await context.close();
      console.log(`PASS receipt on order through All-in-One executor: ${scenario}; no navigation, no tabs, button restored.`);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
