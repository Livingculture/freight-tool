// ==UserScript==
// @name         Omni Living Culture Custom Product Helper
// @namespace    livingculture-omni
// @version      0.1.1
// @description  Shows Living Culture custom products and adds the selected SKU to the next empty Cin7 Omni product line.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-product-helper.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-product-helper.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';
  const DATA_URL = 'https://docs.google.com/document/d/1Vm28Nvi7hLqbdHKqe15WdpG1zKfK3Y7M/export?format=txt';
  const BACKUP_URL = 'https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-custom-product-helper.user.js';
  const ROOT_ID = 'lc-omni-custom-product-root';
  const BUTTON_ID = 'lc-omni-custom-product-button';
  const CACHE_KEY = 'lc-omni-custom-product-data-v1';
  let items = [];

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function visible(element) { if (!element) return false; const r=element.getBoundingClientRect(),s=getComputedStyle(element); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'; }
  function elements(selector='body *') { return Array.from(document.querySelectorAll(selector)).filter(visible).filter(e=>!e.closest(`#${ROOT_ID}`)&&e.id!==BUTTON_ID); }
  function html(value) { return String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isCode(value) { return /^(?:SK|CS)-?\d{5}$/i.test(clean(value)); }
  function isPrice(value) { return /^\$?\s*\d[\d,]*(?:\.\d+)?\s*$/.test(clean(value)); }
  function csv(line){const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){out.push(value);value='';}else value+=c;}out.push(value);return out;}
  function parse(raw) {
    const lines=String(raw||'').split(/\r?\n/).map(clean).filter(Boolean);
    if (/^name\s*,\s*cs\s*code/i.test(lines[0]||'')) return lines.slice(1).map(line=>{const p=csv(line);return{name:clean(p[0]),code:clean(p[1]),price:clean(p[2]),memo:clean(p.slice(3).join(','))};}).filter(item=>item.name&&isCode(item.code));
    let i=lines.findIndex((line,index)=>/^name$/i.test(line)&&/cs\s*code/i.test(lines[index+1]||''));
    i=i<0?0:i+4; const result=[];
    while(i<lines.length){
      let name=lines[i++];
      if(!isCode(lines[i])&&isCode(lines[i+1])) name=`${name} ${lines[i++]}`;
      const code=lines[i++]; if(!isCode(code)){ continue; }
      const price=isPrice(lines[i])?lines[i++]:''; const notes=[];
      while(i<lines.length&&!isCode(lines[i+1])&&!isCode(lines[i+2])) notes.push(lines[i++]);
      result.push({name,code,price,memo:notes.join(' ')});
    }
    return result.filter(item=>item.name&&item.code);
  }
  function request(url) { return new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'GET',url:`${url}${url.includes('?')?'&':'?'}cache=${Date.now()}`,timeout:20000,onload:r=>r.status>=200&&r.status<300?resolve(r.responseText||''):reject(new Error(`Product source returned ${r.status}`)),onerror:()=>reject(new Error('Could not load custom products')),ontimeout:()=>reject(new Error('Custom product request timed out'))})); }
  async function load() {
    status('Loading custom products…');
    try { let raw=await request(DATA_URL),parsed=parse(raw);if(!parsed.length){const script=await request(BACKUP_URL);raw=script.match(/const RAW_DATA = `([\s\S]*?)`;\s*\n/)?.[1]||'';parsed=parse(raw);}if(!parsed.length) throw new Error('No custom products found'); items=parsed; localStorage.setItem(CACHE_KEY,raw); status('Live product list loaded'); }
    catch(error){ items=parse(localStorage.getItem(CACHE_KEY)||''); status(items.length?'Using saved product list':error.message,true); }
    render();
  }
  function status(message,error=false){ const e=document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('status'); if(e){e.textContent=message;e.classList.toggle('error',error);} }
  function group(item){const t=`${item.name} ${item.memo}`.toLowerCase();if(t.includes('post'))return'Posts';if(/pergola|mediterranean|baltic|tasman|caspian|pacific|dover/.test(t))return'Pergolas';if(/shutter|privacy|slatted|glass|bifold|screen/.test(t))return'Walls, Doors & Screens';if(/blind|shade/.test(t))return'Blinds & Shades';if(/awning|patio|carport/.test(t))return'Awnings, Patio Covers & Carports';return'Other';}
  function render(){const s=document.getElementById(ROOT_ID)?.shadowRoot;if(!s)return;const q=clean(s.getElementById('search').value).toLowerCase();const rows=items.filter(x=>!q||`${x.code} ${x.name} ${x.price} ${x.memo}`.toLowerCase().includes(q)).sort((a,b)=>group(a).localeCompare(group(b))||a.name.localeCompare(b.name));s.getElementById('count').textContent=`${rows.length} result${rows.length===1?'':'s'}`;let last='';s.getElementById('rows').innerHTML=rows.map(x=>{const g=group(x),heading=g!==last;last=g;return`${heading?`<tr class="group"><td colspan="4">${html(g)}</td></tr>`:''}<tr><td><button data-code="${html(x.code)}">Add</button></td><td class="code">${html(x.code)}</td><td><strong>${html(x.name)}</strong><small>${html(x.memo)}</small></td><td class="price">${html(x.price)}</td></tr>`}).join('');s.getElementById('rows').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>add(rows.find(x=>x.code===button.dataset.code))));}

  function exact(text){const wanted=clean(text).toLowerCase();return elements().filter(e=>clean(e.value||e.textContent).toLowerCase()===wanted).sort((a,b)=>a.children.length-b.children.length)[0]||null;}
  function emptyCodeCell(){const label=exact('Code'),th=label?.closest('th,td'),row=th?.closest('tr'),table=row?.closest('table');if(!th||!row||!table)return null;const index=Array.from(row.children).indexOf(th);return Array.from(table.querySelectorAll('tr')).slice(1).map(r=>r.children[index]).find(cell=>cell&&visible(cell)&&(!clean(cell.querySelector('input')?.value||cell.textContent)||/^search/i.test(clean(cell.textContent))));}
  function click(element){const r=element.getBoundingClientRect(),x=r.left+Math.min(24,r.width/2),y=r.top+r.height/2;['pointerdown','mousedown','mouseup','click'].forEach(type=>element.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y})));}
  function setValue(input,value){input.focus();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?setter.call(input,value):input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:value.slice(-1)}));}
  function key(input,key,code){['keydown','keypress','keyup'].forEach(type=>input.dispatchEvent(new KeyboardEvent(type,{bubbles:true,cancelable:true,key,code:key,keyCode:code,which:code})));}
  async function selectResult(input,sku){for(let n=0;n<24;n++){await wait(150);const ir=input.getBoundingClientRect();let candidate=elements('[role="option"],li,a,div,span').filter(e=>clean(e.textContent).toLowerCase().includes(sku.toLowerCase())).filter(e=>{const r=e.getBoundingClientRect();return r.top>=ir.bottom-8&&r.top<ir.bottom+420&&r.right>ir.left-80&&r.left<ir.right+520;}).sort((a,b)=>a.children.length-b.children.length)[0];if(candidate){while(candidate.parentElement&&candidate.parentElement!==document.body){const p=candidate.parentElement,r=p.getBoundingClientRect();if(r.top<ir.bottom-10||r.height>100||!clean(p.textContent).toLowerCase().includes(sku.toLowerCase()))break;candidate=p;}click(candidate);await wait(300);if(document.activeElement===input){key(input,'ArrowDown',40);key(input,'Enter',13);}return;}}key(input,'ArrowDown',40);key(input,'Enter',13);}
  async function add(item){if(!item)return;const cell=emptyCodeCell();if(!cell){status('No empty Omni product line was found.',true);return;}close();click(cell);await wait(350);let input=document.activeElement;if(!(input instanceof HTMLInputElement)){const r=cell.getBoundingClientRect();input=elements('input:not([type="hidden"])').find(e=>{const x=e.getBoundingClientRect();return Math.abs(x.top-r.top)<80&&Math.abs(x.left-r.left)<250;});}if(!input){status('Could not open the Omni Code field.',true);return;}setValue(input,item.code);await selectResult(input,item.code);}

  function close(){document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('modal')?.classList.remove('open');}
  function open(){const s=ensureRoot().shadowRoot;s.getElementById('modal').classList.add('open');s.getElementById('search').focus();load();}
  function ensureRoot(){let root=document.getElementById(ROOT_ID);if(root)return root;root=document.createElement('div');root.id=ROOT_ID;document.body.appendChild(root);const s=root.attachShadow({mode:'open'});s.innerHTML=`<style>:host{all:initial;font-family:Arial,sans-serif;color:#162947}*{box-sizing:border-box}#modal{position:fixed;inset:0;z-index:2147483647;display:none;justify-content:flex-end;align-items:center;padding:18px;background:rgba(14,30,54,.24)}#modal.open{display:flex}.panel{display:flex;flex-direction:column;width:min(700px,92vw);max-height:88vh;overflow:hidden;background:#fff;border:1px solid #9db3d2;border-radius:8px;box-shadow:0 18px 48px rgba(15,46,106,.25)}header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;color:#fff;background:#13377e}h2{margin:0;font-size:18px}.close{width:30px;height:30px;border:0;border-radius:5px;color:#162947;background:#e7eef8;font-size:20px}.tools{display:grid;grid-template-columns:1fr auto;gap:10px;padding:10px 12px}#search{height:36px;padding:0 10px;border:1px solid #9db3d2;border-radius:4px}#count{align-self:center;font-size:12px;font-weight:700;color:#536987}#status{padding:0 12px 8px;font-size:11px;font-weight:700;color:#34577f}#status.error{color:#9a2d20}.wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th{position:sticky;top:0;padding:7px;text-align:left;background:#eef3fa}td{padding:7px;border-bottom:1px solid #e1e7ef;vertical-align:top}td button{padding:5px 10px;border:0;border-radius:4px;color:#fff;background:#13377e;font-weight:700}.group td{padding:8px;color:#13377e;background:#e7eef8;font-weight:800;text-transform:uppercase}.code,.price{white-space:nowrap;font-weight:800}small{display:block;margin-top:3px;color:#536987;line-height:1.25}</style><div id="modal"><div class="panel"><header><h2>Living Culture Custom Products</h2><button class="close">×</button></header><div class="tools"><input id="search" placeholder="Search product, SKU or notes"><div id="count"></div></div><div id="status"></div><div class="wrap"><table><thead><tr><th></th><th>SKU</th><th>Product / Notes</th><th>Price</th></tr></thead><tbody id="rows"></tbody></table></div></div></div>`;s.querySelector('.close').addEventListener('click',close);s.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')close();});s.getElementById('search').addEventListener('input',render);return root;}
  function getButton(){let b=document.getElementById(BUTTON_ID);if(!b){b=document.createElement('button');b.id=BUTTON_ID;b.type='button';b.textContent='Custom Products';b.addEventListener('click',open);document.body.appendChild(b);}return b;}
  function anchor(){return document.getElementById('lc-omni-containers-open')||elements('button,input,a').find(e=>/lc\s*containers/i.test(clean(e.value||e.textContent)))||document.getElementById('lc-omni-install-fee-button');}
  function place(){const b=getButton(),a=anchor();b.style.cssText='position:fixed;left:680px;bottom:20px;z-index:2147483598;height:36px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;font:700 13px Arial;white-space:nowrap;cursor:pointer';if(!a||!visible(a))return;const r=a.getBoundingClientRect();b.style.position=a.style.position==='fixed'?'fixed':'absolute';b.style.left=`${(b.style.position==='fixed'?0:scrollX)+r.right+8}px`;b.style.top=`${(b.style.position==='fixed'?0:scrollY)+r.top}px`;b.style.bottom='auto';b.style.height=`${Math.max(34,r.height)}px`;}
  function schedulePlace(){if(window.__lcOmniCustomProductPositionFrame)return;window.__lcOmniCustomProductPositionFrame=requestAnimationFrame(()=>{window.__lcOmniCustomProductPositionFrame=0;place();});}
  ensureRoot();place();setInterval(place,5000);new MutationObserver(records=>{if(records.some(record=>{const target=record.target instanceof Element?record.target:record.target.parentElement;return target&&!target.closest?.(`#${ROOT_ID}, #${BUTTON_ID}`);}))schedulePlace();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});addEventListener('resize',schedulePlace);addEventListener('scroll',schedulePlace,{passive:true});
})();
