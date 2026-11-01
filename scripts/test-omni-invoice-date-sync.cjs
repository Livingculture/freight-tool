const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ts = require(path.resolve(__dirname, '../../workflow-speed-fix/node_modules/typescript'));
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const parsed = ts.createSourceFile('workflow.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['normalizeLabel', 'readValueNearLabel', 'readOmniControlByLabel', 'omniDateInputs', 'omniWorkflowDate', 'omniFullyDispatchedInputs', 'omniFullyDispatchedState'];
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.push(node.getText(parsed));
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.equal(functions.length, names.length);
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<style>.dates{display:flex;gap:30px}input{width:100px}</style><div class="dates"><div><label>Created Date</label><div><input value="20-09-2026"><input value="10:46 am"></div></div><div><label><b>2</b>Fully Dispatched</label><div><input id="dispatch"><input></div></div><div><label><b>3</b>Invoice Date</label><div><input id="invoice" value="1-11-2026"><input value="11:10 am"></div></div><div><label>Invoiced Total</label><input value="1087.96"></div></div>');
    await page.addScriptTag({ content: `const clean=v=>String(v??'').replace(/\\s+/g,' ').trim();const isVisible=e=>Boolean(e.getBoundingClientRect().width&&e.getBoundingClientRect().height);${functions.join('\n')}` });
    assert.equal(await page.evaluate(() => readOmniControlByLabel('Invoice Date') || readValueNearLabel('Invoice Date')), '', 'Reproduces original badge-label bug');
    assert.equal(await page.evaluate(() => omniWorkflowDate('Invoice Date')), '1-11-2026');
    assert.equal(await page.evaluate(() => omniWorkflowDate('Created Date')), '20-09-2026');
    assert.equal(await page.evaluate(() => omniFullyDispatchedState()), false, 'Invoice does not imply dispatched');
    await page.locator('#invoice').fill('');
    assert.equal(await page.evaluate(() => omniWorkflowDate('Invoice Date')), '', 'Blank invoice never borrows the time or creation date');
    await page.locator('#invoice').fill('11:10 am');
    assert.equal(await page.evaluate(() => omniWorkflowDate('Invoice Date')), '');
    await page.setContent('<label for="date"><span>3</span> Invoice Date:</label><input type="date" id="date" value="2026-11-01"><input type="time" value="11:10">');
    assert.equal(await page.evaluate(() => omniWorkflowDate('Invoice Date')), '2026-11-01', 'Linked native date input');
    await page.setContent('<label>Created Date</label><input value="20-09-2026">');
    assert.equal(await page.evaluate(() => omniWorkflowDate('Invoice Date')), '', 'Missing invoice date is not invented');
    console.log('PASS: Reproduced numbered Invoice Date failure; local/native dates captured without borrowing time, dispatch, creation or amount. Browser fixture only.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
