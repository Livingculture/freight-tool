// ==UserScript==
// @name         Omni Living Culture Installation Fee Helper
// @namespace    livingculture-omni
// @version      0.1.2
// @description  Loads Living Culture installation fees and adds the selected SKU and price to Cin7 Omni.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-install-fee-helper.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-install-fee-helper.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1rf8L1DDLwE6GQuFFarxMlcA1rUjRVVxKJwsLL6htDOY/export?format=csv&gid=1998708271';
  const ROOT_ID = 'lc-omni-install-fee-root';
  const BUTTON_ID = 'lc-omni-install-fee-button';
  const CACHE_KEY = 'lc-omni-install-fees-v1';
  let items = [];

  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }
  function pageElements(selector = 'body *') {
    return Array.from(document.querySelectorAll(selector)).filter(visible).filter(element => !element.closest(`#${ROOT_ID}`) && element.id !== BUTTON_ID);
  }
  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function parseCsvLine(line) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { values.push(value); value = ''; }
      else value += char;
    }
    values.push(value);
    return values;
  }
  function parseCsv(raw) {
    const rows = String(raw || '').split(/\r?\n/).filter(Boolean).map(parseCsvLine);
    const start = rows.findIndex(row => /product\s*code/i.test(row[0]) && /^name$/i.test(clean(row[1])));
    return rows.slice(start >= 0 ? start + 1 : 1).map(row => ({ code: clean(row[0]), name: clean(row[1]), price: clean(row[2]) })).filter(item => item.code && item.name && item.price !== '');
  }
  function requestText(url) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'GET', url: `${url}&cache=${Date.now()}`, timeout: 20000,
      onload: response => response.status >= 200 && response.status < 300 ? resolve(response.responseText || '') : reject(new Error(`Google Sheet returned ${response.status}`)),
      ontimeout: () => reject(new Error('Google Sheet request timed out')),
      onerror: () => reject(new Error('Could not load Google Sheet'))
    }));
  }
  async function loadItems() {
    const source = document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('source');
    if (source) source.textContent = 'Loading Google Sheet pricing…';
    try {
      const raw = await requestText(SHEET_URL);
      const loaded = parseCsv(raw);
      if (!loaded.length) throw new Error('No installation fees found');
      items = loaded;
      localStorage.setItem(CACHE_KEY, raw);
      if (source) source.textContent = 'Google Sheet pricing loaded';
    } catch (error) {
      items = parseCsv(localStorage.getItem(CACHE_KEY) || '');
      if (source) source.textContent = items.length ? 'Using cached Google Sheet pricing' : error.message;
    }
    filterRows();
  }
  function money(value) {
    const number = Number(String(value).replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number.toLocaleString('en-NZ', { maximumFractionDigits: 0 }) : value;
  }
  function filterRows() {
    const shadow = document.getElementById(ROOT_ID)?.shadowRoot;
    if (!shadow) return;
    const query = clean(shadow.getElementById('search')?.value).toLowerCase();
    const filtered = items.filter(item => !query || `${item.code} ${item.name} ${item.price}`.toLowerCase().includes(query));
    shadow.getElementById('count').textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
    shadow.getElementById('rows').innerHTML = filtered.map((item, index) => `
      <tr><td><button type="button" data-index="${index}">Add</button></td><td class="code">${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td class="price">$${escapeHtml(money(item.price))}</td></tr>
    `).join('');
    shadow.getElementById('rows').querySelectorAll('button').forEach((button, index) => button.addEventListener('click', () => addItem(filtered[index])));
  }
  function exactElement(text) {
    const wanted = clean(text).toLowerCase();
    return pageElements('body *').filter(element => clean(element.value || element.textContent).toLowerCase() === wanted).sort((a, b) => a.children.length - b.children.length)[0] || null;
  }
  function header(text) {
    const element = exactElement(text);
    return element ? element.getBoundingClientRect() : null;
  }
  function setValue(field, value) {
    if (!field) return false;
    field.focus();
    if (field.isContentEditable) field.textContent = value;
    else {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(field, value); else field.value = value;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: String(value).slice(-1) }));
    return true;
  }
  function clickAt(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })));
    return element;
  }
  function fieldNear(x, y) {
    const active = document.activeElement;
    if (active && (/^(INPUT|TEXTAREA)$/i.test(active.tagName) || active.isContentEditable)) {
      const rect = active.getBoundingClientRect();
      if (Math.abs(rect.left + rect.width / 2 - x) < 260 && Math.abs(rect.top + rect.height / 2 - y) < 90) return active;
    }
    return pageElements('input:not([type="hidden"]), textarea, [contenteditable="true"]')
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => Math.abs(item.rect.left + item.rect.width / 2 - x) < 260 && Math.abs(item.rect.top + item.rect.height / 2 - y) < 90)
      .sort((a, b) => Math.abs(a.rect.top + a.rect.height / 2 - y) - Math.abs(b.rect.top + b.rect.height / 2 - y))[0]?.field || null;
  }
  function emptyCodeField() {
    const code = header('Code');
    if (!code) return null;
    const codeHeader = exactElement('Code');
    const headerCell = codeHeader?.closest('th,td');
    const headerRow = headerCell?.closest('tr');
    const table = headerRow?.closest('table');
    if (headerCell && headerRow && table) {
      const columnIndex = Array.from(headerRow.children).indexOf(headerCell);
      const cells = Array.from(table.querySelectorAll('tr')).slice(1)
        .map(row => row.children[columnIndex])
        .filter(cell => cell && visible(cell));
      const emptyCell = cells.find(cell => {
        const value = clean(cell.querySelector('input,textarea')?.value || cell.textContent);
        return !value || /^search\.{0,3}$/i.test(value);
      });
      if (emptyCell) return { field: emptyCell, value: clean(emptyCell.textContent), placeholder: '', rect: emptyCell.getBoundingClientRect() };
    }
    return pageElements('body *')
      .map(field => ({
        field,
        value: clean(field.value || field.textContent),
        placeholder: clean(field.placeholder),
        rect: field.getBoundingClientRect()
      }))
      .filter(item => item.rect.top > code.bottom && item.rect.left < code.right + 20 && item.rect.right > code.left - 20)
      .filter(item => /^search\.{0,3}$/i.test(item.value) || /search/i.test(item.placeholder))
      .sort((a, b) => a.rect.top - b.rect.top || a.field.children.length - b.field.children.length)[0] || null;
  }
  async function chooseDropdown(sku, input) {
    const wanted = sku.toLowerCase();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 150));
      const inputRect = input.getBoundingClientRect();
      const option = pageElements('[role="option"], li, a, div, span')
        .filter(element => {
          const value = clean(element.textContent).toLowerCase();
          return value === wanted || value.startsWith(`${wanted} `) || value.startsWith(`${wanted}-`) || value.startsWith(`${wanted}\n`);
        })
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.top >= inputRect.bottom - 8 && rect.top < inputRect.bottom + 420 && rect.right > inputRect.left - 80 && rect.left < inputRect.right + 520;
        })
        .sort((a, b) => a.children.length - b.children.length || a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      if (option) {
        option.scrollIntoView({ block: 'nearest' });
        const rect = option.getBoundingClientRect();
        option.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true, pointerId:1, pointerType:'mouse', clientX:rect.left + 12, clientY:rect.top + rect.height / 2 }));
        option.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, clientX:rect.left + 12, clientY:rect.top + rect.height / 2 }));
        option.click();
        return true;
      }
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    return false;
  }
  function toast(message, error = false) {
    const element = document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', error);
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 2600);
  }
  async function addItem(item) {
    const empty = emptyCodeField();
    if (!empty) { toast('No empty Omni product line was found.', true); return; }
    close();
    const rowY = empty.rect.top + empty.rect.height / 2;
    clickAt(empty.rect.left + empty.rect.width / 2, rowY);
    await new Promise(resolve => setTimeout(resolve, 350));
    const codeInput = fieldNear(empty.rect.left + empty.rect.width / 2, rowY);
    if (!codeInput) { toast('Could not open the Omni Code search field.', true); return; }
    setValue(codeInput, item.code);
    await chooseDropdown(item.code, codeInput);
    await new Promise(resolve => setTimeout(resolve, 900));
    const price = header('Unit Price') || header('Price');
    if (price) {
      const x = price.left + price.width / 2;
      clickAt(x, rowY);
      await new Promise(resolve => setTimeout(resolve, 180));
      const priceInput = fieldNear(x, rowY);
      if (priceInput) setValue(priceInput, String(item.price).replace(/[^\d.]/g, ''));
    }
    toast(`Added ${item.code} at $${money(item.price)}`);
  }
  function close() { document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('modal')?.classList.remove('open'); }
  function open() {
    const shadow = ensureRoot().shadowRoot;
    shadow.getElementById('modal').classList.add('open');
    shadow.getElementById('search').focus();
    loadItems();
  }
  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div'); root.id = ROOT_ID; document.body.appendChild(root);
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; font-family: Arial,sans-serif; }
        #modal { position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:flex-end;padding:18px;background:rgba(14,30,54,.22); }
        #modal.open { display:flex; } .panel { display:flex;flex-direction:column;width:min(680px,92vw);max-height:88vh;overflow:hidden;background:#fff;border:1px solid #9db3d2;border-radius:8px;box-shadow:0 18px 48px rgba(15,46,106,.25); }
        .head { display:flex;justify-content:space-between;align-items:center;padding:12px 14px;color:#fff;background:#13377e; } h2 { margin:0;font-size:18px; } .close { width:30px;height:30px;color:#162947;background:#e7eef8;border:0;border-radius:5px;font-size:20px;cursor:pointer; }
        .tools { display:grid;grid-template-columns:1fr auto;gap:9px;padding:10px 12px;border-bottom:1px solid #dce5f1; } #search { height:36px;padding:0 10px;border:1px solid #9db3d2;border-radius:4px;font:14px Arial; } #count { align-self:center;color:#4c6485;font-size:12px;font-weight:700; }
        #source { padding:0 12px 8px;color:#34577f;font-size:11px;font-weight:700; } .wrap { overflow:auto; } table { width:100%;border-collapse:collapse;font-size:12px; } th { position:sticky;top:0;padding:7px;background:#eef3fa;color:#162947;text-align:left; } td { padding:6px 7px;border-bottom:1px solid #e1e7ef; } td button { padding:5px 10px;color:#fff;background:#13377e;border:0;border-radius:4px;font-weight:700;cursor:pointer; } .code,.price { white-space:nowrap;font-weight:800; }
        #toast { position:fixed;right:24px;bottom:24px;z-index:2147483647;display:none;padding:11px 14px;color:#fff;background:#286d53;border-radius:6px;font:700 13px Arial;box-shadow:0 10px 25px rgba(0,0,0,.2); } #toast.show { display:block; } #toast.error { background:#9a2d20; }
      </style>
      <div id="modal"><div class="panel"><div class="head"><h2>Installation Fees</h2><button class="close" type="button">×</button></div><div class="tools"><input id="search" placeholder="Search code, service or price"><div id="count"></div></div><div id="source"></div><div class="wrap"><table><thead><tr><th></th><th>Code</th><th>Installation service</th><th>Price</th></tr></thead><tbody id="rows"></tbody></table></div></div></div><div id="toast"></div>`;
    shadow.querySelector('.close').addEventListener('click', close);
    shadow.getElementById('modal').addEventListener('click', event => { if (event.target.id === 'modal') close(); });
    shadow.getElementById('search').addEventListener('input', filterRows);
    return root;
  }
  function getButton() {
    let button = document.getElementById(BUTTON_ID);
    if (!button) { button = document.createElement('button'); button.id = BUTTON_ID; button.type = 'button'; button.textContent = 'Install Fees'; button.addEventListener('click', open); document.body.appendChild(button); }
    return button;
  }
  function anchorElement() {
    return document.getElementById('lc-omni-custom-comments-button') || pageElements('input,button,a,[role="button"]').find(element => /add\s+a\s+new\s+line/i.test(clean(element.value || element.textContent))) || exactElement('Add a new line');
  }
  function placeButton() {
    const button = getButton();
    const anchor = anchorElement();
    button.style.cssText = 'position:fixed;left:390px;bottom:20px;z-index:2147483599;height:36px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;font:700 13px Arial,sans-serif;cursor:pointer;white-space:nowrap;';
    if (!anchor || !visible(anchor)) return;
    const rect = anchor.getBoundingClientRect();
    button.style.position = anchor.style.position === 'fixed' ? 'fixed' : 'absolute';
    button.style.left = `${(button.style.position === 'fixed' ? 0 : window.scrollX) + rect.right + 8}px`;
    button.style.top = `${(button.style.position === 'fixed' ? 0 : window.scrollY) + rect.top}px`;
    button.style.bottom = 'auto';
    button.style.height = `${Math.max(34, rect.height)}px`;
  }
  function boot() { ensureRoot(); placeButton(); }
  boot(); setInterval(placeButton, 1500); new MutationObserver(placeButton).observe(document.body, { childList:true, subtree:true });
  window.addEventListener('resize', placeButton); window.addEventListener('scroll', placeButton, { passive:true });
})();
