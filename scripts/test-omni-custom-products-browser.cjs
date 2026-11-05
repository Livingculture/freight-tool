const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync('userscripts/omni-custom-product-helper.user.js','utf8');
const data=fs.readFileSync('userscripts/cin7-custom-product-helper.user.js','utf8');
const raw=data.match(/const RAW_DATA = `([\s\S]*?)`;\s*\n/)[1];
(async()=>{
 const browser=await chromium.launch();
 try{
  for(const scenario of ['offline','google-denied','google-live','google-html','storage-blocked','malformed-cache','merged-export','partial-csv','poisoned-cache']){
   const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial;padding:20px}td,th{min-width:140px;height:36px;text-align:left}button{height:36px}#suggestions{background:white;border:1px solid #888;padding:8px;z-index:100}</style><h1>New Quote</h1><button id="lc-omni-install-fee-button">Install Fees</button><table><thead><tr><th>Code</th><th>Product</th></tr></thead><tbody><tr><td id="code-cell">Search...</td><td id="product-cell"></td></tr></tbody></table><button>Add a new line</button>'}));
   await page.goto('https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx');
   await page.evaluate(({scenario,data,raw})=>{
    localStorage.setItem('lc-omni-custom-product-data-v1','Name,CS code,Price,Memo\nFuji Manual,SK-00396,$145,Old cached item');
    if(scenario==='malformed-cache')localStorage.setItem('lc-omni-custom-product-data-v2','<!doctype html><html>Sign in</html>');
    const broken='Name\nCS code\nPrice/per m2\nMemo\nProjection) = 6 post for freestanding model & 3 posts for wall Mounted model Aluminium Shutter Sliding Door\nSK-00391\n$590\nAtlantic Side Post\nCS22253\nCharcoal Middle Post\nCS23434';
    if(scenario==='poisoned-cache')localStorage.setItem('lc-omni-custom-product-data-v2',broken);
    if(scenario==='storage-blocked'){
     Storage.prototype.getItem=function(){throw Error('Storage disabled')};Storage.prototype.setItem=function(){throw Error('Storage disabled')};
    }
    window.requests=[];
    window.GM_getResourceText=name=>{if(name!=='customProductData')throw Error(name);return data};
    window.GM_xmlhttpRequest=options=>{
     requests.push(options.url);
     setTimeout(()=>{
      const google=options.url.startsWith('https://docs.google.com/');
      if(['offline','storage-blocked','malformed-cache'].includes(scenario)){options.onerror();return;}
      if(google){
       if(scenario==='google-live')options.onload({status:200,responseText:raw});
       else if(scenario==='merged-export')options.onload({status:200,responseText:broken});
       else if(scenario==='partial-csv')options.onload({status:200,responseText:'Name,CS code,Price,Memo\nCharcoal Middle Post,CS23434,,Missing row boundaries'});
       else if(scenario==='google-html')options.onload({status:200,responseText:'<!doctype html><html>Sign in</html>'});
       else options.onload({status:401,responseText:'Sign in'});
      }else options.onload({status:200,responseText:data});
     },25);
    };
    document.getElementById('code-cell').addEventListener('click',event=>{
     if(event.target.tagName==='INPUT')return;
     const cell=event.currentTarget;cell.replaceChildren();const input=document.createElement('input');input.id='sku-input';cell.append(input);input.focus();
     input.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&document.getElementById('suggestions')){
       cell.textContent=input.value;document.getElementById('product-cell').textContent='Fuji Manual';document.getElementById('suggestions').remove();
      }
     });
     input.addEventListener('input',()=>{
      document.getElementById('suggestions')?.remove();
      const choices=document.createElement('ul');choices.id='suggestions';choices.style.position='absolute';const r=input.getBoundingClientRect();choices.style.left=r.left+'px';choices.style.top=r.bottom+'px';
      const option=document.createElement('li');option.setAttribute('role','option');option.textContent=input.value+' Fuji Manual';
      option.addEventListener('click',()=>{cell.textContent=input.value;document.getElementById('product-cell').textContent='Fuji Manual';choices.remove()});choices.append(option);document.body.append(choices);
     });
    });
   },{scenario,data,raw});
   await page.addScriptTag({content:source});
   await page.getByRole('button',{name:'Custom Products',exact:true}).click();
   const root=page.locator('#lc-omni-custom-product-root');
   await root.locator('#count').filter({hasText:'55 results'}).waitFor();
   const status='Verified reference list (6 Nov 2026) - bundled with this script';
   await root.locator('#status').filter({hasText:status}).waitFor();
   await page.waitForTimeout(100);
   assert.deepEqual(await page.evaluate(()=>requests),[], 'Unstructured remote data is never requested');
   assert.equal(await root.locator('button[data-code="SK-00396"]').count(),0,'Old cached awning is never offered');
   assert.equal(await root.locator('button[data-code="SK-01530"]').count(),1);
   assert.equal(await root.locator('button[data-code="CS22824"]').locator('xpath=../..').locator('.price').innerText(),'$299.99');
   const posts=await root.locator('#rows tr').evaluateAll(rows=>{let heading='';return rows.flatMap(row=>{if(row.classList.contains('group')){heading=row.innerText;return []}return heading==='POSTS'?[row.innerText]:[]})});
   assert.equal(posts.length,18,'All 18 post colour variants appear');
   assert(posts.every(row=>/Black|White|Charcoal/.test(row)&&/\$(?:299|349)\.99/.test(row)));
   const shutter=root.locator('button[data-code="SK-00391"]').locator('xpath=../..');
   assert.equal(await shutter.locator('strong').innerText(),'Aluminium Shutter Sliding Door');
   assert(!posts.some(row=>row.includes('SK-00391')), 'Door does not appear under posts');
   await root.getByPlaceholder('Search product, SKU or notes').fill('Rainier Pro');
   await root.locator('#count').filter({hasText:'1 result'}).waitFor();
   assert.match(await root.locator('#rows').innerText(),/SK-01533/);assert.match(await root.locator('#rows').innerText(),/\$850/);assert.match(await root.locator('#rows').innerText(),/3.5m projection/);
   assert.match(await root.locator('.group').innerText(),/AWNINGS/);
   if(scenario==='offline'){
    await page.screenshot({path:'/tmp/custom-products-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    const panel=root.locator('.panel');assert(await panel.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}));
    assert(await root.locator('.wrap').evaluate(node=>node.scrollWidth<=node.clientWidth),'Price and SKU fit within mobile table');
    await page.screenshot({path:'/tmp/custom-products-mobile.png'});
    await root.getByPlaceholder('Search product, SKU or notes').fill('SK-01530');
    await root.locator('button[data-code="SK-01530"]').click();
    await page.waitForFunction(()=>document.getElementById('code-cell').textContent==='SK-01530');
    assert.equal(await page.locator('#product-cell').innerText(),'Fuji Manual','Add selects the current SKU, not a retired code');
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: 55 verified items, all 18 coloured/priced posts, uncontaminated door category, no remote overwrite, poisoned-cache exclusion, search, SKU insertion and desktop/mobile framing. Omni mocked; no saved records changed.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
