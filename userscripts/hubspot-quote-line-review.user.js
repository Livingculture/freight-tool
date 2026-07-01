// ==UserScript==
// @name         HubSpot Living Culture Quote Line Review
// @namespace    livingculture-hubspot
// @version      1.7
// @description  Reviews visible HubSpot quote deals by stage, with customer, quote number, line items, and Cin7 discounts.
// @match        https://app.hubspot.com/*
// @match        https://app-*.hubspot.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/hubspot-quote-line-review.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/hubspot-quote-line-review.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      living-culture-workflow.vercel.app
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'lc-hs-quote-review-root';
  const BUTTON_ID = 'lc-hs-quote-review-button';
  const WORKFLOW_SALES_API_URL = 'https://living-culture-workflow.vercel.app/api/cin7/sales';
  const QUOTE_RE = /\bNZSO[-\s]?\d+\b/i;
  const INCLUDED_STAGE_RE = /quote\s*[-–]\s*quote sent|quote sent|followed up|follow\s*up|waiting on customer/i;
  const HUBSPOT_APP_HOST_RE = /^(?:app|app-[a-z0-9-]+)\.hubspot\.com$/i;

  let deals = [];
  let loading = false;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isHubSpotAppPage() {
    return HUBSPOT_APP_HOST_RE.test(window.location.hostname) && /\/contacts\//i.test(window.location.pathname);
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function textOf(element) {
    return clean(element?.innerText || element?.textContent || '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        withCredentials: true,
        onload: response => {
          let data = {};
          try {
            data = JSON.parse(response.responseText || '{}');
          } catch (_error) {
            reject(new Error('Workflow returned a response that was not JSON.'));
            return;
          }

          if (response.status >= 200 && response.status < 300) {
            resolve(data);
            return;
          }

          reject(new Error(data.error || `Workflow returned HTTP ${response.status}.`));
        },
        onerror: () => reject(new Error('Could not connect to Workflow.'))
      });
    });
  }

  function workflowSalesUrl(quoteNumber) {
    const url = new URL(WORKFLOW_SALES_API_URL);
    url.searchParams.set('search', quoteNumber);
    return url.toString();
  }

  function cin7QuoteUrl(quoteNumber, saleId = '') {
    const id = clean(saleId);
    if (id) return `https://inventory.dearsystems.com/Sale#${encodeURIComponent(id)}`;

    const quote = clean(quoteNumber);
    return quote ? `https://inventory.dearsystems.com/SaleList?search=${encodeURIComponent(quote)}` : '';
  }

  function extractQuoteNumber(value) {
    const match = clean(value).match(QUOTE_RE);
    if (!match) return '';
    const digits = match[0].match(/\d+/)?.[0] || '';
    return digits ? `NZSO-${digits}` : match[0].toUpperCase();
  }

  function cellTexts(row) {
    const cells = Array.from(row.querySelectorAll('[role="cell"], [role="gridcell"], td, th'))
      .filter(isVisible)
      .map(textOf)
      .filter(Boolean);

    if (cells.length >= 4) return cells;

    return Array.from(row.children || [])
      .filter(isVisible)
      .map(textOf)
      .filter(Boolean);
  }

  function headerTexts() {
    return Array.from(document.querySelectorAll('[role="columnheader"], th'))
      .filter(isVisible)
      .map(textOf)
      .filter(Boolean);
  }

  function compact(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function valueByHeader(cells, headers, patterns) {
    const index = headers.findIndex(header => {
      const normalized = compact(header);
      return patterns.some(pattern => pattern.test(normalized));
    });

    return index >= 0 ? clean(cells[index]) : '';
  }

  function usefulNote(value) {
    const note = clean(value);
    if (!note || note === '--') return '';
    if (QUOTE_RE.test(note)) return '';
    if (/^\d+\s*records?$/i.test(note)) return '';
    return note;
  }

  function findDealUrl(row) {
    const link = Array.from(row.querySelectorAll('a[href]'))
      .find(anchor => /\/contacts\/\d+\/(?:record\/)?deal\//i.test(anchor.href) || /\/deal\//i.test(anchor.href));
    return link?.href || '';
  }

  function findDealName(row, cells) {
    const dealLink = Array.from(row.querySelectorAll('a[href]'))
      .filter(isVisible)
      .find(anchor => /\/contacts\/\d+\/(?:record\/)?deal\//i.test(anchor.href) || /\/deal\//i.test(anchor.href));
    const linkText = clean(dealLink?.innerText || dealLink?.textContent);
    if (linkText) return linkText;

    return cells.find(cell => {
      if (/deal name|deal stage|records?$/i.test(cell)) return false;
      if (INCLUDED_STAGE_RE.test(cell)) return false;
      return true;
    }) || '';
  }

  function dealFromCells(cells, row, headers) {
    const stageIndex = cells.findIndex(cell => INCLUDED_STAGE_RE.test(cell));
    if (stageIndex < 0) return null;

    const dealName = valueByHeader(cells, headers, [/^dealname$/]) || findDealName(row, cells);
    if (!dealName || /deal name/i.test(dealName)) return null;

    const orderName = valueByHeader(cells, headers, [
      /cin7.*order/,
      /order.*name/,
      /cin7.*sale/,
      /dear/,
      /quote.*number/,
      /order.*number/,
    ]);
    const quoteNumber = extractQuoteNumber(orderName) || extractQuoteNumber(cells.join(' '));
    const dealNameIndex = Math.max(0, cells.findIndex(cell => cell === dealName));
    const contactIndex = Math.min(dealNameIndex + 1, cells.length - 1);
    const lineItemIndex = cells.findIndex((cell, index) => index > dealNameIndex && (/records?$/i.test(cell) || (index < stageIndex && index > contactIndex + 1)));
    const statusIndex = cells.findIndex(cell => /phoned|emailed|texted|called|--/i.test(cell));
    const quotedDate = valueByHeader(cells, headers, [/quote.*date/, /quoted.*date/, /^createdate$/, /^created$/]);
    const salesNote = usefulNote(valueByHeader(cells, headers, [/^salesrepdeal$/, /^salesrep$/])) ||
      usefulNote(cells.find((cell, index) => index > contactIndex && index < stageIndex && !/records?$/i.test(cell)) || '');

    return {
      id: quoteNumber || dealName,
      quoteNumber,
      dealName,
      orderName,
      customer: valueByHeader(cells, headers, [/contacts?$/]) || cells[contactIndex] || '',
      hubspotLineItems: valueByHeader(cells, headers, [/lineitems?$/]) || (lineItemIndex >= 0 ? cells[lineItemIndex] : ''),
      salesNote,
      status: valueByHeader(cells, headers, [/^status$/]) || (statusIndex >= 0 ? cells[statusIndex] : ''),
      stage: cells[stageIndex],
      quotedDate,
      lastActivity: cells[stageIndex + 1] || '',
      url: findDealUrl(row),
      cin7Url: cin7QuoteUrl(quoteNumber),
      cin7Lines: [],
      discountSummary: '',
      loadStatus: quoteNumber ? 'Waiting' : 'No quote number'
    };
  }

  function readVisibleHubSpotDeals() {
    const rows = Array.from(document.querySelectorAll('[role="row"], tr'))
      .filter(isVisible)
      .filter(row => !row.closest(`#${ROOT_ID}`));
    const headers = headerTexts();
    const seen = new Set();
    const found = [];

    rows.forEach(row => {
      const cells = cellTexts(row);
      if (!cells.length || !cells.some(cell => INCLUDED_STAGE_RE.test(cell))) return;

      const deal = dealFromCells(cells, row, headers);
      if (!deal || seen.has(deal.id)) return;

      seen.add(deal.id);
      found.push(deal);
    });

    return found;
  }

  function normalizeWorkflowLine(line) {
    return {
      sku: clean(line?.sku),
      product: clean(line?.product),
      qty: clean(line?.qty),
      price: clean(line?.price),
      discount: clean(line?.discount),
      total: clean(line?.total)
    };
  }

  function hasDiscount(value) {
    const discount = clean(value);
    return Boolean(discount && !/^0(?:\.00)?%?$/.test(discount) && discount !== '$0.00');
  }

  function summarizeDiscount(lines) {
    const values = lines.map(line => clean(line.discount)).filter(hasDiscount);
    return values.length ? values.join(', ') : 'No discount found';
  }

  function dealHasLoadedNoDiscount(deal) {
    return deal.cin7Lines.length > 0 && !deal.cin7Lines.some(line => hasDiscount(line.discount));
  }

  async function loadDealLines() {
    if (loading) return;
    loading = true;
    setStatus(`Loading ${deals.filter(deal => deal.quoteNumber).length} HubSpot quote deals...`);
    renderDeals();

    for (let index = 0; index < deals.length; index += 1) {
      const deal = deals[index];
      if (!deal.quoteNumber) {
        deal.loadStatus = 'No quote number in deal name';
        renderDeals();
        continue;
      }

      deal.loadStatus = `Loading ${index + 1} of ${deals.length}`;
      renderDeals();

      try {
        const data = await requestJson(workflowSalesUrl(deal.quoteNumber));
        const sale = data?.sale || {};
        const lines = Array.isArray(sale.lineItems)
          ? sale.lineItems.map(normalizeWorkflowLine).filter(line => line.product || line.sku)
          : [];

        deal.customer = clean(sale.customer) || deal.customer;
        deal.quotedDate = clean(sale.orderDate) || deal.quotedDate;
        deal.cin7Url = cin7QuoteUrl(deal.quoteNumber, sale.id);
        deal.cin7Lines = lines;
        deal.discountSummary = summarizeDiscount(lines);
        deal.loadStatus = lines.length ? 'Loaded from Cin7 Core' : 'No Cin7 line items found';
      } catch (error) {
        deal.loadStatus = error?.message || 'Could not load Cin7 lines';
      }

      renderDeals();
    }

    loading = false;
    setStatus(`Loaded ${deals.filter(deal => deal.cin7Lines.length).length} of ${deals.length} shown HubSpot deals.`);
  }

  function filteredDeals() {
    const shadow = document.getElementById(ROOT_ID)?.shadowRoot;
    const query = clean(shadow?.getElementById('lc-hs-search')?.value).toLowerCase();
    const noDiscountOnly = Boolean(shadow?.getElementById('lc-hs-no-discount-only')?.checked);

    return deals.filter(deal => {
      const haystack = [
        deal.quoteNumber,
        deal.dealName,
        deal.customer,
        deal.hubspotLineItems,
        deal.salesNote,
        deal.status,
        deal.stage,
        deal.discountSummary,
        ...deal.cin7Lines.flatMap(line => [line.sku, line.product, line.discount])
      ].join(' ').toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (noDiscountOnly && !dealHasLoadedNoDiscount(deal)) return false;
      return true;
    });
  }

  function renderDeals() {
    const shadow = document.getElementById(ROOT_ID)?.shadowRoot;
    const list = shadow?.getElementById('lc-hs-list');
    const count = shadow?.getElementById('lc-hs-count');
    if (!list) return;

    const shown = filteredDeals();
    if (count) count.textContent = `${shown.length} shown / ${deals.length} matching visible rows`;

    if (!deals.length) {
      list.innerHTML = '<div class="empty">No visible HubSpot deals found in Quote sent, Followed up, or Waiting on customer stages.</div>';
      return;
    }

    list.innerHTML = shown.map(deal => {
      const titleHtml = deal.cin7Url
        ? `<a class="quote-link" href="${escapeHtml(deal.cin7Url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(deal.quoteNumber || deal.dealName)}</a>`
        : escapeHtml(deal.quoteNumber || deal.dealName);
      const lines = deal.cin7Lines.length
        ? deal.cin7Lines.map(line => `
          <tr>
            <td>${escapeHtml(line.sku)}</td>
            <td>${escapeHtml(line.product)}</td>
            <td>${escapeHtml(line.qty)}</td>
            <td>${escapeHtml(line.price)}</td>
            <td class="${hasDiscount(line.discount) ? 'discount' : ''}">${escapeHtml(line.discount)}</td>
            <td>${escapeHtml(line.total)}</td>
          </tr>
        `).join('')
        : `<tr><td colspan="6" class="muted">${escapeHtml(deal.hubspotLineItems || deal.loadStatus)}</td></tr>`;

      return `
        <article class="deal">
          <div class="deal-head">
            <div>
              <strong>${titleHtml}</strong>
              <span>${escapeHtml(deal.customer || 'Customer not found')}</span>
            </div>
            <div class="meta">
              ${deal.quotedDate ? `<span>Quoted: ${escapeHtml(deal.quotedDate)}</span>` : ''}
              <span>${escapeHtml(deal.stage)}</span>
              <span>${escapeHtml(deal.status)}</span>
              <span>${escapeHtml(deal.discountSummary || deal.loadStatus)}</span>
              ${deal.url ? `<a href="${escapeHtml(deal.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
            </div>
          </div>
          ${deal.salesNote ? `<div class="note"><strong>Sales note:</strong> ${escapeHtml(deal.salesNote)}</div>` : ''}
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Line item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Discount</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${lines}</tbody>
          </table>
        </article>
      `;
    }).join('') || '<div class="empty">No deals match the current filter.</div>';
  }

  function setStatus(message) {
    const status = document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('lc-hs-status');
    if (status) status.textContent = message || '';
  }

  function scanDeals() {
    deals = readVisibleHubSpotDeals();
    setStatus(`${deals.length} visible HubSpot deals matched the quote/follow-up stages.`);
    renderDeals();
  }

  function buildCsv() {
    const rows = [['Quote Number', 'Quoted Date', 'Customer', 'Sales Note', 'Stage', 'Status', 'HubSpot Line Items', 'SKU', 'Line Item', 'Qty', 'Price', 'Discount', 'Total', 'Deal URL']];

    filteredDeals().forEach(deal => {
      const lines = deal.cin7Lines.length ? deal.cin7Lines : [{ sku: '', product: deal.hubspotLineItems || deal.loadStatus, qty: '', price: '', discount: '', total: '' }];
      lines.forEach(line => {
        rows.push([
          deal.quoteNumber,
          deal.quotedDate,
          deal.customer,
          deal.salesNote,
          deal.stage,
          deal.status,
          deal.hubspotLineItems,
          line.sku,
          line.product,
          line.qty,
          line.price,
          line.discount,
          line.total,
          deal.url
        ]);
      });
    });

    return rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  async function copyCsv() {
    await navigator.clipboard.writeText(buildCsv());
    setStatus('Copied the shown HubSpot quote deals as CSV.');
  }

  function buildPrintHtml() {
    const rows = filteredDeals().map(deal => {
      const lineRows = (deal.cin7Lines.length ? deal.cin7Lines : [{ sku: '', product: deal.hubspotLineItems || deal.loadStatus, qty: '', price: '', discount: '', total: '' }])
        .map(line => `
          <tr>
            <td>${escapeHtml(line.sku)}</td>
            <td>${escapeHtml(line.product)}</td>
            <td>${escapeHtml(line.qty)}</td>
            <td>${escapeHtml(line.price)}</td>
            <td>${escapeHtml(line.discount)}</td>
            <td>${escapeHtml(line.total)}</td>
          </tr>
        `).join('');

      return `
        <section class="deal">
          <h2>${escapeHtml(deal.quoteNumber || deal.dealName)} <span>${escapeHtml(deal.customer)}</span></h2>
          <div class="meta">${deal.quotedDate ? `Quoted: ${escapeHtml(deal.quotedDate)} | ` : ''}${escapeHtml(deal.stage)} | ${escapeHtml(deal.status)} | ${escapeHtml(deal.discountSummary || deal.loadStatus)}</div>
          ${deal.salesNote ? `<p><strong>Sales note:</strong> ${escapeHtml(deal.salesNote)}</p>` : ''}
          <table>
            <thead><tr><th>SKU</th><th>Line item</th><th>Qty</th><th>Price</th><th>Discount</th><th>Total</th></tr></thead>
            <tbody>${lineRows}</tbody>
          </table>
        </section>
      `;
    }).join('');

    return `<!doctype html>
      <html>
        <head>
          <title>HubSpot Quote Review</title>
          <style>
            body { font-family: Arial, sans-serif; color: #24323d; margin: 24px; }
            h1 { font-size: 20px; margin: 0 0 6px; }
            .summary { color: #5f6f7f; font-size: 12px; margin-bottom: 18px; }
            .deal { break-inside: avoid; border-top: 1px solid #cfd9e3; padding: 12px 0; }
            h2 { display: flex; justify-content: space-between; gap: 18px; font-size: 15px; margin: 0 0 4px; }
            h2 span { font-weight: 400; color: #526170; }
            .meta, p { color: #526170; font-size: 12px; margin: 0 0 8px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
            th, td { border-bottom: 1px solid #e4ebf1; padding: 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
            th { background: #f4f7fa; color: #5f6f7f; }
            th:nth-child(1), td:nth-child(1) { width: 90px; }
            th:nth-child(3), td:nth-child(3) { width: 45px; }
            th:nth-child(4), td:nth-child(4),
            th:nth-child(5), td:nth-child(5),
            th:nth-child(6), td:nth-child(6) { width: 72px; }
            @page { margin: 14mm; }
          </style>
        </head>
        <body>
          <h1>HubSpot Quote Review</h1>
          <div class="summary">${filteredDeals().length} deals exported ${new Date().toLocaleString()}</div>
          ${rows || '<p>No deals to export.</p>'}
          <script>window.addEventListener('load', () => window.setTimeout(() => window.print(), 150));</script>
        </body>
      </html>`;
  }

  function exportPdf() {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      setStatus('Allow popups for HubSpot, then try Export PDF again.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintHtml());
    printWindow.document.close();
    setStatus('Opened print view. Choose Save as PDF.');
  }

  function openPanel() {
    ensureRoot();
    const modal = document.getElementById(ROOT_ID).shadowRoot.getElementById('lc-hs-modal');
    modal.classList.add('open');
    modal.classList.remove('minimized');
    scanDeals();
  }

  function closePanel() {
    document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('lc-hs-modal')?.classList.remove('open');
  }

  function toggleMinimized() {
    const modal = document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('lc-hs-modal');
    modal?.classList.toggle('minimized');
  }

  function findHubSpotToolbarAnchor() {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(isVisible);
    return buttons.find(button => /add deals?/i.test(textOf(button))) ||
      buttons.find(button => /export/i.test(textOf(button)));
  }

  function ensureButton() {
    if (!isHubSpotAppPage()) {
      document.getElementById(BUTTON_ID)?.remove();
      document.getElementById(ROOT_ID)?.remove();
      return;
    }

    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'LC Quote Review';
      button.addEventListener('click', openPanel);
    }

    const anchor = findHubSpotToolbarAnchor();
    if (anchor?.parentElement && button.parentElement !== anchor.parentElement) {
      button.classList.add('lc-hs-toolbar-button');
      anchor.insertAdjacentElement(/export/i.test(textOf(anchor)) ? 'beforebegin' : 'beforebegin', button);
      return;
    }

    if (!button.parentElement) {
      button.classList.remove('lc-hs-toolbar-button');
      document.body.appendChild(button);
    }
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);

    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; font-family: Arial, sans-serif; }
        #lc-hs-modal {
          position: fixed;
          inset: 0;
          display: none;
          background: transparent;
          z-index: 2147483647;
          color: #2f3742;
          pointer-events: none;
        }
        #lc-hs-modal.open { display: block; }
        .panel {
          position: absolute;
          top: 72px;
          right: 16px;
          bottom: 18px;
          width: min(680px, calc(100vw - 36px));
          display: grid;
          grid-template-rows: auto 1fr;
          min-width: 0;
          background: #fff;
          border: 1px solid #c8d3df;
          border-radius: 8px;
          box-shadow: 0 18px 48px rgba(22, 30, 36, .22);
          overflow: hidden;
          pointer-events: auto;
        }
        #lc-hs-modal.minimized .panel {
          top: auto;
          right: 18px;
          bottom: 18px;
          width: 260px;
          height: auto;
          display: block;
        }
        #lc-hs-modal.minimized .toolbar,
        #lc-hs-modal.minimized #lc-hs-status,
        #lc-hs-modal.minimized #lc-hs-list,
        #lc-hs-modal.minimized .sub {
          display: none;
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 12px 14px;
          background: #0f6f78;
          color: #fff;
        }
        h2 { margin: 0; font-size: 16px; line-height: 1.2; letter-spacing: 0; }
        .sub { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,.82); }
        .header-actions {
          display: flex;
          gap: 6px;
        }
        .icon-button {
          width: 32px;
          height: 32px;
          border: 0;
          border-radius: 4px;
          background: rgba(255,255,255,.16);
          color: #fff;
          font: 700 18px Arial, sans-serif;
          cursor: pointer;
        }
        .toolbar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid #dde5ed;
          background: #f7fafc;
        }
        input[type="search"] {
          width: 210px;
          height: 36px;
          border: 1px solid #b9c7d6;
          border-radius: 4px;
          padding: 0 10px;
          font: 14px Arial, sans-serif;
        }
        label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: 700 12px Arial, sans-serif;
          color: #46515d;
        }
        button.action {
          height: 36px;
          border: 1px solid #b9c7d6;
          border-radius: 4px;
          background: #fff;
          color: #35404a;
          padding: 0 12px;
          font: 700 13px Arial, sans-serif;
          cursor: pointer;
        }
        button.primary { border-color: #05cabe; background: #05cabe; color: #fff; }
        #lc-hs-count { margin-left: auto; font: 700 12px Arial, sans-serif; color: #5a6875; }
        #lc-hs-status {
          padding: 8px 16px;
          min-height: 18px;
          border-bottom: 1px solid #dde5ed;
          color: #2d5c4e;
          font: 700 12px Arial, sans-serif;
        }
        #lc-hs-list { overflow: auto; padding: 12px; background: #eef3f7; }
        .deal {
          background: #fff;
          border: 1px solid #d9e2ea;
          border-radius: 6px;
          margin-bottom: 12px;
          overflow: hidden;
        }
        .deal-head {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          padding: 10px 12px;
          border-bottom: 1px solid #e4ebf1;
        }
        .deal-head strong { display: inline-block; min-width: 110px; color: #24323d; font-size: 14px; }
        .quote-link { color: #087d76; text-decoration: none; }
        .quote-link:hover { text-decoration: underline; }
        .deal-head span, .meta span { color: #4f5c68; font-size: 13px; }
        .meta { display: flex; flex-wrap: wrap; gap: 10px; text-align: left; }
        .meta a { color: #087d76; font-weight: 700; text-decoration: none; }
        .note { padding: 8px 12px; border-bottom: 1px solid #eef2f5; color: #4f5c68; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
        th, td {
          padding: 8px 10px;
          border-bottom: 1px solid #eef2f5;
          text-align: left;
          vertical-align: top;
          overflow-wrap: anywhere;
        }
        th { color: #667384; background: #fbfcfd; font-weight: 700; }
        th:nth-child(1), td:nth-child(1) { width: 92px; }
        th:nth-child(3), td:nth-child(3) { width: 48px; }
        th:nth-child(4), td:nth-child(4),
        th:nth-child(5), td:nth-child(5),
        th:nth-child(6), td:nth-child(6) { width: 74px; }
        .discount { color: #a43d20; font-weight: 700; }
        .muted, .empty { color: #6c7884; font-weight: 700; }
        .empty {
          padding: 22px;
          background: #fff;
          border: 1px solid #d9e2ea;
          border-radius: 6px;
        }
      </style>
      <div id="lc-hs-modal" role="dialog" aria-modal="true" aria-labelledby="lc-hs-title">
        <div class="panel">
          <div>
            <div class="header">
              <div>
                <h2 id="lc-hs-title">HubSpot Quote Review</h2>
                <div class="sub">Visible deals in Quote sent, Followed up, or Waiting on customer stages.</div>
              </div>
              <div class="header-actions">
                <button type="button" class="icon-button" id="lc-hs-minimize" aria-label="Minimise">-</button>
                <button type="button" class="icon-button" id="lc-hs-close" aria-label="Close">x</button>
              </div>
            </div>
            <div class="toolbar">
              <button type="button" class="action" id="lc-hs-rescan">Rescan HubSpot</button>
              <button type="button" class="action primary" id="lc-hs-load">Load Cin7 discounts</button>
              <button type="button" class="action" id="lc-hs-copy">Copy CSV</button>
              <button type="button" class="action" id="lc-hs-pdf">Export PDF</button>
              <input id="lc-hs-search" type="search" placeholder="Search quote, customer, SKU" />
              <label><input id="lc-hs-no-discount-only" type="checkbox" /> No discount only</label>
              <div id="lc-hs-count"></div>
            </div>
            <div id="lc-hs-status"></div>
          </div>
          <div id="lc-hs-list"></div>
        </div>
      </div>
    `;

    shadow.getElementById('lc-hs-close').addEventListener('click', closePanel);
    shadow.getElementById('lc-hs-minimize').addEventListener('click', toggleMinimized);
    shadow.getElementById('lc-hs-modal').addEventListener('click', event => {
      if (event.target?.id === 'lc-hs-modal') closePanel();
    });
    shadow.getElementById('lc-hs-rescan').addEventListener('click', scanDeals);
    shadow.getElementById('lc-hs-load').addEventListener('click', loadDealLines);
    shadow.getElementById('lc-hs-copy').addEventListener('click', copyCsv);
    shadow.getElementById('lc-hs-pdf').addEventListener('click', exportPdf);
    shadow.getElementById('lc-hs-search').addEventListener('input', renderDeals);
    shadow.getElementById('lc-hs-no-discount-only').addEventListener('change', renderDeals);

    return root;
  }

  function ensureStyles() {
    if (document.getElementById(`${BUTTON_ID}-style`)) return;
    const style = document.createElement('style');
    style.id = `${BUTTON_ID}-style`;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: 128px;
        top: 82px;
        z-index: 2147483646;
        height: 42px;
        border: 1px solid #05cabe;
        border-radius: 4px;
        background: #05cabe;
        color: #fff;
        padding: 0 14px;
        font: 700 13px Arial, sans-serif;
        box-shadow: 0 8px 24px rgba(22, 30, 36, .18);
        cursor: pointer;
        white-space: nowrap;
      }
      #${BUTTON_ID}.lc-hs-toolbar-button {
        position: static;
        height: 34px;
        margin-right: 8px;
        box-shadow: none;
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    if (!document.body) return;
    if (!isHubSpotAppPage()) {
      document.getElementById(BUTTON_ID)?.remove();
      document.getElementById(ROOT_ID)?.remove();
      return;
    }
    ensureStyles();
    ensureRoot();
    ensureButton();
  }

  boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 3000);

  new MutationObserver(boot).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
