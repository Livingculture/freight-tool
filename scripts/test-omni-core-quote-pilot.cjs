const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-core-quote-pilot.user.js'), 'utf8');
const fixture = {
  schema: 'lc-core-quote-pilot-v1', sourceReference: 'NZSO-10000', currency: 'NZD', pricesIncludeGst: true,
  customer: { name: 'Test Customer', email: 'test@example.invalid' },
  lines: [
    { sku: 'CS10000-9', description: 'Test product', quantity: 1, unitPrice: 8299.99, discountPercent: 15, amount: 7054.99 },
    { sku: 'AS10000', description: 'Test assembly', quantity: 1, unitPrice: 1600, discountPercent: 0, amount: 1600 },
    { sku: 'AS10001', description: 'Test service', quantity: 2, unitPrice: 400, discountPercent: 0, amount: 800 },
    { sku: 'CS10001', description: 'Test accessory', quantity: 2, unitPrice: 1099.99, discountPercent: 0, amount: 2199.98 },
    { sku: 'AS10002', description: 'Test installation', quantity: 2, unitPrice: 250, discountPercent: 0, amount: 500 },
    { sku: 'AS10003', description: 'Test finishing', quantity: 1, unitPrice: 1200, discountPercent: 0, amount: 1200 }
  ], freight: { amount: 169 }, total: 13523.97, warnings: ['Source discount not applied twice.']
};
const pageUrl = 'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx';
const html = (heading = 'New Quote', extra = '') => `<!doctype html><html><head><style>
body{font:14px Arial;margin:20px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ccc}input{width:80px}.ui-menu-item{background:white;padding:10px;border:1px solid gray;position:absolute;z-index:9999}
</style></head><body><h1>${heading}</h1><form><button type="submit">Save</button><button type="button" id="approve">Approve</button><button type="button" id="send">Send</button>
<table id="products"><thead><tr><th>Code</th><th>Product</th><th><b>1</b> Qty<br>Ordered</th><th>Unit<br>Price</th><th>% Disc</th><th>Amount</th></tr></thead><tbody>${Array.from({ length: 8 }, () => '<tr><td><input class="code" value=""></td><td></td><td><input value="1"></td><td><input value="0"></td><td><input value="0"></td><td></td></tr>').join('')}</tbody></table>${extra}</form>
<script>
window.saves=0;window.approvals=0;window.sends=0;window.enters=0;
document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.saves++});
document.querySelector('#approve').onclick=()=>window.approvals++;
document.querySelector('#send').onclick=()=>window.sends++;
document.addEventListener('keydown',e=>{if(e.key==='Enter')window.enters++});
function watchCode(input){
input.addEventListener('keypress',event=>{
  if(event.keyCode!==13||event.which!==13||event.charCode!==13)return;
  if(window.codeEnterOnly||window.requiresCodeCommit){
    if(window.submitOnCommit)document.querySelector('form').requestSubmit();
    input.closest('tr').cells[1].textContent='Native Product';
  }
});
input.addEventListener('input',()=>{
  if(window.replaceCodeEditor&&!window.replacedEditor){
    window.replacedEditor=true;
    const replacement=input.cloneNode(false);replacement.value='';input.replaceWith(replacement);watchCode(replacement);replacement.focus();return;
  }
  document.querySelectorAll('.ui-menu-item').forEach(e=>e.remove());
  if(window.noOptions||window.codeEnterOnly)return;
  const option=document.createElement(window.legacyOptions?'div':'li');option.className=window.legacyOptions?'legacy-option':'ui-menu-item';
  if(!window.legacyOptions)option.setAttribute('role','option');
  option.textContent=input.value+(window.wrongVariant?'-OTHER':'')+' Native Product';
  const r=input.getBoundingClientRect();option.style.top=(r.bottom+scrollY)+'px';option.style.left=r.left+'px';
  option.onclick=()=>{if(!window.requiresCodeCommit)input.closest('tr').cells[1].textContent='Native Product';input.value=option.textContent.split(' ')[0];option.remove()};document.body.appendChild(option);
});}
document.querySelectorAll('.code').forEach(watchCode);
document.querySelectorAll('#products tr input:not(.code)').forEach(input=>input.addEventListener('blur',()=>{if(window.rejectPrices&&input.closest('td').cellIndex===3)input.value='0'}));
</script></body></html>`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const probe=await browser.newPage();
  const eventCheck=await probe.evaluate(()=>{
    let error='';try{new PointerEvent('pointerdown',{view:new Proxy(window,{})})}catch(caught){error=caught.message}
    const event=new PointerEvent('pointerdown',{button:0,buttons:1});
    return {error,buttons:event.buttons,view:event.view};
  });
  assert.match(eventCheck.error,/Failed to convert value to 'Window'/);assert.equal(eventCheck.buttons,1);assert.equal(eventCheck.view,null);
  await probe.close();
  const context = await browser.newContext();
  let requests = [];
  await context.route('**/*', route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: html() });
  });
  const page = await context.newPage();
  const el = id => page.locator('#lc-core-import').locator('#' + id);
  const status = () => el('status').textContent();
  async function open(options = {}) {
    await page.goto(pageUrl + (options.query || ''));
    await page.setContent(html(options.heading || 'New Quote', options.extra || ''));
    if (options.toolbar) await page.locator('h1').evaluate(node => {
      const toolbar = document.createElement('span');
      toolbar.id = 'lc-staff-tools';
      toolbar.innerHTML = '<button type="button">Staff Guide</button><button type="button">Help Tips: Off</button><button type="button">Warranty</button>';
      node.append(toolbar);
    });
    if (options.titleTag) await page.locator('h1').evaluate((node, tag) => {
      const title = document.createElement(tag);
      title.innerHTML = node.innerHTML;
      node.replaceWith(title);
    }, options.titleTag);
    await page.evaluate(()=>{
      // Model Tampermonkey's cross-realm WindowProxy rejection at the DOM boundary.
      for(const name of ['MouseEvent','PointerEvent']){
        const Native=window[name];if(!Native)continue;
        window[name]=class extends Native {
          constructor(type,options={}){
            if(options.view!==undefined)throw new TypeError("Failed to convert value to 'Window'.");
            super(type,options);
          }
        };
      }
    });
    await page.addScriptTag({ content: source });
    await el('open').click();
  }
  async function load(data = fixture) {
    await el('file').setInputFiles({ name: 'quote.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.waitForFunction(() => !['Enter a Core quote number.','Loading local test file...'].includes(document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent));
  }
  async function fill() { await el('confirm').check(); await el('fill').click(); }
  async function stopped() {
    await page.waitForFunction(() => document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.startsWith('Stopped:'), { timeout: 15000 });
  }
  async function floatingGrid(codeToo = false, misplaced = false, short = false, legacyMouse = false, tableEditor = false) {
    await page.evaluate(({ codeToo, misplaced, short, legacyMouse, tableEditor }) => {
      for (const row of document.querySelectorAll('#products tbody tr')) {
        if(short)row.style.height='90px';
        for (const index of (codeToo ? [0,2,3,4] : [2,3,4])) {
          const cell = row.cells[index];
          const old = cell.querySelector('input');
          cell.textContent = old.value;
          let pressed=false;
          cell.addEventListener('mousedown', event=>{pressed=event.button===0&&event.buttons===1&&event.which===1&&event.detail===1});
          cell.addEventListener('dblclick', event=>{if(legacyMouse&&pressed&&event.detail===2&&event.which===1)openEditor()});
          cell.addEventListener('click', () => {if(!legacyMouse)openEditor()});
          function openEditor() {
            let input = document.querySelector('#native-floating-editor');
            if (input?.ownerCell === cell) { input.focus(); return; }
            input?.closest('[data-native-editor]')?.remove();input?.remove();
            input = document.createElement('input');
            input.id = 'native-floating-editor';
            input.ownerCell = cell;
            input.value = cell.textContent;
            const r = cell.getBoundingClientRect();
            input.style.cssText = 'position:fixed;z-index:99999;box-sizing:border-box;left:'+r.left+'px;top:'+(r.top+(misplaced?r.height+20:0))+'px;width:'+r.width+'px;height:'+(short?20:r.height)+'px';
            if(tableEditor){
              const table=document.createElement('table');table.dataset.nativeEditor='true';
              table.style.cssText='position:fixed;z-index:99999;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px';
              table.insertRow().insertCell().append(input);document.body.append(table);
            }else document.body.appendChild(input);
            input.focus();
            input.addEventListener('keydown', event => {
              const commit = index === 0 ? event.keyCode === 13 : event.keyCode === 9;
              if (!commit) return;
              cell.textContent = input.value;
              if (index === 0) row.cells[1].textContent = 'Native Product';
              input.closest('[data-native-editor]')?.remove();input.remove();
            });
          }
        }
      }
    }, { codeToo, misplaced, short, legacyMouse, tableEditor });
  }
  try {
    await open({ toolbar: true }); await load();
    assert.match(await status(), /Preview loaded/);
    assert.equal(await page.locator('#products .code').first().inputValue(), '');
    assert.equal(await el('fill').isDisabled(), true);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.locator('#lc-core-import').locator('dialog').evaluate(e => ({ width: e.getBoundingClientRect().width, viewport: innerWidth }));
      assert.ok(dimensions.width <= dimensions.viewport - 20);
      await page.screenshot({ path: `/tmp/core-quote-pilot-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await fill();
    await page.waitForFunction(() => document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.startsWith('Product lines filled'), { timeout: 15000 });
    assert.match(await status(), /\$13,523\.97/);
    assert.match(await status(), /NOT been applied/);
    assert.equal(await el('fill').isDisabled(), true);
    assert.deepEqual(await page.locator('#products tbody tr').evaluateAll(rows => rows.slice(0,2).map(row => [...row.querySelectorAll('input')].map(i=>i.value))), [
      ['CS10000-9','1','8299.99','15'], ['AS10000','1','1600','0']
    ]);
    await el('verify').click(); assert.match(await status(), /match the source/);
    await page.locator('#lc-core-import').locator('.close').click();
    await page.locator('#products tbody tr').first().locator('input').nth(2).fill('9000');
    await el('open').click();
    await el('verify').click();
    await page.waitForFunction(() => document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.includes('Quote changed'));
    assert.deepEqual(await page.evaluate(() => [saves,approvals,sends,enters]), [0,0,0,0]);

    // Omni can render the page title as a bold/span element rather than a heading.
    for (const titleTag of ['b', 'strong', 'span', 'div', 'h4']) {
      await open({ titleTag, toolbar: true }); await load(); await fill();
      await page.waitForFunction(() => document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.startsWith('Product lines filled'), null, { timeout: 15000 });
      assert.deepEqual(await page.evaluate(() => [saves,approvals,sends,enters]), [0,0,0,0]);
    }

    // Reproduce native selection waiting for legacy Enter fields, Code editor
    // replacement, unlabelled autocomplete results, and accidental form submits.
    for (const mode of [
      {requiresCodeCommit:true},
      {requiresCodeCommit:true,legacyOptions:true,replaceCodeEditor:true,submitOnCommit:true},
      {codeEnterOnly:true}
    ]) {
      await open({toolbar:true}); await load();
      await page.evaluate(flags=>Object.assign(window,flags),mode);
      await fill();
      await page.waitForFunction(() => document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.startsWith('Product lines filled'), null, {timeout:30000});
      assert.deepEqual(await page.evaluate(()=>[saves,approvals,sends]),[0,0,0]);
      assert.ok(await page.evaluate(()=>enters>0));
      if(mode.replaceCodeEditor)assert.equal(await page.evaluate(()=>replacedEditor),true);
      await el('verify').click(); assert.match(await status(), /match the source/);
    }

    // Actual Omni grid cells can render as plain text and use an input attached
    // to body. Numeric edits only commit on legacy Tab, not on blur.
    for (const [codeToo,short,legacyMouse,tableEditor] of [[false,false,false,false], [true,false,false,false], [false,true,false,false], [false,false,true,false], [false,false,false,true], [false,false,true,true]]) {
      await open({toolbar:true}); await load(); await floatingGrid(codeToo,false,short,legacyMouse,tableEditor);
      await fill();
      await page.waitForFunction(() => document.querySelector('#lc-core-import').shadowRoot.querySelector('#status').textContent.startsWith('Product lines filled'), null, {timeout:30000});
      await el('verify').click(); assert.match(await status(), /match the source/);
      assert.equal(await page.locator('#products tbody tr').first().locator('td').nth(4).textContent(), '15');
      assert.equal(await page.locator('#native-floating-editor').count(), 0, 'Every overlay must commit back into the real cell');
      assert.deepEqual(await page.evaluate(()=>[saves,approvals,sends]),[0,0,0]);
    }
    await open(); await load(); await floatingGrid(false, true);
    await fill(); await stopped();
    assert.match(await status(), /CS10000-9 unitprice: Omni did not expose an editor/);
    assert.equal(await page.locator('#products tbody tr').first().locator('td').nth(3).textContent(), '0', 'An adjacent-row floating input must not be edited');

    for (const options of [{heading:'Edit Quote - Existing - NZSO-10000', toolbar:true}, {heading:'New Sales Order'}, {query:'?idOrder=12345'}, {query:'?ConvertQuoteToSalesOrder=Yes'}, {heading:'Existing transaction',extra:'<nav><span>New Quote</span></nav>'}, {heading:'Existing transaction',extra:'<div id="lc-other-tool">New Quote</div>'}, {heading:'Edit Quote - Existing - NZSO-10000', titleTag:'b', toolbar:true, extra:'<span>New Quote</span>'}]) {
      await open(options); await load(); await fill(); await stopped();
      assert.equal(await page.locator('#products .code').first().inputValue(), '');
    }
    await open(); await load();
    await page.locator('#lc-core-import').locator('.close').click();
    await page.locator('#products .code').first().fill('EXISTING');
    await el('open').click();
    await fill(); await stopped(); assert.match(await status(), /not empty/);

    for (const bad of [
      {...fixture,total:fixture.total-200},
      {...fixture,pricesIncludeGst:false},
      {...fixture,lines:[fixture.lines[0],fixture.lines[0]]},
      {...fixture,lines:[{...fixture.lines[0],amount:1}]},
      {...fixture,lines:[{...fixture.lines[0],quantity:'1'}]},
      {...fixture,warnings:[{}]}
    ]) {
      await open(); await load(bad);
      assert.equal(await el('fill').isDisabled(), true);
      assert.doesNotMatch(await status(), /Preview loaded/);
    }
    await open(); await load();
    await page.evaluate(()=>window.wrongVariant=true);
    await fill(); await stopped();
    assert.match(await status(), /Could not confirm/);
    assert.equal(await page.locator('#products tbody tr').first().locator('td').nth(1).textContent(), '');
    assert.equal(await page.evaluate(()=>enters),0,'Do not commit or substitute non-exact results');
    assert.equal(await el('fill').isDisabled(), true, 'Partial imports cannot be rerun');
    await open(); await load();
    await page.evaluate(()=>window.noOptions=true);
    await fill(); await stopped();
    assert.match(await status(), /Check that this exact Core SKU exists in Omni/);
    assert.equal(await page.locator('#products tbody tr').first().locator('td').nth(1).textContent(), '');
    assert.deepEqual(await page.evaluate(()=>[saves,approvals,sends]),[0,0,0]);
    await open(); await load();
    await page.evaluate(()=>window.rejectPrices=true);
    await fill(); await stopped(); assert.match(await status(), /Could not verify unitprice/);

    // Source text is rendered as text, not executable HTML.
    await open(); await load({...fixture,customer:{name:'<img src=x onerror="window.injected=true">'}});
    assert.equal(await page.evaluate(()=>window.injected), undefined);
    assert.equal(await page.locator('#lc-core-import').locator('img').count(), 0);
    await page.addScriptTag({content:source});
    assert.equal(await page.locator('#lc-core-import').count(), 1);
    assert.equal(requests.some(url=>/api|ExternalApi|supabase/i.test(url)), false);
    assert.deepEqual(await page.evaluate(() => [saves,approvals,sends,enters]), [0,0,0,0]);
    console.log('PASS: preview, totals, exact SKUs, legacy Code commit, floating Code/numeric editors, Tab commit, adjacent-row rejection, replacement editors, blocked submit, missing/variant SKUs, heading guards, partial stops, XSS, no save/approve/send/API calls, desktop/mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
