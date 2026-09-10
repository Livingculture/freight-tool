// ==UserScript==
// @name         Cin7 Living Culture New Products Info Sheet
// @namespace    livingculture-cin7
// @version      0.1.4
// @description  Shows the Living Culture new-products spreadsheet in Cin7 Omni and Cin7 Core.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @match        https://*.cin7.com/*
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      *.googleusercontent.com
// @connect      livingculture.co.nz
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-new-products-info-sheet.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-new-products-info-sheet.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  'use strict';

  // Temporarily disabled until Living Culture approves release.
  const FEATURE_ENABLED = false;
  if (!FEATURE_ENABLED) return;

  const SHEET_ID = '1Y6r2-84sZYqtqDGKQwIWt9gT03BmjXloiuER8gHDqRY';
  const SHEET_GID = '2039854859';
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  const SHEET_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&range=A1:H&gid=${SHEET_GID}`;
  const SHEET_EDIT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`;
  const BUTTON_ID = 'lc-cin7-new-products-button';
  const CLEARANCE_BUTTON_ID = 'lc-omni-clearance-info-button';
  const PROMO_BUTTON_ID = 'lc-promo-summary-inline-button';
  const OVERLAY_ID = 'lc-cin7-new-products-overlay';
  const STYLE_ID = 'lc-cin7-new-products-styles';
  const CSV_CACHE_KEY = 'lcCin7NewProductsCsvV1';
  const CSV_TIME_KEY = 'lcCin7NewProductsCsvTimeV1';
  const IMAGE_CACHE_KEY = 'lcCin7NewProductsImagesV2';
  const VIEW_KEY = 'lcCin7NewProductsViewV1';
  const CACHE_MAX_AGE = 2 * 60 * 60 * 1000;
  let products = [];
  let loadingPromise = null;
  let imageCache = {};
  let imageCacheSaveTimer = null;
  const imageQueue = [];
  const imageRequests = new Map();
  let activeImageLoads = 0;
  const MAX_IMAGE_LOADS = 3;
  try { imageCache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}'); } catch (error) {}

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const normaliseImageUrl = (value) => {
    const url = clean(value);
    if (url.startsWith('//')) return `https:${url}`;
    return url.replace(/^http:\/\/(?:www\.)?livingculture\.co\.nz\//i, 'https://livingculture.co.nz/');
  };
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function addStyles() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{display:inline-flex;align-items:center!important;justify-content:center!important;height:36px!important;line-height:1!important;margin:0!important;padding:0 14px!important;border:1px solid #07988d!important;border-radius:4px!important;background:#07988d!important;color:#fff!important;font:700 14px Arial,sans-serif!important;white-space:nowrap!important;cursor:pointer!important;}
      #${BUTTON_ID}:hover{background:#067c73!important;}
      #${BUTTON_ID}.lc-new-floating{position:fixed!important;top:156px!important;right:18px!important;z-index:2147483000!important;box-shadow:0 3px 12px rgba(0,0,0,.22)!important;}
      #${OVERLAY_ID}{position:fixed!important;inset:0!important;z-index:2147483645!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:24px!important;background:rgba(8,24,45,.68)!important;font-family:Arial,sans-serif!important;color:#172b49!important;}
      #${OVERLAY_ID}[hidden]{display:none!important;}
      #${OVERLAY_ID} .np-sheet{display:flex!important;flex-direction:column!important;width:min(1650px,96vw)!important;height:min(920px,94vh)!important;overflow:hidden!important;border:1px solid #b9cbe0!important;border-radius:14px!important;background:#eef4fb!important;box-shadow:0 22px 60px rgba(0,0,0,.32)!important;}
      #${OVERLAY_ID} .np-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;padding:12px 18px!important;background:#fff!important;border-bottom:1px solid #c9d8e8!important;}
      #${OVERLAY_ID} h2{margin:0!important;color:#063b78!important;font-size:25px!important;}
      #${OVERLAY_ID} .np-subtitle{margin-top:4px!important;color:#526987!important;font-size:13px!important;}
      #${OVERLAY_ID} button,#${OVERLAY_ID} .np-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:36px!important;padding:0 14px!important;border:1px solid #8da9cc!important;border-radius:6px!important;background:#fff!important;color:#063b78!important;font-weight:700!important;text-decoration:none!important;cursor:pointer!important;}
      #${OVERLAY_ID} .np-primary{border-color:#063b78!important;background:#063b78!important;color:#fff!important;}
      #${OVERLAY_ID} .np-toolbar{display:grid!important;grid-template-columns:minmax(260px,1fr) auto auto auto!important;gap:8px!important;padding:10px 18px!important;background:#f7faff!important;border-bottom:1px solid #c9d8e8!important;}
      #${OVERLAY_ID} input,#${OVERLAY_ID} select{min-height:38px!important;border:1px solid #9fb5ce!important;border-radius:6px!important;background:#fff!important;color:#172b49!important;padding:0 11px!important;font:14px Arial,sans-serif!important;}
      #${OVERLAY_ID} .np-switch{display:flex!important;}
      #${OVERLAY_ID} .np-switch button{border-radius:0!important;}
      #${OVERLAY_ID} .np-switch button:first-child{border-radius:6px 0 0 6px!important;}
      #${OVERLAY_ID} .np-switch button:last-child{border-radius:0 6px 6px 0!important;margin-left:-1px!important;}
      #${OVERLAY_ID} .np-switch button.is-active{border-color:#07988d!important;background:#07988d!important;color:#fff!important;}
      #${OVERLAY_ID} .np-summary{display:flex!important;align-items:center!important;gap:10px!important;padding:7px 18px!important;color:#526987!important;font-size:13px!important;}
      #${OVERLAY_ID} .np-count{padding:5px 10px!important;border-radius:999px!important;background:#d9eff3!important;color:#075a68!important;font-weight:700!important;}
      #${OVERLAY_ID} .np-grid{flex:1 1 auto!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;grid-auto-rows:max-content!important;align-content:start!important;align-items:start!important;gap:9px!important;overflow:auto!important;padding:0 18px 18px!important;}
      #${OVERLAY_ID} .np-card{display:grid!important;grid-template-columns:112px minmax(0,1fr)!important;align-self:stretch!important;min-height:150px!important;height:auto!important;overflow:hidden!important;border:1px solid #c2d2e6!important;border-radius:8px!important;background:#fff!important;box-shadow:0 1px 5px rgba(13,48,87,.07)!important;}
      #${OVERLAY_ID} .np-image{display:flex!important;align-items:center!important;justify-content:center!important;height:150px!important;min-height:150px!important;max-height:150px!important;overflow:hidden!important;box-sizing:border-box!important;padding:5px!important;background:#fff!important;color:#8295ab!important;font-size:11px!important;text-align:center!important;}
      #${OVERLAY_ID} .np-image img{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important;}
      #${OVERLAY_ID} .np-info{display:flex!important;flex-direction:column!important;gap:6px!important;min-width:0!important;padding:9px!important;background:#fff!important;}
      #${OVERLAY_ID} h3{margin:0!important;color:#172b49!important;font-size:14px!important;line-height:1.25!important;}
      #${OVERLAY_ID} .np-badges{display:flex!important;flex-wrap:wrap!important;gap:5px!important;}
      #${OVERLAY_ID} .np-badge{display:inline-flex!important;padding:4px 8px!important;border-radius:999px!important;background:#dff3ea!important;color:#176445!important;font-size:11px!important;font-weight:700!important;}
      #${OVERLAY_ID} .np-badge.is-preorder{background:#fff0c7!important;color:#735613!important;}
      #${OVERLAY_ID} .np-sku{color:#526987!important;font-size:12px!important;font-weight:700!important;}
      #${OVERLAY_ID} .np-size{color:#334b66!important;font-size:12px!important;}
      #${OVERLAY_ID} .np-card-actions{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;margin-top:auto!important;}
      #${OVERLAY_ID} .np-card-actions a{color:#087f8c!important;font-size:13px!important;font-weight:700!important;}
      #${OVERLAY_ID} .np-grid.is-list{display:flex!important;flex-direction:column!important;gap:6px!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-card{grid-template-columns:64px minmax(0,1fr)!important;min-height:68px!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-image{width:64px!important;min-height:68px!important;height:68px!important;max-height:68px!important;padding:3px!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-image img{max-height:62px!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-info{display:grid!important;grid-template-columns:minmax(260px,1.7fr) minmax(125px,.7fr) minmax(145px,.7fr) minmax(130px,.7fr) auto!important;align-items:center!important;gap:10px!important;padding:7px 10px!important;}
      #${OVERLAY_ID} .np-grid.is-list h3{grid-column:1!important;grid-row:1!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-badges{grid-column:2!important;grid-row:1!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-sku{grid-column:3!important;grid-row:1!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-size{grid-column:4!important;grid-row:1!important;}
      #${OVERLAY_ID} .np-grid.is-list .np-card-actions{grid-column:5!important;grid-row:1!important;margin:0!important;}
      #${OVERLAY_ID} .np-empty{grid-column:1/-1!important;padding:70px 20px!important;border:1px dashed #9fb5ce!important;border-radius:10px!important;background:#fff!important;text-align:center!important;color:#526987!important;}
      @media(max-width:1350px){#${OVERLAY_ID} .np-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;}}
      @media(max-width:1050px){#${OVERLAY_ID} .np-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;}}
      @media(max-width:720px){#${OVERLAY_ID}{padding:0!important;}#${OVERLAY_ID} .np-sheet{width:100vw!important;height:100vh!important;border-radius:0!important;}#${OVERLAY_ID} .np-toolbar{grid-template-columns:1fr 1fr!important;}#${OVERLAY_ID} .np-toolbar input{grid-column:1/-1!important;}#${OVERLAY_ID} .np-grid{grid-template-columns:1fr!important;padding:0 12px 12px!important;}}
      @media print{body>*:not(#${OVERLAY_ID}){display:none!important;}#${OVERLAY_ID}{position:static!important;display:block!important;padding:0!important;background:#fff!important;}#${OVERLAY_ID} .np-sheet{width:100%!important;height:auto!important;border:0!important;box-shadow:none!important;}#${OVERLAY_ID} .np-toolbar,#${OVERLAY_ID} .np-head-actions{display:none!important;}#${OVERLAY_ID} .np-grid{grid-template-columns:repeat(2,1fr)!important;overflow:visible!important;}}
    `;
    document.head.appendChild(style);
  }

  function parseCsv(text) {
    const data = [];
    let row = [], cell = '', quoted = false;
    const source = String(text || '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '"' && quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if (char === '\n' && !quoted) { row.push(cell); if (row.some(clean)) data.push(row); row = []; cell = ''; }
      else cell += char;
    }
    row.push(cell); if (row.some(clean)) data.push(row);
    if (data.length < 2) return [];
    const headers = data[0].map(clean);
    return data.slice(1).map((cells, index) => {
      const item = Object.fromEntries(headers.map((header, column) => [header, clean(cells[column])]));
      const sku = item['CS Code'];
      const name = item['Product Name'];
      let eta = item.ETA;
      // Google Visualization treats text ETAs as blank when the same column also
      // contains dates. Restore the two text groups used by this sheet.
      if (!eta && /^CS2645[12]$/i.test(sku)) eta = 'In Stock';
      else if (!eta && !sku && name) eta = 'Pre-order';
      return { id: index, eta: eta || 'ETA pending', sku, name, size: item['Size/Color'], url: item['NZ Web Link'], image: item['Drive Link'] };
    }).filter((item) => item.name);
  }

  function request(url) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'GET', url, timeout: 20000,
      onload: (response) => response.status >= 200 && response.status < 300 ? resolve(response) : reject(new Error(`HTTP ${response.status}`)),
      onerror: () => reject(new Error('Network request failed')),
      ontimeout: () => reject(new Error('Network request timed out'))
    }));
  }

  async function loadProducts(force = false) {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const cached = localStorage.getItem(CSV_CACHE_KEY) || '';
      const age = Date.now() - Number(localStorage.getItem(CSV_TIME_KEY) || 0);
      if (!force && cached && age < CACHE_MAX_AGE) { products = parseCsv(cached); return { source: 'cached', age }; }
      try {
        let csv = '';
        let lastError;
        for (const url of [SHEET_URL, SHEET_GVIZ_URL]) {
          try {
            const response = await request(`${url}&_=${Date.now()}`);
            csv = response.responseText || '';
            if (/<!doctype|<html/i.test(csv.slice(0, 300))) throw new Error('Google returned HTML instead of CSV');
            if (!parseCsv(csv).length) throw new Error('No new products found');
            break;
          } catch (error) {
            csv = '';
            lastError = error;
          }
        }
        if (!csv) throw lastError || new Error('Google Sheet request failed');
        products = parseCsv(csv);
        localStorage.setItem(CSV_CACHE_KEY, csv);
        localStorage.setItem(CSV_TIME_KEY, String(Date.now()));
        return { source: 'live', age: 0 };
      } catch (error) {
        if (!cached) throw error;
        products = parseCsv(cached);
        return { source: 'cached-offline', age };
      }
    })().finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  function productCard(item) {
    const image = normaliseImageUrl(item.image || imageCache[item.url] || '');
    return `<article class="np-card" data-url="${escapeHtml(item.url)}" data-name="${escapeHtml(item.name)}">
      <div class="np-image">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" fetchpriority="low">` : '<span>Loading image…</span>'}</div>
      <div class="np-info"><div class="np-badges"><span class="np-badge ${/pre.?order/i.test(item.eta) ? 'is-preorder' : ''}">${escapeHtml(item.eta || 'New')}</span></div><h3>${escapeHtml(item.name)}</h3><div class="np-sku">${escapeHtml(item.sku || 'Code pending')}</div>${item.size ? `<div class="np-size">Size/colour: ${escapeHtml(item.size)}</div>` : '<div class="np-size"></div>'}<div class="np-card-actions">${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}</div></div>
    </article>`;
  }

  function saveImageCacheSoon() {
    window.clearTimeout(imageCacheSaveTimer);
    imageCacheSaveTimer = window.setTimeout(() => localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(imageCache)), 350);
  }

  function productDataUrl(rawUrl) {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/^(.*\/products\/[^/]+)/i);
    if (!match) return '';
    const variant = url.searchParams.get('variant');
    url.pathname = `${match[1]}.js`;
    url.search = variant ? `?variant=${encodeURIComponent(variant)}` : '';
    return url.href;
  }

  function resolveProductImage(card) {
    const url = card.dataset.url;
    if (!url) return Promise.resolve('');
    if (Object.prototype.hasOwnProperty.call(imageCache, url)) return Promise.resolve(normaliseImageUrl(imageCache[url]));
    if (imageRequests.has(url)) return imageRequests.get(url);
    const pending = (async () => {
      try {
        const dataUrl = productDataUrl(url);
        if (!dataUrl) throw new Error('Not a product page');
        const response = await request(dataUrl);
        const product = JSON.parse(response.responseText || '{}');
        const variantId = new URL(url).searchParams.get('variant');
        const variant = variantId && (product.variants || []).find((item) => String(item.id) === variantId);
        const image = normaliseImageUrl(variant?.featured_image?.src || product.featured_image || product.images?.[0] || '');
        imageCache[url] = image;
        saveImageCacheSoon();
        return image;
      } catch (error) {
        imageCache[url] = '';
        saveImageCacheSoon();
        return '';
      }
    })().finally(() => imageRequests.delete(url));
    imageRequests.set(url, pending);
    return pending;
  }

  function drainImageQueue() {
    while (activeImageLoads < MAX_IMAGE_LOADS && imageQueue.length) {
      const card = imageQueue.shift();
      if (!card?.isConnected || card.querySelector('img')) continue;
      activeImageLoads += 1;
      resolveProductImage(card).then((image) => {
        if (!card.isConnected) return;
        card.querySelector('.np-image').innerHTML = image
          ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(card.dataset.name)}" loading="lazy" decoding="async" fetchpriority="low">`
          : '<span>Image unavailable</span>';
      }).finally(() => {
        activeImageLoads -= 1;
        drainImageQueue();
      });
    }
  }

  function observeCards(grid) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      if (entry.target.querySelector('img')) return;
      imageQueue.push(entry.target);
      drainImageQueue();
    }), { root: grid, rootMargin: '180px' });
    grid.querySelectorAll('.np-card').forEach((card) => observer.observe(card));
  }

  function filteredProducts(overlay) {
    const query = clean(overlay.querySelector('[data-filter="search"]').value).toLowerCase();
    const eta = overlay.querySelector('[data-filter="eta"]').value;
    return products.filter((item) => (!query || Object.values(item).join(' ').toLowerCase().includes(query)) && (!eta || item.eta === eta));
  }

  function render(overlay) {
    const filtered = filteredProducts(overlay);
    const view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards';
    overlay.querySelector('.np-count').textContent = `${filtered.length} product${filtered.length === 1 ? '' : 's'}`;
    overlay.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    const grid = overlay.querySelector('.np-grid');
    grid.classList.toggle('is-list', view === 'list');
    grid.innerHTML = filtered.length ? filtered.map(productCard).join('') : '<div class="np-empty">No new products match these filters.</div>';
    observeCards(grid);
  }

  async function populate(overlay, force = false) {
    try {
      const result = await loadProducts(force);
      const etas = [...new Set(products.map((item) => item.eta).filter(Boolean))];
      overlay.querySelector('[data-filter="eta"]').innerHTML = '<option value="">All arrival dates</option>' + etas.map((eta) => `<option>${escapeHtml(eta)}</option>`).join('');
      overlay.querySelector('.np-source').textContent = result.source === 'live' ? 'Live spreadsheet data' : result.source === 'cached' ? `Cached ${Math.round(result.age / 60000)} minutes ago` : 'Cached data — spreadsheet temporarily unavailable';
      render(overlay);
    } catch (error) {
      overlay.querySelector('.np-source').textContent = 'Could not load the spreadsheet';
      overlay.querySelector('.np-grid').innerHTML = `<div class="np-empty">${escapeHtml(error.message || 'New products could not be loaded.')}</div>`;
    }
  }

  function createOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('section');
    overlay.id = OVERLAY_ID;
    overlay.hidden = true;
    overlay.innerHTML = `<div class="np-sheet" role="dialog" aria-modal="true" aria-label="Living Culture New Products">
      <header class="np-head"><div><h2>Living Culture New Products</h2><div class="np-subtitle">New and incoming products from the shared spreadsheet</div></div><div class="np-head-actions"><button type="button" data-action="refresh">Refresh data</button> <button type="button" data-action="print">Print / Save PDF</button> <button type="button" class="np-primary" data-action="close">Close</button></div></header>
      <div class="np-toolbar"><input data-filter="search" type="search" placeholder="Search product, code, size or colour…"><select data-filter="eta"><option value="">All arrival dates</option></select><div class="np-switch"><button type="button" data-view="cards">Cards</button><button type="button" data-view="list">List</button></div><a class="np-action" href="${SHEET_EDIT_URL}" target="_blank" rel="noopener noreferrer">Open spreadsheet</a></div>
      <div class="np-summary"><span class="np-count">Loading…</span><span class="np-source">Loading live spreadsheet data…</span></div><main class="np-grid"><div class="np-empty">Loading new products…</div></main>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay || event.target.closest('[data-action="close"]')) overlay.hidden = true;
      if (event.target.closest('[data-action="print"]')) window.print();
      if (event.target.closest('[data-action="refresh"]')) { overlay.querySelector('.np-source').textContent = 'Refreshing spreadsheet data…'; await populate(overlay, true); }
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) { localStorage.setItem(VIEW_KEY, viewButton.dataset.view); render(overlay); }
    });
    overlay.addEventListener('input', () => render(overlay));
    overlay.addEventListener('change', () => render(overlay));
    return overlay;
  }

  async function openNewProducts() {
    const overlay = createOverlay();
    overlay.hidden = false;
    if (!products.length) await populate(overlay);
    else render(overlay);
  }

  function visible(element) {
    return Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  }

  function isOmniQuotePage() {
    return location.hostname === 'go.cin7.com' && /\/Cloud\/TransactionEntry\/TransactionEntry\.aspx/i.test(location.pathname);
  }

  function mountButton() {
    if (!document.body) return;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'New Products';
      button.title = 'Open the Living Culture new-products information sheet';
      button.addEventListener('click', openNewProducts);
      document.body.appendChild(button);
    }

    if (isOmniQuotePage()) {
      const actions = document.getElementById('lc-omni-customer-photo-actions');
      if (actions && visible(actions)) {
        button.classList.remove('lc-new-floating');
        button.style.position = '';
        button.style.left = '';
        button.style.top = '';
        button.style.zIndex = '';
        const clearance = document.getElementById(CLEARANCE_BUTTON_ID);
        if (clearance?.parentElement === actions) clearance.insertAdjacentElement('afterend', button);
        else if (button.parentElement !== actions) actions.prepend(button);
        return;
      }
      if (button.parentElement !== document.body) document.body.appendChild(button);
      button.style.display = 'inline-flex';
      button.classList.add('lc-new-floating');
      return;
    }

    const anchor = document.getElementById(CLEARANCE_BUTTON_ID) || document.getElementById(PROMO_BUTTON_ID);
    if (!anchor || !visible(anchor) || !anchor.parentElement) { button.style.display = 'none'; return; }
    const parent = anchor.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    if (button.parentElement !== parent) parent.appendChild(button);
    const parentRect = parent.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    button.classList.remove('lc-new-floating');
    button.style.display = 'inline-flex';
    button.style.position = 'absolute';
    button.style.left = `${Math.round(anchorRect.right - parentRect.left + 8)}px`;
    button.style.top = `${Math.round(anchorRect.top - parentRect.top)}px`;
    button.style.height = `${Math.max(34, anchorRect.height || 34)}px`;
    button.style.zIndex = '2147483603';
  }

  function ensureUi() { addStyles(); mountButton(); }
  ensureUi();
  let recoveryTimer = null;
  const observer = new MutationObserver((mutations) => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay && !overlay.hidden) return;
    if (mutations.every((mutation) => mutation.target.closest?.(`#${OVERLAY_ID}`))) return;
    const button = document.getElementById(BUTTON_ID);
    if (button?.isConnected && visible(button)) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(ensureUi, 180);
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () => observer.observe(document.documentElement, { childList: true, subtree: true }), { once: true });
  window.setInterval(() => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay && !overlay.hidden) return;
    const button = document.getElementById(BUTTON_ID);
    if (isOmniQuotePage() && button?.isConnected) return;
    ensureUi();
  }, 2500);
  window.addEventListener('lc:cin7-toolbar-settling', () => {
    if (isOmniQuotePage()) return;
    const button = document.getElementById(BUTTON_ID);
    if (button) button.style.display = 'none';
  });
  window.addEventListener('lc:cin7-toolbar-ready', () => window.setTimeout(ensureUi, 60));
})();
