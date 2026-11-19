const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const source=fs.readFileSync('userscripts/cin7-dynamic-receipt-download-test.user.js','utf8');
(async()=>{const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();
  await page.route('https://go.cin7.com/**',route=>{const url=new URL(route.request().url());const receipt=url.searchParams.get('T')==='Receipt';route.fulfill({contentType:'text/html',body:receipt?'<button id="native">Download</button>':'<a id="receipt" href="/Cloud/Docs/PDF/?T=Receipt&ID=363">Dynamic Receipt</a><a href="/Cloud/Docs/PDF/?T=Invoice&ID=363">Dynamic Invoice</a>'});});
  await page.addInitScript(()=>{window.testClicks=0;document.addEventListener('click',event=>{if(event.target?.id==='native'){event.preventDefault();window.testClicks+=1;}},false);});
  await page.goto('https://go.cin7.com/Cloud/ShoppingCartAdmin/Orders/OrderDetail.aspx?idOrder=1'); await page.addScriptTag({content:source});
  await page.locator('#receipt').click(); await page.waitForURL(/T=Receipt/); await page.addScriptTag({content:source}); await page.waitForFunction(()=>window.testClicks===1);
  assert.equal(await page.locator('#lc-receipt-test-status').getAttribute('data-tone'),'success');
  assert.match(await page.locator('#lc-receipt-test-status').textContent(),/Starting Cin7/);
  console.log('PASS: standalone receipt test follows Dynamic Receipt and activates Cin7 native Download without selecting Dynamic Invoice.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
