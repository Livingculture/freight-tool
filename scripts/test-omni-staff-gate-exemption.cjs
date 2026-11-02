const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
function extract(name) {
  const match = new RegExp(`  (?:async )?function ${name}\\(`).exec(source);
  assert(match, name);
  const rest = source.slice(match.index);
  const next = rest.slice(1).search(/\n  (?:async )?function /);
  return rest.slice(0, next + 1);
}
const functions = ['clean','normalizeLabel','omniProfileEmail','isOmniWorkflowGateExempt','refreshOmniWorkflowGateIdentity','installOmniWorkflowGateIdentity',
  'hubSpotGateStorageKey','isHubSpotStepComplete','quotePdfUnlockKey','isQuotePdfUnlocked','ensureHubSpotGateStyles',
  'hubSpotPrerequisites','applyHubSpotPrerequisiteGate','applyHubSpotApprovalGate'];
const fixture = `<h1>Edit Quote - Bronwyn Customer - NZSO-18151</h1><label>Created By</label><input value="Bronwyn">
  <label>Customer Email</label><input value="bronwyn@livingculture.co.nz"><button id="hubspot">HubSpot Deal</button>
  <button id="lc-pdf">Download Quote</button><button>Save As Draft</button><button id="approve">Approve</button><button id="admin">Go to Admin</button>`;
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let profile = '<h1>User Details</h1><table><tr><td>Email:</td><td>steve@livingculture.co.nz</td></tr></table>', status = 200, redirect = '';
    await page.route('https://go.cin7.com/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/Cloud/Customers/UserDetails.aspx') {
        requests.push({method:request.method(),url:request.url()});
        assert.equal(request.method(), 'GET');assert.equal(request.postData(), null);
        await route.fulfill(redirect ? {status:302,headers:{location:redirect}} : {status,contentType:'text/html',body:profile});
      } else await route.fulfill({contentType:'text/html',body:fixture});
    });
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?OrderId=18151');
    await page.addScriptTag({content:`
      const HUBSPOT_BUTTON_ID='hubspot',QUOTE_PDF_BUTTON_ID='lc-pdf',LEGACY_QUOTE_PDF_BUTTON_ID='lc-old-pdf',HUBSPOT_GATE_CLASS='lc-gated';
      const HUBSPOT_GATE_STORAGE_PREFIX='completed:',QUOTE_PDF_UNLOCK_PREFIX='unlocked:',HUBSPOT_GATED_LABELS=new Set(['approve','go to admin']);
      const completedHubSpotSteps=new Set();let omniStaffGateIdentity={email:'',expiresAt:0},omniStaffGateCheck=null,omniStaffGateRequest=0;
      const isOmniPage=()=>location.hostname==='go.cin7.com';
      const extractOrderId=value=>String(value||'').match(/NZSO-\\d+/i)?.[0].toUpperCase()||'';
      const omniHeadingDraft=()=>({orderId:'NZSO-18151',documentType:'quote'}),hubSpotGateOrderId=()=> 'NZSO-18151';
      const findButtonByLabel=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.toLowerCase()===label.toLowerCase());
      const readHubSpotPrerequisiteSteps=()=>({}),claimPendingHubSpotDraft=()=>{},hasPersistedQuoteMemo=()=>false;
      const addConvertToSalesOrderButton=()=>{};
      function scheduleButtonPass(){applyHubSpotPrerequisiteGate();applyHubSpotApprovalGate();}
      ${functions.map(extract).join('\n')}
    `});
    const blocked = async () => {
      assert(await page.locator('#hubspot').isDisabled());assert(await page.locator('#lc-pdf').isDisabled());
      assert.equal(await page.locator('#approve').isVisible(),false);assert.equal(await page.locator('#admin').isVisible(),false);
      assert.equal(await page.evaluate(() => isOmniWorkflowGateExempt()),false);
    };
    await page.evaluate(() => refreshOmniWorkflowGateIdentity());
    await blocked(); // A customer or salesperson named Bronwyn does not exempt Steve.
    for (const row of [
      '<table><tr><td>Email:</td><td>BRONWYN@LIVINGCULTURE.CO.NZ</td></tr></table>',
      '<div><div>Email:</div><div>bronwyn@livingculture.co.nz</div></div>',
      '<p>Email: <span>bronwyn@livingculture.co.nz</span></p>',
      '<label for="email">Email Address:</label><input id="email" value="bronwyn@livingculture.co.nz">',
    ]) {
      profile = '<h1>User Details</h1>' + row;
      await page.evaluate(() => refreshOmniWorkflowGateIdentity());
      assert.equal(await page.evaluate(() => isOmniWorkflowGateExempt()),true);
      assert(await page.locator('#hubspot').isEnabled());assert(await page.locator('#lc-pdf').isEnabled());
      assert(await page.locator('#approve').isVisible());assert(await page.locator('#admin').isVisible());
      assert.equal(await page.evaluate(() => isHubSpotStepComplete('NZSO-18151')),false,'Exemption is not fabricated HubSpot completion');
      assert.equal(await page.evaluate(() => isQuotePdfUnlocked('NZSO-18151')),true);
      assert.equal(await page.evaluate(() => localStorage.length),0,'No per-quote unlock leaks to other staff');
      assert.equal(await page.evaluate(() => sessionStorage.length),0,'No identity stored in browser storage');
    }
    for (const row of [
      '<label>Email:</label><span>someone@livingculture.co.nz</span>',
      '<label>Email:</label><span>bronwyn@livingculture.co.nz.other.test</span>',
      '<label>Email:</label><span>bronwyn@livingculture.co.nz</span><label>Email:</label><span>steve@livingculture.co.nz</span>',
      '<label>Customer Email:</label><span>bronwyn@livingculture.co.nz</span>',
      '<h1>Please sign in</h1>',
    ]) {
      profile = '<h1>User Details</h1>' + row;await page.evaluate(() => refreshOmniWorkflowGateIdentity());await blocked();
    }
    profile = '<h1>Sign In</h1><label>Email:</label><span>bronwyn@livingculture.co.nz</span>';
    await page.evaluate(() => refreshOmniWorkflowGateIdentity());await blocked();
    profile = '<h1>User Details</h1><label>Email:</label><span>bronwyn@livingculture.co.nz</span>';
    status = 500;await page.evaluate(() => refreshOmniWorkflowGateIdentity());await blocked();status = 200;
    redirect = '/login';await page.evaluate(() => refreshOmniWorkflowGateIdentity());await blocked();redirect = '';
    await page.evaluate(() => refreshOmniWorkflowGateIdentity());
    await page.evaluate(() => {omniStaffGateIdentity.expiresAt=Date.now()-1;scheduleButtonPass();});await blocked();
    // Delayed requests cannot undo a later identity check.
    await page.evaluate(async () => {
      const nativeFetch=window.fetch;let release;
      window.fetch=()=>new Promise(resolve=>{release=resolve});
      const old=refreshOmniWorkflowGateIdentity();window.fetch=nativeFetch;
      await refreshOmniWorkflowGateIdentity();
      release({ok:true,url:location.origin+'/Cloud/Customers/UserDetails.aspx',text:async()=>'<label>Email:</label><span>steve@livingculture.co.nz</span>'});
      await old;
    });
    assert(await page.evaluate(() => isOmniWorkflowGateExempt()));
    await page.evaluate(() => installOmniWorkflowGateIdentity());
    await page.waitForFunction(() => isOmniWorkflowGateExempt());
    await page.evaluate(() => {
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
    });await blocked();
    profile='<h1>User Details</h1><label>Email:</label><span>steve@livingculture.co.nz</span>';
    await page.evaluate(() => {
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => omniStaffGateCheck===null);await blocked();
    assert(requests.length>5);assert.deepEqual(errors,[]);
    console.log('PASS: Exact signed-in profile exemption, read-only requests, native button/PDF/memo gates, no persisted completion, account changes, expiry, redirects, failures and stale responses. Browser fixtures only.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
