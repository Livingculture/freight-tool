const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ts = require(path.resolve(__dirname, '../../workflow/node_modules/typescript'));
const workflow = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const autocomplete = fs.readFileSync('userscripts/omni-address-autocomplete.user.js', 'utf8');
const ast = ts.createSourceFile('workflow.js', workflow, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = new Set(['findOmniSectionHeading','findOmniSectionField','setOmniControlValue','addressControlsForHeading',
  'deliveryBillingFields','copyDeliveryAddressToBilling','showroomFromDeliveryAddress','omniDestinationFreightControl',
  'setOmniDestinationFreight','syncOmniShowroomDeliveryPanelSelection','applyOmniShowroomDelivery',
  'clearOmniShowroomDelivery','positionOmniShowroomDeliveryPanel','ensureOmniShowroomDelivery']);
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
const fields = [['First Name','first'],['Last Name','last'],['Company','company'],['Address 1','address1'],
  ['Address 2','address2'],['City','city'],['State/Region','region'],['Postal Code','postcode'],['Country','country']];
const section = type => `<section class="${type.toLowerCase()}"><h2>${type} Address</h2>${fields.map(([label,key]) => `<div class="row"><label for="${type}-${key}">${['First Name','Last Name','Company'].includes(label) ? label : `${type} ${label}`}</label><input id="${type}-${key}" value="${key === 'address2' ? 'Original suburb' : ''}"></div>`).join('')}</section>`;
const reply = { features: [{ properties: { housenumber:'42',street:'Example Street',suburb:'Demo Suburb',city:'Demo City',state:'Demo Region',postcode:'0000' } }] };

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width:1600,height:1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<style>body{font:14px Arial}section{position:absolute;top:30px;width:360px}.delivery{left:400px}.billing{left:1150px}.row{display:grid;grid-template-columns:165px 190px;margin:7px 0}input{height:26px}</style>${section('Delivery')}${section('Billing')}`);
    await page.addScriptTag({ content: `
      const COPY_DELIVERY_BILLING_ID='lc-omni-copy-delivery-to-billing',SHOWROOM_DELIVERY_PANEL_ID='lc-omni-showroom-delivery';
      const ${options};
      const clean=value=>String(value||'').replace(/\\s+/g,' ').trim();
      const normalizeLabel=value=>clean(value).toLowerCase().replace(/[*:]/g,'').trim();
      const isVisible=node=>{const r=node?.getBoundingClientRect();return Boolean(r&&r.width&&r.height)};
      const isOmniPage=()=>true,escapeHtml=value=>String(value||'');
      let lastOmniOrderSyncDigest='';const scheduleOmniWorkflowSync=()=>{};
      ${declarations.join('\n')}
      window.lookupRequests=[];window.GM_xmlhttpRequest=options=>lookupRequests.push(options);
      ensureOmniShowroomDelivery();
    ` });
    await page.addScriptTag({ content:autocomplete });
    const panel = page.locator('#lc-omni-showroom-delivery');
    const address = page.locator('#Delivery-address1');
    const suggestions = page.locator('#lc-omni-delivery-address-suggestions');
    const choices = panel.getByRole('checkbox');
    assert.equal(await choices.count(), 9);
    for (let index=0; index<9; index++) {
      await choices.nth(index).check();
      await address.dispatchEvent('keyup', { key:'a' });
      await address.dispatchEvent('input');
      await page.waitForTimeout(760);
      assert.equal(await page.evaluate(() => lookupRequests.length), 0, 'A preset must never trigger an address request');
      assert.equal(await suggestions.locator('button').count(), 0);
      assert.equal(await page.locator('#Delivery-address2').inputValue(), 'Original suburb');
    }
    await choices.nth(8).uncheck();
    await address.fill('12 Example Lane');
    await page.waitForTimeout(120);
    await choices.nth(0).check();
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => lookupRequests.length), 0, 'Checking a destination cancels a queued street lookup');
    await choices.nth(0).uncheck();
    await address.fill('42 Example Street');
    await page.waitForFunction(() => lookupRequests.length === 1);
    await choices.nth(1).check();
    await page.evaluate(reply => lookupRequests[0].onload({ status:200,responseText:JSON.stringify(reply) }), reply);
    assert.equal(await address.inputValue(), 'Collect Chch Warehouse');
    assert.equal(await suggestions.innerHTML(), '', 'Late results cannot reopen suggestions');
    assert.equal(await page.locator('#Delivery-city').inputValue(), '', 'Late results never change other address fields');
    await page.evaluate(() => applyOmniShowroomDelivery('pilkington'));
    await choices.nth(0).uncheck();
    await address.fill('42 Example Street');
    await page.waitForFunction(() => lookupRequests.length === 2);
    await page.evaluate(reply => lookupRequests[1].onload({ status:200,responseText:JSON.stringify(reply) }), reply);
    await suggestions.getByRole('button').waitFor();
    await choices.nth(2).check();
    assert.equal(await suggestions.innerHTML(), '', 'Selecting a destination immediately clears open suggestions');
    // A stale pointer action must not apply an earlier suggestion.
    await page.evaluate(() => {
      const source = document.createElement('button');source.dataset.index='0';
      const list = document.getElementById('lc-omni-delivery-address-suggestions');list.append(source);
      source.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
    });
    assert.equal(await address.inputValue(), 'Deliver to Hamilton S/R');
    await choices.nth(2).uncheck();
    await address.fill('42 Example Street');
    await page.waitForFunction(() => lookupRequests.length === 3);
    await choices.nth(3).check();
    await choices.nth(3).uncheck();
    await address.fill('');
    await page.evaluate(reply => lookupRequests[2].onload({ status:200,responseText:JSON.stringify(reply) }), reply);
    assert.equal(await suggestions.innerHTML(), '', 'Cancelled results remain invalid after unticking');
    await address.fill('42 Example Street');
    await page.waitForFunction(() => lookupRequests.length === 4);
    await page.evaluate(reply => lookupRequests[3].onload({ status:200,responseText:JSON.stringify(reply) }), reply);
    await suggestions.getByRole('button').click();
    assert.equal(await address.inputValue(), '42 Example Street');
    assert.equal(await page.locator('#Delivery-address2').inputValue(), 'Demo Suburb');
    assert.equal(await page.locator('#Delivery-city').inputValue(), 'Demo City');
    assert.equal(await page.locator('#Delivery-postcode').inputValue(), '0000', 'Normal address selection resumes with no destination ticked');
    await choices.nth(0).check();
    await page.screenshot({ path:'/tmp/omni-address-destination-guard-desktop.png' });
    await page.setViewportSize({ width:390,height:844 });
    await page.evaluate(() => ensureOmniShowroomDelivery());
    await page.screenshot({ path:'/tmp/omni-address-destination-guard-mobile.png' });
    assert.equal(await suggestions.innerHTML(), '');
    assert.deepEqual(errors, []);
    console.log('PASS: real destination + autocomplete scripts block all nine presets, cancel queued searches, hide open suggestions, reject late results across untick/reselection, and resume normal manual lookup. API mocked; no live requests or saves.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
