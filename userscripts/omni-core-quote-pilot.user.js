// ==UserScript==
// @name         Living Culture Core Quote Import Pilot
// @namespace    livingculture-omni
// @version      0.2.0
// @description  Look up a Core quote number through Workflow and transfer customer, addresses, products and charges to a new Omni quote. Never saves or approves.
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @match        https://*.cin7.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self || document.getElementById('lc-core-import')) return;
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
  let floatingEditor = null;
  const workflowOrigin = 'https://living-culture-workflow.vercel.app';
  const pendingKey = 'lc-core-api-quote-transfer-v1';
  const tabKey = 'lc-core-api-quote-transfer-tab-v1';
  let lookupInFlight = false;
  const isOmni = location.hostname === 'go.cin7.com';
  const isCore = !isOmni && /\.(?:dearsystems|cin7core|cin7)\.com$/.test(location.hostname);
  if (!isOmni && !isCore) return;

  function requestCoreQuote(reference, receive, report) {
    if (lookupInFlight) { report('A Core lookup is already in progress.'); return; }
    const match = clean(reference).toUpperCase().replace(/\s/g,'').match(/^(?:NZSO-?)?(\d{3,12})$/);
    if (!match) { report('Enter a Core quote number such as NZSO-16714.'); return; }
    const order = 'NZSO-' + match[1], nonce = crypto.randomUUID();
    const url = new URL('/core-quote-transfer', workflowOrigin);
    url.search = new URLSearchParams({ order, target:location.origin, nonce }).toString();
    const popup = window.open(url.href, 'lc-core-quote-' + nonce);
    if (!popup) { report('Allow this Cin7 page to open the Workflow lookup window.'); return; }
    lookupInFlight = true;
    report('Looking up ' + order + ' in Core. Sign in to Workflow in the lookup window if requested.');
    const timer = setTimeout(() => { lookupInFlight=false; window.removeEventListener('message', onMessage); report('Core lookup timed out. Close the lookup window and try again.'); }, 300000);
    function onMessage(event) {
      if (event.origin !== workflowOrigin || event.source !== popup || event.data?.nonce !== nonce || !['lc-core-quote-loaded','lc-core-quote-error'].includes(event.data?.type)) return;
      clearTimeout(timer); lookupInFlight=false; window.removeEventListener('message', onMessage);
      if (event.data.type === 'lc-core-quote-error') { report(String(event.data.error || 'Core quote lookup failed.')); return; }
      try {
        const result = validate(event.data.quote);
        if (result.schema !== 'lc-core-quote-api-v1' || result.sourceReference !== order) throw new Error('The Core response did not match the requested quote.');
        const keepOpen = receive(result, nonce, popup) === false;
        if(!keepOpen)popup.close();
      } catch (error) { report(error.message); }
    }
    window.addEventListener('message', onMessage);
  }

  if (isCore) {
    const bar = document.createElement('div'); bar.id = 'lc-core-import';
    bar.style.cssText = 'padding:8px 14px;background:white;border-bottom:1px solid #cbdcde;font:14px Arial;color:#233c42;display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Copy Core Quote to Omni';
    button.style.cssText = 'padding:8px 12px;border:0;border-radius:4px;background:#087f8c;color:white;font:inherit;cursor:pointer';
    const message = document.createElement('span'); bar.append(button,message); document.body.prepend(bar);
    button.addEventListener('click', () => {
      const reference = window.prompt('Core quote number (NZSO-XXXXX)');
      if (!reference) return;
      requestCoreQuote(reference, (data,nonce,popup) => {
        if (typeof GM_setValue !== 'function') throw new Error('Install this transfer script in Tampermonkey on both Core and Omni.');
        GM_setValue(pendingKey,{ nonce, expires:Date.now()+600000, quote:data });
        message.textContent='Core quote '+data.sourceReference+' loaded. Opening the new Omni quote in the transfer tab.';
        popup.location.href='https://go.cin7.com/#lc-core-quote-transfer=' + nonce;
        popup.focus();
        return false;
      }, text => { message.textContent = text; });
    });
    return;
  }

  // Only the tab opened from Core may consume its short-lived quote handoff.
  const hashNonce = new URLSearchParams(location.hash.slice(1)).get('lc-core-quote-transfer');
  if (hashNonce && /^[a-f0-9-]{36}$/i.test(hashNonce)) {
    sessionStorage.setItem(tabKey,hashNonce);
    history.replaceState(null,'',location.pathname+location.search);
  }
  let handoff = null;
  try {
    const marker = sessionStorage.getItem(tabKey);
    const stored = typeof GM_getValue === 'function' ? GM_getValue(pendingKey,null) : null;
    if (marker && stored?.nonce === marker && stored.expires > Date.now() && stored.expires <= Date.now()+600000) handoff = stored;
    else if (marker) sessionStorage.removeItem(tabKey);
  } catch { /* Missing/expired handoffs never trigger a quote edit. */ }
  if (!/\/Cloud\/TransactionEntry\/TransactionEntry\.aspx$/i.test(location.pathname)) {
    if (handoff) {
      let attempts = 0;
      const timer = setInterval(() => {
        const links = [...document.querySelectorAll('a')].filter(link => visible(link) && /^new\s+quote$/i.test(clean(link.textContent)));
        if (links.length === 1) { clearInterval(timer); links[0].click(); }
        else if (++attempts >= 60) { clearInterval(timer); window.alert('Core quote loaded. Open New Quote in this same Omni tab to continue the transfer.'); }
      },250);
    }
    return;
  }

  function validate(data) {
    if (!['lc-core-quote-pilot-v1','lc-core-quote-api-v1'].includes(data?.schema) || !/^NZSO-\d+$/.test(data.sourceReference || '') || data.currency !== 'NZD' || data.pricesIncludeGst !== true) {
      throw new Error('Expected an NZD Core quote file with GST-inclusive prices.');
    }
    if (!Array.isArray(data.lines) || !data.lines.length || data.lines.length > 100) throw new Error('Expected 1-100 quote lines.');
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
    const surcharge = data.schema === 'lc-core-quote-api-v1' ? data.surcharge?.amount : 0;
    const discount = data.schema === 'lc-core-quote-api-v1' ? data.discount?.amount : 0;
    if (![surcharge,discount].every(value=>Number.isFinite(value)&&value>=0)) throw new Error('Invalid Core charges or discount.');
    if (data.lines.reduce((sum, line) => sum + cents(line.amount), 0) + cents(data.freight.amount) + cents(surcharge) - cents(discount) !== cents(data.total)) throw new Error('Quote total does not reconcile.');
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
    if (!input || !visible(input) || input.disabled || input.readOnly || !['text', 'number', 'search', 'tel', 'email'].includes(input.type)) throw new Error('The Omni editor is not writable.');
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: String(value).slice(-1) }));
  }

  function overCell(input, cell) {
    if (!input?.isConnected || !cell?.isConnected || !visible(input) || !visible(cell)) return false;
    if (input.closest('td,th') && input.closest('td,th') !== cell) return false;
    const r = input.getBoundingClientRect(), c = cell.getBoundingClientRect();
    const x = c.left + c.width / 2;
    const overlap = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
    return x >= r.left - 6 && x <= r.right + 6 && overlap >= Math.min(r.height, c.height) / 2;
  }

  function belongsToCell(input, cell) {
    return Boolean(input?.isConnected && cell?.isConnected && (cell.contains(input) ||
      (floatingEditor?.input === input && floatingEditor.cell === cell && overCell(input, cell))));
  }

  function liveCellInput(cell) {
    const fields = [...cell.querySelectorAll('input:not([type="hidden"])')].filter(visible);
    if (fields.length === 1) return fields[0];
    if (!fields.length && belongsToCell(floatingEditor?.input, cell)) return floatingEditor.input;
    const active = document.activeElement;
    if (!fields.length && floatingEditor?.cell === cell && active instanceof HTMLInputElement && overCell(active, cell) && !active.disabled && !active.readOnly) {
      floatingEditor = { input: active, cell };
      return active;
    }
    return null;
  }

  function editorKey(input, name, code) {
    input.focus();
    for (const type of ['keydown', 'keypress', 'keyup']) {
      const charCode = type === 'keypress' && name === 'Enter' ? 13 : 0;
      const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: name, code: name, keyCode: code, which: code, charCode });
      for (const [property, value] of Object.entries({ keyCode: code, which: code, charCode })) {
        if (event[property] !== value) Object.defineProperty(event, property, { value });
      }
      input.dispatchEvent(event);
      if (!input.isConnected) break;
    }
  }

  function commitCode(input, cell, sku) {
    assertNewQuote();
    if (!belongsToCell(input, cell) || !visible(input) || input.disabled || input.readOnly || clean(input.value).toUpperCase() !== sku) return false;
    // Omni's legacy Code editor reads keyCode/which/charCode to load a product.
    // Send Enter only to this exact Code input, never to the form or document.
    editorKey(input, 'Enter', 13);
    return true;
  }

  async function editor(cell) {
    if (!cell || !visible(cell)) throw new Error('The required grid cell is missing.');
    cell.scrollIntoView({ block: 'center' });
    const before = new Set([...document.querySelectorAll('input')].filter(visible));
    // Omni may attach the editor to the page rather than inside the grid cell.
    // Only accept an activated/new input directly overlapping this cell.
    const rect = cell.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const target = hit && cell.contains(hit) ? hit : cell;
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick']) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    for (let attempt = 0; attempt < 15; attempt++) {
      const fields = [...cell.querySelectorAll('input:not([type="hidden"])')].filter(visible);
      if (fields.length === 1) return fields[0];
      if (fields.length > 1) throw new Error('Multiple editors appeared in the selected grid cell.');
      const overlays = [...document.querySelectorAll('input:not([type="hidden"])')].filter(input =>
        !input.disabled && !input.readOnly && !cell.contains(input) && overCell(input, cell) &&
        (document.activeElement === input || !before.has(input)));
      if (overlays.length > 1) throw new Error('Multiple floating editors overlap the selected grid cell.');
      if (overlays.length === 1) {
        floatingEditor = { input: overlays[0], cell };
        return overlays[0];
      }
      await wait(60);
    }
    throw new Error('Omni did not expose an editor in or over the selected cell. Import stopped.');
  }

  function matchedRow(sku) {
    const info = assertNewQuote();
    const matches = info.rows.filter(row => valueOf(cellFor(row, info, 'code')).toUpperCase() === sku);
    if (matches.length !== 1 || blank(valueOf(cellFor(matches[0], info, 'product')))) return null;
    return { row: matches[0], info };
  }

  async function addProduct(line) {
    let info = assertNewQuote();
    if (info.rows.some(row => valueOf(cellFor(row, info, 'code')).toUpperCase() === line.sku)) throw new Error('SKU already exists: ' + line.sku);
    const empty=()=>info.rows.find(item => blank(valueOf(cellFor(item, info, 'code'))) && blank(valueOf(cellFor(item, info, 'product'))));
    let row=empty();
    for(let attempt=0;!row&&attempt<30;attempt++){await wait(100);info=assertNewQuote();row=empty();}
    if(!row){
      const add=[...document.querySelectorAll('button,a,input[type="button"]')].filter(node=>visible(node)&&/^add\s+a\s+new\s+line$/i.test(clean(node.value||node.textContent)));
      if(add.length===1){add[0].click();for(let attempt=0;!row&&attempt<30;attempt++){await wait(100);info=assertNewQuote();row=empty();}}
    }
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
      const live = liveCellInput(codeCell);
      if (live && live !== input) input = live;
      if (belongsToCell(input, codeCell)) {
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
    let input;
    try { input = await editor(cellFor(match.row, match.info, name)); }
    catch (error) { throw new Error(line.sku + ' ' + name + ': ' + error.message); }
    assertNewQuote();
    setValue(input, expected);
    if (!belongsToCell(input, cellFor(match.row, match.info, name))) throw new Error('The selected numeric editor moved away from its product cell.');
    editorKey(input, 'Tab', 9);
    if (input.isConnected) input.blur();
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

  function nativeField(labelName, section = '', required = true) {
    const fieldKey = value => clean(value).replace(/^\d+\s*/,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const wanted=fieldKey(labelName);
    const labels = [...document.querySelectorAll('label,td,th,div,span,strong,b,button')].filter(node => visible(node) && fieldKey(node.textContent) === wanted &&
      (node.htmlFor || ![...node.children].some(child=>fieldKey(child.textContent)===wanted)));
    let left = -Infinity, right = Infinity, top = -Infinity;
    if (section) {
      const sectionKey = node => {const copy=node.cloneNode(true);copy.querySelectorAll('button,a,label,input,[id^="lc-"]').forEach(child=>child.remove());return key(copy.textContent);};
      const anchors = [...document.querySelectorAll('h1,h2,h3,h4,strong,b,div,span')].filter(node => node.textContent.length<150 && visible(node) && ['contact','deliveryaddress','billingaddress'].includes(sectionKey(node)) && ![...node.children].some(child=>sectionKey(child)===sectionKey(node)));
      const heading = anchors.filter(node=>sectionKey(node)===key(section));
      if (heading.length !== 1) throw new Error('Cannot uniquely locate the Omni ' + section + ' section.');
      const r = heading[0].getBoundingClientRect(); left=r.left-12; top=r.bottom-4;
      right=Math.min(...anchors.map(node=>node.getBoundingClientRect()).filter(other=>other.left>r.left+30 && Math.abs(other.top-r.top)<40).map(other=>other.left-10),Infinity);
    }
    const matches = new Set();
    const fields = [...document.querySelectorAll('input:not([type="hidden"]),textarea,select')].filter(visible);
    for (const label of labels) {
      const r = label.getBoundingClientRect();
      if (r.left < left || r.left >= right || r.top < top) continue;
      const forId=label.htmlFor || label.closest('label')?.htmlFor;
      const linked = forId ? document.getElementById(forId) : null;
      if (linked && visible(linked)) { matches.add(linked); continue; }
      const candidates = fields.filter(field=>{
        const f=field.getBoundingClientRect();
        return f.left>=r.right-10 && f.left<=r.right+240 && f.left<right && Math.abs(f.top+f.height/2-r.top-r.height/2)<Math.max(24,r.height);
      }).sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
      if (candidates.length) matches.add(candidates[0]);
      else {
        const below=fields.filter(field=>{const f=field.getBoundingClientRect();return f.left>=r.left-10&&f.left<=r.left+24&&f.left<right&&f.top>=r.bottom-4&&f.top<=r.bottom+44;}).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
        if(below.length)matches.add(below[0]);
      }
    }
    if (matches.size===1) return [...matches][0];
    if (required) throw new Error('Cannot uniquely locate Omni field: ' + (section ? section+' / ' : '') + labelName);
    return null;
  }

  async function writeNative(field, value, label, numeric = false) {
    assertNewQuote();
    if (!field || field.disabled || field.readOnly || !visible(field)) throw new Error('Cannot edit Omni ' + label + '.');
    const equal = actual => numeric ? Number(String(actual).replace(/[$,\s]/g,'')) === Number(value) : clean(actual)===clean(value);
    if (equal(field.value)) return;
    field.scrollIntoView({block:'center'});
    if (field instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,String(value));
      field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true}));
    } else if (field instanceof HTMLSelectElement) {
      const options=[...field.options].filter(option=>clean(option.text).toLowerCase()===clean(value).toLowerCase());
      if (options.length!==1) throw new Error('No unique Omni option for ' + label + ': ' + value);
      field.value=options[0].value; field.dispatchEvent(new Event('change',{bubbles:true}));
    } else setValue(field,value);
    field.blur(); await wait(100);
    const actual = field instanceof HTMLSelectElement ? field.selectedOptions[0]?.text : field.value;
    if (!field.isConnected || !equal(actual)) throw new Error('Omni did not retain ' + label + '.');
  }

  async function selectCustomer(customer) {
    const selected=()=>clean(nativeField('Selected Customer','',false)?.value);
    const email=()=>clean(nativeField('Email Address','Contact')?.value).toLowerCase();
    const confirmed=()=>Boolean(selected()) && (customer.email ? email()===customer.email.toLowerCase() : selected().toLowerCase()===customer.name.toLowerCase());
    if (selected()) { if(confirmed())return; throw new Error('A different Omni customer is already selected. No customer was overwritten.'); }
    let search=nativeField('First Name','Contact');
    search.scrollIntoView({block:'center'});
    setValue(search,customer.email || customer.name);
    let clicked=false;
    for(let attempt=0;attempt<140;attempt++) {
      assertNewQuote();
      if(confirmed())return;
      if(!clicked && !selected() && (attempt===25 || attempt===55)) {
        const next=attempt===25?nativeField('First Name','Contact'):nativeField('Company','Contact');
        search=next;search.scrollIntoView({block:'center'});
        setValue(search,attempt===25?customer.firstName:(customer.accountName||customer.name));
      }
      if(!clicked && search.isConnected) {
        const r=search.getBoundingClientRect();
        const options=[...document.querySelectorAll('[role="option"],.ui-menu-item,li,td,div,span')].filter(node=>{
          if(!visible(node)||node.closest('#lc-core-import')||node.closest('table')===tableInfo().table)return false;
          const text=clean(node.textContent),n=node.getBoundingClientRect();
          if(text.length>500||n.height>140||n.top<r.top-120||n.top>r.bottom+420||n.right<r.left||n.left>r.right+400)return false;
          const emails=(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(value=>value.toLowerCase());
          const name=text.toLowerCase(),wanted=customer.name.toLowerCase();
          return customer.email && emails.includes(customer.email.toLowerCase()) || !emails.length && (name===wanted||name.startsWith(wanted+' '));
        });
        const leaves=options.filter(node=>!options.some(other=>other!==node&&node.contains(other)));
        if(leaves.length>1)throw new Error('Several Omni customers match this Core contact. Select the correct customer in Omni before importing.');
        if(leaves.length===1){leaves[0].click();clicked=true;}
      }
      await wait(100);
    }
    throw new Error('Could not confirm the Core customer in Omni by email/name. Select or create that customer in Omni first; no customer record was invented.');
  }

  async function fillQuoteDetails() {
    const customer=quote.customer;
    await selectCustomer(customer);
    for(const [label,value] of [['First Name',customer.firstName],['Last Name',customer.lastName],['Company',customer.company],['Email Address',customer.email],['Phone',customer.phone],['Mobile',customer.mobile]]) {
      if(value)await writeNative(nativeField(label,'Contact'),value,'Contact '+label);
    }
    for(const [section,address,prefix] of [['Delivery Address',quote.shippingAddress,'Delivery'],['Billing Address',quote.billingAddress,'Billing']]) {
      const names=clean(address.contact).split(' ');
      for(const [label,value] of [['First Name',names[0]],['Last Name',names.slice(1).join(' ')],['Company',address.company]]) {
        const field=value?nativeField(label,section,false):null;
        if(field)await writeNative(field,value,section+' '+label);
      }
      for(const [suffix,value] of [['Address 1',address.line1],['Address 2',address.line2],['City',address.city],['State/Region',address.state],['Postal Code',address.postcode],['Country',address.country]]) {
        if(value)await writeNative(nativeField(prefix+' '+suffix),value,prefix+' '+suffix);
      }
    }
    const comments=[`Copied from Cin7 Core ${quote.sourceReference}`,`Core date: ${quote.sourceDate}`,quote.salesperson&&`Core salesperson: ${quote.salesperson}`,quote.customerReference&&`Customer reference: ${quote.customerReference}`,quote.terms&&`Core terms: ${quote.terms}`,quote.carrier&&`Core carrier: ${quote.carrier}`,quote.notes,quote.memo,...quote.lines.map(line=>`${line.sku}: ${line.description}${line.comment?'; '+line.comment:''}`),...quote.additionalCharges.map(item=>`${item.description}: ${item.quantity} x ${item.unitPrice}, discount ${item.discountPercent}%, total ${item.amount}${item.comment?'; '+item.comment:''}`)].filter(Boolean).join('\n');
    const internal=nativeField('Internal Comments');
    await writeNative(internal,[clean(internal.value),comments].filter(Boolean).join('\n'),'Internal Comments');
    await fillQuoteMemo('');
    const rep=quote.salesperson?nativeField('Sales Rep','',false):null;
    if(rep){
      const exact=[...rep.options||[]].filter(option=>clean(option.text).toLowerCase()===quote.salesperson.toLowerCase());
      if(exact.length===1)await writeNative(rep,quote.salesperson,'Sales Rep');
    }
    const terms=quote.terms?nativeField('Payment Terms','',false):null;
    if(terms && !terms.disabled && !terms.readOnly && (!(terms instanceof HTMLSelectElement) || [...terms.options].some(option=>clean(option.text).toLowerCase()===quote.terms.toLowerCase())))await writeNative(terms,quote.terms,'Payment Terms');
    const customerReference=quote.customerReference?nativeField('Customer PO No','',false):null;
    if(customerReference)await writeNative(customerReference,quote.customerReference,'Customer PO No');
  }

  async function fillQuoteMemo(value) {
      let memo=document.querySelector('textarea[aria-label="Delivery Instructions"], [data-lc-delivery-label] textarea');
      if(!memo){
        const marker=document.querySelector('[data-lc-delivery-label]');
        if(marker){
          const r=marker.getBoundingClientRect();
          const candidates=[...document.querySelectorAll('textarea')].filter(field=>{const f=field.getBoundingClientRect();return visible(field)&&f.top>=r.top-10&&f.top<=r.bottom+70&&f.right>r.left&&f.left<r.right+100;}).sort((a,b)=>Math.abs(a.getBoundingClientRect().top-r.bottom)-Math.abs(b.getBoundingClientRect().top-r.bottom));
          memo=candidates[0];
        }
      }
      if(!memo){if(quote.memo)throw new Error('Core memo was preserved in Internal Comments, but the native quote memo field could not be identified.');return;}
      // Keep automatic installation helpers inactive until all Core fee lines exist.
      await writeNative(memo,value,'Quote memo');
  }

  async function fillCharges() {
    for(const [label,item] of [['Freight Costs',quote.freight],['Surcharge',quote.surcharge],['Discount',quote.discount]]) {
      const labels=[...document.querySelectorAll('label,button,td,span,div,strong')].filter(node=>visible(node)&&key(node.textContent)===key(label));
      const pairs=[];
      for(const node of labels){
        const r=node.getBoundingClientRect();
        const fields=[...document.querySelectorAll('input:not([type="hidden"])')].filter(field=>{
          const f=field.getBoundingClientRect(); return visible(field)&&!field.disabled&&!field.readOnly&&f.left>=r.right-10&&Math.abs(f.top+f.height/2-r.top-r.height/2)<20;
        }).sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
        if(fields.length===2&&!pairs.some(pair=>pair[0]===fields[0]))pairs.push(fields);
      }
      if(pairs.length!==1){if(item.amount)throw new Error('Cannot uniquely locate Omni '+label+' amount and description.');continue;}
      await writeNative(pairs[0][0],item.description||'',label+' description');
      await writeNative(pairs[0][1],String(item.amount),label+' amount',true);
    }
  }

  function nativeAmount(label) {
    const pattern=label==='Total'?/^Total\s*:?\s*(?:NZD\s*|\$\s*)?(-?[\d,]+\.\d{2})\s*(?:NZD)?$/i:/^Total\s*Tax\s*15\s*%\s*:?\s*(?:\$\s*)?(-?[\d,]+\.\d{2})$/i;
    const matches=[...document.querySelectorAll('td,span,div,p,strong,b')].filter(visible).map(node=>clean(node.textContent).match(pattern)).filter(Boolean);
    const values=new Set(matches.map(match=>Number(match[1].replace(/,/g,''))));
    if(values.size===1)return [...values][0];
    return null;
  }

  async function verifyQuoteTotal() {
    for(let attempt=0;attempt<30;attempt++){
      if(nativeAmount('Total')===quote.total && nativeAmount('Tax')===quote.tax)return;
      await wait(100);
    }
    throw new Error('Quote fields filled but native Omni total/GST could not be verified against Core. Expected total '+money(quote.total)+' and GST '+money(quote.tax)+'. Do not save until reconciled.');
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
  get('file').hidden = true;
  const lookup = document.createElement('div');
  lookup.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:16px 0';
  lookup.innerHTML='<input id="reference" aria-label="Core quote number" placeholder="NZSO-16714" style="font:inherit;padding:8px;border:1px solid #a9bec3;border-radius:4px;min-width:0;flex:1"><button id="lookup" type="button">Load from Core</button>';
  get('file').before(lookup);
  get('status').textContent='Enter a Core quote number.';
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
    get('lookup').disabled = busy || started;
  };
  get('open').addEventListener('click', () => dialog.showModal());
  shadow.querySelector('.close').addEventListener('click', () => dialog.close());
  get('confirm').addEventListener('change', controls);
  function loadQuote(data) {
    quote = null;
    get('confirm').checked = false;
    get('details').textContent = '';
    get('warning').textContent = '';
    shadow.querySelector('tbody').replaceChildren();
    controls();
    try {
      quote = validate(data);
      get('details').textContent = `${quote.sourceReference} | ${clean(quote.customer?.name)} | ${quote.currency}\nEmail: ${clean(quote.customer?.email)}\nFreight: ${money(quote.freight.amount)} | Target total incl. GST: ${money(quote.total)}`;
      const api = quote.schema==='lc-core-quote-api-v1';
      get('fill').textContent=api?'Fill Quote':'Fill Product Lines';
      get('warning').textContent = [...quote.warnings, ...(api?[]:['Legacy local-file test: customer details and freight are manual.'])].join('\n');
      if(api) get('details').textContent+=`\nPhone: ${quote.customer.phone || quote.customer.mobile || 'Not provided by Core'}\nDelivery: ${[quote.shippingAddress.line1,quote.shippingAddress.line2,quote.shippingAddress.city,quote.shippingAddress.postcode].filter(Boolean).join(', ')}`;
      get('confirm').parentElement.lastChild.textContent=api?' NZD / GST-inclusive pricing and source warnings reviewed.':' Customer selected and NZD / GST-inclusive pricing checked in Omni. Source warnings reviewed.';
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
  }
  get('file').addEventListener('change', async () => {
    try {
      status('Loading local test file...');
      const file=get('file').files[0];
      if(!file||file.size>100000)throw new Error('Invalid local test file.');
      loadQuote(JSON.parse(await file.text()));
    } catch(error){quote=null;controls();status(error.message);}
  });
  get('lookup').addEventListener('click', () => {
    if(started||busy)return;
    requestCoreQuote(get('reference').value,(data)=>loadQuote(data),status);
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
      if(quote.schema==='lc-core-quote-api-v1') {
        status('Selecting the Core customer and copying contact/address details.');
        await fillQuoteDetails();
      }
      for (const [index, line] of quote.lines.entries()) {
        status(`${index + 1}/${quote.lines.length}: ${line.sku}`);
        await addProduct(line);
        for (const [name, value] of [['qtyordered', line.quantity], ['unitprice', line.unitPrice], ['disc', line.discountPercent]]) await numericField(line, name, value);
      }
      verifyLines();
      if(quote.schema==='lc-core-quote-api-v1'){
        await fillQuoteMemo(quote.memo);await fillCharges(); await verifyQuoteTotal();
        status(`Core quote ${quote.sourceReference} copied into the unsaved Omni quote. Customer, contacts, addresses, product lines, charges and total ${money(quote.total)} checked. Review before saving; no payment or fulfilment status was transferred.`);
      } else status(`Product lines filled, not saved. Enter freight ${money(quote.freight.amount)} and check the final Omni total is ${money(quote.total)}. Preserve Core reference ${quote.sourceReference} in Internal Comments; let Omni assign its own quote number. The separate source discount has NOT been applied.`);
    } catch (error) { status('Stopped: ' + error.message + (started ? '\nSome lines may already be filled. Inspect them manually; this pilot will not rerun on this page.' : '')); }
    finally { busy = false; controls(); if (!dialog.open) dialog.showModal(); }
  });
  if(handoff) {
    const pending=handoff;handoff=null;
    sessionStorage.removeItem(tabKey);
    if(typeof GM_deleteValue==='function')GM_deleteValue(pendingKey);
    loadQuote(pending.quote);
    if(quote){get('confirm').checked=true;controls();get('fill').click();}
  }
})();
