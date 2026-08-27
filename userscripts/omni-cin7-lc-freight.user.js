// ==UserScript==
// @name         Omni Cin7 Living Culture Freight
// @namespace    livingculture-omni
// @version      0.1.15
// @description  Living Culture freight panel for Cin7 Omni using the hosted freight service.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-cin7-lc-freight.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-cin7-lc-freight.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      livingculture.co.nz
// ==/UserScript==

(function () {
  'use strict';

  const HOSTED_API_BASE = 'https://living-culture-freight.vercel.app';
  const API_BASE = HOSTED_API_BASE || 'http://localhost:3001';
  const SHOPIFY_BASE = 'https://livingculture.co.nz';
  const CONTAINER_DASHBOARD_URL = `${API_BASE}/containers.html`;

  const state = {
    price: '',
    priceNumber: '',
    method: '',
    selectedAddress: '',
    addressTimer: null,
    autoTimer: null,
    autoRunning: false,
    lastAutoKey: '',
    queuedAutoKey: '',
    excludedSkus: new Set(),
    freightCache: new Map(),
    lookupSeq: 0
  };
  const IGNORED_SKU_PREFIXES = new Set(['AS']);
  const FREIGHT_TIMEOUT_MS = 85000;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function gmRequestJson(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {})
        },
        data: options.body ? JSON.stringify(options.body) : undefined,
        timeout: options.timeoutMs || 25000,
        anonymous: false,
        onload(response) {
          let data = {};
          try { data = JSON.parse(response.responseText || '{}'); } catch {}
          resolve({ ok: response.status >= 200 && response.status < 300, status: response.status, data });
        },
        ontimeout: () => reject(new Error('Shopify freight request timed out.')),
        onerror: () => reject(new Error('Shopify freight request failed.'))
      });
    });
  }

  async function requestShopifyPostcodeFreight(freightItems, postcode) {
    const prepareResponse = await fetch(`${API_BASE}/api/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: freightItems })
    });
    const prepared = await prepareResponse.json().catch(() => ({}));
    const products = Array.isArray(prepared.products) ? prepared.products : [];
    const cartItems = products.map(product => {
      const match = freightItems.find(item => clean(item.sku).toLowerCase() === clean(product.sku).toLowerCase());
      return { id: product.variantId, quantity: normaliseQuantity(match?.quantity || 1) };
    }).filter(item => item.id && item.quantity > 0);

    if (!prepareResponse.ok || !cartItems.length) throw new Error(prepared.error || 'No Shopify variants found.');

    const cleared = await gmRequestJson(`${SHOPIFY_BASE}/cart/clear.js`, { method: 'POST' });
    if (!cleared.ok) throw new Error(`Shopify cart clear failed (${cleared.status}).`);

    for (const item of cartItems) {
      const added = await gmRequestJson(`${SHOPIFY_BASE}/cart/add.js`, { method: 'POST', body: { items: [item] } });
      if (!added.ok) throw new Error(added.data.description || `Shopify cart add failed (${added.status}).`);
    }

    const params = new URLSearchParams();
    params.set('shipping_address[zip]', postcode);
    params.set('shipping_address[country]', 'New Zealand');
    const rates = await gmRequestJson(`${SHOPIFY_BASE}/cart/shipping_rates.json?${params}`, { timeoutMs: 20000 });
    if (!rates.ok) throw new Error(rates.data.description || `Shopify freight lookup failed (${rates.status}).`);
    const choices = Array.isArray(rates.data.shipping_rates) ? rates.data.shipping_rates : [];
    const rate = choices.find(item => /ship|freight|delivery/i.test(clean(item.name || item.title || item.code))) || choices[0];
    if (!rate) throw new Error('No Shopify freight rates returned for this postcode.');

    return {
      price: `$${Number(rate.price).toFixed(2)}`,
      method: clean(rate.name || rate.title || rate.code || 'Shipping'),
      products
    };
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

  function normaliseTitleToken(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function cleanProductTitle(value, fallbackSku = '') {
    const raw = clean(value);
    if (!raw) return fallbackSku || 'Living Culture product';

    const withoutNulls = raw
      .replace(/\bnull\b/gi, ' ')
      .replace(/\bundefined\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const withoutUuidPrefix = withoutNulls
      .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\s+/i, '')
      .trim();

    const parts = withoutUuidPrefix
      .split(/\s+\|\s+/)
      .map(part => clean(part))
      .filter(Boolean);

    const unique = [];
    const seen = new Set();

    for (const part of parts.length ? parts : [withoutUuidPrefix]) {
      const key = normaliseTitleToken(part);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(part);
    }

    return clean(unique.join(' | ')) || fallbackSku || 'Living Culture product';
  }

  function normaliseQuantity(value) {
    const quantity = Number.parseInt(value, 10);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function normaliseQuantityAllowZero(value) {
    const quantity = Number.parseInt(value, 10);
    return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
  }

  function normaliseFreightItems({ sku, items, quantity = 1 }) {
    const sourceItems = Array.isArray(items) && items.length ? items : [{ sku, quantity }];
    return sourceItems
      .map(item => ({
        ...item,
        sku: clean(item?.sku),
        productUrl: clean(item?.productUrl),
        quantity: normaliseQuantity(item?.quantity)
      }))
      .filter(item => item.sku || item.productUrl)
      .filter(item => item.quantity > 0);
  }

  function isFreightSku(sku) {
    const prefix = String(sku || '').match(/^[A-Z]+/)?.[0] || '';
    return Boolean(sku) && !IGNORED_SKU_PREFIXES.has(prefix);
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

  function isInjectedPanelElement(element) {
    return Boolean(element?.closest?.('#lc-omni-freight-panel, #lc-omni-quote-memo-panel'));
  }

  function getFieldValueByLabel(labelText) {
    const labelPattern = new RegExp(labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const labelled = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(element => !isInjectedPanelElement(element))
      .find(element => labelPattern.test(clean(element.textContent)));

    if (labelled) {
      const container = labelled.closest('fieldset, .form-group, .field, div') || labelled.parentElement;
      const field = container?.querySelector('input, textarea, select, [contenteditable="true"]');

      if (field) {
        return clean(field.value || field.textContent);
      }

      let sibling = labelled.nextElementSibling;
      while (sibling) {
        const nextField = sibling.matches?.('input, textarea, select, [contenteditable="true"]')
          ? sibling
          : sibling.querySelector?.('input, textarea, select, [contenteditable="true"]');

        if (nextField) {
          return clean(nextField.value || nextField.textContent);
        }

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
      !/^(?:on|off|yes|no)(?:\s*,\s*(?:on|off|yes|no))*$/i.test(text) &&
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

      if (fields.length) {
        return fields[0].value;
      }
    }

    const lines = (document.body.innerText || '').split('\n').map(clean).filter(Boolean);
    const index = lines.findIndex(line => labelPattern.test(line));

    if (index >= 0) {
      const nextLine = lines.slice(index + 1, index + 5).find(isAddressLike);
      if (nextLine) return nextLine;
    }

    return '';
  }

  function getItemsFromCin7() {
    return getItemsFromOmniProductTable();

    // The original Core fallbacks remain below for reference, but are intentionally
    // unreachable in Omni because page-wide text scanning produces false products.
    const rawItems = [];
    const skuPattern = /\b([A-Z]{2,6}\d{3,}(?:-\d+)?(?:\([A-Z0-9-]+\))?)/i;
    const skuAtStartPattern = /^([A-Z]{2,6}\d{3,}(?:-\d+)?(?:\([A-Z0-9-]+\))?)\s*:/i;
    const hasFreightItems = () => rawItems.some(item => isFreightSku(item.sku));

    const skuLinks = Array.from(document.querySelectorAll('a'))
      .filter(isVisible)
      .filter(anchor => !isInjectedPanelElement(anchor))
      .map(anchor => {
        const text = clean(anchor.textContent || '');
        const match = text.match(skuAtStartPattern) || text.match(skuPattern);

        if (!match) return null;

        return {
          sku: match[1].toUpperCase(),
          quantity: 1,
          top: anchor.getBoundingClientRect().top
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top);

    for (const item of skuLinks) {
      rawItems.push({
        sku: item.sku,
        quantity: normaliseQuantity(item.quantity)
      });
    }

    // Table-row fallback: handles Cin7 layout variants where SKU appears without trailing ":".
    if (!hasFreightItems()) {
      const rows = Array.from(document.querySelectorAll('table tr'))
        .filter(isVisible)
        .filter(row => !isInjectedPanelElement(row));

      for (const row of rows) {
        const rowText = clean(row.textContent || '');
        const skuMatch = rowText.match(skuPattern);
        if (!skuMatch) continue;

        const cells = Array.from(row.querySelectorAll('td,th'));
        const qtyCell = cells.find(cell => /^\d+$/.test(clean(cell.textContent || '')));
        const qty = qtyCell ? normaliseQuantity(clean(qtyCell.textContent || '')) : 1;

        rawItems.push({
          sku: skuMatch[1].toUpperCase(),
          quantity: qty
        });
      }
    }

    if (!hasFreightItems()) {
      const matches = Array.from((document.body.innerText || '').matchAll(/\b([A-Z]{2,6}\d{3,}(?:-\d+)?(?:\([A-Z0-9-]+\))?)/gi));

      for (const match of matches) {
        rawItems.push({
          sku: match[1].toUpperCase(),
          quantity: 1
        });
      }
    }

    const grouped = new Map();

    for (const item of rawItems) {
      if (!isFreightSku(item.sku)) continue;
      const current = grouped.get(item.sku) || 0;
      grouped.set(item.sku, current + normaliseQuantity(item.quantity));
    }

    return Array.from(grouped.entries()).map(([sku, quantity]) => ({
      sku,
      quantity
    }));
  }

  function getItemsFromOmniProductTable() {
    const normaliseHeader = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const allElements = Array.from(document.querySelectorAll('body *'))
      .filter(isVisible)
      .filter(element => !isInjectedPanelElement(element));
    const headerElements = allElements
      .filter(element => ['code', 'qtyordered'].includes(normaliseHeader(element.textContent)))
      .sort((a, b) => a.children.length - b.children.length);
    const codeHeaders = headerElements.filter(element => normaliseHeader(element.textContent) === 'code');
    const quantityHeaders = headerElements.filter(element => normaliseHeader(element.textContent) === 'qtyordered');
    let headerPair = null;

    for (const codeHeader of codeHeaders) {
      const codeRect = codeHeader.getBoundingClientRect();
      const quantityHeader = quantityHeaders
        .map(element => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => Math.abs(rect.top - codeRect.top) < 30 && rect.left > codeRect.right)
        .sort((a, b) => Math.abs(a.rect.top - codeRect.top) - Math.abs(b.rect.top - codeRect.top))[0];

      if (quantityHeader) {
        headerPair = { codeHeader, quantityHeader: quantityHeader.element };
        break;
      }
    }

    if (!headerPair) return [];

    const codeRect = headerPair.codeHeader.getBoundingClientRect();
    const quantityRect = headerPair.quantityHeader.getBoundingClientRect();
    const skuPattern = /^[A-Z]{2,6}\d{3,}(?:-\d+)?(?:\([A-Z0-9-]+\))?$/i;
    const elementValue = element => clean(
      /^(?:INPUT|SELECT|TEXTAREA)$/i.test(element.tagName) ? element.value : element.textContent
    );
    const leafValues = allElements.filter(element => (
      !Array.from(element.children).some(child => elementValue(child) === elementValue(element))
    ));
    const skuElements = leafValues
      .map(element => ({ element, value: elementValue(element), rect: element.getBoundingClientRect() }))
      .filter(({ value, rect }) => (
        skuPattern.test(value) &&
        rect.top > codeRect.bottom &&
        rect.left < codeRect.right + 12 &&
        rect.right > codeRect.left - 12
      ));
    const grouped = new Map();

    for (const skuItem of skuElements) {
      const quantity = leafValues
        .map(element => ({ value: elementValue(element), rect: element.getBoundingClientRect() }))
        .filter(({ value, rect }) => (
          /^\d+(?:\.\d+)?$/.test(value) &&
          rect.left < quantityRect.right + 12 &&
          rect.right > quantityRect.left - 12 &&
          rect.top < skuItem.rect.bottom + 8 &&
          rect.bottom > skuItem.rect.top - 8
        ))
        .sort((a, b) => Math.abs(a.rect.top - skuItem.rect.top) - Math.abs(b.rect.top - skuItem.rect.top))[0];

      if (!quantity) continue;

      const sku = skuItem.value.toUpperCase();
      grouped.set(sku, (grouped.get(sku) || 0) + normaliseQuantity(quantity.value));
    }

    return Array.from(grouped, ([sku, quantity]) => ({ sku, quantity }));
  }

  function getOmniFieldValue(labelText) {
    const normaliseLabel = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const expected = normaliseLabel(labelText);
    const aliases = expected === 'deliverypostalcode'
      ? ['deliverypostalcode', 'deliverypostcode']
      : [expected];
    const namedField = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
      .filter(isVisible)
      .filter(field => !isInjectedPanelElement(field))
      .find(field => {
        const identifier = normaliseLabel(`${field.id || ''} ${field.name || ''}`);
        return aliases.some(alias => identifier.includes(alias));
      });
    const namedValue = clean(namedField?.value || namedField?.textContent);
    if (namedValue) return namedValue;

    const labels = Array.from(document.querySelectorAll('label, legend, span, div, td, th'))
      .filter(isVisible)
      .filter(element => !isInjectedPanelElement(element))
      .filter(element => aliases.includes(normaliseLabel(element.textContent)))
      .sort((a, b) => a.children.length - b.children.length);

    for (const label of labels) {
      if (label.htmlFor) {
        const linked = document.getElementById(label.htmlFor);
        const value = clean(linked?.value || linked?.textContent);
        if (value) return value;
      }

      const labelRect = label.getBoundingClientRect();
      const alignedFields = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
        .filter(isVisible)
        .filter(field => !isInjectedPanelElement(field))
        .map(field => ({ field, rect: field.getBoundingClientRect() }))
        .filter(({ rect }) => (
          rect.left >= labelRect.right - 8 &&
          rect.top <= labelRect.bottom + 6 &&
          rect.bottom >= labelRect.top - 6
        ))
        .sort((a, b) => a.rect.left - b.rect.left);

      const value = clean(alignedFields[0]?.field?.value || alignedFields[0]?.field?.textContent);
      if (value) return value;
    }

    return '';
  }

  function getAddressFromCin7() {
    return clean(getOmniFieldValue('Delivery Postal Code'));
  }

  function getAddressSearchFromCin7() {
    const address = getAddressFromCin7();

    return isAddressLike(address) ? address : '';
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById('lc-omni-freight-status');
    if (!status) return;

    const isQueuedUpdate = !isError && /^Cin7 products changed\./i.test(message || '');

    status.textContent = isQueuedUpdate ? '' : message || '';
    status.setAttribute('aria-label', isQueuedUpdate ? message : '');
    status.style.display = message ? '' : 'none';
    status.style.color = isError ? '#9a2d20' : '#34577f';
    status.classList.toggle('is-queued-update', isQueuedUpdate);
    status.classList.toggle('is-loading', Boolean(message && !isQueuedUpdate && !isError && /getting|loading|reading|updating/i.test(message)));
  }

  function setResult(price, method = '', preSaleFreightEstimate = null) {
    state.price = price || '';
    state.priceNumber = moneyToNumber(price);
    state.method = method || '';

    const result = document.getElementById('lc-omni-freight-result');
    const methodBlock = document.getElementById('lc-omni-freight-method');
    const preSaleBlock = document.getElementById('lc-omni-presale-freight-estimate');

    if (result) {
      result.textContent = price ? `Freight now: ${price}` : 'Freight: -';
    }

    if (methodBlock) {
      methodBlock.textContent = method || '';
    }

    if (preSaleBlock) {
      if (preSaleFreightEstimate?.price) {
        preSaleBlock.innerHTML = `
          <div><strong>Estimated pre-sale freight later: ${escapeHtml(preSaleFreightEstimate.price)}</strong></div>
          ${preSaleFreightEstimate.total ? `<div>Estimated total freight: ${escapeHtml(preSaleFreightEstimate.total)}</div>` : ''}
          ${preSaleFreightEstimate.note ? `<div class="lc-omni-freight-note">${escapeHtml(preSaleFreightEstimate.note)}</div>` : ''}
        `;
      } else {
        preSaleBlock.innerHTML = '';
      }
    }
  }

  function setResultLoading() {
    state.price = '';
    state.priceNumber = '';
    state.method = '';

    const result = document.getElementById('lc-omni-freight-result');
    const methodBlock = document.getElementById('lc-omni-freight-method');
    const preSaleBlock = document.getElementById('lc-omni-presale-freight-estimate');

    if (result) {
      result.textContent = 'Freight: updating...';
    }

    if (methodBlock) {
      methodBlock.textContent = '';
    }

    if (preSaleBlock) {
      preSaleBlock.innerHTML = '';
    }
  }

  function getLineCartonCount(product, quantity = normaliseQuantity(product?.quantity)) {
    const baseCartons = Array.isArray(product.cartons)
      ? product.cartons.reduce((total, carton) => total + (Number(carton.quantity) || 1), 0)
      : 0;

    const unitsPerCarton = normaliseQuantity(product?.unitsPerCarton);

    return unitsPerCarton > 1
      ? baseCartons * Math.ceil(quantity / unitsPerCarton)
      : baseCartons * quantity;
  }

  function getLineCbm(product, quantity = normaliseQuantity(product?.quantity)) {
    const cbm = Number(product.cbm) || 0;
    const unitsPerCarton = normaliseQuantity(product?.unitsPerCarton);

    return unitsPerCarton > 1
      ? cbm * Math.ceil(quantity / unitsPerCarton)
      : cbm * quantity;
  }

  function getLineWeight(product, quantity = normaliseQuantity(product?.quantity)) {
    const weightKg = Number(product.weightKg) || 0;
    const unitsPerCarton = normaliseQuantity(product?.unitsPerCarton);

    return unitsPerCarton > 1
      ? weightKg * Math.ceil(quantity / unitsPerCarton)
      : weightKg * quantity;
  }

  function getProductRequestedQuantity(product) {
    return normaliseQuantity(product.requestedQuantity || product.quantity);
  }

  function getProductAddToCartQuantity(product) {
    const requestedQuantity = getProductRequestedQuantity(product);
    const preSaleQuantity = normaliseQuantityAllowZero(
      product.preSaleQuantity ??
      (product.addToCartQuantity != null ? requestedQuantity - Number(product.addToCartQuantity) : 0)
    );

    return product.addToCartQuantity != null
      ? normaliseQuantityAllowZero(product.addToCartQuantity)
      : Math.max(0, requestedQuantity - preSaleQuantity);
  }

  function getProductPreSaleQuantity(product) {
    const requestedQuantity = getProductRequestedQuantity(product);

    return normaliseQuantityAllowZero(
      product.preSaleQuantity ??
      (product.addToCartQuantity != null ? requestedQuantity - Number(product.addToCartQuantity) : 0)
    );
  }

  function getProductQuoteQuantity(product) {
    const preSaleQuantity = getProductPreSaleQuantity(product);

    return preSaleQuantity
      ? getProductAddToCartQuantity(product)
      : normaliseQuantity(product.quantity);
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
    const block = document.getElementById('lc-omni-product-details');
    if (!block) return;

    if (!products.length) {
      block.classList.remove('is-visible');
      block.innerHTML = '';
      return;
    }

    const activeProducts = products.filter(product =>
      normaliseQuantityAllowZero(product.requestedQuantity || product.quantity) > 0
    );

    if (!activeProducts.length) {
      block.classList.add('is-visible');
      block.innerHTML = '<div class="lc-omni-product-loading">No freight products selected.</div>';
      return;
    }

    const totalWeightKg = activeProducts.reduce((total, product) =>
      total + getLineWeight(product, getProductQuoteQuantity(product)), 0);
    const totalCbm = activeProducts.reduce((total, product) =>
      total + getLineCbm(product, getProductQuoteQuantity(product)), 0);
    const totalCartons = activeProducts.reduce((total, product) =>
      total + getLineCartonCount(product, getProductQuoteQuantity(product)), 0);
    const totalPreSaleWeightKg = activeProducts.reduce((total, product) =>
      total + getLineWeight(product, getProductPreSaleQuantity(product)), 0);
    const totalPreSaleCbm = activeProducts.reduce((total, product) =>
      total + getLineCbm(product, getProductPreSaleQuantity(product)), 0);
    const totalPreSaleCartons = activeProducts.reduce((total, product) =>
      total + getLineCartonCount(product, getProductPreSaleQuantity(product)), 0);
    const shippingLocation = getShippingLocation(method);

    block.classList.add('is-visible');

    block.innerHTML = `
      ${activeProducts.map(product => {
        const requestedQuantity = getProductRequestedQuantity(product);
        const preSaleQuantity = getProductPreSaleQuantity(product);
        const quantity = getProductQuoteQuantity(product);
        const lineWeight = getLineWeight(product, quantity);
        const lineCbm = getLineCbm(product, quantity);
        const cartonCount = getLineCartonCount(product, quantity);
        const preSaleWeight = getLineWeight(product, preSaleQuantity);
        const preSaleCbm = getLineCbm(product, preSaleQuantity);
        const preSaleCartons = getLineCartonCount(product, preSaleQuantity);
        const saleState = product.saleState || (product.available ? 'Add to cart' : 'Unavailable');
        const stock = product.available ? `Stock: ${shippingLocation || 'Available'}` : 'Stock: Unavailable';

        const detailsLine = product.metricsLoaded
          ? lineWeight && lineCbm && cartonCount ? '' : 'Some product metrics were not found'
          : 'Weight, CBM and carton details loading...';

        const detailsHtml = detailsLine
          ? product.metricsLoaded
            ? `<div>${escapeHtml(detailsLine)}</div>`
            : `<div class="lc-omni-loading-line"><span class="lc-omni-spinner" aria-hidden="true"></span>${escapeHtml(detailsLine)}</div>`
          : '';

        const quantityLine = preSaleQuantity
          ? `
            <div>Qty ${requestedQuantity}</div>
            <div>Ship now: ${lineWeight.toFixed(2)} kg · ${lineCbm.toFixed(3)} CBM · ${cartonCount} ctns</div>
            <div>Pre-sale later: ${preSaleWeight.toFixed(2)} kg · ${preSaleCbm.toFixed(3)} CBM · ${preSaleCartons} ctns</div>
          `
          : `<div>Qty ${requestedQuantity} · ${lineWeight.toFixed(2)} kg · ${lineCbm.toFixed(3)} CBM · ${cartonCount} ctns</div>`;
        const statusLine = preSaleQuantity
          ? `<div>Status: ${quantity} add to cart and <strong class="lc-omni-presale-pulse">${preSaleQuantity} PRE-SALE</strong></div>`
          : `<div>${escapeHtml(`Status: ${saleState}`)}</div>`;

        const image = product.image
          ? `<img src="${escapeHtml(product.image)}" alt="">`
          : '<div class="lc-omni-product-image-placeholder"></div>';
        const title = cleanProductTitle(product.title || product.sku || '', product.sku || '');

        const websiteUrl = clean(product.url || product.productUrl);

        const websiteLine = websiteUrl
          ? `<div class="lc-omni-product-website"><a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">To website</a></div>`
          : '';

        return `
          <div class="lc-omni-product-row">
            ${image}
            <div>
              <strong>${escapeHtml(title)}</strong>
              ${statusLine}
              ${quantityLine}
              ${detailsHtml}
              <div>${escapeHtml(stock)}</div>
              ${websiteLine}
            </div>
          </div>
        `;
      }).join('')}

      ${activeProducts.length > 1 ? `
        <div class="lc-omni-product-totals">
          Ship now total: ${totalWeightKg ? totalWeightKg.toFixed(2) : '0.00'} kg ·
          Est CBM: ${totalCbm ? totalCbm.toFixed(3) : '0.000'} ·
          Ctns: ${totalCartons || 0}
          ${totalPreSaleCartons ? `
            <br>
            Pre-sale later total: ${totalPreSaleWeightKg.toFixed(2)} kg ·
            Est CBM: ${totalPreSaleCbm.toFixed(3)} ·
            Ctns: ${totalPreSaleCartons}
          ` : ''}
        </div>
      ` : ''}
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
      const keepExistingMetrics = hasMetrics(item) && !hasMetrics(loaded);

      return {
        ...item,
        ...loaded,
        weightKg: keepExistingMetrics ? item.weightKg : loaded.weightKg ?? item.weightKg,
        cartons: keepExistingMetrics ? item.cartons : loaded.cartons ?? item.cartons,
        unitsPerCarton: keepExistingMetrics ? item.unitsPerCarton : loaded.unitsPerCarton ?? item.unitsPerCarton,
        cbm: keepExistingMetrics ? item.cbm : loaded.cbm ?? item.cbm,
        metricsLoaded: keepExistingMetrics ? item.metricsLoaded : loaded.metricsLoaded ?? item.metricsLoaded,
        sku: loaded.sku || item.sku,
        productUrl: loaded.productUrl || item.productUrl,
        quantity: normaliseQuantityAllowZero(item.quantity)
      };
    });
  }

  function hasMetrics(product) {
    return Boolean(product?.metricsLoaded) ||
      Number(product?.weightKg) > 0 ||
      Number(product?.cbm) > 0 ||
      (Array.isArray(product?.cartons) && product.cartons.length > 0);
  }

  async function requestProductDetails(items, price = '') {
    const response = await fetch(`${API_BASE}/api/product-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, price })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Product details unavailable');
    }

    return data;
  }

  function unresolvedMetricItems(items = []) {
    return items
      .filter(item => !hasMetrics(item))
      .map(item => ({
        sku: item.sku || '',
        productUrl: item.productUrl || item.url || '',
        quantity: normaliseQuantity(item.quantity)
      }))
      .filter(item => item.sku || item.productUrl);
  }

  async function requestProductDetailsWithRetry(items, price = '') {
    const first = await requestProductDetails(items, price);
    const firstProducts = Array.isArray(first?.products) ? first.products : [];

    const mergedFirst = mergeProductDetails(items, firstProducts);
    const unresolved = unresolvedMetricItems(mergedFirst);
    if (!unresolved.length) return { ...first, products: firstProducts };

    await new Promise(resolve => setTimeout(resolve, 350));

    try {
      const second = await requestProductDetails(unresolved, price);
      const secondProducts = Array.isArray(second?.products) ? second.products : [];
      return {
        ...first,
        products: mergeProductDetails(firstProducts, secondProducts)
      };
    } catch (error) {
      console.warn('Second product-metrics attempt failed:', error);
      return { ...first, products: firstProducts };
    }
  }

  async function requestProductAvailability(items) {
    const response = await fetch(`${API_BASE}/api/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Product availability unavailable');
    }

    return data;
  }

  async function loadProductDetails(
    items,
    price,
    method,
    fallbackProducts = [],
    pendingProductDetails = null,
    shouldRender = () => true
  ) {
    const requestedItems = normaliseFreightItems({ items });

    const itemsWithUrls = mergeProductDetails(requestedItems, fallbackProducts)
      .map(item => ({
        ...item,
        productUrl: item.productUrl || item.url || ''
      }));

    if (!shouldRender()) return;
    renderProductDetails(itemsWithUrls, method);

    if (!requestedItems.length) return;

    try {
      const pendingResult = pendingProductDetails ? await pendingProductDetails : null;
      if (!shouldRender()) return;
      if (pendingResult?.error) throw pendingResult.error;
      const data = pendingResult?.data || await requestProductDetails(itemsWithUrls, price);

      if (!shouldRender()) return;
      renderProductDetails(mergeProductDetails(itemsWithUrls, data.products || fallbackProducts), method);
    } catch (error) {
      if (!shouldRender()) return;
      console.error(error);

      if (!fallbackProducts.length) {
        const block = document.getElementById('lc-omni-product-details');

        if (block) {
          block.classList.add('is-visible');
          block.innerHTML = '<div class="lc-omni-product-loading">Product details unavailable.</div>';
        }
      }
    }
  }

  function makeFreightCacheKey(items, address) {
    return JSON.stringify({
      items: normaliseFreightItems({ items }).map(item => ({
        sku: item.sku,
        productUrl: item.productUrl,
        quantity: item.quantity
      })),
      address: clean(address).toLowerCase()
    });
  }

  async function requestFreight({ sku, items, address, quantity = 1 }) {
    const freightItems = normaliseFreightItems({ sku, items, quantity });

    if (!freightItems.length) {
      throw new Error('No freight products selected');
    }

    const cacheKey = makeFreightCacheKey(freightItems, address);

    if (state.freightCache.has(cacheKey)) {
      return {
        ...state.freightCache.get(cacheKey),
        fromCache: true
      };
    }

    const postcode = clean(address).match(/\b\d{4}\b/)?.[0] || '';
    if (!postcode) throw new Error('Enter a four-digit delivery postcode.');

    try {
      const shopifyData = await requestShopifyPostcodeFreight(freightItems, postcode);
      state.freightCache.set(cacheKey, shopifyData);
      return shopifyData;
    } catch (shopifyError) {
      console.error('Direct Shopify postcode freight failed:', shopifyError);
    }

    const firstItem = freightItems[0] || {};
    const firstIsUrl = /^https?:\/\/.+\/products\//i.test(firstItem.sku || firstItem.productUrl || '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FREIGHT_TIMEOUT_MS);

    let response;
    let data = {};

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        response = await fetch(`${API_BASE}/get-freight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
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
            selectedAddress: address,
            freightPriceOnly: true,
            quoteAvailableQuantityOnly: false,
            skipBrowserFallback: true
          })
        });
        data = await response.json().catch(() => ({}));

        if (response.status !== 429 || attempt === 2) break;

        const waitSeconds = attempt === 0 ? 8 : 16;
        setStatus(`Freight service is busy. Retrying in ${waitSeconds} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Freight lookup is taking too long. Quote manually or try again in a moment.');
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok || !data.price) {
      throw new Error(response.status === 429
        ? 'Freight service is temporarily busy. Please click Refresh freight shortly.'
        : data.error || 'No freight returned');
    }

    state.freightCache.set(cacheKey, data);

    return data;
  }

  function getEditedCin7Items() {
    const rows = Array.from(document.querySelectorAll('#lc-omni-auto-sku .lc-omni-detected-item'));

    if (!rows.length) {
      return getItemsFromCin7()
        .filter(item => !state.excludedSkus.has(item.sku))
        .map(item => ({
          sku: item.sku,
          quantity: normaliseQuantityAllowZero(item.quantity)
        }))
        .filter(item => item.quantity > 0);
    }

    return rows
      .map(row => ({
        sku: clean(row.dataset.sku),
        quantity: normaliseQuantityAllowZero(row.querySelector('.lc-omni-detected-qty')?.value)
      }))
      .filter(item => item.sku)
      .filter(item => !state.excludedSkus.has(item.sku))
      .filter(item => item.quantity > 0);
  }

  function getCin7AutoPayload() {
    const items = getEditedCin7Items();
    const address = getAddressFromCin7();
    const searchAddress = getAddressSearchFromCin7();

    const key = JSON.stringify({
      items: items.map(item => ({
        sku: item.sku,
        quantity: item.quantity
      })),
      address: clean(address || searchAddress)
    });

    return {
      items,
      address,
      searchAddress,
      key
    };
  }

  function scheduleAutoCin7Lookup(delay = 900) {
    clearTimeout(state.autoTimer);

    state.autoTimer = setTimeout(() => {
      const panel = document.getElementById('lc-omni-freight-panel');

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

    const skuBox = document.getElementById('lc-omni-auto-sku');
    const addressBox = document.getElementById('lc-omni-auto-address');

    if (skuBox) {
      const detectedItems = getItemsFromCin7()
        .filter(item => !state.excludedSkus.has(item.sku));

      const existingQty = new Map(
        Array.from(document.querySelectorAll('#lc-omni-auto-sku .lc-omni-detected-item')).map(row => [
          clean(row.dataset.sku),
          normaliseQuantityAllowZero(row.querySelector('.lc-omni-detected-qty')?.value)
        ])
      );

      skuBox.innerHTML = detectedItems.length
        ? detectedItems.map(item => {
          const qty = existingQty.has(item.sku) ? existingQty.get(item.sku) : item.quantity;

          return `
            <div class="lc-omni-detected-item" data-sku="${escapeHtml(item.sku)}">
              <span>SKU: ${escapeHtml(item.sku)}</span>
              <label>
                Qty
                <input class="lc-omni-detected-qty" type="number" min="0" step="1" value="${escapeHtml(qty)}">
              </label>
              <button type="button" class="lc-omni-remove-detected" data-sku="${escapeHtml(item.sku)}">Remove</button>
            </div>
          `;
        }).join('')
        : '-';
    }

    const selectedAddress = clean(address || searchAddress);

    if (addressBox) {
      addressBox.textContent = selectedAddress || '-';
    }

    if (!items.length || !selectedAddress) {
      setResult('', '');
      renderProductDetails([], '');
      setStatus('No freight products selected, or could not detect shipping address.', true);
      return;
    }

    if (!force && key === state.lastAutoKey) {
      return;
    }

    state.lastAutoKey = key;
    state.autoRunning = true;
    state.selectedAddress = selectedAddress;

    try {
      const loaded = await getAndApplyFreight({
        items,
        address: selectedAddress,
        fill: true
      });

      if (loaded) {
        state.lastAutoKey = key;
      }
    } finally {
      state.autoRunning = false;

      if (state.queuedAutoKey && state.queuedAutoKey !== state.lastAutoKey) {
        state.queuedAutoKey = '';
        scheduleAutoCin7Lookup(400);
      } else {
        state.queuedAutoKey = '';
      }
    }
  }

  async function getManualFreight() {
    const items = getManualItems();
    const address = clean(document.getElementById('lc-omni-manual-address').value);

    if (!items.length || !address) {
      setStatus('Enter at least one SKU/product URL and address first.', true);
      return;
    }

    await getAndApplyFreight({
      items,
      address,
      fill: false
    });
  }

  function getManualItems() {
    return Array.from(document.querySelectorAll('.lc-omni-manual-product-row'))
      .map(row => ({
        sku: clean(row.querySelector('.lc-omni-manual-sku')?.value),
        quantity: normaliseQuantity(row.querySelector('.lc-omni-manual-qty')?.value)
      }))
      .filter(item => item.sku)
      .filter(item => item.quantity > 0);
  }

  async function getAndApplyFreight({ sku, items, address, fill }) {
    let requestedItems = [];
    let pendingProductDetails = null;
    const lookupSeq = state.lookupSeq + 1;
    state.lookupSeq = lookupSeq;
    const isCurrentLookup = () => lookupSeq === state.lookupSeq;

    try {
      setStatus('Getting freight price (this can take up to 60 seconds)...');

      requestedItems = normaliseFreightItems({ sku, items });

      if (!requestedItems.length) {
        setResult('', '');
        renderProductDetails([], '');
        setStatus('No freight products selected.');
        return false;
      }

      setResultLoading();
      renderProductDetails(requestedItems, state.method);
      // The compact Omni panel only needs the freight quote. Product enrichment is
      // intentionally skipped here to avoid a second slow network/automation job.

      const data = await requestFreight({
        sku,
        items: requestedItems,
        address
      });

      if (!isCurrentLookup()) return false;

      const adjustments = Array.isArray(data.quantityAdjustments) ? data.quantityAdjustments : [];
      const adjustmentBySku = new Map(adjustments.map(adjustment => [
        clean(adjustment.sku).toLowerCase(),
        adjustment
      ]));
      const quotedItems = requestedItems.map(item => {
        const adjustment = adjustmentBySku.get(clean(item.sku).toLowerCase());
        if (!adjustment) return item;

        return {
          ...item,
          quantity: normaliseQuantity(adjustment.availableQuantity),
          requestedQuantity: normaliseQuantity(adjustment.requestedQuantity),
          preSaleQuantity: normaliseQuantityAllowZero(
            adjustment.preSaleQuantity ??
            (Number(adjustment.requestedQuantity) - Number(adjustment.availableQuantity))
          )
        };
      });

      setResult(data.price, data.method, data.preSaleFreightEstimate);
      if (fill) fillOmniFreightFields(data.price, data.method);
      if (adjustments.length) {
        setStatus('');
      } else {
        setStatus(data.fromCache ? 'Freight loaded from recent lookup.' : 'Freight loaded.');
      }

      // Show quote and product summary now; enrich measurements in the background.
      loadProductDetails(
        quotedItems,
        data.price,
        data.method,
        data.products || [],
        pendingProductDetails,
        isCurrentLookup
      );

      return true;
    } catch (error) {
      if (!isCurrentLookup()) return false;

      console.error(error);
      const detailsResult = pendingProductDetails
        ? await pendingProductDetails.catch(() => ({}))
        : {};

      if (!isCurrentLookup()) return false;

      const fallbackProducts = mergeProductDetails(requestedItems, detailsResult?.data?.products || []);

      if (fallbackProducts.length) {
        renderProductDetails(fallbackProducts, state.method);
      }

      setResult('', '');
      setStatus(error.message || 'Error getting freight.', true);
      return false;
    }
  }

  async function loadAddressSuggestions() {
    const items = getManualItems();
    const firstItem = items[0];
    const address = clean(document.getElementById('lc-omni-manual-address').value);
    const isUrl = /^https?:\/\/.+\/products\//i.test(firstItem?.sku || '');
    const list = document.getElementById('lc-omni-address-suggestions');

    state.selectedAddress = '';
    list.innerHTML = '';

    if (!firstItem || firstItem.sku.length < 2 || address.length < 4) return;

    try {
      setStatus('Getting address suggestions...');

      const response = await fetch(`${API_BASE}/address-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: isUrl ? '' : firstItem.sku,
          productUrl: isUrl ? firstItem.sku : '',
          address
        })
      });

      const data = await response.json().catch(() => ({}));
      const suggestions = data.suggestions || [];

      list.innerHTML = suggestions.map(suggestion =>
        `<button type="button" class="lc-omni-suggestion">${escapeHtml(suggestion)}</button>`
      ).join('');

      setStatus(suggestions.length ? 'Select an address suggestion, or get freight manually.' : 'No address suggestions found.');
    } catch (error) {
      console.error(error);
      setStatus('Address suggestions unavailable. You can still get freight manually.');
    }
  }

  function renderDetectedDetails() {
    const items = getItemsFromCin7().filter(item => !state.excludedSkus.has(item.sku));
    const skuBox = document.getElementById('lc-omni-auto-sku');
    const addressBox = document.getElementById('lc-omni-auto-address');

    if (!skuBox || !addressBox) return;

    const existingQty = new Map(
      Array.from(document.querySelectorAll('#lc-omni-auto-sku .lc-omni-detected-item')).map(row => [
        clean(row.dataset.sku),
        normaliseQuantityAllowZero(row.querySelector('.lc-omni-detected-qty')?.value)
      ])
    );

    if (!items.length) {
      skuBox.innerHTML = '-';
    } else {
      skuBox.innerHTML = items.map(item => {
        const qty = existingQty.has(item.sku) ? existingQty.get(item.sku) : item.quantity;

        return `
          <div class="lc-omni-detected-item" data-sku="${escapeHtml(item.sku)}">
            <span>SKU: ${escapeHtml(item.sku)}</span>
            <label>
              Qty
              <input class="lc-omni-detected-qty" type="number" min="0" step="1" value="${escapeHtml(qty)}">
            </label>
            <button type="button" class="lc-omni-remove-detected" data-sku="${escapeHtml(item.sku)}">Remove</button>
          </div>
        `;
      }).join('');
    }

    addressBox.textContent = getAddressFromCin7() || '-';
  }

  function addManualProductRow(value = '', quantity = 1) {
    const rows = document.getElementById('lc-omni-manual-products');
    if (!rows) return;

    const row = document.createElement('div');
    row.className = 'lc-omni-manual-product-row';

    row.innerHTML = `
      <input class="lc-omni-manual-sku" placeholder="SKU or product URL" value="${escapeHtml(value)}" />
      <input class="lc-omni-manual-qty" type="number" min="1" step="1" value="${escapeHtml(quantity)}" />
      <button type="button" class="lc-omni-remove-product">Remove</button>
    `;

    rows.appendChild(row);
  }

  function findQuoteMemoButton() {
    return document.getElementById('lc-omni-quote-memo-inline-button') ||
      document.getElementById('lc-omni-quote-memo-toggle');
  }

  function getAllVisiblePageElements() {
    return Array.from(document.querySelectorAll('body *')).filter(element => {
      if (!isVisible(element)) return false;
      if (isInjectedPanelElement(element)) return false;
      if (element.id === 'lc-omni-freight-toggle' || element.id === 'lc-omni-containers-open') return false;
      return true;
    });
  }

  function findOmniFreightLabel() {
    return getAllVisiblePageElements().filter(element => (
      clean(element.innerText || element.textContent).toLowerCase() === 'freight'
    )).sort((a, b) => (
      b.getBoundingClientRect().top - a.getBoundingClientRect().top ||
      a.children.length - b.children.length
    ))[0] || null;
  }

  function findOmniFreightInputs() {
    const label = findOmniFreightLabel();
    if (!label) return [];

    const labelRect = label.getBoundingClientRect();
    const labelCentreY = labelRect.top + labelRect.height / 2;
    return Array.from(document.querySelectorAll('input:not([type="hidden"])'))
      .filter(isVisible)
      .filter(input => !isInjectedPanelElement(input))
      .map(input => ({ input, rect: input.getBoundingClientRect() }))
      .filter(({ rect }) => (
        rect.left >= labelRect.right - 8 &&
        Math.abs((rect.top + rect.height / 2) - labelCentreY) <= 6
      ))
      .sort((a, b) => a.rect.left - b.rect.left)
      .map(({ input }) => input);
  }

  function setOmniInputValue(input, value) {
    if (!input) return false;

    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (valueSetter) valueSetter.call(input, value);
    else input.value = value;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function fillOmniFreightFields(price, method) {
    const inputs = findOmniFreightInputs();
    const descriptionInput = inputs.length > 1 ? inputs[0] : null;
    const amountInput = inputs.length > 1 ? inputs[1] : inputs[0] || null;
    const amount = Number(moneyToNumber(price));
    if (!amountInput || !Number.isFinite(amount)) return false;

    if (descriptionInput && clean(method)) setOmniInputValue(descriptionInput, clean(method));
    setOmniInputValue(amountInput, amount.toFixed(2));
    return true;
  }

  function findButtonByText(pattern) {
    return Array.from(document.querySelectorAll('button, [role="button"], a'))
      .find(element => isVisible(element) && pattern.test(clean(element.textContent || element.getAttribute('aria-label') || '')));
  }

  function placeContainerButtonNextToWarehouse() {
    const containerButton = document.getElementById('lc-omni-containers-open');
    if (!containerButton) return false;

    const anchor = findButtonByText(/foshan\s+warehouse/i) ||
      findButtonByText(/nz\s+availability/i) ||
      findButtonByText(/install\s+fees/i) ||
      findButtonByText(/custom\s+products/i);

    if (!anchor) {
      containerButton.style.display = 'none';
      return false;
    }

    const parent = anchor.parentElement || anchor.closest?.('div, section, fieldset') || document.body;
    const parentStyle = window.getComputedStyle(parent);

    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    if (containerButton.parentElement !== parent) {
      parent.appendChild(containerButton);
    }

    const anchorRect = anchor.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    containerButton.style.display = 'block';
    containerButton.style.position = 'absolute';
    containerButton.style.left = `${anchorRect.right - parentRect.left + 8}px`;
    containerButton.style.top = `${anchorRect.top - parentRect.top}px`;
    containerButton.style.width = 'auto';
    containerButton.style.height = `${Math.max(34, anchorRect.height || 34)}px`;
    containerButton.style.zIndex = '51';
    return true;
  }

  function placeFreightButtonNextToMemo() {
    const freightButton = document.getElementById('lc-omni-freight-toggle');
    const containerButton = document.getElementById('lc-omni-containers-open');
    if (!freightButton) return;

    placeContainerButtonNextToWarehouse();

    const freightLabel = findOmniFreightLabel();

    if (!freightLabel || !isVisible(freightLabel)) {
      freightButton.style.display = 'none';
      if (containerButton && !findButtonByText(/foshan\s+warehouse|nz\s+availability|install\s+fees|custom\s+products/i)) {
        containerButton.style.display = 'none';
      }
      return;
    }

    if (freightButton.parentElement !== document.body) {
      document.body.appendChild(freightButton);
    }

    const labelRect = freightLabel.getBoundingClientRect();
    freightButton.style.display = 'inline-flex';
    freightButton.style.position = 'absolute';
    freightButton.style.marginLeft = '0';
    freightButton.style.height = '28px';
    freightButton.style.zIndex = '51';

    const buttonRect = freightButton.getBoundingClientRect();
    freightButton.style.left = `${window.scrollX + labelRect.left - buttonRect.width - 26}px`;
    freightButton.style.top = `${window.scrollY + labelRect.top + (labelRect.height - buttonRect.height) / 2}px`;

    const panel = document.getElementById('lc-omni-freight-panel');
    if (panel?.classList.contains('is-open')) positionFreightPanelNextToButton();

    placeContainerButtonNextToWarehouse();
  }

  function positionFreightPanelNextToButton() {
    const button = document.getElementById('lc-omni-freight-toggle');
    const panel = document.getElementById('lc-omni-freight-panel');
    if (!button || !panel?.classList.contains('is-open')) return;

    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const left = Math.max(16, window.scrollX + buttonRect.left - panelRect.width - 12);
    const top = Math.max(16, window.scrollY + buttonRect.top - 64);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
  }

  function styleFreightInlineButton(button) {
    button.style.boxSizing = 'border-box';
    button.style.width = '140px';
    button.style.minWidth = '140px';
    button.style.minHeight = '28px';
    button.style.padding = '0 16px';
    button.style.background = '#13377e';
    button.style.color = '#fff';
    button.style.border = '1px solid #13377e';
    button.style.borderRadius = '4px';
    button.style.boxShadow = 'none';
    button.style.font = '800 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.lineHeight = '1';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.textAlign = 'center';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';
    button.style.display = 'none';

    button.addEventListener('mouseenter', () => {
      button.style.background = '#0f2e6a';
      button.style.borderColor = '#0f2e6a';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#13377e';
      button.style.borderColor = '#13377e';
    });
  }

  function styleContainersInlineButton(button) {
    button.style.boxSizing = 'border-box';
    button.style.minWidth = '132px';
    button.style.minHeight = '34px';
    button.style.padding = '0 14px';
    button.style.background = '#13377e';
    button.style.color = '#fff';
    button.style.border = '1px solid #13377e';
    button.style.borderRadius = '4px';
    button.style.boxShadow = 'none';
    button.style.font = '800 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.lineHeight = '1';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';
    button.style.display = 'none';

    button.addEventListener('mouseenter', () => {
      button.style.background = '#0f2e6a';
      button.style.borderColor = '#0f2e6a';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#13377e';
      button.style.borderColor = '#13377e';
    });
  }

  function openContainersPopup() {
    const popupWidth = 1500;
    const popupHeight = 900;
    const left = Math.max(0, Math.round((window.screen.width - popupWidth) / 2));
    const top = Math.max(0, Math.round((window.screen.height - popupHeight) / 2));
    const features = [
      `width=${popupWidth}`,
      `height=${popupHeight}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes',
      'toolbar=no',
      'menubar=no',
      'location=yes',
      'status=no'
    ].join(',');

    const popup = window.open(
      CONTAINER_DASHBOARD_URL,
      'LivingCultureContainersPopup',
      features
    );

    if (!popup) {
      alert('Chrome blocked the LC Containers popup. Please allow popups for Cin7, then click again.');
      return;
    }

    popup.focus();
  }

  function watchCin7QuoteChanges() {
    if (window.__lcOmniFreightObserverStarted) return;

    window.__lcOmniFreightObserverStarted = true;

    let lastDetectedSkuKey = '';

    const checkForChanges = () => {
      const panel = document.getElementById('lc-omni-freight-panel');
      if (!panel?.classList.contains('is-open')) return;

      const rawItems = getItemsFromCin7();
      if (!rawItems.length) return;

      const detectedSkuKey = JSON.stringify(rawItems.map(item => item.sku));

      if (detectedSkuKey !== lastDetectedSkuKey) {
        lastDetectedSkuKey = detectedSkuKey;
        renderDetectedDetails();
        state.lastAutoKey = '';
        scheduleAutoCin7Lookup(900);
      }
    };

    const observer = new MutationObserver(() => {
      clearTimeout(window.__lcOmniFreightMutationTimer);

      window.__lcOmniFreightMutationTimer = setTimeout(() => {
        checkForChanges();
        placeFreightButtonNextToMemo();
      }, 900);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['value', 'class', 'aria-label', 'title']
    });

    setInterval(checkForChanges, 2500);
  }

  function createPanel() {
    if (document.getElementById('lc-omni-freight-panel')) {
      placeFreightButtonNextToMemo();
      return;
    }

    const button = document.createElement('button');
    button.id = 'lc-omni-freight-toggle';
    button.type = 'button';
    button.textContent = 'Freight Costs';
    styleFreightInlineButton(button);

    const containerButton = document.createElement('button');
    containerButton.id = 'lc-omni-containers-open';
    containerButton.type = 'button';
    containerButton.textContent = 'LC Containers';
    containerButton.title = 'Open the live container tracker';
    styleContainersInlineButton(containerButton);

    const panel = document.createElement('div');
    panel.id = 'lc-omni-freight-panel';

    panel.innerHTML = `
      <div class="lc-omni-hero">
        <div class="lc-omni-hero-top">
          <img src="https://livingculture.co.nz/cdn/shop/files/logo_ec2b0c5e-42ca-4695-8c7e-43b344144c58.png?v=1675047511&width=220" alt="Living Culture" />
          <strong>Freight Costing</strong>
        </div>
        <button type="button" id="lc-omni-panel-close">×</button>
      </div>

      <div class="lc-omni-block" id="lc-omni-detected-block">
        <div class="lc-omni-label">Detected from Cin7</div>
        <div><span id="lc-omni-auto-sku">-</span></div>
        <div><b>Address:</b> <span id="lc-omni-auto-address">-</span></div>
        <button type="button" id="lc-omni-use-cin7">Refresh freight with these quantities</button>
      </div>

      <div class="lc-omni-block" id="lc-omni-manual-lookup-block">
        <div class="lc-omni-label">Manual lookup</div>
        <div id="lc-omni-manual-products"></div>
        <button type="button" id="lc-omni-add-product">Add another product</button>
        <input id="lc-omni-manual-address" placeholder="Address" />
        <div id="lc-omni-address-suggestions"></div>
        <button type="button" id="lc-omni-manual-get">Get freight manually</button>
      </div>

      <div class="lc-omni-block lc-omni-result-block">
        <div id="lc-omni-freight-result">Freight: -</div>
        <div id="lc-omni-freight-method"></div>
        <div id="lc-omni-presale-freight-estimate"></div>
      </div>

      <div id="lc-omni-product-details" class="lc-omni-block"></div>

      <div id="lc-omni-freight-status"></div>
    `;

    const styles = document.createElement('style');

    styles.textContent = `
      #lc-omni-freight-panel {
        position: absolute;
        top: 72px;
        right: auto;
        left: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        width: 680px;
        max-width: calc(100vw - 32px);
        max-height: 300px;
        overflow: auto;
        display: none;
        padding: 0;
        color: #162947;
        background: #dce6f4;
        border: 1px solid #b8c9e1;
        border-radius: 14px;
        box-shadow: 0 20px 44px rgba(15, 46, 106, 0.20);
        font: 13px/1.35 Arial, sans-serif;
      }

      #lc-omni-freight-panel.is-open {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-areas:
          "hero hero"
          "detected result"
          "detected products"
          "status status";
        align-items: start;
      }

      .lc-omni-hero {
        grid-area: hero;
        position: relative;
        margin: 6px;
        padding: 8px 10px;
        color: #fff;
        background: #13377e;
        border-radius: 8px;
        box-shadow: 0 12px 28px rgba(15, 46, 106, 0.18);
      }

      .lc-omni-hero-top {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-right: 38px;
      }

      .lc-omni-hero img {
        width: 68px;
        height: auto;
        display: block;
        margin: 0;
      }

      .lc-omni-hero strong {
        display: block;
        font-size: 18px;
        line-height: 1.05;
        font-weight: 700;
        text-align: left;
      }

      .lc-omni-hero p {
        margin: 2px 38px 0 78px;
        color: rgba(255, 255, 255, 0.92);
        font-size: 11px;
        line-height: 1.3;
      }

      #lc-omni-panel-close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        color: #162947;
        background: #e7eef8;
        border: 1px solid #b8c9e1;
        border-radius: 9px;
        font-size: 18px;
        font-weight: 800;
        cursor: pointer;
      }

      .lc-omni-block {
        display: grid;
        gap: 5px;
        margin: 6px;
        padding: 8px;
        background: #fff;
        border: 1px solid #b8c9e1;
        border-radius: 8px;
        box-shadow: 0 10px 24px rgba(15, 46, 106, 0.09);
      }

      #lc-omni-detected-block {
        grid-area: detected;
        align-self: stretch;
      }

      .lc-omni-result-block {
        grid-area: result;
      }

      #lc-omni-product-details {
        grid-area: products;
      }

      #lc-omni-manual-lookup-block {
        display: none;
      }

      .lc-omni-label {
        color: #4c6485;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0;
      }

      .lc-omni-detected-item {
        display: grid;
        grid-template-columns: minmax(130px, 1fr) 70px 52px;
        align-items: center;
        gap: 6px;
        padding: 3px 0;
        border-bottom: 1px solid #dce5f1;
      }

      .lc-omni-detected-item:last-child {
        border-bottom: 0;
      }

      .lc-omni-detected-item span {
        font-weight: 800;
        white-space: nowrap;
      }

      .lc-omni-detected-item label {
        display: grid;
        grid-template-columns: 28px 1fr;
        align-items: center;
        gap: 4px;
        color: #4c6485;
        font-size: 12px;
        font-weight: 800;
      }

      .lc-omni-remove-detected {
        min-height: 28px !important;
        padding: 4px 6px !important;
        background: #eef3fa !important;
        color: #162947 !important;
        border: 1px solid #b8c9e1 !important;
        border-radius: 6px !important;
        font-size: 11px !important;
      }

      #lc-omni-freight-panel input {
        width: 100%;
        min-height: 36px;
        padding: 8px 10px;
        color: #162947;
        background: #fff;
        border: 1px solid #b8c9e1;
        border-radius: 9px;
        font: inherit;
      }

      #lc-omni-freight-panel .lc-omni-detected-qty {
        min-height: 28px;
        padding: 4px 6px;
        text-align: center;
        border-radius: 6px;
      }

      #lc-omni-freight-panel button:not(#lc-omni-panel-close):not(.lc-omni-remove-detected) {
        min-height: 30px;
        padding: 5px 8px;
        color: #fff;
        background: #13377e;
        border: 0;
        border-radius: 9px;
        font-weight: 700;
        cursor: pointer;
      }

      #lc-omni-freight-panel button:not(#lc-omni-panel-close):not(.lc-omni-remove-detected):hover {
        background: #0f2e6a;
      }

      .lc-omni-manual-product-row {
        display: grid;
        grid-template-columns: 1fr 50px 64px;
        gap: 6px;
      }

      .lc-omni-manual-product-row .lc-omni-remove-product {
        min-height: 36px !important;
        padding: 7px 6px !important;
        color: #162947 !important;
        background: #eef3fa !important;
        border: 1px solid #b8c9e1 !important;
        font-size: 12px;
      }

      #lc-omni-address-suggestions {
        display: grid;
        gap: 5px;
      }

      #lc-omni-address-suggestions .lc-omni-suggestion {
        color: #162947 !important;
        background: #f4f7fb !important;
        border: 1px solid #dce5f1 !important;
        text-align: left;
        font-weight: 400 !important;
      }

      #lc-omni-freight-result,
      #lc-omni-freight-method,
      #lc-omni-presale-freight-estimate {
        grid-column: 1 / -1;
      }

      #lc-omni-freight-result {
        font-weight: 800;
        font-size: 16px;
      }

      #lc-omni-presale-freight-estimate {
        display: grid;
        gap: 3px;
        color: #34577f;
      }

      .lc-omni-freight-note {
        font-size: 11px;
      }

      .lc-omni-presale-pulse {
        color: #9a2d20;
        font-weight: 900;
        animation: lc-omni-presale-pulse 1.5s ease-in-out infinite;
      }

      @keyframes lc-omni-presale-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
      }

      #lc-omni-freight-status {
        grid-area: status;
        min-height: 20px;
        margin: 6px;
        color: #34577f;
      }

      #lc-omni-freight-status.is-loading {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      #lc-omni-freight-status.is-queued-update {
        position: relative;
        height: 24px;
        min-height: 24px;
        overflow: hidden;
      }

      #lc-omni-freight-status.is-queued-update::before {
        content: '\\1F69A';
        position: absolute;
        left: 0;
        top: 1px;
        font-size: 16px;
        line-height: 1;
        animation: lc-omni-truck-shuttle 1.35s ease-in-out infinite alternate;
      }

      #lc-omni-freight-status.is-loading::before,
      .lc-omni-spinner {
        content: '';
        display: inline-block;
        width: 13px;
        height: 13px;
        flex: 0 0 13px;
        box-sizing: border-box;
        border: 2px solid rgba(19, 55, 126, 0.22);
        border-top-color: #13377e;
        border-radius: 50%;
        animation: lc-omni-spin 0.85s linear infinite;
      }

      .lc-omni-loading-line {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      @keyframes lc-omni-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes lc-omni-truck-shuttle {
        from { transform: translateX(0); }
        to { transform: translateX(54px); }
      }

      #lc-omni-product-details {
        display: none;
        gap: 0;
      }

      #lc-omni-product-details.is-visible {
        display: grid;
      }

      .lc-omni-product-row {
        display: grid;
        grid-template-columns: 60px 1fr;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px solid #dce5f1;
      }

      .lc-omni-product-row:first-child {
        padding-top: 0;
      }

      .lc-omni-product-row img,
      .lc-omni-product-image-placeholder {
        width: 60px;
        height: 60px;
        object-fit: contain;
        background: #fff;
        border-radius: 8px;
      }

      .lc-omni-product-row strong {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
        line-height: 1.25;
      }

      .lc-omni-product-row div div {
        color: #4c6485;
        font-size: 12px;
      }

      .lc-omni-product-website {
        overflow-wrap: anywhere;
      }

      .lc-omni-product-website a {
        color: #13377e;
        font-weight: 700;
        text-decoration: underline;
      }

      .lc-omni-product-totals {
        padding-top: 10px;
        font-weight: 800;
      }

      .lc-omni-product-loading {
        color: #4c6485;
      }
    `;

    document.head.appendChild(styles);
    document.body.append(button, containerButton, panel);

    button.addEventListener('click', () => {
      panel.classList.toggle('is-open');

      if (panel.classList.contains('is-open')) {
        state.lastAutoKey = '';
        renderDetectedDetails();
        requestAnimationFrame(positionFreightPanelNextToButton);
        scheduleAutoCin7Lookup(350);
      }
    });

    containerButton.addEventListener('click', () => {
      openContainersPopup();
    });

    panel.querySelector('#lc-omni-panel-close').addEventListener('click', () => {
      panel.classList.remove('is-open');
    });

    panel.querySelector('#lc-omni-use-cin7').addEventListener('click', () => {
      state.lastAutoKey = '';
      useCin7Details({ force: true });
    });

    panel.querySelector('#lc-omni-manual-get').addEventListener('click', getManualFreight);

    panel.querySelector('#lc-omni-add-product').addEventListener('click', () => {
      addManualProductRow();
    });

    panel.querySelector('#lc-omni-address-suggestions').addEventListener('click', event => {
      const suggestion = event.target.closest('.lc-omni-suggestion');

      if (!suggestion) return;

      state.selectedAddress = clean(suggestion.textContent);
      panel.querySelector('#lc-omni-manual-address').value = state.selectedAddress;
      setStatus('Address selected.');
    });

    panel.querySelector('#lc-omni-manual-address').addEventListener('input', () => {
      clearTimeout(state.addressTimer);
      state.addressTimer = setTimeout(loadAddressSuggestions, 700);
    });

    panel.querySelector('#lc-omni-manual-products').addEventListener('click', event => {
      if (!event.target.classList.contains('lc-omni-remove-product')) return;

      const rows = panel.querySelectorAll('.lc-omni-manual-product-row');

      if (rows.length <= 1) return;

      event.target.closest('.lc-omni-manual-product-row').remove();
    });

    panel.querySelector('#lc-omni-manual-products').addEventListener('input', () => {
      clearTimeout(state.addressTimer);
      state.addressTimer = setTimeout(loadAddressSuggestions, 700);
    });

    panel.querySelector('#lc-omni-auto-sku').addEventListener('input', event => {
      if (!event.target.classList.contains('lc-omni-detected-qty')) return;

      state.lastAutoKey = '';
      scheduleAutoCin7Lookup(900);
    });

    panel.querySelector('#lc-omni-auto-sku').addEventListener('click', event => {
      const removeButton = event.target.closest('.lc-omni-remove-detected');

      if (!removeButton) return;

      const sku = clean(removeButton.dataset.sku);

      if (!sku) return;

      state.excludedSkus.add(sku);
      state.lastAutoKey = '';
      renderDetectedDetails();
      scheduleAutoCin7Lookup(500);
    });

    addManualProductRow();

    setInterval(() => {
      if (!panel.classList.contains('is-open')) return;
      renderDetectedDetails();
    }, 5000);

    placeFreightButtonNextToMemo();
  }

  function boot() {
    if (!document.body) return;

    createPanel();
    watchCin7QuoteChanges();

    setTimeout(placeFreightButtonNextToMemo, 300);
    setTimeout(placeFreightButtonNextToMemo, 1000);
    setTimeout(placeFreightButtonNextToMemo, 2500);
    setTimeout(placeFreightButtonNextToMemo, 5000);
  }

  boot();

  window.addEventListener('load', boot);
  window.addEventListener('resize', positionFreightPanelNextToButton);
  window.addEventListener('scroll', positionFreightPanelNextToButton, { passive: true });
  document.addEventListener('DOMContentLoaded', boot);

  setInterval(() => {
    createPanel();
    placeFreightButtonNextToMemo();
  }, 5000);
})();
