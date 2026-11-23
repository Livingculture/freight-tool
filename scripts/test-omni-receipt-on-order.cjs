const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const loader=fs.readFileSync('userscripts/livingculture-all-in-one.user.js','utf8');
function extract(name){
  const start=new RegExp(`  (?:async )?function ${name}\\(`).exec(source)?.index;
  assert.notEqual(start,undefined,name);
  const rest=source.slice(start),next=rest.slice(1).search(/\n  (?:async )?function /);
  return rest.slice(0,next+1);
}
const parentResource=`const normalizeLabel=value=>String(value||'').trim().toLowerCase();
 const omniHeadingDraft=()=>({documentType:'sales-order',orderId:'NZSO-99001A'});
 ${['saveQuotePdfBuffer','downloadReceiptOnOrder','downloadCurrentQuotePdf'].map(extract).join('\n')}
 document.getElementById('receipt').onclick=()=>void downloadCurrentQuotePdf(document.getElementById('receipt'),'receipt');`;
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || undefined});
  try{
    for(const scenario of ['native-submit','native-postback','attached-handler','direct','receipt-template','blocked-auto',
      'wrong-order','missing-receipt','pdf-http-error','invalid-pdf','open-failure','parallel']){
      const context=await browser.newContext({acceptDownloads:true});
      let parent,worker,workerOptions,pdfRequests=0,postbacks=0,downloads=[],errors=[],requestUrls=[],workerHelpers=[];
      const entryUrl='https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=123';
      const adminUrl='/Cloud/ShoppingCartAdmin/Orders/OrderDetail.aspx?idOrder=987';
      await context.route('https://go.cin7.com/**',async route=>{
        const request=route.request(),url=new URL(request.url());requestUrls.push(url);
        if(url.pathname.includes('TransactionEntry')){
          if(request.method()==='POST'){
            postbacks++;
            const data=new URLSearchParams(request.postData());
            assert.equal(data.get('notes'),'Saved fictional note','Never submits unsaved text from staff tab');
            assert.equal(data.get('__VIEWSTATE'),'fictional-state');
            if(scenario==='native-postback')assert.equal(data.get('__EVENTTARGET'),'nativeAdmin');
            else assert.equal(data.get('nativeAdmin'),'Go to Admin');
            // Use an explicit navigation so Playwright mocks the destination too.
            return route.fulfill({contentType:'text/html',body:`<script>location.replace(${JSON.stringify(adminUrl)})</script>`});
          }
          let admin='<button type="submit" name="nativeAdmin" value="Go to Admin">Go to Admin</button>';
          if(scenario==='direct')admin=`<a href="${adminUrl}">Go to Admin</a>`;
          if(scenario==='native-postback')admin=`<a href="javascript:__doPostBack('nativeAdmin','')">Go to Admin</a>`;
          if(scenario==='attached-handler')admin='<button type="button" id="native-admin">Go to Admin</button>';
          return route.fulfill({contentType:'text/html',body:`<h4>Edit Sales Order - Example - NZSO-99001A</h4>
           <form id="native-form" method="post" action="${entryUrl}" target="_top">
           <input type="hidden" name="__VIEWSTATE" value="fictional-state"><input type="hidden" name="__EVENTTARGET">
           <input id="notes" name="notes" value="Saved fictional note">${admin}</form><button id="receipt">Download Receipt</button>
           <script>function __doPostBack(target,arg){const form=document.getElementById('native-form');form.elements.__EVENTTARGET.value=target;form.submit();}
           document.getElementById('native-admin')?.addEventListener('click',()=>{const form=document.getElementById('native-form');const input=document.createElement('input');input.type='hidden';input.name='nativeAdmin';input.value='Go to Admin';form.append(input);form.submit();});</script>`});
        }
        if(url.pathname.includes('ShoppingCartAdmin'))return route.fulfill({contentType:'text/html',body:
          `<h4>Admin - Example - ${scenario==='wrong-order'?'NZSO-99001':'NZSO-99001A'}</h4>
          <a href="/Cloud/Docs/PDF/?T=Invoice&ID=987">Dynamic Invoice</a>`+(scenario==='missing-receipt'?'':
          `<a href="/Cloud/Docs/PDF/?T=${scenario==='receipt-template'?'Receipt':'Order%205'}&ID=987&SID=456">PDF</a>`)});
        pdfRequests++;
        return route.fulfill({status:scenario==='pdf-http-error'?403:200,contentType:scenario==='invalid-pdf'?'text/html':'application/pdf',
          body:Buffer.from(scenario==='invalid-pdf'?'<html>Login required</html>':'%PDF-1.7\n'+'fictional receipt '.repeat(80)+'\n%%EOF')});
      });
      await context.exposeBinding('openNativeReceipt',async(_,url,options)=>{
        workerOptions=options;worker=await context.newPage();worker.on('pageerror',error=>errors.push(error.message));await worker.goto(url);
      });
      await context.exposeBinding('closeNativeReceipt',async()=>{if(worker&&!worker.isClosed())await worker.close();});
      await context.exposeBinding('recordOtherHelper',(origin,name)=>{if(origin.page!==parent)workerHelpers.push(name);});
      await context.addInitScript({content:`
       window.otherHelperRuns=[];
       window.GM_getResourceText=name=>name==='workflow' ? ((location.search.includes('lcNativeReceipt')||sessionStorage.getItem('lc-native-receipt-worker'))?${JSON.stringify(source)}:${JSON.stringify(parentResource)}) : 'window.otherHelperRuns.push('+JSON.stringify(name)+');window.recordOtherHelper('+JSON.stringify(name)+');';
       window.GM_getValue=()=>{};window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};
       window.GM_openInTab=(url,options)=>{${scenario==='open-failure'?'return null;':'window.openNativeReceipt(url,options);return {close(){window.closeNativeReceipt();}};'}};
       window.GM_xmlhttpRequest=options=>{fetch(options.url).then(async response=>{const result={status:response.status};
        if(options.responseType==='arraybuffer')result.response=await response.arrayBuffer();else result.responseText=await response.text();options.onload(result);
       }).catch(()=>options.onerror());};
       window.alerts=[];window.alert=message=>window.alerts.push(message);
       if(${JSON.stringify(scenario)}==='blocked-auto')document.addEventListener('click',event=>{
        if(event.target.tagName==='A'&&event.target.href.startsWith('blob:')&&!event.isTrusted)event.preventDefault();
       },true);
       document.addEventListener('DOMContentLoaded',()=>{${loader}\n});`});
      parent=await context.newPage();parent.on('download',download=>downloads.push(download.suggestedFilename()));parent.on('pageerror',error=>errors.push(error.message));
      await parent.goto(entryUrl);
      await parent.locator('#notes').fill('Unsaved fictional note');
      await parent.locator('#receipt').click();
      if(scenario==='parallel')await parent.evaluate(()=>document.getElementById('receipt').click());
      if(scenario==='missing-receipt'){
        for(let i=0;i<100&&!worker;i++)await new Promise(resolve=>setTimeout(resolve,20));
        await worker.waitForURL(/ShoppingCartAdmin/);
        await worker.evaluate(()=>{const now=Date.now();Date.now=()=>now+176000;});
      }
      try { await parent.waitForFunction(()=>!document.getElementById('receipt').disabled,null,{timeout:12000}); }
      catch(error) {
        console.error({scenario,errors,worker:worker&&!worker.isClosed()?await worker.evaluate(()=>({path:location.pathname,state:sessionStorage.getItem('lc-native-receipt-worker'),status:window.__lcAllInOneStatus,other:window.otherHelperRuns})):null,postbacks,pdfRequests});throw error;
      }
      const failure=['wrong-order','missing-receipt','pdf-http-error','invalid-pdf','open-failure'].includes(scenario);
      if(failure){
        assert.equal(downloads.length,0);assert.equal((await parent.evaluate(()=>window.alerts)).length,1);
      }else{
        assert.deepEqual(await parent.evaluate(()=>window.alerts),[]);
        if(scenario==='blocked-auto'){
          assert.equal(downloads.length,0);await parent.getByRole('link',{name:'Save receipt PDF'}).click();
        }
        await parent.waitForTimeout(100);assert.deepEqual(downloads,['NZSO-99001A-receipt.pdf']);
        assert.equal(pdfRequests,1);assert.equal(requestUrls.at(-1).searchParams.get('ID'),'987');
        assert.equal(requestUrls.at(-1).searchParams.get('SID'),'456');
      }
      if(scenario!=='open-failure'){
        assert.deepEqual(workerOptions,{active:false,insert:true,setParent:true});
        for(let i=0;i<50&&!worker.isClosed();i++)await new Promise(resolve=>setTimeout(resolve,20));
        assert(worker.isClosed(),'Inactive helper closes after returning result');
        if(scenario!=='direct')assert.equal(postbacks,1,'Uses native control once, including server postbacks');
      }
      assert.equal(parent.url(),entryUrl,'Staff order does not navigate');
      assert.equal(await parent.locator('#notes').inputValue(),'Unsaved fictional note');
      assert.equal(await parent.locator('#receipt').innerText(),'Download Receipt');
      assert.equal(await parent.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('lc-native-receipt:')).length),0);
      assert.equal(requestUrls.filter(url=>url.searchParams.get('T')==='Invoice').length,0);
      assert.deepEqual(errors,[]);
      assert.deepEqual(workerHelpers,[],'Normal order helpers never run in the receipt tab');
      await context.close();console.log(`PASS receipt with actual All-in-One loader and full native worker: ${scenario}`);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
