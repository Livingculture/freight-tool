const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=fs.readFileSync('userscripts/luxi-living-au-all-in-one.user.js','utf8');
assert(!/^\/\/ @match.*go\.cin7\.com/m.test(source));
assert(!/@resource|livingculture\.co\.nz|living-culture-workflow|qyapi|supabase|NZSO|0800/.test(source),'AU bundle must have no NZ resources, defaults or integrations');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || undefined});
 try{
  for(const scenario of ['luxi','other-account','unknown-account','omni','order-tab']){
   const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<header><select id="company" style="position:fixed;right:20px;top:20px;width:220px;height:32px">
    <option>${scenario==='other-account'?'Another Company Pty Ltd':scenario==='unknown-account'?'Choose account':'Luxi Living Pty Ltd'}</option><option>Another Company Pty Ltd</option><option>Luxi Living Pty Ltd</option></select></header>
    <div role="listbox" style="position:fixed;right:20px;top:70px"><span role="option"><a>Luxi Living Pty Ltd</a></span></div>
    <main style="margin-top:200px"><section><h2>QUOTE</h2><label for="sale-comments">Comments</label><textarea id="sale-comments"></textarea><label for="quote-memo">Quote Memo</label><textarea id="quote-memo"></textarea><button id="save">Save</button></section></main>`}));
   await page.goto(scenario==='omni'?'https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx':'https://inventory.dearsystems.com/Sale#'+(scenario==='order-tab'?'tabOrder':'tabQuote'));
   await page.evaluate(()=>{
    window.settings={'lc-install-fee-data-v4':'ignore NZ data'};window.requests=[];window.saved=0;document.getElementById('save').onclick=()=>window.saved++;
    window.GM_getValue=(key,fallback)=>window.settings[key] ?? fallback;window.GM_setValue=(key,value)=>window.settings[key]=value;
    window.GM_xmlhttpRequest=options=>{
     window.requests.push(options.url);let cancelled=false;
     setTimeout(()=>{if(!cancelled)options.onload({status:200,responseText:options.url.includes('/document/')?
      '<h1>Information on Quotes</h1><p>General aftercare note</p><p>Custom Made Terms and Conditions. (Installation required quotes)</p><p>Fictional Australian terms</p><p>Instock Items (Attach to the bottom of all quotes)</p><p>Fictional stock wording</p>':options.url.includes('au-text-example')?'Title,Text\r\nExample,"First line, quoted\nSecond line"':options.url.includes('au-product-example')?
      'SKU,Product,Price,Unit,Notes\nAU-DEMO,Example product,123.45,each,"<img src=x onerror=alert(1)>"':
      'ProductCode,Name,PriceTier1\nAU-SERVICE,Example Australian service,0'});},20);
     return {abort(){cancelled=true;}};
    };
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copied=text}});
   });
   await page.addScriptTag({content:source});
   const bar=page.locator('#luxi-au-quote-tools');
   if(scenario!=='luxi'){
    assert.equal(await bar.count(),0,scenario);assert.deepEqual(await page.evaluate(()=>window.requests),[]);await page.close();continue;
   }
   await bar.waitFor();assert.equal(await page.evaluate(()=>window.requests.length),0,'No external calls before a configured module is opened');
   await bar.getByRole('button',{name:'Install Fees',exact:true}).click();
   await page.getByText('AU-SERVICE',{exact:true}).waitFor();
   assert(!new URL((await page.evaluate(()=>window.requests))[0]).searchParams.has('gid'),'Do not invent a tab ID for the original Excel workbook');
   assert.equal(await page.getByRole('cell',{name:'0',exact:true}).count(),1,'Preserve zero-priced source entries');
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await bar.getByRole('button',{name:'Quote Memo',exact:true}).click();
   await page.getByText('Fictional Australian terms',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Copy',exact:true}).count(),3,'Separate memo sections from source document');
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await bar.getByRole('button',{name:'Custom Products',exact:true}).click();
   assert.match(await page.locator('#luxi-au-quote-dialog').locator('iframe').getAttribute('src'),/^https:\/\/drive.google.com\/file\/d\/.+\/preview$/);
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await bar.getByRole('button',{name:'Custom Comments',exact:true}).click();
   await page.getByLabel('Product',{exact:true}).fill('Fictional custom product');
   await page.getByLabel('Width (mm)',{exact:true}).fill('2500');
   assert.equal(await page.getByLabel('Comment preview',{exact:true}).inputValue(),'Product: Fictional custom product\nWidth (mm): 2500');
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await bar.getByRole('button',{name:'Promo Summary',exact:true}).click();
   await page.getByText('The Australian source has not been configured yet.').waitFor();
   await page.getByRole('button',{name:'Set Australian source'}).click();
   await page.getByLabel('Custom Comments',{exact:true}).fill('https://docs.google.com/spreadsheets/d/au-text-example/edit#gid=12');
   await page.getByLabel('Install Fees',{exact:true}).fill('https://docs.google.com/spreadsheets/d/au-product-example/edit?gid=34');
   await page.getByRole('button',{name:'Save Australian sources'}).click();
   await page.getByText('Australian sources saved.').waitFor();
   const settings=await page.evaluate(()=>window.settings);
   assert.equal(settings['lc-install-fee-data-v4'],'ignore NZ data');assert(settings['luxi-au-core-settings-v1']);
   await page.getByLabel('New Products',{exact:true}).fill('https://example.test/private');
   await page.getByRole('button',{name:'Save Australian sources'}).click();await page.getByText('Use a Google Sheets, Google Docs or Drive source link.').waitFor();
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await bar.getByRole('button',{name:'Custom Comments',exact:true}).click();
   await page.getByText('Australian source loaded.').waitFor();
   await page.getByRole('button',{name:'Fill field',exact:true}).click();
   assert.equal(await page.locator('#sale-comments').inputValue(),'First line, quoted\nSecond line');
   assert.equal(await page.locator('#quote-memo').inputValue(),'');
   assert.equal(await page.evaluate(()=>window.saved),0,'Filling text does not save or authorise a quote');
   await page.getByRole('button',{name:'Close',exact:true}).click();
   await bar.getByRole('button',{name:'Install Fees',exact:true}).click();
   await page.getByText('AU-DEMO',{exact:true}).waitFor();
   assert.equal(await page.locator('#luxi-au-quote-dialog').locator('img').count(),0,'Source text is never rendered as executable HTML');
   await page.getByRole('button',{name:'Copy SKU',exact:true}).click();assert.equal(await page.evaluate(()=>window.copied),'AU-DEMO');
   assert((await page.evaluate(()=>window.requests)).every(url=>url.startsWith('https://docs.google.com/')));
   await page.locator('#company').selectOption({index:1});await bar.waitFor({state:'detached'});
   assert.equal(await page.locator('#luxi-au-quote-dialog').count(),0,'Switching company removes both toolbar and open data');
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS Luxi AU: separate account/route/settings, no NZ resources or fallback data, configured sources only, CSV quoting, text fill, manual SKU copy, safe rendering and account switching.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
