const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../../workflow-speed-fix/node_modules/typescript');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const warranty = fs.readFileSync('userscripts/omni-warranty-guide.user.js', 'utf8');
const parsed = ts.createSourceFile('workflow.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = new Set(['omniHeadingDraft', 'openStaffHelpPopup', 'addStaffHelpButton', 'openIssueReportPopup', 'issueReportHeadingText', 'addIssueReportButton']);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(parsed));
  ts.forEachChild(node, visit);
}
visit(parsed);
const layout = source.slice(source.indexOf('  function layoutOmniWorkflowButtons()'), source.indexOf('  function observeOmniLayout()'));
assert(!layout.includes('document.getElementById(STAFF_HELP_BUTTON_ID)'), 'Footer layout must not pull Staff Guide back down');
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 820, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://go.cin7.com/**', route => route.fulfill({ contentType: 'text/html', body: '<style>body{margin:16px;font:16px Arial}h4{box-sizing:border-box;font-size:20px}button{cursor:pointer}</style><h4>Edit Sales Order - Customer - NZSO-17003</h4><div id="lc-omni-workflow-tools-bar"></div>' }));
      await page.route('https://living-culture-*.vercel.app/**', route => route.fulfill({ contentType: 'text/html', body: 'Guide fixture' }));
      await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=406');
      await page.addScriptTag({ content: `
        const OMNI_TOOLS_BAR_ID='lc-omni-workflow-tools-bar',STAFF_HELP_BAR_ID='old',STAFF_HELP_BUTTON_ID='lc-omni-staff-help-button',STAFF_HELP_DIALOG_ID='lc-omni-staff-help-dialog';
        const STAFF_GUIDE_URL='https://living-culture-freight.vercel.app/omni-help.html',WORKFLOW_PLANNER_URL='https://living-culture-workflow.vercel.app/';
        const isOmniPage=()=>true,isVisible=node=>node.getBoundingClientRect().width>0;
        const clean=value=>String(value||'').replace(/\\s+/g,' ').trim(),extractOrderId=value=>String(value).match(/NZSO-\\d+/)?.[0]||'';
        const readOmniControlByLabel=()=>'',readValueNearLabel=()=>'';
        window.opened=[];window.open=url=>{opened.push(url);return {focus(){}}};
        ${functions.join('\n')}
        addStaffHelpButton();
      ` });
      // Warranty can load before the heading actions and must migrate afterwards.
      await page.addScriptTag({ content: warranty });
      await page.evaluate(() => { addIssueReportButton();addStaffHelpButton(); });
      await page.waitForFunction(() => document.querySelector('#lc-omni-heading-actions #lc-omni-warranty-button'));
      const ids = ['lc-omni-staff-help-button', 'lc-omni-warranty-button', 'lc-omni-report-issue'];
      for (let pass = 0; pass < 5; pass++) await page.evaluate(() => { addIssueReportButton();addStaffHelpButton(); });
      assert.deepEqual(await page.locator('#lc-omni-heading-actions').evaluate(el => [...el.children].map(child => child.id)), ids);
      for (const id of ids) assert.equal(await page.locator(`#${id}`).count(), 1);
      assert.equal(await page.locator('#lc-omni-workflow-tools-bar button').count(), 0);
      assert.deepEqual(await page.evaluate(() => omniHeadingDraft()), { customerName:'Customer', orderId:'NZSO-17003', documentType:'sales-order' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Heading actions fit narrow screens');
      await page.screenshot({ path: `/tmp/lc-omni-heading-actions-${width}.png` });
      await page.getByRole('button', { name:'Staff Guide', exact:true }).click();
      await page.locator('#lc-omni-staff-help-dialog').waitFor();
      await page.locator('#lc-omni-staff-help-dialog button').click();
      await page.getByRole('button', { name:'Warranty', exact:true }).click();
      await page.locator('#lc-omni-warranty-dialog').waitFor();
      await page.locator('#lc-omni-warranty-dialog button').click();
      await page.getByRole('button', { name:'Report Issue', exact:true }).click();
      const url = new URL(await page.evaluate(() => opened.at(-1)));
      assert.equal(url.searchParams.get('order'), 'NZSO-17003');assert.equal(url.searchParams.get('customer'), 'Customer');
      for (const title of ['Edit Quote - Quote Customer - NZSO-17002', 'New Quote']) {
        await page.evaluate(title => {
          document.querySelector('h4').textContent=title;
          addIssueReportButton();addStaffHelpButton();
        }, title);
        await page.waitForFunction(() => document.querySelector('#lc-omni-heading-actions #lc-omni-warranty-button'));
        assert.deepEqual(await page.locator('#lc-omni-heading-actions').evaluate(el => [...el.children].map(child => child.id)), ids);
        await page.getByRole('button', { name:'Report Issue', exact:true }).click();
        assert.equal(new URL(await page.evaluate(() => opened.at(-1))).searchParams.get('order'), title==='New Quote' ? '' : 'NZSO-17002');
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: Heading button order, independent load timing, native heading refresh, quotes/new quotes, customer/NZSO parsing, unchanged popups and desktop/iPad/mobile fit. No live writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
