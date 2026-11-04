const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ts=require(process.env.TYPESCRIPT_MODULE || path.resolve(__dirname,'../../workflow/node_modules/typescript'));
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const ast=ts.createSourceFile('workflow.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['clean','escapeHtml','isVisible','isHubSpotProductLineItem','extractHubSpotLineItems','extractOmniHubSpotCommercialItems','hubSpotDealReview','submitHubSpotDeal','ensureStyles']);
const declarations=[];function visit(node){if(ts.isFunctionDeclaration(node)&&names.has(node.name?.text))declarations.push(node.getText(ast));ts.forEachChild(node,visit)}visit(ast);
const headers=['Format','Sort','BOM<br>Load','Image','<b>1</b>Code','<b>1</b>Product','Option1','Option2','Option3','Notes','Stock','<b>1</b>Qty<br>Ordered','Qty Dispatch','Account','Unit<br>Price','% Disc','Total<br>Discount','Amount<br>NZD'];
const line=(sku,role,qty,price,total,discount='0',discountAmount='0')=>'<tr>'+['Paren','127',role,'',sku,'Tasman Motorised Freestanding Louvre Roof Aluminium Pergola','6 x 3m','White','','','',qty,'','',price,discount,discountAmount,total].map(value=>'<td>'+value+'</td>').join('')+'</tr>';
const html=(price,total,sku='CS20027-11',qty='1',discount='15',discountAmount='2145.00')=>'<style>td,th{padding:8px}table{border-collapse:collapse}.lc-hs-review-panel{background:white;padding:20px}#lc-hs-modal-overlay{position:fixed;inset:10px;background:#eee;overflow:auto}</style><button id="send">HubSpot Deal</button><table><tr><td><table id="products"><tr>'+headers.map(value=>'<th>'+value+'</th>').join('')+'</tr>'+line(sku,'Make',qty,price,total,discount,discountAmount)+['CS22148','CS22150','CS22156','CS25360','CS23538','CS23540','CS25368'].map((code,index)=>line(code,'Use',index===4?'5':'1',index===0?'25.00':'','')).join('')+'</table></td></tr></table>';
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});let writes=[];
  async function open(price='14,299.99',total='12,154.99',sku,qty,discount,discountAmount){
   await page.setContent(html(price,total,sku,qty,discount,discountAmount));
   await page.addStyleTag({content:'*{box-sizing:border-box}'});
   await page.addScriptTag({content:`window.OVERLAY_ID='lc-site-visit-overlay-v2';${declarations.join('\n')}\nwindow.isOmniPage=()=>true;window.extractOmniTableLineItems=()=>{throw Error('Legacy component reader must not be used')};window.closeHubSpotModal=()=>document.getElementById('lc-hs-modal-overlay')?.remove();`});
  }
  await open('<input type="hidden" value="0"><input style="display:none" value="0"><input value="" style="display:none">14,299.99','<span title="0">12,154.99</span>');
  let items=await page.evaluate(()=>extractHubSpotLineItems());
  assert.equal(items.length,1,'Only the commercial Make line is sent, never Use rows including component-cost rows');
  assert.match(items[0].description,/Omni unit price: NZD 14299.99.*Discount: 15%.*Line discount: NZD 2145.00.*Net line amount: NZD 12154.99/);
  assert.equal(items[0].sku,'CS20027-11');assert.equal(items[0].price,'12154.99');assert.equal(items[0].total,'12154.99');assert.equal(items[0].listPrice,'14299.99');assert.equal(items[0].discountPercent,15);assert.equal(items[0].discountAmount,2145);assert.match(items[0].name,/6 x 3m, White/);
  await page.evaluate(()=>{window.review=hubSpotDealReview({orderId:'NZSO-18151',lineItems:extractHubSpotLineItems()},null)});
  assert.match(await page.locator('.lc-hs-line-review').textContent(),/12154.99 net each.*Omni unit \$14299.99.*15%.*2145.00/);
  assert.equal(await page.locator('[data-line-index]').count(),1);await page.screenshot({path:'/tmp/omni-hubspot-commercial-pricing.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});const panel=await page.locator('.lc-hs-modal-panel').boundingBox();assert(panel.x>=0&&panel.x+panel.width<=390,'Pricing review fits mobile');assert(await page.locator('.lc-hs-line-review-item span').evaluate(node=>node.scrollWidth<=node.clientWidth),'Price and discount text wrap without overlap');await page.screenshot({path:'/tmp/omni-hubspot-commercial-pricing-mobile.png'});await page.setViewportSize({width:1500,height:1000});
  await page.getByRole('button',{name:'Create Deal',exact:true}).click();assert.equal((await page.evaluate(()=>review)).lineItems.length,1);
  await open('14,299.99','24,309.98','CS20027-11(CS22148CS22150)','2');items=await page.evaluate(()=>extractHubSpotLineItems());assert.equal(items[0].price,'12154.99');assert.equal(items[0].quantity,'2');assert.match(items[0].sku,/\(/,'Composite Make SKUs retained');
  await open('0','0');items=await page.evaluate(()=>extractHubSpotLineItems());assert.equal(items[0].price,'0.00','Explicit free commercial items remain valid');
  await open('','');items=await page.evaluate(()=>extractHubSpotLineItems());assert.equal(items[0].price,'');assert.equal(items[0].total,'','Missing is not replaced by zero');
  await page.exposeFunction('captureWrite',options=>writes.push(options));
  await page.addScriptTag({content:`const hubSpotPrerequisites=()=>[],applyHubSpotPrerequisiteGate=()=>{},hubSpotMessage=async(title,lines)=>{window.messages??=[];window.messages.push({title,lines})},hubspotDraft=()=>({orderId:'NZSO-18151',customerName:'Test customer',lineItems:extractHubSpotLineItems()}),extractOrderId=v=>String(v||'').match(/NZSO-\\d+/)?.[0]||'',omniHeadingDraft=()=>({orderId:'NZSO-18151'}),chooseHubSpotLeadSource=async()=>({value:'showroom'}),markHubSpotStepComplete=()=>{throw Error('Missing prices must be blocked before completion')},GM_xmlhttpRequest=options=>captureWrite(options);`});
  await page.evaluate(()=>{window.submission=submitHubSpotDeal(document.querySelector('#send'))});await page.getByRole('button',{name:'Create Deal',exact:true}).click();await page.evaluate(()=>submission);assert.equal(writes.length,0);assert.match((await page.evaluate(()=>messages)).at(-1).lines.join(' '),/no confirmed price/i);
  await open('10','10','CS10000','3');items=await page.evaluate(()=>extractHubSpotLineItems());assert.equal(items[0].price,'3.333','Repeating unit prices use the least precision that reproduces the Omni line cents');
  await open('109.99','461.96','CS27585','6','30','197.98');items=await page.evaluate(()=>extractHubSpotLineItems());assert.equal(items[0].price,'76.993','Discounted Omni totals are reproduced without rejecting valid line rounding');assert.equal(items[0].total,'461.96');
  console.log('PASS: NZSO-18151-shaped grid, Make parent and variants, Use excluded, net discount price, hidden/stale editors ignored, composite SKUs, quantities, explicit free lines, missing-price submission blocked, Omni line rounding reproduced with precise HubSpot unit prices, and review visible. No live requests.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
