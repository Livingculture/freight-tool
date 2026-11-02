const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-email-helper-compose.user.js', 'utf8');
const key = 'lcOmniEmailHelperQuoteContext';
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert(start >= 0, name);
  const next = source.slice(start + 1).search(/\n  function /);
  return source.slice(start, start + next + 1);
}
const quote = `<h1>Edit Quote - Nibun - NZSO-18151</h1>
  <label for="first">First Name</label><input id="first" value="Nibun">
  <style>td,th{padding:8px}table{border-collapse:collapse}</style>
  <table><tr><th colspan="3">Order lines</th></tr><tr><th>BOM<br>Load</th><th><span>1</span>Code</th><th><span>1</span>Product</th></tr>
  <tr><td>Make</td><td>PERGOLA</td><td>Tasman Motorised Freestanding Louvre Roof Aluminium Pergola</td></tr>
  <tr><td>Use</td><td>MOD1</td><td>Tasman Freestanding Pergola Module NO. 001# White</td></tr>
  <tr><td><input value="Use"></td><td>MOD2</td><td>Tasman Freestanding Pergola Module NO. 002# White</td></tr>
  <tr><td>Make</td><td>UMBRELLA</td><td>Alabaster Umbrella</td></tr>
  <tr><td> use </td><td>FRAME</td><td>Umbrella Frame</td></tr>
  <tr><td></td><td>BASE</td><td><input type="hidden" value="Wrong hidden description"><input value="">Granite Umbrella Base</td></tr>
  <tr><td></td><td>BASE</td><td>Granite Umbrella Base</td></tr>
  <tr style="display:none"><td></td><td>HIDDEN</td><td>Hidden editor template</td></tr>
  <tr><td></td><td></td><td>Search...</td></tr></table>`;
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType:'text/html', body:quote }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=18151');
    await page.addScriptTag({ content:source });
    const expected = 'Tasman Motorised Freestanding Louvre Roof Aluminium Pergola, Alabaster Umbrella, Granite Umbrella Base';
    await page.waitForFunction(({ key, expected }) => JSON.parse(localStorage.getItem(key)||'{}').product === expected, { key, expected });
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    assert.equal(saved.quoteNumber, 'NZSO-18151');assert.equal(saved.firstName, 'Nibun');
    // A refreshed capture replaces the previously stored component-heavy description.
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({quoteNumber:'NZSO-18151',product:'Old component list'})), key);
    await page.locator('#first').dispatchEvent('change');
    await page.waitForFunction(({ key, expected }) => JSON.parse(localStorage.getItem(key)||'{}').product === expected, { key, expected });
    await page.goto('https://go.cin7.com/Cloud/CRM/ContactLog.aspx?idOrder=18151');
    await page.setContent('<input id="subject" value="NZSO-18151 - Quote"><input id="email_to" value="Nibun &lt;nibun@example.test&gt;">');
    await page.addScriptTag({ content:`const EMAIL_HELPER_URL='https://living-culture-email-helper.vercel.app',CONTEXT_KEY='${key}';const findSubjectField=()=>document.getElementById('subject'),editorCandidates=()=>[],ancestorCandidates=()=>[];${['clean','visible','fieldNearLabel','extractOrderNumber','emailPageContext','helperUrl'].map(extract).join('\n')}` });
    const url = new URL(await page.evaluate(() => helperUrl()));
    assert.equal(url.searchParams.get('product'), expected, 'Only commercial descriptions are sent to email subject/body generation');
    await page.locator('#subject').fill('NZSO-99999 - Quote');
    assert.equal(new URL(await page.evaluate(() => helperUrl())).searchParams.get('product'), null, 'Never borrow another quote description');
    // Quotes without a BOM column still include all ordinary product descriptions.
    await page.setContent('<table><tr><th>Product</th></tr><tr><td>Chair</td></tr><tr><td>Table</td></tr></table>');
    await page.addScriptTag({ content:extract('productNamesFromQuote') });
    assert.deepEqual(await page.evaluate(() => productNamesFromQuote()), ['Chair','Table']);
    console.log('PASS: Full quote script excludes Use components, retains Make/standalone products, refreshes stale context and sends clean email helper context. Browser fixture; no email sent.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
