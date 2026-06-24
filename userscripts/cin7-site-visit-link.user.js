// ==UserScript==
// @name         Living Culture Cin7 Site Visit Card (Popup)
// @namespace    https://livingculture.co.nz/
// @version      1.12.29
// @description  Adds Site Visit, Quote Review and HubSpot helper buttons to Cin7 simple sale pages.
// @author       Living Culture
// @match        https://inventory.dearsystems.com/Sale*
// @grant        GM_xmlhttpRequest
// @connect      living-culture-workflow.vercel.app
// @connect      living-culture-freight.vercel.app
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-site-visit-link.user.js?v=1.12.29
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-site-visit-link.user.js?v=1.12.29
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'lc-site-visit-inline-button-v2';
  const HUBSPOT_BUTTON_ID = 'lc-hubspot-deal-inline-button-v1';
  const QUOTE_REVIEW_BUTTON_ID = 'lc-quote-review-inline-button-v1';
  const ACTION_ROW_ID = 'lc-cin7-action-row-v1';
  const FLOATING_BAR_ID = 'lc-cin7-floating-actions-v1';
  const OVERLAY_ID = 'lc-site-visit-overlay-v2';
  const WORKFLOW_API_URL = 'https://living-culture-workflow.vercel.app/api/site-visits';
  const REP_OPTIONS_API_URL = 'https://living-culture-workflow.vercel.app/api/rep-options';
  const QUOTE_REVIEW_API_URL = 'https://living-culture-workflow.vercel.app/api/quote-reviews';
  const WORKFLOW_PLANNER_URL = 'https://living-culture-workflow.vercel.app/';
  const HUBSPOT_API_URL = 'https://living-culture-workflow.vercel.app/api/hubspot/create-deal';
  const API_KEY = '';
  const STATUSES = ['To be confirmed', 'Site Visit Confirmed', 'Completed', 'Hold'];
  const POPUP_STATUSES = ['To be confirmed', 'Site Visit Confirmed'];
  const VISIT_BY = ['', 'Ian', 'Steve', 'Jaine', 'Vitalii', 'Pakjira', 'Blair', 'James', 'Ian/Steve', 'Ian/Jaine', 'Ian/Vitalii', 'Ian/Pakjira', 'Vitalii/James', 'Blair/James'];
  const LC_BRANCHES = [
    ['', 'LC Branch'],
    ['AKL', 'AKL · Wairau'],
    ['PEN', 'PEN · Penrose'],
    ['CHCH', 'CHCH · Christchurch'],
    ['HAM', 'HAM · Hamilton'],
    ['TGA', 'TGA · Tauranga'],
    ['WHG', 'WHG · Whangarei'],
    ['NPE', 'NPE · Napier']
  ];
  let apiProductCache = [];
  let apiLineItemCache = [];
  let workflowRepOptions = [];
  let repOptionsLoadPromise = null;
  let siteVisitBookingsCache = { key: '', bookings: [] };
  let delegatedClickHandlerInstalled = false;
  let lastHandledAction = { id: '', at: 0 };
  const TIME_OPTIONS = (() => {
    const options = [''];
    for (let hour = 8; hour <= 20; hour += 1) {
      for (let minute = 0; minute < 60; minute += 30) {
        const isPm = hour >= 12;
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        const displayMinute = String(minute).padStart(2, '0');
        options.push(`${displayHour}:${displayMinute}${isPm ? 'pm' : 'am'}`);
      }
    }
    return options;
  })();

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function cleanMultiline(value) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeLabel(value) {
    return clean(value || '')
      .toLowerCase()
      .replace(/[*:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractOrderId(text) {
    const match = clean(text).match(/\bNZSO-\d+\b/i);
    return match ? match[0].toUpperCase() : '';
  }

  function deriveBranchFromRep(repName) {
    const raw = clean(repName);
    const code = raw.split('-')[0].trim().toUpperCase();
    if (!code) return '';
    if (code === 'NAP') return 'NPE';
    return LC_BRANCHES.some(([branchCode]) => branchCode === code) ? code : '';
  }

  function cleanProductLine(value) {
    let text = clean(value)
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
      .replace(/\b[0-9a-f]{12,}\b/gi, ' ')
      .replace(/\bnull\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const skuStart = text.match(/\b[A-Z]{2,5}\d{4,}(?:-\d+)?\b/);
    if (skuStart && typeof skuStart.index === 'number') {
      text = text.slice(skuStart.index);
    }

    const descOnly = text.match(/\b[A-Z]{2,5}\d{4,}(?:-\d+)?\s*:\s*(.+?)(?=\s+\b[A-Z]{2,5}\d{4,}(?:-\d+)?\s*:|$)/);
    if (descOnly && descOnly[1]) {
      text = clean(descOnly[1]);
    } else {
      text = text.replace(/^[A-Z]{2,5}\d{4,}(?:-\d+)?\s*:\s*/i, '').trim();
    }

    if (!text) return '';
    if (/^total:?$/i.test(text)) return '';
    if (/add more items|export|import|before tax|tax|discount|subtotal|total/i.test(text) && text.length < 48) return '';
    if (/^\d[\d\s,.-]*$/.test(text)) return '';
    return text;
  }

  function cleanQuantity(value) {
    const text = clean(value);
    if (!text) return '';
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return '';
    const number = Number(match[0]);
    if (!Number.isFinite(number) || number <= 0) return '';
    return Number.isInteger(number) ? String(number) : String(number).replace(/\.0+$/, '');
  }

  function productLineWithQuantity(productText, quantityText) {
    const product = cleanProductLine(productText);
    if (!product) return '';
    if (/^\d+(?:\.\d+)?\s*x\s+/i.test(product)) return product;
    const quantity = cleanQuantity(quantityText);
    return quantity ? `${quantity} x ${product}` : product;
  }

  function productCompareKey(value) {
    return cleanProductLine(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function parseNumberText(value) {
    const match = clean(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return '';
    const number = Number(match[0]);
    return Number.isFinite(number) ? String(number) : '';
  }

  function parseMoneyText(value) {
    const match = clean(value).replace(/,/g, '').match(/-?\d+(?:\.\d{1,4})?/);
    if (!match) return '';
    const number = Number(match[0]);
    return Number.isFinite(number) ? number.toFixed(2) : '';
  }

  function readObjectValue(object, names) {
    if (!object || typeof object !== 'object') return '';
    const entries = Object.entries(object);
    for (const wanted of names) {
      const found = entries.find(([key]) => key.toLowerCase() === wanted.toLowerCase());
      if (found && found[1] !== null && found[1] !== undefined) return found[1];
    }
    for (const wanted of names) {
      const found = entries.find(([key]) => key.toLowerCase().includes(wanted.toLowerCase()));
      if (found && found[1] !== null && found[1] !== undefined) return found[1];
    }
    return '';
  }

  function skuFromText(value) {
    const match = clean(value).match(/\b[A-Z]{1,8}\d{3,}(?:-\d+)?\b/);
    return match ? match[0].toUpperCase() : '';
  }

  function lineItemCompareKey(item) {
    return [
      clean(item?.sku).toUpperCase(),
      cleanProductLine(item?.name).toLowerCase()
    ].filter(Boolean).join('|');
  }

  function enrichLineItemsFromApi(items) {
    if (!apiLineItemCache.length) return items;
    if (items.length && items.every((item) => !clean(item.price) && !clean(item.total)) && apiLineItemCache.length === items.length) {
      return apiLineItemCache;
    }

    const apiByKey = new Map();
    apiLineItemCache.forEach((item) => {
      const key = lineItemCompareKey(item);
      if (key) apiByKey.set(key, item);
    });

    return items.map((item, index) => {
      const apiItem = apiByKey.get(lineItemCompareKey(item)) || apiLineItemCache[index] || {};
      return {
        ...item,
        price: clean(item.price) || clean(apiItem.price),
        total: clean(item.total) || clean(apiItem.total)
      };
    });
  }

  function tableHeaderMap(table) {
    const headerRow = Array.from(table.querySelectorAll('tr')).find((row) =>
      Array.from(row.querySelectorAll('th,td')).some((cell) => /product|description|quantity|price|total/i.test(cell.textContent || ''))
    );
    if (!headerRow) return {};

    return Array.from(headerRow.querySelectorAll('th,td')).reduce((map, cell, index) => {
      const label = normalizeLabel(cell.textContent || '');
      if (label) map[label] = index;
      return map;
    }, {});
  }

  function indexForHeader(headers, names) {
    for (const name of names) {
      if (typeof headers[name] === 'number') return headers[name];
    }
    const labels = Object.keys(headers);
    for (const label of labels) {
      if (names.some((name) => label.includes(name))) return headers[label];
    }
    return -1;
  }

  function cellText(cells, index) {
    if (index < 0 || !cells[index]) return '';
    const cell = cells[index];
    const control = cell.querySelector('input, textarea, select');
    return clean(
      control?.value ||
      control?.getAttribute('value') ||
      cell.getAttribute('title') ||
      cell.getAttribute('aria-label') ||
      cell.textContent ||
      ''
    );
  }

  function extractHubSpotLineItems() {
    const items = [];
    const tables = Array.from(document.querySelectorAll('table')).filter(isVisible);

    for (const table of tables) {
      const headers = tableHeaderMap(table);
      const productIndex = indexForHeader(headers, ['product', 'description']);
      const quantityIndex = indexForHeader(headers, ['quantity', 'qty']);
      const priceIndex = indexForHeader(headers, ['price', 'unit price']);
      const totalIndex = indexForHeader(headers, ['total', 'amount']);

      if (productIndex < 0 || quantityIndex < 0) continue;

      const rows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(isVisible);
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td,th'));
        if (cells.length <= Math.max(productIndex, quantityIndex)) continue;

        const rowText = clean(row.textContent || '');
        if (!rowText || /^(product|description)\b/i.test(rowText)) continue;
        if (/^total:?$/i.test(rowText) || /add more items|export|import/i.test(rowText)) continue;

        const productCell = cells[productIndex];
        const productLink = productCell?.querySelector('a');
        const rawName = productLink?.textContent ||
          productLink?.getAttribute('title') ||
          productLink?.getAttribute('aria-label') ||
          productCell?.textContent ||
          '';
        const name = cleanProductLine(rawName);
        const quantity = parseNumberText(cellText(cells, quantityIndex));
        const price = parseMoneyText(cellText(cells, priceIndex));
        const total = parseMoneyText(cellText(cells, totalIndex));
        const sku = skuFromText(rowText) || skuFromText(rawName);

        if (!name || !quantity) continue;
        if (/tax|discount|subtotal|total/i.test(name) && name.length < 30) continue;

        items.push({
          name,
          sku,
          quantity,
          price,
          total
        });
      }
    }

    const enrichedItems = items.length ? enrichLineItemsFromApi(items) : apiLineItemCache;

    const unique = [];
    const seen = new Set();
    for (const item of enrichedItems) {
      const key = [item.sku, item.name, item.quantity, item.price, item.total].map(clean).join('|').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique.slice(0, 30);
  }

  function lineItemsFromProductText(productText) {
    const lines = cleanMultiline(productText)
      .split('\n')
      .map(clean)
      .filter(Boolean);
    const items = [];

    for (const line of lines) {
      const quantityMatch = line.match(/^(\d+(?:\.\d+)?)\s*x\s+(.+)$/i);
      const quantity = quantityMatch ? cleanQuantity(quantityMatch[1]) || '1' : '1';
      const rawName = quantityMatch ? quantityMatch[2] : line;
      const name = cleanProductLine(rawName);
      if (!name) continue;
      items.push({
        name,
        sku: skuFromText(line),
        quantity,
        price: '',
        total: ''
      });
    }

    const unique = [];
    const seen = new Set();
    for (const item of items) {
      const key = [item.sku, item.name, item.quantity].map(clean).join('|').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique.slice(0, 30);
  }

  function extractQuoteProductLines() {
    const products = [];
    const tables = Array.from(document.querySelectorAll('table')).filter(isVisible);

    for (const table of tables) {
      const headerCells = Array.from(table.querySelectorAll('thead th, tr th'))
        .map((cell) => normalizeLabel(cell.textContent || ''));
      const hasProductHeader = headerCells.includes('product');
      const hasQuantityHeader = headerCells.includes('quantity');
      const hasPriceHeader = headerCells.includes('price');

      // Target the quote lines table shape only.
      if (!hasProductHeader || !hasQuantityHeader || !hasPriceHeader) continue;

      const rows = Array.from(table.querySelectorAll('tbody tr, tr'))
        .filter(isVisible);

      for (const row of rows) {
        const rowText = clean(row.textContent || '');
        if (!rowText) continue;
        if (/^total:?$/i.test(rowText) || /^add more items/i.test(rowText)) continue;
        if (/additional charges and services/i.test(rowText)) continue;

        const cells = Array.from(row.querySelectorAll('td,th'));
        const productColumnIndex = headerCells.indexOf('product');
        const quantityColumnIndex = headerCells.indexOf('quantity');
        const productCell = cells[productColumnIndex >= 0 ? productColumnIndex : 1] || row.querySelector('td:nth-child(2), th:nth-child(2)') || row.querySelector('td,th');
        const quantityCell = quantityColumnIndex >= 0 ? cells[quantityColumnIndex] : null;
        const productLink = productCell?.querySelector('a') || row.querySelector('a');
        const productText = productLineWithQuantity(
          productLink?.textContent ||
          productLink?.getAttribute('title') ||
          productLink?.getAttribute('aria-label') ||
          '',
          quantityCell?.textContent || ''
        );

        // Accept product lines that include a SKU prefix pattern in the visible row.
        if (!productText || !/\b[A-Z]{1,8}\d{3,}(?:-\d+)?\b/.test(rowText)) continue;
        products.push(productText);
      }
    }

    const unique = [];
    const seen = new Set();
    for (const line of products) {
      const cleaned = cleanProductLine(line);
      if (!cleaned) continue;
      const key = productCompareKey(cleaned);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(cleaned);
    }
    return unique.slice(0, 8);
  }

  function getAnchorBestProductText(anchor) {
    if (!anchor) return '';
    const candidates = [
      anchor.getAttribute('title'),
      anchor.getAttribute('aria-label'),
      anchor.dataset?.originalTitle,
      anchor.dataset?.title,
      anchor.textContent
    ];
    for (const candidate of candidates) {
      const line = cleanProductLine(candidate || '');
      if (line) return line;
    }
    return '';
  }

  function openPlannerWithCard(payload) {
    const params = new URLSearchParams();
    params.set('planner', 'site-visit');
    params.set('siteVisit', '1');
    params.set('tab', 'site-visit');
    params.set('view', 'site-visit');
    if (payload.lcBranch) params.set('siteVisitBranch', payload.lcBranch);
    if (payload.bookedDate) params.set('siteVisitDate', payload.bookedDate);
    if (payload.orderId) params.set('siteVisitOrderId', payload.orderId.toUpperCase());
    window.open(`${WORKFLOW_PLANNER_URL}?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  function extractProductLines() {
    const quoteProducts = extractQuoteProductLines();
    if (quoteProducts.length) return quoteProducts.join('\n');

    const products = [];

    // Primary: quote line anchors that usually look like "SKU: Description".
    const quoteAnchors = Array.from(document.querySelectorAll('table a'))
      .filter(isVisible)
      .map((anchor) => getAnchorBestProductText(anchor))
      .filter(Boolean);

    if (quoteAnchors.length) {
      quoteAnchors.forEach((line) => products.push(line));
    }

    const productHeaders = Array.from(document.querySelectorAll('th, td, div, span'))
      .filter(isVisible)
      .filter((node) => normalizeLabel(node.textContent || '') === 'product');

    for (const header of productHeaders) {
      const table = header.closest('table');
      if (!table) continue;

      const headerRow = header.closest('tr');
      if (!headerRow) continue;
      const headerCells = Array.from(headerRow.children);
      const productColumnIndex = headerCells.indexOf(header.closest('th, td'));
      if (productColumnIndex < 0) continue;

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      for (const row of rows) {
        if (!isVisible(row)) continue;
        const cells = Array.from(row.children);
        if (!cells[productColumnIndex]) continue;
        const cell = cells[productColumnIndex];

        const anchor = cell.querySelector('a');
        const raw = cleanProductLine(anchor ? getAnchorBestProductText(anchor) : cell.textContent || '');
        if (!raw) continue;

        products.push(raw);
      }
    }

    // Additional fallback: rows that contain SKU + product description in adjacent cells.
    if (!products.length) {
      const rows = Array.from(document.querySelectorAll('table tr')).filter(isVisible);
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td,th'));
        if (!cells.length) return;
        const rowText = clean(row.textContent || '');
        if (!/\b[A-Z]{1,8}\d{3,}(?:-\d+)?\b/.test(rowText)) return;

        const bestCell = cells
          .map((cell) => {
            const line = cleanProductLine(cell.textContent || '');
            return { line, len: line.length };
          })
          .filter((item) => item.line && item.len > 10)
          .sort((a, b) => b.len - a.len)[0];

        if (bestCell?.line) products.push(bestCell.line);
      });
    }

    // Fallback for editable line inputs if table selectors fail.
    if (!products.length) {
      const inputs = document.querySelectorAll(
        'input[placeholder*="product" i], input[placeholder*="description" i], textarea[placeholder*="description" i]'
      );
      inputs.forEach((node) => {
        if (!isVisible(node)) return;
        const value = cleanProductLine(node.value || '');
        if (!value) return;
        products.push(value);
      });
    }

    const unique = [];
    const seen = new Set();
    for (const line of products) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(line);
    }

    // If we still have nothing useful from DOM, allow API-captured lines as final fallback.
    if (!unique.length && apiProductCache.length) {
      return apiProductCache.join('\n');
    }

    return unique.slice(0, 8).join('\n');
  }

  function collectProductCandidatesFromObject(node, out) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((item) => collectProductCandidatesFromObject(item, out));
      return;
    }
    if (typeof node !== 'object') return;

    const keys = Object.keys(node);
    const keySet = new Set(keys.map((key) => key.toLowerCase()));
    const possibleLine =
      keySet.has('product') ||
      keySet.has('productname') ||
      keySet.has('itemname') ||
      keySet.has('description') ||
      keySet.has('itemdescription') ||
      keySet.has('sku') ||
      keySet.has('productsku');

    if (possibleLine) {
      const candidates = [
        node.ProductName,
        node.Product,
        node.ItemName,
        node.Description,
        node.ItemDescription,
        node.Comment,
        node.ProductDescription
      ];
      candidates.forEach((raw) => {
        const value = clean(raw);
        if (!value) return;
        if (/^total:?$/i.test(value)) return;
        if (/^\d[\d\s,.-]*$/.test(value)) return;
        if (/tax|discount|subtotal|total/i.test(value) && value.length < 30) return;
        if (!/[a-z]/i.test(value)) return;
        out.push(value);
      });
    }

    keys.forEach((key) => {
      collectProductCandidatesFromObject(node[key], out);
    });
  }

  function collectLineItemCandidatesFromObject(node, out) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((item) => collectLineItemCandidatesFromObject(item, out));
      return;
    }
    if (typeof node !== 'object') return;

    const keySet = new Set(Object.keys(node).map((key) => key.toLowerCase()));
    const hasProduct =
      keySet.has('product') ||
      keySet.has('productname') ||
      keySet.has('itemname') ||
      keySet.has('description') ||
      keySet.has('itemdescription') ||
      keySet.has('sku') ||
      keySet.has('productsku') ||
      keySet.has('productcode');
    const hasQuantity =
      keySet.has('quantity') ||
      keySet.has('qty') ||
      keySet.has('orderquantity') ||
      keySet.has('orderedquantity');

    if (hasProduct && hasQuantity) {
      const rawName = readObjectValue(node, [
        'ProductName',
        'Product',
        'ItemName',
        'Description',
        'ItemDescription',
        'ProductDescription',
        'Name'
      ]);
      const name = cleanProductLine(rawName);
      const quantity = cleanQuantity(readObjectValue(node, [
        'Quantity',
        'Qty',
        'OrderQuantity',
        'OrderedQuantity'
      ]));
      const price = parseMoneyText(readObjectValue(node, [
        'Price',
        'UnitPrice',
        'Unit Price',
        'SalePrice',
        'SellPrice',
        'Sale Price',
        'UnitCost',
        'Unit Cost'
      ]));
      const total = parseMoneyText(readObjectValue(node, [
        'Total',
        'LineTotal',
        'Line Total',
        'Amount',
        'Subtotal',
        'SubTotal'
      ]));
      const sku = clean(readObjectValue(node, [
        'SKU',
        'Sku',
        'ProductSKU',
        'ProductSku',
        'ProductCode',
        'Code'
      ])).toUpperCase() || skuFromText(rawName);

      if (name && quantity && (price || total)) {
        out.push({ name, sku, quantity, price, total });
      }
    }

    Object.keys(node).forEach((key) => {
      collectLineItemCandidatesFromObject(node[key], out);
    });
  }

  function extractProductsFromApiPayload(payload) {
    const candidates = [];
    collectProductCandidatesFromObject(payload, candidates);
    const unique = [];
    const seen = new Set();
    for (const rawLine of candidates) {
      const line = cleanProductLine(rawLine);
      if (!line) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(line);
    }
    return unique.slice(0, 8);
  }

  function extractLineItemsFromApiPayload(payload) {
    const candidates = [];
    collectLineItemCandidatesFromObject(payload, candidates);
    const unique = [];
    const seen = new Set();
    for (const item of candidates) {
      const key = [item.sku, item.name, item.quantity, item.price, item.total].map(clean).join('|').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique.slice(0, 30);
  }

  function inspectApiTextForProducts(text) {
    if (!text || typeof text !== 'string') return;
    if (text.length < 5 || text[0] !== '{' && text[0] !== '[') return;
    try {
      const json = JSON.parse(text);
      const products = extractProductsFromApiPayload(json);
      if (products.length) apiProductCache = products;
      const lineItems = extractLineItemsFromApiPayload(json);
      if (lineItems.length) apiLineItemCache = lineItems;
    } catch (error) {
      // Not JSON payload
    }
  }

  function hookNetworkForProductLines() {
    const nativeFetch = window.fetch;
    if (nativeFetch && !window.__lcSiteVisitFetchHooked) {
      window.__lcSiteVisitFetchHooked = true;
      window.fetch = async function patchedFetch(...args) {
        const response = await nativeFetch.apply(this, args);
        try {
          const url = String((args[0] && args[0].url) || args[0] || '');
          if (/sale|quote|order|advancedsale/i.test(url)) {
            response.clone().text().then(inspectApiTextForProducts).catch(() => {});
          }
        } catch (error) {
          // ignore
        }
        return response;
      };
    }

    if (!window.__lcSiteVisitXhrHooked) {
      window.__lcSiteVisitXhrHooked = true;
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__lcReqUrl = String(url || '');
        return open.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function patchedSend(...args) {
        this.addEventListener('load', function onLoad() {
          try {
            if (!/sale|quote|order|advancedsale/i.test(this.__lcReqUrl || '')) return;
            if (typeof this.responseText !== 'string') return;
            inspectApiTextForProducts(this.responseText);
          } catch (error) {
            // ignore
          }
        });
        return send.apply(this, args);
      };
    }
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function siteVisitBranchCode(value) {
    const raw = clean(value).toUpperCase();
    if (!raw) return '';
    return raw.split(/[\s/-]+/)[0] || '';
  }

  function parseSiteVisitTime(value) {
    const raw = clean(value).toLowerCase();
    const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3] || '';
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute >= 60) return null;
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour < 0 || hour > 23) return null;
    return (hour * 60) + minute;
  }

  function normaliseVisitorName(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function visitorNameParts(value) {
    const text = clean(value);
    if (!text) return [];
    return text
      .replace(/\band\b/gi, '/')
      .split(/[\/,&+]+/g)
      .map((part) => clean(part))
      .filter(Boolean);
  }

  function visitorNameKeys(value) {
    const text = clean(value);
    if (!text) return [];
    const keys = new Set();
    const parts = visitorNameParts(text);

    (parts.length ? parts : [text]).forEach((part) => {
      const full = normaliseVisitorName(part);
      const first = normaliseVisitorName(part.split(/\s+/)[0]);
      if (full) keys.add(full);
      if (first) keys.add(first);
    });

    return Array.from(keys);
  }

  function singleVisitByOptions() {
    const names = workflowRepOptions.length ? workflowRepOptions : VISIT_BY;
    const seen = new Set();
    return names
      .flatMap(visitorNameParts)
      .map(clean)
      .filter(Boolean)
      .filter((name) => {
        const key = normaliseVisitorName(name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => left.localeCompare(right));
  }

  function visitByOptions(exclude = '') {
    const excluded = normaliseVisitorName(exclude);
    return [''].concat(singleVisitByOptions().filter((name) => normaliseVisitorName(name) !== excluded));
  }

  function selectedVisitBy() {
    const first = clean(field('lcSvVisitBy')?.value || '');
    const second = clean(field('lcSvVisitBy2')?.value || '');
    return Array.from(new Set([first, second].filter(Boolean))).join(' / ');
  }

  function setSelectOptions(select, options, blankLabel, currentValue = '') {
    if (!select) return;
    select.innerHTML = options.map((value) => {
      const label = value || blankLabel;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    }).join('');
    if (options.includes(currentValue)) select.value = currentValue;
  }

  function refreshVisitBySelects() {
    const first = field('lcSvVisitBy');
    const second = field('lcSvVisitBy2');
    const firstValue = clean(first?.value || '');
    const secondValue = clean(second?.value || '');
    setSelectOptions(first, visitByOptions(secondValue), 'Visit by', firstValue);
    setSelectOptions(second, visitByOptions(first?.value || ''), 'Second rep (optional)', secondValue);
  }

  function loadRepOptions() {
    if (repOptionsLoadPromise) return repOptionsLoadPromise;
    repOptionsLoadPromise = new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: REP_OPTIONS_API_URL,
        onload: (response) => {
          try {
            const data = JSON.parse(response.responseText || '{}');
            const reps = Array.isArray(data.reps) ? data.reps.map(clean).filter(Boolean) : [];
            if (response.status >= 200 && response.status < 300 && reps.length) {
              workflowRepOptions = Array.from(new Set(reps)).sort((left, right) => left.localeCompare(right));
              refreshVisitBySelects();
            }
          } catch (_error) {
            // Keep the built-in fallback list if Workflow is not reachable or login is required.
          }
          resolve(workflowRepOptions);
        },
        onerror: () => resolve(workflowRepOptions)
      });
    });
    return repOptionsLoadPromise;
  }

  function sameVisitor(left, right) {
    const leftKeys = new Set(visitorNameKeys(left));
    if (!leftKeys.size) return false;
    return visitorNameKeys(right).some((key) => leftKeys.has(key));
  }

  function bookingBlocksSelectedVisitor(booking, selectedVisitBy) {
    if (!clean(selectedVisitBy)) return false;
    return sameVisitor(booking?.visitBy, selectedVisitBy);
  }

  function conflictBookingForTime(optionTime, bookings) {
    const optionStart = parseSiteVisitTime(optionTime);
    if (optionStart === null) return null;
    const optionEnd = optionStart + 120;
    return (bookings || []).find((booking) => {
      const bookedStart = parseSiteVisitTime(booking.time);
      if (bookedStart === null) return false;
      const bookedEnd = bookedStart + 120;
      return optionStart < bookedEnd && optionEnd > bookedStart;
    }) || null;
  }

  function hasBookingConflict(optionTime, bookings) {
    return Boolean(conflictBookingForTime(optionTime, bookings));
  }

  function bookingsCacheKey(date, branch, visitBy) {
    return `${clean(date)}|${siteVisitBranchCode(branch)}|${clean(visitBy)}`;
  }

  function fetchSiteVisitBookings(date, branch, visitBy) {
    const bookedDate = clean(date);
    const branchCode = siteVisitBranchCode(branch);
    const selectedVisitBy = clean(visitBy);
    if (!bookedDate) return Promise.resolve([]);
    const url = new URL(WORKFLOW_API_URL);
    url.searchParams.set('date', bookedDate);
    if (branchCode && !selectedVisitBy) url.searchParams.set('branch', branchCode);
    if (selectedVisitBy) url.searchParams.set('visitBy', selectedVisitBy);

    const headers = {};
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url.toString(),
        headers,
        onload: (response) => {
          try {
            const data = JSON.parse(response.responseText || '{}');
            if (response.status >= 200 && response.status < 300 && data.ok) {
              resolve(Array.isArray(data.bookings) ? data.bookings : []);
            } else {
              reject(new Error(data.error || `Booking lookup failed (${response.status}).`));
            }
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error('Could not connect to workflow API.'))
      });
    });
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findButtonByLabel(label) {
    return Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(isVisible)
      .find((element) => clean(element.textContent || '').toLowerCase() === label.toLowerCase());
  }

  function findCommentsAnchor() {
    const headings = Array.from(document.querySelectorAll('legend, label, h1, h2, h3, h4, div, span'))
      .filter(isVisible)
      .filter((node) => normalizeLabel(node.textContent || '') === 'comments');
    return headings[0] || null;
  }

  function removeQuoteReviewButton() {
    document.getElementById(QUOTE_REVIEW_BUTTON_ID)?.remove();
    const bar = document.getElementById(FLOATING_BAR_ID);
    if (bar && !bar.children.length) bar.remove();
  }

  function ensureActionRow() {
    let row = document.getElementById(ACTION_ROW_ID);
    if (row && document.body.contains(row)) return row;

    const commentsAnchor = findCommentsAnchor();
    if (!commentsAnchor) return null;

    row = document.createElement('div');
    row.id = ACTION_ROW_ID;
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr auto 1fr';
    row.style.alignItems = 'center';
    row.style.gap = '12px';
    row.style.margin = '0 0 10px 0';
    row.style.width = '100%';
    row.style.position = 'relative';
    row.style.zIndex = '2147483600';
    row.style.pointerEvents = 'auto';
    commentsAnchor.insertAdjacentElement('beforebegin', row);
    return row;
  }

  function placeActionButton(button, slot) {
    const row = ensureActionRow();
    if (!row || !button) return false;
    button.style.position = 'static';
    button.style.left = '';
    button.style.top = '';
    button.style.zIndex = '';
    button.style.marginLeft = '0';
    button.style.marginBottom = '0';
    button.style.pointerEvents = 'auto';
    button.style.boxShadow = '';
    button.style.justifySelf = slot === 'right' ? 'end' : slot === 'center' ? 'center' : 'start';
    button.style.gridColumn = slot === 'right' ? '3' : slot === 'center' ? '2' : '1';
    row.appendChild(button);
    return true;
  }

  function isSimpleSaleReady() {
    const text = clean(document.body?.textContent || '');
    if (!/Customer details/i.test(text)) return false;
    if (!/Accounting details/i.test(text)) return false;
    if (!/Shipping details/i.test(text)) return false;
    if (!/Comments/i.test(text)) return false;
    if (!findButtonByLabel('Quote')) return false;
    return true;
  }

  function readValueNearLabel(labelText) {
    const wanted = normalizeLabel(labelText);

    const fieldsets = Array.from(document.querySelectorAll('fieldset'))
      .filter(isVisible)
      .filter((fieldset) => {
        const legend = fieldset.querySelector('legend');
        return normalizeLabel(legend?.textContent || '') === wanted;
      });

    for (const fieldset of fieldsets) {
      const directControl = fieldset.querySelector('input:not([type="hidden"]), textarea, select');
      if (directControl) {
        const value = clean(directControl.value || directControl.getAttribute('value') || '');
        if (value) return value;
      }

      const displayNode = fieldset.querySelector('.select2-chosen, .chosen-container .chosen-single span, .k-input, .ui-select-match-text');
      if (displayNode) {
        const value = clean(displayNode.textContent || '');
        if (value && value !== 'choose...' && value !== 'type to search...') return value;
      }
    }

    const labels = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(isVisible)
      .filter((node) => normalizeLabel(node.textContent || '') === wanted);

    for (const label of labels) {
      const root = label.closest('fieldset, .row, .col, .form-group, .input-group, div');
      if (!root) continue;
      const controls = Array.from(root.querySelectorAll('input:not([type="hidden"]), textarea, select'));
      for (const control of controls) {
        const value = clean(control.value || control.getAttribute('value') || '');
        if (value) return value;
      }

      const displayNodes = root.querySelectorAll('.select2-chosen, .chosen-container .chosen-single span, .k-input, .ui-select-match-text');
      for (const node of displayNodes) {
        const value = clean(node.textContent || '');
        if (value && value !== 'choose...' && value !== 'type to search...') return value;
      }
    }
    return '';
  }

  function readMultilineNearLabel(labelText) {
    const wanted = normalizeLabel(labelText);

    const fieldsets = Array.from(document.querySelectorAll('fieldset'))
      .filter(isVisible)
      .filter((fieldset) => normalizeLabel(fieldset.querySelector('legend')?.textContent || '') === wanted);

    for (const fieldset of fieldsets) {
      const textarea = fieldset.querySelector('textarea');
      if (textarea) {
        const value = cleanMultiline(textarea.value || textarea.textContent || '');
        if (value) return value;
      }
    }

    const labels = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(isVisible)
      .filter((node) => normalizeLabel(node.textContent || '') === wanted);

    for (const label of labels) {
      const root = label.closest('fieldset, .row, .col, .form-group, .input-group, div');
      const textarea = root?.querySelector('textarea');
      if (!textarea) continue;
      const value = cleanMultiline(textarea.value || textarea.textContent || '');
      if (value) return value;
    }

    return readValueNearLabel(labelText);
  }

  function readCin7CommentsTextarea() {
    const commentsAnchor = findCommentsAnchor();
    if (!commentsAnchor) return readMultilineNearLabel('Comments');

    const anchorRect = commentsAnchor.getBoundingClientRect();
    const candidates = Array.from(document.querySelectorAll('textarea'))
      .filter(isVisible)
      .map((textarea) => ({ textarea, rect: textarea.getBoundingClientRect() }))
      .filter(({ rect }) => rect.top >= anchorRect.bottom - 2)
      .filter(({ rect }) => Math.abs(rect.left - anchorRect.left) < Math.max(80, anchorRect.width + 80))
      .sort((a, b) => {
        const topDiff = a.rect.top - b.rect.top;
        return Math.abs(topDiff) > 2 ? topDiff : a.rect.left - b.rect.left;
      });

    for (const { textarea } of candidates) {
      const value = cleanMultiline(textarea.value || textarea.textContent || '');
      if (value) return value;
    }

    return readMultilineNearLabel('Comments');
  }

  function readMoneyNearLabels(labels) {
    const moneyPattern = /(?:NZ)?\$\s*-?\d[\d,]*(?:\.\d{1,2})?|-?\d[\d,]*\.\d{2}/i;
    const moneyValue = (value) => {
      const match = clean(value).match(moneyPattern);
      if (!match) return null;
      const number = Number(match[0].replace(/[^\d.-]/g, ''));
      return Number.isFinite(number) ? { raw: match[0], number } : null;
    };
    const candidates = [];

    for (const label of labels) {
      const value = readValueNearLabel(label);
      const money = moneyValue(value);
      if (money) candidates.push(money);
    }

    const bodyText = document.body ? document.body.innerText : '';
    const lines = bodyText.split('\n').map(clean).filter(Boolean);
    const wantedLabels = labels.map(normalizeLabel);
    for (let index = 0; index < lines.length; index += 1) {
      const normalisedLine = normalizeLabel(lines[index]);
      if (!wantedLabels.some(label => normalisedLine === label || normalisedLine.startsWith(label))) continue;
      const nearby = lines.slice(index, index + 4).join(' ');
      const match = nearby.match(moneyPattern);
      if (match) {
        const money = moneyValue(match[0]);
        if (money) candidates.push(money);
      }
    }

    if (candidates.length) {
      return candidates
        .filter(candidate => candidate.number > 0)
        .sort((a, b) => b.number - a.number)[0]?.raw || candidates[0].raw;
    }

    const moneyMatches = bodyText.match(new RegExp(moneyPattern.source, 'gi')) || [];
    return moneyMatches.length ? moneyMatches.at(-1) : '';
  }

  function readPhoneNumber() {
    const labelled = readValueNearLabel('Phone') ||
      readValueNearLabel('Phone number') ||
      readValueNearLabel('Mobile') ||
      readValueNearLabel('Customer phone') ||
      readValueNearLabel('Contact phone');
    if (labelled) return labelled;

    const bodyText = document.body ? document.body.innerText : '';
    const lines = bodyText.split('\n').map(clean).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const label = normalizeLabel(lines[index]);
      if (!/^(phone|phone number|mobile|customer phone|contact phone)$/.test(label)) continue;
      const nearby = lines.slice(index, index + 4).join(' ');
      const match = nearby.match(/(?:\+?64|0)\s*(?:\d[\s().-]*){7,11}\d/);
      if (match) return clean(match[0]);
    }

    const match = bodyText.match(/(?:\+?64|0)\s*(?:\d[\s().-]*){7,11}\d/);
    return match ? clean(match[0]) : '';
  }

  function cin7Draft() {
    const address1 = readValueNearLabel('Shipping address line 1') || readValueNearLabel('Billing address line 1');
    const address2 = readValueNearLabel('Shipping address line 2') || readValueNearLabel('Billing address line 2');
    const reference = readValueNearLabel('Reference');
    const rep = readValueNearLabel('Sales rep');
    const pageText = document.body ? document.body.innerText : '';
    const titleOrderId = extractOrderId(document.title || '');
    const pageOrderId = extractOrderId(pageText);
    const referenceOrderId = extractOrderId(reference);
    const customerName = readValueNearLabel('Customer');
    const comments = readCin7CommentsTextarea();
    let productText = extractProductLines();
    if (productText && customerName && clean(productText).toLowerCase() === clean(customerName).toLowerCase()) {
      productText = '';
    }

    return {
      status: 'To be confirmed',
      bookedDate: localDateKey(),
      time: '',
      orderId: referenceOrderId || titleOrderId || pageOrderId || reference,
      placedBy: rep,
      visitBy: '',
      customerName,
      address: clean(`${address1} ${address2}`),
      phone: readPhoneNumber(),
      email: readValueNearLabel('Email'),
      product: productText,
      comments,
      area: deriveBranchFromRep(rep),
      sourceUrl: window.location.href
    };
  }

  function hubspotDraft() {
    const draft = cin7Draft();
    const amount = readMoneyNearLabels([
      'Invoice total',
      'Invoice amount',
      'Invoice value',
      'Amount',
      'Amount paid',
      'Grand total',
      'Order total',
      'Sale total',
      'Total after tax',
      'Total',
      'Total before tax'
    ]);
    const notes = readMultilineNearLabel('Quote memo') ||
      draft.comments ||
      readValueNearLabel('Shipping notes') ||
      readValueNearLabel('Memo') ||
      '';
    const structuredLineItems = extractHubSpotLineItems();
    const lineItems = structuredLineItems.length
      ? structuredLineItems
      : lineItemsFromProductText(draft.product);

    return {
      orderId: draft.orderId,
      saleNumber: draft.orderId,
      reference: readValueNearLabel('Reference') || draft.orderId,
      customerName: draft.customerName,
      email: draft.email,
      phone: draft.phone,
      address: draft.address,
      amount,
      total: amount,
      salesRep: draft.placedBy,
      product: draft.product,
      lineItems,
      notes,
      sourceUrl: draft.sourceUrl
    };
  }

  function copyTextToClipboard(text) {
    const value = clean(text);
    if (!value) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {});
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (error) {
      // Clipboard copy is a convenience only.
    }
    textarea.remove();
  }

  function hubspotLineItemSummary(lineItems) {
    const items = Array.isArray(lineItems) ? lineItems : [];
    if (!items.length) return '';
    return items.slice(0, 6).map((item) => {
      const quantity = clean(item.quantity) || '1';
      const name = clean(item.name);
      const price = clean(item.price);
      const total = clean(item.total);
      const money = price ? `$${price}` : total ? `total $${total}` : 'price missing';
      return `- ${quantity} x ${name}: ${money}`;
    }).join('\n');
  }

  function submitHubSpotDeal(button) {
    const payload = hubspotDraft();
    const lineItemDetails = hubspotLineItemSummary(payload.lineItems);
    const summary = [
      payload.orderId ? `Sale: ${payload.orderId}` : '',
      payload.customerName ? `Customer: ${payload.customerName}` : '',
      payload.phone ? `Phone: ${payload.phone}` : '',
      payload.amount ? `Amount: ${payload.amount}` : '',
      payload.lineItems?.length ? `Line items: ${payload.lineItems.length}` : '',
      lineItemDetails
    ].filter(Boolean).join('\n');

    if (!payload.customerName && !payload.email && !payload.phone) {
      window.alert('Customer name, email, or phone is required before creating a HubSpot deal.');
      return;
    }

    if (!window.confirm(`Create HubSpot deal?\n\n${summary || 'Cin7 sale details will be sent to HubSpot.'}`)) {
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending...';

    GM_xmlhttpRequest({
      method: 'POST',
      url: HUBSPOT_API_URL,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      onload: (response) => {
        let data = {};
        try {
          data = JSON.parse(response.responseText || '{}');
        } catch (error) {
          data = {};
        }

        if (response.status >= 200 && response.status < 300 && data.ok) {
          button.textContent = data.orderDealAssociated
            ? 'HubSpot Linked'
            : data.duplicate ? 'Already in HubSpot' : 'HubSpot Created';
          const message = data.duplicate
            ? `HubSpot deal already exists:\n${data.dealName || data.dealId}`
            : `HubSpot deal created:\n${data.dealName || data.dealId}`;
          if (data.hubspotUrl) {
            copyTextToClipboard(data.hubspotUrl);
            const linkStatus = data.orderDealAssociated
              ? 'DEAR deal linked.'
              : data.orderDealAssociation?.reason
                ? `DEAR deal not linked: ${data.orderDealAssociation.reason}.`
                : 'DEAR deal not linked.';
            const lineItemStatus = data.lineItems
              ? `Line items: ${data.lineItems.created || 0} added, ${data.lineItems.skipped || 0} already there${data.lineItems.errors?.length ? `, ${data.lineItems.errors.length} error(s): ${data.lineItems.errors[0]}` : ''}.`
              : '';
            window.alert(`${message}\n\n${linkStatus}${lineItemStatus ? `\n${lineItemStatus}` : ''}\n\nHubSpot link copied:\n${data.hubspotUrl}`);
          } else {
            window.alert(message);
          }
          window.setTimeout(() => {
            button.disabled = false;
            button.textContent = originalText;
          }, 2500);
          return;
        }

        button.disabled = false;
        button.textContent = originalText;
        window.alert(data.error || `HubSpot deal failed (${response.status}).`);
      },
      onerror: () => {
        button.disabled = false;
        button.textContent = originalText;
        window.alert('Could not connect to the HubSpot workflow API.');
      }
    });
  }

  function submitQuoteReview(button) {
    const payload = {
      ...hubspotDraft(),
      notes: ''
    };
    const summary = [
      payload.orderId ? `Quote: ${payload.orderId}` : '',
      payload.customerName ? `Customer: ${payload.customerName}` : '',
      payload.amount ? `Amount: ${payload.amount}` : '',
      payload.salesRep ? `Rep: ${payload.salesRep}` : ''
    ].filter(Boolean).join('\n');

    if (!payload.orderId && !payload.customerName) {
      window.alert('Quote number or customer name is required before sending a quote for review.');
      return;
    }

    if (!window.confirm(`Send quote for review?\n\n${summary || 'Cin7 quote details will be sent to Workflow.'}`)) {
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending...';

    GM_xmlhttpRequest({
      method: 'POST',
      url: QUOTE_REVIEW_API_URL,
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {})
      },
      data: JSON.stringify(payload),
      onload: (response) => {
        let data = {};
        try {
          data = JSON.parse(response.responseText || '{}');
        } catch (error) {
          data = {};
        }

        if (response.status >= 200 && response.status < 300 && data.ok) {
          button.textContent = data.duplicate ? 'Review Updated' : 'Review Sent';
          window.alert(
            data.duplicate
              ? `Quote review updated:\n${payload.orderId || payload.customerName || 'Cin7 quote'}`
              : `Quote review sent to Workflow:\n${payload.orderId || payload.customerName || 'Cin7 quote'}`
          );
          window.open(`${WORKFLOW_PLANNER_URL}?planner=quote-review`, '_blank', 'noopener,noreferrer');
          window.setTimeout(() => {
            button.disabled = false;
            button.textContent = originalText;
          }, 2500);
          return;
        }

        button.disabled = false;
        button.textContent = originalText;
        window.alert(data.error || `Quote review failed (${response.status}).`);
      },
      onerror: () => {
        button.disabled = false;
        button.textContent = originalText;
        window.alert('Could not connect to the Quote Review workflow API.');
      }
    });
  }

  function ensureStyles() {
    if (document.getElementById('lc-site-visit-style')) return;
    const style = document.createElement('style');
    style.id = 'lc-site-visit-style';
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:2147483645;display:none;align-items:center;justify-content:center;font-family:Arial,sans-serif}
      #${OVERLAY_ID}.open{display:flex}
      .lc-sv-panel{width:min(640px,94vw);max-height:92vh;background:#fff;border-radius:14px;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.35);border:1px solid #c9d6d3}
      .lc-sv-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #d9e3e1}
      .lc-sv-head h3{margin:0;font-size:28px;color:#20453f}
      .lc-sv-body{padding:14px 16px;display:grid;gap:10px}
      .lc-sv-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .lc-sv-field{display:grid;gap:5px}
      .lc-sv-field label{font-size:12px;font-weight:800;color:#2f675f}
      .lc-sv-field input,.lc-sv-field textarea,.lc-sv-field select{border:1px solid #b9c8c5;border-radius:8px;padding:9px 10px;font-size:14px;color:#2e2e2e}
      .lc-sv-field select option:disabled{color:#9b2d25;background:#fff0ee;font-weight:700}
      .lc-sv-field textarea{min-height:72px;resize:vertical}
      .lc-sv-time-wrap{position:relative}
      .lc-sv-time-button{width:100%;border:1px solid #b9c8c5;border-radius:8px;padding:9px 10px;background:#fff;color:#2e2e2e;font-size:14px;text-align:left;cursor:pointer}
      .lc-sv-time-menu{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:2147483647;max-height:310px;overflow:auto;background:#fff;border:1px solid #b9c8c5;border-radius:10px;box-shadow:0 14px 34px rgba(0,0,0,.22);padding:4px}
      .lc-sv-time-menu.open{display:grid;gap:2px}
      .lc-sv-time-option{border:0;border-radius:6px;background:#fff;color:#243c38;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;font-size:14px;text-align:left;cursor:pointer}
      .lc-sv-time-option:hover,.lc-sv-time-option.selected{background:#edf5f3}
      .lc-sv-time-option.unavailable{background:#fff0ee;color:#9b2d25;cursor:not-allowed;opacity:1;text-decoration:line-through}
      .lc-sv-time-option small{font-size:11px;font-weight:800;text-decoration:none}
      .lc-sv-actions{display:flex;gap:10px;padding-top:4px}
      .lc-sv-actions button{border:1px solid #b6c8c5;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer}
      .lc-sv-primary{background:#f3c42f;border-color:#f3c42f;color:#193d37;flex:1}
      .lc-sv-close{background:#fff;color:#305f58}
      .lc-sv-msg{font-size:12px;font-weight:700;min-height:16px}
      .lc-sv-msg.error{color:#9b2d25}
      .lc-sv-msg.ok{color:#2d7a45}
      @media (max-width:680px){.lc-sv-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function field(id) {
    return document.getElementById(id);
  }

  function setMessage(text, error) {
    const el = field('lcSvMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = `lc-sv-msg ${error ? 'error' : 'ok'}`;
  }

  function fillForm(data) {
    field('lcSvStatus').value = data.status || 'To be confirmed';
    field('lcSvDate').value = data.bookedDate || localDateKey();
    field('lcSvTime').value = data.time || '';
    field('lcSvOrder').value = data.orderId || '';
    field('lcSvPlacedBy').value = data.placedBy || '';
    refreshVisitBySelects();
    const visitors = visitorNameParts(data.visitBy || '');
    field('lcSvVisitBy').value = visitors[0] || '';
    refreshVisitBySelects();
    field('lcSvVisitBy2').value = visitors[1] || '';
    field('lcSvCustomer').value = data.customerName || '';
    field('lcSvAddress').value = data.address || '';
    field('lcSvPhone').value = data.phone || '';
    field('lcSvEmail').value = data.email || '';
    field('lcSvProduct').value = data.product || '';
    field('lcSvComments').value = data.comments || '';
    field('lcSvArea').value = data.area || '';
    updateSubmitButtonLabel();
    refreshSiteVisitBookings();
  }

  function formatDateForLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw;
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function updateSubmitButtonLabel() {
    const button = field('lcSvSubmitBtn');
    if (!button) return;
    const dateValue = field('lcSvDate')?.value || '';
    const timeValue = clean(field('lcSvTime')?.value || '');
    const dateText = formatDateForLabel(dateValue);
    const suffix = [dateText, timeValue].filter(Boolean).join(' · ');
    button.textContent = suffix ? `Book Site Visit (${suffix})` : 'Book Site Visit';
  }

  function timeConflictLabel(conflict) {
    if (!conflict) return '';
    const visitor = clean(conflict.visitBy);
    const order = clean(conflict.orderId);
    const customer = clean(conflict.customerName);
    if (visitor) return `${visitor} booked`;
    if (order) return `${order} booked`;
    if (customer) return `${customer} booked`;
    return 'booked';
  }

  function closeTimeMenu() {
    const menu = field('lcSvTimeMenu');
    const button = field('lcSvTimeButton');
    if (menu) menu.classList.remove('open');
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  function renderTimeOptions(bookings) {
    const timeInput = field('lcSvTime');
    const timeButton = field('lcSvTimeButton');
    const timeMenu = field('lcSvTimeMenu');
    if (!timeInput || !timeButton || !timeMenu) return;

    const selectedTime = clean(timeInput.value);
    timeButton.textContent = selectedTime || 'Time';
    timeMenu.innerHTML = TIME_OPTIONS.map((value) => {
      const display = value || 'Time TBC';
      const conflict = value ? conflictBookingForTime(value, bookings) : null;
      const disabled = Boolean(conflict);
      const reason = timeConflictLabel(conflict);
      const optionLabel = disabled ? `${display} unavailable` : display;
      return `
        <button
          type="button"
          class="lc-sv-time-option ${value === selectedTime ? 'selected' : ''} ${disabled ? 'unavailable' : ''}"
          data-lc-sv-time="${escapeHtml(value)}"
          ${disabled ? 'disabled' : ''}
          title="${disabled ? 'Unavailable for the selected visitor in this 2 hour site visit window.' : ''}">
          <span>${escapeHtml(optionLabel)}</span>
          ${disabled ? `<small>${escapeHtml(reason)}</small>` : ''}
        </button>
      `;
    }).join('');

    timeMenu.querySelectorAll('[data-lc-sv-time]').forEach((option) => {
      option.addEventListener('click', () => {
        timeInput.value = clean(option.dataset.lcSvTime || '');
        closeTimeMenu();
        updateSubmitButtonLabel();
      });
    });
  }

  function updateTimeOptionAvailability(bookings) {
    const timeInput = field('lcSvTime');
    if (!timeInput) return;
    const selectedTime = clean(timeInput.value);
    renderTimeOptions(bookings);
    if (selectedTime && hasBookingConflict(selectedTime, bookings)) {
      timeInput.value = '';
      renderTimeOptions(bookings);
      updateSubmitButtonLabel();
      setMessage('That time is unavailable for the selected visitor. Blocked times are marked in the Time dropdown.', true);
    }
  }

  function refreshSiteVisitBookings() {
    const dateValue = field('lcSvDate')?.value || localDateKey();
    const branchValue = field('lcSvArea')?.value || '';
    const visitByValue = selectedVisitBy();
    const key = bookingsCacheKey(dateValue, branchValue, visitByValue);
    if (siteVisitBookingsCache.key === key) {
      updateTimeOptionAvailability(siteVisitBookingsCache.bookings);
      return;
    }
    siteVisitBookingsCache = { key, bookings: [] };
    updateTimeOptionAvailability([]);
    setMessage('Checking booked site visit times...', false);
    fetchSiteVisitBookings(dateValue, branchValue, visitByValue)
      .then((bookings) => {
        if (siteVisitBookingsCache.key !== key) return;
        siteVisitBookingsCache = { key, bookings };
        updateTimeOptionAvailability(bookings);
        if (bookings.length) {
          setMessage(`${bookings.length} unavailable site visit time${bookings.length === 1 ? '' : 's'} found for this visitor.`, false);
        } else {
          setMessage('', false);
        }
      })
      .catch((error) => {
        if (siteVisitBookingsCache.key !== key) return;
        setMessage(error.message || 'Could not check existing site visit bookings.', true);
      });
  }

  function readForm() {
    return {
      status: clean(field('lcSvStatus').value),
      bookedDate: clean(field('lcSvDate').value) || localDateKey(),
      time: clean(field('lcSvTime').value),
      orderId: clean(field('lcSvOrder').value),
      placedBy: clean(field('lcSvPlacedBy').value),
      visitBy: selectedVisitBy(),
      customerName: clean(field('lcSvCustomer').value),
      address: clean(field('lcSvAddress').value),
      phone: clean(field('lcSvPhone').value),
      email: clean(field('lcSvEmail').value),
      product: clean(field('lcSvProduct').value),
      comments: clean(field('lcSvComments').value),
      lcBranch: clean(field('lcSvArea').value).toUpperCase(),
      area: clean(field('lcSvArea').value).toUpperCase(),
      sourceUrl: window.location.href
    };
  }

  function closePanel() {
    const overlay = field(OVERLAY_ID);
    if (overlay) overlay.classList.remove('open');
  }

  function submitSiteVisit(event) {
    event.preventDefault();
    const payload = readForm();
    if (!payload.customerName && !payload.orderId && !payload.address) {
      setMessage('Add customer, order ID, or address before save.', true);
      return;
    }
    if (payload.time && hasBookingConflict(payload.time, siteVisitBookingsCache.bookings)) {
      setMessage('That time is unavailable for the selected visitor. Choose another time from the Time dropdown.', true);
      return;
    }
    setMessage('Saving site visit card...', false);

    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

    GM_xmlhttpRequest({
      method: 'POST',
      url: WORKFLOW_API_URL,
      headers,
      data: JSON.stringify(payload),
      onload: (response) => {
        let data = {};
        try {
          data = JSON.parse(response.responseText || '{}');
        } catch (error) {
          const redirectedToLogin = response.finalUrl?.includes('/login') ||
            String(response.responseText || '').toLowerCase().includes('/login');
          setMessage(
            redirectedToLogin
              ? 'Workflow login required. Open the Workflow planner, log in, then save again.'
              : `Workflow API returned an unreadable response (${response.status}).`,
            true
          );
          return;
        }
        if (response.status >= 200 && response.status < 300 && data.ok) {
          setMessage(`Saved to Site Visit planner for ${payload.bookedDate || 'selected date'}.`, false);
          openPlannerWithCard(payload);
          window.setTimeout(closePanel, 700);
        } else {
          const loginRequired = response.status === 401 || response.status === 403 ||
            response.status === 307 || response.finalUrl?.includes('/login');
          setMessage(
            loginRequired
              ? 'Workflow login required. Open the Workflow planner, log in, then save again.'
              : data.error || `Save failed (${response.status}).`,
            true
          );
        }
      },
      onerror: () => setMessage('Could not connect to workflow API.', true)
    });
  }

  function ensureOverlay() {
    if (field(OVERLAY_ID)) return;
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="lc-sv-panel">
        <div class="lc-sv-head">
          <h3>New site visit card</h3>
        </div>
        <form id="lcSvForm" class="lc-sv-body">
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Visit By</label><select id="lcSvVisitBy"></select></div>
            <div class="lc-sv-field"><label>Second Rep</label><select id="lcSvVisitBy2"></select></div>
          </div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Status</label><select id="lcSvStatus">${POPUP_STATUSES.map((s) => `<option>${s}</option>`).join('')}</select></div>
            <div class="lc-sv-field"><label>LC Branch</label><select id="lcSvArea">${LC_BRANCHES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
          </div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Booked Date</label><input id="lcSvDate" type="date" /></div>
            <div class="lc-sv-field">
              <label>Time</label>
              <div class="lc-sv-time-wrap">
                <input id="lcSvTime" type="hidden" />
                <button type="button" class="lc-sv-time-button" id="lcSvTimeButton" aria-expanded="false">Time</button>
                <div class="lc-sv-time-menu" id="lcSvTimeMenu"></div>
              </div>
            </div>
          </div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Order ID</label><input id="lcSvOrder" /></div>
            <div class="lc-sv-field"><label>Placed By</label><input id="lcSvPlacedBy" /></div>
          </div>
          <div class="lc-sv-field"><label>Customer Name</label><input id="lcSvCustomer" /></div>
          <div class="lc-sv-field"><label>Address</label><textarea id="lcSvAddress"></textarea></div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Phone</label><input id="lcSvPhone" /></div>
            <div class="lc-sv-field"><label>Email</label><input id="lcSvEmail" /></div>
          </div>
          <div class="lc-sv-field"><label>Product</label><textarea id="lcSvProduct"></textarea></div>
          <div class="lc-sv-field"><label>Comments</label><textarea id="lcSvComments"></textarea></div>
          <div class="lc-sv-actions">
            <button type="submit" class="lc-sv-primary" id="lcSvSubmitBtn">Book Site Visit</button>
            <button type="button" class="lc-sv-close" id="lcSvCloseBtn">Close</button>
          </div>
          <div id="lcSvMsg" class="lc-sv-msg"></div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    field('lcSvCloseBtn').addEventListener('click', closePanel);
    field('lcSvForm').addEventListener('submit', submitSiteVisit);
    field('lcSvDate').addEventListener('change', () => {
      updateSubmitButtonLabel();
      refreshSiteVisitBookings();
    });
    field('lcSvArea').addEventListener('change', refreshSiteVisitBookings);
    field('lcSvVisitBy').addEventListener('change', () => {
      refreshVisitBySelects();
      refreshSiteVisitBookings();
    });
    field('lcSvVisitBy2').addEventListener('change', () => {
      refreshVisitBySelects();
      refreshSiteVisitBookings();
    });
    field('lcSvTimeButton').addEventListener('click', () => {
      const menu = field('lcSvTimeMenu');
      const button = field('lcSvTimeButton');
      const open = !menu.classList.contains('open');
      renderTimeOptions(siteVisitBookingsCache.bookings);
      menu.classList.toggle('open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    overlay.addEventListener('click', (event) => {
      if (field('lcSvTimeMenu')?.contains(event.target) || field('lcSvTimeButton') === event.target) return;
      closeTimeMenu();
      if (event.target === overlay) closePanel();
    });
    renderTimeOptions([]);
    refreshVisitBySelects();
    void loadRepOptions();
    updateSubmitButtonLabel();
  }

  function openPanel() {
    ensureOverlay();
    fillForm(cin7Draft());
    setMessage('', false);
    field(OVERLAY_ID).classList.add('open');
  }

  function shouldHandleAction(button) {
    const now = Date.now();
    if (lastHandledAction.id === button.id && now - lastHandledAction.at < 900) return false;
    lastHandledAction = { id: button.id, at: now };
    return true;
  }

  function handleActionButtonClick(button) {
    if (!button || button.disabled) return;
    if (!shouldHandleAction(button)) return;
    try {
      if (button.id === BUTTON_ID) {
        openPanel();
        return;
      }
      if (button.id === HUBSPOT_BUTTON_ID) {
        submitHubSpotDeal(button);
        return;
      }
      if (button.id === QUOTE_REVIEW_BUTTON_ID) {
        submitQuoteReview(button);
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error || 'Unknown error');
      console.error('[LC Cin7 buttons] Button action failed:', error);
      window.alert(`LC Cin7 button failed:\n\n${message}`);
    }
  }

  function ensureDelegatedClickHandler() {
    if (delegatedClickHandlerInstalled) return;
    delegatedClickHandlerInstalled = true;
    const handleEvent = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest(`#${BUTTON_ID}, #${HUBSPOT_BUTTON_ID}, #${QUOTE_REVIEW_BUTTON_ID}`);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      handleActionButtonClick(button);
    };
    ['pointerdown', 'mousedown', 'click'].forEach((eventName) => {
      document.addEventListener(eventName, handleEvent, true);
    });
  }

  function wireActionButton(button) {
    if (!button || button.dataset.lcActionWired === '1') return;
    button.dataset.lcActionWired = '1';
    const run = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleActionButtonClick(button);
    };
    ['pointerdown', 'mousedown', 'click'].forEach((eventName) => {
      button.addEventListener(eventName, run, true);
    });
    button.onclick = run;
  }

  function addButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const commentsAnchor = findCommentsAnchor();
    const installAnchor = findButtonByLabel('Install Fees') || findButtonByLabel('Scan');
    const anchor = commentsAnchor || installAnchor;
    if (!anchor) return;

    const rect = installAnchor ? installAnchor.getBoundingClientRect() : { height: 34 };
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Site Visit';
    button.style.background = '#05cbbf';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cbbf';
    button.style.borderRadius = '4px';
    button.style.padding = '0 14px';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.height = `${Math.max(34, rect.height || 34)}px`;
    button.style.lineHeight = '1';
    button.style.marginLeft = commentsAnchor ? '0' : '8px';
    button.style.marginBottom = commentsAnchor ? '10px' : '0';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';
    button.style.pointerEvents = 'auto';
    button.addEventListener('mouseenter', () => {
      button.style.background = '#04b5aa';
      button.style.borderColor = '#04b5aa';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = '#05cbbf';
      button.style.borderColor = '#05cbbf';
    });
    wireActionButton(button);
    if (commentsAnchor && placeActionButton(button, 'left')) {
      return;
    } else {
      anchor.insertAdjacentElement('afterend', button);
    }
  }

  function styleInlineButton(button, background = '#05cbbf') {
    button.style.background = background;
    button.style.color = '#fff';
    button.style.border = `1px solid ${background}`;
    button.style.borderRadius = '4px';
    button.style.padding = '0 14px';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.height = '34px';
    button.style.lineHeight = '1';
    button.style.marginLeft = '8px';
    button.style.marginBottom = '0';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';
    button.style.pointerEvents = 'auto';
    button.addEventListener('mouseenter', () => {
      if (button.disabled) return;
      button.style.filter = 'brightness(.92)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.filter = 'none';
    });
  }

  function addHubSpotButton() {
    if (document.getElementById(HUBSPOT_BUTTON_ID)) return;

    const siteVisitButton = document.getElementById(BUTTON_ID);
    const installAnchor = findButtonByLabel('Install Fees') || findButtonByLabel('Scan');
    const commentsAnchor = findCommentsAnchor();
    const anchor = siteVisitButton || installAnchor || commentsAnchor;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const button = document.createElement('button');
    button.id = HUBSPOT_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'HubSpot Deal';
    styleInlineButton(button, '#ff5c35');
    button.style.height = `${Math.max(34, rect.height || 34)}px`;
    wireActionButton(button);

    if (commentsAnchor && placeActionButton(button, 'right')) {
      return;
    } else if (commentsAnchor && anchor === commentsAnchor) {
      commentsAnchor.insertAdjacentElement('beforebegin', button);
    } else {
      anchor.insertAdjacentElement('afterend', button);
    }
  }

  function addQuoteReviewButton() {
    if (!isSimpleSaleReady()) {
      removeQuoteReviewButton();
      return;
    }

    const existingButton = document.getElementById(QUOTE_REVIEW_BUTTON_ID);
    const hubspotButton = document.getElementById(HUBSPOT_BUTTON_ID);
    const siteVisitButton = document.getElementById(BUTTON_ID);

    if (!hubspotButton || !siteVisitButton) {
      removeQuoteReviewButton();
      return;
    }

    if (existingButton) {
      placeActionButton(siteVisitButton, 'left');
      placeActionButton(existingButton, 'center');
      placeActionButton(hubspotButton, 'right');
      return;
    }

    const rect = siteVisitButton.getBoundingClientRect();
    const button = document.createElement('button');
    button.id = QUOTE_REVIEW_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Quote Review';
    styleInlineButton(button, '#f7c948');
    button.style.color = '#fff';
    button.style.borderColor = '#f0b429';
    button.style.textShadow = '0 1px 1px rgba(0,0,0,.28)';
    button.style.height = `${Math.max(34, rect.height || 34)}px`;
    wireActionButton(button);

    placeActionButton(siteVisitButton, 'left');
    placeActionButton(button, 'center');
    placeActionButton(hubspotButton, 'right');
  }

  let buttonPassScheduled = false;

  function runButtonPass() {
    buttonPassScheduled = false;
    addButton();
    addHubSpotButton();
    addQuoteReviewButton();
  }

  function scheduleButtonPass() {
    if (buttonPassScheduled) return;
    buttonPassScheduled = true;
    window.requestAnimationFrame(runButtonPass);
  }

  function boot() {
    ensureDelegatedClickHandler();
    scheduleButtonPass();
    setTimeout(scheduleButtonPass, 500);
    setTimeout(scheduleButtonPass, 1500);
    setTimeout(scheduleButtonPass, 3000);
    setTimeout(scheduleButtonPass, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  hookNetworkForProductLines();

  const observer = new MutationObserver(scheduleButtonPass);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', scheduleButtonPass);
})();
