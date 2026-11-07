const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ts = require(process.env.TYPESCRIPT_MODULE || path.resolve(__dirname, '../../workflow/node_modules/typescript'));
const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const ast = ts.createSourceFile('workflow.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = new Set([
  'findOmniSectionHeading', 'findOmniSectionField', 'setOmniControlValue', 'addressControlsForHeading',
  'deliveryBillingFields', 'copyDeliveryAddressToBilling', 'ensureDeliveryBillingCopy',
  'showroomFromDeliveryAddress', 'syncOmniShowroomDeliveryPanelSelection',
  'applyOmniShowroomDelivery', 'clearOmniShowroomDelivery',
  'positionOmniShowroomDeliveryPanel', 'ensureOmniShowroomDelivery'
]);
const declarations = [];
let options;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) declarations.push(node.getText(ast));
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'SHOWROOM_DELIVERY_OPTIONS') options = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(declarations.length, names.size);
assert(options);
assert.match(source, /ensureDeliveryBillingCopy\(\);\s*ensureOmniShowroomDelivery\(\);/, 'Actual startup enables the destination choices');
const destinations = [
  'Collect from Pilkington', 'Deliver to Hamilton S/R', 'Deliver to Penrose S/R',
  'Deliver to Christchurch S/R', 'Deliver to Napier S/R', 'Deliver to Whangarei S/R',
  'Deliver to Wairau S/R', 'Deliver to Tauranga S/R'
];
const fields = [
  ['First Name', 'first', 'Example'], ['Last Name', 'last', 'Customer'], ['Company', 'company', 'Demo Company'],
  ['Address 1', 'address1', '12 Example Lane'], ['Address 2', 'address2', 'Demo Suburb'],
  ['City', 'city', 'Demo City'], ['State/Region', 'region', 'Demo Region'],
  ['Postal Code', 'postcode', '0000'], ['Country', 'country', 'New Zealand']
];
const section = type => `<section class="column ${type.toLowerCase()}"><h2>${type} Address</h2>${fields.map(([label, key, value]) => `<div class="row"><label for="${type}-${key}">${['First Name', 'Last Name', 'Company'].includes(label) ? label : `${type} ${label}`}</label><input id="${type}-${key}" value="${type === 'Delivery' ? value : ''}"></div>`).join('')}</section>`;

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font:14px Arial}.card{position:relative;width:1560px;height:900px;margin:20px}.column{position:absolute;top:20px;width:360px}.delivery{left:450px}.billing{left:1200px}.row{display:grid;grid-template-columns:165px 190px;align-items:center;margin:7px 0}.row input{height:31px;width:190px}</style><div class="card">${section('Delivery')}${section('Billing')}<input id="freight" value="Ship from Warehouse"><input id="charge" value="49.00"><button id="save">Save</button></div>`);
    await page.addScriptTag({ content: `
      const COPY_DELIVERY_BILLING_ID='lc-omni-copy-delivery-to-billing';
      const SHOWROOM_DELIVERY_PANEL_ID='lc-omni-showroom-delivery';
      const ${options};
      const clean=value=>String(value||'').replace(/\\s+/g,' ').trim();
      const normalizeLabel=value=>clean(value).toLowerCase().replace(/[*:]/g,'').replace(/\\s+/g,' ').trim();
      const isVisible=element=>{const rect=element?.getBoundingClientRect();return Boolean(rect&&rect.width>0&&rect.height>0)};
      const isOmniPage=()=>true;
      const escapeHtml=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
      let lastOmniOrderSyncDigest='existing';window.syncs=0;window.saves=0;window.nativeChanges=0;
      const scheduleOmniWorkflowSync=()=>{window.syncs+=1};
      document.getElementById('save').onclick=()=>saves++;
      document.getElementById('Delivery-address1').addEventListener('change',()=>nativeChanges++);
      ${declarations.join('\n')}
      ensureDeliveryBillingCopy();ensureOmniShowroomDelivery();
    ` });
    const panel = page.locator('#lc-omni-showroom-delivery');
    assert.equal(await panel.getByRole('checkbox').count(), 8);
    const before = await page.locator('.delivery').boundingBox();
    const box = await panel.boundingBox(), addressBox = await page.locator('#Delivery-address1').boundingBox();
    const billingBox = await page.locator('.billing').boundingBox();
    assert(box.x >= addressBox.x + addressBox.width);
    assert(box.x + box.width <= billingBox.x);
    assert(box.y + box.height <= before.y + before.height, 'Choices stay within address-section height');
    for (const name of destinations) {
      await panel.getByRole('checkbox', { name, exact: true }).check();
      assert.equal(await page.locator('#Delivery-address1').inputValue(), name);
      assert.equal(await panel.locator('input:checked').count(), 1);
      assert.equal(await page.locator('#Billing-address1').inputValue(), '');
      assert.equal(await page.locator('#freight').inputValue(), 'Ship from Warehouse');
      assert.equal(await page.locator('#charge').inputValue(), '49.00');
      for (const [, key, value] of fields.filter(row => row[1] !== 'address1')) {
        assert.equal(await page.locator(`#Delivery-${key}`).inputValue(), value);
      }
    }
    await panel.getByRole('checkbox', { name: destinations[7], exact: true }).uncheck();
    assert.equal(await page.locator('#Delivery-address1').inputValue(), '12 Example Lane');
    assert.equal(await panel.locator('input:checked').count(), 0);
    await page.locator('#lc-omni-copy-delivery-to-billing input').check();
    await panel.getByRole('checkbox', { name: destinations[0], exact: true }).check();
    assert.equal(await page.locator('#Billing-address1').inputValue(), destinations[0]);
    await page.locator('#lc-omni-copy-delivery-to-billing input').uncheck();
    await page.locator('#Delivery-address1').fill('Another Example Street');
    assert.equal(await panel.locator('input:checked').count(), 0, 'Manual typing clears stale selection');
    await panel.getByRole('checkbox', { name: destinations[1], exact: true }).check();
    await panel.getByRole('checkbox', { name: destinations[1], exact: true }).uncheck();
    assert.equal(await page.locator('#Delivery-address1').inputValue(), 'Another Example Street');
    await page.evaluate(() => { for (let i = 0; i < 20; i++) ensureOmniShowroomDelivery(); });
    assert.equal(await panel.count(), 1);
    assert.deepEqual(await page.locator('.delivery').boundingBox(), before, 'No native layout movement across repeated passes');
    await page.evaluate(() => { document.getElementById('Delivery-address1').readOnly = true; ensureOmniShowroomDelivery(); });
    assert.equal(await panel.locator('input:disabled').count(), 8);
    await page.evaluate(() => { document.getElementById('Delivery-address1').readOnly = false; ensureOmniShowroomDelivery(); });
    await page.screenshot({ path: '/tmp/omni-destination-desktop.png' });
    await page.evaluate(() => { document.querySelector('.billing').style.left = '790px'; ensureOmniShowroomDelivery(); });
    assert.equal(await panel.getAttribute('data-layout'), 'docked', 'Narrow gap retains access without shifting native fields');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => ensureOmniShowroomDelivery());
    await panel.locator('summary').click();
    await panel.getByRole('checkbox', { name: destinations[3], exact: true }).check();
    assert.equal(await page.locator('#Delivery-address1').inputValue(), destinations[3]);
    assert(await panel.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    assert(await panel.evaluate(node => node.scrollWidth <= node.clientWidth), 'Labels fit narrow panel');
    await page.screenshot({ path: '/tmp/omni-destination-mobile.png' });
    await page.evaluate(() => { document.getElementById('lc-omni-showroom-delivery').remove(); ensureOmniShowroomDelivery(); });
    await panel.locator('summary').click();
    assert.equal(await panel.getByRole('checkbox', { name: destinations[3], exact: true }).isChecked(), true, 'Recreated panel recognises current address');
    assert.equal(await page.evaluate(() => saves), 0);
    assert(await page.evaluate(() => nativeChanges >= 10), 'Native change events emitted');
    assert.deepEqual(errors, []);
    console.log('PASS: eight destination checkboxes, exclusive selection, exact Address 1 values, original-address restore, manual edits, read-only fields, opt-in billing copy, unchanged freight/other fields, startup wiring, stable layout and mobile access. Omni mocked; no live saves.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
