const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {chromium}=require('playwright');
const code=fs.readFileSync('apps-script/caribbean-stock/Code.gs','utf8');
const html=fs.readFileSync('apps-script/caribbean-stock/Stock.html','utf8');
const launcher=fs.readFileSync('userscripts/caribbean-stock.user.js','utf8');
const headings=['CS code','Name','Type','Size','Color','Available (AKL)','Available (on water)','Available (Foshan)','Notes','Quote Number','Date'];
let email='tamara@livingculture.co.nz',locked=false,failAtomic=false,calls=[],nextId=1;
let values=[headings,['CS19500-11','Caribbean Pergola','Freestanding','7 x 4','White',1,'','','','',''],['CS19500-11','Caribbean Pergola','Freestanding','7 x 4','White','','',1,'','','']];
let backgrounds=values.map(row=>row.map(()=> '#ffffff')),metadata=[];
const sheet={getSheetId:()=>0,getDataRange:()=>({getValues:()=>structuredClone(values),getDisplayValues:()=>values.map(row=>row.map((value,index)=>index===10&&typeof value==='number'?new Date((value-25569)*86400000).toISOString().slice(0,10).split('-').reverse().join('/'):String(value))),getBackgrounds:()=>structuredClone(backgrounds)}),createDeveloperMetadataFinder(){let key;return{withKey(value){key=value;return this;},find(){return metadata.filter(item=>item.key===key).map(item=>({getLocation:()=>({getRow:()=>({getRow:()=>item.row})}),getValue:()=>item.value,getId:()=>item.id}));}};}};
function applyBatch(body){
  assert(locked,'All stock updates hold the script lock');
  calls.push(structuredClone(body));
  if(failAtomic)throw Error('Google batch rejected');
  const nextValues=structuredClone(values),nextBackgrounds=structuredClone(backgrounds),nextMetadata=structuredClone(metadata);
  for(const request of body.requests){
    if(request.createDeveloperMetadata){const data=request.createDeveloperMetadata.developerMetadata;assert.equal(data.location.dimensionRange.sheetId,0);nextMetadata.push({id:nextId++,key:data.metadataKey,value:data.metadataValue,row:data.location.dimensionRange.startIndex+1});}
    else if(request.updateDeveloperMetadata){const data=request.updateDeveloperMetadata;const item=nextMetadata.find(item=>item.id===data.dataFilters[0].developerMetadataLookup.metadataId);assert(item);item.value=data.developerMetadata.metadataValue;}
    else if(request.updateCells){const data=request.updateCells;assert.equal(data.start.sheetId,0);const value=data.rows[0].values[0].userEnteredValue;nextValues[data.start.rowIndex][data.start.columnIndex]=value?value.stringValue??value.numberValue:'';}
    else if(request.repeatCell){const data=request.repeatCell;assert.equal(data.range.endRowIndex-data.range.startRowIndex,1);const colour=data.cell.userEnteredFormat.backgroundColor;const hex='#'+[colour.red,colour.green,colour.blue].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');for(let column=data.range.startColumnIndex;column<data.range.endColumnIndex;column++)nextBackgrounds[data.range.startRowIndex][column]=hex;}
    else throw Error('Unexpected sheet operation');
  }
  values=nextValues;backgrounds=nextBackgrounds;metadata=nextMetadata;
}
const context=vm.createContext({Date,JSON,Number,Object,Array,String,Math,isFinite,Error,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},getUuid:()=>crypto.randomUUID(),computeDigest:(_,value)=>Array.from(crypto.createHash('sha256').update(value).digest()),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),formatDate:(date,zone)=>{assert.equal(zone,'Pacific/Auckland');return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}},Session:{getActiveUser:()=>({getEmail:()=>email})},SpreadsheetApp:{openById:id=>{assert.equal(id,'1tHDqaApj978tVT8SnSlQ0S-EytkmNM0MlnD8i5cIapc');return{getSheets:()=>[sheet]};},flush(){}},LockService:{getScriptLock:()=>({waitLock(){if(locked)throw Error('Stock update busy');locked=true;},releaseLock(){locked=false;}})},Sheets:{Spreadsheets:{batchUpdate:(body,id)=>{assert.equal(id,'1tHDqaApj978tVT8SnSlQ0S-EytkmNM0MlnD8i5cIapc');applyBatch(body);}}}});
vm.runInContext(code,context);
context.Utilities.newBlob=value=>({getBytes:()=>Array.from(Buffer.from(value))});
const triggers=[];
context.ScriptApp={getProjectTriggers:()=>triggers,newTrigger:handler=>({timeBased(){return this;},everyMinutes(minutes){assert.equal(minutes,1);return this;},create(){triggers.push({getHandlerFunction:()=>handler});}})};
context.enableStockAutomation();context.enableStockAutomation();assert.equal(triggers.length,1,'Installing automation twice creates only one timer');
const list=()=>context.getStock();
let stock=list();assert.equal(stock.rows.length,2);assert.equal(new Set(stock.rows.map(row=>row.id)).size,2,'Duplicates have separate stable unit IDs');
assert(stock.rows.every(row=>row.status==='Available'));assert(!JSON.stringify(stock).includes('_record'));
const request=(unit,action='hold',quote='NZSO-17009')=>({unitId:unit.id,revision:unit.revision,action,quote,customer:'Customer Name',rep:'PEN-Tamara',confirmed:true,requestId:crypto.randomUUID()});
const hold=request(stock.rows[0]);
assert.throws(()=>context.updateStock({...hold,confirmed:false}),/Confirm/);
let result=context.updateStock(hold),held=result.rows.find(row=>row.id===hold.unitId);
assert.equal(held.status,'Held');assert.equal(values[1][9],'NZSO-17009');assert.equal(typeof values[1][10],'number');assert.equal(backgrounds[1][0],'#fff2cc');
assert.equal(held.allocation.expiresAt-held.allocation.at,86400000);
const batch=calls.at(-1);assert.equal(batch.requests.length,4,'Quote/date/colour/allocation are one transaction');
assert.equal(batch.requests[1].updateCells.rows[0].values[0].userEnteredFormat.numberFormat.pattern,'dd/MM/yyyy');
const reordered=context.stockColumns_(Array.from(headings).reverse());assert.equal(reordered.quote,1);assert.equal(reordered.date,0,'Date and quote are resolved by heading, not K/Y');
assert.equal(result.rows.find(row=>row.id!==held.id).status,'Available','No other identical unit changed');
const count=calls.length;context.updateStock(hold);assert.equal(calls.length,count,'Retry does not duplicate or extend the hold');
assert.throws(()=>context.updateStock({...hold,quote:'NZSO-17010'}),/details changed/);
assert.throws(()=>context.updateStock(request(stock.rows[0],'hold','NZSO-17010')),/changed/,'A stale competing reservation is rejected');
assert.throws(()=>context.updateStock(request(held,'hold','NZSO-17010')),/already held/,'A freshly read held unit cannot be reallocated');
assert.throws(()=>context.updateStock(request(held,'paid','NZSO-17010')),/already held/,'Payment cannot steal another quote hold');
const heldMetadata=metadata.find(item=>item.key==='LC_CARIBBEAN_ALLOCATION_V1'&&item.row===2);
const interested=context.updateStock(request(held,'interest','NZSO-17010')).rows[0];
assert.equal(interested.interests.length,1);assert.equal(interested.quote,'NZSO-17009','Interest never replaces the original hold quote');
assert.equal(backgrounds[1][0],'#fff2cc');
context.updateStock(request(interested,'interest','NZSO-17010'));assert.equal(metadata.filter(item=>item.key==='LC_CARIBBEAN_INTEREST_V1').length,1,'Repeated interest does not create duplicates');
const expiredRecord=JSON.parse(heldMetadata.value);expiredRecord.expiresAt=Date.now()-1000;heldMetadata.value=JSON.stringify(expiredRecord);
// batch writes replace the fixture metadata array; update the current entry.
metadata.find(item=>item.id===heldMetadata.id).value=heldMetadata.value;
const beforeRelease=JSON.stringify({values,backgrounds,metadata});failAtomic=true;
assert.throws(()=>context.stockReleaseExpiredHolds_(),/rejected/);
assert.equal(JSON.stringify({values,backgrounds,metadata}),beforeRelease,'Failed automatic release never partially clears stock');failAtomic=false;
const originalDate=values[1][10];values[1][10]=originalDate+1;
context.stockReleaseExpiredHolds_();assert.equal(values[1][9],'NZSO-17009','Manual date changes prevent automatic release');values[1][10]=originalDate;
context.stockReleaseExpiredHolds_();
held=list().rows.find(row=>row.id===hold.unitId);assert.equal(held.status,'Available');
assert.equal(values[1][9],'');assert.equal(values[1][10],'');assert.equal(backgrounds[1][0],'#ffffff');
assert.equal(held.interests.length,1,'Interest survives automatic release');
assert.throws(()=>context.updateStock(hold),/sheet changed/,'Retrying an expired reservation cannot restart the hold');
const newHold=context.updateStock(request(held,'hold','NZSO-17010')).rows[0];assert.equal(newHold.quote,'NZSO-17010','Another customer can now reserve the released stock');
held=newHold;
const paidRequest=request(held,'paid','NZSO-17010');result=context.updateStock(paidRequest);assert.equal(result.rows[0].status,'Paid');assert.equal(backgrounds[1][0],'#ea9999');
context.stockReleaseExpiredHolds_();assert.equal(backgrounds[1][0],'#ea9999','Paid stock is never automatically released');
backgrounds[2]=headings.map(()=> '#fff2cc');values[2][9]='NZSO-17099';
context.stockReleaseExpiredHolds_();assert.equal(values[2][9],'NZSO-17099','Manual holds without timestamps are not released');
backgrounds[2]=headings.map(()=> '#ffffff');values[2][9]='';
const unchanged=JSON.stringify({values,backgrounds,metadata});failAtomic=true;assert.throws(()=>context.updateStock(request(result.rows[1])),/rejected/);assert.equal(JSON.stringify({values,backgrounds,metadata}),unchanged,'A rejected batch leaves all quote/date/format/metadata untouched');failAtomic=false;
email='external@example.test';assert.throws(list,/Living Culture/);assert.throws(()=>context.updateStock(hold),/Living Culture/);email='';assert.throws(list,/Living Culture/);email='tamara@livingculture.co.nz';
locked=true;assert.throws(list,/busy/);locked=false;
values.splice(1,0,['CS00000-1','New unit','Freestanding','3 x 3','Black',1,'','','','','']);backgrounds.splice(1,0,headings.map(()=> '#ffffff'));metadata.forEach(item=>item.row++);
const moved=list().rows.find(row=>row.id===held.id);assert.equal(moved.rowNumber,3);assert.equal(moved.status,'Paid','IDs follow units when spreadsheet rows move');
assert.throws(()=>context.updateStock({...request(moved),action:'delete'}),/Choose Hold/,'There is no row-removal action');
assert.equal(context.stockColourState_(['#fff2cc','#ffffff']),'Held');assert.equal(context.stockColourState_(['#ea9999']),'Paid');assert.equal(context.stockColourState_(['#abcdef']),'Review status');
assert.equal(context.stockColourState_(['#fff2cc','#ea9999']),'Review status');

(async()=>{
  values[3][1]='Caribbean Motorised Freestanding Louvre Roof Aluminium Pergola 7 x 4m White RAL9016';
  values[3][8]='Aiming for container 972 (if fits or one after)';
  const browser=await chromium.launch();
  try{
    for(const width of [1440,820,390]){
      const page=await browser.newPage({viewport:{width,height:1000}});let failure=false,submitted=null;
      await page.route('https://living-culture-freight.vercel.app/api/containers**',route=>route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,containers:[{container:'972',departure:'2026-10-01',arrive:'2026-11-02',products:'pergola',volume:'40HQ',categoryManager:'Cindy',shipper:'YGL',status:''}]})}));
      await page.route('https://stock.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace('<script>','<script>'+`window.google={script:{url:{getLocation:callback=>callback({hash:'quote=NZSO-17009&customer=Customer%20Name&rep=PEN-Tamara'})},run:{withSuccessHandler(callback){this.success=callback;return this;},withFailureHandler(callback){this.failure=callback;return this;},getStock(){const ok=this.success,fail=this.failure;window.liveApi('getStock').then(ok,fail);},updateStock(input){const ok=this.success,fail=this.failure;window.liveApi('updateStock',input).then(ok,fail);}}}};`)}));
      await page.exposeFunction('liveApi',async(name,input)=>{
        if(failure)throw Error('Permission denied');
        if(name==='getStock')return JSON.parse(JSON.stringify(list()));
        submitted=input;return JSON.parse(JSON.stringify(context.updateStock(input)));
      });
      await page.goto('https://stock.test/');await page.locator('#identity').filter({hasText:'@livingculture.co.nz'}).waitFor();
      assert.equal(await page.locator('input[type="search"],select').count(),0,'List is shown directly without searching');
      assert.equal(await page.locator('.unit').count(),3);
      assert.equal(await page.locator('.product .spec').count(),0,'Repeated type, size and colour line is hidden');
      assert.equal(await page.locator('.where .location + .status').count(),3,'Status sits beside location');
      assert.equal(await page.locator('.status.available').first().evaluate(element=>getComputedStyle(element).color),'rgb(25, 135, 84)','Available status is green');
      assert.equal(await page.getByText(/Sheet row \d+/).count(),0,'Spreadsheet row numbers are not displayed');
      await page.locator('.notes').getByText('Aiming for container 972 (if fits or one after)',{exact:true}).waitFor();
      const containerLink=page.getByRole('link',{name:'972',exact:true});
      assert.equal(await containerLink.getAttribute('href'),'https://living-culture-freight.vercel.app/containers.html?container=972','Container number opens the filtered LC Container tracker');
      await containerLink.hover();
      const tooltip=page.getByRole('tooltip');await tooltip.getByText('Container 972',{exact:true}).waitFor();
      await tooltip.getByText('At sea · On water',{exact:true}).waitFor();
      await tooltip.getByText('02 Nov 2026',{exact:true}).waitFor();
      await tooltip.getByText('pergola · 40HQ',{exact:true}).waitFor();
      await page.screenshot({path:`/tmp/caribbean-stock-tooltip-${width}.png`,fullPage:true});
      await page.locator('header').hover();
      page.on('dialog',()=>{throw Error('Native browser confirmation must not be shown');});
      await page.getByRole('button',{name:'Hold 24 hours'}).first().click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByRole('button',{name:'Hold stock',exact:true}).isEnabled(),false);
      await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(submitted,null,'Cancel never changes stock');
      await page.getByRole('button',{name:'Hold 24 hours'}).first().click();
      await page.screenshot({path:`/tmp/caribbean-stock-confirm-${width}.png`,fullPage:true});
      await page.getByRole('checkbox').check();
      await page.getByRole('button',{name:'Hold stock',exact:true}).click();
      await page.getByText('Stock hold saved to spreadsheet.').waitFor();assert.equal(submitted.confirmed,true);assert.equal(submitted.quote,'NZSO-17009');
      assert.equal(await page.locator('.unit.held').count(),1);
      await page.locator('input[name="quote"]').fill('NZSO-17011');
      await page.getByRole('button',{name:'Interested customer',exact:true}).first().click();
      await page.getByRole('dialog').getByText('NZSO-17011 · Customer Name',{exact:true}).waitFor();
      await page.getByRole('checkbox').check();
      await page.getByRole('button',{name:'Register interest',exact:true}).click();
      await page.getByText('Interested customer saved.',{exact:false}).waitFor();
      assert.equal(submitted.action,'interest');assert.equal(submitted.rep,'PEN-Tamara');
      assert.equal(await page.getByRole('button',{name:'Interest registered',exact:true}).count(),1);
      await page.screenshot({path:`/tmp/caribbean-stock-live-${width}.png`,fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      failure=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Permission denied',{exact:false}).waitFor();
      assert.equal(await page.locator('.actions button:enabled').count(),0,'Failed reads never leave active allocation controls');
      failure=false;
      // Release fixture state for the next viewport; no production data is used.
      values[1][9]='';values[1][10]='';backgrounds[1]=headings.map(()=> '#ffffff');metadata=metadata.filter(item=>!(item.row===2&&['LC_CARIBBEAN_ALLOCATION_V1','LC_CARIBBEAN_INTEREST_V1'].includes(item.key)));
      await page.close();
    }
    for(const platform of ['omni','core'])for(const configured of [undefined,'','https://script.google.com/macros/s/test-app/exec']){
      const page=await browser.newPage({viewport:{width:1280,height:900}});
      await page.route('https://**/*',route=>route.fulfill({contentType:'text/html',body:'<h1>'+(platform==='omni'?'Edit Quote - Customer Name - NZSO-17009':'Edit Sales Order - Customer Name - SFOR12345')+'</h1><div id="lc-omni-workflow-tools-bar" style="display:flex"></div><form><input value="Unsaved"><button type="submit">Save</button></form>'}));
      await page.goto(platform==='omni'?'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx':'https://inventory.dearsystems.com/Sale');
      await page.evaluate(configured=>{window.GM_getValue=(_,fallback)=>configured===undefined?fallback:configured;window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};window.prompt=()=>{throw Error('Staff should never be asked for the app address');};window.open=(url,name,features)=>{window.opened={url,features};return{opener:window,focus(){}};};},configured);
      await page.addScriptTag({content:launcher});await page.getByRole('button',{name:'Caribbean Stock',exact:true}).click();
      const opened=await page.evaluate(()=>window.opened);const url=new URL(opened.url);assert.equal(url.origin,'https://script.google.com');assert.equal(url.search,'','Customer details stay in fragment, not server query logs');assert.equal(new URLSearchParams(url.hash.slice(1)).get('quote'),platform==='omni'?'NZSO-17009':'SFOR12345');assert(opened.features.includes('popup=yes'));
      assert(opened.features.includes('width=900'),'The stock window opens at the narrower compact width');
      assert.equal(url.pathname,configured?'/macros/s/test-app/exec':'/a/macros/livingculture.co.nz/s/AKfycbwmxFo0-94s8lBr9jDjmMWk6FbxZKTaUDaUi9k3OW3MuSIi4QOmiCuqvm-1IJJlLJ5ZtA/exec','New users use the built-in address; existing admin overrides are preserved');
      assert.equal(await page.locator('input').inputValue(),'Unsaved');await page.close();
    }
    for(const title of ['<div>Edit Quote - nobody important - NZSO-17012<span id="lc-omni-heading-actions">Staff Guide Warranty Report Issue</span></div>','<span>Edit Quote - nobody important - NZSO &#8211; 17012</span>','<h5>Edit Quote - nobody important - NZSO17012</h5>']){
      const page=await browser.newPage();
      await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:'<nav>New Quote</nav><h1 style="display:none">Edit Quote - Old Customer - NZSO-11111</h1>'+title+'<p>Related order NZSO-99999</p><label for="rep">Sales Rep:</label><select id="rep"><option>PEN-Steve</option></select>'}));
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx');
      await page.evaluate(()=>{window.GM_getValue=(_,fallback)=>fallback;window.GM_registerMenuCommand=()=>{};window.open=url=>{window.opened=url;return{focus(){}};};});
      await page.addScriptTag({content:launcher});await page.getByRole('button',{name:'Caribbean Stock',exact:true}).click();
      const params=new URLSearchParams(new URL(await page.evaluate(()=>window.opened)).hash.slice(1));
      assert.equal(params.get('quote'),'NZSO-17012','Omni plain div titles and spaced/different dashes populate the current quote');
      assert.equal(params.get('customer'),'nobody important');assert.equal(params.get('rep'),'PEN-Steve');await page.close();
    }
    for(const [url,body,visible] of [
      ['https://go.cin7.com/Cloud/Dashboard/HomePageDashboard.aspx','<nav>New Quote</nav>',false],
      ['https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx','<h1>Edit Sales Order - Customer - NZSO-17012</h1>',false],
      ['https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx','<div>New Quote</div>',true],
      ['https://inventory.dearsystems.com/Dashboard','<h1>Quotes</h1>',false],
      ['https://inventory.dearsystems.com/Sales','<h1>Sales</h1>',false],
      ['https://inventory.dearsystems.com/Sale','<h1>Edit Sales Order - Customer - SFOR12345</h1>',true],
    ]){
      const page=await browser.newPage();await page.route('https://**/*',route=>route.fulfill({contentType:'text/html',body}));await page.goto(url);
      await page.evaluate(()=>{window.GM_registerMenuCommand=()=>{};});await page.addScriptTag({content:launcher});
      assert.equal(await page.locator('#lc-caribbean-stock-button').count(),visible?1:0,'Stock button is restricted to quote entry');
      if(visible){await page.evaluate(()=>{document.body.innerHTML='<h1>Edit Sales Order - Customer - NZSO-17012</h1>';});await page.waitForTimeout(100);assert.equal(await page.locator('#lc-caribbean-stock-button').count(),url.includes('go.cin7.com')?0:1);}
      await page.close();
    }
    console.log('PASS: Google-account access, individual stable units, atomic quote/date/yellow-red updates, competing/stale holds, idempotent retry, payment verification, no deletion API, move-safe row IDs, direct responsive list, failure guards and Core/Omni launchers. Google/Sheet services mocked; deployment/real writes not tested.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
