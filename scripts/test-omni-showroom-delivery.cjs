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
  'omniDestinationFreightControl', 'setOmniDestinationFreight',
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
const freightSource = fs.readFileSync('userscripts/omni-cin7-lc-freight.user.js', 'utf8');
const freightAst = ts.createSourceFile('freight.js', freightSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const freightNames = new Set(['isInjectedPanelElement','getAllVisiblePageElements','findOmniFreightLabel','findOmniFreightInputs','syncFreightDescriptionDropdown','ensureFreightDescriptionDropdown','setOmniInputValue']);
const freightDeclarations = [];
function visitFreight(node) {
  if (ts.isFunctionDeclaration(node) && freightNames.has(node.name?.text)) freightDeclarations.push(node.getText(freightAst));
  ts.forEachChild(node, visitFreight);
}
visitFreight(freightAst);
assert.equal(freightDeclarations.length, freightNames.size);
assert.match(source, /ensureDeliveryBillingCopy\(\);\s*ensureOmniShowroomDelivery\(\);/, 'Actual startup enables the destination choices');
const destinations = [
  'Collect AKL Warehouse', 'Collect Chch Warehouse', 'Deliver to Hamilton S/R', 'Deliver to Penrose S/R',
  'Deliver to Christchurch S/R', 'Deliver to Napier S/R', 'Deliver to Whangarei S/R',
  'Deliver to Wairau S/R', 'Deliver to Tauranga S/R'
];
const checkboxLabel = address => address.replace(/^Deliver to /, '');
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
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font:14px Arial}.card{position:relative;width:1560px;height:900px;margin:20px}.column{position:absolute;top:20px;width:360px}.delivery{left:450px}.billing{left:1200px}.row{display:grid;grid-template-columns:165px 190px;align-items:center;margin:7px 0}.row input{height:31px;width:190px}.freight-row{position:absolute;top:750px;left:600px;display:flex;align-items:center;gap:8px}.freight-row input{width:200px;height:30px}</style><div class="card">${section('Delivery')}${section('Billing')}<div class="freight-row"><label>Freight</label><input id="freight" name="FreightDescription" value="Ship from Warehouse"><input id="charge" value="49.00"></div><button id="save">Save</button></div>`);
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
      const FREIGHT_DESCRIPTION_SELECT_ID='lc-omni-freight-description-select';
      const FREIGHT_DESCRIPTION_OPTIONS=['Ship from Auckland','Ship from Chch','Collect from Warehouse','Collect from Showroom'];
      let freightDescriptionInput=null,freightDescriptionDisplay='',freightDescriptionSyncCleanup=null;
      ${freightDeclarations.join('\n')}
      ensureDeliveryBillingCopy();ensureOmniShowroomDelivery();
    ` });
    const panel = page.locator('#lc-omni-showroom-delivery');
    assert.equal(await panel.getByRole('checkbox').count(), 9);
    await panel.getByRole('checkbox', { name: 'Collect Chch Warehouse', exact: true }).check();
    assert.equal(await page.locator('#freight').inputValue(), 'Collect from Warehouse', 'Native freight fallback works before the freight helper loads');
    await panel.getByRole('checkbox', { name: 'Collect Chch Warehouse', exact: true }).uncheck();
    await page.evaluate(() => ensureFreightDescriptionDropdown());
    assert.equal(await panel.locator('summary,h1,h2,h3,strong').count(), 0, 'No destination heading');
    assert(!/Deliver to/.test(await panel.innerText()), 'Checkbox text omits Deliver to');
    const before = await page.locator('.delivery').boundingBox();
    const box = await panel.boundingBox(), addressBox = await page.locator('#Delivery-address1').boundingBox();
    const billingBox = await page.locator('.billing').boundingBox();
    assert(box.x >= addressBox.x + addressBox.width);
    assert(box.x + box.width <= billingBox.x);
    const firstBilling = await page.locator('#Billing-first').boundingBox();
    const lastBilling = await page.locator('#Billing-country').boundingBox();
    assert(Math.abs(box.y+box.height/2-(firstBilling.y+lastBilling.y+lastBilling.height)/2) <= 1, 'List is vertically centred against the nine Billing Address inputs');
    assert(box.y + box.height <= before.y + before.height, 'Choices stay within address-section height');
    for (const name of destinations) {
      await panel.getByRole('checkbox', { name: checkboxLabel(name), exact: true }).check();
      assert.equal(await page.locator('#Delivery-address1').inputValue(), name);
      assert.equal(await panel.locator('input:checked').count(), 1);
      assert.equal(await page.locator('#Billing-address1').inputValue(), '');
      const expectedFreight = name.startsWith('Collect') ? 'Collect from Warehouse' : 'Collect from Showroom';
      assert.equal(await page.locator('#freight').inputValue(), expectedFreight, 'Native saved field matches the destination');
      assert.equal(await page.locator('#lc-omni-freight-description-select').inputValue(), expectedFreight);
      assert.equal(await page.locator('#lc-omni-freight-description-select-options').inputValue(), expectedFreight, 'Real preset dropdown is synchronised');
      assert.equal(await page.locator('#charge').inputValue(), '49.00');
      for (const [, key, value] of fields.filter(row => row[1] !== 'address1')) {
        assert.equal(await page.locator(`#Delivery-${key}`).inputValue(), value);
      }
    }
    await panel.getByRole('checkbox', { name: checkboxLabel(destinations.at(-1)), exact: true }).uncheck();
    assert.equal(await page.locator('#Delivery-address1').inputValue(), '12 Example Lane');
    assert.equal(await page.locator('#freight').inputValue(), 'Ship from Warehouse', 'Untick restores the preceding freight wording');
    assert.equal(await panel.locator('input:checked').count(), 0);
    await page.locator('#lc-omni-copy-delivery-to-billing input').check();
    await panel.getByRole('checkbox', { name: checkboxLabel(destinations[0]), exact: true }).check();
    assert.equal(await page.locator('#Billing-address1').inputValue(), destinations[0]);
    await page.locator('#lc-omni-copy-delivery-to-billing input').uncheck();
    await page.locator('#Delivery-address1').fill('Another Example Street');
    assert.equal(await panel.locator('input:checked').count(), 0, 'Manual typing clears stale selection');
    await panel.getByRole('checkbox', { name: checkboxLabel(destinations[1]), exact: true }).check();
    await panel.getByRole('checkbox', { name: checkboxLabel(destinations[1]), exact: true }).uncheck();
    assert.equal(await page.locator('#Delivery-address1').inputValue(), 'Another Example Street');
    await panel.getByRole('checkbox', { name: 'Hamilton S/R', exact: true }).check();
    await page.locator('#lc-omni-freight-description-select').fill('Custom freight wording');
    await page.evaluate(() => ensureOmniShowroomDelivery());
    assert.equal(await page.locator('#freight').inputValue(), 'Custom freight wording', 'Background passes preserve a manual override');
    await panel.getByRole('checkbox', { name: 'Hamilton S/R', exact: true }).uncheck();
    assert.equal(await page.locator('#freight').inputValue(), 'Custom freight wording', 'Untick never overwrites later manual wording');
    await page.evaluate(() => { for (let i = 0; i < 20; i++) ensureOmniShowroomDelivery(); });
    assert.equal(await panel.count(), 1);
    assert.deepEqual(await page.locator('.delivery').boundingBox(), before, 'No native layout movement across repeated passes');
    await page.evaluate(() => { document.getElementById('Delivery-address1').readOnly = true; ensureOmniShowroomDelivery(); });
    assert.equal(await panel.locator('input:disabled').count(), 9);
    await page.evaluate(() => { document.getElementById('Delivery-address1').readOnly = false; ensureOmniShowroomDelivery(); });
    await page.screenshot({ path: '/tmp/omni-destination-desktop.png' });
    await page.evaluate(() => { document.querySelector('.billing').style.left = '790px'; ensureOmniShowroomDelivery(); });
    assert.equal(await panel.getAttribute('data-layout'), 'docked', 'Narrow gap retains access without shifting native fields');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => ensureOmniShowroomDelivery());
    await panel.getByRole('checkbox', { name: checkboxLabel(destinations[3]), exact: true }).check();
    assert.equal(await page.locator('#Delivery-address1').inputValue(), destinations[3]);
    assert(await panel.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
    assert(await panel.evaluate(node => node.scrollWidth <= node.clientWidth), 'Labels fit narrow panel');
    await page.screenshot({ path: '/tmp/omni-destination-mobile.png' });
    await page.evaluate(() => { document.getElementById('lc-omni-showroom-delivery').remove(); ensureOmniShowroomDelivery(); });
    assert.equal(await panel.getByRole('checkbox', { name: checkboxLabel(destinations[3]), exact: true }).isChecked(), true, 'Recreated panel recognises current address');
    await page.locator('#Delivery-address1').fill('Collect from Pilkington');
    await page.evaluate(() => ensureOmniShowroomDelivery());
    assert.equal(await panel.getByRole('checkbox', { name: 'Collect AKL Warehouse', exact: true }).isChecked(), true, 'Existing Pilkington wording still recognises the renamed AKL choice');
    assert.equal(await page.locator('#Delivery-address1').inputValue(), 'Collect from Pilkington', 'Older orders are not silently rewritten');
    assert.equal(await page.evaluate(() => saves), 0);
    assert(await page.evaluate(() => nativeChanges >= 10), 'Native change events emitted');
    assert.deepEqual(errors, []);
    console.log('PASS: nine destination checkboxes, centred layout, warehouse/showroom freight mappings through the real freight helper, native fallback, preset synchronisation, restore/manual overrides, unchanged charges and other address fields, mobile access and no saves. Omni mocked.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
