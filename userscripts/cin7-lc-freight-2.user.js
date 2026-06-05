// ==UserScript==
// @name         Cin7 Living Culture Freight 2
// @namespace    livingculture
// @version      1.8
// @description  Living Culture freight panel test version 2 Lite for Cin7. Browser-side Shopify freight price first.
// @match        *://cin7.com/*
// @match        *://*.cin7.com/*
// @match        *://*.cin7.co/*
// @match        *://*.cin7core.com/*
// @match        *://*.dearsystems.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-lc-freight-2.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-lc-freight-2.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      livingculture.co.nz
// @connect      living-culture-freight.vercel.app
// ==/UserScript==

(function () {
  'use strict';

  const HOSTED_API_BASE = 'https://living-culture-freight.vercel.app';
  const SHOPIFY_BASE = 'https://livingculture.co.nz';
  const API_BASES = [HOSTED_API_BASE];
  const AUTO_FREIGHT_LOOKUP_ENABLED = false;

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
  const FREIGHT_TIMEOUT_MS = 45000;

  async function postJson(path, payload, options = {}) {
    const timeoutMs = options.timeoutMs || FREIGHT_TIMEOUT_MS;
    let lastError = null;

    for (const base of API_BASES) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const error = new Error(data.error || `Request failed (${response.status})`);
          error.response = response;
          error.data = data;
          throw error;
        }

        return {
          data,
          response,
          base
        };
      } catch (error) {
        lastError = error;

        if (error.name === 'AbortError') {
          lastError = new Error('Freight lookup is taking too long. Quote manually or try again in a moment.');
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new Error('Could not connect to freight service');
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function gmRequestJson(url, options = {}) {
    if (typeof GM_xmlhttpRequest !== 'function') {
      return Promise.reject(new Error('Tampermonkey browser request permission is not available.'));
    }

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        },
        data: options.body ? JSON.stringify(options.body) : undefined,
        timeout: options.timeoutMs || 25000,
        anonymous: false,
        onload(response) {
          const text = response.responseText || '';
          let data = {};

          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            data = {};
          }

          resolve({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            data,
            text
          });
        },
        ontimeout() {
          reject(new Error('Shopify cart request timed out.'));
        },
        onerror() {
          reject(new Error('Shopify cart request failed.'));
        }
      });
    });
  }

  function inferNewZealandRegion(city, postcode) {
    const cityRegions = new Map([
      ['auckland', 'Auckland'],
      ['hamilton', 'Waikato'],
      ['tauranga', 'Bay of Plenty'],
      ['rotorua', 'Bay of Plenty'],
      ['gisborne', 'Gisborne'],
      ['napier', 'Hawke’s Bay'],
      ['hastings', 'Hawke’s Bay'],
      ['new plymouth', 'Taranaki'],
      ['palmerston north', 'Manawatū-Whanganui'],
      ['wellington', 'Wellington'],
      ['nelson', 'Nelson'],
      ['blenheim', 'Marlborough'],
      ['christchurch', 'Canterbury'],
      ['dunedin', 'Otago'],
      ['invercargill', 'Southland']
    ]);
    const region = cityRegions.get(String(city || '').toLowerCase());
    if (region) return region;

    const postalNumber = Number.parseInt(postcode, 10);
    if (postalNumber >= 600 && postalNumber <= 2699) return 'Auckland';
    if (postalNumber >= 3000 && postalNumber <= 3199) return 'Bay of Plenty';
    if (postalNumber >= 3200 && postalNumber <= 3999) return 'Waikato';
    if (postalNumber >= 4000 && postalNumber <= 4099) return 'Gisborne';
    if (postalNumber >= 4100 && postalNumber <= 4299) return 'Hawke’s Bay';
    if (postalNumber >= 4300 && postalNumber <= 4399) return 'Taranaki';
    if (postalNumber >= 4400 && postalNumber <= 4999) return 'Manawatū-Whanganui';
    return '';
  }

  function parseShopifyShippingAddress(addressText) {
    const address = clean(addressText);
    const withoutCountry = address.replace(/,?\s*New Zealand$/i, '').trim();
    const postcode = withoutCountry.match(/\b(\d{4})\b/)?.[1] || '';
    const beforePostcode = postcode
      ? withoutCountry.slice(0, withoutCountry.lastIndexOf(postcode)).trim()
      : withoutCountry;
    const commaParts = beforePostcode.split(',').map(clean).filter(Boolean);

    if (commaParts.length >= 2) {
      const cityPart = commaParts.pop();
      const cityWords = cityPart.split(/\s+/);
      const city = cityWords.slice(Math.max(0, cityWords.length - 2)).join(' ');

      return {
        address1: commaParts.shift() || '',
        address2: commaParts.join(', '),
        city: city || cityPart,
        postcode,
        region: inferNewZealandRegion(city || cityPart, postcode)
      };
    }

    const tokens = beforePostcode.split(/\s+/).filter(Boolean);
    const knownCities = ['Whangarei', 'Auckland', 'Hamilton', 'Tauranga', 'Rotorua', 'Napier', 'Hastings', 'Wellington', 'Christchurch', 'Dunedin', 'Invercargill'];
    const cityIndex = tokens.findIndex(token => knownCities.some(city => city.toLowerCase() === token.toLowerCase()));
    const city = cityIndex >= 0 ? tokens[cityIndex] : '';

    return {
      address1: cityIndex > 0 ? tokens.slice(0, cityIndex).join(' ') : beforePostcode,
      address2: '',
      city,
      postcode,
      region: inferNewZealandRegion(city, postcode)
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
    return Boolean(element?.closest?.('#lc-freight-panel, #lc-freight2-panel, #lc-quote-memo-panel'));
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
    const status = document.getElementById('lc-freight2-status');
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

    const result = document.getElementById('lc-freight2-result');
    const methodBlock = document.getElementById('lc-freight2-method');
    const preSaleBlock = document.getElementById('lc2-presale-freight-estimate');

    if (result) {
      result.textContent = price ? `Freight: ${price}` : 'Freight: -';
    }

    if (methodBlock) {
      methodBlock.textContent = method || '';
    }

    if (preSaleBlock) {
      preSaleBlock.innerHTML = '';
    }
  }

  function setResultLoading() {
    state.price = '';
    state.priceNumber = '';
    state.method = '';

    const result = document.getElementById('lc-freight2-result');
    const methodBlock = document.getElementById('lc-freight2-method');
    const preSaleBlock = document.getElementById('lc2-presale-freight-estimate');

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
    const block = document.getElementById('lc2-product-details');
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
    const { data } = await postJson('/api/product-metrics', { items, price });
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
    const { data } = await postJson('/api/availability', { items });
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
        const block = document.getElementById('lc2-product-details');

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

  function findRequestedQuantity(product, freightItems) {
    const productSku = clean(product?.sku).toLowerCase();
    const bySku = freightItems.find(item => clean(item.sku).toLowerCase() === productSku);
    return normaliseQuantity(bySku?.quantity || product?.quantity || 1);
  }

  function pickShippingRate(rates) {
    const shippingRates = Array.isArray(rates) ? rates : [];
    return shippingRates.find(rate => /ship|freight|delivery/i.test(clean(rate.name || rate.title || rate.code))) || shippingRates[0];
  }

  function formatShopifyMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `$${number.toFixed(2)}` : '';
  }

  async function requestBrowserShopifyFreight(freightItems, address) {
    const prepared = await postJson('/api/prepare', {
      items: freightItems.map(item => ({
        sku: item.productUrl ? '' : item.sku,
        productUrl: item.productUrl || '',
        quantity: item.quantity || 1
      }))
    }, { timeoutMs: 30000 });
    const products = Array.isArray(prepared.data.products) ? prepared.data.products : [];
    const cartItems = products
      .map(product => ({
        id: product.variantId,
        quantity: findRequestedQuantity(product, freightItems)
      }))
      .filter(item => item.id && item.quantity > 0);

    if (!cartItems.length) {
      throw new Error('No Shopify variants found for freight products.');
    }

    const clearResponse = await gmRequestJson(`${SHOPIFY_BASE}/cart/clear.js`, {
      method: 'POST',
      timeoutMs: 15000
    });

    if (!clearResponse.ok) {
      throw new Error(clearResponse.data.description || clearResponse.data.message || `Browser Shopify /cart/clear.js failed (${clearResponse.status})`);
    }

    const addResponse = await gmRequestJson(`${SHOPIFY_BASE}/cart/add.js`, {
      method: 'POST',
      timeoutMs: 20000,
      body: { items: cartItems }
    });

    if (!addResponse.ok) {
      throw new Error(addResponse.data.description || addResponse.data.message || `Browser Shopify /cart/add.js failed (${addResponse.status})`);
    }

    const fields = parseShopifyShippingAddress(address);
    const params = new URLSearchParams();
    params.set('shipping_address[address1]', fields.address1 || '');
    params.set('shipping_address[address2]', fields.address2 || '');
    params.set('shipping_address[city]', fields.city || '');
    params.set('shipping_address[zip]', fields.postcode || '');
    params.set('shipping_address[province]', fields.region || '');
    params.set('shipping_address[country]', 'New Zealand');

    const ratesResponse = await gmRequestJson(`${SHOPIFY_BASE}/cart/shipping_rates.json?${params.toString()}`, {
      method: 'GET',
      timeoutMs: 20000
    });

    if (!ratesResponse.ok) {
      throw new Error(ratesResponse.data.description || ratesResponse.data.message || `Browser Shopify /cart/shipping_rates.json failed (${ratesResponse.status})`);
    }

    const rate = pickShippingRate(ratesResponse.data.shipping_rates);
    if (!rate) {
      throw new Error('No Shopify shipping rates returned.');
    }

    return {
      price: formatShopifyMoney(rate.price),
      method: clean(rate.name || rate.title || rate.code || 'Shipping'),
      browserCart: true,
      products
    };
  }

  async function requestHostedFreight(freightItems, address) {
    const firstItem = freightItems[0] || {};
    const firstIsUrl = /^https?:\/\/.+\/products\//i.test(firstItem.sku || firstItem.productUrl || '');
    const { data } = await postJson('/get-freight', {
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
      freightPriceOnly: true,
      quoteAvailableQuantityOnly: false,
      skipBrowserFallback: true,
      lite: true,
      address,
      selectedAddress: address
    });

    return data;
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

    let data;
    let browserError = null;

    try {
      data = await requestBrowserShopifyFreight(freightItems, address);
    } catch (error) {
      browserError = error;
      console.error('Browser Shopify freight failed:', error);
      data = await requestHostedFreight(freightItems, address).catch(hostedError => {
        hostedError.message = browserError?.message
          ? `${browserError.message}; hosted fallback: ${hostedError.message}`
          : hostedError.message;
        throw hostedError;
      });
    }

    if (!data.price) {
      throw new Error(data.error || 'No freight returned');
    }

    state.freightCache.set(cacheKey, data);

    return data;
  }

  function getEditedCin7Items() {
    const rows = Array.from(document.querySelectorAll('#lc2-auto-sku .lc-detected-item'));

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

    if (!AUTO_FREIGHT_LOOKUP_ENABLED) {
      renderDetectedDetails();
      return;
    }

    state.autoTimer = setTimeout(() => {
      const panel = document.getElementById('lc-freight2-panel');

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

    const skuBox = document.getElementById('lc2-auto-sku');
    const addressBox = document.getElementById('lc2-auto-address');

    if (skuBox) {
      const detectedItems = getItemsFromCin7()
        .filter(item => !state.excludedSkus.has(item.sku));

      const existingQty = new Map(
        Array.from(document.querySelectorAll('#lc2-auto-sku .lc-detected-item')).map(row => [
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
    const address = clean(document.getElementById('lc2-manual-address').value);

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
      renderProductDetails([], '');

      const data = await requestFreight({
        sku,
        items: requestedItems,
        address
      });

      if (!isCurrentLookup()) return false;

      setResult(data.price, data.method);
      setStatus(data.fromCache ? 'Freight loaded from recent lookup.' : 'Freight loaded.');
      renderProductDetails([], '');

      return true;
    } catch (error) {
      if (!isCurrentLookup()) return false;

      console.error(error);
      renderProductDetails([], '');

      setResult('', '');
      setStatus(error.message || 'Error getting freight.', true);
      return false;
    }
  }

  async function loadAddressSuggestions() {
    const items = getManualItems();
    const firstItem = items[0];
    const address = clean(document.getElementById('lc2-manual-address').value);
    const isUrl = /^https?:\/\/.+\/products\//i.test(firstItem?.sku || '');
    const list = document.getElementById('lc2-address-suggestions');

    state.selectedAddress = '';
    list.innerHTML = '';

    if (!firstItem || firstItem.sku.length < 2 || address.length < 4) return;

    try {
      setStatus('Getting address suggestions...');

      const { data } = await postJson('/address-suggestions', {
        sku: isUrl ? '' : firstItem.sku,
        productUrl: isUrl ? firstItem.sku : '',
        address
      });
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
    const skuBox = document.getElementById('lc2-auto-sku');
    const addressBox = document.getElementById('lc2-auto-address');

    if (!skuBox || !addressBox) return;

    const existingQty = new Map(
      Array.from(document.querySelectorAll('#lc2-auto-sku .lc-detected-item')).map(row => [
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
    const rows = document.getElementById('lc2-manual-products');
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

  function placeFreightButtonNextToMemo() {
    const freightButton = document.getElementById('lc-freight2-toggle');
    if (!freightButton) return;

    const memoButton = findQuoteMemoButton();

    if (!memoButton || !isVisible(memoButton)) {
      freightButton.style.display = 'none';
      return;
    }

    const memoRect = memoButton.getBoundingClientRect();
    const parent = memoButton.parentElement || memoButton.closest?.('div, section, fieldset') || document.body;
    const parentStyle = window.getComputedStyle(parent);

    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    if (freightButton.parentElement !== parent) {
      parent.appendChild(freightButton);
    }

    const parentRect = parent.getBoundingClientRect();

    freightButton.style.display = 'block';
    freightButton.style.position = 'absolute';
    freightButton.style.left = `${memoRect.right - parentRect.left + 8}px`;
    freightButton.style.top = `${memoRect.top - parentRect.top}px`;
    freightButton.style.height = `${Math.max(34, memoRect.height || 34)}px`;
    freightButton.style.zIndex = '51';
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

  function watchCin7QuoteChanges() {
    if (window.__lcFreight2ObserverStarted) return;

    window.__lcFreight2ObserverStarted = true;

    let lastDetectedSkuKey = '';

    const checkForChanges = () => {
      const panel = document.getElementById('lc-freight2-panel');
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
      clearTimeout(window.__lcFreight2MutationTimer);

      window.__lcFreight2MutationTimer = setTimeout(() => {
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
    if (document.getElementById('lc-freight2-panel')) {
      placeFreightButtonNextToMemo();
      return;
    }

    const button = document.createElement('button');
    button.id = 'lc-freight2-toggle';
    button.type = 'button';
    button.textContent = 'LC Freight 2';
    styleFreightInlineButton(button);

    const panel = document.createElement('div');
    panel.id = 'lc-freight2-panel';

    panel.innerHTML = `
      <div class="lc-hero">
        <div class="lc-hero-top">
          <img src="https://livingculture.co.nz/cdn/shop/files/logo_ec2b0c5e-42ca-4695-8c7e-43b344144c58.png?v=1675047511&width=220" alt="Living Culture" />
          <strong>Freight Costing</strong>
        </div>
        <p>Fast freight price only.</p>
        <button type="button" id="lc2-panel-close">×</button>
      </div>

      <div class="lc-block">
        <div class="lc-label">Detected from Cin7</div>
        <div><b>SKU:</b> <span id="lc2-auto-sku">-</span></div>
        <div><b>Address:</b> <span id="lc2-auto-address">-</span></div>
        <button type="button" id="lc2-use-cin7">Refresh freight with these quantities</button>
      </div>

      <div class="lc-block" id="lc2-manual-lookup-block">
        <div class="lc-label">Manual lookup</div>
        <div id="lc2-manual-products"></div>
        <button type="button" id="lc2-add-product">Add another product</button>
        <input id="lc2-manual-address" placeholder="Address" />
        <div id="lc2-address-suggestions"></div>
        <button type="button" id="lc2-manual-get">Get freight manually</button>
      </div>

      <div class="lc-block lc-result-block">
        <div id="lc-freight2-result">Freight: -</div>
        <div id="lc-freight2-method"></div>
        <div id="lc2-presale-freight-estimate"></div>
      </div>

      <div id="lc2-product-details" class="lc-block"></div>

      <div id="lc-freight2-status"></div>
    `;

    const styles = document.createElement('style');

    styles.textContent = `
      #lc-freight2-panel {
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

      #lc-freight2-panel.is-open {
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

      #lc2-panel-close {
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

      #lc2-manual-lookup-block {
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

      #lc-freight2-panel input {
        width: 100%;
        min-height: 36px;
        padding: 8px 10px;
        color: #1f2b24;
        background: #fff;
        border: 1px solid #d9d6cc;
        border-radius: 9px;
        font: inherit;
      }

      #lc-freight2-panel .lc-detected-qty {
        min-height: 28px;
        padding: 4px 6px;
        text-align: center;
        border-radius: 6px;
      }

      #lc-freight2-panel button:not(#lc2-panel-close):not(.lc-remove-detected) {
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

      #lc2-address-suggestions {
        display: grid;
        gap: 5px;
      }

      #lc2-address-suggestions .lc-suggestion {
        color: #1f2b24 !important;
        background: #f8f8f5 !important;
        border: 1px solid #ebe7dc !important;
        text-align: left;
        font-weight: 400 !important;
      }

      #lc-freight2-result,
      #lc-freight2-method,
      #lc2-presale-freight-estimate {
        grid-column: 1 / -1;
      }

      #lc-freight2-result {
        font-weight: 800;
        font-size: 16px;
      }

      #lc2-presale-freight-estimate {
        display: grid;
        gap: 3px;
        color: #405f54;
      }

      .lc-freight2-note {
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

      #lc-freight2-status {
        min-height: 20px;
        margin: 8px 10px 12px;
        color: #405f54;
      }

      #lc-freight2-status.is-loading {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      #lc-freight2-status.is-queued-update {
        position: relative;
        height: 24px;
        min-height: 24px;
        overflow: hidden;
      }

      #lc-freight2-status.is-queued-update::before {
        content: '\\1F69A';
        position: absolute;
        left: 0;
        top: 1px;
        font-size: 16px;
        line-height: 1;
        animation: lc-truck-shuttle 1.35s ease-in-out infinite alternate;
      }

      #lc-freight2-status.is-loading::before,
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

      #lc2-product-details {
        display: none;
        gap: 0;
      }

      #lc2-product-details.is-visible {
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

      if (panel.classList.contains('is-open')) {
        state.lastAutoKey = '';
        renderDetectedDetails();
        setStatus('Detected Cin7 details. Click refresh to get the freight price.');
      }
    });

    panel.querySelector('#lc2-panel-close').addEventListener('click', () => {
      panel.classList.remove('is-open');
    });

    panel.querySelector('#lc2-use-cin7').addEventListener('click', () => {
      state.lastAutoKey = '';
      useCin7Details({ force: true });
    });

    panel.querySelector('#lc2-manual-get').addEventListener('click', getManualFreight);

    panel.querySelector('#lc2-add-product').addEventListener('click', () => {
      addManualProductRow();
    });

    panel.querySelector('#lc2-address-suggestions').addEventListener('click', event => {
      const suggestion = event.target.closest('.lc-suggestion');

      if (!suggestion) return;

      state.selectedAddress = clean(suggestion.textContent);
      panel.querySelector('#lc2-manual-address').value = state.selectedAddress;
      setStatus('Address selected.');
    });

    panel.querySelector('#lc2-manual-address').addEventListener('input', () => {
      clearTimeout(state.addressTimer);
      state.addressTimer = setTimeout(loadAddressSuggestions, 700);
    });

    panel.querySelector('#lc2-manual-products').addEventListener('click', event => {
      if (!event.target.classList.contains('lc-remove-product')) return;

      const rows = panel.querySelectorAll('.lc-manual-product-row');

      if (rows.length <= 1) return;

      event.target.closest('.lc-manual-product-row').remove();
    });

    panel.querySelector('#lc2-manual-products').addEventListener('input', () => {
      clearTimeout(state.addressTimer);
      state.addressTimer = setTimeout(loadAddressSuggestions, 700);
    });

    panel.querySelector('#lc2-auto-sku').addEventListener('input', event => {
      if (!event.target.classList.contains('lc-detected-qty')) return;

      state.lastAutoKey = '';
      renderDetectedDetails();
      setStatus('Quantity changed. Click refresh to get the freight price.');
    });

    panel.querySelector('#lc2-auto-sku').addEventListener('click', event => {
      const removeButton = event.target.closest('.lc-remove-detected');

      if (!removeButton) return;

      const sku = clean(removeButton.dataset.sku);

      if (!sku) return;

      state.excludedSkus.add(sku);
      state.lastAutoKey = '';
      renderDetectedDetails();
      setStatus('Product removed. Click refresh to get the freight price.');
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
