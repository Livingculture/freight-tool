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
    else if(request.updateCells){const data=request.updateCells;assert.equal(data.start.sheetId,0);const value=data.rows[0].values[0].userEnteredValue;nextValues[data.start.rowIndex][data.start.columnIndex]=value.stringValue??value.numberValue;}
    else if(request.repeatCell){const data=request.repeatCell;assert.equal(data.range.endRowIndex-data.range.startRowIndex,1);const colour=data.cell.userEnteredFormat.backgroundColor;const hex='#'+[colour.red,colour.green,colour.blue].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');for(let column=data.range.startColumnIndex;column<data.range.endColumnIndex;column++)nextBackgrounds[data.range.startRowIndex][column]=hex;}
    else throw Error('Unexpected sheet operation');
  }
  values=nextValues;backgrounds=nextBackgrounds;metadata=nextMetadata;
}
const context=vm.createContext({Date,JSON,Number,Object,Array,String,Math,isFinite,Error,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},getUuid:()=>crypto.randomUUID(),computeDigest:(_,value)=>Array.from(crypto.createHash('sha256').update(value).digest()),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),formatDate:(date,zone)=>{assert.equal(zone,'Pacific/Auckland');return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}},Session:{getActiveUser:()=>({getEmail:()=>email})},SpreadsheetApp:{openById:id=>{assert.equal(id,'1tHDqaApj978tVT8SnSlQ0S-EytkmNM0MlnD8i5cIapc');return{getSheets:()=>[sheet]};},flush(){}},LockService:{getScriptLock:()=>({waitLock(){if(locked)throw Error('Stock update busy');locked=true;},releaseLock(){locked=false;}})},Sheets:{Spreadsheets:{batchUpdate:(body,id)=>{assert.equal(id,'1tHDqaApj978tVT8SnSlQ0S-EytkmNM0MlnD8i5cIapc');applyBatch(body);}}}});
vm.runInContext(code,context);
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
const expiredRecord=JSON.parse(heldMetadata.value);expiredRecord.expiresAt=Date.now()-1000;heldMetadata.value=JSON.stringify(expiredRecord);
held=list().rows.find(row=>row.id===hold.unitId);assert.equal(held.status,'Expired hold');
assert.throws(()=>context.updateStock(request(held,'hold','NZSO-17010')),/already held/,'Expiry flags review rather than silently freeing stock');
const paidRequest=request(held,'paid');result=context.updateStock(paidRequest);assert.equal(result.rows[0].status,'Paid');assert.equal(backgrounds[1][0],'#ea9999');
const unchanged=JSON.stringify({values,backgrounds,metadata});failAtomic=true;assert.throws(()=>context.updateStock(request(result.rows[1])),/rejected/);assert.equal(JSON.stringify({values,backgrounds,metadata}),unchanged,'A rejected batch leaves all quote/date/format/metadata untouched');failAtomic=false;
email='external@example.test';assert.throws(list,/Living Culture/);assert.throws(()=>context.updateStock(hold),/Living Culture/);email='';assert.throws(list,/Living Culture/);email='tamara@livingculture.co.nz';
locked=true;assert.throws(list,/busy/);locked=false;
values.splice(1,0,['CS00000-1','New unit','Freestanding','3 x 3','Black',1,'','','','','']);backgrounds.splice(1,0,headings.map(()=> '#ffffff'));metadata.forEach(item=>item.row++);
const moved=list().rows.find(row=>row.id===held.id);assert.equal(moved.rowNumber,3);assert.equal(moved.status,'Paid','IDs follow units when spreadsheet rows move');
assert.throws(()=>context.updateStock({...request(moved),action:'delete'}),/Choose Hold/,'There is no row-removal action');
assert.equal(context.stockColourState_(['#fff2cc','#ffffff']),'Held');assert.equal(context.stockColourState_(['#ea9999']),'Paid');assert.equal(context.stockColourState_(['#abcdef']),'Review status');
assert.equal(context.stockColourState_(['#fff2cc','#ea9999']),'Review status');

(async()=>{
  const browser=await chromium.launch();
  try{
    for(const width of [1440,820,390]){
      const page=await browser.newPage({viewport:{width,height:1000}});let failure=false,submitted=null;
      await page.route('https://stock.test/**',route=>route.fulfill({contentType:'text/html',body:html.replace('<script>','<script>'+`window.google={script:{url:{getLocation:callback=>callback({hash:'quote=NZSO-17009&customer=Customer%20Name&rep=PEN-Tamara'})},run:{withSuccessHandler(callback){this.success=callback;return this;},withFailureHandler(callback){this.failure=callback;return this;},getStock(){const ok=this.success,fail=this.failure;window.liveApi('getStock').then(ok,fail);},updateStock(input){const ok=this.success,fail=this.failure;window.liveApi('updateStock',input).then(ok,fail);}}}};`)}));
      await page.exposeFunction('liveApi',async(name,input)=>{
        if(failure)throw Error('Permission denied');
        if(name==='getStock')return JSON.parse(JSON.stringify(list()));
        submitted=input;return JSON.parse(JSON.stringify(context.updateStock(input)));
      });
      await page.goto('https://stock.test/');await page.getByText('Live spreadsheet updates',{exact:false}).waitFor();
      assert.equal(await page.locator('input[type="search"],select').count(),0,'List is shown directly without searching');
      assert.equal(await page.locator('.unit').count(),3);
      page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Hold 24 hours'}).first().click();
      await page.getByText('Stock hold saved to spreadsheet.').waitFor();assert.equal(submitted.confirmed,true);assert.equal(submitted.quote,'NZSO-17009');
      assert.equal(await page.locator('.unit.held').count(),1);
      await page.screenshot({path:`/tmp/caribbean-stock-live-${width}.png`,fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      failure=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Permission denied',{exact:false}).waitFor();
      assert.equal(await page.locator('.actions button:enabled').count(),0,'Failed reads never leave active allocation controls');
      failure=false;
      // Release fixture state for the next viewport; no production data is used.
      values[1][9]='';values[1][10]='';backgrounds[1]=headings.map(()=> '#ffffff');metadata=metadata.filter(item=>!(item.row===2&&item.key==='LC_CARIBBEAN_ALLOCATION_V1'));
      await page.close();
    }
    for(const platform of ['omni','core']){
      const page=await browser.newPage({viewport:{width:1280,height:900}});
      await page.route('https://**/*',route=>route.fulfill({contentType:'text/html',body:'<h1>'+(platform==='omni'?'Edit Sales Order - Customer Name - NZSO-17009':'Sale SFOR12345')+'</h1><div id="lc-omni-workflow-tools-bar" style="display:flex"></div><form><input value="Unsaved"><button type="submit">Save</button></form>'}));
      await page.goto(platform==='omni'?'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx':'https://inventory.dearsystems.com/Sale');
      await page.evaluate(()=>{window.GM_getValue=()=> 'https://script.google.com/macros/s/test-app/exec';window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};window.open=(url,name,features)=>{window.opened={url,features};return{opener:window,focus(){}};};});
      await page.addScriptTag({content:launcher});await page.getByRole('button',{name:'Caribbean Stock',exact:true}).click();
      const opened=await page.evaluate(()=>window.opened);const url=new URL(opened.url);assert.equal(url.origin,'https://script.google.com');assert.equal(url.search,'','Customer details stay in fragment, not server query logs');assert.equal(new URLSearchParams(url.hash.slice(1)).get('quote'),platform==='omni'?'NZSO-17009':'SFOR12345');assert(opened.features.includes('popup=yes'));
      assert.equal(await page.locator('input').inputValue(),'Unsaved');await page.close();
    }
    console.log('PASS: Google-account access, individual stable units, atomic quote/date/yellow-red updates, competing/stale holds, idempotent retry, payment verification, no deletion API, move-safe row IDs, direct responsive list, failure guards and Core/Omni launchers. Google/Sheet services mocked; deployment/real writes not tested.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
