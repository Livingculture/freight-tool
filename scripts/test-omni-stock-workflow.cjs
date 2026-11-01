const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ts=require(path.resolve(__dirname,'../../workflow-speed-fix/node_modules/typescript'));
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const parsed=ts.createSourceFile('workflow.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=['omniStockServiceLine','omniStockRequirementRows','omniWorkflowStockStatus','omniProductStockObservation','omniWorkflowSnapshot','tableHeaderMap','indexForHeader','cellText','normalizeLabel',
  'syncOmniWorkflowRecord','finishOmniWorkflowSync','scheduleOmniWorkflowSync','installOmniWorkflowChangeHooks'];
const extracted=[];
function visit(node){if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text))extracted.push(node.getText(parsed));ts.forEachChild(node,visit)}
visit(parsed);assert.equal(extracted.length,names.length);
const functions=extracted.join('\n');

(async()=>{
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}});
    let available=5;
    await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().includes('ProductsList.aspx')?
      `<table><tr><th>Code</th><th>Stock Avail</th><th>SOH</th></tr><tr><td>CS19287</td><td>126</td><td>128</td></tr><tr><td>CS23564</td><td>${available}</td><td>6</td></tr></table>`:
      `<h1>Edit Sales Order - Lisa Bradley - NZSO-18025</h1><style>td,th{width:160px;height:40px}</style><table id="lines"><tr><th><span>1</span>Code</th><th><span>1</span>Product</th><th><span>1</span>Qty<br>Ordered</th></tr><tr><td><input value=""><span>CS19287</span></td><td>Betty Dining Chair</td><td>4</td></tr><tr><td>CS23564</td><td>Dipper Dining Table</td><td id="qty">1</td></tr><tr><td>AS123</td><td>Assembly</td><td>1</td></tr></table>`}));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=18025');
    await page.addScriptTag({content:`const clean=v=>String(v??'').replace(/\\s+/g,' ').trim();const isVisible=e=>e.getBoundingClientRect().width>0;
      const isOmniPage=()=>true,omniHeadingDraft=()=>({orderId:'NZSO-18025',documentType:'sales-order',customerName:'Lisa Bradley'}),cin7Draft=()=>({placedBy:'PEN-Steve'});
      const readOmniControlByLabel=()=>'',readValueNearLabel=()=>'',deriveBranchFromRep=()=> 'PEN',readMultilineNearLabel=()=>'',omniPaymentSummary=()=>({paid:true}),
      omniWorkflowFreightDescription=()=>'',omniWorkflowStage=()=> 'Ready To Pack - WMS',readMoneyNearLabels=()=>0,omniFullyDispatchedState=()=>false,quoteWorkflowRequestAction=()=>'';
      const API_KEY='',OMNI_ORDER_SYNC_API_URL='https://workflow.test/api/omni/orders';
      let omniOrderSyncInFlight=false,omniOrderSyncQueued=false,omniOrderSyncTimer=null,lastOmniOrderSyncDigest='';
      const requests=[],responses=[],GM_xmlhttpRequest=options=>requests.push(options);
      const linkExistingCustomerAlbumToQuote=()=>Promise.resolve(),applyOmniWorkflowResponse=value=>responses.push(value);
      const omniWorkflowStageControl=()=>null,scheduleOmniDispatchDate=()=>{},omniWorkflowStageKey=value=>value;
      let observations=[];${functions};document.addEventListener('lc-omni-stock-updated',()=>observations.push(omniProductStockObservation()));
      installOmniWorkflowChangeHooks();`});
    await page.addScriptTag({content:fs.readFileSync('userscripts/omni-product-availability.user.js','utf8')});
    await page.waitForFunction(()=>JSON.parse(document.getElementById('lc-omni-quote-stock')?.dataset.workflowStock||'{}').complete===true);
    assert.equal(await page.evaluate(()=>omniProductStockObservation()?.ready),true,'Numbered, split-line Omni headings must reach Workflow after stock lookup completes');
    const payload=await page.evaluate(()=>omniWorkflowSnapshot());
    assert.equal(payload.stockReady,true);assert.equal(payload.stockSource,'omni-products');assert.equal(payload.orderNumber,'NZSO-18025');
    assert.equal(payload.stage,'Ready To Pack - WMS');assert.equal(payload.paid,true);
    const serviceCases=[
      ['STANDARD SHIPPING (FRONTDOOR DELIVERY)','',true],['Delivery','',true],['FREIGHT','',true],
      ['SV001','Delivery Fee',true],['SV002','Express Shipping',true],['DELIVERY_001','',true],
      ['CS23160','Solo Teak Dining Chair - delivery available',false],['CS20001','Shipping Container Storage Box',false],
      ['PO20308-2','Retractable Shade Blind',false],['CS20794','Pergola',false]
    ];
    for(const [sku,name,expected] of serviceCases)assert.equal(await page.evaluate(([sku,name])=>omniStockServiceLine(sku,name),[sku,name]),expected,sku);
    await page.evaluate(()=>document.getElementById('lines').insertAdjacentHTML('beforeend',
      '<tr><td>STANDARD SHIPPING (FRONTDOOR DELIVERY)</td><td></td><td>1</td></tr><tr><td>SV001</td><td>Delivery Fee</td><td>1</td></tr><tr><td>FREIGHT</td><td></td><td>1</td></tr>'));
    assert.equal(await page.evaluate(()=>omniProductStockObservation()?.ready),true,'Service lines are excluded by the Workflow validator too');
    await page.locator('#lc-omni-quote-stock').locator('#refresh').click();
    await page.waitForFunction(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).complete===true);
    assert.equal(await page.evaluate(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).lines.length),2,'Service charges must not trigger stock lookups');
    const stockStates=await page.evaluate(()=>{
      const root=document.getElementById('lc-omni-quote-stock'),original=root.dataset.workflowStock;
      const report=JSON.parse(original);
      report.lines.forEach(line=>line.available=0);root.dataset.workflowStock=JSON.stringify(report);
      const empty=omniProductStockObservation();
      report.lines[0].available=1;root.dataset.workflowStock=JSON.stringify(report);
      const partial=omniProductStockObservation();
      report.lines[1].available=null;root.dataset.workflowStock=JSON.stringify(report);
      const unknown=omniProductStockObservation();root.dataset.workflowStock=original;
      return {empty,partial,unknown};
    });
    assert.equal(stockStates.empty.ready,false);assert.equal(stockStates.empty.partial,false,'No stock stays red');
    assert.equal(stockStates.partial.ready,false);assert.equal(stockStates.partial.partial,true,'Some quantity on hand is partial even if no complete line is covered');
    assert.equal(stockStates.unknown.partial,false,'Unknown product readings are not confirmed partial stock');
    await page.evaluate(()=>{window.savedDateParse=Date.parse;Date.parse=()=>null;});
    assert.equal(await page.evaluate(()=>omniProductStockObservation()?.ready),true,'A page-overridden date parser must not reject a fresh stock check');
    const timing=await page.evaluate(()=>{
      const root=document.getElementById('lc-omni-quote-stock'),original=root.dataset.workflowStock;
      const report=JSON.parse(original);
      delete report.checkedAtTick;root.dataset.workflowStock=JSON.stringify(report);
      const legacy=omniProductStockObservation()?.ready;
      report.checkedAt=new Date(Date.now()-121000).toISOString();report.checkedAtTick=performance.now()-121000;
      root.dataset.workflowStock=JSON.stringify(report);
      const expired=omniProductStockObservation(),expiryMessage=root.dataset.workflowSyncStatus;
      report.checkedAt='invalid';report.checkedAtTick=performance.now();root.dataset.workflowStock=JSON.stringify(report);
      const invalid=omniProductStockObservation();
      root.dataset.workflowStock=original;
      return {legacy,expired,expiryMessage,invalid};
    });
    assert.equal(timing.legacy,true,'Older stock panels remain compatible without Date.parse');
    assert.equal(timing.expired,null,'Genuinely stale stock must still be rejected');
    assert.match(timing.expiryMessage,/expired \(121s\)/);
    assert.equal(timing.invalid,null,'A monotonic timer must not permit an invalid server timestamp');
    await page.evaluate(()=>{Date.parse=window.savedDateParse;});
    await page.waitForFunction(()=>requests.length>0);
    // Complete any pending-check request; the actual event hooks must then send
    // the latest completed result, even when the earlier request was in flight.
    await page.evaluate(()=>{
      const request=requests[0],payload=JSON.parse(request.data);
      request.onload({status:200,responseText:JSON.stringify({jobProgress:{steps:[{label:'Stock',status:payload.stockReady===true?'In Stock':'Not recorded'}]}})});
    });
    await page.waitForFunction(()=>JSON.parse(requests.at(-1).data).stockReady===true);
    const sent=await page.evaluate(()=>JSON.parse(requests.at(-1).data));
    assert.equal(sent.stockSource,'omni-products');assert.equal(sent.includeProgress,true);
    assert.equal(sent.orderNumber,'NZSO-18025');
    await page.evaluate(()=>requests.at(-1).onload({status:200,responseText:JSON.stringify({jobProgress:{steps:[{label:'Stock',status:'In Stock'}]}})}));
    assert.match(await page.locator('#lc-omni-quote-stock').locator('#workflow-sync').textContent(),/confirmed In Stock/);
    for(const failure of ['http','network','timeout','invalid','unconfirmed']){
      await page.evaluate(failure=>{
        syncOmniWorkflowRecord({force:true});const request=requests.at(-1);
        if(failure==='http')request.onload({status:503,responseText:'{}'});
        else if(failure==='network')request.onerror();
        else if(failure==='timeout')request.ontimeout();
        else request.onload({status:200,responseText:failure==='invalid'?'not json':JSON.stringify({jobProgress:{steps:[{label:'Stock',status:'Not recorded'}]}})});
      },failure);
      assert.match(await page.locator('#lc-omni-quote-stock').locator('#workflow-sync').textContent(),
        {http:/HTTP 503/,network:/connection failed/,timeout:/timed out/,invalid:/response could not be read/,unconfirmed:/server has not confirmed/}[failure]);
    }
    assert.equal(await page.evaluate(()=>observations[0].ready),null,'Checking is unknown, not a false shortage');
    let report=await page.evaluate(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock));
    assert.deepEqual(report.lines.map(l=>[l.sku,l.quantity,l.available]),[['CS19287',4,126],['CS23564',1,5]]);
    await page.evaluate(()=>document.getElementById('lines').insertAdjacentHTML('beforeend','<tr><td>CS19287</td><td>Another chair line</td><td>2</td></tr>'));
    await page.waitForFunction(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).lines.find(l=>l.sku==='CS19287')?.quantity===6);
    await page.waitForFunction(()=>omniProductStockObservation()?.ready===true);
    // A stale positive observation cannot match changed quantities or another order.
    await page.evaluate(()=>document.getElementById('qty').textContent='6');
    assert.equal(await page.evaluate(()=>omniProductStockObservation()),null);
    await page.waitForFunction(()=>omniProductStockObservation()?.ready===false);
    await page.evaluate(()=>document.getElementById('qty').textContent='1');
    await page.waitForFunction(()=>omniProductStockObservation()?.ready===true);
    await page.evaluate(()=>{const node=document.getElementById('lc-omni-quote-stock');const r=JSON.parse(node.dataset.workflowStock);r.lines[1].available=null;node.dataset.workflowStock=JSON.stringify(r)});
    assert.equal(await page.evaluate(()=>omniProductStockObservation().ready),null,'A missing product reading is unknown');
    await page.evaluate(()=>{const node=document.getElementById('lc-omni-quote-stock');const r=JSON.parse(node.dataset.workflowStock);r.page+='other';node.dataset.workflowStock=JSON.stringify(r)});
    assert.equal(await page.evaluate(()=>omniProductStockObservation()),null,'Different orders cannot share results');
    assert.match(await page.locator('#lc-omni-quote-stock').locator('#workflow-sync').textContent(),/different page/);
    available=0;
    await page.locator('#lc-omni-quote-stock').locator('#refresh').click();
    await page.waitForFunction(()=>omniProductStockObservation()?.ready===false);
    await page.screenshot({path:'/tmp/omni-stock-workflow.png',fullPage:true});
    available=8;
    await page.evaluate(()=>{const realNow=Date.now.bind(Date);Date.now=()=>realNow()+61000;document.dispatchEvent(new Event('change'))});
    await page.waitForFunction(()=>omniProductStockObservation()?.ready===true);
    assert(source.includes("stockSource: stock ? 'omni-products'"));
    assert(source.includes("document.addEventListener('lc-omni-stock-updated'"));
    const full=await browser.newPage({viewport:{width:1400,height:900}});
    const errors=[];full.on('pageerror',error=>errors.push(error.message));
    let componentStock=8;
    await full.route('**/*',route=>route.fulfill({contentType:'text/html',body:route.request().url().includes('ProductsList.aspx')?
      `<table><tr><th>Code</th><th>Stock Avail</th><th>SOH</th></tr><tr><td>CS23361-2(CS23359CS23361)</td><td>0</td><td>1</td></tr><tr><td>CS23361</td><td>${componentStock}</td><td>8</td></tr><tr><td>CS23359</td><td>27</td><td>27</td></tr><tr><td>CS19200</td><td>58</td><td>77</td></tr></table>`:
      '<h1>Edit Sales Order - Evan Ou Yang - NZSO-18041</h1><table id="assembly"><tr><th>Format</th><th>BOM<br>Load</th><th><span>1</span>Code</th><th>Product</th><th><span>1</span>Qty<br>Ordered</th></tr><tr id="make"><td>Parent</td><td>Make</td><td>CS23361-2(CS23359CS23361)</td><td>Alabaster umbrella</td><td>1</td></tr><tr id="fabric"><td></td><td>Use</td><td>CS23361</td><td>Umbrella fabric</td><td>1</td></tr><tr id="frame"><td></td><td>Use</td><td>CS23359</td><td>Umbrella frame</td><td>1</td></tr><tr><td></td><td></td><td>CS19200</td><td>Granite umbrella base</td><td>1</td></tr></table>'}));
    await full.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=18041');
    await full.evaluate(()=>{
      Date.parse=()=>null;
      window.unsafeWindow=window;window.GM_getResourceText=()=> '[]';
      window.GM_getValue=(_,fallback)=>fallback;window.GM_setValue=()=>{};
      window.GM_registerMenuCommand=()=>{};window.GM_openInTab=()=>{};
      window.sentStock=[];
      window.GM_xmlhttpRequest=request=>{
        const body=JSON.parse(request.data||'{}');
        if(body.stockSource==='omni-products')sentStock.push(body);
        setTimeout(()=>request.onload?.({status:200,responseText:JSON.stringify({ok:true,
          jobProgress:{orderNumber:'NZSO-18041',steps:[{label:'Stock',state:body.stockReady===true?'done':'pending',status:body.stockReady===true?'In Stock':body.stockPartial?'Part Stock':body.stockReady===false?'Awaiting Stock':'Not recorded'}]}})}),0);
      };
    });
    await full.addScriptTag({content:source});
    await full.addScriptTag({content:fs.readFileSync('userscripts/omni-product-availability.user.js','utf8')});
    await full.waitForFunction(()=>document.getElementById('lc-omni-quote-stock')?.dataset.workflowSyncStatus?.startsWith('confirmed In Stock'));
    assert.equal(await full.evaluate(()=>sentStock.at(-1).stockReady),true);
    const assemblyLines=()=>full.evaluate(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).lines);
    assert.deepEqual((await assemblyLines()).map(line=>[line.sku,line.quantity]),[['CS23361',1],['CS23359',1],['CS19200',1]],'Expanded Make parent is not an additional stock requirement');
    // Use rows contain total quantities, not per-parent BOM ratios.
    await full.evaluate(()=>{document.querySelector('#make td:last-child').textContent='2';document.querySelector('#fabric td:last-child').textContent='4';document.querySelector('#frame td:last-child').textContent='2';});
    await full.waitForFunction(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).lines.find(line=>line.sku==='CS23361')?.quantity===4);
    assert.deepEqual((await assemblyLines()).map(line=>line.quantity),[4,2,1]);
    // A separately sold copy of a component must consume stock too.
    await full.evaluate(()=>document.getElementById('assembly').insertAdjacentHTML('beforeend','<tr><td></td><td></td><td>CS23361</td><td>Extra fabric</td><td>1</td></tr>'));
    await full.waitForFunction(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).lines.find(line=>line.sku==='CS23361')?.quantity===5);
    componentStock=3;
    await full.locator('#lc-omni-quote-stock').locator('#refresh').click();
    await full.waitForFunction(()=>document.getElementById('lc-omni-quote-stock')?.dataset.workflowSyncStatus?.startsWith('confirmed Part Stock'));
    assert.equal(await full.evaluate(()=>sentStock.at(-1).stockReady),false,'A component shortage still blocks stock readiness');
    assert.equal(await full.evaluate(()=>sentStock.at(-1).stockPartial),true,'Some component stock is partial, not fully in stock');
    // An incomplete expansion must not silently exempt the parent.
    await full.evaluate(()=>document.getElementById('frame').remove());
    await full.waitForFunction(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).lines.some(line=>line.sku.startsWith('CS23361-2(')));
    assert((await assemblyLines()).some(line=>line.sku==='CS23361-2(CS23359CS23361)'));
    await full.evaluate(()=>document.getElementById('fabric').remove());
    await full.waitForFunction(()=>JSON.parse(document.getElementById('lc-omni-quote-stock').dataset.workflowStock).lines.length===3);
    assert((await assemblyLines()).some(line=>line.sku==='CS23361-2(CS23359CS23361)'),'Collapsed/unexpanded Make parent remains a stock requirement');
    assert.deepEqual(errors,[],'Full scripts must boot without uncaught errors');
    await full.screenshot({path:'/tmp/omni-stock-full-sync.png',fullPage:true});
    await full.close();
    console.log('PASS: Shipping/delivery/freight excluded, real products retained, Make/Use components, partial stock, date parser overrides and full sync acknowledgement. Fixture only.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
