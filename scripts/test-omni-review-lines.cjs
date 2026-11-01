const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ts=require(path.resolve(__dirname,'../../workflow-speed-fix/node_modules/typescript'));
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const parsed=ts.createSourceFile('workflow.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let reader='';
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='omniReviewLineItems')reader=node.getText(parsed);ts.forEachChild(node,visit)}
visit(parsed);assert(reader);
(async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    await page.setContent('<table><tr><th>BOM<br>Load</th><th><span>1</span>Code</th><th>Product</th><th><span>1</span>Qty<br>Ordered</th><th>Unit<br>Price</th><th>% Disc</th><th>Total<br>Discount</th><th>Amount<br>NZD</th></tr><tr><td>Make</td><td>CS23361-2</td><td>Umbrella</td><td>1</td><td><input value="">2,099.99</td><td>20</td><td>420.00</td><td>1,679.99</td></tr><tr><td>Use</td><td>CS23361</td><td>Fabric</td><td>1</td><td>100</td><td></td><td></td><td>100</td></tr><tr><td></td><td>SHIPPING</td><td>Delivery Fee</td><td>1</td><td>99</td><td>0</td><td>0</td><td>99</td></tr><tr><td></td><td>CS1</td><td>Chair</td><td>2</td><td>50</td><td>10</td><td>10</td><td>90</td></tr><tr><td></td><td>CS1</td><td>Another chair</td><td>1</td><td>50</td><td></td><td></td><td>50</td></tr><tr><td></td><td>FREE</td><td>Free item</td><td>1</td><td>0</td><td></td><td>0</td><td>0</td></tr><tr><td></td><td>CS2</td><td>Missing price</td><td>1</td><td></td><td></td><td></td><td></td></tr><tr><td></td><td>Search...</td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>');
    await page.addScriptTag({content:`const clean=v=>String(v??'').replace(/\\s+/g,' ').trim(),isVisible=e=>e.getBoundingClientRect().width>0;${reader}`});
    const lines=await page.evaluate(()=>omniReviewLineItems());
    assert.equal(lines.length,6,'Commercial Make row and fees retained; Use rows and blank editors excluded');
    assert.equal(lines[0].price,2099.99);assert.equal(lines[0].discountAmount,420);assert.equal(lines[0].total,1679.99);
    assert.equal(lines.filter(line=>line.sku==='CS1').length,2,'Distinct commercial lines must not be deduplicated');
    assert.equal(lines.at(-1).price,null,'Missing price is not invented as zero');
    assert.equal(lines.find(line=>line.sku==='FREE').total,0);
    await page.setContent('<h1>Order still loading</h1>');assert.equal(await page.evaluate(()=>omniReviewLineItems()),null);
    console.log('PASS: Omni commercial line quantities, exact discount amounts, blank editor fallback, fees, duplicate SKUs and Make/Use accounting. Fixture only.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
