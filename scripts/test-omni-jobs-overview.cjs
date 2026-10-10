const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const start=source.indexOf('  function addJobsOverviewButton()');
const end=source.indexOf('\n  function runButtonPass()',start);
assert(start>0&&end>start);
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent('<div id="tools"></div>');
  await page.addScriptTag({content:`const OMNI_TOOLS_BAR_ID='tools';const WORKFLOW_PLANNER_URL='https://living-culture-workflow.vercel.app/';window.isOmniPage=()=>true;window.hubSpotGateOrderId=()=>window.testOrder;window.open=(...args)=>window.opened=args;${source.slice(start,end)}`});
  await page.evaluate(()=>{window.testOrder='NZSO-17002';addJobsOverviewButton();addJobsOverviewButton();});
  assert.equal(await page.getByRole('button',{name:'Jobs Overview'}).count(),1);
  await page.getByRole('button',{name:'Jobs Overview'}).click();
  assert.deepEqual(await page.evaluate(()=>window.opened),['https://living-culture-workflow.vercel.app/jobs?order=NZSO-17002','_blank','noopener,noreferrer']);
  await page.evaluate(()=>window.testOrder='');await page.getByRole('button',{name:'Jobs Overview'}).click();
  assert.equal((await page.evaluate(()=>window.opened))[0],'https://living-culture-workflow.vercel.app/jobs');
  assert(source.includes("document.getElementById('lc-omni-jobs-overview-button')"));
  console.log('PASS: Single Omni overview button, current-NZSO deep link, unfiltered fallback, new tab with opener protection and layout integration. Browser mocked.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
