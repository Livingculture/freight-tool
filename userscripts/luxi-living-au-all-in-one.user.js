// ==UserScript==
// @name         Luxi Living AU All-in-One - Cin7 Core
// @namespace    luxi-living-au-core
// @version      0.1.1
// @description  Independent Luxi Living Australia quote tools and Australian source settings for Cin7 Core.
// @match        https://inventory.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      *.googleusercontent.com
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/luxi-living-au-all-in-one.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/luxi-living-au-all-in-one.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (location.hostname === 'go.cin7.com' || window.top !== window.self) return;
  if (location.hostname !== 'inventory.dearsystems.com' && !location.hostname.endsWith('.cin7core.com')) return;
  const KEY = 'luxi-au-core-settings-v1';
  const BAR = 'luxi-au-quote-tools';
  const MODAL = 'luxi-au-quote-dialog';
  const modules = [
    {key:'comments',label:'Custom Comments',kind:'text'},
    {key:'memo',label:'Quote Memo',kind:'text'},
    {key:'install',label:'Install Fees',kind:'products'},
    {key:'custom',label:'Custom Products',kind:'products'},
    {key:'promo',label:'Promo Summary',kind:'products'},
    {key:'newProducts',label:'New Products',kind:'products'}
  ];
  const defaults = {
    memo:'https://docs.google.com/document/d/1kloptIzIxnszJzdyIA0OAfRZjUqpRC9a4CIpPd7O19E/edit',
    install:'https://docs.google.com/spreadsheets/d/1NiLU545Ho054OMNqmfc_9QImAAeniFlH/edit',
    custom:'https://drive.google.com/file/d/1SUYfrfm3Dw6qbLWbEPTJZQav7xeqqWpV/view',
    newProducts:'https://drive.google.com/drive/folders/1Ce__j6k9q1Mcpus_2cADfYzrNoGl07zp'
  };
  let settings = readSettings(), scheduled = false, activeRequest = null, dialogEpoch = 0;
  const clean = value => String(value || '').replace(/\s+/g,' ').trim();
  const make = (tag,text) => { const element=document.createElement(tag); if(text!==undefined)element.textContent=text; return element; };
  function readSettings() {
    try {
      const value=GM_getValue(KEY,{});
      return {...defaults,...(value && typeof value==='object' && !Array.isArray(value) ? value : {})};
    } catch { return {...defaults}; }
  }
  function visible(element) {
    const rect=element.getBoundingClientRect();
    return rect.width>0 && rect.height>0 && getComputedStyle(element).visibility!=='hidden';
  }
  function luxiAccount() {
    // Only the current account selector in Core's upper-right header is evidence.
    return Array.from(document.querySelectorAll('select,button,a,[role="combobox"],[role="button"],header span,nav span,[role="banner"] span,.navbar span,.topbar span'))
      .filter(element=>!element.closest(`#${BAR},#${MODAL},[role="option"],[role="menu"],[role="listbox"],.dropdown-menu`) && visible(element))
      .some(element=>{
        const rect=element.getBoundingClientRect();
        if(rect.top<0 || rect.bottom>160 || rect.left<innerWidth*0.55)return false;
        const text=element.tagName==='SELECT' ? element.selectedOptions[0]?.textContent
          : element.textContent;
        return /^luxi living(?: pty ltd)?$/i.test(clean(text));
      });
  }
  function enabled() {
    return /^\/Sale\/?$/i.test(location.pathname) && !/tab(?:Order|Invoice|Pick|Pack|Ship|Credit|Restock|Financial)/i.test(location.hash) && luxiAccount();
  }
  function stopRequest() { activeRequest?.abort?.(); activeRequest=null; dialogEpoch++; }
  function closeDialog() {
    stopRequest();
    const host=document.getElementById(MODAL),opener=host?.opener;
    host?.remove(); if(opener?.isConnected)opener.focus({preventScroll:true});
  }
  function dialog(title) {
    closeDialog();
    const opener=document.activeElement,host=make('div');host.id=MODAL;host.opener=opener;
    host.style.cssText='position:fixed;inset:0;z-index:2147483647';
    const root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{font:14px/1.5 Arial,sans-serif;color:#233f43}*{box-sizing:border-box}
      .backdrop{position:absolute;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;padding:20px}
      section{width:min(1080px,100%);max-height:90vh;overflow:auto;background:white;border-radius:8px;padding:22px}
      header{display:flex;align-items:center;justify-content:space-between;gap:16px}h2{font-size:21px;margin:0}
      button,a{font:inherit}button{border:1px solid #b5c9cd;border-radius:4px;background:white;color:#164f56;padding:8px 12px;cursor:pointer}
      button.primary{background:#007f89;border-color:#007f89;color:white}button:disabled{opacity:.5;cursor:default}
      input,textarea{font:inherit;border:1px solid #b5c9cd;border-radius:4px;padding:9px;width:100%;color:inherit;background:white}
      textarea{min-height:110px;resize:vertical}label{display:block;margin:14px 0 5px;font-weight:700}
      p{margin:12px 0}.muted{color:#597379}.error{color:#a92c22}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}
      table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border-bottom:1px solid #dce7e9;padding:10px;text-align:left;vertical-align:top;white-space:pre-wrap}
      th{background:#edf5f5}a{color:#007f89}article{padding:16px 0;border-bottom:1px solid #dce7e9}pre{white-space:pre-wrap;font:inherit}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}@media(max-width:650px){.grid{grid-template-columns:1fr}section{padding:14px}.backdrop{padding:8px}}
    </style><div class="backdrop"><section role="dialog" aria-modal="true" aria-labelledby="title"><header><h2 id="title"></h2><button type="button" class="close">Close</button></header><main></main></section></div>`;
    root.querySelector('h2').textContent=title;
    root.querySelector('.close').onclick=closeDialog;
    root.querySelector('.backdrop').onclick=event=>{if(event.target===event.currentTarget)closeDialog();};
    root.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();closeDialog();}
      if(event.key==='Tab'){
        const focusables=Array.from(root.querySelectorAll('button,input,textarea,a[href]')).filter(element=>!element.disabled && element.getClientRects().length);
        const index=focusables.indexOf(root.activeElement);
        if(event.shiftKey && index<=0){event.preventDefault();focusables.at(-1)?.focus();}
        else if(!event.shiftKey && index===focusables.length-1){event.preventDefault();focusables[0]?.focus();}
      }
    });
    document.body.append(host);root.querySelector('.close').focus();
    return root.querySelector('main');
  }
  function button(text,action,primary=false) {
    const element=make('button',text);element.type='button';element.onclick=action;
    if(primary)element.className='primary';return element;
  }
  function sheetUrl(raw) {
    const url=new URL(raw);
    if(url.protocol!=='https:' || url.hostname!=='docs.google.com')throw new Error('Use an Australian Google Sheets link.');
    const id=url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1];
    if(!id || url.username || url.password)throw new Error('Use a Google Sheets link with its sheet tab selected.');
    const gid=url.searchParams.get('gid') || new URLSearchParams(url.hash.slice(1)).get('gid') || '';
    if(gid && !/^\d+$/.test(gid))throw new Error('The spreadsheet tab ID is invalid.');
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid?'&gid='+gid:''}`;
  }
  function sourceInfo(raw) {
    let url;try{url=new URL(raw);}catch{throw new Error('Use a Google Sheets, Google Docs or Drive source link.');}
    if(url.protocol!=='https:' || url.username || url.password)throw new Error('Use an HTTPS Google source link.');
    if(url.hostname==='docs.google.com'){
      if(url.pathname.startsWith('/spreadsheets/'))return {kind:'csv',url:sheetUrl(raw)};
      const doc=url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1];
      if(doc)return {kind:'textdoc',url:`https://docs.google.com/document/d/${doc}/export?format=html`};
    }
    if(url.hostname==='drive.google.com'){
      const file=url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1];
      if(file)return {kind:'file',url:`https://drive.google.com/file/d/${file}/preview`};
      if(/^\/drive\/folders\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname))return {kind:'folder',url:url.href};
    }
    throw new Error('Use a Google Sheets, Google Docs or Drive source link.');
  }
  function setup() {
    if(!enabled())return;
    const main=dialog('Luxi Living AU — Sources');
    main.append(make('p','Australian source links for each button. Sources are stored in this Australia installer only. Sheets provide searchable data; Docs provide text; Drive files and folders open their originals.'));
    const form=make('form'),fields={};
    for(const module of modules){
      const id=`source-${module.key}`,label=make('label',module.label);label.htmlFor=id;
      const input=make('input');input.id=id;input.type='url';input.value=settings[module.key] || '';input.placeholder='Australian Google Sheets, Docs or Drive link';
      fields[module.key]=input;form.append(label,input);
    }
    const status=make('p');status.setAttribute('role','status');
    const save=make('button','Save Australian sources');save.type='submit';save.className='primary';
    form.append(make('p','Text sheets: Title, Text. Product sheets: SKU, Product, Price, Unit, Notes. Product prices are shown as supplied in AUD; tax treatment is not changed.'),save,status);
    form.onsubmit=event=>{
      event.preventDefault();if(!enabled())return;
      try{
        const next={};for(const module of modules){const raw=fields[module.key].value.trim();if(raw)sourceInfo(raw);next[module.key]=raw;}
        GM_setValue(KEY,next);settings=next;status.className='';status.textContent='Australian sources saved.';
      }catch(error){status.className='error';status.textContent=error.message;}
    };
    main.append(form);
  }
  function parseCsv(text) {
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(ch===',' && !quoted){row.push(cell);cell='';}
      else if((ch==='\n' || ch==='\r') && !quoted){if(ch==='\r' && text[i+1]==='\n')i++;row.push(cell);if(row.some(value=>value.trim()))rows.push(row);row=[];cell='';}
      else cell+=ch;
    }
    if(quoted)throw new Error('The spreadsheet returned incomplete CSV data.');
    row.push(cell);if(row.some(value=>value.trim()))rows.push(row);
    const headers=(rows.shift() || []).map(value=>value.replace(/^\uFEFF/,'').trim().toLowerCase());
    return rows.map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index] || ''])));
  }
  async function copy(text,status) {
    try{await navigator.clipboard.writeText(text);status.textContent='Copied.';}
    catch{status.textContent='Copy was blocked. Select the text and copy it manually.';}
  }
  function commentBuilder() {
    const main=dialog('Luxi Living AU — Custom Comments');
    main.append(make('p','Enter the specifications for this quote. Review the wording before filling Comments.'));
    const grid=make('div');grid.className='grid';const fields=[];
    for(const title of ['Product','Quantity','Width (mm)','Projection (mm)','Height (mm)','Frame colour','Roof / fabric colour','Installation details']){
      const box=make('div'),label=make('label',title),input=make('input');input.id=`luxi-spec-${fields.length}`;label.htmlFor=input.id;box.append(label,input);grid.append(box);fields.push([title,input]);
    }
    const notesLabel=make('label','Additional notes'),notes=make('textarea');notes.id='luxi-au-spec-notes';notesLabel.htmlFor=notes.id;
    const outputLabel=make('label','Comment preview'),output=make('textarea');output.id='luxi-au-spec-output';outputLabel.htmlFor=output.id;
    const status=make('p');status.setAttribute('role','status');
    const build=()=>{output.value=[...fields.filter(([,input])=>input.value.trim()).map(([title,input])=>`${title}: ${input.value.trim()}`),notes.value.trim()].filter(Boolean).join('\n');};
    for(const [,input] of fields)input.oninput=build;notes.oninput=build;
    const actions=make('div');actions.className='row';actions.append(button('Copy',()=>copy(output.value,status)),button('Fill Comments',()=>fillText('comments',output.value,status),true));
    main.append(grid,notesLabel,notes,outputLabel,output,actions,status);
  }
  function documentRows(html) {
    const doc=new DOMParser().parseFromString(html,'text/html'),rows=[];
    let current={title:'Information for Quotes',text:''};
    for(const element of doc.querySelectorAll('p,h1,h2,h3,h4,h5,h6')){
      const text=element.textContent.trim();if(!text)continue;
      const heading=/^(?:Custom Made Terms and Conditions\.?\s*(?:\(|$)|Installation required Pre.order items\s*(?:\(|$)|Pre.sale items\s*(?:\(|$)|In\s?stock Items\s*(?:\(|$)|Selling Showroom Model Products\s*(?:\(|$)|Post to wall blinds for Wall mounted pergolas\s*$)/i.test(text);
      if(heading){if(current.text.trim())rows.push(current);current={title:text,text:''};}
      else if(!/^Information on Quotes$/i.test(text))current.text+=(current.text?'\n\n':'')+text;
    }
    if(current.text.trim())rows.push(current);
    return rows;
  }
  function textTarget(kind) {
    const wanted=kind==='memo' ? /^quote memo(?: info)?$/i : /^comments$/i;
    const targets=[];
    for(const label of document.querySelectorAll('label,legend')){
      if(!wanted.test(clean(label.textContent)))continue;
      const linked=label.htmlFor && document.getElementById(label.htmlFor);
      const candidates=linked?[linked]:Array.from(label.parentElement.querySelectorAll('textarea,[contenteditable="true"]'));
      for(const target of candidates)if(visible(target) && !target.disabled && !target.readOnly && !target.closest(`#${MODAL}`))targets.push(target);
    }
    return [...new Set(targets)];
  }
  function fillText(kind,text,status) {
    if(!enabled()){closeDialog();return;}
    const targets=textTarget(kind);
    if(targets.length!==1){status.textContent=`Could not uniquely find ${kind==='memo'?'Quote Memo':'Comments'}. Use Copy and paste into the correct Core field.`;return;}
    const target=targets[0],current=target.isContentEditable?target.textContent:target.value;
    if(current?.trim() && !window.confirm('Replace the existing text in this field?'))return;
    if(target instanceof HTMLTextAreaElement)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(target,text);
    else if(target.isContentEditable)target.textContent=text;
    else{status.textContent='Use Copy and paste into the correct Core field.';return;}
    target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));
    status.textContent='Text entered. Review it in Core before saving.';
  }
  function renderRows(main,module,rows) {
    const search=make('input');search.type='search';search.placeholder='Search title, product, SKU or notes';search.setAttribute('aria-label','Search Australian source');
    const result=make('div'),status=make('p');status.setAttribute('role','status');main.append(search,status,result);
    const draw=()=>{
      const query=search.value.toLowerCase(),filtered=rows.filter(row=>Object.values(row).some(value=>value.toLowerCase().includes(query)));
      result.replaceChildren();status.textContent=`${filtered.length} results`;
      if(module.kind==='text'){
        for(const row of filtered){const article=make('article'),text=row.text || row.comment || row.memo || '';article.append(make('strong',row.title || row.name || ''),make('pre',text));
          const actions=make('div');actions.className='row';actions.append(button('Copy',()=>copy(text,status)),button('Fill field',()=>fillText(module.key,text,status),true));article.append(actions);result.append(article);}
      }else{
        const table=make('table'),head=make('tr');for(const title of ['SKU','Product','Source price (AUD)','Unit','Notes',''])head.append(make('th',title));table.append(head);
        for(const row of filtered){const tr=make('tr'),sku=row.sku || row.code || row['product code'] || '';
          for(const value of [sku || row.productcode || '',row.product || row.name || '',row.price || row.pricetier1 || '',row.unit || '',row.notes || row.memo || ''])tr.append(make('td',value));
          const actions=make('td');actions.append(button('Copy SKU',()=>copy(sku || row.productcode || '',status)));tr.append(actions);table.append(tr);}
        result.append(table);
      }
    };search.oninput=draw;draw();
  }
  function openModule(module) {
    if(!enabled())return;
    if(module.key==='comments' && !settings.comments){commentBuilder();return;}
    const main=dialog(`Luxi Living AU — ${module.label}`),raw=settings[module.key];
    if(!raw){main.append(make('p','The Australian source has not been configured yet.'),button('Set Australian source',setup));return;}
    let info;try{info=sourceInfo(raw);}catch(error){main.append(make('p',error.message),button('Edit source',setup));return;}
    const original=make('a','Open Australian source');original.href=raw;original.target='_blank';original.rel='noopener noreferrer';main.append(original);
    if(info.kind==='folder'){main.append(make('p','Open this Australian source folder to choose the current document.'));return;}
    if(info.kind==='file'){
      main.append(make('p','Original Australian document. Prices, units and conditions are shown as published in the source.'));
      const frame=make('iframe');frame.src=info.url;frame.title=module.label+' — Australian source';frame.style.cssText='width:100%;height:65vh;border:1px solid #dce7e9;margin-top:12px';main.append(frame);return;
    }
    const url=info.url;
    const message=make('p','Loading Australian spreadsheet…');main.append(message);
    const epoch=dialogEpoch;
    activeRequest=GM_xmlhttpRequest({method:'GET',url,anonymous:true,timeout:30000,
      onload:response=>{
        if(epoch!==dialogEpoch || !enabled())return;
        try{
          if(response.status<200 || response.status>=300 || (info.kind==='csv' && /^\s*</.test(response.responseText || '')))throw new Error('Could not read the Australian source. Check its sharing or publishing settings.');
          const rows=info.kind==='textdoc'?documentRows(response.responseText || ''):parseCsv(response.responseText || '');
          if(!rows.length)throw new Error('No data rows found in this Australian sheet.');
          if(module.kind==='text' && !Object.keys(rows[0]).some(key=>['text','comment','memo'].includes(key)))throw new Error('Text sheets need a Text, Comment or Memo column.');
          if(module.kind==='products' && !Object.keys(rows[0]).some(key=>['sku','code','product code','productcode'].includes(key)))throw new Error('Product sheets need an SKU, Code or Product Code column.');
          message.textContent='Australian source loaded.';renderRows(main,info.kind==='textdoc'?{...module,kind:'text'}:module,rows);
        }catch(error){message.className='error';message.textContent=error.message;}
      },
      onerror:()=>{if(epoch===dialogEpoch)message.textContent='Could not connect to the Australian source.';},
      ontimeout:()=>{if(epoch===dialogEpoch)message.textContent='The Australian source timed out. Close and try again.';}
    });
  }
  function mount() {
    scheduled=false;
    if(!enabled()){document.getElementById(BAR)?.remove();if(document.getElementById(MODAL))closeDialog();return;}
    if(document.getElementById(BAR))return;
    const bar=make('div');bar.id=BAR;bar.setAttribute('aria-label','Luxi Living Australia quote tools');
    const style=make('style');style.textContent=`
      #${BAR}{display:block!important;box-sizing:border-box;width:100%;max-width:100%;min-width:0;padding:16px;margin:12px 0;background:#fff;border:1px solid #c7dfe1;border-radius:8px;font:13px/1.4 Arial,sans-serif;color:#23484d}
      #${BAR} *{box-sizing:border-box}
      #${BAR} .au-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
      #${BAR} strong{font:700 15px/1.3 Arial,sans-serif;color:#164f56}
      #${BAR} .au-groups{display:grid;grid-template-columns:1fr 2fr;gap:20px}
      #${BAR} .au-label{font:600 11px/1.4 Arial,sans-serif;color:#597379;margin-bottom:6px}
      #${BAR} .au-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      #${BAR} .au-products{grid-template-columns:repeat(4,minmax(0,1fr))}
      #${BAR} button,#${BAR} a{float:none!important;position:static!important;margin:0!important;min-width:0;box-shadow:none;letter-spacing:normal;text-transform:none;font:600 13px/1.3 Arial,sans-serif;cursor:pointer;border-radius:5px;display:inline-flex!important;align-items:center;justify-content:center;text-decoration:none}
      #${BAR} .au-buttons button{width:100%;min-height:40px;height:auto!important;padding:9px 12px!important;background:#00858e!important;color:#fff!important;border:1px solid #00858e!important;white-space:normal}
      #${BAR} .au-buttons button:hover{background:#006d76!important;border-color:#006d76!important}
      #${BAR} button.au-settings,#${BAR} a{width:auto;min-height:32px;height:auto!important;padding:6px 10px!important;background:#fff!important;color:#21616a!important;border:1px solid #bcd6d9!important;white-space:nowrap}
      #${BAR} button:focus-visible,#${BAR} a:focus-visible{outline:3px solid #71c6cc!important;outline-offset:2px}
      #${BAR} .au-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #e4eeee}
      @media(max-width:1050px){#${BAR} .au-groups{grid-template-columns:1fr;gap:12px}}
      @media(max-width:600px){#${BAR}{padding:12px}#${BAR} .au-products{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    const header=make('div');header.className='au-header';
    const sources=button('AU Sources',setup);sources.className='au-settings';header.append(make('strong','Luxi Living AU'),sources);
    const groups=make('div');groups.className='au-groups';
    for(const [title,kinds] of [['Quote text',['comments','memo']],['Products & pricing',['install','custom','promo','newProducts']]]){
      const group=make('div');group.setAttribute('role','group');group.setAttribute('aria-label',title);group.append(make('div',title));group.firstElementChild.className='au-label';
      const actions=make('div');actions.className=kinds.length===4?'au-buttons au-products':'au-buttons';
      for(const module of modules.filter(item=>kinds.includes(item.key)))actions.append(button(module.label,()=>openModule(module)));
      group.append(actions);groups.append(group);
    }
    const website=make('a','Luxi website');website.href='https://luxiliving.com.au/';website.target='_blank';website.rel='noopener noreferrer';
    const shared=make('a','AU shared files');shared.href='https://drive.google.com/drive/folders/1lzVHJsc4ebnJwJlZmQ06X_9w7Sj2Fd56';shared.target='_blank';shared.rel='noopener noreferrer';
    const links=make('div');links.className='au-links';links.append(website,shared);
    bar.append(style,header,groups,links);
    const heading=Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(element=>clean(element.textContent).toLowerCase()==='quote' && visible(element));
    if(heading)heading.parentElement.insertBefore(bar,heading);
    else {const comments=Array.from(document.querySelectorAll('label')).find(element=>clean(element.textContent).toLowerCase()==='comments');
      if(comments)comments.parentElement.before(bar);else document.body.prepend(bar);}
  }
  function schedule() { if(!scheduled){scheduled=true;setTimeout(mount,100);} }
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('hashchange',schedule);window.addEventListener('popstate',schedule);document.addEventListener('change',schedule);
  mount();
})();
