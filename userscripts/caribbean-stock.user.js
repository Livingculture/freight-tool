// ==UserScript==
// @name         Living Culture Caribbean Stock
// @namespace    livingculture-stock
// @version      0.1.2
// @description  Opens the live Caribbean stock list and Google-authorised hold/paid controls in Cin7 Core and Omni.
// @author       Living Culture
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/caribbean-stock.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/caribbean-stock.user.js
// ==/UserScript==
(function(){
  'use strict';
  if(window.parent!==window||!/^(?:go\.cin7\.com|(?:[^.]+\.)*dearsystems\.com|(?:[^.]+\.)*cin7core\.com)$/.test(location.hostname))return;
  const ID='lc-caribbean-stock-button',KEY='lcCaribbeanStockWebAppV1';
  const DEFAULT_APP_URL='https://script.google.com/a/macros/livingculture.co.nz/s/AKfycbwmxFo0-94s8lBr9jDjmMWk6FbxZKTaUDaUi9k3OW3MuSIi4QOmiCuqvm-1IJJlLJ5ZtA/exec';
  function appUrl(value){
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/(?:a\/macros\/livingculture\.co\.nz\/|macros\/)s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname))throw Error('Enter the Google Apps Script web-app URL ending in /exec.');
    url.search='';url.hash='';return url.href;
  }
  function configure(){
    const input=prompt('Change the Caribbean stock Google app address (admin setup only).',GM_getValue(KEY,DEFAULT_APP_URL));
    if(input===null)return '';
    try{const url=appUrl(input);GM_setValue(KEY,url);return url;}catch(error){alert(error.message);return '';}
  }
  function field(pattern){
    for(const label of document.querySelectorAll('label,td,th')){
      if(!pattern.test(String(label.textContent||'').trim()))continue;
      const control=label.htmlFor&&document.getElementById(label.htmlFor)||label.querySelector('input,select')||label.nextElementSibling?.querySelector('input,select')||(label.nextElementSibling?.matches('input,select')?label.nextElementSibling:null);
      if(control?.getClientRects().length)return String(control.tagName==='SELECT'?control.selectedOptions[0]?.textContent||'':control.value||'').trim();
    }
    return '';
  }
  function context(){
    const clean=value=>String(value||'').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\s+/g,' ').trim();
    const number=value=>{const match=clean(value).match(/\b(NZSO|SFOR)\s*-?\s*(\d+(?:-[A-Z0-9]+)?)\b/i);return match?match[1].toUpperCase()+(match[1].toUpperCase()==='NZSO'?'-':'')+match[2].toUpperCase():'';};
    const titlePattern=/^(?:Edit|New)\s+(Sales Order|Quote)\s*-\s*(.+?)\s*-\s*((?:NZSO|SFOR)\s*-?\s*\d+(?:-[A-Z0-9]+)?)\b/i;
    const textOf=node=>clean(Array.from(node.childNodes).filter(child=>!child.id?.startsWith('lc-')).map(child=>child.textContent||'').join(' '));
    const visible=node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
    const headings=Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')).filter(visible).map(textOf);
    // Omni also renders its transaction title as a plain div, not an HTML heading.
    const plainTitles=Array.from(document.querySelectorAll('div,span,td')).filter(node=>visible(node)&&!node.closest('nav,aside,[role="navigation"],#lc-omni-job-progress')).map(textOf).filter(text=>text.length<500&&titlePattern.test(text));
    const title=[...headings,...plainTitles].map(text=>text.match(titlePattern)).find(Boolean);
    const heading=headings.find(text=>text.length<350&&number(text))||'';
    return {quote:number(title?.[3]||heading)||number(field(/^(?:quote|order|sale)(?:\s+(?:no\.?|number))?\s*[:#]?$/i)),customer:clean(title?.[2])||field(/^(?:selected customer|customer|customer name)\s*:?$/i),rep:field(/^(?:sales rep|sales representative|salesperson)\s*:?$/i)};
  }
  function open(){
    const configured=GM_getValue(KEY,'')||DEFAULT_APP_URL;
    let url;try{url=new URL(appUrl(configured));}catch(error){alert(error.message);return;}
    url.hash=new URLSearchParams(context()).toString();
    const width=Math.min(1000,screen.availWidth||innerWidth),height=Math.min(800,screen.availHeight||innerHeight);
    const left=Math.round((screen.availLeft||0)+((screen.availWidth||width)-width)/2),top=Math.round((screen.availTop||0)+((screen.availHeight||height)-height)/2);
    const popup=window.open(url.href,'_blank',`popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if(!popup){alert('Please allow popups for Cin7, then click Caribbean Stock again.');return;}popup.opener=null;popup.focus();
  }
  function mount(){
    if(!document.body)return;
    let button=document.getElementById(ID);
    if(!button){button=document.createElement('button');button.id=ID;button.type='button';button.textContent='Caribbean Stock';button.title='Open the live Caribbean stock list';button.addEventListener('click',open);}
    const toolbar=location.hostname==='go.cin7.com'?document.getElementById('lc-omni-workflow-tools-bar'):null,promo=document.getElementById('lc-promo-summary-inline-button');
    const parent=toolbar||(promo?.parentElement&&getComputedStyle(promo.parentElement).display.includes('flex')?promo.parentElement:null)||document.body;
    if(button.parentElement!==parent)parent.append(button);
    button.style.cssText='box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-height:36px;max-width:calc(100vw - 24px);padding:7px 13px;border:1px solid #176e58;border-radius:4px;background:#176e58;color:white;font:700 13px Arial,sans-serif;cursor:pointer;'+(parent===document.body?'position:fixed;right:16px;bottom:18px;z-index:2147483000;':'position:static;');
  }
  if(typeof GM_registerMenuCommand==='function')GM_registerMenuCommand('Connect Caribbean stock Google app',configure);
  let pending=false;
  new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;mount();});}}).observe(document.documentElement,{childList:true,subtree:true});
  mount();
})();
