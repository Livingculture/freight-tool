const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const sourceText=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const start=sourceText.indexOf('  function findOmniSectionHeading(');
const end=sourceText.indexOf('  function omniSalesRep()',start);
assert(start>0&&end>start,'Address-copy functions are present');
const functions=sourceText.slice(start,end);
const fields=[
  ['First Name','first','nobody'],['Last Name','last','important'],['Company','company','Living Culture'],
  ['Address 1','address1','29 Customs Street West'],['Address 2','address2','Princes Wharf'],['City','city','City Centre'],
  ['State/Region','region','Auckland'],['Postal Code','postcode','1010'],['Country','country','New Zealand']
];
const section=(type,values,standardLabels=true)=>`<section class="column"><div class="section-title">${type} Address</div>${fields.map(([label,key,value],index)=>`<div class="row"><label for="${type}-${key}">${standardLabels?(['First Name','Last Name','Company'].includes(label)?label:`${type} ${label}`):`Field ${index+1}`}</label><input id="${type}-${key}" value="${values?value:''}"></div>`).join('')}</section>`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}});
    await page.setContent(`<style>.columns{display:grid;grid-template-columns:1fr 1fr;gap:120px}.row{display:grid;grid-template-columns:210px 310px;align-items:center;margin:8px}.section-title{height:34px;font-size:24px;font-weight:700}</style><div class="columns">${section('Delivery',true)}${section('Billing',false)}</div>`);
    await page.addScriptTag({content:`const COPY_DELIVERY_BILLING_ID='lc-omni-copy-delivery-to-billing';const clean=value=>String(value||'').replace(/\\s+/g,' ').trim();const normalizeLabel=value=>clean(value).toLowerCase().replace(/[*:]/g,'').replace(/\\s+/g,' ').trim();const isVisible=element=>{const rect=element?.getBoundingClientRect();return Boolean(rect&&rect.width>0&&rect.height>0)};const isOmniPage=()=>true;${functions}window.changes=[];document.querySelectorAll('[id^="Billing-"]').forEach(input=>input.addEventListener('change',()=>changes.push(input.id)));ensureDeliveryBillingCopy();`});
    assert.equal(await page.locator('#lc-omni-copy-delivery-to-billing').count(),1);
    assert.equal(await page.locator('#lc-omni-copy-delivery-to-billing').evaluate(node=>node.parentElement.textContent.includes('Billing Address')),true,'Checkbox is beside Billing Address');
    assert.equal(await page.locator('#Billing-address1').inputValue(),'','It never overwrites billing before being ticked');
    await page.locator('#lc-omni-copy-delivery-to-billing input').check();
    for(const [,key,value] of fields)assert.equal(await page.locator(`#Billing-${key}`).inputValue(),value,`${key} copied`);
    assert.equal(await page.evaluate(()=>changes.length),fields.length,'Every copied field emits Omni change events');
    await page.locator('#Delivery-city').fill('Auckland CBD');
    assert.equal(await page.locator('#Billing-city').inputValue(),'Auckland CBD','Changes stay matched while ticked');
    await page.locator('#lc-omni-copy-delivery-to-billing input').uncheck();
    await page.locator('#Delivery-city').fill('Takapuna');
    assert.equal(await page.locator('#Billing-city').inputValue(),'Auckland CBD','Unticking stops automatic copying without clearing billing');
    await page.evaluate(()=>ensureDeliveryBillingCopy());
    assert.equal(await page.locator('#lc-omni-copy-delivery-to-billing').count(),1,'Repeated Omni renders do not duplicate the checkbox');
    await page.setContent(`<style>.columns{display:grid;grid-template-columns:1fr 1fr;gap:120px}.row{display:grid;grid-template-columns:210px 310px;align-items:center;margin:8px}.section-title{height:34px;font-size:24px;font-weight:700}</style><div class="columns">${section('Delivery',true,false)}${section('Billing',false,false)}</div>`);
    await page.evaluate(()=>{window.changes=[];document.querySelectorAll('[id^="Billing-"]').forEach(input=>input.addEventListener('change',()=>changes.push(input.id)));ensureDeliveryBillingCopy();});
    assert.equal(await page.locator('#lc-omni-copy-delivery-to-billing').count(),1,'Checkbox remains visible before Omni fields can be identified by their labels');
    await page.locator('#lc-omni-copy-delivery-to-billing input').check();
    for(const [,key,value] of fields)assert.equal(await page.locator(`#Billing-${key}`).inputValue(),value,`${key} copied using current Omni column positions`);
    assert.equal(await page.evaluate(()=>changes.length),fields.length,'Positional fallback also emits Omni change events');
    for(const width of [1400,820,390]){
      await page.setViewportSize({width,height:1000});
      await page.setContent(`<style>*{box-sizing:border-box}body{font:14px Arial;margin:12px}.columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.column{min-width:0}.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:6px;align-items:center;margin-top:8px}.row input,.row select{width:100%;min-width:0;height:30px}.section-title{display:block;font-size:20px;font-weight:700;line-height:1.4}@media(max-width:900px){.columns{grid-template-columns:1fr}.column{padding-bottom:16px}}</style><div class="columns"><section class="column"><strong class="section-title">Contact</strong><label for="contact-first">First Name</label><input id="contact-first" value="Unchanged contact"></section>${section('Delivery',true).replace('<div class="section-title">Delivery Address</div>','<strong class="section-title">Delivery Address</strong>')}${section('Billing',false).replace('<div class="section-title">Billing Address</div>','<b class="section-title">Billing Address</b>').replace('<input id="Billing-country" value="">','<select id="Billing-country"><option value="">Choose country</option><option>New Zealand</option><option>Australia</option></select>')}</div>`);
      await page.evaluate(()=>ensureDeliveryBillingCopy());
      const check=page.getByRole('checkbox',{name:'Same as delivery address'});
      assert.equal(await check.isChecked(),false,'No copying until staff opt in');
      await check.check();
      for(const [,key,value] of fields)assert.equal(await page.locator(`#Billing-${key}`).inputValue(),value,`${key} copied with bold headings at ${width}px`);
      assert.equal(await page.locator('#contact-first').inputValue(),'Unchanged contact');
      await page.evaluate(()=>{const input=document.getElementById('Delivery-country');input.value='Australia';input.dispatchEvent(new Event('change',{bubbles:true}));});
      assert.equal(await page.locator('#Billing-country').inputValue(),'Australia','Change events keep country selects matched');
      await check.uncheck();await page.locator('#Delivery-city').fill('Do not copy');
      assert.equal(await page.locator('#Billing-city').inputValue(),'City Centre');
      await page.screenshot({path:`/tmp/lc-copy-billing-${width}.png`,fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Address layout does not overflow');
    }
    console.log('PASS: Delivery-to-billing checkbox copies every field, emits save events, stays synced only while ticked and never duplicates.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
