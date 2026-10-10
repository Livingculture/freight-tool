const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const gate=source.slice(source.indexOf('  function hubSpotPrerequisites()'),source.indexOf('  function applyHubSpotApprovalGate('));
const submit=source.slice(source.indexOf('  async function submitHubSpotDeal('),source.indexOf('  function confirmOmniQuoteReview('));
assert(gate&&submit);
const setup=`
const HUBSPOT_BUTTON_ID='hubspot';const hubSpotPrerequisiteClicks=new Map();let hubSpotPrerequisiteHooksInstalled=false;
window.order='NZSO-17002';window.docType='quote';window.isOmni=true;window.drafts=0;window.messages=[];
window.isOmniPage=()=>isOmni;window.omniHeadingDraft=()=>({documentType:docType});window.hubSpotGateOrderId=()=>order;
window.extractOrderId=value=>String(value||'').match(/NZSO-\\d+/i)?.[0].toUpperCase()||'';
window.normalizeLabel=value=>String(value||'').trim().toLowerCase();
window.findButtonByLabel=label=>[...document.querySelectorAll('button')].find(button=>button.textContent.toLowerCase()===label.toLowerCase());
window.hubSpotMessage=async(title,lines)=>messages.push(lines);
window.hubspotDraft=()=>{drafts++;return{customerName:'Test',orderId:order};};window.chooseHubSpotLeadSource=async()=>null;
${gate}${submit}
installHubSpotPrerequisiteHooks();installHubSpotPrerequisiteHooks();applyHubSpotPrerequisiteGate();`;
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:'<button id="hubspot">HubSpot Deal</button><button id="save">Save As Draft</button><button id="lc-omni-quote-memo-button">Quote Memo Info</button><button>Save</button>'}));
  await page.goto('https://go.cin7.com/quote');await page.addScriptTag({content:setup});
  const hubspot=page.locator('#hubspot');
  assert(await hubspot.isDisabled());
  assert.match(await hubspot.getAttribute('title'),/Save as Draft and Quote Memo Info/);
  await page.evaluate(()=>submitHubSpotDeal(document.getElementById('hubspot')));
  assert.equal(await page.evaluate(()=>drafts),0,'Direct calls are guarded before lead-source/API work');
  await page.getByRole('button',{name:'Save',exact:true}).click();assert(await hubspot.isDisabled(),'Normal Save is not Save as Draft');
  await page.locator('#lc-omni-quote-memo-button').click();assert(await hubspot.isDisabled());
  assert.match(await hubspot.getAttribute('title'),/Save as Draft/);
  await page.locator('#save').click();assert(await hubspot.isEnabled());
  await page.evaluate(()=>submitHubSpotDeal(document.getElementById('hubspot')));assert.equal(await page.evaluate(()=>drafts),1);
  await page.reload();await page.addScriptTag({content:setup});assert(await hubspot.isEnabled(),'Click state survives the native save/reload');
  await page.evaluate(()=>{order='NZSO-17003';applyHubSpotPrerequisiteGate();});assert(await hubspot.isDisabled(),'Another quote cannot inherit these steps');
  await page.locator('#save').click();assert(await hubspot.isDisabled());
  await page.locator('#lc-omni-quote-memo-button').click();assert(await hubspot.isEnabled(),'Either click order works');
  await page.evaluate(()=>{document.getElementById('hubspot').disabled=true;applyHubSpotPrerequisiteGate();});assert(await hubspot.isDisabled(),'Button refresh cannot unlock an in-flight send');
  await page.evaluate(()=>{order='';applyHubSpotPrerequisiteGate();});assert(await hubspot.isDisabled(),'Unknown quote cannot inherit saved steps');
  await page.evaluate(()=>{docType='sales-order';document.getElementById('save').remove();applyHubSpotPrerequisiteGate();});assert(await hubspot.isEnabled(),'Approved sales orders without Draft remain usable');
  await page.evaluate(()=>{docType='quote';order='NZSO-17004';Object.defineProperty(window,'sessionStorage',{value:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});applyHubSpotPrerequisiteGate();});
  await page.evaluate(()=>{const b=document.createElement('button');b.textContent='Save As Draft';b.id='save';document.body.appendChild(b);});
  await page.locator('#save').click();await page.locator('#lc-omni-quote-memo-button').click();assert(await hubspot.isEnabled(),'Current-page steps work when storage is blocked');
  await page.evaluate(()=>{isOmni=false;applyHubSpotPrerequisiteGate();});assert(await hubspot.isEnabled(),'Core is unaffected');
  console.log('PASS: Both draft/memo clicks required, either order, per-quote reload persistence, no ordinary Save bypass, guarded submission, unknown/different quote isolation, in-flight protection and approved-sales/Core compatibility. No HubSpot requests sent.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
