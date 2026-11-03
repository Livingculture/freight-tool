const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ts = require(path.resolve(__dirname, '../../workflow-speed-fix/node_modules/typescript'));
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const widget = fs.readFileSync('../workflow-speed-fix/public/workflow-updates-dropdown.js', 'utf8');
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
    assert.equal(await page.getByRole('link', { name: 'Edit / approve updates' }).getAttribute('href'), 'https://living-culture-workflow.vercel.app/updates');
    assert.equal(await page.getByRole('link', { name: 'All updates' }).getAttribute('target'), '_blank');
    await page.screenshot({ path: '/tmp/omni-updates-dropdown.png' });
    await page.keyboard.press('Escape');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errors, []);
    console.log('PASS: actual Omni Staff Guide/Updates placement, one-time resource mount, authenticated GM feed request, green unread/read state, scrollable shared panel and admin links. Feed mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
