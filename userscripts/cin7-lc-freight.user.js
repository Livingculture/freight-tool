// ==UserScript==
// @name         Cin7 Living Culture Freight
// @namespace    livingculture
// @version      8.3-hosted
// @description  Living Culture freight panel for Cin7 using the hosted freight service.
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

  const HOSTED_API_BASE = 'https://living-culture-freight.vercel.app';
  const API_BASE = HOSTED_API_BASE || 'http://localhost:3001';
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

  function getAddressFromCin7() {
    const line1 = getAddressLineByLabel('Shipping address line 1') || getFieldValueByLabel('Shipping address line 1');
    const line2 = getAddressLineByLabel('Shipping address line 2') || getFieldValueByLabel('Shipping address line 2');

    return clean([line1, line2].filter(isAddressLike).join(', '));
  }

  function getAddressSearchFromCin7() {
    const address = clean(
      getAddressLineByLabel('Shipping address line 1') ||
      getFieldValueByLabel('Shipping address line 1') ||
      getAddressFromCin7()
    );

    return isAddressLike(address) ? address : '';
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById('lc-freight-status');
    if (!status) return;

    const isQueuedUpdate = !isError && /^Cin7 products changed\./i.test(message || '');

    status.textContent = isQueuedUpdate ? '' : message || '';
    status.setAttribute('aria-label', isQueuedUpdate ? message : '');
    status.style.display = message ? '' : 'none';
    status.style.color = isError ? '#9a2d20' : '#405f54';
    status.classList.toggle('is-queued-update', isQueuedUpdate);
    status.classList.toggle('is-loading', Boolean(message && !isQueuedUpdate && !isError && /getting|loading|reading|updating/i.test(message)));
  }

  function setResult(price, method = '', preSaleFreightEstimate = null) {
    state.price = price || '';
    state.priceNumber = moneyToNumber(price);
    state.method = method || '';

    const result = document.getElementById('lc-freight-result');
    const methodBlock = document.getElementById('lc-freight-method');
    const preSaleBlock = document.getElementById('lc-presale-freight-estimate');

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
          ${preSaleFreightEstimate.note ? `<div class="lc-freight-note">${escapeHtml(preSaleFreightEstimate.note)}</div>` : ''}
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

    const result = document.getElementById('lc-freight-result');
    const methodBlock = document.getElementById('lc-freight-method');
    const preSaleBlock = document.getElementById('lc-presale-freight-estimate');

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
    const block = document.getElementById('lc-product-details');
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
      block.innerHTML = '<div class="lc-product-loading">No freight products selected.</div>';
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
            : `<div class="lc-loading-line"><span class="lc-spinner" aria-hidden="true"></span>${escapeHtml(detailsLine)}</div>`
          : '';

        const quantityLine = preSaleQuantity
          ? `
            <div>Qty ${requestedQuantity}</div>
            <div>Ship now: ${lineWeight.toFixed(2)} kg · ${lineCbm.toFixed(3)} CBM · ${cartonCount} ctns</div>
            <div>Pre-sale later: ${preSaleWeight.toFixed(2)} kg · ${preSaleCbm.toFixed(3)} CBM · ${preSaleCartons} ctns</div>
          `
          : `<div>Qty ${requestedQuantity} · ${lineWeight.toFixed(2)} kg · ${lineCbm.toFixed(3)} CBM · ${cartonCount} ctns</div>`;
        const statusLine = preSaleQuantity
          ? `<div>Status: ${quantity} add to cart and <strong class="lc-presale-pulse">${preSaleQuantity} PRE-SALE</strong></div>`
          : `<div>${escapeHtml(`Status: ${saleState}`)}</div>`;

        const image = product.image
          ? `<img src="${escapeHtml(product.image)}" alt="">`
          : '<div class="lc-product-image-placeholder"></div>';
        const title = cleanProductTitle(product.title || product.sku || '', product.sku || '');

        const websiteUrl = clean(product.url || product.productUrl);

        const websiteLine = websiteUrl
          ? `<div class="lc-product-website"><a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">To website</a></div>`
          : '';

        return `
          <div class="lc-product-row">
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
        <div class="lc-product-totals">
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
        const block = document.getElementById('lc-product-details');

        if (block) {
          block.classList.add('is-visible');
          block.innerHTML = '<div class="lc-product-loading">Product details unavailable.</div>';
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

    const firstItem = freightItems[0] || {};
    const firstIsUrl = /^https?:\/\/.+\/products\//i.test(firstItem.sku || firstItem.productUrl || '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FREIGHT_TIMEOUT_MS);

    let response;

    try {
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
          selectedAddress: address
        })
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Freight lookup is taking too long. Quote manually or try again in a moment.');
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.price) {
      throw new Error(data.error || 'No freight returned');
    }

    state.freightCache.set(cacheKey, data);

    return data;
  }

  function getEditedCin7Items() {
    const rows = Array.from(document.querySelectorAll('#lc-auto-sku .lc-detected-item'));

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
        quantity: normaliseQuantityAllowZero(row.querySelector('.lc-detected-qty')?.value)
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

    const skuBox = document.getElementById('lc-auto-sku');
    const addressBox = document.getElementById('lc-auto-address');

    if (skuBox) {
      const detectedItems = getItemsFromCin7()
        .filter(item => !state.excludedSkus.has(item.sku));

      const existingQty = new Map(
        Array.from(document.querySelectorAll('#lc-auto-sku .lc-detected-item')).map(row => [
          clean(row.dataset.sku),
          normaliseQuantityAllowZero(row.querySelector('.lc-detected-qty')?.value)
        ])
      );

      skuBox.innerHTML = detectedItems.length
        ? detectedItems.map(item => {
          const qty = existingQty.has(item.sku) ? existingQty.get(item.sku) : item.quantity;

          return `
            <div class="lc-detected-item" data-sku="${escapeHtml(item.sku)}">
              <span>${escapeHtml(item.sku)}</span>
              <label>
                Qty
                <input class="lc-detected-qty" type="number" min="0" step="1" value="${escapeHtml(qty)}">
              </label>
              <button type="button" class="lc-remove-detected" data-sku="${escapeHtml(item.sku)}">Remove</button>
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
    const address = clean(document.getElementById('lc-manual-address').value);

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
    return Array.from(document.querySelectorAll('.lc-manual-product-row'))
      .map(row => ({
        sku: clean(row.querySelector('.lc-manual-sku')?.value),
        quantity: normaliseQuantity(row.querySelector('.lc-manual-qty')?.value)
      }))
      .filter(item => item.sku)
      .filter(item => item.quantity > 0);
  }

  async function getAndApplyFreight({ sku, items, address, fill }) {
    let requestedItems = [];
    let pendingProductDetails = Promise.resolve({ data: { products: [] } });
    const lookupSeq = state.lookupSeq + 1;
    state.lookupSeq = lookupSeq;
    const isCurrentLookup = () => lookupSeq === state.lookupSeq;

    try {
      setStatus('Getting freight...');

      requestedItems = normaliseFreightItems({ sku, items });

      if (!requestedItems.length) {
        setResult('', '');
        renderProductDetails([], '');
        setStatus('No freight products selected.');
        return false;
      }

      setResultLoading();
      renderProductDetails(requestedItems, state.method);
      let pendingDisplayProducts = requestedItems;
      const applyPendingProducts = products => {
        if (!isCurrentLookup() || !products?.length) return;
        pendingDisplayProducts = mergeProductDetails(pendingDisplayProducts, products);
        renderProductDetails(pendingDisplayProducts, state.method);
      };
      pendingProductDetails = requestProductDetailsWithRetry(requestedItems)
        .then(data => ({ data }))
        .catch(error => ({ error }));
      pendingProductDetails.then(result => applyPendingProducts(result?.data?.products || []));

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
      const detailsResult = await pendingProductDetails.catch(() => ({}));

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
        body: JSON.stringify({
          sku: isUrl ? '' : firstItem.sku,
          productUrl: isUrl ? firstItem.sku : '',
          address
        })
      });

      const data = await response.json().catch(() => ({}));
      const suggestions = data.suggestions || [];

      list.innerHTML = suggestions.map(suggestion =>
        `<button type="button" class="lc-suggestion">${escapeHtml(suggestion)}</button>`
      ).join('');

      setStatus(suggestions.length ? 'Select an address suggestion, or get freight manually.' : 'No address suggestions found.');
    } catch (error) {
      console.error(error);
      setStatus('Address suggestions unavailable. You can still get freight manually.');
    }
  }

  function renderDetectedDetails() {
    const items = getItemsFromCin7().filter(item => !state.excludedSkus.has(item.sku));
    const skuBox = document.getElementById('lc-auto-sku');
    const addressBox = document.getElementById('lc-auto-address');

    if (!skuBox || !addressBox) return;

    const existingQty = new Map(
      Array.from(document.querySelectorAll('#lc-auto-sku .lc-detected-item')).map(row => [
        clean(row.dataset.sku),
        normaliseQuantityAllowZero(row.querySelector('.lc-detected-qty')?.value)
      ])
    );

    if (!items.length) {
      skuBox.innerHTML = '-';
    } else {
      skuBox.innerHTML = items.map(item => {
        const qty = existingQty.has(item.sku) ? existingQty.get(item.sku) : item.quantity;

        return `
          <div class="lc-detected-item" data-sku="${escapeHtml(item.sku)}">
            <span>${escapeHtml(item.sku)}</span>
            <label>
              Qty
              <input class="lc-detected-qty" type="number" min="0" step="1" value="${escapeHtml(qty)}">
            </label>
            <button type="button" class="lc-remove-detected" data-sku="${escapeHtml(item.sku)}">Remove</button>
          </div>
        `;
      }).join('');
    }

    addressBox.textContent = getAddressFromCin7() || '-';
  }

  function addManualProductRow(value = '', quantity = 1) {
    const rows = document.getElementById('lc-manual-products');
    if (!rows) return;

    const row = document.createElement('div');
    row.className = 'lc-manual-product-row';

    row.innerHTML = `
      <input class="lc-manual-sku" placeholder="SKU or product URL" value="${escapeHtml(value)}" />
      <input class="lc-manual-qty" type="number" min="1" step="1" value="${escapeHtml(quantity)}" />
      <button type="button" class="lc-remove-product">Remove</button>
    `;

    rows.appendChild(row);
  }

  function findQuoteMemoButton() {
    return document.getElementById('lc-quote-memo-inline-button') ||
      document.getElementById('lc-quote-memo-toggle');
  }

  function getAllVisiblePageElements() {
    return Array.from(document.querySelectorAll('body *')).filter(element => {
      if (!isVisible(element)) return false;
      if (isInjectedPanelElement(element)) return false;
      if (element.id === 'lc-freight-toggle' || element.id === 'lc-containers-open') return false;
      return true;
    });
  }

  function findAdditionalChargesHeading() {
    return getAllVisiblePageElements().find(element => (
      clean(element.innerText || element.textContent).toLowerCase() === 'additional charges and services'
    ));
  }

  function findAdditionalChargesPlusButton() {
    const heading = findAdditionalChargesHeading();
    if (!heading) return null;

    const headingRect = heading.getBoundingClientRect();
    return getAllVisiblePageElements()
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const text = clean(element.innerText || element.textContent);
        const isBelowHeading = rect.top >= headingRect.bottom - 5 && rect.top <= headingRect.bottom + 160;
        const isNearLeft = rect.left >= headingRect.left - 20 && rect.left <= headingRect.left + 130;
        const isButtonSized = rect.width >= 28 && rect.width <= 90 && rect.height >= 28 && rect.height <= 80;
        const tagLooksClickable = ['BUTTON', 'A'].includes(element.tagName) ||
          element.getAttribute('role') === 'button' ||
          element.onclick ||
          window.getComputedStyle(element).cursor === 'pointer';
        const textLooksPlus = text === '+' || text.includes('+');
        const hasSvgOrIcon = !!element.querySelector?.('svg, i, .fa, .icon, [class*="icon"], [class*="plus"]');
        return isBelowHeading && isNearLeft && isButtonSized && (tagLooksClickable || textLooksPlus || hasSvgOrIcon);
      })
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .sort((a, b) => (
        Math.abs(a.rect.top - headingRect.bottom) + Math.abs(a.rect.left - headingRect.left) -
        (Math.abs(b.rect.top - headingRect.bottom) + Math.abs(b.rect.left - headingRect.left))
      ))[0]?.element || null;
  }

  function findButtonByText(pattern) {
    return Array.from(document.querySelectorAll('button, [role="button"], a'))
      .find(element => isVisible(element) && pattern.test(clean(element.textContent || element.getAttribute('aria-label') || '')));
  }

  function placeContainerButtonNextToWarehouse() {
    const containerButton = document.getElementById('lc-containers-open');
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
    const freightButton = document.getElementById('lc-freight-toggle');
    const containerButton = document.getElementById('lc-containers-open');
    if (!freightButton) return;

    placeContainerButtonNextToWarehouse();

    const plusButton = findAdditionalChargesPlusButton();

    if (!plusButton || !isVisible(plusButton)) {
      freightButton.style.display = 'none';
      if (containerButton && !findButtonByText(/foshan\s+warehouse|nz\s+availability|install\s+fees|custom\s+products/i)) {
        containerButton.style.display = 'none';
      }
      return;
    }

    const plusRect = plusButton.getBoundingClientRect();
    const parent = plusButton.parentElement || plusButton.closest?.('div, section, fieldset') || document.body;
    const parentStyle = window.getComputedStyle(parent);

    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    if (freightButton.parentElement !== parent) {
      parent.appendChild(freightButton);
    }

    const parentRect = parent.getBoundingClientRect();
    const buttonHeight = Math.max(34, plusRect.height || 34);

    freightButton.style.display = 'block';
    freightButton.style.position = 'absolute';
    freightButton.style.left = `${plusRect.right - parentRect.left + 10}px`;
    freightButton.style.top = `${plusRect.top - parentRect.top}px`;
    freightButton.style.height = `${buttonHeight}px`;
    freightButton.style.zIndex = '51';

    placeContainerButtonNextToWarehouse();
  }

  function styleFreightInlineButton(button) {
    button.style.boxSizing = 'border-box';
    button.style.minWidth = '120px';
    button.style.minHeight = '34px';
    button.style.padding = '0 14px';
    button.style.background = '#05cabe';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cabe';
    button.style.borderRadius = '4px';
    button.style.boxShadow = 'none';
    button.style.font = '800 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.lineHeight = '1';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';
    button.style.display = 'none';

    button.addEventListener('mouseenter', () => {
      button.style.background = '#04b5aa';
      button.style.borderColor = '#04b5aa';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#05cabe';
      button.style.borderColor = '#05cabe';
    });
  }

  function styleContainersInlineButton(button) {
    button.style.boxSizing = 'border-box';
    button.style.minWidth = '132px';
    button.style.minHeight = '34px';
    button.style.padding = '0 14px';
    button.style.background = '#05cabe';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cabe';
    button.style.borderRadius = '4px';
    button.style.boxShadow = 'none';
    button.style.font = '800 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.lineHeight = '1';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';
    button.style.display = 'none';

    button.addEventListener('mouseenter', () => {
      button.style.background = '#04b5aa';
      button.style.borderColor = '#04b5aa';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#05cabe';
      button.style.borderColor = '#05cabe';
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
    if (window.__lcFreightObserverStarted) return;

    window.__lcFreightObserverStarted = true;

    let lastDetectedSkuKey = '';

    const checkForChanges = () => {
      const panel = document.getElementById('lc-freight-panel');
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
      clearTimeout(window.__lcFreightMutationTimer);

      window.__lcFreightMutationTimer = setTimeout(() => {
        checkForChanges();
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
    if (document.getElementById('lc-freight-panel')) {
      placeFreightButtonNextToMemo();
      return;
    }

    const button = document.createElement('button');
    button.id = 'lc-freight-toggle';
    button.type = 'button';
    button.textContent = 'LC Freight';
    styleFreightInlineButton(button);

    const containerButton = document.createElement('button');
    containerButton.id = 'lc-containers-open';
    containerButton.type = 'button';
    containerButton.textContent = 'LC Containers';
    containerButton.title = 'Open the live container tracker';
    styleContainersInlineButton(containerButton);

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
        <button type="button" id="lc-use-cin7">Refresh freight with these quantities</button>
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
        <div id="lc-presale-freight-estimate"></div>
      </div>

      <div id="lc-product-details" class="lc-block"></div>

      <div id="lc-freight-status"></div>
    `;

    const styles = document.createElement('style');

    styles.textContent = `
      #lc-freight-panel {
        position: fixed;
        top: 72px;
        right: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        width: 360px;
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

      #lc-freight-panel.is-open {
        display: block;
      }

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

      .lc-detected-item {
        display: grid;
        grid-template-columns: 1fr 86px 64px;
        align-items: center;
        gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid #ebe7dc;
      }

      .lc-detected-item:last-child {
        border-bottom: 0;
      }

      .lc-detected-item span {
        font-weight: 800;
      }

      .lc-detected-item label {
        display: grid;
        grid-template-columns: 28px 1fr;
        align-items: center;
        gap: 4px;
        color: #637061;
        font-size: 12px;
        font-weight: 800;
      }

      .lc-remove-detected {
        min-height: 28px !important;
        padding: 4px 6px !important;
        background: #f9f8f2 !important;
        color: #1f2b24 !important;
        border: 1px solid #d9d6cc !important;
        border-radius: 6px !important;
        font-size: 11px !important;
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

      #lc-freight-panel .lc-detected-qty {
        min-height: 28px;
        padding: 4px 6px;
        text-align: center;
        border-radius: 6px;
      }

      #lc-freight-panel button:not(#lc-panel-close):not(.lc-remove-detected) {
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
      #lc-freight-method,
      #lc-presale-freight-estimate {
        grid-column: 1 / -1;
      }

      #lc-freight-result {
        font-weight: 800;
        font-size: 16px;
      }

      #lc-presale-freight-estimate {
        display: grid;
        gap: 3px;
        color: #405f54;
      }

      .lc-freight-note {
        font-size: 11px;
      }

      .lc-presale-pulse {
        color: #9a2d20;
        font-weight: 900;
        animation: lc-presale-pulse 1.5s ease-in-out infinite;
      }

      @keyframes lc-presale-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
      }

      #lc-freight-status {
        min-height: 20px;
        margin: 8px 10px 12px;
        color: #405f54;
      }

      #lc-freight-status.is-loading {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      #lc-freight-status.is-queued-update {
        position: relative;
        height: 24px;
        min-height: 24px;
        overflow: hidden;
      }

      #lc-freight-status.is-queued-update::before {
        content: '\\1F69A';
        position: absolute;
        left: 0;
        top: 1px;
        font-size: 16px;
        line-height: 1;
        animation: lc-truck-shuttle 1.35s ease-in-out infinite alternate;
      }

      #lc-freight-status.is-loading::before,
      .lc-spinner {
        content: '';
        display: inline-block;
        width: 13px;
        height: 13px;
        flex: 0 0 13px;
        box-sizing: border-box;
        border: 2px solid rgba(45, 92, 78, 0.22);
        border-top-color: #2d5c4e;
        border-radius: 50%;
        animation: lc-spin 0.85s linear infinite;
      }

      .lc-loading-line {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      @keyframes lc-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes lc-truck-shuttle {
        from { transform: translateX(0); }
        to { transform: translateX(54px); }
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
    document.body.append(button, containerButton, panel);

    button.addEventListener('click', () => {
      panel.classList.toggle('is-open');

      if (panel.classList.contains('is-open')) {
        state.lastAutoKey = '';
        renderDetectedDetails();
        scheduleAutoCin7Lookup(350);
      }
    });

    containerButton.addEventListener('click', () => {
      openContainersPopup();
    });

    panel.querySelector('#lc-panel-close').addEventListener('click', () => {
      panel.classList.remove('is-open');
    });

    panel.querySelector('#lc-use-cin7').addEventListener('click', () => {
      state.lastAutoKey = '';
      useCin7Details({ force: true });
    });

    panel.querySelector('#lc-manual-get').addEventListener('click', getManualFreight);

    panel.querySelector('#lc-add-product').addEventListener('click', () => {
      addManualProductRow();
    });

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

    panel.querySelector('#lc-auto-sku').addEventListener('input', event => {
      if (!event.target.classList.contains('lc-detected-qty')) return;

      state.lastAutoKey = '';
      scheduleAutoCin7Lookup(900);
    });

    panel.querySelector('#lc-auto-sku').addEventListener('click', event => {
      const removeButton = event.target.closest('.lc-remove-detected');

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
  document.addEventListener('DOMContentLoaded', boot);

  setInterval(() => {
    createPanel();
    placeFreightButtonNextToMemo();
  }, 5000);
})();
