// ==UserScript==
// @name         Living Culture Omni Warranty Guide
// @namespace    livingculture
// @version      0.1.0
// @description  Opens a visual warranty reference from Omni quotes and sales orders.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if(location.hostname!=='go.cin7.com'||window.parent!==window||!/^\/Cloud\/TransactionEntry\/TransactionEntry\.aspx$/i.test(location.pathname))return;
  const buttonId='lc-omni-warranty-button';
  const dialogId='lc-omni-warranty-dialog';
  const guide='https://living-culture-workflow.vercel.app/warranty-guide.html';
  function openGuide(){
    const existing=document.getElementById(dialogId);
    if(existing){existing.querySelector('button')?.focus();return;}
    const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
    const dialog=document.createElement('dialog');dialog.id=dialogId;dialog.setAttribute('aria-label','Living Culture Warranty');
    dialog.style.cssText='box-sizing:border-box;width:min(1060px,calc(100vw - 24px));height:calc(100dvh - 24px);max-width:none;max-height:none;padding:0;border:1px solid #b6ced3;border-radius:6px;background:white;overflow:hidden;';
    const style=document.createElement('style');style.textContent=`#${dialogId}[open]{display:flex;flex-direction:column}#${dialogId}::backdrop{background:#173b4855}`;
    const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#087e91;color:white;font:700 17px Arial,sans-serif;flex-shrink:0;';
    const title=document.createElement('span');title.textContent='Warranty at a glance';
    const close=document.createElement('button');close.type='button';close.textContent='Close';close.style.cssText='border:1px solid white;border-radius:4px;padding:8px 16px;background:white;color:#086477;font:700 14px Arial,sans-serif;cursor:pointer;';
    close.onclick=()=>dialog.close();header.append(title,close);
    const frame=document.createElement('iframe');frame.title='Living Culture warranty infographic';frame.src=guide;frame.style.cssText='display:block;flex:1;width:100%;min-height:0;border:0;background:white;';
    const onMessage=event=>{if(event.source===frame.contentWindow&&event.origin===new URL(guide).origin&&event.data?.type==='lc-warranty-close')dialog.close();};
    window.addEventListener('message',onMessage);
    dialog.append(style,header,frame);
    dialog.addEventListener('close',()=>{window.removeEventListener('message',onMessage);document.body.style.overflow=previousOverflow;dialog.remove();if(previousFocus?.isConnected)previousFocus.focus();},{once:true});
    document.body.appendChild(dialog);dialog.showModal();document.body.style.overflow='hidden';close.focus();
  }
  function addButton(){
    const bar=document.getElementById('lc-omni-workflow-tools-bar');if(!bar||document.getElementById(buttonId))return;
    const button=document.createElement('button');button.id=buttonId;button.type='button';button.textContent='Warranty';button.title='Warranty periods and claim steps';
    button.style.cssText='box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:160px;min-width:160px;height:36px;flex:0 0 auto;margin:0;padding:0 14px;border:1px solid #087e91;border-radius:4px;background:#087e91;color:white;font:700 14px Arial,sans-serif;white-space:nowrap;cursor:pointer;';
    button.onclick=openGuide;bar.appendChild(button);
  }
  addButton();
  let scheduled=false;
  new MutationObserver(records=>{
    if(scheduled||records.every(record=>record.target.closest?.(`#${dialogId}`)))return;
    scheduled=true;requestAnimationFrame(()=>{scheduled=false;addButton();});
  }).observe(document.body,{childList:true,subtree:true});
})();
