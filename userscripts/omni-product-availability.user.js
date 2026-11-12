// ==UserScript==
// @name         Omni Living Culture Product Availability
// @namespace    livingculture-omni
// @version      0.1.18
// @description  Checks Omni products-page stock for all SKUs on the current quote.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-product-availability.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-product-availability.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PRODUCT_AVAILABILITY_URL = 'https://go.cin7.com/Cloud/ShoppingCartAdmin/Products/ProductsList.aspx?idWebSite=27265&idCustomerAppsLink=1327992';
  const BUTTON_ID = 'lc-omni-product-availability-button';
  const REPORT_ID = 'lc-omni-quote-stock';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const header = value => clean(value).toLowerCase().replace(/[^a-z]/g, '');
  function value(cell) {
    const field = cell?.querySelector('input:not([type="hidden"]),textarea,select');
    // Omni commonly reopens a saved line with an empty editor over the persisted
    // cell text. Prefer a real editor value, but fall back to that saved text.
    return clean(field?.value) || clean(cell?.textContent);
  }
  const number = text => /^-?\d+(?:\.\d+)?$/.test(clean(text).replace(/,/g, '')) ? Number(clean(text).replace(/,/g, '')) : null;

  function omniStockServiceLine(sku, name) {
    const collection = text => /^(?:click\s*(?:&|and)?\s*collect|customer\s+collection|pick[ -]?up(?:\s+(?:fee|charge|service))?)(?:\s*[-:]\s*.+|\s*\([^)]*\))?$/i.test(clean(text));
    const service = text => /^(?:(?:standard|express|economy|local|rural|urban|nationwide|international|free|flat rate|frontdoor|front door|white glove) )?(?:shipping|delivery|freight)(?: (?:charges?|fees?|costs?|services?|surcharges?))?(?: \d+)?$/i
      .test(clean(text).replace(/\([^)]*\)/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim());
    return /^AS/i.test(sku) || service(sku) || service(name) || collection(sku) || collection(name);
  }

  function omniStockRequirementRows(table, headings, read, visible) {
    const rows = Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table && visible(row));
    const bom = headings.indexOf('bomload'), code = headings.indexOf('code'), quantity = headings.indexOf('qtyordered');
    if (bom < 0) return rows;
    return rows.filter((row, index) => {
      if (read(row.children[bom]).toLowerCase() !== 'make') return true;
      const components = [];
      for (let next = index + 1; next < rows.length && read(rows[next].children[bom]).toLowerCase() === 'use'; next++) components.push(rows[next]);
      if (!components.length || components.some(component => {
        const qty = Number(read(component.children[quantity]).replace(/,/g, ''));
        return !read(component.children[code]) || !Number.isFinite(qty) || qty <= 0;
      })) return true;
      const bracket = read(row.children[code]).toUpperCase().match(/\(([^()]*)\)/)?.[1];
      if (bracket) {
        const codes = components.map(component => read(component.children[code]).toUpperCase()).sort((a, b) => b.length - a.length);
        const unmatched = codes.reduce((text, sku) => text.split(sku).join(''), bracket);
        if (unmatched.replace(/[\s,;+|/]/g, '')) return true;
      }
      // Expanded Use quantities already contain the ordered component totals.
      return false;
    });
  }

  function quoteItems() {
    const items = new Map();
    for (const row of document.querySelectorAll('table tr')) {
      const headings = [...row.children].map(cell => header(cell.textContent));
      const code = headings.indexOf('code'), quantity = headings.indexOf('qtyordered');
      if (code < 0 || quantity < 0 || !visible(row)) continue;
      const name = headings.indexOf('product');
      for (const line of omniStockRequirementRows(row.closest('table'), headings, value, visible)) {
        if (line === row || !visible(line)) continue;
        const sku = value(line.children[code]).toUpperCase();
        if (omniStockServiceLine(sku, name >= 0 ? value(line.children[name]) : '')) continue;
        const qty = number(value(line.children[quantity]));
        if (!sku || /^search|^code$/i.test(sku) || qty === null || qty <= 0) continue;
        const existing = items.get(sku);
        if (existing) existing.quantity += qty;
        else items.set(sku, { sku, quantity: qty, name: name >= 0 ? value(line.children[name]) : '' });
      }
      break;
    }
    return [...items.values()];
  }

  function stockRow(doc, sku) {
    for (const row of doc.querySelectorAll('table tr')) {
      const headings = [...row.children].map(cell => header(cell.textContent));
      const code = headings.indexOf('code');
      if (code < 0 || !headings.includes('stockavail') || !headings.includes('soh')) continue;
      const matches = [...row.closest('table').querySelectorAll('tr')].filter(line => value(line.children[code]).toUpperCase() === sku);
      if (matches.length > 1) throw new Error('Multiple exact SKU matches; check the products page.');
      if (!matches.length) return null;
      const line = matches[0];
      const read = key => {
        const index = headings.indexOf(key);
        return index >= 0 ? number(value(line.children[index])) : null;
      };
      return { available: read('stockavail'), soh: read('soh'), virtual: read('virtualstock'), holding: read('holdingstock'), incoming: read('incomingstock'), supplier: read('supplierstock') };
    }
    return null;
  }

  async function lookupStock(frame, sku, active) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { frame.onload = null; reject(new Error('Products page did not load.')); }, 15000);
      frame.onload = () => {
        clearTimeout(timer); frame.onload = null;
        try {
          if (frame.contentWindow.location.origin !== location.origin) throw new Error('Sign in to Cin7 Omni and try again.');
          resolve();
        } catch (error) { reject(new Error('Products page could not be accessed. Open Products to check your login.')); }
      };
      frame.src = PRODUCT_AVAILABILITY_URL;
    });
    if (!active()) return null;
    const doc = frame.contentDocument;
    const initial = stockRow(doc, sku);
    if (initial) return initial;
    let search, button;
    const controlsDeadline = Date.now() + 5000;
    do {
      if (!active()) return null;
      search = [...doc.querySelectorAll('input')].find(input => /^search$/i.test(clean(input.placeholder))) ||
        [...doc.querySelectorAll('input[type="text"],input[type="search"]')].find(input => /search/i.test(`${input.id} ${input.name}`));
      button = [...doc.querySelectorAll('button,input[type="submit"],input[type="button"],a')].find(control => /^search$/i.test(clean(control.value || control.textContent)));
      if (search && button) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (Date.now() < controlsDeadline);
    if (!search || !button) throw new Error('Omni search controls could not be found.');
    const setter = Object.getOwnPropertyDescriptor(frame.contentWindow.HTMLInputElement.prototype, 'value').set;
    setter.call(search, sku);
    search.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
    search.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));
    button.click();
    const deadline = Date.now() + 12000;
    while (active() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 150));
      try {
        const result = stockRow(frame.contentDocument, sku);
        if (result) return result;
      } catch (error) {
        if (/Multiple exact/.test(error.message)) throw error;
      }
    }
    if (!active()) return null;
    throw new Error('Exact SKU not found, or search timed out.');
  }

  const stockCache = new Map();
  let lastQuoteKey = '', stopReport = null, autoTimer = null;

  function retainedStockKey() {
    const orderId = [...new URLSearchParams(location.search)].find(([key]) => key.toLowerCase() === 'orderid')?.[1] || location.search;
    return `lc-omni-stock-report:${location.pathname}:${orderId}`;
  }

  function retainedStockReport(items) {
    try {
      const report = JSON.parse(localStorage.getItem(retainedStockKey()) || 'null');
      const checkedAt = new Date(report?.checkedAt).getTime();
      if (!report || !Number.isFinite(checkedAt) || Date.now() - checkedAt > 7 * 24 * 60 * 60 * 1000 || !Array.isArray(report.lines)) return null;
      const required = new Map(items.map(item => [item.sku, item.quantity]));
      if (report.lines.length !== required.size || report.lines.some(line => required.get(line.sku) !== line.quantity || typeof line.available !== 'number')) return null;
      // performance.now() belongs to the old page and cannot be reused after navigation.
      delete report.checkedAtTick;
      return report;
    } catch { return null; }
  }

  function rememberStockReport(report) {
    try { localStorage.setItem(retainedStockKey(), JSON.stringify(report)); } catch {}
  }

  function quoteTable() {
    return [...document.querySelectorAll('table tr')].find(row => {
      const headings = [...row.children].map(cell => header(cell.textContent));
      return visible(row) && headings.includes('code') && headings.includes('qtyordered');
    })?.closest('table');
  }

  function showQuoteStock(items, table, refresh = false) {
    stopReport?.();
    const retained = retainedStockReport(items);
    const root = document.createElement('div'); root.id = REPORT_ID;
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{font:13px Arial,sans-serif;color:#172b49}*{box-sizing:border-box}.shade{position:fixed;inset:0;z-index:2147483647;background:#0006;display:flex;align-items:center;justify-content:center;padding:16px}
      .panel{width:1180px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;background:#fff;border-radius:6px;overflow:hidden}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#13377e;color:#fff}h2{font-size:18px;margin:0}.actions{display:flex;gap:8px;align-items:center}
      button,a{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border:1px solid #9db3d2;border-radius:4px;background:#fff;color:#13377e;font:700 12px Arial;text-decoration:none;cursor:pointer}.close{width:32px;padding:0;font-size:20px}.info{padding:10px 16px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.wrap{overflow:auto;padding:0 16px 16px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:9px 7px;border-bottom:1px solid #dce3eb;text-align:right;vertical-align:top}th{white-space:nowrap;background:#eef3fa;position:sticky;top:0}th:first-child,th:nth-child(2),td:first-child,td:nth-child(2){text-align:left}td:first-child{white-space:nowrap}td:nth-child(2){min-width:160px}td.error{text-align:left;color:#a32d22}.short{color:#a32d22;font-weight:700}
      iframe{position:fixed;left:-2000px;top:0;width:1400px;height:900px;border:0} @media(max-width:600px){header{align-items:flex-start;flex-direction:column}.actions{flex-wrap:wrap}}
    </style><div class="shade"><section class="panel" role="dialog" aria-modal="true" aria-labelledby="title"><header><h2 id="title">Quote Stock</h2><div class="actions"><button id="refresh">Refresh</button><a id="products" target="_blank" rel="noopener">Open Products</a><button class="close" aria-label="Close">&times;</button></div></header><div class="info"><span>All Branches</span><span id="progress" role="status"></span></div><div class="wrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Quote Qty</th><th>Stock Avail</th><th>SOH</th><th>Virtual</th><th>Holding</th><th>Incoming</th><th>Supplier</th><th>Shortfall</th></tr></thead><tbody></tbody></table></div></section></div>`;
    shadow.getElementById('products').href = PRODUCT_AVAILABILITY_URL;
    shadow.getElementById('title').textContent = 'Available Stock';
    shadow.querySelector('.info span').textContent = 'Omni Products';
    const inlineStyle = document.createElement('style');
    inlineStyle.textContent = ':host{display:block;width:100%;min-width:0;margin:12px 0}.shade{position:static;display:block;padding:0;background:none}.panel{width:100%;max-height:none;border-radius:0;border-top:1px solid #c4d3e5}header{padding:9px 12px;background:#eef3fa;color:#13377e}h2{font-size:15px}.info{padding:8px 12px}.wrap{padding:0 12px 12px}';
    shadow.appendChild(inlineStyle);
    const panel = shadow.querySelector('.panel');
    panel.setAttribute('role', 'region'); panel.removeAttribute('aria-modal');
    shadow.querySelector('.close').remove();
    const syncStatus = document.createElement('span');
    syncStatus.id = 'workflow-sync';
    syncStatus.setAttribute('role', 'status');
    syncStatus.textContent = 'Workflow: waiting for stock sync';
    syncStatus.title = 'Stock panel 0.1.14';
    shadow.querySelector('.info').appendChild(syncStatus);
    table.insertAdjacentElement('afterend', root);
    const checked = new Map((retained?.lines || []).map(line => [line.sku, line]));
    const refreshed = new Set();
    const publish = () => {
      if (!root.isConnected || cancelled) return;
      const lines = items.map(item => {
        const stock = checked.get(item.sku) || {};
        return { sku:item.sku, quantity:item.quantity, available:stock.available ?? null, soh:stock.soh ?? null, virtual:stock.virtual ?? null,
          holding:stock.holding ?? null, incoming:stock.incoming ?? null, supplier:stock.supplier ?? null };
      });
      if (refreshed.size !== items.length || lines.some(line => line.available === null)) return false;
      const shortage = lines.some(line => line.available !== null && line.available < line.quantity);
      const report = { page:location.pathname + location.search, checkedAt:new Date().toISOString(), checkedAtTick:performance.now(), ready:!shortage, complete:true, lines };
      root.dataset.workflowStock = JSON.stringify(report);
      rememberStockReport(report);
      document.dispatchEvent(new Event('lc-omni-stock-updated'));
      return true;
    };
    const frame = document.createElement('iframe'); frame.title = 'Omni stock lookup'; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true');
    if (refresh) shadow.appendChild(frame);
    const tbody = shadow.querySelector('tbody'), progress = shadow.getElementById('progress');
    const renderStock = (row, item, stock) => {
      while (row.children.length > 3) row.lastElementChild.remove();
      const shortfall = stock.available === null ? null : Math.max(0, item.quantity - Math.max(0, stock.available));
      [stock.available, stock.soh, stock.virtual, stock.holding, stock.incoming, stock.supplier, shortfall].forEach((quantity, column) => {
        const cell = document.createElement('td'); cell.textContent = quantity === null || quantity === undefined ? '-' : quantity;
        if (column === 6 && quantity > 0) cell.className = 'short';
        row.appendChild(cell);
      });
    };
    const rows = items.map(item => {
      const row = document.createElement('tr');
      [item.sku, item.name, item.quantity].forEach(text => { const cell = document.createElement('td'); cell.textContent = text; row.appendChild(cell); });
      const previous = checked.get(item.sku);
      if (previous) renderStock(row, item, previous);
      else {
        const status = document.createElement('td'); status.textContent = refresh ? 'Checking...' : 'Not checked'; status.colSpan = 7; row.appendChild(status);
      }
      tbody.appendChild(row); return row;
    });
    let cancelled = false;
    stopReport = () => { cancelled = true; root.remove(); };
    if (retained) {
      root.dataset.workflowStock = JSON.stringify({ ...retained, page:location.pathname + location.search });
      progress.textContent = `${refresh ? 'Rechecking - showing' : 'Showing'} result from ${new Date(retained.checkedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
    }
    shadow.getElementById('refresh').onclick = () => { stockCache.clear(); syncQuoteStock(true); };
    if (!refresh) {
      if (!retained) progress.textContent = 'Click Refresh to check stock';
      return;
    }
    void (async () => {
      let errors = 0;
      for (let index = 0; index < items.length && !cancelled; index += 1) {
        progress.textContent = `Checking ${index + 1} of ${items.length}`;
        try {
          const sku = items[index].sku;
          const cached = stockCache.get(sku);
          const fresh = cached && Date.now() - cached.time < 60000;
          const stock = fresh ? cached.stock : await lookupStock(frame, sku, () => !cancelled && root.isConnected);
          if (cancelled) break;
          if (!stock) break;
          checked.set(sku, stock);
          refreshed.add(sku);
          if (!fresh) stockCache.set(sku, { stock, time: Date.now() });
          renderStock(rows[index], items[index], stock);
        } catch (error) {
          if (cancelled) break;
          errors += 1;
          if (!checked.has(items[index].sku)) {
            rows[index].lastChild.textContent = error.message; rows[index].lastChild.className = 'error';
          }
        }
      }
      if (!cancelled) {
        frame.remove();
        const saved = publish();
        progress.textContent = saved
          ? `Checked ${items.length} products at ${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`
          : errors && retained ? `Check incomplete - showing previous result (${errors} could not be checked)`
          : errors ? `Check incomplete - ${errors} could not be checked` : 'Check incomplete - previous Workflow stock result kept';
      }
    })();
  }

  function syncQuoteStock(forceRefresh = false) {
    autoTimer = null;
    const items = quoteItems(), table = quoteTable();
    if (!table || !items.length) {
      stopReport?.(); stopReport = null; lastQuoteKey = ''; return;
    }
    const key = JSON.stringify(items);
    const report = document.getElementById(REPORT_ID);
    if (!forceRefresh && key === lastQuoteKey && report?.previousElementSibling === table) return;
    lastQuoteKey = key;
    showQuoteStock(items, table, forceRefresh);
  }

  function scheduleStockSync() {
    const active = document.activeElement;
    const focused = active?.shadowRoot?.activeElement || active;
    if (document.hidden || Date.now() < Number(window.__lcOmniEditingUntil || 0) || (focused && focused !== document.body
      && (/^(INPUT|TEXTAREA|SELECT)$/i.test(focused.tagName) || focused.isContentEditable))) return;
    if (autoTimer !== null) return;
    autoTimer = setTimeout(syncQuoteStock, 300);
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  document.getElementById(BUTTON_ID)?.remove();
  scheduleStockSync();
  const scheduleForQuoteChange = event => {
    const report = document.getElementById(REPORT_ID);
    const table = report?.previousElementSibling;
    if (!report || !table || table.contains(event.target)) scheduleStockSync();
  };
  document.addEventListener('change', scheduleForQuoteChange);
  document.addEventListener('focusout', event => window.setTimeout(() => scheduleForQuoteChange(event), 700));
  new MutationObserver(records => {
    const active = document.activeElement;
    const focused = active?.shadowRoot?.activeElement || active;
    if (Date.now() < Number(window.__lcOmniEditingUntil || 0) || (focused && focused !== document.body
      && (/^(INPUT|TEXTAREA|SELECT)$/i.test(focused.tagName) || focused.isContentEditable))) return;
    const report = document.getElementById(REPORT_ID);
    const table = report?.previousElementSibling;
    if (!report?.isConnected || !table || records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target && (target === table || table.contains(target));
    })) scheduleStockSync();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
