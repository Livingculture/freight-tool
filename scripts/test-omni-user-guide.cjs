const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'../public');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'omni-user-guide/source-manifest.json'),'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceText = () => [...document.querySelectorAll('.source-body')].map(root => {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),parts=[];
  while(walker.nextNode()){const value=walker.currentNode.textContent.replace(/\s+/g,' ').trim();if(value)parts.push(value);}
  return parts.join(' ');
}).filter(Boolean).join(' ');

(async()=>{
  for(const image of manifest.images){const bytes=fs.readFileSync(path.join(root,'omni-user-guide',image.path));assert.equal(hash(bytes),image.sha256);assert.equal(bytes.length,image.bytes);}
  const browser=await chromium.launch();
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1050}}),errors=[],requests=[];
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());requests.push(url.origin);
      if(url.origin==='https://go.cin7.com')return route.fulfill({contentType:'text/html',body:'<iframe title="Staff guide" src="https://guide.test/omni-help.html" style="width:100%;height:900px;border:0"></iframe><script>window.closes=0;window.addEventListener("message",e=>{if(e.data?.type==="lc-staff-help-close")window.closes++})</script>'});
      if(url.origin!=='https://guide.test')throw Error('Unexpected external request: '+url.origin);
      const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));assert(file.startsWith(root+path.sep));
      if(!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
      const type={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'}[path.extname(file)]||'application/octet-stream';
      await route.fulfill({body:fs.readFileSync(file),contentType:type});
    });
    const page=await context.newPage();await page.goto('https://guide.test/omni-user-guide.html');
    assert.equal(await page.locator('.topic').count(),manifest.headings.length);
    assert.equal(await page.locator('#guide-index a').count(),74);
    assert.equal(await page.locator('.source-body img').count(),140);
    assert.equal(hash(await page.evaluate(sourceText)),manifest.textSha256,'Every source text node is retained in order');
    assert.deepEqual(await page.locator('.source-body img').evaluateAll(images=>images.map(image=>image.getAttribute('src').replace('omni-user-guide/',''))),manifest.imageOrder);
    await page.locator('.source-body img').evaluateAll(images=>Promise.all(images.map(image=>{image.loading='eager';return image.decode()})));
    assert(await page.locator('.source-body img').evaluateAll(images=>images.every(img=>img.naturalWidth>0)));
    const pixels=await page.locator('.source-body img').first().evaluate(image=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let coloured=0;for(let i=0;i<data.length;i+=4)if(data[i+3]&&Math.min(data[i],data[i+1],data[i+2])<220)coloured++;return coloured;});
    assert(pixels>100,'Source screenshot renders actual nonblank pixels');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'/tmp/omni-manual-desktop.png'});
    const input=page.getByRole('searchbox',{name:'Search manual'});
    await input.fill('backorder');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('found'));
    assert(await page.locator('.topic:not([hidden])').count()>0);assert(await page.locator('.topic:not([hidden])').count()<74);assert(await page.locator('.source-body mark').count()>0);
    await page.screenshot({path:'/tmp/omni-manual-search.png'});
    await page.getByRole('button',{name:'Clear',exact:true}).click();assert.equal(hash(await page.evaluate(sourceText)),manifest.textSha256,'Clearing highlights preserves exact source text');
    await page.evaluate(()=>{window.printCount=0;window.print=()=>printCount++;});await page.getByRole('button',{name:'Print',exact:true}).click();
    await page.waitForFunction(()=>window.printCount===1);assert(await page.locator('.source-body img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)),'Print waits for every screenshot');
    await input.fill('no-such-topic-xyz');await page.getByText('No matching topics.',{exact:true}).waitFor();
    assert.equal(await page.locator('#guide-index li:not([hidden])').count(),0);
    await page.emulateMedia({media:'print'});assert.equal(await page.locator('.topic:visible').count(),74,'Print retains the full manual even during search');await page.emulateMedia({media:'screen'});
    await page.getByRole('button',{name:'Clear',exact:true}).click();
    await page.locator('#guide-index').getByRole('link',{name:'Create a Backorder',exact:true}).click();
    await page.waitForFunction(()=>location.hash==='#h.m8oka71v6zqa');
    const bounds=await page.locator('[id="h.m8oka71v6zqa"]').boundingBox(),header=await page.locator('.guide-header').boundingBox();assert(bounds.y>=header.y+header.height-2,'Anchor target is not covered by the sticky header');
    await page.goto('https://guide.test/omni-user-guide.html#h.y7anizi79b8p');await page.waitForFunction(()=>location.hash==='#h.y7anizi79b8p');
    assert(await page.locator('[id="h.y7anizi79b8p"]').isVisible());
    await page.goto('https://guide.test/omni-user-guide.html');
    await page.locator('.screenshot').first().click();await page.getByRole('dialog',{name:'Screenshot',exact:true}).waitFor();await page.locator('#enlarged-image').evaluate(image=>image.decode());
    await page.getByRole('button',{name:'Actual size',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Fit',exact:true}).getAttribute('aria-pressed'),'true');
    await page.screenshot({path:'/tmp/omni-manual-image-viewer.png'});await page.keyboard.press('Escape');assert(!await page.locator('#screenshot-viewer').isVisible());
    await page.setViewportSize({width:390,height:844});await page.goto('https://guide.test/omni-user-guide.html');
    await page.locator('.source-body img').first().evaluate(image=>image.decode());
    await page.screenshot({path:'/tmp/omni-manual-mobile.png'});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'Contents',exact:true}).click();await page.locator('#guide-index').getByRole('link',{name:'Create a Quote',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Contents',exact:true}).getAttribute('aria-expanded'),'false');
    await input.fill('采购');await page.waitForFunction(()=>document.getElementById('search-status').textContent.includes('found'));assert(await page.locator('.topic:not([hidden])').count()>0,'Original Chinese content is searchable');
    await page.getByRole('button',{name:'Clear',exact:true}).click();await input.fill('(');await page.waitForTimeout(200);assert.equal(errors.length,0,'Literal punctuation cannot break highlighting');
    // The existing Staff Guide loads the new manual lazily and does not close
    // the Omni overlay when Escape is used inside its screenshot dialog.
    await page.setViewportSize({width:1440,height:1050});await page.goto('https://go.cin7.com/test-guide');
    const staff=page.frameLocator('iframe[title="Staff guide"]');
    assert.equal(await staff.locator('#manual-frame').getAttribute('src'),null);
    await staff.getByRole('tab',{name:'Omni Manual',exact:true}).click();
    const manual=staff.frameLocator('#manual-frame');await manual.getByRole('searchbox',{name:'Search manual'}).waitFor();
    await manual.locator('.screenshot').first().click();await page.keyboard.press('Escape');await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>closes),0);assert(!await manual.locator('#screenshot-viewer').isVisible());
    await page.keyboard.press('Escape');await page.waitForFunction(()=>closes===1);assert.equal(await page.evaluate(()=>closes),1,'A later Escape still closes the outer Staff Guide normally');
    assert.deepEqual(errors,[]);assert(requests.every(origin=>['https://guide.test','https://go.cin7.com'].includes(origin)));
    console.log('PASS: exact source text, 140 placements / 133 byte-identical screenshots, all images decoded, nonblank pixels, indexed/deep-link navigation, literal and Chinese search, highlights, print, image enlargement, desktop/mobile framing and Staff Guide integration. Static files only; no business systems accessed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
