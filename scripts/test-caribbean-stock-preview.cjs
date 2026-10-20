const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {chromium} = require('playwright');
const ts = require('../../workflow-speed-fix/node_modules/typescript');
const source = fs.readFileSync('userscripts/caribbean-stock-preview.user.js','utf8');
const parsed = ts.createSourceFile('stock.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions = new Map();
function visit(node) { if(ts.isFunctionDeclaration(node)) functions.set(node.name?.text,node.getText(parsed));ts.forEachChild(node,visit); }
visit(parsed);
const pure = vm.createContext({URL,URLSearchParams,Date,DAY:86400000,mode:'sample',saved:{allocations:{}},clean:value=>String(value??'').replace(/\s+/g,' ').trim(),key:value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'')});
for(const name of ['sheetConfig','parseSheet','sampleRows','fingerprint','allocation','rowStatus'])vm.runInContext(functions.get(name),pure);
const config = pure.sheetConfig('https://docs.google.com/spreadsheets/d/test-sheet/edit#gid=123');
assert.equal(config.gid,'123');
assert.throws(()=>pure.sheetConfig('https://evil.test/spreadsheets/d/x/edit'));
assert.throws(()=>pure.sheetConfig('http://docs.google.com/spreadsheets/d/x/edit'));
assert.throws(()=>pure.sheetConfig('https://docs.google.com/spreadsheets/d/x/edit?gid=oops'));
const headings = ['Notes','Available (Foshan)','Color','CS code','Name','Available (on water)','Type','Available (AKL)','Date','Quote Number','Size'];
function row(code,quote='',note='',akl='1',foshan='') { return {c:[note,foshan,'White',code,'Caribbean Pergola','', 'Freestanding',akl,'20/10/2026',quote,'7 x 4'].map(v=>({v}))}; }
const payload = {status:'ok',table:{cols:headings.map(label=>({label})),rows:[row('CS19500-11'),row('CS19500-11'),row('CS19500-11','NZSO-17009','Already allocated'),row('CS20094-11','','Check quantities','2') ]}};
const raw = '/*O_o*/\ngoogle.visualization.Query.setResponse('+JSON.stringify(payload)+');';
const units = pure.parseSheet(raw,config);
assert.equal(units.length,4);assert.equal(new Set(units.map(row=>row.id)).size,4,'Duplicate products remain separate units');
assert.equal(units[0].location,'Auckland');assert.equal(units[0].colour,'White');assert.equal(units[2].quote,'NZSO-17009','Header-based mapping ignores original column letters');
assert.equal(units[3].validUnit,false,'Multi-unit rows are not silently treated as a single unit');
assert.throws(()=>pure.parseSheet('<html>Sign in</html>',config));
assert.throws(()=>pure.parseSheet('google.visualization.Query.setResponse({"status":"error"});',config));
assert.throws(()=>pure.parseSheet('google.visualization.Query.setResponse({"table":{"cols":[],"rows":[]}});',config));
const samples = pure.sampleRows();assert.equal(samples.length,17);assert.equal(new Set(samples.map(row=>row.code)).size,6);
assert.equal(samples.filter(row=>row.location==='Auckland').length,5);assert.equal(samples.filter(row=>row.location==='Foshan').length,11);assert.equal(samples.filter(row=>row.location==='On water').length,1);
const first = samples[0];pure.saved.allocations[first.id]={fingerprint:pure.fingerprint(first),status:'Held',expiresAt:Date.now()-1000};
assert.equal(pure.rowStatus(first),'Expired hold','Expired holds are flagged, never auto-released');
assert.equal(pure.allocation({...first,colour:'Black'}),null,'Changed row data cannot inherit an earlier preview');
pure.mode='live';assert.equal(pure.rowStatus(units[0]),'Check sheet','No colour information must not invent live availability');assert.equal(pure.rowStatus(units[2]),'Allocated in sheet');
assert(!fs.readFileSync('userscripts/livingculture-all-in-one.user.js','utf8').includes('caribbean-stock-preview'),'Separate script stays outside All-in-One');

(async()=>{
  const response=await fetch('https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js');assert(response.ok);const icons=await response.text();
  const browser=await chromium.launch();
  let transferred={};
  try {
    for(const platform of ['omni','core']) for(const width of [1440,820,390]) {
      const page=await browser.newPage({viewport:{width,height:1000}});
      const url=platform==='omni'?'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=39453':'https://inventory.dearsystems.com/Sale#test';
      const body=platform==='omni'?'<h1>Edit Sales Order - Test Customer - NZSO-17009</h1><div id="lc-omni-workflow-tools-bar" style="display:flex;flex-wrap:wrap;gap:8px"><button>Drawings</button></div>':'<h1>Sale SFOR12345</h1><div style="display:flex;flex-wrap:wrap;gap:8px"><button id="lc-promo-summary-inline-button">Promo Summary</button></div><label for="customer">Customer</label><input id="customer" value="Core Customer">';
      await page.route('https://**/*',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:16px;font:14px Arial;background:#edf3f6}h1{font-size:20px}button{min-height:36px}main{height:100px}</style>'+body+'<label for="rep">Sales Rep</label><select id="rep"><option>PEN-Tamara</option></select><form id="native"><input id="native-value" value="Unsaved order"><button type="submit">Save</button></form>'}));
      await page.goto(url);await page.addScriptTag({content:icons});
      await page.evaluate(({initial,raw})=>{
        window.previewStorage=initial;window.previewWrites=0;window.nativeSaves=0;window.network=[];window.sheetResponse=raw;window.sheetMode='denied';
        document.getElementById('native').addEventListener('submit',event=>{event.preventDefault();nativeSaves++;});
        window.GM_getValue=()=>structuredClone(previewStorage);
        window.GM_setValue=(key,value)=>{previewStorage=structuredClone(value);previewWrites++;};
        window.GM_xmlhttpRequest=options=>{network.push({method:options.method,url:options.url});setTimeout(()=>options.onload(sheetMode==='denied'?{status:401,responseText:'Sign in'}:sheetMode==='timeout'?{status:503,responseText:''}:{status:200,responseText:sheetResponse}),10);};
      },{initial:platform==='core'&&width===1440?transferred:{},raw});
      await page.addScriptTag({content:source});
      const button=page.locator('#lc-caribbean-stock-preview-button');await button.waitFor();
      assert.equal(await button.count(),1);await button.click();
      const dialog=page.getByRole('dialog',{name:'Caribbean Stock'});await dialog.waitFor();
      const root=page.locator('#lc-caribbean-stock-preview');
      await root.locator('#message').filter({hasText:'requires sign-in'}).waitFor();
      assert.equal(await root.locator('#open-sheet').getAttribute('href'),'https://docs.google.com/spreadsheets/d/1tHDqaApj978tVT8SnSlQ0S-EytkmNM0MlnD8i5cIapc/edit?gid=0#gid=0');
      await root.getByRole('button',{name:'Load screenshot sample'}).click();
      assert.equal(await root.locator('.unit').count(),17);assert.equal(await root.locator('.product').count(),6);
      assert((await root.locator('#source').textContent()).includes('Not current stock'));
      if(platform==='core'&&width===1440)assert.equal(await root.locator('.unit.held').count(),1,'The same TM preview storage can follow staff from Omni to Core');
      await root.locator('#location').selectOption('On water');assert.equal(await root.locator('.unit').count(),1);await root.locator('#location').selectOption('');
      await root.locator('#search').fill('CS19500-11');assert.equal(await root.locator('.unit').count(),4);
      const target=root.locator('[data-unit="sample:3"]');await target.getByRole('button',{name:'Preview hold'}).click();
      const form=root.locator('#allocation');
      assert.equal(await form.locator('[name="quote"]').inputValue(),platform==='omni'?'NZSO-17009':'SFOR12345');
      assert.equal(await form.locator('[name="customer"]').inputValue(),platform==='omni'?'Test Customer':'Core Customer');
      assert.equal(await form.locator('[name="rep"]').inputValue(),'PEN-Tamara');
      await form.locator('[name="confirmed"]').check();await form.getByRole('button',{name:'Save preview only'}).click();
      assert(await target.evaluate(element=>element.classList.contains('held')));assert.equal(await target.getByRole('button',{name:'Preview hold'}).count(),0,'Held unit cannot be held twice');
      const allocation=await page.evaluate(()=>previewStorage.allocations['sample:3']);assert.equal(allocation.expiresAt-allocation.at,86400000);
      await target.getByRole('button',{name:'Preview paid'}).click();await form.locator('[name="confirmed"]').check();await form.getByRole('button',{name:'Save preview only'}).click();
      assert(await target.evaluate(element=>element.classList.contains('paid')));
      page.on('dialog',dialog=>dialog.accept());await target.getByRole('button',{name:'Clear',exact:true}).click();assert(await target.evaluate(element=>!element.classList.contains('paid')));
      await root.locator('#search').fill('');
      const firstHold=root.locator('[data-unit="sample:2"]').getByRole('button',{name:'Preview hold'});
      if(await firstHold.count()){
        await firstHold.click();await form.locator('[name="confirmed"]').check();await form.getByRole('button',{name:'Save preview only'}).click();
      }
      if(platform==='omni'&&width===1440)transferred=await page.evaluate(()=>previewStorage);
      await root.locator('#search').fill('script');assert.equal(await root.locator('.unit').count(),0);await root.locator('#search').fill('');
      await page.evaluate(()=>sheetMode='live');await root.getByRole('button',{name:'Refresh spreadsheet'}).click();
      await root.locator('#source').filter({hasText:'SHEET DATA'}).waitFor();
      assert.equal(await root.locator('.unit').count(),4);assert.equal(await root.locator('.unit').filter({hasText:'Allocated in sheet'}).count(),1);
      assert.equal(await root.locator('[data-unit$=":4"] button:disabled').count(),2,'Existing quote allocations cannot be held or paid in the preview');
      assert.equal(await root.locator('[data-unit$=":5"] button:disabled').count(),2,'Multi-unit quantity errors block actions');
      await page.evaluate(()=>sheetMode='timeout');await root.getByRole('button',{name:'Refresh spreadsheet'}).click();
      await root.locator('#source').filter({hasText:'STALE SHEET DATA'}).waitFor();
      assert.equal(await root.locator('button[data-action="hold"]:enabled').count(),0,'Stale live reads cannot be acted on');
      await root.getByRole('button',{name:'Load screenshot sample'}).click();
      assert.equal(await page.evaluate(()=>nativeSaves),0);assert.equal(await page.locator('#native-value').inputValue(),'Unsaved order');
      const requests=await page.evaluate(()=>network);assert(requests.length>=3);assert(requests.every(request=>request.method==='GET'&&new URL(request.url).hostname==='docs.google.com'),'Only read-only Google requests, never sheet or Cin7 writes');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const overflow=await dialog.evaluate(element=>element.scrollWidth>element.clientWidth);assert(!overflow,'Dialog does not overflow horizontally');
      assert(await root.locator('#close svg').count(),'Lucide button icons rendered');
      await page.screenshot({path:`/tmp/caribbean-stock-${platform}-${width}.png`,fullPage:true});
      await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await button.evaluate(element=>document.activeElement===element),true,'Close restores focus to the launcher');
      await button.click();assert.equal(await root.locator('.unit.held').count(),1,'Preview survives closing and reopening');
      await root.getByRole('button',{name:'Close Caribbean Stock'}).click();
      await page.evaluate(()=>{const marker=document.createElement('span');marker.textContent='Native rerender';document.body.append(marker);});
      await page.waitForTimeout(80);assert.equal(await button.count(),1,'No duplicate launcher after host rerenders');
      await page.close();
    }
    console.log('PASS: Separate Core/Omni preview; 17 sample units, header-mapped live reads, private-sheet errors, filters, individual hold/paid/clear states, 24-hour expiry, cross-platform GM storage, stale/allocated/invalid row guards, accessible responsive dialogs, no sheet/Cin7 writes. Browser/API fixtures; live Google access still depends on staff sign-in.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
