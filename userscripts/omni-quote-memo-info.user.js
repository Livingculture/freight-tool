// ==UserScript==
// @name         Omni Living Culture Quote Memo Info
// @namespace    livingculture-omni
// @version      0.1.1
// @description  Fills selected quote wording into Omni Delivery Instructions for display on the quote PDF.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-quote-memo-info.user.js?v=0.1.1
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-quote-memo-info.user.js?v=0.1.1
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'lc-omni-quote-memo-root';
  const BUTTON_ID = 'lc-omni-quote-memo-button';
  const MEMOS = [
    ['Custom Made Terms and Conditions', 'Installation required quotes', `Please include relevant after care information when sending the quote as this is usually something discussed during the enquiry.

Dimensions and colour of each custom item:

Installation charges are based on ground floor installations. Other installations are on a case-by-case basis.

Extra charges may be incurred for extra work required in materials and labour outside of a standard basic installation or should any unexpected issues arise during installation. This will be discussed with you and invoiced same-day.`],
    ['Installation Required Pre-Order Items', 'Installation required', `This is an initial quote. Please send through some photos of the area if you haven’t already done so.

This is a Pre-Order item - ETA ______ weeks, pending no shipping delays.

Please make a 50% deposit payment using your quote number and surname as a reference.

Once we are aware of the confirmed arrival date, we will contact you for the balance of payment, which is required prior to scheduling delivery and any installations.

Installation charges are based on ground floor installations. Other installations are on a case-by-case basis.

Extra charges may be incurred for extra work required in materials and labour outside of a standard basic installation or should any unexpected issues arise during installation. This will be discussed with you and invoiced same-day.

Payment of the deposit is confirmation of items and acceptance of our terms and conditions.`],
    ['Pre-Sale Items', 'No installation required', `This is a Pre-Sale item - ETA ______ weeks, pending no shipping delays.

Pre-sale items are sold on a “first in, first serve basis”. A payment is required to secure stock.

Please make a 50% deposit payment using your quote number and surname as a reference.

Once payment is received, we will send you an invoice showing any outstanding balance.

Once we are aware of the confirmed arrival date, we will contact you for the balance of payment, which is required prior to scheduling delivery or collection.

This is a product only quote. Installation is not included.

Payment of the deposit is confirmation of items and acceptance of our terms and conditions.`],
    ['In Stock Items', 'Attach to the bottom of all quotes', `This item is currently in stock. Stock items are sold on a “first in, first serve basis”. A payment is required to secure stock. This quote does not include holding of stock.

To proceed with an order, please refer to our bank transfer/account details on your quote.

Otherwise, we are happy to send you through a secure credit card payment link, which is valid for 24 hours.

Full payment is required prior to scheduling delivery or collection.`],
    ['Selling Showroom Model Products', 'Attach to the bottom of all quotes', `Discounted as ex-showroom. Shop soiling and/or scratches may have incurred.

Purchased as seen. No returns, refunds or exchanges.`],
    ['Post to Wall Blinds', 'For wall mounted pergolas', `Post to wall blinds for Wall mounted pergolas

This is an indicative quote on pricing. This quote will need to be redone once the pergola is installed to get exact measurements.

No payment required at this stage.

Any installation charges are based on ground floor installations. Other installations are on a case-by-case basis.

Extra charges may be incurred for extra work required in materials and labour outside of a standard basic installation or should any unexpected issues arise during installation. This will be discussed with you and invoiced same-day.`]
  ];

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };

  function deliveryLabel() {
    const labelText = element => clean(Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join(' ')).replace(/[:*]+$/, '').trim().toLowerCase();
    return Array.from(document.querySelectorAll('label, legend, td, th, div, span, p'))
      .filter(visible)
      .filter(element => !element.closest(`#${ROOT_ID}`))
      .filter(element => labelText(element) === 'delivery instructions' || clean(element.textContent).replace(/[:*]+$/, '').trim().toLowerCase() === 'delivery instructions')
      .sort((left, right) => left.children.length - right.children.length)[0] || null;
  }

  function deliveryField() {
    const label = deliveryLabel();
    if (!label) return null;
    const contained = label.querySelector?.('textarea, input:not([type="hidden"]), [contenteditable="true"]');
    if (contained) return contained;
    const linked = label.htmlFor && document.getElementById(label.htmlFor);
    if (linked?.matches('textarea,input,[contenteditable="true"]')) return linked;
    const labelRect = label.getBoundingClientRect();
    return Array.from(document.querySelectorAll('textarea, input:not([type="hidden"]), [contenteditable="true"]'))
      .filter(visible)
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => item.rect.top >= labelRect.top - 10 && item.rect.top <= labelRect.bottom + 70 && item.rect.right > labelRect.left)
      .sort((a, b) => Math.abs(a.rect.top - labelRect.bottom) - Math.abs(b.rect.top - labelRect.bottom))[0]?.field || null;
  }

  function setValue(field, value) {
    field.focus();
    if (field.isContentEditable) field.textContent = value;
    else {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(field, value); else field.value = value;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch (_) {}
  }

  function createUi() {
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial;font-family:Arial,sans-serif}.shade{display:none;position:fixed;inset:0;z-index:2147483647;align-items:flex-start;justify-content:center;padding:65px 14px;background:rgba(12,29,54,.4);box-sizing:border-box}.shade.open{display:flex}.panel{width:min(620px,calc(100vw - 28px));max-height:calc(100vh - 100px);overflow:auto;background:#eef4fb;border:1px solid #9db3d2;border-radius:9px;box-shadow:0 22px 55px rgba(8,34,74,.3)}.head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;color:#fff;background:#0b3978}.head h2{margin:0;font-size:19px}.close{border:0;border-radius:5px;padding:6px 10px;color:#0b3978;background:#fff;font-weight:800;cursor:pointer}.list{display:grid;gap:10px;padding:13px}.card{padding:13px;background:#fff;border:1px solid #c2d2e6;border-radius:7px}.card h3{margin:0;color:#172b49;font-size:15px}.card p{margin:4px 0 10px;color:#526987;font-size:12px;font-weight:700}.actions{display:flex;gap:8px}.actions button{padding:8px 11px;border:1px solid #0b3978;border-radius:5px;color:#0b3978;background:#fff;font-weight:800;cursor:pointer}.actions .fill{color:#fff;background:#0b3978}.status{min-height:18px;padding:0 14px 12px;color:#087f5b;font-weight:700}</style>
      <div class="shade"><div class="panel"><div class="head"><h2>Quote Memo Info</h2><button class="close">Close</button></div><div class="list">${MEMOS.map((memo, index) => `<div class="card"><h3>${memo[0]}</h3><p>${memo[1]}</p><div class="actions"><button data-copy="${index}">Copy</button><button class="fill" data-fill="${index}">Fill Delivery Instructions</button></div></div>`).join('')}</div><div class="status"></div></div></div>`;
    const shade = shadow.querySelector('.shade');
    shadow.querySelector('.close').addEventListener('click', () => shade.classList.remove('open'));
    shade.addEventListener('click', event => { if (event.target === shade) shade.classList.remove('open'); });
    shadow.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      await copy(MEMOS[Number(button.dataset.copy)][2]);
      shadow.querySelector('.status').textContent = 'Memo copied.';
    }));
    shadow.querySelectorAll('[data-fill]').forEach(button => button.addEventListener('click', async () => {
      const text = MEMOS[Number(button.dataset.fill)][2];
      const field = deliveryField();
      await copy(text);
      if (!field) { shadow.querySelector('.status').textContent = 'Delivery Instructions was not found; memo copied instead.'; return; }
      setValue(field, text);
      shadow.querySelector('.status').textContent = 'Delivery Instructions filled and memo copied.';
      setTimeout(() => shade.classList.remove('open'), 500);
    }));
  }

  function placeButton() {
    createUi();
    const label = deliveryLabel();
    if (!label || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Quote Memo Info';
    button.style.cssText = 'margin-left:10px;padding:6px 10px;border:1px solid #0b3978;border-radius:5px;color:#fff;background:#0b3978;font:700 12px Arial,sans-serif;cursor:pointer;';
    button.addEventListener('click', () => document.getElementById(ROOT_ID).shadowRoot.querySelector('.shade').classList.add('open'));
    label.appendChild(button);
  }

  placeButton();
  [400, 1200, 3000, 6000].forEach(delay => setTimeout(placeButton, delay));
  new MutationObserver(() => { if (!document.getElementById(BUTTON_ID)) placeButton(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
