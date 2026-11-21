const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=fs.readFileSync('userscripts/omni-quote-defaults.user.js','utf8');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try {
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.abort());
    await page.setContent(`<style>body{font:16px Arial}.dates{position:relative;height:100px;margin-top:50px}.date{position:absolute;top:0;width:160px}.date label,.date input,.date select{display:block;width:150px}#created-group{left:20px}#expected-group{left:450px}#probability-group{left:650px}.contact{display:block;margin:10px}</style>
      <label class="contact">Name <input id="name" value="Example Person"></label>
      <label class="contact">Phone <input id="phone" value="000000000"></label>
      <label class="contact">Email <input id="email" value="example@example.test"></label>
      <label class="contact">Notes <textarea id="notes">Example notes</textarea></label>
      <div id="editable" contenteditable="true">Example editor</div><div id="shadow"></div>
      <div class="dates"><div class="date" id="created-group"><label>Created Date</label><input id="created" value="21-11-2026"></div>
      <div class="date" id="expected-group"><label>Expected Order Date</label><input id="expected"><button id="calendar">Calendar</button></div>
      <div class="date" id="probability-group"><label>Probability of Winning</label><select id="probability"><option>25%</option><option>50%</option></select></div></div>`);
    await page.evaluate(()=>{
      window.defaultTick=null;window.setInterval=fn=>{window.defaultTick=fn;return 1;};
      window.calendarClicks=0;document.querySelector('#calendar').onclick=()=>{window.calendarClicks++;document.querySelector('#expected').focus();};
      window.syntheticNavigation=[];for(const type of ['keydown','keypress','keyup','blur'])document.addEventListener(type,e=>{if(!e.isTrusted)window.syntheticNavigation.push(type);},true);
      const outer=document.querySelector('#shadow').attachShadow({mode:'open'}),inner=document.createElement('div');outer.append(inner);inner.attachShadow({mode:'open'}).innerHTML='<input id="deep" value="Shadow example">';
      document.querySelector('#name').focus();
    });
    await page.addScriptTag({content:source});
    for(const id of ['name','phone','email','notes']) {
      await page.locator('#'+id).focus();
      await page.locator('#'+id).evaluate(input=>input.setSelectionRange(2,5));
      await page.evaluate(()=>{defaultTick();document.body.appendChild(document.createElement('span'));});
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>document.activeElement.id),id,'Typing field retains focus across background checks');
      assert.deepEqual(await page.locator('#'+id).evaluate(input=>[input.selectionStart,input.selectionEnd]),[2,5]);
      assert.equal(await page.locator('#expected').inputValue(),'');
    }
    await page.locator('#editable').focus();await page.evaluate(()=>defaultTick());
    assert.equal(await page.evaluate(()=>document.activeElement.id),'editable');
    await page.evaluate(()=>{document.querySelector('#shadow').shadowRoot.querySelector('div').shadowRoot.querySelector('input').focus();defaultTick();});
    assert.equal(await page.locator('#expected').inputValue(),'','Nested shadow-root editors block defaults too');
    await page.locator('#name').focus();await page.keyboard.type(' typing');
    await page.evaluate(()=>{document.activeElement.blur();defaultTick();});
    assert.equal(await page.locator('#expected').inputValue(),'','Recent typing defers updates even after focus leaves the field');
    await page.waitForTimeout(1500);await page.evaluate(()=>defaultTick());
    assert.equal(await page.locator('#expected').inputValue(),'05-12-2026','Idle default still adds fourteen days');
    assert.equal(await page.locator('#probability').inputValue(),'50%');
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BODY','Idle update does not focus another control');
    assert.equal(await page.evaluate(()=>calendarClicks),0,'No calendar opens and no delayed focus retry is scheduled');
    assert.deepEqual(await page.evaluate(()=>syntheticNavigation),[],'No artificial Tab, Enter or blur events');
    await page.evaluate(()=>{document.querySelector('#expected').value='28-';defaultTick();});
    assert.equal(await page.locator('#expected').inputValue(),'28-','Partial user-entered dates are not overwritten');
    await page.evaluate(()=>{const input=document.querySelector('#expected');input.value='';input.removeAttribute('value');input.readOnly=true;defaultTick();});
    assert.equal(await page.locator('#expected').inputValue(),'','Unsupported readonly calendars are left untouched');
    await page.evaluate(()=>{
      window.widgetUpdates=0;window.jQuery=input=>({data:name=>name==='kendoDatePicker'?{value(){window.widgetUpdates++;},trigger(){}}:null});
      defaultTick();
    });
    assert.equal(await page.locator('#expected').inputValue(),'05-12-2026','Supported readonly date widgets still receive defaults');
    assert.equal(await page.evaluate(()=>widgetUpdates),1);
    assert.deepEqual(errors,[]);
    await page.close();
    console.log('PASS: Name, phone, email, notes, rich-text and nested-shadow focus/selection retained; activity grace, idle dates/probability, readonly widgets, partial dates and no calendar/navigation events. Fictional isolated browser; network blocked.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
