// ==UserScript==
// @name         Cin7 Living Culture Freight
// @namespace    livingculture
// @version      4.6
// @description  Opens a Living Culture freight panel inside Cin7 with auto and manual lookup modes.
// @match        *://cin7.com/*
// @match        *://*.cin7.com/*
// @match        *://*.cin7.co/*
// @match        *://*.cin7core.com/*
// @match        *://*.dearsystems.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-lc-freight.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-lc-freight.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'http://localhost:3001';
  const state = {
    price: '',
    priceNumber: '',
    method: '',
    selectedAddress: '',
    addressTimer: null,
    autoTimer: null,
    autoRunning: false,
    lastAutoKey: '',
    queuedAutoKey: ''
  };

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function moneyToNumber(value) {
    const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
    return match ? Number(match[1]).toFixed(4) : '';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function normaliseQuantity(value) {
    const quantity = Number.parseInt(value, 10);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function normaliseFreightItems({ sku, items, quantity = 1 }) {
    const sourceItems = Array.isArray(items) && items.length ? items : [{ sku, quantity }];
    return sourceItems
      .map(item => ({
        sku: clean(item?.sku),
        productUrl: clean(item?.productUrl),
        quantity: normaliseQuantity(item?.quantity)
      }))
      .filter(item => item.sku || item.productUrl);
  }

  function findTextNodeElement(pattern) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const text = clean(node.childNodes.length === 1 ? node.textContent : '');
      if (text && pattern.test(text)) return node;
      node = walker.nextNode();
    }
    return null;
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function isInjectedPanelElement(element) {
    return Boolean(element?.closest?.('#lc-freight-panel, #lc-quote-memo-panel'));
  }

  function getFieldValueByLabel(labelText) {
    const labelPattern = new RegExp(labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const labelled = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(element => !isInjectedPanelElement(element))
      .find(element => labelPattern.test(clean(element.textContent)));

    if (labelled) {
      const container = labelled.closest('fieldset, .form-group, .field, div') || labelled.parentElement;
      const field = container?.querySelector('input, textarea, select, [contenteditable="true"]');
      if (field) return clean(field.value || field.textContent);

      let sibling = labelled.nextElementSibling;
      while (sibling) {
        const nextField = sibling.matches?.('input, textarea, select, [contenteditable="true"]')
          ? sibling
          : sibling.querySelector?.('input, textarea, select, [contenteditable="true"]');
        if (nextField) return clean(nextField.value || nextField.textContent);
        sibling = sibling.nextElementSibling;
      }
    }

    const pageText = document.body.innerText || '';
    const lines = pageText.split('\n').map(clean).filter(Boolean);
    const index = lines.findIndex(line => labelPattern.test(line));
    return index >= 0 ? clean(lines[index + 1]) : '';
  }

  function isAddressLike(value) {
    const text = clean(value);
    return text.length >= 5 &&
      !/^(?:on|off|yes|no|\+|-)$/i.test(text) &&
      !/^Shipping address line/i.test(text) &&
      /[a-z0-9]/i.test(text);
  }

  function getAddressLineByLabel(labelText) {
    const labelPattern = new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const labels = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(isVisible)
      .filter(element => !isInjectedPanelElement(element))
      .filter(element => labelPattern.test(clean(element.textContent)));

    for (const label of labels) {
      const labelRect = label.getBoundingClientRect();
      const scope = label.closest('fieldset, section, form, main, body') || document.body;
      const fields = Array.from(scope.querySelectorAll('input, textarea, [contenteditable="true"], div, span'))
        .filter(isVisible)
        .filter(element => !isInjectedPanelElement(element))
        .map(element => {
          const rect = element.getBoundingClientRect();
          const value = clean(element.value || element.textContent);
          return { element, rect, value };
        })
        .filter(item =>
          item.rect.top >= labelRect.top - 4 &&
          item.rect.left >= labelRect.left - 20 &&
          item.rect.top <= labelRect.bottom + 90 &&
          item.element !== label &&
          isAddressLike(item.value)
        )
        .sort((a, b) => {
          const aInput = /^(?:INPUT|TEXTAREA)$/i.test(a.element.tagName) ? 0 : 1;
          const bInput = /^(?:INPUT|TEXTAREA)$/i.test(b.element.tagName) ? 0 : 1;
          return aInput - bInput || a.rect.top - b.rect.top || a.rect.left - b.rect.left;
        });

      if (fields.length) return fields[0].value;
    }

    const lines = (document.body.innerText || '').split('\n').map(clean).filter(Boolean);
    const index = lines.findIndex(line => labelPattern.test(line));
    if (index >= 0) {
      const nextLine = lines.slice(index + 1, index + 5).find(isAddressLike);
      if (nextLine) return nextLine;
    }

    return '';
  }

  function getSkuFromCin7() {
    return getItemsFromCin7()[0]?.sku || '';
  }

  function getQuantityFromRow(row) {
    const inputs = Array.from(row.querySelectorAll('input'))
      .map(input => clean(input.value))
      .filter(Boolean);
    const inputQuantity = inputs.find(value => /^\d+$/.test(value));
    if (inputQuantity) return Number(inputQuantity);

    const cells = Array.from(row.querySelectorAll('td, [role="cell"], div, span'))
      .map(cell => clean(cell.textContent))
      .filter(Boolean);
    const numericCells = cells
      .map(value => value.match(/^(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number);
    return numericCells.find(value => value > 0 && value < 1000) || 1;
  }

  function getItemsFromCin7() {
    const rows = Array.from(document.querySelectorAll('tr, [role="row"], tbody > *, [class*="row" i]'));
    const items = [];
    const seen = new Set();

    for (const row of rows) {
      const link = Array.from(row.querySelectorAll('a'))
        .find(anchor => /^[A-Z]{1,6}\d{3,}(?:-\d+)?\s*:/i.test(clean(anchor.textContent)));
      const sku = clean(link?.textContent).match(/^([A-Z]{1,6}\d{3,}(?:-\d+)?)\s*:/i)?.[1]?.toUpperCase();
      if (!sku || seen.has(sku)) continue;
      seen.add(sku);
      items.push({ sku, quantity: getQuantityFromRow(row) });
    }

    if (items.length) return items;

    const matches = Array.from((document.body.innerText || '').matchAll(/\b([A-Z]{1,6}\d{3,}(?:-\d+)?)\s*:/gi));
    for (const match of matches) {
      const sku = match[1].toUpperCase();
      if (seen.has(sku)) continue;
      seen.add(sku);
      items.push({ sku, quantity: 1 });
    }

    return items;
  }

  function getAddressFromCin7() {
    const line1 = getAddressLineByLabel('Shipping address line 1') || getFieldValueByLabel('Shipping address line 1');
    const line2 = getAddressLineByLabel('Shipping address line 2') || getFieldValueByLabel('Shipping address line 2');
    return clean([line1, line2].filter(Boolean).join(', '));
  }

  function getAddressSearchFromCin7() {
    return clean(getAddressLineByLabel('Shipping address line 1') || getFieldValueByLabel('Shipping address line 1') || getAddressFromCin7());
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById('lc-freight-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = isError ? '#9a2d20' : '#405f54';
  }

  function setResult(price, method = '') {
    state.price = price || '';
    state.priceNumber = moneyToNumber(price);
    state.method = method || '';
    document.getElementById('lc-freight-result').textContent = price ? `Freight: ${price}` : 'Freight: -';
    document.getElementById('lc-freight-method').textContent = method || '';
  }

  function getLineCartonCount(product, quantity = normaliseQuantity(product?.quantity)) {
    const baseCartons = Array.isArray(product.cartons)
      ? product.cartons.reduce((total, carton) => total + (Number(carton.quantity) || 1), 0)
      : 0;
    const unitsPerCarton = normaliseQuantity(product?.unitsPerCarton);
    return unitsPerCarton > 1 ? baseCartons * Math.ceil(quantity / unitsPerCarton) : baseCartons * quantity;
  }

  function getLineCbm(product, quantity = normaliseQuantity(product?.quantity)) {
    const cbm = Number(product.cbm) || 0;
    const unitsPerCarton = normaliseQuantity(product?.unitsPerCarton);
    return unitsPerCarton > 1 ? cbm * Math.ceil(quantity / unitsPerCarton) : cbm * quantity;
  }

  function getShippingLocation(method) {
    const match = String(method || '').match(/Ship from\s+([^\n$]+)/i);
    if (!match) return '';

    return Array.from(new Set(match[1]
      .replace(/\s+when quoted alone.*$/i, '')
      .split(/\s*(?:\+|&|\/|,|\band\b)\s*/i)
      .map(location => location.trim())
      .filter(Boolean))).join(' + ');
  }

  function renderProductDetails(products = [], method = state.method) {
    const block = document.getElementById('lc-product-details');
    if (!block) return;

    if (!products.length) {
      block.classList.remove('is-visible');
      block.innerHTML = '';
      return;
    }

    const totalWeightKg = products.reduce((total, product) => total + ((Number(product.weightKg) || 0) * normaliseQuantity(product.quantity)), 0);
    const totalCbm = products.reduce((total, product) => total + getLineCbm(product), 0);
    const totalCartons = products.reduce((total, product) => total + getLineCartonCount(product), 0);
    const shippingLocation = getShippingLocation(method);

    block.classList.add('is-visible');
    block.innerHTML = `
      ${products.map(product => {
        const quantity = normaliseQuantity(product.quantity);
        const lineWeight = (Number(product.weightKg) || 0) * quantity;
        const lineCbm = getLineCbm(product, quantity);
        const cartonCount = getLineCartonCount(product, quantity);
        const saleState = product.saleState || (product.available ? 'Add to cart' : 'Unavailable');
        const stock = product.available ? `Stock: ${shippingLocation || 'Available'}` : 'Stock: Unavailable';
        const detailsLine = product.metricsLoaded
          ? lineWeight && lineCbm && cartonCount ? '' : 'Some product metrics were not found'
          : 'Weight, CBM and carton details loading...';
        const detailsHtml = detailsLine ? `<div>${escapeHtml(detailsLine)}</div>` : '';
        const quantityLine = quantity > 1 ? `<div>Qty ${quantity}</div>` : '';
        const image = product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div class="lc-product-image-placeholder"></div>';
        const websiteUrl = clean(product.url || product.productUrl);
        const websiteLine = websiteUrl
          ? `<div class="lc-product-website"><a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">To website</a></div>`
          : '';

        return `
          <div class="lc-product-row">
            ${image}
            <div>
              <strong>${escapeHtml(product.title || 'Living Culture product')}</strong>
              ${quantityLine}
              ${detailsHtml}
              <div>${escapeHtml(`Status: ${saleState}`)}</div>
              <div>${escapeHtml(stock)}</div>
              ${websiteLine}
            </div>
          </div>
        `;
      }).join('')}
      <div class="lc-product-totals">
        Total weight: ${totalWeightKg ? totalWeightKg.toFixed(2) : '0.00'} kg · Est CBM: ${totalCbm ? totalCbm.toFixed(3) : '0.000'} · Ctns: ${totalCartons || 0}
      </div>
    `;
  }

  function mergeProductDetails(requestedItems = [], loadedProducts = []) {
    const loadedByKey = new Map((loadedProducts || []).map(product => [
      clean(product.sku || product.productUrl || product.url).toLowerCase(),
      product
    ]));

    return requestedItems.map(item => {
      const key = clean(item.sku || item.productUrl).toLowerCase();
      const loaded = loadedByKey.get(key) || {};
      return {
        ...item,
        ...loaded,
        sku: loaded.sku || item.sku,
        productUrl: loaded.productUrl || item.productUrl,
        quantity: normaliseQuantity(item.quantity)
      };
    });
  }

  async function loadProductDetails(items, price, method, fallbackProducts = []) {
    const requestedItems = normaliseFreightItems({ items });
    const itemsWithUrls = mergeProductDetails(requestedItems, fallbackProducts)
      .map(item => ({
        ...item,
        productUrl: item.productUrl || item.url || ''
      }));
    renderProductDetails(itemsWithUrls, method);

    try {
      const response = await fetch(`${API_BASE}/api/product-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsWithUrls, price })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Product details unavailable');
      renderProductDetails(mergeProductDetails(itemsWithUrls, data.products || fallbackProducts), method);
    } catch (error) {
      console.error(error);
      if (!fallbackProducts.length) {
        const block = document.getElementById('lc-product-details');
        if (block) {
          block.classList.add('is-visible');
          block.innerHTML = '<div class="lc-product-loading">Product details unavailable.</div>';
        }
      }
    }
  }

  async function requestFreight({ sku, items, address, quantity = 1 }) {
    const freightItems = normaliseFreightItems({ sku, items, quantity });
    const firstItem = freightItems[0] || {};
    const firstIsUrl = /^https?:\/\/.+\/products\//i.test(firstItem.sku || firstItem.productUrl || '');
    const response = await fetch(`${API_BASE}/get-freight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: firstIsUrl ? '' : firstItem.sku,
        productUrl: firstItem.productUrl || (firstIsUrl ? firstItem.sku : ''),
        quantity: firstItem.quantity || 1,
        items: freightItems.map(item => {
          const isUrl = /^https?:\/\/.+\/products\//i.test(item.sku || item.productUrl || '');
          return {
            sku: isUrl ? '' : item.sku,
            productUrl: item.productUrl || (isUrl ? item.sku : ''),
            quantity: item.quantity || 1
          };
        }),
        address,
        selectedAddress: state.selectedAddress || address
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.price) {
      throw new Error(data.error || 'No freight returned');
    }
    return data;
  }

  function scoreAddressSuggestion(suggestion, address) {
    const normalise = value => clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const wanted = normalise(address);
    const candidate = normalise(suggestion);
    if (!wanted || !candidate) return 0;
    if (candidate.includes(wanted)) return 1000 + wanted.length;

    const wantedTokens = wanted.split(' ').filter(token => token.length > 1);
    return wantedTokens.reduce((score, token) => score + (candidate.includes(token) ? 1 : 0), 0);
  }

  async function resolveAddressSuggestion(items, address) {
    const firstItem = items[0] || {};
    const isUrl = /^https?:\/\/.+\/products\//i.test(firstItem.sku || firstItem.productUrl || '');
    const query = clean(address);
    if (!firstItem.sku && !firstItem.productUrl) return query;

    setStatus('Selecting address suggestion...');
    const response = await fetch(`${API_BASE}/address-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: isUrl ? '' : firstItem.sku,
        productUrl: firstItem.productUrl || (isUrl ? firstItem.sku : ''),
        quantity: firstItem.quantity || 1,
        address: query
      })
    });
    const data = await response.json().catch(() => ({}));
    const suggestions = data.suggestions || [];
    if (!response.ok || !suggestions.length) return query;

    const selected = suggestions
      .map(suggestion => ({ suggestion, score: scoreAddressSuggestion(suggestion, query) }))
      .sort((a, b) => b.score - a.score)[0]?.suggestion || suggestions[0];
    state.selectedAddress = selected;
    return selected;
  }

  function getCin7AutoPayload() {
    const items = getItemsFromCin7();
    const address = getAddressFromCin7();
    const searchAddress = getAddressSearchFromCin7();
    const key = JSON.stringify({
      items: items.map(item => ({ sku: item.sku, quantity: item.quantity })),
      address: searchAddress
    });
    return { items, address, searchAddress, key };
  }

  function scheduleAutoCin7Lookup(delay = 600) {
    clearTimeout(state.autoTimer);
    state.autoTimer = setTimeout(() => {
      const panel = document.getElementById('lc-freight-panel');
      if (!panel?.classList.contains('is-open')) return;
      useCin7Details({ force: false });
    }, delay);
  }

  async function useCin7Details({ force = true } = {}) {
    const { items, address, searchAddress, key } = getCin7AutoPayload();
    if (state.autoRunning) {
      state.queuedAutoKey = key;
      setStatus('Cin7 products changed. Updating after this lookup finishes...');
      return;
    }

    setStatus('Reading Cin7 details...');
    state.selectedAddress = '';
    document.getElementById('lc-auto-sku').textContent = items.length ? items.map(item => `${item.sku} x ${item.quantity}`).join(', ') : '-';
    document.getElementById('lc-auto-address').textContent = address || '-';

    if (!items.length || !searchAddress) {
      setStatus('Could not detect product lines or shipping address from Cin7.', true);
      return;
    }

    if (!force && key === state.lastAutoKey) {
      return;
    }

    state.lastAutoKey = key;
    state.autoRunning = true;

    try {
      const selectedAddress = await resolveAddressSuggestion(items, searchAddress);
      const loaded = await getAndApplyFreight({ items, address: selectedAddress, fill: true });
      if (loaded) {
        state.lastAutoKey = key;
      }
    } finally {
      state.autoRunning = false;
      if (state.queuedAutoKey && state.queuedAutoKey !== state.lastAutoKey) {
        state.queuedAutoKey = '';
        scheduleAutoCin7Lookup(150);
      } else {
        state.queuedAutoKey = '';
      }
    }
  }

  async function getManualFreight() {
    const items = getManualItems();
    const address = clean(document.getElementById('lc-manual-address').value);
    if (!items.length || !address) {
      setStatus('Enter at least one SKU/product URL and address first.', true);
      return;
    }
    await getAndApplyFreight({ items, address, fill: false });
  }

  function getManualItems() {
    return Array.from(document.querySelectorAll('.lc-manual-product-row'))
      .map(row => ({
        sku: clean(row.querySelector('.lc-manual-sku')?.value),
        quantity: Number(clean(row.querySelector('.lc-manual-qty')?.value)) || 1
      }))
      .filter(item => item.sku);
  }

  async function getAndApplyFreight({ sku, items, address, fill }) {
    try {
      setStatus('Getting freight...');
      const requestedItems = normaliseFreightItems({ sku, items });
      const data = await requestFreight({ sku, items, address });
      setResult(data.price, data.method);
      setStatus('Freight loaded.');
      loadProductDetails(requestedItems, data.price, data.method, data.products || []);
      return true;
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Error getting freight.', true);
      return false;
    }
  }

  async function loadAddressSuggestions() {
    const items = getManualItems();
    const firstItem = items[0];
    const address = clean(document.getElementById('lc-manual-address').value);
    const isUrl = /^https?:\/\/.+\/products\//i.test(firstItem?.sku || '');
    const list = document.getElementById('lc-address-suggestions');
    state.selectedAddress = '';
    list.innerHTML = '';

    if (!firstItem || firstItem.sku.length < 2 || address.length < 4) return;

    try {
      setStatus('Getting address suggestions...');
      const response = await fetch(`${API_BASE}/address-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: isUrl ? '' : firstItem.sku, productUrl: isUrl ? firstItem.sku : '', address })
      });
      const data = await response.json().catch(() => ({}));
      const suggestions = data.suggestions || [];
      list.innerHTML = suggestions.map(suggestion =>
        `<button type="button" class="lc-suggestion">${suggestion.replace(/[&<>"']/g, char => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]))}</button>`
      ).join('');
      setStatus(suggestions.length ? 'Select an address suggestion, or get freight manually.' : 'No address suggestions found.');
    } catch (error) {
      console.error(error);
      setStatus('Address suggestions unavailable. You can still get freight manually.');
    }
  }

  function renderDetectedDetails() {
    const items = getItemsFromCin7();
    document.getElementById('lc-auto-sku').textContent = items.length ? items.map(item => `${item.sku} x ${item.quantity}`).join(', ') : '-';
    document.getElementById('lc-auto-address').textContent = getAddressFromCin7() || '-';
  }

  function addManualProductRow(value = '', quantity = 1) {
    const rows = document.getElementById('lc-manual-products');
    const row = document.createElement('div');
    row.className = 'lc-manual-product-row';
    row.innerHTML = `
      <input class="lc-manual-sku" placeholder="SKU or product URL" value="${value}" />
      <input class="lc-manual-qty" type="number" min="1" step="1" value="${quantity}" />
      <button type="button" class="lc-remove-product">Remove</button>
    `;
    rows.appendChild(row);
  }

  function createPanel() {
    if (document.getElementById('lc-freight-panel')) return;

    const button = document.createElement('button');
    button.id = 'lc-freight-toggle';
    button.textContent = 'LC Freight';

    const panel = document.createElement('div');
    panel.id = 'lc-freight-panel';
    panel.innerHTML = `
      <div class="lc-hero">
        <div class="lc-hero-top">
          <img src="https://livingculture.co.nz/cdn/shop/files/logo_ec2b0c5e-42ca-4695-8c7e-43b344144c58.png?v=1675047511&width=220" alt="Living Culture" />
          <strong>Freight Costing</strong>
        </div>
        <p>Use Cin7 products and delivery details.</p>
        <button type="button" id="lc-panel-close">×</button>
      </div>

      <div class="lc-block">
        <div class="lc-label">Detected from Cin7</div>
        <div><b>SKU:</b> <span id="lc-auto-sku">-</span></div>
        <div><b>Address:</b> <span id="lc-auto-address">-</span></div>
        <button type="button" id="lc-use-cin7">Refresh Cin7 details</button>
      </div>

      <div class="lc-block" id="lc-manual-lookup-block">
        <div class="lc-label">Manual lookup</div>
        <div id="lc-manual-products"></div>
        <button type="button" id="lc-add-product">Add another product</button>
        <input id="lc-manual-address" placeholder="Address" />
        <div id="lc-address-suggestions"></div>
        <button type="button" id="lc-manual-get">Get freight manually</button>
      </div>

      <div class="lc-block lc-result-block">
        <div id="lc-freight-result">Freight: -</div>
        <div id="lc-freight-method"></div>
      </div>

      <div id="lc-product-details" class="lc-block"></div>

      <div id="lc-freight-status"></div>
    `;

    const styles = document.createElement('style');
    styles.textContent = `
      #lc-freight-toggle {
        position: fixed;
        right: 25mm;
        bottom: calc(18px + 6mm);
        z-index: 2147483647;
        box-sizing: border-box;
        width: 140px;
        min-height: 36px;
        padding: 9px 14px;
        background: #05cabe;
        color: #fff;
        border: 0;
        border-radius: 10px;
        box-shadow: 0 8px 22px rgba(0,0,0,.18);
        font: 800 13px Arial, sans-serif;
        cursor: pointer;
      }
      #lc-freight-panel {
        position: fixed;
        top: 72px;
        right: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        width: 340px;
        max-height: calc(100vh - 96px);
        overflow: auto;
        display: none;
        padding: 0;
        color: #1f2b24;
        background: #c5d9d3;
        border: 1px solid #d9d6cc;
        border-radius: 14px;
        box-shadow: 0 20px 44px rgba(34, 48, 40, 0.18);
        font: 13px/1.35 Arial, sans-serif;
      }
      #lc-freight-panel.is-open { display: block; }
      .lc-hero {
        position: relative;
        margin: 10px;
        padding: 14px 14px 12px;
        color: #fff;
        background: #2d5c4e;
        border-radius: 12px;
        box-shadow: 0 12px 28px rgba(34, 48, 40, 0.14);
      }
      .lc-hero-top {
        display: block;
        padding-right: 38px;
      }
      .lc-hero img {
        width: 96px;
        height: auto;
        display: block;
        margin-bottom: 10px;
      }
      .lc-hero strong {
        display: block;
        font-size: 22px;
        line-height: 1.05;
        font-weight: 700;
        text-align: left;
      }
      .lc-hero p {
        margin: 6px 38px 0 0;
        color: rgba(255, 255, 255, 0.92);
        font-size: 12px;
        line-height: 1.5;
      }
      #lc-panel-close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 32px;
        height: 32px;
        color: #1f2b24;
        background: #f3f1e8;
        border: 1px solid #d9d6cc;
        border-radius: 9px;
        font-size: 18px;
        font-weight: 800;
        cursor: pointer;
      }
      .lc-block {
        display: grid;
        gap: 7px;
        margin: 10px;
        padding: 12px;
        background: #fffefb;
        border: 1px solid #d9d6cc;
        border-radius: 12px;
        box-shadow: 0 10px 24px rgba(34, 48, 40, 0.08);
      }
      #lc-manual-lookup-block {
        display: none;
      }
      .lc-label {
        color: #637061;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0;
      }
      #lc-freight-panel input {
        width: 100%;
        min-height: 36px;
        padding: 8px 10px;
        color: #1f2b24;
        background: #fff;
        border: 1px solid #d9d6cc;
        border-radius: 9px;
        font: inherit;
      }
      #lc-freight-panel button:not(#lc-panel-close) {
        min-height: 36px;
        padding: 8px 10px;
        color: #fff;
        background: #2d5c4e;
        border: 0;
        border-radius: 9px;
        font-weight: 700;
        cursor: pointer;
      }
      .lc-manual-product-row {
        display: grid;
        grid-template-columns: 1fr 50px 64px;
        gap: 6px;
      }
      .lc-manual-product-row .lc-remove-product {
        min-height: 36px !important;
        padding: 7px 6px !important;
        color: #1f2b24 !important;
        background: #f9f8f2 !important;
        border: 1px solid #d9d6cc !important;
        font-size: 12px;
      }
      #lc-address-suggestions {
        display: grid;
        gap: 5px;
      }
      #lc-address-suggestions .lc-suggestion {
        color: #1f2b24 !important;
        background: #f8f8f5 !important;
        border: 1px solid #ebe7dc !important;
        text-align: left;
        font-weight: 400 !important;
      }
      #lc-freight-result,
      #lc-freight-method {
        grid-column: 1 / -1;
      }
      #lc-freight-result {
        font-weight: 800;
        font-size: 16px;
      }
      #lc-freight-status {
        min-height: 20px;
        margin: 8px 10px 12px;
        color: #405f54;
      }
      #lc-product-details {
        display: none;
        gap: 0;
      }
      #lc-product-details.is-visible {
        display: grid;
      }
      .lc-product-row {
        display: grid;
        grid-template-columns: 60px 1fr;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px solid #ebe7dc;
      }
      .lc-product-row:first-child {
        padding-top: 0;
      }
      .lc-product-row img,
      .lc-product-image-placeholder {
        width: 60px;
        height: 60px;
        object-fit: contain;
        background: #fff;
        border-radius: 8px;
      }
      .lc-product-row strong {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
        line-height: 1.25;
      }
      .lc-product-row div div {
        color: #637061;
        font-size: 12px;
      }
      .lc-product-website {
        overflow-wrap: anywhere;
      }
      .lc-product-website a {
        color: #2d5c4e;
        font-weight: 700;
        text-decoration: underline;
      }
      .lc-product-totals {
        padding-top: 10px;
        font-weight: 800;
      }
      .lc-product-loading {
        color: #637061;
      }
    `;

    document.head.appendChild(styles);
    document.body.append(button, panel);

    button.addEventListener('click', () => {
      panel.classList.toggle('is-open');
      renderDetectedDetails();
      scheduleAutoCin7Lookup();
    });
    panel.querySelector('#lc-panel-close').addEventListener('click', () => panel.classList.remove('is-open'));
    panel.querySelector('#lc-use-cin7').addEventListener('click', () => useCin7Details({ force: true }));
    panel.querySelector('#lc-manual-get').addEventListener('click', getManualFreight);
    panel.querySelector('#lc-add-product').addEventListener('click', () => addManualProductRow());
    panel.querySelector('#lc-address-suggestions').addEventListener('click', event => {
      const suggestion = event.target.closest('.lc-suggestion');
      if (!suggestion) return;
      state.selectedAddress = clean(suggestion.textContent);
      panel.querySelector('#lc-manual-address').value = state.selectedAddress;
      setStatus('Address selected.');
    });
    panel.querySelector('#lc-manual-address').addEventListener('input', () => {
      clearTimeout(state.addressTimer);
      state.addressTimer = setTimeout(loadAddressSuggestions, 700);
    });
    panel.querySelector('#lc-manual-products').addEventListener('click', event => {
      if (!event.target.classList.contains('lc-remove-product')) return;
      const rows = panel.querySelectorAll('.lc-manual-product-row');
      if (rows.length <= 1) return;
      event.target.closest('.lc-manual-product-row').remove();
    });
    panel.querySelector('#lc-manual-products').addEventListener('input', () => {
      clearTimeout(state.addressTimer);
      state.addressTimer = setTimeout(loadAddressSuggestions, 700);
    });
    addManualProductRow();

    setInterval(() => {
      if (!panel.classList.contains('is-open')) return;
      renderDetectedDetails();
      scheduleAutoCin7Lookup();
    }, 3000);
  }

  function boot() {
    if (!document.body) return;
    createPanel();
  }

  boot();
  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);
  setInterval(boot, 3000);
})();
