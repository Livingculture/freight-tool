// ==UserScript==
// @name         Omni Living Culture Custom Comments
// @namespace    livingculture-omni
// @version      0.1.5
// @description  Builds custom pergola comments and fills Omni internal and product-line comments.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-comments.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-comments.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'lc-omni-custom-comments-root';
  const BUTTON_ID = 'lc-omni-custom-comments-button';

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function pageElements(selector) {
    return Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .filter(element => !element.closest(`#${ROOT_ID}`) && element.id !== BUTTON_ID);
  }

  function exactText(text, selector = 'label, legend, span, div, td, th') {
    const wanted = clean(text).toLowerCase();
    return pageElements(selector)
      .filter(element => clean(element.textContent).toLowerCase() === wanted)
      .sort((a, b) => a.children.length - b.children.length || a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }

  function setValue(field, value) {
    if (!field) return false;
    if (field.isContentEditable || field.getAttribute('contenteditable') === 'true') {
      field.focus();
      field.textContent = value;
    } else {
      const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      field.focus();
      if (setter) setter.call(field, value);
      else field.value = value;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function findInternalComments() {
    const controls = pageElements('textarea, input:not([type="hidden"]), [contenteditable="true"]');
    const labels = exactText('Internal Comments');
    for (const label of labels) {
      const linked = label.htmlFor && document.getElementById(label.htmlFor);
      if (linked && controls.includes(linked)) return linked;
      const nested = label.parentElement?.querySelector('textarea, input:not([type="hidden"]), [contenteditable="true"]');
      if (nested && visible(nested)) return nested;
    }
    const candidates = labels.flatMap(label => {
      const rect = label.getBoundingClientRect();
      return controls.map(field => {
        const fieldRect = field.getBoundingClientRect();
        const vertical = Math.abs(fieldRect.top - rect.bottom);
        const horizontal = Math.abs(fieldRect.left - rect.left);
        return { field, fieldRect, score: vertical * 5 + horizontal };
      }).filter(item => item.fieldRect.top >= rect.top - 8 && item.fieldRect.top <= rect.bottom + 55 && item.fieldRect.right > rect.left);
    });
    return candidates.sort((a, b) => a.score - b.score)[0]?.field || null;
  }

  function findHeader(text) {
    return exactText(text, 'th, td, div, span')
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .sort((a, b) => b.rect.top - a.rect.top)[0] || null;
  }

  function firstProductRowY() {
    const codeHeader = findHeader('Code');
    if (!codeHeader) return 0;
    const pattern = /^[A-Z]{2,6}\d{3,}(?:-\d+)?(?:\([A-Z0-9-]+\))?$/i;
    const candidates = pageElements('input, textarea, td, div, span, a')
      .map(element => ({
        element,
        value: clean(/^(INPUT|TEXTAREA)$/i.test(element.tagName) ? element.value : element.textContent),
        rect: element.getBoundingClientRect()
      }))
      .filter(item => pattern.test(item.value) && item.rect.top > codeHeader.rect.bottom && item.rect.left < codeHeader.rect.right + 20 && item.rect.right > codeHeader.rect.left - 20)
      .sort((a, b) => a.rect.top - b.rect.top);
    const row = candidates[0]?.rect;
    return row ? row.top + row.height / 2 : 0;
  }

  function editableNear(x, y) {
    const active = document.activeElement;
    if (active && (/^(INPUT|TEXTAREA)$/i.test(active.tagName) || active.isContentEditable)) {
      const rect = active.getBoundingClientRect();
      if (Math.abs(rect.left + rect.width / 2 - x) < 240 && Math.abs(rect.top + rect.height / 2 - y) < 80) return active;
    }
    return pageElements('textarea, input:not([type="hidden"]), [contenteditable="true"]')
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => Math.abs(item.rect.left + item.rect.width / 2 - x) < 240 && Math.abs(item.rect.top + item.rect.height / 2 - y) < 80)
      .sort((a, b) => Math.abs(a.rect.top + a.rect.height / 2 - y) - Math.abs(b.rect.top + b.rect.height / 2 - y))[0]?.field || null;
  }

  async function findLineComment() {
    const commentsLabel = exactText('Comments', 'th, td, div, span')[0] || exactText('Comment', 'th, td, div, span')[0];
    const commentsHeader = commentsLabel?.closest('th,td');
    const headerRow = commentsHeader?.closest('tr');
    const table = headerRow?.closest('table');
    if (!commentsHeader || !headerRow || !table) return null;
    const headers = Array.from(headerRow.children);
    const commentsIndex = headers.indexOf(commentsHeader);
    const codeIndex = headers.findIndex(cell => /^code$/i.test(clean(cell.textContent)));
    const productRow = Array.from(table.querySelectorAll('tr')).slice(1).find(row => {
      const code = clean(row.children[codeIndex]?.querySelector('input,textarea')?.value || row.children[codeIndex]?.textContent);
      return code && !/^search/i.test(code);
    });
    const commentCell = productRow?.children[commentsIndex];
    if (!commentCell) return null;
    const cellRect = commentCell.getBoundingClientRect();
    const x = cellRect.left + Math.max(20, Math.min(cellRect.width / 2, 100));
    const y = cellRect.top + cellRect.height / 2;
    let field = editableNear(x, y);
    if (field) return field;
    const target = document.elementFromPoint(x, y);
    if (!target) return null;
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    return editableNear(x, y);
  }

  function buildComment(data) {
    const type = clean(data.customType) || (data.type === 'wall' ? 'Wall Mounted' : data.type === 'freestanding' ? 'Freestanding' : '');
    const lines = [];
    if (type) lines.push(type);
    if (clean(data.height)) lines.push(`Height:${clean(data.height)}mm`);
    if (clean(data.length)) lines.push(`Lenght:${clean(data.length)}mm`);
    if (clean(data.width)) lines.push(`Width:${clean(data.width)}mm`);
    if (clean(data.frameColour)) lines.push(`Frame Colour: ${clean(data.frameColour)}`);
    if (clean(data.louvreColour)) lines.push(`Louvre Colour:${clean(data.louvreColour)}`);
    if (clean(data.notes)) lines.push(clean(data.notes));
    return lines.join('\n');
  }

  function formData() {
    const shadow = document.getElementById(ROOT_ID)?.shadowRoot;
    return {
      type: shadow?.getElementById('wall')?.checked ? 'wall' : shadow?.getElementById('free')?.checked ? 'freestanding' : '',
      customType: shadow?.getElementById('custom-type')?.value || '',
      height: shadow?.getElementById('height')?.value || '',
      length: shadow?.getElementById('length')?.value || '',
      width: shadow?.getElementById('width')?.value || '',
      frameColour: shadow?.getElementById('frame')?.value || '',
      louvreColour: shadow?.getElementById('louvre')?.value || '',
      notes: shadow?.getElementById('notes')?.value || ''
    };
  }

  async function copy(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => {});
    const field = document.createElement('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }

  function status(message, error = false) {
    const element = document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('status');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', error);
  }

  function close() {
    document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('modal')?.classList.remove('open');
  }

  async function fill() {
    const text = buildComment(formData());
    if (!text) {
      status('Enter at least one custom comment detail.', true);
      return;
    }
    await copy(text);
    const internalFilled = setValue(findInternalComments(), text);
    const lineField = await findLineComment();
    const lineFilled = setValue(lineField, text);
    if (internalFilled && lineFilled) {
      status('Filled Internal Comments and the first product line.');
      setTimeout(close, 500);
    } else if (internalFilled || lineFilled) {
      status('Filled one comment field; text was copied for the other.', true);
    } else {
      status('Could not find the Omni comment fields; text was copied.', true);
    }
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; font-family: Arial, sans-serif; }
        #modal { position: fixed; inset: 0; z-index: 2147483647; display: none; align-items: flex-start; justify-content: center; padding-top: 72px; background: rgba(14,30,54,.28); box-sizing: border-box; }
        #modal.open { display: flex; }
        .panel { width: min(450px, calc(100vw - 28px)); overflow: hidden; color: #162947; background: #fff; border: 1px solid #9db3d2; border-radius: 8px; box-shadow: 0 22px 54px rgba(15,46,106,.25); }
        .head { display: flex; align-items: center; justify-content: space-between; padding: 13px 15px; color: #fff; background: #13377e; }
        h2 { margin: 0; font-size: 18px; }
        .close { width: 30px; height: 30px; color: #162947; background: #e7eef8; border: 0; border-radius: 6px; font-size: 21px; cursor: pointer; }
        form { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; padding: 15px; }
        label { display: grid; gap: 4px; color: #34577f; font-size: 12px; font-weight: 700; }
        .full, .types, .actions, #status { grid-column: 1 / -1; }
        .types { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .type { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 10px; color: #162947; background: #f7f9fc; border: 1px solid #b8c9e1; border-radius: 4px; font-weight: 700; }
        input { box-sizing: border-box; width: 100%; height: 38px; padding: 0 9px; color: #162947; background: #fff; border: 1px solid #9db3d2; border-radius: 4px; font: 14px Arial, sans-serif; }
        input[type="checkbox"] { width: 16px; height: 16px; accent-color: #13377e; }
        input:focus { outline: 2px solid rgba(19,55,126,.18); border-color: #13377e; }
        #status { min-height: 18px; color: #286d53; font-size: 12px; font-weight: 700; }
        #status.error { color: #9a2d20; }
        .actions { display: flex; justify-content: flex-end; gap: 8px; }
        .actions button { min-height: 38px; padding: 0 14px; border-radius: 4px; font: 700 14px Arial, sans-serif; cursor: pointer; }
        .copy { color: #162947; background: #fff; border: 1px solid #9db3d2; }
        .fill { color: #fff; background: #13377e; border: 1px solid #13377e; }
      </style>
      <div id="modal" role="dialog" aria-modal="true">
        <div class="panel">
          <div class="head"><h2>Custom Comments</h2><button type="button" class="close">×</button></div>
          <form>
            <div class="types">
              <label class="type"><input type="checkbox" id="free" checked> Freestanding</label>
              <label class="type"><input type="checkbox" id="wall"> Wall Mounted</label>
            </div>
            <label class="full">Custom type (used if both boxes are unticked)<input id="custom-type" placeholder="Enter another type"></label>
            <label>Height (mm)<input id="height" inputmode="numeric"></label>
            <label>Length (mm)<input id="length" inputmode="numeric"></label>
            <label>Width (mm)<input id="width" inputmode="numeric"></label>
            <label>Frame colour<input id="frame"></label>
            <label>Louvre colour<input id="louvre"></label>
            <label>Additional notes<input id="notes"></label>
            <div id="status"></div>
            <div class="actions"><button type="button" class="copy">Copy</button><button type="submit" class="fill">Fill comments</button></div>
          </form>
        </div>
      </div>`;
    const free = shadow.getElementById('free');
    const wall = shadow.getElementById('wall');
    free.addEventListener('change', () => { if (free.checked) wall.checked = false; });
    wall.addEventListener('change', () => { if (wall.checked) free.checked = false; });
    shadow.querySelector('.close').addEventListener('click', close);
    shadow.getElementById('modal').addEventListener('click', event => { if (event.target.id === 'modal') close(); });
    shadow.querySelector('.copy').addEventListener('click', async () => { const text = buildComment(formData()); await copy(text); status('Copied custom comments.'); });
    shadow.querySelector('form').addEventListener('submit', event => { event.preventDefault(); fill(); });
    return root;
  }

  function open() {
    const root = ensureRoot();
    root.shadowRoot.getElementById('modal').classList.add('open');
    status('');
    setTimeout(() => root.shadowRoot.getElementById('height')?.focus(), 50);
  }

  function placeButton() {
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Custom Comments';
      button.addEventListener('click', open);
      document.body.appendChild(button);
    }
    button.style.cssText = 'position:fixed;left:240px;bottom:20px;z-index:2147483600;box-sizing:border-box;height:36px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;font:700 13px Arial,sans-serif;cursor:pointer;white-space:nowrap;';

    const anchor = pageElements('input, button, a, [role="button"]')
      .find(element => /^add\s+a\s+new\s+line$/i.test(clean(element.value || element.textContent))) ||
      exactText('Add a new line', 'body *')[0] ||
      pageElements('body *').find(element => /^add\s+a\s+new\s+line$/i.test(clean(element.textContent)));
    if (!anchor) return;
    if (button.parentElement !== document.body) document.body.appendChild(button);
    const rect = anchor.getBoundingClientRect();
    button.style.cssText = `position:absolute;left:${window.scrollX + rect.right + 8}px;top:${window.scrollY + rect.top}px;z-index:60;box-sizing:border-box;height:${Math.max(34, rect.height)}px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;font:700 13px Arial,sans-serif;cursor:pointer;white-space:nowrap;`;
  }

  function boot() {
    ensureRoot();
    placeButton();
  }

  boot();
  setInterval(placeButton, 1500);
  new MutationObserver(placeButton).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', placeButton);
  window.addEventListener('scroll', placeButton, { passive: true });
})();
