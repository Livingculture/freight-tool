const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const start=source.indexOf('  function openJobsOverviewPopup()');
const end=source.indexOf('\n  function runButtonPass()',start);
assert(start>0&&end>start);
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.context().route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:'<div id="tools"></div>'}));
  await page.context().route('https://living-culture-workflow.vercel.app/**',route=>route.fulfill({contentType:'text/html',body:'<main>Job overview</main>'}));
  await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx');
  await page.addScriptTag({content:`const OMNI_TOOLS_BAR_ID='tools';const WORKFLOW_PLANNER_URL='https://living-culture-workflow.vercel.app/';window.isOmniPage=()=>true;window.hubSpotGateOrderId=()=>window.testOrder;${source.slice(start,end)}`});
  await page.evaluate(()=>{window.testOrder='NZSO-17002';addJobsOverviewButton();addJobsOverviewButton();});
  assert.equal(await page.getByRole('button',{name:'Jobs Overview'}).count(),1);
  const opened=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Jobs Overview'}).click();
  const popup=await opened;await popup.waitForLoadState();
  assert.equal(popup.url(),'https://living-culture-workflow.vercel.app/jobs?order=NZSO-17002');
  assert.equal(await popup.evaluate(()=>window.opener),null,'Popup cannot control Omni');
  assert.equal(await page.evaluate(()=>location.hostname),'go.cin7.com','Omni remains on the original order');
  await popup.close();
  await page.evaluate(()=>{
    window.testOrder='';
    window.open=(...args)=>{window.opened=args;return{opener:null,focus(){window.focused=true;}};};
  });
  await page.getByRole('button',{name:'Jobs Overview'}).click();
  const args=await page.evaluate(()=>window.opened);
  assert.equal(args[0],'https://living-culture-workflow.vercel.app/jobs');
  assert(args[2].includes('popup=yes'),'Requests a popup window instead of a normal tab');
  const options=Object.fromEntries(args[2].split(',').map(option=>option.split('=')));
  const screenSize=await page.evaluate(()=>({width:screen.availWidth,height:screen.availHeight}));
  assert(Number(options.width)<=screenSize.width&&Number(options.height)<=screenSize.height);
  assert.equal(await page.evaluate(()=>window.focused),true);
  await page.evaluate(()=>{window.open=()=>null;window.alert=text=>window.warning=text;});
  await page.getByRole('button',{name:'Jobs Overview'}).click();
  assert.match(await page.evaluate(()=>window.warning),/allow popups for go\.cin7\.com/);
  console.log('PASS: Single Omni button, current-NZSO popup, no opener, original order retained, unfiltered fallback, popup sizing/focus and blocked-popup recovery. Overview server mocked.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
