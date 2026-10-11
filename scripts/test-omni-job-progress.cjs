const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const path = require('node:path');
const ts = require(process.env.TYPESCRIPT_MODULE || path.resolve(__dirname, '../../workflow-speed-fix/node_modules/typescript'));
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const parsed = ts.createSourceFile('workflow.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = new Set(['omniJobProgressPlacement', 'alignOmniJobProgress', 'ensureOmniJobProgress', 'omniJobProgressStatus', 'renderOmniJobProgress', 'escapeHtml', 'checkOmniShowroomCollection']);
const functions = [];
function visit(node) { if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(parsed)); ts.forEachChild(node, visit); }
visit(parsed);
assert.equal(functions.length, names.size);
const labels = ['Started', 'Site Visit', 'Quote Review', 'Payment', 'Stock', 'Packed', 'Delivery', 'Rep', 'Install team', 'Install', 'Complete'];
const progress = { orderNumber: 'NZSO-17003', nextAction: 'Arrange installation', steps: labels.map((label, index) => ({ label, status: index < 7 ? 'Complete' : 'Pending', state: index < 7 ? 'done' : 'pending' })) };
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));
    await page.goto('https://go.cin7.com/test');
    await page.setContent('<style>body{margin:20px;background:#eee;font:14px Arial}li{font-size:50px;color:red}button{background:red}main{max-width:1300px;margin:auto}h1{font-size:22px}</style><main><h1>Edit Sales Order - Customer - NZSO-17003</h1><form><h2>Delivery address</h2><input value="Unsaved edit"><button id="save" type="button">Save As Draft</button></form></main>');
    await page.addScriptTag({ content: `let omniJobProgressCache=null;let heading={orderId:'NZSO-17003',documentType:'sales-order'};const omniHeadingDraft=()=>heading;const extractOrderId=text=>text.match(/NZSO-\\d+/)?.[0]||'';const clean=value=>String(value||'').trim();const normalizeLabel=value=>clean(value).toLowerCase();const OMNI_TOOLS_BAR_ID='lc-omni-tools';const isVisible=node=>node.getBoundingClientRect().width>0;const isOmniPage=()=>true;let opened=0,saved=0,requests=[];const openJobsOverviewPopup=()=>opened++;document.getElementById('save').onclick=()=>saved++;let collectionDispatchInFlight=false,omniQuoteConversionLoaded=false;const omniFullyDispatchedInputs=()=>[];const API_KEY='';const OMNI_ORDER_SYNC_API_URL='https://workflow.test/api/omni/orders';const GM_xmlhttpRequest=options=>requests.push(options);const applyOmniWorkflowResponse=payload=>renderOmniJobProgress(payload.jobProgress);${functions.join('\n')}` });
    await page.evaluate(value => renderOmniJobProgress(value), progress);
    assert.equal(await page.locator('#lc-omni-job-progress .step').count(), 11);
    assert.equal(await page.evaluate(() => document.querySelector('h1').nextElementSibling.id), 'lc-omni-job-progress');
    assert.equal(await page.evaluate(() => opened), 0, 'No popup on loading');
    await page.locator('#lc-omni-job-progress button').click();
    assert.equal(await page.evaluate(() => opened), 1);
    await page.evaluate(() => { ensureOmniJobProgress(); ensureOmniJobProgress(); checkOmniShowroomCollection(); checkOmniShowroomCollection(); });
    assert.equal(await page.locator('#lc-omni-job-progress').count(), 1);
    assert.equal(await page.evaluate(() => requests.length), 1, 'Uses one existing sync lookup with an in-flight guard');
    assert.equal(await page.evaluate(() => JSON.parse(requests[0].data).includeProgress), true);
    await page.evaluate(() => requests[0].ontimeout());
    assert.equal(await page.locator('#lc-omni-job-progress .updated').textContent(), 'Progress refresh timed out');
    assert.equal(await page.locator('#lc-omni-job-progress .step').count(), 11, 'Failure preserves the previous strip with a stale warning');
    await page.evaluate(value => renderOmniJobProgress(value), { ...progress, steps: [{ label: '<img src=x onerror=alert(1)>', status: '<script>bad</script>', state: 'done evil' }] });
    assert.equal(await page.locator('#lc-omni-job-progress img').count(), 0, 'Display values are escaped');
    await page.evaluate(value => renderOmniJobProgress(value), progress);
    for (const width of [1440, 1180, 700, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}`);
      assert(await page.locator('#lc-omni-job-progress .step').evaluateAll(nodes => nodes.every(node => { const text = node.querySelector('.state').getBoundingClientRect(); const parent = node.getBoundingClientRect(); return text.right <= parent.right + 1; })), `Text stays within steps at ${width}`);
      await page.screenshot({ path: `/tmp/omni-job-progress-${width}.png` });
    }
    await page.evaluate(() => { document.querySelector('h1').textContent='Edit Sales Order - Another - NZSO-17004';heading.orderId='NZSO-17004';ensureOmniJobProgress(); });
    assert.equal(await page.locator('#lc-omni-job-progress .step').count(), 0, 'Switching orders clears previous progress');
    await page.evaluate(value => renderOmniJobProgress(value), progress);
    assert.equal(await page.locator('#lc-omni-job-progress .step').count(), 0, 'Old-order responses cannot overwrite the new order');
    await page.evaluate(value => renderOmniJobProgress(value), { ...progress, orderNumber: 'NZSO-17004' });
    await page.evaluate(() => renderOmniJobProgress(null));
    assert.equal(await page.locator('#lc-omni-job-progress .step').count(), 0, 'Missing job clears stale values');
    await page.evaluate(() => { heading.documentType='quote';ensureOmniJobProgress(); });
    assert.equal(await page.locator('#lc-omni-job-progress').count(), 0, 'Only sales orders show the strip');
    assert.equal(await page.evaluate(() => saved), 0, 'No automatic saves or approval');
    await page.evaluate(() => { heading.documentType='sales-order';heading.orderId='NZSO-17003'; });
    for (const tag of ['h4', 'h5', 'div', 'span']) {
      await page.evaluate(tag => { document.querySelector('main').innerHTML=`<div><${tag}>Edit Sales Order - Customer - NZSO-17003</${tag}></div><form>Native order controls</form>`;ensureOmniJobProgress(); }, tag);
      assert.equal(await page.locator('#lc-omni-job-progress').count(), 1, `Works with ${tag} headings`);
      assert(await page.locator('#lc-omni-job-progress').isVisible());
    }
    await page.evaluate(() => { document.querySelector('main').innerHTML='<section id="creator" style="min-height:60px"><div><label>Created By:</label><select><option>Steve</option></select></div><div>Processed By: Steve</div></section><form>Native controls</form>';ensureOmniJobProgress(); });
    assert.equal(await page.evaluate(() => document.querySelector('#creator').previousElementSibling.id), 'lc-omni-job-progress', 'No heading: fallback above existing creator controls');
    await page.evaluate(() => { document.querySelector('main').innerHTML='<form><div id="lc-omni-tools">Jobs Overview</div></form>';ensureOmniJobProgress(); });
    assert.equal(await page.evaluate(() => document.querySelector('#lc-omni-tools').previousElementSibling.id), 'lc-omni-job-progress', 'Toolbar fallback works without heading or creator controls');
    await page.evaluate(() => { document.querySelector('main').innerHTML='<div><table><tbody><tr><td>Edit Sales Order - Customer - NZSO-17003</td></tr></tbody></table></div><form>Native controls</form>';ensureOmniJobProgress(); });
    assert.equal(await page.locator('table #lc-omni-job-progress').count(), 0, 'Table headings never insert a section inside table structure');
    assert(await page.locator('#lc-omni-job-progress').isVisible());
    await page.evaluate(() => {
      document.querySelector('main').innerHTML='<div class="wide-title">Edit Sales Order - Customer - NZSO-17003</div><div style="width:100%;padding-top:100px"><div id="native-order" style="width:min(1120px,calc(100% - 24px));margin:auto"><h4>Edit Sales Order - Customer - NZSO-17003</h4><div id="creator" style="background:white;height:70px"><label>Created By:</label> Steve <span>Processed By: Steve</span></div><div style="height:120px;background:white;margin-top:20px">Contact and delivery address</div></div></div>';
    });
    for (const width of [2048, 1440, 1000, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => { ensureOmniJobProgress();renderOmniJobProgress(value); }, progress);
      const panelBounds = await page.locator('#lc-omni-job-progress').boundingBox();
      const nativeBounds = await page.locator('#creator').boundingBox();
      assert(Math.abs(panelBounds.x-nativeBounds.x)<1 && Math.abs(panelBounds.width-nativeBounds.width)<1, `Matches native boxes at ${width}`);
      assert(panelBounds.y > 100 && panelBounds.y+panelBounds.height <= nativeBounds.y, 'Placed inside order content, not beneath fixed navigation');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.locator('#lc-omni-job-progress .step').count(), 11);
      await page.screenshot({ path: `/tmp/omni-job-progress-aligned-${width}.png` });
    }
    console.log('PASS: Omni inline progress, Details, order switching, escaped values, failures, single read-only request, desktop/mobile layouts. Browser fixture, no live customer writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
