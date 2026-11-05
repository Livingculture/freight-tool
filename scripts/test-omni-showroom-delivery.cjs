const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ts=require(process.env.TYPESCRIPT_MODULE||path.resolve(__dirname,'../../workflow/node_modules/typescript'));
const sourceText=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const ast=ts.createSourceFile('workflow.js',sourceText,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set([
  'findOmniSectionHeading','findOmniSectionField','setOmniControlValue','addressControlsForHeading',
  'deliveryBillingFields','copyDeliveryAddressToBilling','omniShowroomDeliveryStorageKey',
  'showroomFromDeliveryAddress','omniFreightDescriptionControl','setOmniShowroomFreightDescription',
  'syncOmniShowroomDeliveryPanelSelection','applyOmniShowroomDelivery','clearOmniShowroomDelivery',
  'positionOmniShowroomDeliveryPanel','ensureOmniShowroomDelivery','omniWorkflowFreightDescription'
]);
const declarations=[];
function visit(node){if(ts.isFunctionDeclaration(node)&&names.has(node.name?.text))declarations.push(node.getText(ast));ts.forEachChild(node,visit)}
visit(ast);
assert.equal(declarations.length,names.size,'All showroom-delivery functions are available to test');
const showrooms=[
  {key:'wairau',label:'Wairau',address:'Wairau Showroom'},
  {key:'penrose',label:'Penrose',address:'Penrose Showroom'},
  {key:'hamilton',label:'Hamilton',address:'Hamilton Showroom'},
  {key:'tauranga',label:'Tauranga',address:'Tauranga Showroom'},
  {key:'napier',label:'Napier',address:'Napier Showroom'},
  {key:'christchurch',label:'Christchurch',address:'Christchurch Showroom'},
  {key:'whangarei',label:'Whangārei',address:'Whangarei Showroom'}
];
const fields=[
  ['First Name','first','Bryan McGruer'],['Last Name','last',''],['Company','company','Bryan McGruer'],
  ['Address 1','address1','30A Hoskins Avenue'],['Address 2','address2','Hillsborough'],['City','city','Auckland'],
  ['State/Region','region','Auckland'],['Postal Code','postcode','1042'],['Country','country','New Zealand']
];
const section=(type,values)=>`<section class="column ${type.toLowerCase()}"><h2>${type} Address</h2>${fields.map(([label,key,value])=>`<div class="row"><label for="${type}-${key}">${['First Name','Last Name','Company'].includes(label)?label:`${type} ${label}`}</label><input id="${type}-${key}" value="${values?value:''}"></div>`).join('')}</section>`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1000}});
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font:14px Arial}.card{position:relative;width:1560px;height:900px;margin:20px;background:#fff}.column{position:absolute;top:20px;width:360px}.contact{left:20px}.delivery{left:450px}.billing{left:1200px}.row{display:grid;grid-template-columns:165px 190px;align-items:center;margin:7px 0}.row input{height:31px;width:190px}.freight{position:absolute;top:720px;right:40px;display:flex;align-items:center;gap:8px}.freight input{width:280px;height:32px}</style><div class="card"><section class="column contact"><h2>Contact</h2></section>${section('Delivery',true)}${section('Billing',false)}<div class="freight"><label>Freight</label><input id="native-freight" value=""><input id="lc-omni-freight-description-select" value=""><input value="0.00"></div></div>`);
    await page.addScriptTag({content:`
      const COPY_DELIVERY_BILLING_ID='lc-omni-copy-delivery-to-billing';
      const SHOWROOM_DELIVERY_PANEL_ID='lc-omni-showroom-delivery';
      const SHOWROOM_DELIVERY_STORAGE_PREFIX='lc-omni-showroom-delivery-original:';
      const SHOWROOM_DELIVERY_OPTIONS=${JSON.stringify(showrooms)};
      const clean=value=>String(value||'').replace(/\\s+/g,' ').trim();
      const normalizeLabel=value=>clean(value).toLowerCase().replace(/[*:]/g,'').replace(/\\s+/g,' ').trim();
      const isVisible=element=>{const rect=element?.getBoundingClientRect();return Boolean(rect&&rect.width>0&&rect.height>0)};
      const isOmniPage=()=>true;
      const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const readOmniControlByLabel=()=>'';
      const omniHeadingDraft=()=>({orderId:'NZSO-19001',customerName:'Bryan McGruer',documentType:window.documentType||'quote'});
      let lastOmniOrderSyncDigest='existing';window.syncs=0;
      const scheduleOmniWorkflowSync=()=>{window.syncs+=1};
      ${declarations.join('\n')}
      const custom=document.getElementById('lc-omni-freight-description-select'),native=document.getElementById('native-freight');
      custom.addEventListener('input',()=>{native.value=custom.value});custom.addEventListener('change',()=>{native.value=custom.value});
      ensureOmniShowroomDelivery();
    `});
    const panel=page.locator('#lc-omni-showroom-delivery');
    assert.equal(await panel.count(),1);
    assert.equal(await panel.getByRole('radio').count(),showrooms.length);
    const panelBox=await panel.boundingBox(),addressBox=await page.locator('#Delivery-address1').boundingBox(),billingBox=await page.getByRole('heading',{name:'Billing Address'}).boundingBox();
    assert(panelBox.x>=addressBox.x+addressBox.width,'Selector begins after the Delivery Address fields');
    assert(panelBox.x+panelBox.width<=billingBox.x,'Selector ends before Billing Address');
    await panel.getByRole('radio',{name:'Hamilton'}).check();
    assert.equal(await page.locator('#Delivery-address1').inputValue(),'Hamilton Showroom');
    assert.equal(await page.locator('#lc-omni-freight-description-select').inputValue(),'Collect from Hamilton Showroom');
    assert.equal(await page.locator('#native-freight').inputValue(),'Collect from Hamilton Showroom','Visible freight helper saves through to the native Omni field');
    assert.equal(await page.locator('#Billing-address1').inputValue(),'','Billing Address is not changed');
    assert.equal(await panel.locator('label.is-selected').textContent(),'Hamilton');
    await panel.getByRole('radio',{name:'Penrose'}).check();
    assert.equal(await page.locator('#Delivery-address1').inputValue(),'Penrose Showroom');
    assert.equal(await page.locator('#lc-omni-freight-description-select').inputValue(),'Collect from Penrose Showroom');
    await panel.getByRole('button',{name:'Clear showroom'}).click();
    assert.equal(await page.locator('#Delivery-address1').inputValue(),'30A Hoskins Avenue','Clear restores the customer delivery address');
    assert.equal(await page.locator('#lc-omni-freight-description-select').inputValue(),'','Clear removes only the automatic collection description');
    assert.equal(await panel.getByRole('radio').evaluateAll(nodes=>nodes.filter(node=>node.checked).length),0);
    await page.evaluate(()=>ensureOmniShowroomDelivery());
    assert.equal(await page.locator('#lc-omni-showroom-delivery').count(),1,'Repeated Omni renders do not duplicate the selector');
    await page.evaluate(()=>{document.querySelector('.billing').style.left='790px';ensureOmniShowroomDelivery()});
    assert.equal(await panel.evaluate(node=>node.parentElement===document.body),true,'A narrow gap never reparents the selector into Omni layout');
    assert.equal(await panel.isHidden(),true,'A narrow gap hides the selector instead of changing Omni layout');
    await page.evaluate(()=>{document.querySelector('.billing').style.left='1200px';ensureOmniShowroomDelivery()});
    assert.equal(await panel.isVisible(),true,'The selector returns once the address gap is available');
    await panel.getByRole('radio',{name:'Hamilton'}).check();
    await page.locator('#lc-omni-freight-description-select').fill('');
    await page.evaluate(()=>{document.getElementById('lc-omni-showroom-delivery').remove();window.documentType='sales-order';ensureOmniShowroomDelivery()});
    assert.equal(await page.locator('#lc-omni-showroom-delivery').getByRole('radio',{name:'Hamilton'}).isChecked(),true,'Saved showroom address is recognised on a sales order render');
    assert.equal(await page.locator('#lc-omni-freight-description-select').inputValue(),'Collect from Hamilton Showroom','A missing collection description is restored after reopening');
    assert(await page.evaluate(()=>window.syncs>=3),'Showroom changes schedule Workflow syncs');
    await page.screenshot({path:'/tmp/lc-omni-showroom-delivery.png',fullPage:true});
    console.log('PASS: Showroom selector sits between Delivery and Billing, supports one choice, fills and clears delivery/freight safely, restores the original address, survives re-renders and works for quotes and sales orders. No live saves.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
