// ==UserScript==
// @name         Cin7 Living Culture Clearance Info Sheet
// @namespace    livingculture-omni
// @version      0.1.13
// @description  Shows a Living Culture clearance product information sheet in Cin7 Omni and Cin7 Core.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @match        https://*.cin7.com/*
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      *.googleusercontent.com
// @connect      livingculture.co.nz
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-clearance-info-sheet.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-clearance-info-sheet.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  'use strict';

  // Temporarily disabled until Living Culture approves release.
  const FEATURE_ENABLED = false;
  if (!FEATURE_ENABLED) return;

  const SHEET_ID = '1Y6r2-84sZYqtqDGKQwIWt9gT03BmjXloiuER8gHDqRY';
  const SHEET_GID = '2075613323';
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
  const SHEET_FALLBACK_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  const SHEET_EDIT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`;
  const STORE_URL = 'https://livingculture.co.nz';
  const BUTTON_ID = 'lc-omni-clearance-info-button';
  const PROMO_BUTTON_ID = 'lc-promo-summary-inline-button';
  const OVERLAY_ID = 'lc-omni-clearance-info-overlay';
  const STYLE_ID = 'lc-omni-clearance-info-styles';
  const CACHE_KEY = 'lcOmniClearanceSheetCsvV1';
  const CACHE_TIME_KEY = 'lcOmniClearanceSheetTimeV1';
  const IMAGE_CACHE_KEY = 'lcOmniClearanceProductImagesV1';
  const VIEW_KEY = 'lcOmniClearanceViewV1';
  const PRODUCT_OVERRIDES = {
    hornbilloutdoorsofaset: {
      image: 'https://cdn.shopify.com/s/files/1/0641/4555/5703/files/HornbillOutdoorSofaWithOttoman3PCS.jpg',
      url: 'https://livingculture.co.nz/products/hornbill-outdoor-sofa-with-ottoman-3pcs'
    },
    auron5mroundmarketumbrella: {
      image: 'https://cdn.shopify.com/s/files/1/0641/4555/5703/files/Auron_5m_Round_Market_Umbrella.jpg',
      url: 'https://livingculture.co.nz/products/auron-5m-round-market-umbrella'
    }
  };
  const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
  let rows = [];
  let loadingPromise = null;
  let imageCache = {};
  try { imageCache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}'); } catch (error) {}

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const compact = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function addStyles() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} { display:inline-flex; align-items:center!important; justify-content:center!important; height:36px!important; line-height:1!important; margin:0!important; padding:0 14px!important; border:1px solid #6f42c1!important; border-radius:4px!important; background:#6f42c1!important; color:#fff!important; font:700 14px Arial,sans-serif!important; white-space:nowrap!important; cursor:pointer!important; vertical-align:middle!important; }
      #${BUTTON_ID}:hover { background:#59339e!important; }
      #${BUTTON_ID}.lc-clearance-floating { position:fixed!important; top:112px!important; right:18px!important; z-index:2147483000!important; box-shadow:0 3px 12px rgba(0,0,0,.22)!important; }
      #${OVERLAY_ID} { position:fixed!important; inset:0!important; z-index:2147483645!important; display:flex!important; align-items:center!important; justify-content:center!important; padding:24px!important; background:rgba(8,24,45,.68)!important; font-family:Arial,sans-serif!important; color:#172b49!important; }
      #${OVERLAY_ID}[hidden] { display:none!important; }
      #${OVERLAY_ID} .lc-sheet { position:relative!important; display:flex!important; flex-direction:column!important; width:min(1500px,96vw)!important; height:min(920px,94vh)!important; overflow:hidden!important; border:1px solid #b9cbe0!important; border-radius:14px!important; background:#eef4fb!important; box-shadow:0 22px 60px rgba(0,0,0,.32)!important; }
      #${OVERLAY_ID} .lc-head { display:flex!important; align-items:center!important; justify-content:space-between!important; gap:14px!important; padding:12px 18px!important; background:#fff!important; border-bottom:1px solid #c9d8e8!important; }
      #${OVERLAY_ID} h2 { margin:0!important; color:#063b78!important; font-size:25px!important; }
      #${OVERLAY_ID} .lc-subtitle { margin-top:4px!important; color:#526987!important; font-size:13px!important; }
      #${OVERLAY_ID} button, #${OVERLAY_ID} .lc-action { display:inline-flex!important; align-items:center!important; justify-content:center!important; min-height:36px!important; padding:0 14px!important; border:1px solid #8da9cc!important; border-radius:6px!important; background:#fff!important; color:#063b78!important; font-weight:700!important; text-decoration:none!important; cursor:pointer!important; }
      #${OVERLAY_ID} .lc-primary { border-color:#063b78!important; background:#063b78!important; color:#fff!important; }
      #${OVERLAY_ID} .lc-toolbar { display:grid!important; grid-template-columns:minmax(240px,1fr) auto auto auto auto!important; gap:8px!important; padding:10px 18px!important; background:#f7faff!important; border-bottom:1px solid #c9d8e8!important; }
      #${OVERLAY_ID} .lc-view-switch { display:flex!important; align-items:center!important; gap:0!important; }
      #${OVERLAY_ID} .lc-view-switch button { min-height:38px!important; border-radius:0!important; }
      #${OVERLAY_ID} .lc-view-switch button:first-child { border-radius:6px 0 0 6px!important; }
      #${OVERLAY_ID} .lc-view-switch button:last-child { border-radius:0 6px 6px 0!important; margin-left:-1px!important; }
      #${OVERLAY_ID} .lc-view-switch button.is-active { border-color:#6f42c1!important; background:#6f42c1!important; color:#fff!important; }
      #${OVERLAY_ID} input, #${OVERLAY_ID} select { min-height:38px!important; border:1px solid #9fb5ce!important; border-radius:6px!important; background:#fff!important; color:#172b49!important; padding:0 11px!important; font:14px Arial,sans-serif!important; }
      #${OVERLAY_ID} .lc-summary { display:flex!important; align-items:center!important; gap:10px!important; padding:7px 18px!important; color:#526987!important; font-size:13px!important; }
      #${OVERLAY_ID} .lc-count { padding:5px 10px!important; border-radius:999px!important; background:#d9eff3!important; color:#075a68!important; font-weight:700!important; }
      #${OVERLAY_ID} .lc-grid { flex:1 1 auto!important; display:grid!important; grid-template-columns:repeat(4,minmax(0,1fr))!important; grid-auto-rows:max-content!important; align-content:start!important; align-items:start!important; gap:9px!important; overflow:auto!important; padding:0 18px 18px!important; }
      #${OVERLAY_ID} .lc-card { display:grid!important; grid-template-columns:120px minmax(0,1fr)!important; align-self:stretch!important; min-height:158px!important; height:auto!important; max-height:none!important; overflow:hidden!important; border:1px solid #c2d2e6!important; border-radius:8px!important; background:#fff!important; box-shadow:0 1px 5px rgba(13,48,87,.07)!important; }
      #${OVERLAY_ID} .lc-image { display:flex!important; align-items:center!important; justify-content:center!important; min-height:158px!important; padding:5px!important; background:#fff!important; color:#8295ab!important; font-size:11px!important; text-align:center!important; }
      #${OVERLAY_ID} .lc-image img { display:block!important; width:100%!important; height:auto!important; max-height:168px!important; object-fit:contain!important; }
      #${OVERLAY_ID} .lc-info { display:flex!important; flex-direction:column!important; gap:5px!important; min-width:0!important; height:auto!important; max-height:none!important; overflow:visible!important; padding:9px!important; background:#fff!important; }
      #${OVERLAY_ID} .lc-badges { display:flex!important; flex-wrap:wrap!important; gap:6px!important; }
      #${OVERLAY_ID} .lc-badge { display:inline-flex!important; padding:4px 8px!important; border-radius:999px!important; background:#e8f1fb!important; color:#063b78!important; font-size:11px!important; font-weight:700!important; }
      #${OVERLAY_ID} .lc-badge.is-evergreen { background:#dff3ea!important; color:#176445!important; }
      #${OVERLAY_ID} .lc-badge.is-promo { background:#fff0c7!important; color:#735613!important; }
      #${OVERLAY_ID} .lc-discount { background:#d9eff3!important; color:#075a68!important; }
      #${OVERLAY_ID} h3 { margin:0!important; color:#172b49!important; font-size:14px!important; line-height:1.25!important; }
      #${OVERLAY_ID} .lc-price { display:flex!important; flex-wrap:wrap!important; gap:12px!important; font-size:13px!important; }
      #${OVERLAY_ID} .lc-price strong { color:#063b78!important; }
      #${OVERLAY_ID} .lc-reason { color:#334b66!important; font-size:13px!important; line-height:1.4!important; }
      #${OVERLAY_ID} .lc-note { padding:7px 9px!important; border-left:3px solid #08a6bc!important; background:#f0fafb!important; color:#334b66!important; font-size:12px!important; }
      #${OVERLAY_ID} .lc-card-actions { display:flex!important; align-items:center!important; justify-content:space-between!important; gap:8px!important; margin-top:auto!important; }
      #${OVERLAY_ID} .lc-card-actions a { color:#087f8c!important; font-size:13px!important; font-weight:700!important; }
      #${OVERLAY_ID} .lc-owner { color:#7a8ca1!important; font-size:11px!important; }
      #${OVERLAY_ID} .lc-grid.is-list { display:flex!important; flex-direction:column!important; gap:6px!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-card { grid-template-columns:64px minmax(0,1fr)!important; min-height:68px!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-image { width:64px!important; min-height:68px!important; height:68px!important; padding:3px!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-image img { max-height:62px!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-info { display:grid!important; grid-template-columns:minmax(220px,1.7fr) minmax(145px,.8fr) minmax(135px,.7fr) minmax(210px,1.3fr) auto!important; align-items:center!important; gap:10px!important; padding:7px 10px!important; }
      #${OVERLAY_ID} .lc-grid.is-list h3 { grid-column:1!important; grid-row:1!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-badges { grid-column:2!important; grid-row:1!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-price { grid-column:3!important; grid-row:1!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-reason { grid-column:4!important; grid-row:1!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-note { display:none!important; }
      #${OVERLAY_ID} .lc-grid.is-list .lc-card-actions { grid-column:5!important; grid-row:1!important; margin:0!important; }
      #${OVERLAY_ID} .lc-empty { grid-column:1/-1!important; padding:70px 20px!important; border:1px dashed #9fb5ce!important; border-radius:10px!important; background:#fff!important; text-align:center!important; color:#526987!important; }
      @media(max-width:1350px){ #${OVERLAY_ID} .lc-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;} }
      @media(max-width:1050px){ #${OVERLAY_ID} .lc-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;} #${OVERLAY_ID} .lc-toolbar{grid-template-columns:1fr auto auto!important;} }
      @media(max-width:720px){ #${OVERLAY_ID}{padding:0!important;} #${OVERLAY_ID} .lc-sheet{width:100vw!important;height:100vh!important;border-radius:0!important;} #${OVERLAY_ID} .lc-toolbar{grid-template-columns:1fr 1fr!important;} #${OVERLAY_ID} .lc-toolbar input{grid-column:1/-1!important;} #${OVERLAY_ID} .lc-grid{grid-template-columns:1fr!important;padding:0 12px 12px!important;} }
      @media print { body > *:not(#${OVERLAY_ID}){display:none!important;} #${OVERLAY_ID}{position:static!important;display:block!important;padding:0!important;background:#fff!important;} #${OVERLAY_ID} .lc-sheet{width:100%!important;height:auto!important;border:0!important;box-shadow:none!important;} #${OVERLAY_ID} .lc-toolbar,#${OVERLAY_ID} .lc-head-actions{display:none!important;} #${OVERLAY_ID} .lc-grid{display:grid!important;grid-template-columns:repeat(2,1fr)!important;overflow:visible!important;} #${OVERLAY_ID} .lc-card{break-inside:avoid!important;} }
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
    return data.slice(1).map((cells, index) => Object.fromEntries(headers.map((header, column) => [header, clean(cells[column])]))).map((item, index) => ({
      id: index,
      status: item.Status,
      owner: item.Owner,
      name: item['Category / Products Name / SKUs'],
      rrp: item.RRP,
      clearancePrice: item['Clearance Price'],
      discount: item['Discount %'],
      reason: item['Reason for Clearance'],
      note: item.Note
    })).filter((item) => item.name);
  }

  function request({ url, responseType = 'text' }) {
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: 'GET', url, responseType, timeout: 20000,
      onload: (response) => response.status >= 200 && response.status < 300 ? resolve(response) : reject(new Error(`HTTP ${response.status}`)),
      onerror: () => reject(new Error('Network request failed')),
      ontimeout: () => reject(new Error('Network request timed out'))
    }));
  }

  async function loadRows(force = false) {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      const cached = localStorage.getItem(CACHE_KEY) || '';
      const age = Date.now() - Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
      if (!force && cached && age < CACHE_MAX_AGE) {
        rows = parseCsv(cached);
        return { source: 'cached', age };
      }
      try {
        let csv = '';
        let lastError;
        for (const url of [SHEET_URL, SHEET_FALLBACK_URL]) {
          try {
            const response = await request({ url: `${url}&_=${Date.now()}` });
            csv = response.responseText || '';
            if (/<!doctype|<html/i.test(csv.slice(0, 300))) throw new Error('Google returned HTML instead of CSV');
            if (!parseCsv(csv).length) throw new Error('No clearance products found');
            break;
          } catch (error) {
            csv = '';
            lastError = error;
          }
        }
        if (!csv) throw lastError || new Error('Google Sheet request failed');
        const parsed = parseCsv(csv);
        if (!parsed.length) throw new Error('No clearance products found');
        rows = parsed;
        localStorage.setItem(CACHE_KEY, csv);
        localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
        return { source: 'live', age: 0 };
      } catch (error) {
        if (!cached) throw error;
        rows = parseCsv(cached);
        return { source: 'cached-offline', age };
      }
    })().finally(() => { loadingPromise = null; });
    return loadingPromise;
  }

  function money(value) {
    if (!clean(value)) return '';
    const number = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD' }) : value;
  }

  function searchUrl(name) {
    return `${STORE_URL}/search?q=${encodeURIComponent(name)}`;
  }

  function cardHtml(item) {
    const cached = imageCache[compact(item.name)] || {};
    const statusClass = /evergreen/i.test(item.status) ? 'is-evergreen' : /promo/i.test(item.status) ? 'is-promo' : '';
    return `
      <article class="lc-card" data-product-id="${item.id}" data-product-name="${escapeHtml(item.name)}">
        <div class="lc-image">${cached.image ? `<img src="${escapeHtml(cached.image)}" alt="${escapeHtml(item.name)}">` : '<span>Loading image…</span>'}</div>
        <div class="lc-info">
          <div class="lc-badges"><span class="lc-badge ${statusClass}">${escapeHtml(item.status)}</span>${item.discount ? `<span class="lc-badge lc-discount">${escapeHtml(item.discount)}% off</span>` : ''}</div>
          <h3>${escapeHtml(item.name)}</h3>
          ${(item.rrp || item.clearancePrice) ? `<div class="lc-price">${item.rrp ? `<span>RRP <strong>${escapeHtml(money(item.rrp))}</strong></span>` : ''}${item.clearancePrice ? `<span>Clearance <strong>${escapeHtml(money(item.clearancePrice))}</strong></span>` : ''}</div>` : ''}
          ${item.reason ? `<div class="lc-reason"><strong>Reason:</strong> ${escapeHtml(item.reason)}</div>` : ''}
          ${item.note ? `<div class="lc-note">${escapeHtml(item.note)}</div>` : ''}
          <div class="lc-card-actions"><a href="${escapeHtml(cached.url || searchUrl(item.name))}" target="_blank" rel="noopener noreferrer">Website</a><span class="lc-owner">Owner: ${escapeHtml(item.owner || '—')}</span></div>
        </div>
      </article>`;
  }

  function filteredRows(overlay) {
    const query = compact(overlay.querySelector('[data-filter="search"]').value);
    const status = overlay.querySelector('[data-filter="status"]').value;
    const discount = overlay.querySelector('[data-filter="discount"]').value;
    return rows.filter((item) => (!query || compact(Object.values(item).join(' ')).includes(query))
      && (!status || item.status === status)
      && (!discount || item.discount === discount));
  }

  function render(overlay) {
    const filtered = filteredRows(overlay);
    const view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards';
    overlay.querySelector('.lc-count').textContent = `${filtered.length} product${filtered.length === 1 ? '' : 's'}`;
    const grid = overlay.querySelector('.lc-grid');
    grid.classList.toggle('is-list', view === 'list');
    overlay.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    grid.innerHTML = filtered.length ? filtered.map(cardHtml).join('') : '<div class="lc-empty">No clearance products match those filters.</div>';
    observeProductCards(grid);
  }

  async function findStoreProduct(name) {
    const key = compact(name);
    const override = PRODUCT_OVERRIDES[key];
    if (override) {
      imageCache[key] = override;
      localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(imageCache));
      return override;
    }
    if (imageCache[key]) return imageCache[key];
    const sku = clean(name).match(/\bCS\d+(?:-\d+)?\b/i)?.[0];
    const query = sku || clean(name).replace(/\([^)]*\)/g, '').replace(/\bCS\d+(?:-\d+)?\b.*$/i, '').trim();
    const url = new URL(`${STORE_URL}/search/suggest.json`);
    url.searchParams.set('q', query);
    url.searchParams.set('resources[type]', 'product');
    url.searchParams.set('resources[limit]', '4');
    url.searchParams.set('resources[options][fields]', 'title,variants.sku');
    try {
      const response = await request({ url: url.href, responseType: 'json' });
      const products = response.response?.resources?.results?.products || JSON.parse(response.responseText || '{}')?.resources?.results?.products || [];
      const ignoredWords = new Set(['outdoor', 'indoor', 'set', 'sofa', 'table', 'chair', 'umbrella', 'aluminium', 'manual', 'motorised', 'round', 'square', 'with', 'and', 'the', 'for']);
      const tokens = (value) => clean(value).toLowerCase().split(/[^a-z0-9]+/)
        .filter((word) => word.length > 1 && !ignoredWords.has(word) && !/^\d+(?:m|cm|mm)?$/.test(word));
      const wantedTokens = tokens(query);
      const ranked = products.map((entry) => {
        const titleTokens = tokens(entry.title);
        const shared = wantedTokens.filter((word) => titleTokens.includes(word)).length;
        const firstNameMatches = !wantedTokens.length || titleTokens.includes(wantedTokens[0]);
        return { entry, shared, score: wantedTokens.length ? shared / wantedTokens.length : 0, firstNameMatches };
      }).sort((a, b) => b.score - a.score || b.shared - a.shared);
      const product = products.find((entry) => sku && (entry.variants || []).some((variant) => compact(variant.sku) === compact(sku)))
        || ranked.find((candidate) => candidate.firstNameMatches && candidate.shared >= 1 && (candidate.score >= 0.34 || wantedTokens.length === 1))?.entry;
      if (!product) throw new Error('No storefront match');
      const result = {
        image: product.image || product.featured_image?.url || '',
        url: new URL(product.url || `/products/${product.handle}`, STORE_URL).href
      };
      imageCache[key] = result;
      localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(imageCache));
      return result;
    } catch (error) {
      imageCache[key] = { image: '', url: searchUrl(name) };
      return imageCache[key];
    }
  }

  function observeProductCards(grid) {
    const observer = new IntersectionObserver((entries) => entries.forEach(async (entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const name = entry.target.dataset.productName;
      const result = await findStoreProduct(name);
      if (!entry.target.isConnected) return;
      const image = entry.target.querySelector('.lc-image');
      image.innerHTML = result.image
        ? `<img src="${escapeHtml(result.image)}" alt="${escapeHtml(name)}">`
        : '<span>Image not found</span>';
      const website = entry.target.querySelector('.lc-card-actions a');
      if (website) website.href = result.url;
    }), { root: grid, rootMargin: '180px' });
    grid.querySelectorAll('.lc-card').forEach((card) => observer.observe(card));
  }

  function createOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('section');
    overlay.id = OVERLAY_ID;
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="lc-sheet" role="dialog" aria-modal="true" aria-label="Living Culture Clearance Information">
        <header class="lc-head"><div><h2>Living Culture Clearance Information</h2><div class="lc-subtitle">Current clearance products from the shared spreadsheet</div></div><div class="lc-head-actions"><button type="button" data-action="refresh">Refresh data</button> <button type="button" data-action="print">Print / Save PDF</button> <button type="button" class="lc-primary" data-action="close">Close</button></div></header>
        <div class="lc-toolbar"><input data-filter="search" type="search" placeholder="Search product, SKU, reason or note…"><select data-filter="status"><option value="">All clearance types</option></select><select data-filter="discount"><option value="">All discounts</option></select><div class="lc-view-switch"><button type="button" data-view="cards">Cards</button><button type="button" data-view="list">List</button></div><a class="lc-action" href="${SHEET_EDIT_URL}" target="_blank" rel="noopener noreferrer">Open spreadsheet</a></div>
        <div class="lc-summary"><span class="lc-count">Loading…</span><span class="lc-source">Loading live spreadsheet data…</span></div>
        <main class="lc-grid"><div class="lc-empty">Loading clearance information…</div></main>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay || event.target.closest('[data-action="close"]')) overlay.hidden = true;
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) {
        localStorage.setItem(VIEW_KEY, viewButton.dataset.view);
        render(overlay);
      }
      if (event.target.closest('[data-action="print"]')) window.print();
      if (event.target.closest('[data-action="refresh"]')) {
        overlay.querySelector('.lc-source').textContent = 'Refreshing spreadsheet data…';
        await populateOverlay(overlay, true);
      }
    });
    overlay.addEventListener('input', () => render(overlay));
    overlay.addEventListener('change', () => render(overlay));
    return overlay;
  }

  async function populateOverlay(overlay, force = false) {
    try {
      const result = await loadRows(force);
      const statuses = [...new Set(rows.map((item) => item.status).filter(Boolean))].sort();
      const discounts = [...new Set(rows.map((item) => item.discount).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
      overlay.querySelector('[data-filter="status"]').innerHTML = '<option value="">All clearance types</option>' + statuses.map((value) => `<option>${escapeHtml(value)}</option>`).join('');
      overlay.querySelector('[data-filter="discount"]').innerHTML = '<option value="">All discounts</option>' + discounts.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}% off</option>`).join('');
      overlay.querySelector('.lc-source').textContent = result.source === 'live' ? 'Live spreadsheet data' : result.source === 'cached' ? `Cached ${Math.round(result.age / 60000)} minutes ago` : 'Cached data — Google Sheet temporarily unavailable';
      render(overlay);
    } catch (error) {
      overlay.querySelector('.lc-source').textContent = 'Could not load the spreadsheet';
      overlay.querySelector('.lc-grid').innerHTML = `<div class="lc-empty">${escapeHtml(error.message || 'The clearance information could not be loaded.')}</div>`;
    }
  }

  async function openSheet() {
    const overlay = createOverlay();
    overlay.hidden = false;
    if (!rows.length) await populateOverlay(overlay);
    else render(overlay);
  }

  function visible(element) {
    return Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  }

  function isOmniQuotePage() {
    return location.hostname === 'go.cin7.com' && /\/Cloud\/TransactionEntry\/TransactionEntry\.aspx/i.test(location.pathname);
  }

  function placeBesideCorePromo(button) {
    const promo = document.getElementById(PROMO_BUTTON_ID) || Array.from(document.querySelectorAll('button, a'))
      .find((element) => visible(element) && /^promo summary$/i.test(clean(element.textContent || element.value)));
    if (!promo || !visible(promo) || !promo.parentElement) return false;

    const parent = promo.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    if (button.parentElement !== parent) parent.appendChild(button);
    const parentRect = parent.getBoundingClientRect();
    const promoRect = promo.getBoundingClientRect();
    button.classList.remove('lc-clearance-floating');
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.position = 'absolute';
    button.style.left = `${Math.round(promoRect.right - parentRect.left + 8)}px`;
    button.style.top = `${Math.round(promoRect.top - parentRect.top)}px`;
    button.style.height = `${Math.max(34, promoRect.height || 34)}px`;
    button.style.lineHeight = '1';
    button.style.zIndex = '2147483602';
    return true;
  }

  function mountButton() {
    if (!document.body) return;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Clearance Info';
      button.title = 'Open the Living Culture clearance product information sheet';
      button.addEventListener('click', openSheet);
      document.body.appendChild(button);
    }

    if (isOmniQuotePage()) {
      const photoActions = document.getElementById('lc-omni-customer-photo-actions');
      if (photoActions && visible(photoActions)) {
        button.classList.remove('lc-clearance-floating');
        button.style.display = 'inline-flex';
        button.style.position = '';
        button.style.left = '';
        button.style.top = '';
        button.style.zIndex = '';
        if (button.parentElement !== photoActions) photoActions.prepend(button);
        return;
      }

      if (button.parentElement !== document.body) document.body.appendChild(button);
      button.style.display = 'inline-flex';
      button.classList.add('lc-clearance-floating');
      return;
    }

    if (placeBesideCorePromo(button)) return;
    button.classList.remove('lc-clearance-floating');
    button.style.display = 'none';
  }

  function ensureUi() {
    addStyles();
    mountButton();
  }

  ensureUi();
  let uiRecoveryTimer = null;
  const scheduleUiRecovery = () => {
    window.clearTimeout(uiRecoveryTimer);
    uiRecoveryTimer = window.setTimeout(ensureUi, 180);
  };
  const uiObserver = new MutationObserver(scheduleUiRecovery);
  if (document.documentElement) uiObserver.observe(document.documentElement, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () => uiObserver.observe(document.documentElement, { childList: true, subtree: true }), { once: true });
  window.setInterval(() => {
    const button = document.getElementById(BUTTON_ID);
    if (isOmniQuotePage() && button?.isConnected) return;
    ensureUi();
  }, 2500);
  window.addEventListener('lc:cin7-toolbar-settling', () => {
    if (isOmniQuotePage()) return;
    const button = document.getElementById(BUTTON_ID);
    if (button) button.style.display = 'none';
  });
  window.addEventListener('lc:cin7-toolbar-ready', ensureUi);
})();
