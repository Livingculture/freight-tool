const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
function extract(name) {
  const start = new RegExp(`  (?:async )?function ${name}\\(`).exec(source).index;
  const rest = source.slice(start), end = rest.slice(1).search(/\n  (?:async )?function /);
  return rest.slice(0, end + 1);
}
const constants = "const QUOTE_PDF_HANDOFF_KEY='test-background',QUOTE_PDF_TIMEOUT_MS=1000,QUOTE_PDF_RECEIPT_TIMEOUT_MS=3000,QUOTE_PDF_RETRY_MS=10,QUOTE_PDF_ADMIN_LINK_ATTEMPTS=4;";
const workerCode = constants + ['quotePdfTimeout', 'quotePdfWorkerHandoff', 'completeQuotePdfWorker', 'quotePdfTemplateLabel', 'quotePdfTemplateMatches', 'findQuotePdfAdminControl', 'saveQuotePdfBuffer', 'downloadSignedQuotePdf', 'continueQuotePdfFromEditWorker', 'continueQuotePdfFromAdmin'].map(extract).join('\n');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const scenario of ['success', 'receipt-background', 'receipt-delayed', 'missing-receipt', 'wrong-quote', 'http-error']) {
      const context = await browser.newContext({ acceptDownloads: true });
      let worker, savedName, openedOptions, closed = false;
      await context.route('https://go.cin7.com/**', route => {
        const admin = route.request().url().includes('ShoppingCartAdmin');
        return route.fulfill({contentType:'text/html',body:admin
          ? scenario === 'receipt-background' || scenario === 'receipt-delayed'
            ? '<a href="/Cloud/Docs/PDF/?T=Invoice&ID=363">Dynamic Invoice</a><a aria-label="Dynamic Receipt" href="/Cloud/Docs/PDF/?T=Receipt&ID=363"><span>PDF</span></a>'
            : scenario === 'missing-receipt'
              ? '<a href="/Cloud/Docs/PDF/?T=Invoice&ID=363">Dynamic Invoice</a>'
              : '<a href="/Cloud/Docs/PDF/?T=Quote&ID=363">Standard Quote</a>'
          : '<h1>Edit Quote - Customer - NZSO-17012</h1><a href="/Cloud/ShoppingCartAdmin/Orders/OrderDetails.aspx?idOrder=432" target="_blank">Go to Admin</a><button id="download">Download Quote</button>'});
      });
      await context.addInitScript({content:`
        if(location.search.includes('lcQuotePdfWorker')||location.pathname.includes('ShoppingCartAdmin')){
          window.normalizeLabel=value=>String(value||'').trim().toLowerCase();
          window.nativeReceiptClicks=0;
          document.addEventListener('click',event=>{
            if(window.normalizeLabel(event.target.closest('a,button')?.getAttribute('aria-label')||event.target.closest('a,button')?.textContent)==='dynamic receipt'){
              event.preventDefault();window.nativeReceiptClicks+=1;localStorage.setItem('test-native-receipt-clicks',String(window.nativeReceiptClicks));
            }
          },true);
          if(${JSON.stringify(scenario)}.includes('receipt')){
            const nativeSetTimeout=window.setTimeout.bind(window);
            window.setTimeout=(callback,delay,...args)=>nativeSetTimeout(callback,delay===15000?10:delay,...args);
          }
          window.isVisible=element=>${scenario === 'receipt-background' || scenario === 'receipt-delayed'
            ? "location.pathname.includes('ShoppingCartAdmin') ? false : element.getClientRects().length>0"
            : 'element.getClientRects().length>0'};
          window.omniHeadingDraft=()=>({orderId:${JSON.stringify(scenario === 'wrong-quote' ? 'NZSO-99999' : 'NZSO-17012')}});
          window.GM_xmlhttpRequest=options=>{
            window.pdfAttempts=(window.pdfAttempts||0)+1;
            const bytes=new Uint8Array(3501);bytes.set(new TextEncoder().encode('%PDF'));
            if(${JSON.stringify(scenario)}==='receipt-delayed'&&window.pdfAttempts===1){options.onload({status:202,response:new ArrayBuffer(0)});return;}
            options.onload({status:${scenario === 'http-error' ? 403 : 200},response:bytes.buffer});
          };
          ${workerCode}
          document.addEventListener('DOMContentLoaded',()=>{
            if(location.pathname.includes('ShoppingCartAdmin'))continueQuotePdfFromAdmin();else continueQuotePdfFromEditWorker();
          },{once:true});
        }
      `});
      const parent = await context.newPage();
      await parent.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=388');
      await parent.exposeFunction('openWorker', async (url, options) => {
        openedOptions = options;
        worker = await context.newPage();
        worker.on('download', download => { savedName = download.suggestedFilename(); });
        worker.on('close', () => { closed = true; });
        await worker.goto(url);
      });
      await parent.exposeFunction('closeWorker', async () => { if (worker && !worker.isClosed()) await worker.close(); });
      await parent.evaluate(() => {
        window.alerts=[];window.alert=message=>window.alerts.push(message);
        window.omniHeadingDraft=()=>({orderId:'NZSO-17012',documentType:'quote'});
        window.hubSpotGateOrderId=()=> 'NZSO-17012';window.isQuotePdfUnlocked=()=>true;
        window.open=()=>{throw Error('Foreground popup must not be opened');};
        window.GM_openInTab=(url,options)=>{
          window.openWorker(url,options);
          return {closed:false,close(){window.closeWorker();}};
        };
      });
      await parent.addScriptTag({content:constants+extract('quotePdfTimeout')+extract('downloadCurrentQuotePdf')});
      await parent.evaluate((template)=>{void downloadCurrentQuotePdf(document.getElementById('download'),template);}, scenario.includes('receipt') ? 'receipt' : 'quote');
      await parent.waitForFunction(()=>document.getElementById('download').disabled===false,{},{timeout:18000});
      for(let i=0;i<50&&!closed;i++)await new Promise(resolve=>setTimeout(resolve,20));
      assert(closed,'Background tab closes after result');
      assert.deepEqual(openedOptions,{active:false,insert:true,setParent:true});
      const errors=await parent.evaluate(()=>window.alerts);
      if(scenario==='success'){
        assert.equal(savedName,'NZSO-17012.pdf');assert.deepEqual(errors,[]);
      }else if(scenario==='receipt-background'||scenario==='receipt-delayed'){
        assert.equal(savedName,undefined);assert.deepEqual(errors,[]);
        assert.equal(await parent.evaluate(()=>localStorage.getItem('test-native-receipt-clicks')),'1','Dynamic Receipt is invoked through Cin7 native action');
      }else{
        assert.equal(savedName,undefined);assert.equal(errors.length,1);
        assert.match(errors[0],scenario==='missing-receipt'?/Dynamic Receipt link could not be found/:scenario==='wrong-quote'?/different quote/:/valid (?:quote )?PDF/);
      }
      assert.equal(await parent.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('test-background:')).length),0,'Request and result data are cleaned up');
      await context.close();
      console.log(`PASS background PDF: ${scenario}; native navigation, correlated cross-tab result, no foreground popup, tab closure and button recovery`);
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
