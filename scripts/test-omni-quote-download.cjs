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
    for (const timings of [{ fast: 100, rendered: 100 }, { fast: 1600, rendered: 2000 }, { fast: 2500, rendered: 100 }, { fast: 100, rendered: 100, template: 'custom' }, { fast: 2500, rendered: 100, template: 'custom' }, { fast: 100, rendered: 100, template: 'invoice' }, { fast: 2500, rendered: 100, template: 'invoice' }]) {
      const page = await browser.newPage();
      await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('ShoppingCartAdmin')
        ? `<a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&amp;path=${timings.template ? 'wrong' : 'rendered'}">Quote</a><a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&amp;path=${timings.template === 'custom' ? 'rendered' : 'wrong'}">Custom Quote</a><a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Invoice&amp;path=wrong">Invoice</a><a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Invoice&amp;path=${timings.template === 'invoice' ? 'rendered' : 'wrong'}">Dynamic Invoice</a>`
        : '<button id="pdf">Download Quote</button>' }));
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=388');
      await page.evaluate(timings => {
        window.saved = 0; window.savedNames = []; window.alerts = []; window.adminRequests = 0; window.pdfUrls = [];
        window.alert = message => window.alerts.push(message);
        window.isHubSpotStepComplete = () => true;
        window.isQuotePdfUnlocked = () => true;
        window.hubSpotGateOrderId = () => 'NZSO-123';
        window.omniHeadingDraft = () => ({ orderId: 'NZSO-123', documentType:timings.template === 'invoice' ? 'sales-order' : 'quote' });
        window.currentQuotePdfOrderId = () => '388';
        window.quotePdfSidCandidates = () => timings.template ? ['123456'] : [];
        window.requestQuotePdf = () => { throw new Error('Custom templates must never request the hardcoded standard PDF'); };
        window.normalizeLabel = value => String(value).trim().toLowerCase();
        window.saveQuotePdfBuffer = (_, quoteNumber) => { window.saved++; window.savedNames.push(quoteNumber); };
        window.requestAdminQuoteHref = async (_, template) => { window.adminRequests++; window.selectedTemplate = template; return 'https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&path=fast'; };
        window.GM_xmlhttpRequest = options => { window.pdfUrls.push(options.url); return setTimeout(() => {
          const bytes = new Uint8Array(3501); bytes.set(new TextEncoder().encode('%PDF'));
          options.onload({ status: 200, response: bytes.buffer });
        }, options.url.includes('path=fast') ? timings.fast : timings.rendered); };
      }, timings);
      await page.addScriptTag({ content: `const quotePdfLinkCache = new Map(); const QUOTE_PDF_HANDOFF_KEY = 'test-handoff'; const QUOTE_PDF_TIMEOUT_MS=45000;\n${extract('currentCustomerAppsLink')}\n${extract('quotePdfTemplateLabel')}\n${extract('prepareQuotePdfLink')}\n${extract('fetchSignedQuotePdf')}\n${extract('downloadCurrentQuotePdf')}` });
      await page.evaluate(async template => { await prepareQuotePdfLink('388', template); await prepareQuotePdfLink('388', template); }, timings.template);
      assert.equal(await page.evaluate(() => window.adminRequests), 1, 'Reuse the prepared link, not a cached PDF');
      const started = Date.now();
      await page.evaluate(template => { void downloadCurrentQuotePdf(document.getElementById('pdf'), template); }, timings.template);
      await page.waitForFunction(() => window.saved === 1);
      const elapsed = Date.now() - started;
      await page.waitForTimeout(Math.max(timings.fast, timings.rendered) + 200);
      assert.equal(await page.evaluate(() => window.saved), 1, 'Fast and rendered routes must never save twice');
      assert.equal(await page.evaluate(() => window.savedNames[0]), 'NZSO-123', 'Every route restores the original NZSO-only filename');
      assert.deepEqual(await page.evaluate(() => window.alerts), []);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.locator('#pdf').isEnabled(), true);
      assert.equal(await page.locator('#pdf').innerText(), timings.template === 'invoice' ? 'Download Invoice' : 'Download Quote');
      assert.equal(await page.evaluate(() => window.selectedTemplate), timings.template || 'quote');
      assert(!(await page.evaluate(() => window.pdfUrls)).some(url => url.includes('wrong')), 'Fallback must use the selected template');
      if (timings.fast > 1000) assert(elapsed < 2400, `Fallback should not wait five seconds (${elapsed}ms)`);
      console.log(`PASS PDF: fast=${timings.fast}ms, rendered=${timings.rendered}ms, downloaded in ${elapsed}ms, once only`);
      await page.close();
    }
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
    await page.setContent('<button id="pdf">Download Quote</button>');
    await page.evaluate(() => {
      window.alerts = []; window.saved = 0; window.alert = message => window.alerts.push(message);
      window.docType = 'quote'; window.isQuotePdfUnlocked = () => false;
      window.hubSpotGateOrderId = () => 'NZSO-123'; window.applyHubSpotApprovalGate = () => {};
      window.omniHeadingDraft = () => ({ documentType:window.docType, orderId:'NZSO-123', customerName:'Test Customer' }); window.extractOrderId = () => '';
      window.currentQuotePdfOrderId = () => '388'; window.quotePdfSidCandidates = () => [];
      window.prepareQuotePdfLink = async () => 'https://go.cin7.com/pdf';
      window.fetchSignedQuotePdf = async () => new ArrayBuffer(4000);
      window.saveQuotePdfBuffer = () => { window.saved++; };
    });
    await page.addScriptTag({ content: extract('downloadCurrentQuotePdf') });
    await page.evaluate(() => downloadCurrentQuotePdf(document.getElementById('pdf')));
    assert.equal(await page.evaluate(() => window.alerts.length), 1);
    assert.equal(await page.evaluate(() => window.saved), 0, 'Locked quote still follows the HubSpot rule');
    await page.evaluate(() => { window.docType='sales-order'; window.alerts=[]; downloadCurrentQuotePdf(document.getElementById('pdf'),'invoice'); });
    await page.waitForFunction(() => window.saved === 1);
    assert.deepEqual(await page.evaluate(() => window.alerts), []);
    assert.equal(await page.locator('#pdf').isEnabled(), true);
    assert.equal(await page.locator('iframe').count(), 0, 'Invoice download does not wait for HubSpot');
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
