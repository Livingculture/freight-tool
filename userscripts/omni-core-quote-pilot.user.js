// ==UserScript==
// @name         Living Culture Core Quote Import Pilot
// @namespace    livingculture-omni
// @version      0.1.2
// @description  Preview a local Core quote file and fill product lines on a new, unsaved Omni quote. Never saves or approves.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (location.hostname !== 'go.cin7.com' || window.top !== window.self || document.getElementById('lc-core-import')) return;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const key = value => clean(value).replace(/[^a-z]/gi, '').toLowerCase();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const money = value => '$' + value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cents = value => Math.round(value * 100);
  const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  let quote = null;
  let started = false;
  let busy = false;
  let sessionUrl = '';

  function validate(data) {
    if (data?.schema !== 'lc-core-quote-pilot-v1' || !/^NZSO-\d+$/.test(data.sourceReference || '') || data.currency !== 'NZD' || data.pricesIncludeGst !== true) {
      throw new Error('Expected an NZD Core quote file with GST-inclusive prices.');
    }
    if (!Array.isArray(data.lines) || !data.lines.length || data.lines.length > 30) throw new Error('Expected 1-30 quote lines.');
    const skus = new Set();
    for (const line of data.lines) {
      if (!/^[A-Z0-9][A-Z0-9()-]{1,79}$/.test(line.sku || '') || skus.has(line.sku)) throw new Error('Invalid or repeated SKU.');
      skus.add(line.sku);
      if (typeof line.description !== 'string' || !clean(line.description)) throw new Error('Missing product description.');
      if (![line.quantity, line.unitPrice, line.discountPercent, line.amount].every(value => typeof value === 'number' && Number.isFinite(value)) || line.quantity <= 0 || line.unitPrice < 0 || line.discountPercent < 0 || line.discountPercent > 100 || line.amount < 0) {
        throw new Error('Invalid quote quantity, price or discount.');
      }
      if (cents(line.quantity * line.unitPrice * (1 - line.discountPercent / 100)) !== cents(line.amount)) throw new Error('Line total does not reconcile: ' + line.sku);
    }
    if (!Number.isFinite(data.freight?.amount) || data.freight.amount < 0 || !Number.isFinite(data.total)) throw new Error('Missing freight or total.');
    if (data.lines.reduce((sum, line) => sum + cents(line.amount), 0) + cents(data.freight.amount) !== cents(data.total)) throw new Error('Quote total does not reconcile.');
    if (!Array.isArray(data.warnings) || data.warnings.some(item => typeof item !== 'string')) throw new Error('Missing source warnings.');
    return data;
  }

  function tableInfo() {
    const matches = [];
    for (const table of document.querySelectorAll('table')) {
      if (!visible(table)) continue;
      const rows = [...table.rows].filter(row => row.closest('table') === table);
      for (const header of rows.slice(0, 4)) {
        const headings = [...header.cells].map(cell => key(cell.textContent));
        if (['code', 'product', 'qtyordered', 'unitprice', 'disc'].every(name => headings.includes(name))) {
          matches.push({ table, header, headings, rows: rows.slice(rows.indexOf(header) + 1).filter(visible) });
          break;
        }
      }
    }
    if (matches.length !== 1) throw new Error('Could not uniquely identify the Omni product grid. No further fields were changed.');
    return matches[0];
  }

  function cellFor(row, info, name) { return row.cells[info.headings.indexOf(name)]; }
  function valueOf(cell) {
    const input = [...(cell?.querySelectorAll('input:not([type="hidden"]),textarea') || [])].find(visible);
    return clean(input ? input.value : cell?.textContent);
  }
  function numberOf(cell) {
    const text = valueOf(cell);
    return /^\$?\s*-?\d[\d,]*(?:\.\d+)?\s*%?$/.test(text) ? Number(text.replace(/[$,%\s]/g, '')) : NaN;
  }
  function blank(value) { return !value || /^search\.{0,3}$/i.test(value); }

  function quoteHeadings() {
    const controls = 'a,button,input,select,textarea,nav,dialog,[role="button"],[role="menu"],[role="option"],[id^="lc-"]';
    const nodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],b,strong,span,div')];
    return nodes.filter(node => {
      const text = clean(node.textContent);
      const semantic = node.matches('h1,h2,h3,h4,h5,h6,[role="heading"]');
      return /^(?:New|Edit)\s+(?:Quote|Sales Order)/i.test(text) && (semantic || (node.children.length <= 4 && text.length < 600)) && visible(node) && !node.closest(controls);
    }).map(node => {
      // All-in-One mounts its staff tools inside Omni's title on some pages.
      // Their labels are not part of the native transaction heading.
      const copy = node.cloneNode(true);
      copy.querySelectorAll(controls + ',[hidden],[aria-hidden="true"]').forEach(child => child.remove());
      const text = clean(copy.textContent);
      const semantic = node.matches('h1,h2,h3,h4,h5,h6,[role="heading"]');
      return semantic || node.children.length <= 4 ? text : '';
    }).filter(text => /^(?:(?:New|Edit)\s+(?:Quote|Sales Order))(?:\s*-|$)/i.test(text));
  }

  function assertNewQuote() {
    const headings = quoteHeadings();
    if (!headings.some(text => /^New Quote(?:\s*-|$)/i.test(text)) || headings.some(text => /^Edit\s+(?:Quote|Sales Order)|^New Sales Order/i.test(text))) {
      throw new Error('Open a new, unsaved Omni quote. Saved quotes and sales orders are not supported by this pilot.');
    }
    const url = new URL(location.href);
    for (const [name, value] of url.searchParams) {
      if (/^(?:idorder|sid|transactionid|saleid|orderid|convertquotetosalesorder)$/i.test(name) && value && value !== '0') throw new Error('This URL identifies an existing transaction. Import blocked.');
    }
    if (sessionUrl && location.href !== sessionUrl) throw new Error('The page changed. Import stopped.');
    return tableInfo();
  }

  function setValue(input, value) {
    if (!input || !visible(input) || input.disabled || input.readOnly || !['text', 'number', 'search', 'tel'].includes(input.type)) throw new Error('The Omni editor is not writable.');
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: String(value).slice(-1) }));
  }

  function commitCode(input, cell, sku) {
    assertNewQuote();
    if (!input?.isConnected || !cell?.isConnected || !cell.contains(input) || !visible(input) || input.disabled || input.readOnly || clean(input.value).toUpperCase() !== sku) return false;
    input.focus();
    // Omni's legacy Code editor reads keyCode/which/charCode to load a product.
    // Send Enter only to this exact Code input, never to the form or document.
    for (const type of ['keydown', 'keypress', 'keyup']) {
      const charCode = type === 'keypress' ? 13 : 0;
      const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode });
      for (const [name, value] of Object.entries({ keyCode: 13, which: 13, charCode })) {
        if (event[name] !== value) Object.defineProperty(event, name, { value });
      }
      input.dispatchEvent(event);
      if (!input.isConnected) break;
    }
    return true;
  }

  async function editor(cell) {
    if (!cell || !visible(cell)) throw new Error('The required grid cell is missing.');
    cell.scrollIntoView({ block: 'center' });
    // Open the native editor inside the cell, not a guessed page-wide input.
    const rect = cell.getBoundingClientRect();
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick']) cell.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    for (let attempt = 0; attempt < 15; attempt++) {
      const fields = [...cell.querySelectorAll('input:not([type="hidden"])')].filter(visible);
      if (fields.length === 1) return fields[0];
      await wait(60);
    }
    throw new Error('Omni did not expose an editor inside the selected cell. Import stopped.');
  }

  function matchedRow(sku) {
    const info = assertNewQuote();
    const matches = info.rows.filter(row => valueOf(cellFor(row, info, 'code')).toUpperCase() === sku);
    if (matches.length !== 1 || blank(valueOf(cellFor(matches[0], info, 'product')))) return null;
    return { row: matches[0], info };
  }

  async function addProduct(line) {
    const info = assertNewQuote();
    if (info.rows.some(row => valueOf(cellFor(row, info, 'code')).toUpperCase() === line.sku)) throw new Error('SKU already exists: ' + line.sku);
    const row = info.rows.find(item => blank(valueOf(cellFor(item, info, 'code'))) && blank(valueOf(cellFor(item, info, 'product'))));
    if (!row) throw new Error('No empty product line. Add a new blank line in Omni.');
    const codeCell = cellFor(row, info, 'code');
    let input = await editor(codeCell);
    setValue(input, line.sku);
    let clicked = false;
    let commits = 0;
    let valueAttempts = 1;
    let lastValueAttempt = 0;
    let sawOtherResults = false;
    for (let attempt = 0; attempt < 160; attempt++) {
      assertNewQuote();
      const match = matchedRow(line.sku);
      if (match) return match;
      // Omni can replace the Code input after the first input event.
      const live = [...codeCell.querySelectorAll('input:not([type="hidden"])')].filter(visible);
      if (live.length === 1 && live[0] !== input) input = live[0];
      if (input.isConnected && codeCell.contains(input)) {
        if (clean(input.value).toUpperCase() !== line.sku) {
          if (valueAttempts < 3 && attempt - lastValueAttempt >= 4) {
            setValue(input, line.sku);
            valueAttempts++;
            lastValueAttempt = attempt;
          }
          await wait(80);
          continue;
        }
        const rect = input.getBoundingClientRect();
        const nearby = [...document.querySelectorAll('[role="option"],.ui-menu-item,li,a,div,span,td')].filter(node => {
          if (node.closest('table') === info.table || node.closest('#lc-core-import')) return false;
          const text = clean(node.textContent).toUpperCase();
          if (!/^[A-Z]{2}\d/.test(text) || text.length > 500 || !visible(node)) return false;
          const r = node.getBoundingClientRect();
          return r.height <= 120 && Math.abs(r.top - rect.bottom) < 420 && r.right > rect.left && r.left < rect.right + 400;
        });
        const options = nearby.filter(node => {
          const text = clean(node.textContent).toUpperCase();
          return text === line.sku || text.startsWith(line.sku + ' ');
        });
        const leaves = options.filter(node => !options.some(other => other !== node && node.contains(other)));
        if (leaves.length > 1) throw new Error('Multiple matching products for ' + line.sku + '. Select the correct product manually.');
        sawOtherResults = nearby.length > 0 && leaves.length === 0;
        if (!clicked && leaves.length === 1) {
          const target = leaves[0].closest('[role="option"],.ui-menu-item,li,tr,a') || leaves[0];
          const r = target.getBoundingClientRect();
          for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
          clicked = true;
          const selected = matchedRow(line.sku);
          if (selected) return selected;
        }
        if (!sawOtherResults && ((!commits && (clicked || attempt >= 30)) || (commits === 1 && attempt >= 90))) {
          if (commitCode(input, codeCell, line.sku)) commits++;
        }
      }
      await wait(80);
    }
    throw new Error('Could not confirm an exact product match for ' + line.sku + (sawOtherResults ? '. Omni returned other product codes; no substitute was selected.' : '. Omni did not load the product after the Code-field lookup. Check that this exact Core SKU exists in Omni.') + ' Check the partially entered line; do not rerun the import.');
  }

  async function numericField(line, name, expected) {
    let match = matchedRow(line.sku);
    if (!match) throw new Error('Product row disappeared: ' + line.sku);
    if (numberOf(cellFor(match.row, match.info, name)) === expected) return;
    const input = await editor(cellFor(match.row, match.info, name));
    assertNewQuote();
    setValue(input, expected);
    input.blur();
    for (let attempt = 0; attempt < 25; attempt++) {
      await wait(80);
      match = matchedRow(line.sku);
      if (match && numberOf(cellFor(match.row, match.info, name)) === expected) return;
    }
    throw new Error('Could not verify ' + name + ' for ' + line.sku + '. Check the quote manually.');
  }

  function verifyLines() {
    const info = assertNewQuote();
    const populated = info.rows.filter(row => !blank(valueOf(cellFor(row, info, 'code'))));
    if (populated.length !== quote.lines.length) throw new Error('Unexpected or missing product/component lines. Check the BOM and totals manually.');
    for (const line of quote.lines) {
      const match = matchedRow(line.sku);
      if (!match) throw new Error('Missing or duplicate SKU: ' + line.sku);
      for (const [name, expected] of [['qtyordered', line.quantity], ['unitprice', line.unitPrice], ['disc', line.discountPercent]]) {
        if (numberOf(cellFor(match.row, match.info, name)) !== expected) throw new Error('Quote changed: ' + line.sku + ' ' + name);
      }
    }
  }

  const host = document.createElement('div');
  host.id = 'lc-core-import';
  const pageHeading = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"],b,strong')].find(node => visible(node) && /^(?:New|Edit) (?:Quote|Sales Order)/i.test(clean(node.textContent)));
  if (pageHeading) pageHeading.after(host);
  else document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host{font-family:Arial,sans-serif;color:#233c42}*{box-sizing:border-box}dialog{width:min(850px,calc(100% - 24px));max-height:90vh;padding:20px;border:1px solid #a9bec3;border-radius:6px;color:inherit}dialog::backdrop{background:#0006}header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:20px;margin:0}button{font:inherit;cursor:pointer;border:1px solid #a9bec3;border-radius:4px;background:#fff;padding:8px 12px}button:disabled{opacity:.5;cursor:default}.close{font-size:20px;width:36px;height:36px;padding:0}input[type=file]{max-width:100%;margin:16px 0}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 6px;border-bottom:1px solid #dce5e7}.scroll{overflow:auto}th{white-space:nowrap}td{min-width:65px}td:first-child{white-space:nowrap}.warning{color:#8b4000;background:#fff4e5;padding:10px;border-left:3px solid #cf7c00;white-space:pre-wrap;line-height:1.5}label{display:flex;gap:8px;margin:14px 0;font-size:14px;line-height:1.4}input[type=checkbox]{flex:none;width:18px;height:18px;margin:0}footer{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}#fill{background:#087f8c;color:white}#status{white-space:pre-wrap;line-height:1.5;font-size:14px}#details{line-height:1.6;white-space:pre-wrap;font-size:14px}#open{margin:8px 0;font-size:13px}#warning:empty{display:none}
    </style><button id="open" type="button">Core Quote Import Pilot</button><dialog aria-label="Core quote import"><header><h2>Core Quote Import Pilot</h2><button class="close" type="button" aria-label="Close">&#215;</button></header><input type="file" id="file" accept=".json,application/json" aria-label="Core quote file"><div id="details"></div><div class="scroll"><table><thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Unit price</th><th>Disc.</th><th>Amount</th></tr></thead><tbody></tbody></table></div><p id="warning" class="warning"></p><label><input type="checkbox" id="confirm">Customer selected and NZD / GST-inclusive pricing checked in Omni. Source warnings reviewed.</label><footer><button id="fill" type="button" disabled>Fill Product Lines</button><button id="verify" type="button" disabled>Check Product Lines</button></footer><p id="status" role="status">No quote file loaded.</p></dialog>`;
  const get = id => shadow.getElementById(id);
  const dialog = shadow.querySelector('dialog');
  const status = message => { get('status').textContent = message; };
  document.addEventListener('submit', event => {
    if (!busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    status('A form submission was blocked during the unsaved quote import.');
  }, true);
  const controls = () => {
    get('fill').disabled = !quote || started || busy || !get('confirm').checked;
    get('file').disabled = started || busy;
    get('verify').disabled = !quote || busy;
  };
  get('open').addEventListener('click', () => dialog.showModal());
  shadow.querySelector('.close').addEventListener('click', () => dialog.close());
  get('confirm').addEventListener('change', controls);
  get('file').addEventListener('change', async () => {
    quote = null;
    get('confirm').checked = false;
    get('details').textContent = '';
    get('warning').textContent = '';
    shadow.querySelector('tbody').replaceChildren();
    controls();
    try {
      const file = get('file').files[0];
      if (!file || file.size > 100000) throw new Error('Select a quote JSON file smaller than 100 KB.');
      quote = validate(JSON.parse(await file.text()));
      get('details').textContent = `${quote.sourceReference} | ${clean(quote.customer?.name)} | ${quote.currency}\nEmail: ${clean(quote.customer?.email)}\nFreight: ${money(quote.freight.amount)} | Target total incl. GST: ${money(quote.total)}`;
      get('warning').textContent = [...quote.warnings, 'Customer, delivery address, freight, quote date and source reference require manual entry. Product lines only. No save, approval, payment or stock changes are performed by this importer.'].join('\n');
      for (const line of quote.lines) {
        const row = document.createElement('tr');
        for (const value of [line.sku, line.description, line.quantity, money(line.unitPrice), line.discountPercent + '%', money(line.amount)]) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.appendChild(cell);
        }
        shadow.querySelector('tbody').appendChild(row);
      }
      status('Preview loaded. No Omni fields changed.');
    } catch (error) { quote = null; status(error.message); }
    controls();
  });
  get('verify').addEventListener('click', () => {
    try { verifyLines(); status('Product quantities, prices and discounts match the source. Freight, GST and the final Omni total still require manual verification.'); }
    catch (error) { status(error.message); }
  });
  get('fill').addEventListener('click', async () => {
    if (!quote || started || busy || !get('confirm').checked) return;
    try {
      const info = assertNewQuote();
      if (info.rows.some(row => !blank(valueOf(cellFor(row, info, 'code'))) || !blank(valueOf(cellFor(row, info, 'product'))))) throw new Error('Product grid is not empty. Import blocked to prevent duplicates or overwriting lines.');
      sessionUrl = location.href;
      started = true;
      busy = true;
      controls();
      // A modal dialog makes the native grid inert; close it before editing.
      dialog.close();
      for (const [index, line] of quote.lines.entries()) {
        status(`${index + 1}/${quote.lines.length}: ${line.sku}`);
        await addProduct(line);
        for (const [name, value] of [['qtyordered', line.quantity], ['unitprice', line.unitPrice], ['disc', line.discountPercent]]) await numericField(line, name, value);
      }
      verifyLines();
      status(`Product lines filled, not saved. Enter freight ${money(quote.freight.amount)} and check the final Omni total is ${money(quote.total)}. Preserve Core reference ${quote.sourceReference} in Internal Comments; let Omni assign its own quote number. The separate source discount has NOT been applied.`);
    } catch (error) { status('Stopped: ' + error.message + (started ? '\nSome lines may already be filled. Inspect them manually; this pilot will not rerun on this page.' : '')); }
    finally { busy = false; controls(); if (!dialog.open) dialog.showModal(); }
  });
})();
