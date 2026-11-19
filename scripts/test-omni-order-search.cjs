const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
function extract(name){const start=source.indexOf(`  function ${name}(`);assert(start>=0);let brace=source.indexOf('{',start),depth=0;for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error(name);}
(async()=>{const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage();
  await page.route('https://go.cin7.com/**',route=>route.fulfill({contentType:'text/html',body:'<div class="toolbar"><input placeholder="Search"><button>Search</button><button id="reset">Reset</button></div>'}));
  await page.goto('https://go.cin7.com/Cloud/ShoppingCartAdmin/Orders/OrdersList.aspx');
  await page.addScriptTag({content:`const clean=v=>String(v||'').trim();const normalizeLabel=v=>clean(v).toLowerCase();const isVisible=()=>true;const OMNI_ORDER_SEARCH_API_URL='https://workflow.test/api/omni/order-search';let request;const GM_xmlhttpRequest=o=>request=o;${extract('installOmniOrderSearch')}installOmniOrderSearch();`});
  const form=page.locator('#lc-omni-order-search');await form.waitFor();
  assert.equal(await page.locator('#reset + #lc-omni-order-search').count(),1,'Search is directly beside Reset');
  await form.locator('input').fill('18445a');await form.locator('button').click();
  assert.equal(await page.evaluate(()=>new URL(request.url).searchParams.get('number')),'NZSO-18445A');
  await page.evaluate(()=>request.onload({status:404,responseText:JSON.stringify({error:'No sales order or quote with that number was found in your branch.'})}));
  assert.match(await form.getByRole('status').textContent(),/your branch/);
  await form.locator('input').fill('wrong');await form.locator('button').click();
  assert.match(await form.getByRole('status').textContent(),/valid NZSO/);
  console.log('PASS: branch-aware Omni document search is beside Reset, normalizes NZSO input and shows safe errors.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
