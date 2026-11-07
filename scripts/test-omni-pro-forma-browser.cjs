const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const workflow=path.resolve(__dirname,'../../workflow-speed-fix');
const ts=require(path.join(workflow,'node_modules/typescript'));
const {routeFor,req,quote:fixture,lib}=require(path.join(workflow,'tests/omni-pro-forma.cjs'));
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const ast=ts.createSourceFile('workflow.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['proFormaAmount','proFormaQuoteData','openOmniProForma','addOmniProFormaButton','extractOmniHubSpotCommercialItems','findOmniSectionHeading','findOmniSectionField','addressControlsForHeading','omniWorkflowFreightDescription']);
const declarations=[];function visit(node){if(ts.isFunctionDeclaration(node)&&names.has(node.name?.text))declarations.push(node.getText(ast));ts.forEachChild(node,visit);}visit(ast);assert.equal(declarations.length,names.size);
const field=(label,value,id)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${value}"></div>`;
const address=type=>`<section><h2>${type} Address</h2>${['First Name','Last Name','Company',`${type} Address 1`,`${type} Address 2`,`${type} City`,`${type} State/Region`,`${type} Postal Code`,`${type} Country`].map((label,index)=>field(label,['Alex','Example','','12 Sample Street','','Demo City','','0000','New Zealand'][index],type+index)).join('')}</section>`;
const html=`<style>body{font:14px Arial}h2{font-size:18px}.columns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px}.field{display:flex;gap:10px;align-items:center;margin:8px 0}.field label{width:130px}.field input{width:160px;height:26px}table{width:100%;border-collapse:collapse;margin-top:30px}td,th{padding:9px;border:1px solid #ddd}.totals{margin:30px 20px 20px auto;width:500px}.amount{display:flex;justify-content:space-between;align-items:center;margin:8px 0}.charge input{width:90px}.charge input:first-of-type{width:210px}textarea{width:90%}</style><h1>Edit Quote - Alex Example - NZSO-99991</h1><div class="columns"><section><h2>Contact</h2>${field('First Name','Alex','first')}${field('Last Name','Example','last')}${field('Company','','company')}${field('Mobile','000-DEMO','phone')}${field('Email Address','alex@example.test','email')}</section>${address('Delivery')}${address('Billing')}</div><div><button type="button">Quote Memo Info</button><br><textarea>Fictional demonstration only. &lt;script&gt;not executable&lt;/script&gt;</textarea></div><button id="download">Download Quote</button><table><thead><tr>${['BOM Load','Code','Product','Option1','Option2','Option3','1 Qty Ordered','Unit Price','% Disc','Total Discount','Amount NZD'].map(s=>'<th>'+s+'</th>').join('')}</tr></thead><tbody>
<tr><td>Make</td><td>DEMO-01</td><td>Demo Pergola</td><td>Black</td><td></td><td></td><td>1</td><td>1,000.00</td><td>15</td><td>150.00</td><td>850.00</td></tr>
<tr><td>Use</td><td>DEMO-BOM</td><td>Demo component</td><td></td><td></td><td></td><td>2</td><td>0.00</td><td></td><td></td><td>0.00</td></tr>
<tr><td></td><td>DEMO-02</td><td>Demo Installation</td><td></td><td></td><td></td><td>2</td><td>100.00</td><td>0</td><td>0</td><td>200.00</td></tr></tbody></table><div class="totals"><div class="amount charge"><label>Freight</label><input value="Ship from Warehouse"><input id="freight" value="50.00"></div><div class="amount charge"><label>Surcharge</label><input value="Demo charge"><input value="10.00"></div><div class="amount charge"><label>Discount</label><input value="Demo discount"><input value="20.00"></div><div class="amount"><span>Total Tax 15%</span><b>142.17</b></div><div class="amount"><span>Total:</span><b>1,090.00 NZD</b></div></div>`;
(async()=>{
 const browser=await chromium.launch();let allowed=true;
 try{
 const context=await browser.newContext({viewport:{width:1550,height:1200}}),errors=[],writes=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('https://go.cin7.com/**',route=>{if(route.request().method()!=='GET')writes.push(route.request().url());return route.fulfill({body:html,contentType:'text/html'});});
 await context.route('https://workflow.example.test/**',async route=>{
   const request=route.request(),api=routeFor({allowed});
   const response=request.method()==='POST'?await api.POST(req(request.url(),request.postDataJSON())):await api.GET(req(request.url()));
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 const page=await context.newPage();await page.goto('https://go.cin7.com/Cloud/Transactions/Quote.aspx');
 await page.addScriptTag({content:`const clean=v=>String(v??'').replace(/\\s+/g,' ').trim(),cleanMultiline=v=>String(v??'').trim();const normalizeLabel=v=>clean(v).toLowerCase().replace(/[:*]/g,'');const isVisible=e=>Boolean(e&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height);const isOmniPage=()=>true;const omniHeadingDraft=()=>({documentType:'quote',orderId:'NZSO-99991'}),omniWorkflowDate=()=> '07-11-2026',omniSalesRep=()=> 'Demo Advisor';const WORKFLOW_PLANNER_URL='https://workflow.example.test',QUOTE_PDF_BUTTON_ID='download';const styleInlineButton=(b,c)=>{b.style.background=c;b.style.color='white';b.style.padding='10px'};const placeOmniActionButton=(b,a)=>a.after(b);const scheduleButtonPass=()=>addOmniProFormaButton();const GM_xmlhttpRequest=async options=>{const allowed=await window.testAccess();options.onload({status:allowed?200:403,responseText:JSON.stringify({allowed})});};${declarations.join('\n')}`});
 await page.exposeFunction('testAccess',()=>allowed);
 const data=await page.evaluate(()=>proFormaQuoteData());
 assert.equal(data.total,1090);assert.equal(data.tax,142.17);assert.equal(data.freight,50);assert.equal(data.surcharge,10);assert.equal(data.discount,20);
 assert.equal(data.lines.length,2);assert.equal(data.lines[0].total,'850.00');assert.match(data.lines[0].name,/Black/);assert.equal(data.email,'alex@example.test');assert.equal(data.phone,'000-DEMO');assert.match(data.comments,/Fictional/);assert.equal(data.customer[0],'Alex Example');lib.validateProForma(data);
 await page.evaluate(()=>addOmniProFormaButton());await page.getByRole('button',{name:'Pro Forma Invoice',exact:true}).waitFor();
 const popupEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'Pro Forma Invoice',exact:true}).click();const preview=await popupEvent;
 await preview.getByRole('heading',{name:'PRO FORMA INVOICE',exact:true}).waitFor();
 await preview.getByRole('button',{name:'Print / Save as PDF'}).waitFor();
 assert(await preview.getByRole('button',{name:'Print / Save as PDF'}).isEnabled());assert.match(await preview.locator('body').innerText(),/Not a tax invoice/);
 assert.equal(await preview.locator('tbody tr').count(),2);assert.match(await preview.locator('.grand').innerText(),/1,090.00/);
 assert(!await preview.locator('body').innerText().then(s=>s.includes('DEMO-BOM')));
 await preview.locator('.brand img').evaluate(img=>img.decode());
 await preview.screenshot({path:'/tmp/omni-pro-forma-desktop.png',fullPage:true});
 await preview.pdf({path:'/tmp/omni-pro-forma-example.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
  const parsePdf=require(path.join(workflow,'node_modules/pdf-parse'));
  const shortPdf=await parsePdf(fs.readFileSync('/tmp/omni-pro-forma-example.pdf'));
  assert.equal(shortPdf.numpages,1,'A short quote fits on one A4 page');assert.match(shortPdf.text,/Not a tax invoice/);assert.match(shortPdf.text,/1,090.00/);
 await preview.setViewportSize({width:390,height:844});await preview.screenshot({path:'/tmp/omni-pro-forma-mobile.png',fullPage:true});
 assert(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
 // Revocation must hide the Omni button and reject a fresh generation request.
 allowed=false;await page.evaluate(()=>{addOmniProFormaButton.checkedAt=0;addOmniProFormaButton();});await page.waitForFunction(()=>!document.getElementById('lc-omni-pro-forma-button'));
 const revoked=await preview.evaluate(async()=>{const response=await fetch('/omni-pro-forma',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return response.status;});assert.equal(revoked,403);
 // Render a long fictional quote to check repeated print headers and page breaks.
 const long={...fixture,lines:Array.from({length:35},(_,i)=>({...fixture.lines[0],sku:'DEMO-'+i,name:'Fictional product '+i,total:'10.00',listPrice:'10.00',discountPercent:0,discountAmount:0})),total:390,tax:50.87};
 const longDoc=lib.renderProForma(lib.validateProForma(long));await preview.setViewportSize({width:1100,height:1200});await preview.evaluate(markup=>{document.getElementById('document').innerHTML=markup},longDoc);
 await preview.pdf({path:'/tmp/omni-pro-forma-multipage.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
  const longPdf=await parsePdf(fs.readFileSync('/tmp/omni-pro-forma-multipage.pdf'));assert(longPdf.numpages>=2);assert(longPdf.text.split('SKU').length-1>=2,'Product headings repeat on later pages');
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
 console.log('PASS: quote-screen extraction, Make/Use BOM handling, discounts/charges/GST, addresses, escaped memo, authorised popup handshake and preview, print PDFs, mobile framing and permission revocation. Fictional data only; no Omni writes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
