const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=fs.readFileSync('userscripts/omni-livingculture-workflow.user.js','utf8');
const extract=name=>{const start=source.indexOf(`  function ${name}(`),next=source.slice(start+1).search(/\n  (?:async )?function /);assert(start>=0&&next>0);return source.slice(start,start+next+1);};
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try {
    const page=await browser.newPage();await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<main></main>'}));
    await page.goto('https://go.cin7.com/Cloud/ShoppingCartAdmin/Orders/OrderDetails.aspx?idOrder=1');
    await page.addScriptTag({content:`const normalizeLabel=value=>String(value||'').replace(/\\s+/g,' ').trim().toLowerCase();const isVisible=()=>false;
      ${['quotePdfTemplateLabel','quotePdfTemplateMatches','findQuotePdfAdminControl','requestCurrentAdminReceiptHref'].map(extract).join('\n')}`});
    const cases=[
      ['PDF','/Cloud/Docs/PDF/?T=Order%205&ID=1',true],
      ['PDF','/Cloud/Docs/PDF/?ID=1&T=Order+5',true],
      ['PDF','/Cloud/Docs/PDF/?T=Receipt&ID=1',true],
      ['Dynamic Invoice','/Cloud/Docs/PDF/?T=Invoice&ID=1',false],
      ['Dynamic Receipt','/Cloud/Docs/PDF/?T=Invoice&ID=1',false],
      ['Dynamic Receipt','/Cloud/Docs/PDF/?T=Order%2050&ID=1',false],
      ['Dynamic Receipt','https://example.test/Cloud/Docs/PDF/?T=Order%205',false],
      ['Dynamic Receipt','javascript:generateReceipt()',true],
    ];
    for(const [label,href,expected] of cases){
      const result=await page.evaluate(({label,href})=>{const a=document.createElement('a');a.textContent=label;a.setAttribute('href',href);return quotePdfTemplateMatches(a,'receipt');},{label,href});
      assert.equal(result,expected,`${label}: ${href}`);
    }
    const relative='/Cloud/Docs/PDF/?T=Order%205&idWebSite=1&UN=demo&ID=123&SID=456';
    const resolved=await page.evaluate(async relative=>{
      const html='<a href="/Cloud/Docs/PDF/?T=Invoice&ID=123">Dynamic Invoice</a><a href="'+relative.replace(/&/g,'&amp;')+'">PDF</a>';
      document.querySelector('main').innerHTML=html;
      window.GM_xmlhttpRequest=options=>options.onload({status:200,responseText:html});
      return {fetched:await requestCurrentAdminReceiptHref(),live:findQuotePdfAdminControl('receipt').getAttribute('href')};
    },relative);
    assert.equal(resolved.fetched,'https://go.cin7.com'+relative,'Keep all native generated parameters without reconstructing the receipt URL');
    assert.equal(resolved.live,relative,'Background live fallback finds an unlabelled Order 5 link, not Dynamic Invoice');
    assert.equal(await page.evaluate(()=>{const a=document.createElement('a');a.textContent='Quote';return quotePdfTemplateMatches(a,'quote');}),true);
    await page.close();
    console.log('PASS: Order 5/Receipt links, encoded spaces, generated parameters, unlabelled/hidden controls, fetched/live matching, Invoice and foreign-link rejection, legacy label and quote compatibility. Network mocked.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
