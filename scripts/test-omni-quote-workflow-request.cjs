const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require(process.env.TYPESCRIPT_MODULE||path.resolve(__dirname,'../../workflow-speed-fix/node_modules/typescript'));
const {chromium}=require('playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const parsed=ts.createSourceFile('workflow.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['quoteWorkflowRequestAction','requestQuoteWorkflowTracking','handleActionButtonClick']);
const functions=[];
function visit(node){if(ts.isFunctionDeclaration(node)&&names.has(node.name?.text))functions.push(node.getText(parsed));ts.forEachChild(node,visit);}
visit(parsed);
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://go.cin7.com/**',route=>route.fulfill({body:'<html><body></body></html>'}));
  await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=405');
  const setup=`const CUSTOMER_PHOTOS_BUTTON_ID='photos',VIEW_CUSTOMER_ALBUM_BUTTON_ID='album',VIEW_CUSTOMER_ALBUMS_BUTTON_ID='albums',BUTTON_ID='visit',HUBSPOT_BUTTON_ID='hubspot',QUOTE_REVIEW_BUTTON_ID='review',QUOTE_PDF_BUTTON_ID='pdf',CONVERT_ORDER_BUTTON_ID='convert',CLONE_QUOTE_BUTTON_ID='clone';let heading={documentType:'quote',orderId:'NZSO-17001'};const omniHeadingDraft=()=>heading;const shouldHandleAction=()=>true;window.syncs=[];window.actions=[];const scheduleOmniWorkflowSync=(delay,force)=>syncs.push({delay,force,action:quoteWorkflowRequestAction(heading.orderId)});const openPanel=()=>actions.push('visit');const submitQuoteReview=()=>actions.push('review');const submitHubSpotDeal=()=>actions.push('hubspot');${functions.join('\n')}`;
  await page.addScriptTag({content:setup});
  assert.equal(await page.evaluate(()=>quoteWorkflowRequestAction('NZSO-17001')),'','Page load does not request tracking');
  await page.evaluate(()=>handleActionButtonClick({id:'hubspot'},{}));
  assert.equal(await page.evaluate(()=>syncs.length),0,'HubSpot alone does not qualify a quote');
  await page.evaluate(()=>handleActionButtonClick({id:'visit'},{}));
  assert.equal(await page.evaluate(()=>syncs[0].action),'site-visit');
  assert.equal(await page.evaluate(()=>actions.at(-1)),'visit','The site visit popup still opens');
  assert.equal(await page.evaluate(()=>quoteWorkflowRequestAction('NZSO-170010')),'','Order numbers are isolated');
  await page.evaluate(()=>{heading.orderId='NZSO-17002';handleActionButtonClick({id:'review'},{});});
  assert.equal(await page.evaluate(()=>syncs.at(-1).action),'quote-review');
  await page.reload();await page.addScriptTag({content:setup});
  assert.equal(await page.evaluate(()=>quoteWorkflowRequestAction('NZSO-17001')),'site-visit','Click survives reload');
  assert.equal(await page.evaluate(()=>quoteWorkflowRequestAction('NZSO-17002')),'quote-review');
  await page.evaluate(()=>{heading={documentType:'sales-order',orderId:'NZSO-17003'};handleActionButtonClick({id:'visit'},{});});
  assert.equal(await page.evaluate(()=>syncs.length),0,'Sales orders do not need opt-in');
  await page.evaluate(()=>{heading={documentType:'quote',orderId:'NZSO-17004'};handleActionButtonClick({id:'visit',disabled:true},{});});
  assert.equal(await page.evaluate(()=>quoteWorkflowRequestAction('NZSO-17004')),'','Disabled actions do not qualify');
  console.log('PASS: Only Site Visit/Quote Review clicks request quote tracking; persists across reload, exact NZSO isolation and normal actions preserved. Browser fixture.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
