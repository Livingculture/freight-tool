// ==UserScript==
// @name         Omni Living Culture Installation Fee Helper
// @namespace    livingculture-omni
// @version      0.1.14
// @description  Automatically matches pergola and blind installation fees in Cin7 Omni, with a manual installation fee picker.
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
  let addingMatchedFees = false;
  let observedQuoteKey = '', observedSince = 0, processedQuoteKey = '';
  let feesLoading = null;

  function dimensions(text) {
    const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\b/i);
    if (!match) return null;
    const unit = match[4] || match[2] || 'm';
    const metres = (value, units) => Number(value) / (units === 'mm' ? 1000 : units === 'cm' ? 100 : 1);
    const width = metres(match[1], (match[2] || unit).toLowerCase());
    const length = metres(match[3], (match[4] || unit).toLowerCase());
    return width > 0 && length > 0 ? { width, length, area: Math.round(width * length * 10000) / 10000 } : null;
  }
  function pergolaDetails(text, sizeText = '') {
    const model = clean(text).match(/\b(mediterranean[ -]*(?:pro[ -]*max|sky)|atlantic|baltic|caspian|caribbean|tasman|pacific|dover)\b/i)?.[0];
    const mounting = /\bfree[ -]?standing\b/i.test(text) ? 'freestanding' : /\bwall[ -]*(?:mount(?:ed)?|mout)\b/i.test(text) ? 'wall' : '';
    const operation = /\bmanual\b/i.test(text) ? 'manual' : /\b(?:motori[sz]ed|lotorised)\b/i.test(text) ? 'motorised' : '';
    const size = dimensions(sizeText) || dimensions(text);
    if (!model || !mounting || !operation || !size) return null;
    return { model: model.toLowerCase().replace(/[ -]/g, ''), mounting, operation, ...size };
  }
  function matchingFee(line, fees) {
    if (/\bblinds?\b/i.test(line.name)) return matchingBlindFee(line, fees);
    const details = pergolaDetails(line.name, line.options);
    if (!details || !/\bpergola\b/i.test(line.name) || /^AS/i.test(line.code)) return null;
    const matches = fees.filter(item => {
      const fee = pergolaDetails(item.name, line.options);
      if (!fee || fee.model !== details.model || fee.mounting !== details.mounting || fee.operation !== details.operation) return false;
      const range = item.name.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*m(?:\u00b2|2|\^2)/i);
      if (range) return details.area >= Number(range[1]) && details.area <= Number(range[2]);
      const upper = item.name.match(/up\s+to\s+(\d+(?:\.\d+)?)\s*m(?:\u00b2|2|\^2)/i);
      if (upper) return details.area <= Number(upper[1]);
      // Pacific fees list exact footprints rather than area bands.
      return item.name.split('/').some(part => {
        const size = dimensions(part);
        return size && ((size.width === details.width && size.length === details.length) || (size.width === details.length && size.length === details.width));
      });
    });
    return matches.length === 1 ? { ...matches[0], area: details.area } : null;
  }
  function blindWidth(text) {
    if (dimensions(text)) return null;
    const widths = [...String(text || '').matchAll(/\b(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/gi)];
    if (widths.length !== 1) return /^\d+(?:\.\d+)?$/.test(clean(text)) && Number(text) > 0 ? Number(text) : null;
    const match = widths[0];
    const width = Number(match[1]) / (match[2].toLowerCase() === 'mm' ? 1000 : match[2].toLowerCase() === 'cm' ? 100 : 1);
    return width > 0 ? width : null;
  }
  function blindOperation(text) {
    if (/\bmotori[sz]ed\b/i.test(text)) return 'motorised';
    if (/\bmanual\b|\bretractable shade\b/i.test(text)) return 'manual';
    return '';
  }
  function blindMounting(text) {
    if (/\bpost\s*(?:to|-)\s*post\b/i.test(text)) return 'post';
    if (/\bpost\s*(?:to|-)\s*wall\b|\bwall[ -]*mount(?:ed)?\b/i.test(text)) return 'wall';
    return 'post';
  }
  function matchingBlindFee(line, fees) {
    if (/^AS/i.test(line.code) || !/\bblinds?\b/i.test(line.name)) return null;
    const width = blindWidth(line.options) ?? (!dimensions(line.options) ? blindWidth(line.name) : null);
    const operation = blindOperation(line.name);
    if (!width || !operation) return null;
    const mounting = blindMounting(`${line.options} ${line.name}`);
    const matches = fees.filter(item => {
      if (!/\bblind\b/i.test(item.name) || /call\s*out|cutting|programme/i.test(item.name)) return false;
      if (blindOperation(item.name) !== operation) return false;
      if (operation === 'manual' && blindMounting(item.name) !== mounting) return false;
      const upper = item.name.match(/\b(?:under|up to|less than)\s+(\d+(?:\.\d+)?)\s*m\b/i);
      const lower = item.name.match(/\b(?:over|greater than)\s+(\d+(?:\.\d+)?)\s*m\b/i);
      return upper ? width <= Number(upper[1]) : lower ? width >= Number(lower[1]) : false;
    });
    return matches.length === 1 ? { ...matches[0], width } : null;
  }
  function assemblyProduct(line) {
    return !/^AS/i.test(line.code) && /\b(?:pergola|blinds?)\b/i.test(line.name);
  }
  function quoteTableInfo() {
    for (const row of pageElements('table tr')) {
      const headings = [...row.children].map(cell => clean(cell.textContent).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^\d+/, ''));
      if (!headings.includes('code') || !headings.includes('product') || !headings.includes('qtyordered')) continue;
      return { table: row.closest('table'), headingRow: row, headings };
    }
    return null;
  }
  function cellValue(line, headings, key) {
    const cell = line.children[headings.indexOf(key)];
    return clean(cell?.querySelector('input,textarea,select')?.value || cell?.textContent);
  }
  function hideEmptyOptions() {
    const info = quoteTableInfo();
    if (!info) return;
    const className = 'lc-omni-empty-option';
    if (!document.getElementById('lc-omni-empty-option-style')) {
      const style = document.createElement('style');
      style.id = 'lc-omni-empty-option-style';
      style.textContent = `.${className}, .${className} * { color: transparent !important; text-shadow: none !important; }`;
      (document.head || document.documentElement).appendChild(style);
    }
    for (const row of info.table.querySelectorAll('tr')) {
      if (row === info.headingRow) continue;
      for (const key of ['option1', 'option2']) {
        const cell = row.children[info.headings.indexOf(key)];
        if (!cell) continue;
        const editing = cell.querySelector('input,textarea,[contenteditable="true"]');
        cell.classList.toggle(className, !editing && /^#n\/a$/i.test(clean(cell.textContent)));
      }
    }
  }
  function quoteLines() {
    const info = quoteTableInfo();
    if (!info) return [];
    const { table, headingRow, headings } = info;
    return [...table.querySelectorAll('tr')].filter(line => line !== headingRow).map(line => ({
        code: cellValue(line, headings, 'code'), name: cellValue(line, headings, 'product'),
        options: ['option1', 'option2', 'option3'].map(key => cellValue(line, headings, key)).join(' '),
        quantity: Number(cellValue(line, headings, 'qtyordered').replace(/,/g, ''))
      })).filter(line => line.code && line.quantity > 0);
  }
  function matchedFeePlan(lines, fees) {
    const required = new Map();
    const unmatched = [];
    for (const line of lines) {
      if (!assemblyProduct(line)) continue;
      const fee = matchingFee(line, fees);
      if (!fee) { unmatched.push(line); continue; }
      const existing = required.get(fee.code);
      if (existing) existing.quantity += line.quantity;
      else required.set(fee.code, { ...fee, quantity: line.quantity });
    }
    for (const line of lines) {
      if (!line.name || /^search\.{0,3}$/i.test(line.name)) continue;
      const fee = required.get(line.code.toUpperCase());
      if (fee) fee.quantity -= line.quantity;
    }
    return { fees: [...required.values()].filter(fee => fee.quantity > 0), unmatched };
  }

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
  function group(item) {
    const text = `${item.code} ${item.name}`.toLowerCase();
    if (/call out|assessment|warranty|electrician/.test(text)) return '01_COMMON / CALL OUTS';
    if (text.includes('atlantic')) return '02_01_PERGOLAS / ATLANTIC';
    if (text.includes('baltic')) return '02_02_PERGOLAS / BALTIC';
    if (text.includes('caspian')) return '02_03_PERGOLAS / CASPIAN';
    if (text.includes('caribbean')) return '02_04_PERGOLAS / CARIBBEAN';
    if (text.includes('tasman')) return '02_05_PERGOLAS / TASMAN';
    if (text.includes('pacific')) return '02_06_PERGOLAS / PACIFIC';
    if (/mediterranean(?:-sky)?/.test(text)) return '02_07_PERGOLAS / MEDITERRANEAN-SKY';
    if (text.includes('pergola')) return '02_99_PERGOLAS / OTHER';
    if (/flashing|bracket|timber|concrete|joists|gutter|cutting/.test(text)) return '03_SITE PREP / BRACKETS / FLASHING';
    if (/blind|privacy|shutter|sliding door|bifold|glass|tongue|slatted/.test(text)) return '04_BLINDS / WALLS / DOORS';
    if (/window|door cover|awning|patiocover|carport/.test(text)) return '05_AWNINGS / PATIO COVERS / CARPORTS';
    if (/fence|gate|pool|lincoln|roosevelt/.test(text)) return '06_FENCING / GATES';
    return '07_OTHER';
  }
  function filterRows() {
    const shadow = document.getElementById(ROOT_ID)?.shadowRoot;
    if (!shadow) return;
    const query = clean(shadow.getElementById('search')?.value).toLowerCase();
    const filtered = items.filter(item => !query || `${item.code} ${item.name} ${item.price}`.toLowerCase().includes(query));
    const displayItems = [...filtered].sort((a, b) => group(a).localeCompare(group(b)) || a.name.localeCompare(b.name));
    shadow.getElementById('count').textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
    let lastGroup = '';
    shadow.getElementById('rows').innerHTML = displayItems.map(item => {
      const itemGroup = group(item);
      const heading = itemGroup !== lastGroup ? `<tr class="group"><td colspan="4">${escapeHtml(itemGroup.replace(/^\d+(?:_\d+)?_/, ''))}</td></tr>` : '';
      lastGroup = itemGroup;
      return `${heading}<tr><td><button type="button" data-index="${filtered.indexOf(item)}">Add</button></td><td class="code">${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td class="price">$${escapeHtml(money(item.price))}</td></tr>`;
    }).join('');
    shadow.getElementById('rows').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      if (!addingMatchedFees) void addItem(filtered[Number(button.dataset.index)]);
    }));
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
      if (x >= rect.left - 12 && x <= rect.right + 12 && y >= rect.top - 12 && y <= rect.bottom + 12) return active;
    }
    return pageElements('input:not([type="hidden"]), textarea, [contenteditable="true"]')
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => x >= item.rect.left - 12 && x <= item.rect.right + 12 && Math.abs(item.rect.top + item.rect.height / 2 - y) < 90)
      .sort((a, b) => Math.hypot(a.rect.left + a.rect.width / 2 - x, a.rect.top + a.rect.height / 2 - y) - Math.hypot(b.rect.left + b.rect.width / 2 - x, b.rect.top + b.rect.height / 2 - y))[0]?.field || null;
  }
  function emptyCodeField(sku = '') {
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
      const productIndex = Array.from(headerRow.children).findIndex(cell => clean(cell.textContent).replace(/[^a-z]/gi, '').toLowerCase() === 'product');
      const unfinished = sku && cells.find(cell => {
        const value = clean(cell.querySelector('input,textarea')?.value || cell.textContent);
        const product = cell.parentElement.children[productIndex];
        const name = clean(product?.querySelector('input,textarea')?.value || product?.textContent);
        return value.toUpperCase() === sku.toUpperCase() && product && (!name || /^search\.{0,3}$/i.test(name));
      });
      if (unfinished) return { field: unfinished, rect: unfinished.getBoundingClientRect() };
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
  async function chooseDropdown(sku, input, confirmed = () => false) {
    const wanted = sku.toLowerCase();
    let lastSelectionAt = 0;
    const startedAt = Date.now();
    let commitAttempts = 0;
    const commitCode = () => {
      if (!input.isConnected || input.disabled || input.getAttribute('aria-busy') === 'true' || clean(input.value).toLowerCase() !== wanted) return false;
      if (document.activeElement !== input && document.activeElement !== document.body) return false;
      sendKey(input, 'Enter', 13);
      commitAttempts += 1;
      return true;
    };
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 60));
      if (confirmed()) return true;
      if (!input.isConnected) continue;
      const inputRect = input.getBoundingClientRect();
      const quoteTable = quoteTableInfo()?.table;
      const option = pageElements('[role="option"], li, a, div, span, td')
        .filter(element => element.closest('table') !== quoteTable)
        .filter(element => {
          const value = clean(element.textContent).toLowerCase();
          return value === wanted || value.startsWith(`${wanted} `);
        })
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.height <= 120 && rect.top >= inputRect.top - 420 && rect.top < inputRect.bottom + 420 && rect.right > inputRect.left - 80 && rect.left < inputRect.right + 520;
        })
        .sort((a, b) => a.children.length - b.children.length || a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      if (option && Date.now() - lastSelectionAt >= 600) {
        const target = option.closest('[role="option"],li,.ui-menu-item,tr,a') || option;
        lastSelectionAt = Date.now();
        target.scrollIntoView({ block: 'nearest' });
        const rect = target.getBoundingClientRect();
        const x = rect.left + Math.min(28, rect.width / 2);
        const y = rect.top + Math.min(18, rect.height / 2);
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
          const EventType = type === 'pointerdown' && window.PointerEvent ? PointerEvent : MouseEvent;
          target.dispatchEvent(new EventType(type, { bubbles:true, cancelable:true, clientX:x, clientY:y }));
        });
        await new Promise(resolve => setTimeout(resolve, 300));
        if (confirmed()) return true;
        // Omni may close its results after choosing the code, but still needs
        // Enter on the Code editor before it loads the rest of the product.
        if (input.isConnected && clean(input.value).toLowerCase() === wanted) {
          if (visible(target)) sendKey(input, 'ArrowDown', 40);
          if (commitAttempts < 2) commitCode();
        }
      }
      // Some Omni Code editors resolve the SKU on Enter without exposing a menu.
      const elapsed = Date.now() - startedAt;
      if ((!commitAttempts && elapsed >= 2500) || (commitAttempts === 1 && elapsed >= 7500)) commitCode();
    }
    return Boolean(confirmed());
  }
  function sendKey(input, key, code) {
    input.focus();
    const KeyboardEventType = input.ownerDocument.defaultView.KeyboardEvent;
    const types = key === 'ArrowDown' ? ['keydown', 'keyup'] : ['keydown', 'keypress', 'keyup'];
    types.forEach(type => {
      const charCode = type === 'keypress' && key === 'Enter' ? 13 : 0;
      const event = new KeyboardEventType(type, { bubbles:true, cancelable:true, key, code:key, keyCode:code, which:code, charCode });
      // Older Omni handlers read the legacy fields rather than event.key.
      for (const [property, value] of Object.entries({ keyCode: code, which: code, charCode })) {
        if (event[property] !== value) Object.defineProperty(event, property, { value });
      }
      input.dispatchEvent(event);
    });
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
    const empty = emptyCodeField(item.code);
    if (!empty) { toast('No empty Omni product line was found.', true); return false; }
    empty.field.scrollIntoView({ block: 'nearest' });
    empty.rect = empty.field.getBoundingClientRect();
    let targetRow = empty.field.closest('tr');
    const previousRows = new Set(quoteTableInfo()?.table.querySelectorAll('tr') || []);
    const confirmedRow = () => {
      const info = quoteTableInfo();
      if (!info) return null;
      const matches = row => row?.isConnected && cellValue(row, info.headings, 'code').toUpperCase() === item.code.toUpperCase() &&
        Boolean(cellValue(row, info.headings, 'product')) && !/^search/i.test(cellValue(row, info.headings, 'product'));
      if (matches(targetRow)) return targetRow;
      const candidates = [...info.table.querySelectorAll('tr')].filter(row => !previousRows.has(row) && matches(row));
      return candidates.length === 1 ? candidates[0] : null;
    };
    close();
    let rowY = empty.rect.top + empty.rect.height / 2;
    clickAt(empty.rect.left + empty.rect.width / 2, rowY);
    let codeInput = null;
    for (let attempt = 0; attempt < 10 && !codeInput; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 40));
      codeInput = fieldNear(empty.rect.left + empty.rect.width / 2, rowY);
    }
    if (!codeInput) { toast('Could not open the Omni Code search field.', true); return false; }
    setValue(codeInput, item.code);
    await chooseDropdown(item.code, codeInput, confirmedRow);
    let insertedRow = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 60));
      insertedRow = confirmedRow();
      if (insertedRow) break;
    }
    if (!insertedRow) { toast(`Could not confirm ${item.code} in Omni. Check the line before trying again.`, true); return false; }
    targetRow = insertedRow;
    targetRow.scrollIntoView({ block: 'nearest' });
    const rowRect = targetRow.getBoundingClientRect();
    rowY = rowRect.top + rowRect.height / 2;
    const quantityInfo = quoteTableInfo();
    const currentQuantity = quantityInfo ? Number(cellValue(targetRow, quantityInfo.headings, 'qtyordered').replace(/,/g, '')) : null;
    if (item.quantity && currentQuantity !== item.quantity) {
      const quantity = header('Qty Ordered');
      if (!quantity) { console.warn('[LC installation fees] Quantity field not found.', item.code); return false; }
      const x = quantity.left + quantity.width / 2;
      clickAt(x, rowY);
      let quantityInput = null;
      for (let attempt = 0; attempt < 10 && !quantityInput; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 40));
        quantityInput = fieldNear(x, rowY);
      }
      if (!quantityInput || (targetRow?.isConnected && quantityInput.closest('tr') && quantityInput.closest('tr') !== targetRow)) {
        console.warn('[LC installation fees] Could not set quantity.', item.code, item.quantity); return false;
      }
      setValue(quantityInput, String(item.quantity));
      sendKey(quantityInput, 'Tab', 9);
      quantityInput.blur();
    }
    const currentRow = confirmedRow();
    if (!currentRow) { toast(`Could not locate ${item.code} after Omni updated the line. Check its price.`, true); return false; }
    targetRow = currentRow;
    targetRow.scrollIntoView({ block: 'nearest' });
    const currentRect = targetRow.getBoundingClientRect();
    rowY = currentRect.top + currentRect.height / 2;
    const price = header('Unit Price') || header('Price');
    if (price) {
      const x = price.left + price.width / 2;
      clickAt(x, rowY);
      let priceInput = null;
      for (let attempt = 0; attempt < 5 && !priceInput; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 40));
        priceInput = fieldNear(x, rowY);
      }
      if (priceInput && (!targetRow?.isConnected || !priceInput.closest('tr') || priceInput.closest('tr') === targetRow)) {
        setValue(priceInput, String(item.price).replace(/[^\d.]/g, ''));
        sendKey(priceInput, 'Tab', 9);
        priceInput.blur();
      } else { toast('Could not set the chart price. Check the installation line.', true); return false; }
    } else { toast('Could not find the installation price field.', true); return false; }
    return true;
  }
  function editingQuote() {
    const active = document.activeElement;
    const focused = active?.shadowRoot?.activeElement || active;
    return Boolean(focused && (/^(INPUT|TEXTAREA|SELECT)$/i.test(focused.tagName) || focused.isContentEditable));
  }
  function memoRequiresInstallation(text) {
    const memo = clean(text);
    if (/\b(?:no\s+instal{1,2}ation\s+required|instal{1,2}ation\s+(?:is\s+)?not\s+(?:required|included)|without\s+instal{1,2}ation)\b/i.test(memo)) return false;
    return /\binstal{1,2}ation\s*[:\-]?\s+required\b/i.test(memo);
  }
  function quoteMemoText() {
    let field = document.querySelector('textarea[aria-label="Delivery Instructions"], input[aria-label="Delivery Instructions"]');
    if (!field) {
      const label = document.querySelector('[data-lc-delivery-label]') || pageElements('label,td,span,div')
        .filter(element => /^delivery instructions[:*]?$/i.test(clean(element.textContent)))
        .sort((a, b) => a.children.length - b.children.length)[0];
      if (!label) return '';
      field = label.querySelector('textarea,input:not([type="hidden"]),[contenteditable="true"]') ||
        (label.htmlFor && document.getElementById(label.htmlFor));
      if (!field) {
        const rect = label.getBoundingClientRect();
        field = pageElements('textarea,input:not([type="hidden"]),[contenteditable="true"]')
          .map(element => ({ element, bounds: element.getBoundingClientRect() }))
          .filter(item => item.bounds.top >= rect.top - 10 && item.bounds.top <= rect.bottom + 70 && item.bounds.right > rect.left)
          .sort((a, b) => Math.abs(a.bounds.top - rect.bottom) - Math.abs(b.bounds.top - rect.bottom))[0]?.element;
      }
    }
    return field ? clean(field.value ?? field.textContent) : '';
  }
  function quoteKey() {
    return JSON.stringify([location.href, quoteMemoText(), quoteLines()]);
  }
  async function addMatchedFees() {
    if (addingMatchedFees || !memoRequiresInstallation(quoteMemoText())) return;
    addingMatchedFees = true;
    const button = getButton();
    button.disabled = true;
    try {
      const initialKey = quoteKey();
      if (!items.length) {
        if (!feesLoading) feesLoading = loadItems().finally(() => { feesLoading = null; });
        await feesLoading;
      }
      if (!items.length) throw new Error('Installation pricing could not be loaded. Open Install Fees to retry.');
      if (initialKey !== quoteKey() || editingQuote() || !memoRequiresInstallation(quoteMemoText())) return;
      const plan = matchedFeePlan(quoteLines(), items);
      for (const fee of plan.fees) {
        if (editingQuote() || !memoRequiresInstallation(quoteMemoText())) return;
        // Recheck after each insertion; Omni may rerender the entire quote table.
        const stillNeeded = matchedFeePlan(quoteLines(), items).fees.find(item => item.code === fee.code);
        if (!stillNeeded) continue;
        if (!await addItem(stillNeeded)) { processedQuoteKey = quoteKey(); return; }
      }
      processedQuoteKey = quoteKey();
    } finally {
      addingMatchedFees = false;
      button.disabled = false;
    }
  }
  function checkAutomaticFees() {
    if (addingMatchedFees || document.hidden || editingQuote()) return;
    if (document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('modal')?.classList.contains('open')) return;
    if (!memoRequiresInstallation(quoteMemoText())) return;
    const lines = quoteLines();
    if (!lines.some(assemblyProduct)) return;
    const key = quoteKey();
    if (key === processedQuoteKey) return;
    if (key !== observedQuoteKey) { observedQuoteKey = key; observedSince = Date.now(); return; }
    if (Date.now() - observedSince < 1000) return;
    void addMatchedFees().catch(error => {
      processedQuoteKey = quoteKey();
      toast(error.message || 'Could not add matching installation fees.', true);
    });
  }
  function close() { document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('modal')?.classList.remove('open'); }
  function open() {
    const shadow = ensureRoot().shadowRoot;
    shadow.getElementById('modal').classList.add('open');
    shadow.getElementById('search').focus();
    void loadItems().then(() => { processedQuoteKey = ''; });
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
        #source { padding:0 12px 8px;color:#34577f;font-size:11px;font-weight:700; } .wrap { overflow:auto; } table { width:100%;border-collapse:collapse;font-size:12px; } th { position:sticky;top:0;padding:7px;background:#eef3fa;color:#162947;text-align:left; } td { padding:6px 7px;border-bottom:1px solid #e1e7ef; } td button { padding:5px 10px;color:#fff;background:#13377e;border:0;border-radius:4px;font-weight:700;cursor:pointer; } .group td { padding:8px;color:#13377e;background:#e7eef8;font-weight:800;text-transform:uppercase;letter-spacing:.03em; } .code,.price { white-space:nowrap;font-weight:800; }
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
    const addLine = pageElements('input,button,a,[role="button"]').find(element => /^add\s+a\s+new\s+line$/i.test(clean(element.value || element.textContent)));
    if (addLine) addLine.style.marginBottom = '24px';
    button.style.cssText = 'position:fixed;left:390px;bottom:20px;z-index:2147483599;height:36px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;font:700 13px Arial,sans-serif;cursor:pointer;white-space:nowrap;';
    if (!anchor || !visible(anchor)) return;
    const rect = anchor.getBoundingClientRect();
    button.style.position = anchor.style.position === 'fixed' ? 'fixed' : 'absolute';
    button.style.left = `${(button.style.position === 'fixed' ? 0 : window.scrollX) + rect.right + 8}px`;
    button.style.top = `${(button.style.position === 'fixed' ? 0 : window.scrollY) + rect.top}px`;
    button.style.bottom = 'auto';
    button.style.height = `${Math.max(34, rect.height)}px`;
  }
  function refreshQuoteUi() { placeButton(); hideEmptyOptions(); }
  function boot() { ensureRoot(); refreshQuoteUi(); }
  boot(); setInterval(refreshQuoteUi, 1500); new MutationObserver(refreshQuoteUi).observe(document.body, { childList:true, subtree:true });
  setInterval(checkAutomaticFees, 750);
  window.addEventListener('resize', placeButton); window.addEventListener('scroll', placeButton, { passive:true });
})();
