// ==UserScript==
// @name         Living Culture Caribbean Stock - Preview
// @namespace    livingculture-stock-preview
// @version      0.1.0
// @description  Separate read-only Caribbean stock preview for Cin7 Omni and Core. Hold and paid actions are browser-only simulations.
// @author       Living Culture
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      docs.google.com
// @connect      *.googleusercontent.com
// @require      https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/caribbean-stock-preview.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/caribbean-stock-preview.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.parent !== window || !/^(?:go\.cin7\.com|(?:[^.]+\.)*dearsystems\.com|(?:[^.]+\.)*cin7core\.com)$/.test(location.hostname)) return;
  const ROOT = 'lc-caribbean-stock-preview';
  const BUTTON = 'lc-caribbean-stock-preview-button';
  const STORAGE = 'lcCaribbeanStockPreviewV1';
  const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/1tHDqaApj978tVT8SnSlQ0S-EytkmNM0MlnD8i5cIapc/edit?gid=0#gid=0';
  const DAY = 86400000;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const timeLabel = value => new Intl.DateTimeFormat('en-NZ', {timeZone:'Pacific/Auckland',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value));
  let saved;
  try { saved = GM_getValue(STORAGE, {}); } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  saved = {sheet:typeof saved.sheet === 'string' && saved.sheet ? saved.sheet : DEFAULT_SHEET,allocations:saved.allocations && typeof saved.allocations === 'object' && !Array.isArray(saved.allocations) ? saved.allocations : {}};
  let root, ui, dialog, previousFocus, mode = 'empty', rows = [], loadedAt = 0, busy = false, selected = null, lastSample = false;

  function persist(next) {
    GM_setValue(STORAGE, next);
    saved = next;
  }
  function sheetConfig(value) {
    const url = new URL(clean(value));
    const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !match) throw new Error('Enter a Google Sheets link beginning https://docs.google.com/spreadsheets/d/.');
    const fragment = new URLSearchParams(url.hash.slice(1));
    const gid = url.searchParams.get('gid') || fragment.get('gid') || '0';
    if (!/^\d+$/.test(gid)) throw new Error('The sheet tab ID must be a number.');
    return {id:match[1],gid,url:`https://docs.google.com/spreadsheets/d/${match[1]}/edit?gid=${gid}#gid=${gid}`};
  }
  function parseSheet(raw, config) {
    const response = String(raw).trim().match(/^(?:\/\*[\s\S]*?\*\/\s*)?google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
    if (!response) throw new Error('Google did not return stock data. Check the link and your sheet access.');
    const payload = JSON.parse(response[1]);
    if (payload.status === 'error') throw new Error('Google could not read this tab. Open the spreadsheet and check access.');
    const table = payload.table;
    if (!Array.isArray(table?.cols) || !Array.isArray(table?.rows)) throw new Error('The spreadsheet response was not recognised.');
    const headings = table.cols.map(column => key(column.label));
    const column = (...aliases) => headings.findIndex(heading => aliases.includes(heading));
    const indices = {
      code:column('cscode','sku','code'),name:column('name','product','productname'),type:column('type'),size:column('size'),colour:column('color','colour'),
      akl:column('availableakl','availableauckland','akl','auckland'),water:column('availableonwater','onwater','availablewater'),foshan:column('availablefoshan','foshan'),
      notes:column('notes','note'),quote:column('quotenumber','quoteno','quote','ordernumber'),date:column('date'),status:column('status'),
    };
    for (const field of ['code','name','akl','water','foshan']) if (indices[field] < 0) throw new Error(`Missing spreadsheet heading: ${field}. Columns are matched by heading, not letter.`);
    const text = (cells, index) => index < 0 ? '' : clean(cells[index]?.f ?? cells[index]?.v);
    const quantity = value => value === '' ? 0 : /^\d+(?:\.0+)?$/.test(value) ? Number(value) : NaN;
    return table.rows.flatMap((row, index) => {
      const cells = row.c || [];
      const code = text(cells, indices.code), name = text(cells, indices.name);
      if (!code && !name) return [];
      if (!code || !name) return [];
      const stock = {Auckland:quantity(text(cells, indices.akl)),'On water':quantity(text(cells, indices.water)),Foshan:quantity(text(cells, indices.foshan))};
      const locations = Object.keys(stock).filter(location => stock[location] > 0);
      const validUnit = Object.values(stock).every(Number.isFinite) && Object.values(stock).reduce((sum, count) => sum + count, 0) === 1;
      return [{id:`sheet:${config.id}:${config.gid}:${index+2}`,sheetRow:index+2,code,name,type:text(cells,indices.type),size:text(cells,indices.size),colour:text(cells,indices.colour),
        location:locations.join(' / ') || 'Not recorded',notes:text(cells,indices.notes),quote:text(cells,indices.quote),date:text(cells,indices.date),sheetStatus:text(cells,indices.status),validUnit}];
    });
  }
  function sampleRows() {
    const products = [
      ['CS19500-11','7 x 4','White','Freestanding',['Auckland','Foshan','Foshan','Foshan']],
      ['CS20094-11','7 x 4','Black','Freestanding',['Auckland','Foshan','Foshan']],
      ['CS20095-12','7.9 x 3.6','Black','Freestanding',['Auckland','Foshan','Foshan']],
      ['CS20096-6','4 x 3.9','Black','Wall Mounted',['On water','Foshan','Foshan']],
      ['CS19517-6','4 x 3.9','White','Wall Mounted',['Auckland','Foshan','Foshan']],
      ['CS20100-11','7.9 x 3.5','Black','Wall Mounted',['Auckland']],
    ];
    let sheetRow = 1;
    return products.flatMap(([code,size,colour,type,locations]) => locations.map((location,index) => ({
      id:`sample:${++sheetRow}`,sheetRow,code,size,colour,type,location,validUnit:true,quote:'',date:'',sheetStatus:'Available',
      name:`Caribbean Motorised ${type} Louvre Roof Aluminium Pergola ${size}m ${colour}`,
      notes:index === 0 && code === 'CS20096-6' ? 'Aiming for container 972 (if fits or one after)' : index === 0 && ['CS20094-11','CS19517-6'].includes(code) ? 'In container 924' : '',
    })));
  }
  function fingerprint(row) {
    return JSON.stringify([row.code,row.name,row.type,row.size,row.colour,row.location,row.quote,row.date,row.sheetStatus]);
  }
  function allocation(row) {
    const record = saved.allocations[row.id];
    return record?.fingerprint === fingerprint(row) && ['Held','Paid'].includes(record.status) ? record : null;
  }
  function rowStatus(row) {
    if (!row.validUnit) return 'Check quantities';
    const local = allocation(row);
    if (local) return local.status === 'Held' && local.expiresAt <= Date.now() ? 'Expired hold' : local.status;
    if (row.quote) return 'Allocated in sheet';
    if (/^(held|on hold|reserved|paid|sold)$/i.test(row.sheetStatus)) return 'Allocated in sheet';
    if (mode === 'sample' || /^available$/i.test(row.sheetStatus)) return 'Available';
    return 'Check sheet';
  }
  function readField(pattern) {
    const labels = [...document.querySelectorAll('label,td,th')].filter(element => !element.closest(`#${ROOT}`) && pattern.test(clean(element.textContent)));
    for (const label of labels) {
      const input = label.htmlFor && document.getElementById(label.htmlFor) || label.querySelector('input,select') || label.nextElementSibling?.querySelector('input,select') || (label.nextElementSibling?.matches('input,select') ? label.nextElementSibling : null);
      if (input && input.getClientRects().length) return clean(input.tagName === 'SELECT' ? input.selectedOptions[0]?.textContent : input.value);
    }
    return '';
  }
  function currentJob() {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(element => !element.closest(`#${ROOT}`) && element.getClientRects().length);
    const heading = headings.map(element => clean(element.textContent)).find(text => /\b(?:NZSO-?\d+|SFOR\d+(?:-[A-Z0-9]+)?)\b/i.test(text) && text.length < 350) || '';
    const match = heading.match(/\b(?:NZSO-?\d+|SFOR\d+(?:-[A-Z0-9]+)?)\b/i);
    return {quote:match?.[0].toUpperCase() || readField(/^(?:quote|order|sale)(?:\s+(?:no\.?|number))?\s*[:#]?$/i),
      customer:clean(heading.match(/^(?:Edit|New)\s+(?:Sales Order|Quote)\s*-\s*(.+?)\s*-\s*(?:NZSO|SFOR)/i)?.[1]) || readField(/^(?:selected customer|customer|customer name)\s*:?$/i),
      rep:readField(/^(?:sales rep|sales representative|salesperson)\s*:?$/i)};
  }
  function addIcons(scope = ui) {
    if (typeof lucide === 'undefined') return;
    scope.querySelectorAll('[data-icon]').forEach(element => {
      const node = lucide.icons[element.dataset.icon];
      if (node) element.replaceChildren(lucide.createElement(node, {width:17,height:17,'aria-hidden':'true'}));
    });
  }
  function message(text, error = false) {
    const element = ui.querySelector('#message');
    element.textContent = text;
    element.className = error ? 'message error' : 'message';
    element.hidden = !text;
  }
  function options(selector, values, label) {
    const select = ui.querySelector(selector), before = select.value;
    select.innerHTML = `<option value="">${label}</option>` + [...new Set(values.filter(Boolean))].sort().map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
    select.value = [...select.options].some(option => option.value === before) ? before : '';
  }
  function updateFilters() {
    options('#type',rows.map(row => row.type),'All types');
    options('#colour',rows.map(row => row.colour),'All colours');
    options('#location',rows.map(row => row.location),'All locations');
  }
  function render() {
    const q = key(ui.querySelector('#search').value);
    const values = Object.fromEntries(['type','colour','location','status'].map(field => [field,ui.querySelector(`#${field}`).value]));
    const filtered = rows.filter(row => {
      const record = allocation(row);
      return (!q || key([row.code,row.name,row.notes,row.quote,record?.quote,record?.customer,record?.rep].join(' ')).includes(q))
        && ['type','colour','location'].every(field => !values[field] || row[field] === values[field])
        && (!values.status || rowStatus(row) === values.status);
    });
    const available = rows.filter(row => rowStatus(row) === 'Available').length;
    ui.querySelector('#count').textContent = `${filtered.length} of ${rows.length} rows · ${available} ${mode === 'sample' ? 'sample units available' : 'explicitly marked available'}`;
    ui.querySelector('#source').textContent = mode === 'sample' ? 'SCREENSHOT SAMPLE · 20 Oct 2026 · Not current stock' : mode === 'live' ? `SHEET DATA · Read ${timeLabel(loadedAt)} · Preview actions only` : mode === 'stale' ? `STALE SHEET DATA · Last read ${timeLabel(loadedAt)}` : 'No stock source selected';
    ui.querySelector('#refresh').disabled = busy || !saved.sheet;
    ui.querySelector('#sample').disabled = busy;
    ui.querySelector('#connect').disabled = busy;
    const groups = new Map();
    filtered.forEach(row => { const group = JSON.stringify([row.code,row.name,row.type,row.size,row.colour]);groups.set(group,[...(groups.get(group) || []),row]); });
    ui.querySelector('#results').innerHTML = [...groups.values()].map(units => {
      const product = units[0];
      return `<section class="product"><header class="product-head"><div><strong>${escape(product.code)}</strong><h2>${escape(product.name)}</h2></div><div class="specs"><span>${escape(product.type)}</span><span>${escape(product.size)} m</span><span class="colour"><i class="swatch ${/^white$/i.test(product.colour) ? 'white' : /^black$/i.test(product.colour) ? 'black' : 'other'}"></i>${escape(product.colour)}</span></div></header>${units.map(row => {
        const status = rowStatus(row), record = allocation(row);
        const tone = status === 'Paid' ? 'paid' : ['Held','Expired hold'].includes(status) ? 'held' : 'neutral';
        const canTry = !busy && mode !== 'stale' && row.validUnit && ['Available','Check sheet'].includes(status);
        return `<div class="unit ${tone}" data-unit="${escape(row.id)}"><div class="unit-id">Row ${row.sheetRow}<small>${escape(row.location)}</small></div><div class="unit-notes">${escape(row.notes || '')}${row.quote ? `<small>Sheet quote: ${escape(row.quote)}${row.date ? ` · ${escape(row.date)}` : ''}</small>` : ''}${record ? `<small>${escape(record.quote)} · ${escape(record.customer)} · ${escape(record.rep)}</small>` : ''}</div><div class="unit-state"><strong>${escape(status)}</strong>${record?.status === 'Held' ? `<small>${status === 'Expired hold' ? 'Review expired hold' : 'Expires'} ${escape(timeLabel(record.expiresAt))}</small>` : record ? `<small>Preview only · ${escape(timeLabel(record.at))}</small>` : ''}</div><div class="unit-actions">${record ? `${record.status === 'Held' ? `<button type="button" data-action="paid" data-id="${escape(row.id)}" ${busy ? 'disabled' : ''}>Preview paid</button>` : ''}<button type="button" data-action="release" data-id="${escape(row.id)}" title="Clear this browser-only preview"><span data-icon="RotateCcw"></span><span>Clear</span></button>` : `<button type="button" data-action="hold" data-id="${escape(row.id)}" ${canTry ? '' : 'disabled'}>Preview hold</button><button type="button" data-action="paid" data-id="${escape(row.id)}" ${canTry ? '' : 'disabled'}>Preview paid</button>`}</div></div>`;
      }).join('')}</section>`;
    }).join('') || `<div class="empty">${busy ? 'Reading spreadsheet...' : rows.length ? 'No matching stock rows.' : 'Connect the Google Sheet or load the screenshot sample.'}</div>`;
    addIcons(ui.querySelector('#results'));
  }
  function requestSheet(config) {
    return new Promise((resolve,reject) => GM_xmlhttpRequest({method:'GET',url:`https://docs.google.com/spreadsheets/d/${config.id}/gviz/tq?gid=${config.gid}&headers=1&tqx=out:json&_=${Date.now()}`,timeout:20000,
      onload:response => response.status >= 200 && response.status < 300 ? resolve(response.responseText) : reject(new Error([401,403].includes(response.status) ? 'Google Sheets requires sign-in. Open the spreadsheet with your staff Google account, then retry; the screenshot sample is available without access.' : `Sheet returned ${response.status}. Check the link and access in Google Sheets.`)),
      onerror:() => reject(new Error('Could not reach Google Sheets.')),ontimeout:() => reject(new Error('Google Sheets timed out.'))}));
  }
  async function connect() {
    if (busy) return;
    const input = ui.querySelector('#sheet-url');
    let config;
    try { config = sheetConfig(input.value);persist({...saved,sheet:config.url});input.value = config.url; }
    catch (error) { message(error.message,true);return; }
    const sheetLink = ui.querySelector('#open-sheet');sheetLink.href = config.url;sheetLink.hidden = false;
    busy = true;selected = null;ui.querySelector('#allocation').hidden = true;message('Reading Google Sheets...');render();
    try {
      const result = parseSheet(await requestSheet(config),config);
      if (!result.length) throw new Error('No stock rows were returned by this tab.');
      rows = result;mode = 'live';lastSample = false;loadedAt = Date.now();updateFilters();ui.querySelector('.connection').open = false;
      message('Sheet row colours are not available in this preview. Unmarked rows say “Check sheet”; existing quote allocations cannot be selected.');
      const link = ui.querySelector('#open-sheet');link.href = config.url;link.hidden = false;
    } catch (error) {
      if (mode === 'live' || mode === 'stale') mode = 'stale';
      message(error.message,true);
    } finally { busy = false;render(); }
  }
  function sample() {
    rows = sampleRows();mode = 'sample';lastSample = true;loadedAt = Date.now();selected = null;
    ui.querySelector('#allocation').hidden = true;ui.querySelector('.connection').open = false;updateFilters();message('Screenshot sample loaded. Changes below do not reserve stock or record a real payment.');render();
  }
  function selectUnit(id, action) {
    const row = rows.find(item => item.id === id);
    if (!row) return;
    if (action === 'release') {
      if (!confirm(`Clear the preview for ${row.code}, row ${row.sheetRow}? The spreadsheet will not change.`)) return;
      const allocations = {...saved.allocations};delete allocations[id];
      try { persist({...saved,allocations});selected = null;ui.querySelector('#allocation').hidden = true;message('Preview cleared. No spreadsheet or Cin7 data changed.');render(); }
      catch { message('Could not save the preview change.',true); }
      return;
    }
    const record = allocation(row);
    if (busy || mode === 'stale' || !row.validUnit || (!record && !['Available','Check sheet'].includes(rowStatus(row))) || record?.status === 'Paid') return;
    selected = {id,action};
    const form = ui.querySelector('#allocation');form.reset();
    const context = record || currentJob();
    for (const field of ['quote','customer','rep']) form.elements[field].value = context[field] || '';
    ui.querySelector('#allocation-heading').textContent = `${action === 'hold' ? 'Preview 24-hour hold' : 'Preview paid'} · ${row.code} · Row ${row.sheetRow} · ${row.location}`;
    ui.querySelector('#confirm-label').textContent = action === 'hold' ? 'Valid quote and customer has verbally agreed to pay.' : 'Payment has been verified for this quote.';
    form.hidden = false;form.scrollIntoView({block:'nearest'});form.elements.quote.focus();
  }
  function saveAllocation(event) {
    event.preventDefault();
    if (!selected) return;
    const row = rows.find(item => item.id === selected.id);
    if (!row || busy || mode === 'stale') return;
    const form = event.currentTarget;
    const quote = clean(form.elements.quote.value).toUpperCase();
    if (!/^(?:NZSO-?\d+|SFOR\d+(?:-[A-Z0-9]+)?)$/.test(quote)) { message('Enter a valid NZSO or SFOR quote number before trying this preview.',true);form.elements.quote.focus();return; }
    const at = Date.now();
    const record = {fingerprint:fingerprint(row),status:selected.action === 'hold' ? 'Held' : 'Paid',quote,customer:clean(form.elements.customer.value),rep:clean(form.elements.rep.value),at,expiresAt:at+DAY};
    try {
      persist({...saved,allocations:{...saved.allocations,[row.id]:record}});
      form.hidden = true;selected = null;
      message(`${record.status === 'Held' ? '24-hour hold' : 'Paid state'} preview saved in this browser only. No live stock or payment changed.`);render();
    } catch { message('The preview could not be saved in this browser.',true); }
  }
  function createUI() {
    if (root?.isConnected) return;
    root = document.createElement('div');root.id = ROOT;document.body.append(root);ui = root.attachShadow({mode:'open'});
    ui.innerHTML = `<style>
      :host{font:14px Arial,sans-serif;color:#243c40;letter-spacing:0}*{box-sizing:border-box}button,input,select{font:inherit;letter-spacing:0}button,a,input,select{touch-action:manipulation}button,a{color:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;border:1px solid #bfd1d3;border-radius:4px;background:#fff;padding:6px 10px;color:#18575d}button:hover:enabled{background:#edf7f6}button:focus-visible,a:focus-visible{outline:2px solid #00889f;outline-offset:3px}svg{display:block;flex:none}dialog{padding:0;width:min(1000px,calc(100vw - 24px));height:min(840px,calc(100dvh - 24px));max-width:none;max-height:none;border:1px solid #b6cdce;border-radius:6px;background:#f6faf9;color:#243c40}dialog::backdrop{background:#10272899}[hidden]{display:none!important}.shell{height:100%;display:flex;flex-direction:column;min-height:0}.header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:#fff;border-bottom:1px solid #cbdcdb}.title{display:flex;align-items:center;gap:10px;min-width:0}h1{margin:0;font-size:20px;line-height:1.2}.brand{font-size:11px;color:#16704f;font-weight:700;margin-bottom:3px}.preview-tag{color:#8a4d16;background:#fff3ce;border:1px solid #e5cc7d;border-radius:3px;padding:4px 7px;font-size:11px;white-space:nowrap}.icon{width:34px;padding:6px;flex:none}.header-actions{display:flex;align-items:center;gap:8px}.safety{padding:8px 18px;background:#e5f3ed;color:#245c47;border-bottom:1px solid #c6ddd1;font-size:12px}.source{padding:8px 18px;background:#f1f6f5;border-bottom:1px solid #d6e2df;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;color:#526c6d;font-weight:700;flex-wrap:wrap}.source-actions{display:flex;gap:10px;align-items:center}.source-actions a{color:#087e8c}.content{overflow:auto;min-height:0;flex:1}.connection{padding:12px 18px;border-bottom:1px solid #d6e2df}.connection summary{cursor:pointer;color:#176e58;font-weight:700}.connection-row{display:flex;gap:8px;margin-top:10px}.connection-row label{flex:1;min-width:0}label{display:grid;gap:4px;font-size:12px;color:#476165}input,select{width:100%;min-width:0;min-height:36px;border:1px solid #c1d5d6;border-radius:4px;padding:6px 9px;background:#fff;color:#263f44;font-size:16px}.filters{display:grid;grid-template-columns:minmax(180px,1.6fr) repeat(4,minmax(95px,1fr));gap:8px;padding:12px 18px}.count{padding:0 18px 10px;color:#5d7779;font-size:12px}.message{margin:10px 18px;padding:9px 11px;background:#e8f4f1;color:#225b48;font-size:12px;border-left:3px solid #27815c}.message.error{background:#fff0e9;color:#9a3a21;border-color:#c65d3d}.allocation{padding:12px 18px;background:#fff8df;border-block:1px solid #e4d398}.allocation h2{font-size:14px;margin:0 0 10px}.fields{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:8px}.confirmation{display:flex;align-items:center;gap:7px;margin:10px 0;font-size:12px}.confirmation input{width:17px;min-height:17px;height:17px;margin:0;accent-color:#247f5b}.form-actions{display:flex;gap:8px}.primary{background:#176e58;color:white;border-color:#176e58}.primary:hover:enabled{background:#125441}.product{border-top:1px solid #c7d9d8}.product-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 18px;background:#edf4f3}.product-head strong{color:#007c91;font-size:13px}.product h2{font-size:13px;margin:4px 0 0;line-height:1.4;max-width:590px;font-weight:500;overflow-wrap:anywhere}.specs{display:flex;flex-wrap:wrap;gap:7px 12px;justify-content:flex-end;font-size:11px;max-width:220px;flex-shrink:0;color:#476568}.colour{display:inline-flex;align-items:center;gap:5px}.swatch{width:11px;height:11px;border-radius:50%;border:1px solid #96a8a8;background:#a5b3b3}.white{background:#fff}.black{background:#242727}.unit{display:grid;grid-template-columns:95px minmax(120px,1fr) 155px 200px;gap:10px;align-items:center;padding:9px 18px;background:#fff;border-top:1px solid #e1eae8;min-height:61px;font-size:12px}.unit small{display:block;color:#637c7c;line-height:1.45;font-size:11px;margin-top:3px;overflow-wrap:anywhere}.unit-id{font-weight:700}.unit-notes{overflow-wrap:anywhere;line-height:1.4}.unit-actions{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}.unit-actions button{font-size:11px;padding:5px 7px;min-height:30px}.unit.held{background:#fff4c9;border-left:4px solid #e6b73c;padding-left:14px}.unit.paid{background:#fbe2df;border-left:4px solid #cc655c;padding-left:14px}.empty{padding:35px 18px;color:#6c8284;text-align:center}.footer{padding:9px 18px;background:#fff;border-top:1px solid #d0dedc;color:#6a7e7f;font-size:11px}
      @media(max-width:800px){.filters{grid-template-columns:repeat(4,minmax(0,1fr))}.filters label:first-child{grid-column:1/-1}.unit{grid-template-columns:80px minmax(100px,1fr) 140px}.unit-actions{grid-column:2/-1}.product-head{align-items:flex-start}.specs{max-width:150px}.fields{grid-template-columns:1fr 1fr}.fields label:last-child{grid-column:1/-1}}
      @media(max-width:500px){dialog{width:calc(100vw - 12px);height:calc(100dvh - 12px)}.header{padding:12px}.header h1{font-size:17px}.preview-tag{display:none}.safety,.source,.connection,.filters,.allocation,.product-head,.footer{padding-left:12px;padding-right:12px}.connection-row{flex-wrap:wrap}.connection-row label{flex-basis:100%}.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.unit{grid-template-columns:75px minmax(0,1fr);padding:10px 12px;gap:8px}.unit.held,.unit.paid{padding-left:8px}.unit-state{grid-column:1}.unit-actions{grid-column:2;grid-row:2}.unit-actions button{font-size:11px}.product-head{flex-direction:column;gap:8px}.specs{max-width:100%;justify-content:flex-start}.fields{grid-template-columns:1fr}.fields label:last-child{grid-column:auto}.message{margin-inline:12px}.count{padding-inline:12px}}
    </style><dialog aria-labelledby="heading"><div class="shell"><header class="header"><div class="title"><div><div class="brand">LIVING CULTURE</div><h1 id="heading">Caribbean Stock</h1></div><span class="preview-tag">PREVIEW</span></div><div class="header-actions"><button type="button" id="refresh" class="icon" title="Refresh spreadsheet" aria-label="Refresh spreadsheet"><span data-icon="RefreshCw"></span></button><button type="button" id="close" class="icon" title="Close" aria-label="Close Caribbean Stock"><span data-icon="X"></span></button></div></header><div class="safety">Preview only. Holds and paid states stay in this browser; no live stock, payments or Cin7 orders change.</div><div class="source"><span id="source"></span><div class="source-actions"><a id="open-sheet" hidden target="_blank" rel="noopener noreferrer">Open spreadsheet</a><button type="button" id="sample">Load screenshot sample</button></div></div><div class="content"><details class="connection" open><summary>Spreadsheet connection</summary><div class="connection-row"><label>Google Sheets link<input id="sheet-url" type="url" placeholder="https://docs.google.com/spreadsheets/d/..."></label><button type="button" id="connect"><span data-icon="Link"></span>Read sheet</button></div></details><div class="filters"><label>Search<input id="search" type="search" placeholder="Code, size, colour, quote..."></label><label>Type<select id="type"><option value="">All types</option></select></label><label>Colour<select id="colour"><option value="">All colours</option></select></label><label>Location<select id="location"><option value="">All locations</option></select></label><label>Status<select id="status"><option value="">All statuses</option><option>Available</option><option>Held</option><option>Paid</option><option>Expired hold</option><option>Allocated in sheet</option><option>Check sheet</option><option>Check quantities</option></select></label></div><div id="count" class="count" role="status"></div><p id="message" class="message" role="status" hidden></p><form id="allocation" class="allocation" hidden><h2 id="allocation-heading"></h2><div class="fields"><label>Quote / job number<input name="quote" required maxlength="40" placeholder="NZSO-17009 or SFOR12345"></label><label>Customer<input name="customer" required maxlength="150"></label><label>Rep<input name="rep" required maxlength="100"></label></div><label class="confirmation"><input name="confirmed" type="checkbox" required><span id="confirm-label"></span></label><div class="form-actions"><button type="submit" class="primary">Save preview only</button><button type="button" id="cancel">Cancel</button></div></form><main id="results"></main></div><footer class="footer">One spreadsheet row per unit. Expired preview holds remain flagged until reviewed; no automatic release or removal.</footer></div></dialog>`;
    dialog = ui.querySelector('dialog');ui.querySelector('#sheet-url').value = saved.sheet;
    ui.querySelector('#close').addEventListener('click',() => dialog.close());
    dialog.addEventListener('click',event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect();if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    dialog.addEventListener('close',() => { if (previousFocus?.isConnected) previousFocus.focus(); });
    ui.querySelector('#sample').addEventListener('click',sample);
    ui.querySelector('#connect').addEventListener('click',connect);
    ui.querySelector('#refresh').addEventListener('click',() => { ui.querySelector('#sheet-url').value = saved.sheet;void connect(); });
    ui.querySelector('#cancel').addEventListener('click',() => { selected = null;ui.querySelector('#allocation').hidden = true; });
    ui.querySelector('#allocation').addEventListener('submit',saveAllocation);
    ui.querySelector('#results').addEventListener('click',event => { const button = event.target.closest('button[data-action]');if (button && !button.disabled) selectUnit(button.dataset.id,button.dataset.action); });
    ui.querySelectorAll('.filters input,.filters select').forEach(element => element.addEventListener(element.tagName === 'SELECT' ? 'change' : 'input',render));
    addIcons();render();
  }
  function open() {
    createUI();previousFocus = document.activeElement;dialog.showModal();ui.querySelector('#search').focus();
    if (saved.sheet && !lastSample && !busy) { ui.querySelector('#sheet-url').value = saved.sheet;void connect(); }
    else render();
  }
  function mount() {
    if (!document.body) return;
    let button = document.getElementById(BUTTON);
    if (!button) {
      button = document.createElement('button');button.id = BUTTON;button.type = 'button';button.textContent = 'Caribbean Stock · Preview';
      button.title = 'Open the separate Caribbean stock preview';button.addEventListener('click',open);
    }
    const toolbar = location.hostname === 'go.cin7.com' ? document.getElementById('lc-omni-workflow-tools-bar') : null;
    const promo = document.getElementById('lc-promo-summary-inline-button');
    const coreParent = promo?.isConnected && getComputedStyle(promo.parentElement).display.includes('flex') ? promo.parentElement : null;
    const parent = toolbar || coreParent;
    if (parent) {
      if (button.parentElement !== parent) parent.append(button);
    } else if (button.parentElement !== document.body) document.body.append(button);
    const style = `box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-height:36px;max-width:calc(100vw - 24px);padding:7px 12px;border:1px solid #176e58;border-radius:4px;background:#176e58;color:white;font:700 13px Arial,sans-serif;white-space:normal;cursor:pointer;${parent ? 'position:static;' : 'position:fixed;right:16px;bottom:18px;z-index:2147483000;box-shadow:0 2px 8px #0002;'}`;
    if (button.style.cssText !== style) button.style.cssText = style;
  }
  let scheduled = false;
  const schedule = () => { if (scheduled) return;scheduled = true;requestAnimationFrame(() => { scheduled = false;mount(); }); };
  new MutationObserver(records => { if (records.some(record => !record.target.closest?.(`#${ROOT}`))) schedule(); }).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',mount,{once:true});window.addEventListener('resize',schedule);mount();
  setInterval(() => { if (dialog?.open && !busy) render(); },60000);
})();
