const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ts = require(path.resolve(__dirname, '../../workflow-speed-fix/node_modules/typescript'));
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const widget = fs.readFileSync('userscripts/workflow-updates-dropdown.js', 'utf8');
assert.equal(widget, fs.readFileSync('../workflow-speed-fix/public/workflow-updates-dropdown.js', 'utf8'), 'Omni and Workflow use identical dropdown code');
const loader = fs.readFileSync('userscripts/livingculture-all-in-one.user.js', 'utf8');
const resource = source.match(/@resource\s+staffUpdatesWidget\s+(\S+)/)[1];
assert.match(resource, /\/freight-tool\/[a-f0-9]{40}\/userscripts\/workflow-updates-dropdown\.js$/);
assert(loader.includes(resource), 'All-in-One includes the same pinned shared widget resource');
const ast = ts.createSourceFile('workflow.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['addStaffUpdatesButton', 'addStaffHelpButton'].includes(node.name?.text)) declarations.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="lc-omni-heading-actions"></div>' }));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(({ declarations, widget }) => {
      window.GM_getResourceText = name => { if (name !== 'staffUpdatesWidget') throw Error(name); return widget; };
      window.requests = [];
      window.GM_xmlhttpRequest = options => {
        window.requests.push({ url: options.url, method: options.method, anonymous: options.anonymous });
        queueMicrotask(() => options.onload({ status: 200, responseText: JSON.stringify({ userId: 'linet-id', isAdmin: true, updates: [{ id: 'release', title: 'Omni and Workflow update', body: 'Approved note', category: 'both', version: '0.1.205', publishedAt: '2026-11-03T06:00:00Z' }] }) }));
      };
      new Function(`const isOmniPage=()=>true,openStaffHelpPopup=()=>{},OMNI_TOOLS_BAR_ID='tools',STAFF_HELP_BUTTON_ID='lc-omni-staff-help-button',STAFF_HELP_BAR_ID='old-bar',WORKFLOW_PLANNER_URL='https://living-culture-workflow.vercel.app/';${declarations.join('\n')} addStaffHelpButton();addStaffHelpButton();`)();
    }, { declarations, widget });
    const button = page.getByRole('button', { name: 'Updates', exact: true });
    await page.waitForFunction(() => document.getElementById('lc-omni-updates-button').classList.contains('lc-updates-unread'));
    assert.equal(await button.count(), 1);
    assert.equal(await page.locator('#lc-omni-staff-help-button').evaluate(node => node.nextElementSibling.id), 'lc-omni-updates-button');
    assert.deepEqual(await page.evaluate(() => requests), [{ url: 'https://living-culture-workflow.vercel.app/api/workflow-updates?feed=1', method: 'GET', anonymous: false }]);
    await button.click(); await page.getByText('Approved note', { exact: true }).waitFor();
    assert.equal(await button.evaluate(node => node.classList.contains('lc-updates-unread')), false);
    assert.equal(await page.getByRole('link', { name: 'Edit / approve updates' }).count(), 0, 'Even an administrator sees the same read-only staff feed in Omni');
    assert.equal(await page.getByRole('link', { name: 'All updates' }).getAttribute('target'), '_blank');
    assert.equal(await page.getByRole('link', { name: 'Update Tampermonkey' }).getAttribute('href'), 'https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-all-in-one.user.js');
    await page.screenshot({ path: '/tmp/omni-updates-dropdown.png' });
    await page.keyboard.press('Escape');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errors, []);
    console.log('PASS: actual Omni placement, authenticated feed, green unread/read state and staff-only dropdown even for administrators. Feed mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
