const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const functions = ['omniWorkflowSnapshot', 'omniWorkflowStage', 'omniWorkflowFreightDescription', 'syncOmniWorkflowRecord', 'finishOmniWorkflowSync', 'installOmniWorkflowChangeHooks', 'scheduleOmniWorkflowSync'].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}).join('\n');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<style>.row{display:flex;align-items:center;gap:4px;margin:20px}input{width:230px}select{width:200px}</style><div class="row"><label for="stage">Stage:</label><select id="stage"><option value="1">New</option><option value="7">Fully Packed</option><option value="9">Dispatched</option></select></div><div class="row"><label>Freight</label><input id="freight" value="Collect from Showroom"><input value="0.00"></div>');
    await page.addScriptTag({ content: `
      const clean=value=>String(value??'').replace(/\\s+/g,' ').trim();
      const normalizeLabel=value=>clean(value).toLowerCase().replace(/:$/,'');
      const isVisible=node=>Boolean(node.getBoundingClientRect().width&&node.getBoundingClientRect().height);
      const isOmniPage=()=>true;
      const omniHeadingDraft=()=>({orderId:'NZSO-15512',documentType:'sales-order',customerName:'Customer'});
      const cin7Draft=()=>({placedBy:'AKL-Steve',product:'Pergola; Assembly Pergola'});
      const readOmniControlByLabel=()=>''; const readValueNearLabel=()=>'';
      const deriveBranchFromRep=()=> 'AKL'; const readMultilineNearLabel=()=>'';
      const omniPaymentSummary=()=>({}); const readMoneyNearLabels=()=>0; const omniFullyDispatchedState=()=>false;
      const API_KEY='';const OMNI_ORDER_SYNC_API_URL='https://workflow.test';
      let omniOrderSyncInFlight=false,omniOrderSyncQueued=false,omniOrderSyncTimer=null,lastOmniOrderSyncDigest='';
      const fillOmniShowroomDispatch=()=>{};
      window.requests=[];const GM_xmlhttpRequest=options=>window.requests.push(options);
      ${functions}
    ` });
    let snapshot = await page.evaluate(() => omniWorkflowSnapshot());
    assert.equal(snapshot.stage, 'New', 'Capture the selected label, not numeric option ID');
    assert.equal(snapshot.freightDescription, 'Collect from Showroom');
    await page.evaluate(() => {
      const label=document.querySelector('label');label.outerHTML='<strong>Stage:</strong>';
      document.querySelector('#stage option[value="7"]').textContent='Fully Packed - WMS';
      installOmniWorkflowChangeHooks();
    });
    await page.locator('#stage').selectOption('7');
    snapshot = await page.evaluate(() => omniWorkflowSnapshot());
    assert.equal(snapshot.stage, 'Fully Packed - WMS');
    assert.equal(snapshot.fullyDispatched, false, 'Packing is distinct from dispatch');
    await page.waitForFunction(() => requests.length===1);
    assert.equal(await page.evaluate(() => JSON.parse(requests[0].data).stage), 'Fully Packed - WMS', 'Native dropdown change syncs without a DOM mutation or Save click');
    await page.locator('#stage').selectOption('9');
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => requests.length),1,'No overlapping POST can overwrite the newest stage');
    await page.evaluate(() => requests[0].onload({status:200,responseText:'{}'}));
    await page.waitForFunction(() => requests.length===2);
    assert.equal(await page.evaluate(() => JSON.parse(requests[1].data).stage),'Dispatched','Queued sync reads the latest stage');
    await page.evaluate(() => requests[1].onload({status:200,responseText:'{}'}));
    assert.equal((await page.evaluate(() => omniWorkflowSnapshot())).stage, 'Dispatched');
    await page.evaluate(() => document.querySelector('#stage').removeAttribute('id'));
    assert.equal((await page.evaluate(() => omniWorkflowSnapshot())).stage, 'Dispatched', 'Unlinked inline Stage label also works');
    await page.evaluate(() => document.querySelector('select').remove());
    assert.equal((await page.evaluate(() => omniWorkflowSnapshot())).stage, null, 'Missing Stage is unknown');
    await page.locator('#freight').fill('Ship to rear entrance');
    assert.equal((await page.evaluate(() => omniWorkflowSnapshot())).freightDescription, 'Ship to rear entrance');
    await page.locator('#freight').fill('');
    assert.equal((await page.evaluate(() => omniWorkflowSnapshot())).freightDescription, '', 'Cleared description never reads the price');
    await page.evaluate(() => { const input=document.createElement('input'); input.id='lc-omni-freight-description-select'; input.value='Ship from Chch'; document.body.appendChild(input); });
    assert.equal((await page.evaluate(() => omniWorkflowSnapshot())).freightDescription, 'Ship from Chch', 'Editable freight suggestions integrate with order snapshots');
    console.log('PASS: Snapshot sends readable Stage labels and native/custom freight descriptions, preserving blank and unknown values. Browser mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
