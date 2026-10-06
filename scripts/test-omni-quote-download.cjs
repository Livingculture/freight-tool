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
    for (const timings of [{ fast: 100, rendered: 100 }, { fast: 1600, rendered: 2000 }, { fast: 2500, rendered: 100 }]) {
      const page = await browser.newPage();
      await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('ShoppingCartAdmin')
        ? '<a href="https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&amp;path=rendered">Quote</a>'
        : '<button id="pdf">Download Quote</button>' }));
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=388');
      await page.evaluate(timings => {
        window.saved = 0; window.alerts = []; window.adminRequests = 0;
        window.alert = message => window.alerts.push(message);
        window.isHubSpotStepComplete = () => true;
        window.hubSpotGateOrderId = () => 'NZSO-123';
        window.omniHeadingDraft = () => ({ orderId: 'NZSO-123' });
        window.currentQuotePdfOrderId = () => '388';
        window.quotePdfSidCandidates = () => [];
        window.normalizeLabel = value => String(value).trim().toLowerCase();
        window.saveQuotePdfBuffer = () => { window.saved++; };
        window.requestAdminQuoteHref = async () => { window.adminRequests++; return 'https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&path=fast'; };
        window.GM_xmlhttpRequest = options => setTimeout(() => {
          const bytes = new Uint8Array(3501); bytes.set(new TextEncoder().encode('%PDF'));
          options.onload({ status: 200, response: bytes.buffer });
        }, options.url.includes('path=fast') ? timings.fast : timings.rendered);
      }, timings);
      await page.addScriptTag({ content: `const quotePdfLinkCache = new Map(); const QUOTE_PDF_HANDOFF_KEY = 'test-handoff';\n${extract('prepareQuotePdfLink')}\n${extract('fetchSignedQuotePdf')}\n${extract('downloadCurrentQuotePdf')}` });
      await page.evaluate(async () => { await prepareQuotePdfLink('388'); await prepareQuotePdfLink('388'); });
      assert.equal(await page.evaluate(() => window.adminRequests), 1, 'Reuse the prepared link, not a cached PDF');
      const started = Date.now();
      await page.evaluate(() => { void downloadCurrentQuotePdf(document.getElementById('pdf')); });
      await page.waitForFunction(() => window.saved === 1);
      const elapsed = Date.now() - started;
      await page.waitForTimeout(Math.max(timings.fast, timings.rendered) + 200);
      assert.equal(await page.evaluate(() => window.saved), 1, 'Fast and rendered routes must never save twice');
      assert.deepEqual(await page.evaluate(() => window.alerts), []);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.locator('#pdf').isEnabled(), true);
      if (timings.fast > 1000) assert(elapsed < 2400, `Fallback should not wait five seconds (${elapsed}ms)`);
      console.log(`PASS PDF: fast=${timings.fast}ms, rendered=${timings.rendered}ms, downloaded in ${elapsed}ms, once only`);
      await page.close();
    }
    const page = await browser.newPage();
    await page.setContent('<button id="pdf">Download Quote</button>');
    await page.evaluate(() => {
      window.alerts = []; window.alert = message => window.alerts.push(message);
      window.hubSpotGateOrderId = () => 'NZSO-123'; window.isHubSpotStepComplete = () => false;
      window.applyHubSpotApprovalGate = () => {};
    });
    await page.addScriptTag({ content: extract('downloadCurrentQuotePdf') });
    await page.evaluate(() => downloadCurrentQuotePdf(document.getElementById('pdf')));
    assert.equal(await page.evaluate(() => window.alerts.length), 1);
    assert.equal(await page.locator('iframe').count(), 0, 'HubSpot gate remains enforced');
    console.log('PASS PDF: HubSpot gate remains enforced');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
