const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-livingculture-workflow.user.js'), 'utf8');
function extract(name) {
  const match = new RegExp(`  (?:async )?function ${name}\\(`).exec(source);
  const rest = source.slice(match.index);
  const next = rest.slice(1).search(/\n  (?:async )?function /);
  return rest.slice(0, next + 1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const parent = await browser.newPage();
    await parent.route('https://go.cin7.com/**', route => route.fulfill({ contentType:'text/html', body:'<button id="pdf">Download Quote</button>' }));
    await parent.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?idCustomerAppsLink=1328007&OrderId=388');
    await parent.evaluate(() => {
      window.alerts=[];window.alert=message=>window.alerts.push(message);
      window.isQuotePdfUnlocked=()=>true;window.hubSpotGateOrderId=()=> 'NZSO-123';window.applyHubSpotApprovalGate=()=>{};
      window.omniHeadingDraft=()=>({orderId:'NZSO-123',documentType:'quote'});window.extractOrderId=()=>'';window.currentQuotePdfOrderId=()=> '388';
      window.open=(url,name,features)=>{window.openedWorker={url,name,features,closed:false,close(){this.closed=true;}};return window.openedWorker;};
    });
    await parent.addScriptTag({ content:`const QUOTE_PDF_HANDOFF_KEY='test-handoff-v2',QUOTE_PDF_TIMEOUT_MS=45000;\n${extract('currentCustomerAppsLink')}\n${extract('downloadCurrentQuotePdf')}` });
    await parent.evaluate(() => downloadCurrentQuotePdf(document.getElementById('pdf'),'quote'));
    const openedUrl=new URL(await parent.evaluate(() => window.openedWorker.url));
    assert.equal(openedUrl.pathname,'/Cloud/TransactionEntry/TransactionEntry.aspx');
    assert.equal(openedUrl.searchParams.get('idCustomerAppsLink'),'1328007');
    assert.equal(openedUrl.searchParams.get('OrderId'),'388');
    assert.equal(openedUrl.searchParams.get('lcQuotePdfWorker'),'1');
    assert.equal(await parent.locator('iframe').count(),0,'The blocked hidden-frame route is removed');
    assert.equal(await parent.locator('#pdf').innerText(),'Downloading…');
    assert.deepEqual(JSON.parse(await parent.evaluate(() => localStorage.getItem('test-handoff-v2'))),{quoteNumber:'NZSO-123',template:'quote',startedAt:await parent.evaluate(() => JSON.parse(localStorage.getItem('test-handoff-v2')).startedAt)});
    await parent.evaluate(() => window.dispatchEvent(new MessageEvent('message',{origin:location.origin,data:'lc-quote-pdf-finished'})));
    assert.equal(await parent.locator('#pdf').innerText(),'Download Quote');
    assert.equal(await parent.evaluate(() => localStorage.getItem('test-handoff-v2')),null);
    assert.deepEqual(await parent.evaluate(() => window.alerts),[]);
    await parent.close();
    console.log('PASS PDF: Native quote worker replaces the blocked hidden frame and resets the parent button');

    const editWorker = await browser.newPage();
    await editWorker.route('https://go.cin7.com/**', route => route.fulfill({ contentType:'text/html', body:'<form><button id="admin">Go to Admin</button></form>' }));
    await editWorker.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=388&lcQuotePdfWorker=1');
    await editWorker.evaluate(() => {
      localStorage.setItem('test-native-worker-v3', JSON.stringify({ quoteNumber:'NZSO-123', template:'quote', startedAt:Date.now() }));
      window.normalizeLabel=value=>String(value).trim().toLowerCase(); window.isVisible=()=>true; window.nativeClicks=0;
      document.getElementById('admin').addEventListener('click', event => { event.preventDefault(); window.nativeClicks += 1; });
    });
    await editWorker.addScriptTag({ content:`const QUOTE_PDF_HANDOFF_KEY='test-native-worker-v3',QUOTE_PDF_TIMEOUT_MS=45000;\n${extract('continueQuotePdfFromEditWorker')}` });
    assert.equal(await editWorker.evaluate(() => continueQuotePdfFromEditWorker()), true);
    await editWorker.waitForFunction(() => window.nativeClicks === 1);
    assert.equal(await editWorker.locator('#admin').getAttribute('formtarget'), '_self');
    assert.equal(await editWorker.locator('form').getAttribute('target'), '_self');
    await editWorker.close();
    console.log('PASS PDF: Worker uses Cin7 native Go to Admin conversion instead of an invalid constructed Admin URL');

    for(const template of ['quote','custom','invoice']){
      const admin=await browser.newPage();
      await admin.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:'<a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&ID=standard">Quote</a><a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&ID=custom">Custom Quote</a><a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Invoice&ID=dynamic">Dynamic Invoice</a>'}));
      await admin.goto('https://go.cin7.com/Cloud/ShoppingCartAdmin/Orders/OrderDetail.aspx?idOrder=388');
      await admin.evaluate(template=>{localStorage.setItem('test-handoff-v2',JSON.stringify({quoteNumber:'NZSO-123',template,startedAt:Date.now()}));window.saved=[];window.alert=()=>{};window.normalizeLabel=value=>String(value).trim().toLowerCase();window.isVisible=()=>true;window.saveQuotePdfBuffer=(_,name)=>window.saved.push(name);window.GM_xmlhttpRequest=options=>{const bytes=new Uint8Array(3501);bytes.set(new TextEncoder().encode('%PDF'));options.onload({status:200,response:bytes.buffer});};},template);
      await admin.addScriptTag({content:`const QUOTE_PDF_HANDOFF_KEY='test-handoff-v2',QUOTE_PDF_TIMEOUT_MS=45000;\n${extract('quotePdfTemplateLabel')}\n${extract('downloadSignedQuotePdf')}\n${extract('continueQuotePdfFromAdmin')}`});
      await admin.evaluate(() => continueQuotePdfFromAdmin());
      await admin.waitForFunction(() => window.saved.length===1);
      assert.deepEqual(await admin.evaluate(() => window.saved),['NZSO-123']);
      await admin.close();
    }
    console.log('PASS PDF: Admin worker selects Quote, Custom Quote and Dynamic Invoice with NZSO-only filenames');
    const templates = await browser.newPage();
    await templates.setContent('<button id="pdf" style="position:absolute;left:30px;top:30px">Download Quote</button>');
    await templates.evaluate(() => {
      window.normalizeLabel = value => String(value).trim().toLowerCase();
      window.requests = 0; window.requestUrls = [];
      window.GM_xmlhttpRequest = options => {
        window.requests++; window.requestUrls.push(options.url);
        options.onload({ status: 200, responseText: '<a href="/Cloud/Docs/PDF/?T=Quote&amp;ID=custom">Custom Quote</a><a href="/Cloud/Docs/PDF/?T=Quote&amp;ID=standard">Quote</a><a href="/Cloud/Docs/PDF/?T=Invoice&amp;ID=wrong">Invoice</a><a href="/Cloud/Docs/PDF/?T=Invoice&amp;ID=dynamic">Dynamic Invoice</a>' });
      };
      window.downloadCurrentQuotePdf = (_, template) => { window.downloadChoice = template; };
    });
    await templates.addScriptTag({ content: `const quotePdfLinkCache = new Map();\n${extract('currentCustomerAppsLink')}\n${extract('quotePdfTemplateLabel')}\n${extract('requestAdminQuoteHref')}\n${extract('prepareQuotePdfLink')}\n${extract('showQuotePdfTemplateMenu')}` });
    const urls = await templates.evaluate(async () => [await prepareQuotePdfLink('388'), await prepareQuotePdfLink('388', 'custom'), await prepareQuotePdfLink('388')]);
    assert(urls[0].endsWith('ID=standard'));
    assert(urls[1].endsWith('ID=custom'));
    assert.equal(await templates.evaluate(() => window.requests), 2, 'Each template has its own signed-link cache');
    assert((await templates.evaluate(() => window.requestUrls)).every(url => new URL(url).searchParams.get('idCustomerAppsLink') === '1328007'), 'Admin PDF requests use the current Cin7 customer-app link');
    assert((await templates.evaluate(() => prepareQuotePdfLink('388', 'invoice'))).endsWith('ID=dynamic'), 'Use Dynamic Invoice, not Invoice');
    await templates.evaluate(() => showQuotePdfTemplateMenu(document.getElementById('pdf')));
    assert.deepEqual(await templates.locator('[role="menuitem"]').allTextContents(), ['Quote', 'Custom Quote']);
    await templates.screenshot({ path: '/tmp/lc-quote-template-menu.png' });
    await templates.getByRole('menuitem', { name: 'Custom Quote', exact: true }).click();
    assert.equal(await templates.evaluate(() => window.downloadChoice), 'custom');
    assert.equal(await templates.locator('[role="menu"]').count(), 0);
    await templates.evaluate(() => showQuotePdfTemplateMenu(document.getElementById('pdf')));
    await templates.mouse.click(400, 300);
    assert.equal(await templates.locator('[role="menu"]').count(), 0, 'Outside click closes the menu');
    await templates.evaluate(() => showQuotePdfTemplateMenu(document.getElementById('pdf')));
    await templates.keyboard.press('Escape');
    assert.equal(await templates.locator('[role="menu"]').count(), 0);
    await templates.evaluate(() => {
      window.GM_xmlhttpRequest = options => options.onload({ status: 200, responseText: '<a href="/Cloud/Docs/PDF/?T=Quote&amp;ID=standard">Quote</a>' });
    });
    assert(await templates.evaluate(async () => {
      try { await requestAdminQuoteHref('388', 'custom'); return false; }
      catch { return true; }
    }), 'A missing custom template must not silently select Quote');
    assert(await templates.evaluate(async () => {
      try { await requestAdminQuoteHref('388', 'invoice'); return false; }
      catch { return true; }
    }), 'A missing Dynamic Invoice must not silently select Quote');
    await templates.addScriptTag({ content: extract('saveQuotePdfBuffer') });
    const namedDownload = templates.waitForEvent('download');
    await templates.evaluate(() => saveQuotePdfBuffer(new TextEncoder().encode('%PDF test').buffer, 'NZSO-17012'));
    assert.equal((await namedDownload).suggestedFilename(), 'NZSO-17012.pdf', 'The original NZSO-only filename is restored');
    await templates.close();
    console.log('PASS PDF: Exact admin templates, isolated caches, missing-template rejection, menu selection and dismissal');
    const persistence = await browser.newPage();
    await persistence.route('https://go.cin7.com/**', route => route.fulfill({ contentType:'text/html', body:'<p>Quote</p>' }));
    await persistence.goto('https://go.cin7.com/quote/NZSO-123');
    await persistence.addScriptTag({ content: `const QUOTE_PDF_UNLOCK_PREFIX='test-quote-pdf-unlocked:';
      window.complete=true;const extractOrderId=value=>String(value||'').match(/NZSO-\\d+/i)?.[0].toUpperCase()||'';
      const isHubSpotStepComplete=()=>window.complete;
      ${extract('quotePdfUnlockKey')}
      ${extract('isQuotePdfUnlocked')}` });
    assert.equal(await persistence.evaluate(() => isQuotePdfUnlocked('NZSO-123')), true);
    await persistence.evaluate(() => { window.complete=false; });
    assert.equal(await persistence.evaluate(() => isQuotePdfUnlocked('NZSO-123')), true, 'Quote download unlock survives leaving and reopening the NZSO');
    await persistence.close();
    console.log('PASS PDF: Per-NZSO quote download unlock persists after HubSpot completion');
    const page = await browser.newPage();
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType:'text/html', body:'<button id="pdf">Download Quote</button>' }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?idCustomerAppsLink=1328007&OrderId=388');
    await page.evaluate(() => {
      window.alerts = []; window.alert = message => window.alerts.push(message);
      window.docType = 'quote'; window.isQuotePdfUnlocked = () => false;
      window.hubSpotGateOrderId = () => 'NZSO-123'; window.applyHubSpotApprovalGate = () => {};
      window.omniHeadingDraft = () => ({ documentType:window.docType, orderId:'NZSO-123', customerName:'Test Customer' }); window.extractOrderId = () => '';
      window.currentQuotePdfOrderId = () => '388';
      window.open = (url, name, features) => {
        window.openedWorker = { url, name, features, closed:false, close(){ this.closed = true; } };
        return window.openedWorker;
      };
    });
    await page.addScriptTag({ content: `const QUOTE_PDF_HANDOFF_KEY='test-invoice-handoff-v2',QUOTE_PDF_TIMEOUT_MS=45000;\n${extract('currentCustomerAppsLink')}\n${extract('downloadCurrentQuotePdf')}` });
    await page.evaluate(() => downloadCurrentQuotePdf(document.getElementById('pdf')));
    assert.equal(await page.evaluate(() => window.alerts.length), 1);
    assert.equal(await page.evaluate(() => window.openedWorker || null), null, 'Locked quote still follows the HubSpot rule');
    await page.evaluate(() => { window.docType='sales-order'; window.alerts=[]; downloadCurrentQuotePdf(document.getElementById('pdf'),'invoice'); });
    await page.waitForFunction(() => Boolean(window.openedWorker));
    assert.equal(new URL(await page.evaluate(() => window.openedWorker.url)).searchParams.get('lcQuotePdfWorker'), '1');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('test-invoice-handoff-v2'))).template, 'invoice');
    assert.deepEqual(await page.evaluate(() => window.alerts), []);
    assert.equal(await page.locator('#pdf').isDisabled(), true);
    assert.equal(await page.locator('#pdf').innerText(), 'Downloading…');
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message',{ origin:location.origin, data:'lc-quote-pdf-finished' })));
    assert.equal(await page.locator('#pdf').isEnabled(), true);
    assert.equal(await page.locator('#pdf').innerText(), 'Download Invoice');
    assert.equal(await page.locator('iframe').count(), 0, 'Invoice download does not wait for HubSpot');
    await page.close();
    console.log('PASS PDF: Quote remains gated; invoice is always available');
    const ownership = await browser.newPage();
    await ownership.setContent('<button id="lc-hubspot-deal-inline-button-v1">HubSpot Deal</button><button id="lc-quote-pdf-download-button-v1">Old Download Quote</button>');
    await ownership.addScriptTag({ content: `const QUOTE_PDF_BUTTON_ID='lc-quote-pdf-download-button-v2',LEGACY_QUOTE_PDF_BUTTON_ID='lc-quote-pdf-download-button-v1',HUBSPOT_BUTTON_ID='lc-hubspot-deal-inline-button-v1',QUOTE_REVIEW_BUTTON_ID='review',BUTTON_ID='visit',HUBSPOT_GATE_CLASS='gated';const isOmniPage=()=>true;const styleInlineButton=()=>{};const wireActionButton=button=>button.dataset.currentHandler='1';const placeOmniActionButton=(button,anchor)=>anchor.after(button);const omniHeadingDraft=()=>({documentType:'quote'});\n${extract('addQuotePdfButton')}` });
    await ownership.evaluate(() => addQuotePdfButton());
    assert.equal(await ownership.locator('#lc-quote-pdf-download-button-v1').count(), 0, 'Current workflow removes the old download button and its broken handler');
    assert.equal(await ownership.locator('#lc-quote-pdf-download-button-v2').count(), 1, 'Current workflow owns a separate download button');
    assert.equal(await ownership.locator('#lc-quote-pdf-download-button-v2').getAttribute('data-current-handler'), '1');
    await ownership.close();
    console.log('PASS PDF: Current button replaces legacy standalone-script handlers');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
