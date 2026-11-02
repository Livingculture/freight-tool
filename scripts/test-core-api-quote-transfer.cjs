const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.join(__dirname,'../userscripts/omni-core-quote-pilot.user.js'),'utf8');
const fixture={schema:'lc-core-quote-api-v1',sourceReference:'NZSO-10000',sourceSaleId:'test-sale',sourceDate:'2026-11-02',currency:'NZD',pricesIncludeGst:true,taxRate:15,tax:1764,total:13523.97,
 customer:{name:'Test Customer',firstName:'Test',lastName:'Customer',company:'',email:'test@example.invalid',phone:'0211234567',mobile:'0221234567'},
 shippingAddress:{line1:'1 Delivery Street',line2:'Delivery Suburb',city:'Test City',state:'Test Region',postcode:'1000',country:'New Zealand',contact:'Test Customer',company:''},
 billingAddress:{line1:'2 Billing Street',line2:'Billing Suburb',city:'Billing City',state:'Billing Region',postcode:'2000',country:'New Zealand',contact:'Test Customer',company:''},
 salesperson:'Test Rep',customerReference:'PO-test',terms:'Cash',carrier:'Test carrier',memo:'Installation required. Original Core quote memo',notes:'Original Core note',warnings:[],
 lines:[['CS10000-9',1,8299.99,15,7054.99],['AS10000',1,1600,0,1600],['AS10001',2,400,0,800],['CS10001',2,1099.99,0,2199.98],['AS10002',2,250,0,500],['AS10003',1,1200,0,1200]].map(([sku,quantity,unitPrice,discountPercent,amount])=>({sku,description:'Test '+sku,quantity,unitPrice,discountPercent,amount})),
 additionalCharges:[{description:'Shipping',quantity:1,unitPrice:169,discountPercent:0,amount:169}],freight:{description:'Shipping',amount:169},surcharge:{description:'',amount:0},discount:{description:'',amount:0}};
const entry='https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx';
let headingLayout='wrapped';
function fields(section){
 const contact=section==='Contact';const prefix=contact?'contact':section==='Delivery Address'?'delivery':'billing';
 const names=['First Name','Last Name','Company',...(contact?['Phone','Mobile','Email Address']:['Address 1','Address 2','City','State/Region','Postal Code','Country'])];
 const heading=headingLayout==='table'?'<table><tbody><tr><td>'+section+'</td></tr></tbody></table>':'<h5><span>'+section+'</span></h5>';
 return '<section><div>'+heading+names.map(name=>{const id=prefix+name.replace(/[^a-z0-9]/gi,'');const label=contact||['First Name','Last Name','Company'].includes(name)?name:(prefix==='delivery'?'Delivery ':'Billing ')+name;return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" '+(name==='Email Address'?'type="email"':'')+'></div>'}).join('')+'</div></section>';
}
function omni(){return `<!doctype html><html><head><style>body{font:14px Arial;margin:16px}.columns{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.field{display:grid;grid-template-columns:130px 1fr;align-items:center;gap:8px;margin:6px 0}.field input{width:100%;box-sizing:border-box}input,select{height:28px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}td input{width:90px}.financial{display:flex;align-items:center;gap:8px;margin:8px 0}.financial span,.financial button{width:120px}.financial input{width:130px}.option{position:absolute;background:white;border:1px solid gray;z-index:999999;padding:8px}</style></head><body>
<h1>New Quote<span id="lc-staff-tools"><button type="button">Staff Guide</button></span></h1><form><div class="columns">${fields('Contact')}${fields('Delivery Address')}${fields('Billing Address')}</div>
<label for="selected">Selected Customer</label><input id="selected" readonly><label for="rep">Sales Rep</label><select id="rep"><option></option><option>Test Rep</option></select>
<div><label for="comments">Internal Comments</label><textarea id="comments"></textarea></div><div><label for="memo">Delivery Instructions</label><textarea id="memo" aria-label="Delivery Instructions"></textarea></div>
<table id="products"><thead><tr><th>Code</th><th>Product</th><th>Qty Ordered</th><th>Unit Price</th><th>% Disc</th></tr></thead><tbody>${Array.from({length:8},()=>'<tr><td><input class="code"></td><td></td><td><input value="1"></td><td><input value="0"></td><td><input value="0"></td></tr>').join('')}</tbody></table>
${[['Freight Costs','freight'],['Surcharge','surcharge'],['Discount','discount']].map(([label,id])=>'<div class="financial"><span>'+label+'</span><input id="'+id+'Description"><input id="'+id+'Amount" value="0.00"></div>').join('')}
<p id="tax">Total Tax 15% 0.00</p><p id="total">Total: 0.00 NZD</p><button type="submit">Save</button><button type="button" id="approve">Approve</button></form>
<script>window.saves=0;window.approvals=0;window.feeRace=false;document.querySelector('form').onsubmit=e=>{e.preventDefault();saves++};document.querySelector('#approve').onclick=()=>approvals++;
setInterval(()=>{const codes=[...document.querySelectorAll('#products .code')].filter(field=>field.value);if(codes.length&&codes.length<6&&document.querySelector('#memo').value.includes('Installation required'))window.feeRace=true},30);
const contact=document.getElementById('contactFirstName');contact.addEventListener('input',()=>{if(contact.value!=='test@example.invalid')return;document.querySelector('.option')?.remove();const option=document.createElement('div');option.className='option';option.setAttribute('role','option');option.textContent='Test Customer test@example.invalid';const r=contact.getBoundingClientRect();option.style.left=r.left+'px';option.style.top=(r.bottom+scrollY)+'px';option.onclick=()=>{document.getElementById('selected').value='Test Customer';document.getElementById('contactEmailAddress').value='test@example.invalid';contact.value='Test';document.getElementById('contactLastName').value='Customer';option.remove()};document.body.appendChild(option)});
function totals(){let total=0;document.querySelectorAll('#products tbody tr').forEach(row=>{const inputs=row.querySelectorAll('input');if(inputs[0].value)total+=Number(inputs[1].value)*Number(inputs[2].value)*(1-Number(inputs[3].value)/100)});total+=Number(document.getElementById('freightAmount').value)+Number(document.getElementById('surchargeAmount').value)-Number(document.getElementById('discountAmount').value);document.getElementById('total').textContent='Total: '+total.toFixed(2)+' NZD';document.getElementById('tax').textContent='Total Tax 15% '+(total*15/115).toFixed(2)}
document.querySelectorAll('.code').forEach(input=>input.addEventListener('input',()=>{input.closest('tr').cells[1].textContent='Native product '+input.value}));document.addEventListener('input',totals);document.addEventListener('change',totals);
document.querySelectorAll('.financial input').forEach(input=>input.addEventListener('change',()=>{if(input.id.endsWith('Amount'))input.value=Number(input.value).toFixed(2)}));</script></body></html>`;}
(async()=>{
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1600,height:1000}});const gm={};let lookups=0,pauseLookup=false,resumeLookup;
 await context.exposeBinding('__saveGM',(_source,key,value)=>{gm[key]=value});
 await context.exposeBinding('__deleteGM',(_source,key)=>{delete gm[key]});
 await context.addInitScript({content:`if(location.hostname!=='living-culture-workflow.vercel.app'){const open=window.open;window.open=function(...args){const popup=open.apply(this,args);window.__lastPopup={popup,url:args[0]};return popup};window.GM_getValue=(key,fallback)=>window.__gmBoot?.[key]??fallback;window.GM_setValue=(key,value)=>{window.__gmBoot??={};window.__gmBoot[key]=value;void window.__saveGM(key,value)};window.GM_deleteValue=key=>{delete window.__gmBoot?.[key];void window.__deleteGM(key)};document.addEventListener('DOMContentLoaded',()=>{${source}\n});}`});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());let body='';
  if(url.hostname==='living-culture-workflow.vercel.app'){
   assert.equal(url.pathname,'/core-quote-transfer');assert.equal(url.searchParams.get('order'),'NZSO-10000');lookups++;
   if(pauseLookup)await new Promise(resolve=>{resumeLookup=resolve});
   body='<html><body><script>window.opener.postMessage('+JSON.stringify({type:'lc-core-quote-loaded',nonce:url.searchParams.get('nonce'),quote:fixture}).replace(/</g,'\\u003c')+','+JSON.stringify(url.searchParams.get('target'))+')</script></body></html>';
  }else if(url.hostname==='inventory.dearsystems.com')body='<html><body><h1>Core Sale</h1></body></html>';
  else if(url.pathname.includes('TransactionEntry'))body=omni();
  else {for(let i=0;i<20&&!gm['lc-core-api-quote-transfer-v1'];i++)await new Promise(r=>setTimeout(r,20));body='<html><body><a href="'+entry+'">New Quote</a></body></html>';}
  if(url.hostname!=='living-culture-workflow.vercel.app')body=body.replace('</body>','<script>window.__gmBoot='+JSON.stringify(gm).replace(/</g,'\\u003c')+'</script></body>');
  await route.fulfill({status:200,contentType:'text/html',body});
 });
 let page=await context.newPage();const el=id=>page.locator('#lc-core-import').locator('#'+id);
 async function completed(){await page.waitForFunction(()=>{const text=document.querySelector('#lc-core-import')?.shadowRoot?.querySelector('#status')?.textContent||'';return text.includes('copied into the unsaved Omni quote')||text.startsWith('Stopped:')},null,{timeout:45000});assert.match(await el('status').textContent(),/copied into the unsaved Omni quote/);}
 async function verify(){
  assert.equal(await page.locator('#selected').inputValue(),'Test Customer');assert.equal(await page.locator('#contactPhone').inputValue(),'0211234567');assert.equal(await page.locator('#contactMobile').inputValue(),'0221234567');
  assert.equal(await page.locator('#deliveryAddress1').inputValue(),'1 Delivery Street');assert.equal(await page.locator('#billingAddress1').inputValue(),'2 Billing Street');assert.equal(await page.locator('#deliveryAddress2').inputValue(),'Delivery Suburb');assert.equal(await page.locator('#billingAddress2').inputValue(),'Billing Suburb');
  assert.match(await page.locator('#comments').inputValue(),/NZSO-10000/);assert.equal(await page.locator('#memo').inputValue(),fixture.memo);assert.equal(await page.locator('#rep').inputValue(),'Test Rep');
  assert.equal(await page.locator('#freightAmount').inputValue(),'169.00');assert.equal(await page.locator('#surchargeAmount').inputValue(),fixture.surcharge.amount.toFixed(2));assert.equal(await page.locator('#discountAmount').inputValue(),fixture.discount.amount.toFixed(2));assert.equal(await page.locator('#total').textContent(),'Total: '+fixture.total.toFixed(2)+' NZD');assert.equal(await page.locator('#tax').textContent(),'Total Tax 15% '+fixture.tax.toFixed(2));assert.equal(await page.evaluate(()=>feeRace),false,'Core fee lines must be in place before the installation memo activates other helpers');
  assert.equal(await page.locator('#products .code').evaluateAll(nodes=>nodes.filter(input=>input.value).length),6);assert.deepEqual(await page.evaluate(()=>[saves,approvals]),[0,0]);
 }
 try{
  await page.goto(entry);await el('open').click();await el('reference').fill('10000');await el('lookup').click();
  await page.waitForFunction(()=>document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.includes('Preview loaded'));
  assert.equal(await page.locator('#products .code').first().inputValue(),'');await el('confirm').check();await el('fill').click();await completed();await verify();
  fixture.surcharge={description:'Special service',amount:23};fixture.discount={description:'Source quote discount',amount:200};fixture.total+=23-200;fixture.tax=Number((fixture.total*15/115).toFixed(2));
  fixture.additionalCharges.push({description:'Special service',quantity:1,unitPrice:23,discountPercent:0,amount:23},{description:'Source quote discount',quantity:1,unitPrice:-200,discountPercent:0,amount:-200});
  headingLayout='table';
  await page.goto('https://inventory.dearsystems.com/Sale');const corePage=page;const tab=context.waitForEvent('page');page.once('dialog',dialog=>dialog.accept('NZSO-10000'));await page.getByRole('button',{name:'Copy Core Quote to Omni'}).click();page=await tab;
  await page.waitForURL(/go\.cin7\.com\/Cloud\/TransactionEntry\/TransactionEntry\.aspx/,{timeout:30000});await completed();await verify();
  assert.equal(corePage.url(),'https://inventory.dearsystems.com/Sale','The Core quote tab stays open and unchanged');
  assert.equal(lookups,2);assert.equal(gm['lc-core-api-quote-transfer-v1'],undefined,'Handoff is consumed and customer data removed');
  await page.screenshot({path:'/tmp/core-api-quote-filled.png',fullPage:true});
  await page.goto(entry);pauseLookup=true;await el('open').click();await el('reference').fill('10000');await el('lookup').click();
  for(let i=0;i<100&&!resumeLookup;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert(resumeLookup);
  await page.evaluate(quote=>{
    const origin='https://living-culture-workflow.vercel.app',source=window.__lastPopup.popup,nonce=new URL(window.__lastPopup.url).searchParams.get('nonce');
    for(const attempt of [{origin:'https://evil.test',source,nonce},{origin,source,nonce:'wrong'},{origin,source:window,nonce}])window.dispatchEvent(new MessageEvent('message',{origin:attempt.origin,source:attempt.source,data:{type:'lc-core-quote-loaded',nonce:attempt.nonce,quote}}));
  },fixture);
  assert.doesNotMatch(await el('status').textContent(),/Preview loaded/);resumeLookup();
  await page.waitForFunction(()=>document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.includes('Preview loaded'));
  assert.equal(lookups,3);
  gm['lc-core-api-quote-transfer-v1']={nonce:'11111111-1111-1111-1111-111111111111',expires:Date.now()+600000,quote:fixture};
  const other=await context.newPage();await other.goto(entry);assert.equal(await other.locator('#lc-core-import').locator('#status').textContent(),'Enter a Core quote number.','An unrelated Omni tab must not consume another tab\'s quote');await other.close();
  delete gm['lc-core-api-quote-transfer-v1'];pauseLookup=false;
  await page.goto(entry);await el('open').click();await el('reference').fill('10000');await el('lookup').click();
  await page.waitForFunction(()=>document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.includes('Preview loaded'));
  await page.evaluate(()=>{const duplicate=document.createElement('h5');duplicate.textContent='Contact';document.body.prepend(duplicate)});
  await el('confirm').check();await el('fill').click();
  await page.waitForFunction(()=>document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.startsWith('Stopped:'));
  assert.match(await el('status').textContent(),/Cannot uniquely locate the Omni Contact section/);
  assert.equal(await page.locator('#selected').inputValue(),'');assert.equal(await page.locator('#products .code').first().inputValue(),'');
  console.log('PASS: Core number button -> authenticated-popup contract -> private cross-origin handoff -> native New Quote -> customer matching, phone/mobile, both addresses, memo, rep, six product lines, freight, GST/total, no file, no save/approve. Mock Core/Workflow/Omni services.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
