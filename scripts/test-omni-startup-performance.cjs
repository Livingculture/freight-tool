const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {chromium} = require('playwright');
const ts = require(process.env.TYPESCRIPT_MODULE || path.resolve(__dirname,'../../workflow-speed-fix/node_modules/typescript'));
const file = 'userscripts/omni-livingculture-workflow.user.js';
const source = process.env.OMNI_SOURCE_REV ? execFileSync('git',['show',`${process.env.OMNI_SOURCE_REV}:${file}`],{encoding:'utf8'}) : fs.readFileSync(file,'utf8');
const parsed = ts.createSourceFile('workflow.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names = new Set(['omniHeadingDraft','runButtonPass','scheduleButtonPass']);
const functions=[];
function visit(node){if(ts.isFunctionDeclaration(node)&&names.has(node.name?.text)) functions.push(node.getText(parsed));ts.forEachChild(node,visit);}
visit(parsed);
const observerStart=source.indexOf('  omniDomObserver = new MutationObserver');
const oldObserverStart=source.indexOf('  const observer = new MutationObserver');
const observer=source.slice(observerStart<0?oldObserverStart:observerStart,source.indexOf("  if (isOmniPage() && document.body) scheduleButtonPass();",observerStart<0?oldObserverStart:observerStart));
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://go.cin7.com/**',route=>route.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
  await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=406');
  await page.setContent('<h4>Edit Sales Order - Customer - NZSO-17001</h4><button id="native-save">Save</button><div id="native-lines"></div>');
  await page.evaluate(()=>{
    document.getElementById('native-lines').innerHTML=Array.from({length:1000},(_,i)=>`<div><span>Product ${i}</span><input value="1"></div>`).join('');
    window.bodyReads=0;
    const getter=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'innerText').get;
    Object.defineProperty(document.body,'innerText',{get(){bodyReads++;return getter.call(this);}});
  });
  await page.addScriptTag({content:`
    const isOmniPage=()=>true;
    const isVisible=node=>node.getBoundingClientRect().width>0;
    const clean=value=>String(value||'').replace(/\\s+/g,' ').trim();
    const extractOrderId=value=>String(value).match(/NZSO-\\d+/)?.[0]||'';
    const CUSTOMER_PHOTOS_ACTIONS_ID='lc-photos',OMNI_TOOLS_BAR_ID='lc-tools',STAFF_HELP_BAR_ID='lc-help',STAFF_HELP_DIALOG_ID='lc-dialog',OVERLAY_ID='lc-overlay';
    let buttonPassScheduled=false,omniDomObserver=null,lastButtonPassAt=0;
    window.passes=0;window.failPass=false;
    const ensureOmniJobProgress=()=>{passes++;if(failPass)throw Error('Fixture failure');};
    const addButton=()=>{document.getElementById('native-save').textContent='Save';};
    const finishOmniConversionNavigation=()=>{},observeOmniLayout=()=>{},addCustomerPhotosButton=()=>{},addHubSpotButton=()=>{},applyHubSpotPrerequisiteGate=()=>{},addQuoteReviewButton=()=>{},addQuotePdfButton=()=>{},addCloneQuoteButton=()=>{},applyHubSpotApprovalGate=()=>{},addJobsOverviewButton=()=>{},addStaffHelpButton=()=>{},addIssueReportButton=()=>{},layoutOmniWorkflowButtons=()=>{},linkExistingCustomerAlbumToQuote=()=>{},scheduleOmniWorkflowSync=()=>{};
    ${functions.join('\n')}
    ${observer}
  `});
  const readings=await page.evaluate(()=>{
    const start=performance.now();
    for(let i=0;i<100;i++)omniHeadingDraft();
    return {bodyReads,duration:performance.now()-start};
  });
  await page.evaluate(()=>scheduleButtonPass());
  await page.waitForTimeout(600);
  const passes=await page.evaluate(()=>window.passes);
  console.log(JSON.stringify({source:process.env.OMNI_SOURCE_REV||'working tree',headingReads:100,...readings,toolbarPasses:passes}));
  if(process.env.OMNI_SOURCE_REV)return;
  assert.equal(readings.bodyReads,0,'Normal heading reads do not force full-page innerText/layout reads');
  assert.equal(passes,1,'Our native-button changes do not create a self-triggered observer loop');
  await page.evaluate(()=>{
    const button=document.createElement('button');button.id='lc-omni-report-issue';button.textContent='Report Issue';document.querySelector('h4').append(button);
    window.observedHeading=omniHeadingDraft();
  });
  assert.equal(await page.evaluate(()=>observedHeading.orderId),'NZSO-17001','Injected buttons do not corrupt heading parsing');
  await page.waitForTimeout(300);
  const before=await page.evaluate(()=>passes);
  await page.evaluate(()=>{for(let i=0;i<100;i++)document.getElementById('native-lines').append(document.createElement('span'));});
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>passes),before+1,'Native loading bursts are coalesced into one pass');
  await page.evaluate(()=>document.querySelector('h4').firstChild.textContent='Edit Quote - Different customer - NZSO-17002');
  assert.deepEqual(await page.evaluate(()=>omniHeadingDraft()),{customerName:'Different customer',orderId:'NZSO-17002',documentType:'quote'},'Cache invalidates when saved heading changes');
  await page.evaluate(()=>{
    failPass=true;try{runButtonPass();}catch{}
    failPass=false;
  });
  const afterFailure=await page.evaluate(()=>passes);
  await page.evaluate(()=>document.getElementById('native-lines').append(document.createElement('div')));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>passes),afterFailure+1,'Observer is restored even after a failed pass');
  assert(!source.slice(source.indexOf('  function boot()')).includes('void fetchHubSpotLeadSourceOptions()'),'Lead sources load only when needed');
  console.log('PASS: Heading caching, saved-type changes, no self-triggered loop, native mutation batching and error recovery. Browser fixture only.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
