const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const source = fs.readFileSync('userscripts/omni-email-helper-compose.user.js','utf8');
const stores = [
  ['North Shore / Wairau','CeNsNDL_2O3dEBM'],['Penrose','Cbt0916wRtjmEBM'],['Hamilton','CdrvKXEiLhd-EBM'],
  ['Tauranga','CfU2pxc8CpPbEBM'],['Christchurch','CX7Uu_940ID8EBM'],['Whangarei','CVJ2wVqQrM_TEBM'],['Napier','CfOE4ZpQEwj2EBM'],
];
(async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://mail.google.com/**',route=>route.fulfill({contentType:'text/html',body:'<style>body{font:16px Arial;padding:24px}section{margin:18px 0;border:1px solid #ccc;padding:18px}div[contenteditable]{min-height:70px;white-space:pre-wrap}a{color:#0655c0}input{display:block;margin:8px 0;width:80%;padding:8px}</style><main></main>'}));
    await page.goto('https://mail.google.com/mail/u/0/#inbox');
    await page.addScriptTag({content:source});
    const original=await page.evaluate(stores=>{
      window.inputs=0;window.sent=0;window.sigClicks=0;
      const root=document.querySelector('main');
      for(const[name,token]of stores){
        const section=document.createElement('section');section.setAttribute('role','dialog');
        const subject=document.createElement('input');subject.name='subjectbox';subject.value='NZSO-18151 - Thank you for your purchase';
        const to=document.createElement('input');to.name='to';to.value='customer@example.test';
        const body=document.createElement('div');body.contentEditable='true';body.setAttribute('role','textbox');body.setAttribute('aria-label','Message Body');
        const review=`${name} Google Review: https://g.page/r/${token}/review`;
        body.innerHTML='<div>Hi Nibun,</div><div>Thank you for your purchase.</div>';
        const line=document.createElement('div');line.textContent=review;body.appendChild(line);
        const signature=document.createElement('div');signature.className='gmail_signature';signature.innerHTML='<b>Many thanks,</b><br>Living Culture';signature.addEventListener('click',()=>window.sigClicks++);body.appendChild(signature);
        const quote=document.createElement('blockquote');quote.className='gmail_quote';quote.textContent=review;body.appendChild(quote);
        const send=document.createElement('button');send.textContent='Send';send.onclick=()=>window.sent++;
        section.append(to,subject,body,send);root.appendChild(section);
        body.addEventListener('input',()=>window.inputs++);
      }
      const direct=document.createElement('div');direct.id='direct';direct.contentEditable='true';direct.setAttribute('role','textbox');
      direct.textContent='Hi Nibun,\n\nTauranga Google Review: https://g.page/r/CfU2pxc8CpPbEBM/review\n\nMany thanks,';root.appendChild(direct);
      const auto=document.createElement('div');auto.id='auto';auto.contentEditable='true';auto.setAttribute('role','textbox');
      auto.innerHTML='Hi Nibun,\n\nPenrose Google Review: <a href="https://g.page/r/Cbt0916wRtjmEBM/review">https://g.page/r/Cbt0916wRtjmEBM/review</a>\n\nMany thanks,';root.appendChild(auto);
      const wrong=document.createElement('div');wrong.id='wrong';wrong.contentEditable='true';wrong.setAttribute('role','textbox');
      wrong.innerHTML='<div>Penrose Google Review: https://example.test/review</div><div>Hamilton Google Review: https://g.page/r/Cbt0916wRtjmEBM/review</div><div contenteditable="false">Penrose Google Review: https://g.page/r/Cbt0916wRtjmEBM/review</div>';root.appendChild(wrong);
      const hidden=document.createElement('div');hidden.id='hidden';hidden.contentEditable='true';hidden.setAttribute('role','textbox');hidden.style.display='none';hidden.textContent=direct.textContent;root.appendChild(hidden);
      const read=document.createElement('div');read.id='read';read.textContent='Penrose Google Review: https://g.page/r/Cbt0916wRtjmEBM/review';root.appendChild(read);
      window.signatureNode=root.querySelector('.gmail_signature');
      return{wrong:wrong.innerHTML,hidden:hidden.innerHTML,read:read.innerHTML,signature:window.signatureNode.outerHTML};
    },stores);
    await page.waitForFunction(()=>document.querySelectorAll('section [contenteditable="true"] > div > a').length===7);
    for(let i=0;i<stores.length;i++){
      const[name,token]=stores[i],body=page.locator('section').nth(i).getByRole('textbox',{name:'Message Body'}),a=body.locator('div > a').first();
      assert.equal(await a.textContent(),`${name} Google Review`);assert.equal(await a.getAttribute('href'),`https://g.page/r/${token}/review`);
      assert((await body.locator('.gmail_quote').textContent()).includes('https://g.page/'),'Quoted content is untouched');
      assert.equal(await page.locator('section').nth(i).locator('input[name="to"]').inputValue(),'customer@example.test');
    }
    assert.equal(await page.locator('#direct a').textContent(),'Tauranga Google Review');
    assert.equal(await page.locator('#auto a').textContent(),'Penrose Google Review');
    assert.equal(await page.locator('#wrong').innerHTML(),original.wrong);
    assert.equal(await page.locator('#hidden').innerHTML(),original.hidden);
    assert.equal(await page.locator('#read').innerHTML(),original.read);
    assert.equal(await page.evaluate(()=>signatureNode.outerHTML),original.signature);await page.locator('.gmail_signature').first().click();
    assert.equal(await page.evaluate(()=>sigClicks),1,'Signature nodes and their handlers are preserved');
    assert.equal(await page.evaluate(()=>sent),0,'Never click Send');
    const inputs=await page.evaluate(()=>window.inputs);assert.equal(inputs,7,'Each changed compose body is notified once');
    await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>window.inputs),inputs,'Formatting is idempotent');
    await page.addScriptTag({content:source});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.inputs),inputs,'Duplicate script installation is harmless');
    await page.evaluate(()=>{const chosen=document.querySelectorAll('section')[3];for(const node of document.querySelectorAll('section'))if(node!==chosen)node.remove();for(const id of ['direct','auto','wrong','hidden','read'])document.getElementById(id).remove();});
    for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:`/tmp/gmail-review-link-${width}.png`,fullPage:true});}
    assert.deepEqual(errors,[]);
    console.log('PASS: Gmail draft review hyperlinks for all seven stores; plain/newline and Gmail auto-linked bodies, delayed/multiple composers, preserved signatures/quoted content/recipients, rejected mismatches and no Send. Gmail DOM fixtures only.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
