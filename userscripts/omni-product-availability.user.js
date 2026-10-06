// ==UserScript==
// @name         Omni Living Culture Product Availability
// @namespace    livingculture-omni
// @version      0.1.3
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
  const CONTAINER_BUTTON_ID = 'lc-omni-containers-open';
  const REPORT_ID = 'lc-omni-quote-stock';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const header = value => clean(value).toLowerCase().replace(/[^a-z]/g, '');
  const value = cell => clean(cell?.querySelector('input:not([type="hidden"]),textarea,select')?.value ?? cell?.textContent);
  const number = text => /^-?\d+(?:\.\d+)?$/.test(clean(text).replace(/,/g, '')) ? Number(clean(text).replace(/,/g, '')) : null;

  function quoteItems() {
    const items = new Map();
    for (const row of document.querySelectorAll('table tr')) {
      const headings = [...row.children].map(cell => header(cell.textContent));
      const code = headings.indexOf('code'), quantity = headings.indexOf('qtyordered');
      if (code < 0 || quantity < 0 || !visible(row)) continue;
      const name = headings.indexOf('product');
      for (const line of row.closest('table').querySelectorAll('tr')) {
        if (line === row || !visible(line)) continue;
        const sku = value(line.children[code]).toUpperCase();
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

  function quoteTable() {
    return [...document.querySelectorAll('table tr')].find(row => {
      const headings = [...row.children].map(cell => header(cell.textContent));
      return visible(row) && headings.includes('code') && headings.includes('qtyordered');
    })?.closest('table');
  }

  function showQuoteStock(items, table) {
    stopReport?.();
    const root = document.createElement('div'); root.id = REPORT_ID;
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{font:13px Arial,sans-serif;color:#172b49}*{box-sizing:border-box}.shade{position:fixed;inset:0;z-index:2147483647;background:#0006;display:flex;align-items:center;justify-content:center;padding:16px}
      .panel{width:1180px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;background:#fff;border-radius:6px;overflow:hidden}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#13377e;color:#fff}h2{font-size:18px;margin:0}.actions{display:flex;gap:8px;align-items:center}
      button,a{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border:1px solid #9db3d2;border-radius:4px;background:#fff;color:#13377e;font:700 12px Arial;text-decoration:none;cursor:pointer}.close{width:32px;padding:0;font-size:20px}.info{padding:10px 16px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.wrap{overflow:auto;padding:0 16px 16px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:9px 7px;border-bottom:1px solid #dce3eb;text-align:right;vertical-align:top}th{white-space:nowrap;background:#eef3fa;position:sticky;top:0}th:first-child,th:nth-child(2),td:first-child,td:nth-child(2){text-align:left}td:first-child{white-space:nowrap}td:nth-child(2){min-width:160px}td.error{text-align:left;color:#a32d22}.short{color:#a32d22;font-weight:700}
      iframe{position:fixed;left:-2000px;top:0;width:1400px;height:900px;border:0} @media(max-width:600px){header{align-items:flex-start;flex-direction:column}.actions{flex-wrap:wrap}}
    </style><div class="shade"><section class="panel" role="dialog" aria-modal="true" aria-labelledby="title"><header><h2 id="title">Quote Stock</h2><div class="actions"><button id="refresh">Refresh</button><a id="products" target="_blank" rel="noopener">Open Products</a><button class="close" aria-label="Close">&times;</button></div></header><div class="info"><span>All Branches</span><span id="progress" role="status"></span></div><div class="wrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Quote Qty</th><th>Stock Avail</th><th>SOH</th><th>Virtual</th><th>Holding</th><th>Incoming</th><th>Supplier</th><th>Shortfall</th></tr></thead><tbody></tbody></table></div></section></div>`;
    shadow.getElementById('products').href = PRODUCT_AVAILABILITY_URL;
    shadow.querySelector('.info span').textContent = 'Omni Products';
    const inlineStyle = document.createElement('style');
    inlineStyle.textContent = ':host{display:block;width:100%;min-width:0;margin:12px 0}.shade{position:static;display:block;padding:0;background:none}.panel{width:100%;max-height:none;border-radius:0;border-top:1px solid #c4d3e5}header{padding:9px 12px;background:#eef3fa;color:#13377e}h2{font-size:15px}.info{padding:8px 12px}.wrap{padding:0 12px 12px}';
    shadow.appendChild(inlineStyle);
    const panel = shadow.querySelector('.panel');
    panel.setAttribute('role', 'region'); panel.removeAttribute('aria-modal');
    shadow.querySelector('.close').remove();
    table.insertAdjacentElement('afterend', root);
    const frame = document.createElement('iframe'); frame.title = 'Omni stock lookup'; frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true'); shadow.appendChild(frame);
    const tbody = shadow.querySelector('tbody'), progress = shadow.getElementById('progress');
    const rows = items.map(item => {
      const row = document.createElement('tr');
      [item.sku, item.name, item.quantity, 'Checking...'].forEach(text => { const cell = document.createElement('td'); cell.textContent = text; row.appendChild(cell); });
      row.lastChild.colSpan = 7; tbody.appendChild(row); return row;
    });
    let cancelled = false;
    stopReport = () => { cancelled = true; root.remove(); };
    shadow.getElementById('refresh').onclick = () => { stockCache.clear(); lastQuoteKey = ''; syncQuoteStock(); };
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
          if (!fresh) stockCache.set(sku, { stock, time: Date.now() });
          rows[index].lastChild.remove();
          const shortfall = stock.available === null ? null : Math.max(0, items[index].quantity - Math.max(0, stock.available));
          [stock.available, stock.soh, stock.virtual, stock.holding, stock.incoming, stock.supplier, shortfall].forEach((quantity, column) => {
            const cell = document.createElement('td'); cell.textContent = quantity === null ? '-' : quantity;
            if (column === 6 && quantity > 0) cell.className = 'short';
            rows[index].appendChild(cell);
          });
        } catch (error) {
          if (cancelled) break;
          errors += 1; rows[index].lastChild.textContent = error.message; rows[index].lastChild.className = 'error';
        }
      }
      if (!cancelled) { frame.remove(); progress.textContent = errors ? `Complete - ${errors} could not be checked` : `Checked ${items.length} products at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; }
    })();
  }

  function syncQuoteStock() {
    autoTimer = null;
    const items = quoteItems(), table = quoteTable();
    if (!table || !items.length) {
      stopReport?.(); stopReport = null; lastQuoteKey = ''; return;
    }
    const key = JSON.stringify(items);
    const report = document.getElementById(REPORT_ID);
    if (key === lastQuoteKey && report?.previousElementSibling === table) return;
    lastQuoteKey = key;
    showQuoteStock(items, table);
  }

  function scheduleStockSync() {
    if (autoTimer !== null) return;
    autoTimer = setTimeout(syncQuoteStock, 300);
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function openPopup() {
    const width = Math.min(1500, Math.max(1000, Math.round(screen.availWidth * 0.82)));
    const height = Math.min(900, Math.max(700, Math.round(screen.availHeight * 0.84)));
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    const popup = window.open(
      PRODUCT_AVAILABILITY_URL,
      'LivingCultureOmniProductAvailabilityPopup',
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=yes,status=no`
    );
    if (!popup) window.alert('Chrome blocked the Product Availability popup. Please allow popups for Cin7 Omni, then try again.');
    else popup.focus();
  }

  function ensureButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'NZ Availability';
    button.title = 'Open the Omni products stock page';
    button.addEventListener('click', openPopup);
    document.body.appendChild(button);
    return button;
  }

  function place() {
    const button = ensureButton();
    const anchor = document.getElementById(CONTAINER_BUTTON_ID);
    if (!anchor || !visible(anchor)) {
      button.style.display = 'none';
      return;
    }
    const rect = anchor.getBoundingClientRect();
    button.style.cssText = `position:absolute;display:inline-flex;align-items:center;justify-content:center;left:${window.scrollX + rect.right + 8}px;top:${window.scrollY + rect.top}px;z-index:52;box-sizing:border-box;width:auto;min-width:0;height:${Math.max(34, rect.height)}px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;box-shadow:none;font:700 13px Arial,sans-serif;line-height:1;cursor:pointer;white-space:nowrap;`;
  }

  function schedulePlace() {
    if (window.__lcOmniAvailabilityFrame) return;
    window.__lcOmniAvailabilityFrame = requestAnimationFrame(() => {
      window.__lcOmniAvailabilityFrame = 0;
      place();
    });
  }

  place();
  scheduleStockSync();
  document.addEventListener('input', scheduleStockSync);
  document.addEventListener('change', scheduleStockSync);
  setInterval(scheduleStockSync, 1500);
  new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target && !target.closest?.(`#${BUTTON_ID}, #${REPORT_ID}`);
    })) { schedulePlace(); scheduleStockSync(); }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, { passive: true });
  setInterval(place, 5000);
})();
