const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-email-helper-compose.user.js', 'utf8');
const stores = {
  wairau:'CeNsNDL_2O3dEBM', penrose:'Cbt0916wRtjmEBM', hamilton:'CdrvKXEiLhd-EBM',
  tauranga:'CfU2pxc8CpPbEBM', christchurch:'CX7Uu_940ID8EBM', whangarei:'CVJ2wVqQrM_TEBM', napier:'CfOE4ZpQEwj2EBM',
};
const names={wairau:'North Shore / Wairau',penrose:'Penrose',hamilton:'Hamilton',tauranga:'Tauranga',christchurch:'Christchurch',whangarei:'Whangarei',napier:'Napier'};
(async () => {
  const response = await fetch('https://living-culture-email-helper.vercel.app');
  assert(response.ok);
  const html = await response.text();
  assert(html.includes('id="body-output"') && html.includes('Review request'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.addInitScript(() => {
      window.sentDrafts=[];window.opened=[];window.copied={};window.prompts=0;
      window.postMessage=(data,target)=>window.sentDrafts.push({data,target});
      window.open=url=>window.opened.push(String(url));
      window.prompt=()=>{window.prompts++;return 'Store review';};
      Object.defineProperty(navigator,'clipboard',{value:{
        async write(items){for(const item of items)for(const type of item.types)window.copied[type]=await(await item.getType(type)).text();},
        async writeText(text){window.copied['text/plain']=text;},
      }});
    });
    // Use the current public helper HTML, but intercept every request and never send mail.
    // Inserting before </body> also tests the userscript's DOMContentLoaded startup ordering.
    await page.route('https://living-culture-email-helper.vercel.app/**',route=>route.request().resourceType()==='document'
      ? route.fulfill({contentType:'text/html',body:html.replace('</body>',()=>`<script>${source.replace(/<\/script/gi,'<\\/script')}</script></body>`)})
      : route.fulfill({status:404,body:''}));
    await page.goto('https://living-culture-email-helper.vercel.app/?theme=omni&embedded=1&first=Nibun&recipient=customer@example.test');
    const select=page.getByRole('combobox',{name:'Google review store'}), body=page.locator('#body-output');
    assert.equal(await select.isVisible(),false,'Ordinary quote email stays unchanged');
    await page.getByRole('button',{name:'Review request',exact:true}).click();
    await select.waitFor();
    assert.equal(await select.locator('option').count(),8);
    assert((await body.inputValue()).includes('[Select a store for the Google review link]'));
    const action=id=>page.evaluate(id=>window.dispatchEvent(new MessageEvent('message',{origin:'https://go.cin7.com',data:{type:'LC_OMNI_EMAIL_ACTION',action:id}})),id);
    await action('cin7');assert.equal(await page.evaluate(()=>sentDrafts.length),0,'No wrong-store email can be copied before selection');
    await action('gmail');assert.equal(await page.evaluate(()=>opened.length),0);
    await page.locator('#save-template').click();assert.equal(await page.evaluate(()=>prompts),0);
    for(const[id,token]of Object.entries(stores)){
      await select.selectOption(id);
      const url=`https://g.page/r/${token}/review`, text=await body.inputValue();
      assert(text.includes(`${names[id]} Google Review`),id);assert(!text.includes('g.page'),'Draft displays the store label instead of the URL');
      await action('cin7');
      const draft=await page.evaluate(()=>sentDrafts.at(-1));
      assert.equal(draft.target,'https://go.cin7.com');assert(draft.data.text.includes(url));assert(draft.data.html.includes(url));
      const anchor=await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html'),a=doc.querySelector('a');return{label:a?.textContent,href:a?.getAttribute('href'),text:doc.body.textContent};},draft.data.html);
      assert.equal(anchor.label,`${names[id]} Google Review`);assert.equal(anchor.href,url);
      assert(!anchor.text.includes('g.page'),'Rendered email hides the raw review URL');
      if(id!=='penrose')assert(!draft.data.html.includes(stores.penrose),'No hard-coded Penrose URL in copied HTML');
    }
    const napier=`https://g.page/r/${stores.napier}/review`;
    await action('copy');
    await page.waitForFunction(url=>window.copied['text/html']?.includes(url),napier);
    assert((await page.evaluate(()=>copied['text/plain'])).includes(napier));
    assert((await page.evaluate(()=>copied['text/plain'])).includes('Napier Google Review: '));
    assert((await page.evaluate(()=>copied['text/html'])).includes(`href="${napier}">Napier Google Review</a>`));
    assert(!(await page.evaluate(()=>copied['text/html'])).includes(stores.penrose));
    await action('gmail');
    assert(new URL(await page.evaluate(()=>opened.at(-1))).searchParams.get('body').includes(napier));
    const edited=(await body.inputValue())+'\n\nThank you for visiting our showroom.';
    await body.fill(edited);await select.selectOption('tauranga');
    assert((await body.inputValue()).endsWith('Thank you for visiting our showroom.'),'Store changes preserve manual wording');
    await page.locator('#refresh-draft').click();
    await page.waitForFunction(()=>document.querySelector('#body-output').value.includes('Tauranga Google Review'));
    await page.getByRole('button',{name:'Purchase thank-you',exact:true}).click();
    assert((await body.inputValue()).includes('Tauranga Google Review'),'Other review-bearing template uses chosen store too');
    await page.getByRole('button',{name:'Quote attached',exact:true}).click();
    assert.equal(await select.isVisible(),false);assert(!(await body.inputValue()).includes('g.page'));
    await page.getByRole('button',{name:'Review request',exact:true}).click();
    await page.locator('#save-template').click();
    await page.getByRole('button',{name:'Saved: Store review',exact:true}).waitFor();
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`/tmp/omni-email-review-stores-${width}.png`,fullPage:true});
    }
    await page.reload();
    await page.getByRole('button',{name:'Saved: Store review',exact:true}).click();
    assert.equal(await select.inputValue(),'','Reopened helper requires an explicit store choice');
    assert((await body.inputValue()).includes('[Select a store for the Google review link]'),'Saved templates cannot silently reuse a previous store');
    await select.selectOption('penrose');
    assert((await body.inputValue()).includes('Penrose Google Review'));
    await action('cin7');
    assert((await page.evaluate(()=>sentDrafts.at(-1).data.html)).includes('href="https://g.page/r/Cbt0916wRtjmEBM/review">Penrose Google Review</a>'));
    assert.deepEqual(errors,[]);
    console.log('PASS: All seven review links, required store selection, actual helper templates, Omni/Gmail/HTML clipboard, refresh, preserved edits, saved templates and desktop/mobile. Public helper HTML mocked locally; no email sent.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
