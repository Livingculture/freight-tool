const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const functions=['extractOrderId','omniHeadingDraft','omniReviewLineItems','omniWorkflowSnapshot'].map(name=>{
  const start=source.indexOf(`  function ${name}(`),next=source.slice(start+1).search(/\n  (?:async )?function /);
  assert(start>=0&&next>0);return source.slice(start,start+next+1);
}).join('\n');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try {
    const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
    await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx?id=99001');
    await page.setContent('<h4>Edit Sales Order - Example Customer - NZSO-99001</h4><table><tr><th>Code</th><th>Product</th><th>Qty Ordered</th><th>Unit Price</th><th>Amount NZD</th><th>BOM Load</th></tr><tr><td>DEMO-TABLE</td><td>Example Table</td><td>1</td><td>100</td><td>100</td><td>Make</td></tr></table>');
    await page.addScriptTag({content:`
      const clean=value=>String(value??'').replace(/\\s+/g,' ').trim(),isVisible=node=>!!node.getBoundingClientRect().width;
      const isOmniPage=()=>true,readOmniControlByLabel=()=>'',readValueNearLabel=()=>'',deriveBranchFromRep=()=>'',readMultilineNearLabel=()=>'';
      const omniPaymentSummary=()=>({}),readMoneyNearLabels=()=>null,omniFullyDispatchedState=()=>false,omniWorkflowStockStatus=()=>null,omniProductStockObservation=()=>null;
      const quoteWorkflowRequestAction=()=>'',omniWorkflowStage=()=> 'New',omniWorkflowFreightDescription=()=> 'Ship from Warehouse',omniWorkflowDate=()=>'';
      const cin7Draft=()=>({product:omniReviewLineItems().map(line=>line.qty+' x '+line.product).join('\\n')});
      ${functions}
    `});
    const parent=await page.evaluate(()=>omniWorkflowSnapshot());
    assert.equal(parent.orderNumber,'NZSO-99001');assert.equal(parent.lineItems[0].sku,'DEMO-TABLE');
    await page.evaluate(()=>{document.querySelector('h4').textContent='Edit Sales Order - Example Customer - NZSO-99001A';const row=document.querySelectorAll('tr')[1];row.children[0].textContent='DEMO-CHAIR';row.children[1].textContent='Example Chair';row.children[2].textContent='2';});
    const child=await page.evaluate(()=>omniWorkflowSnapshot());
    assert.equal(child.orderNumber,'NZSO-99001A');assert.equal(child.customerName,'Example Customer');
    assert.equal(child.lineItems.length,1);assert.equal(child.lineItems[0].sku,'DEMO-CHAIR');assert.equal(child.lineItems[0].qty,2);
    assert(!child.product.includes('Example Table'));assert(!JSON.stringify(child.lineItems).includes('DEMO-TABLE'));
    assert.equal(await page.evaluate(()=>extractOrderId('nzso99001a')),'NZSO-99001A');
    for(const value of ['NZSO-99001AA','NZSO-99001A1','NZSO-99001-1'])assert.equal(await page.evaluate(value=>extractOrderId(value),value),'');
    assert.equal(await page.evaluate(()=>extractOrderId('SFOR12345-1')),'SFOR12345-1','Existing Core parsing is unchanged');
    console.log('PASS: Real Omni heading/cache and snapshot preserve A suffix, current products/quantities, prefix-free identity and invalid-reference guards. Fictional browser data only.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
