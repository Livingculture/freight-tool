// ==UserScript==
// @name         Cin7 Living Culture Quote Line Review
// @namespace    livingculture-cin7
// @version      1.1
// @description  Adds a read-only Sale List button that reviews visible Cin7 quotes with customer, quote number, line items, and discounts.
// @match        https://*.cin7.com/*
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-quote-line-review.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-quote-line-review.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      living-culture-workflow.vercel.app
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'lc-quote-line-review-root';
  const BUTTON_ID = 'lc-quote-line-review-button';
  const FRAME_ID = 'lc-quote-line-review-frame';
  const WORKFLOW_SALES_API_URL = 'https://living-culture-workflow.vercel.app/api/cin7/sales';
  const DOCUMENT_RE = /\b[A-Z]{2,8}(?:SO|SQ|QT|QO)?-\d{3,}\b/i;
  const MONEY_RE = /^-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?$|^-?\$?\d+(?:\.\d{2})?$/;

  let quotes = [];
  let loading = false;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isSaleListPage() {
    return /\/SaleList\b/i.test(window.location.pathname);
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function visibleText(element) {
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

  function absoluteUrl(href) {
    if (!href || /^javascript:/i.test(href)) return '';
    try {
      return new URL(href, window.location.href).href;
    } catch (error) {
      return '';
    }
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: { Accept: 'application/json' },
          withCredentials: true,
          onload: response => {
            let data = {};
            try {
              data = JSON.parse(response.responseText || '{}');
            } catch (error) {
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
        return;
      }

      fetch(url, { credentials: 'include', cache: 'no-store' })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || `Workflow returned HTTP ${response.status}.`);
          return data;
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function workflowSalesUrl(documentNumber) {
    const url = new URL(WORKFLOW_SALES_API_URL);
    url.searchParams.set('search', documentNumber);
    return url.toString();
  }

  function findButtonByText(label) {
    const wanted = label.toLowerCase();
    return Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(isVisible)
      .find(element => visibleText(element).toLowerCase() === wanted) || null;
  }

  function findToolbarAnchor() {
    return (
      findButtonByText('Refresh') ||
      findButtonByText('Add filter') ||
      findButtonByText('Edit filter') ||
      document.querySelector('button[title*="Refresh" i], [aria-label*="Refresh" i]')
    );
  }

  function insertButton() {
    if (!isSaleListPage()) {
      document.getElementById(BUTTON_ID)?.remove();
      return;
    }

    const anchor = findToolbarAnchor();
    if (!anchor) return;

    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Quote Lines';
      button.addEventListener('click', openPanel);
    }

    const anchorStyle = window.getComputedStyle(anchor);
    button.style.height = anchorStyle.height || '36px';
    button.style.padding = anchorStyle.padding || '0 14px';
    button.style.marginLeft = '8px';
    button.style.border = '1px solid #05cabe';
    button.style.borderRadius = '4px';
    button.style.background = '#05cabe';
    button.style.color = '#fff';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.whiteSpace = 'nowrap';
    button.style.boxSizing = 'border-box';

    if (anchor.nextElementSibling !== button) {
      anchor.insertAdjacentElement('afterend', button);
    }
  }

  function getCells(row) {
    const cellLike = Array.from(row.querySelectorAll('td, th, [role="cell"], [role="gridcell"]'))
      .filter(isVisible);

    if (cellLike.length >= 3) return cellLike.map(visibleText).filter(Boolean);

    return Array.from(row.children || [])
      .filter(isVisible)
      .map(visibleText)
      .filter(Boolean);
  }

  function getRowLink(row) {
    const links = Array.from(row.querySelectorAll('a[href]'))
      .map(link => absoluteUrl(link.getAttribute('href')))
      .filter(Boolean);

    const saleLink = links.find(url => /sale|quote|order/i.test(url));
    return saleLink || links[0] || '';
  }

  function readVisibleSaleRows() {
    const tableRows = Array.from(document.querySelectorAll('tr, [role="row"]')).filter(isVisible);
    const gridRows = Array.from(document.querySelectorAll('div'))
      .filter(isVisible)
      .filter(element => {
        if (element.closest(`#${ROOT_ID}`)) return false;

        const rect = element.getBoundingClientRect();
        const text = visibleText(element);

        return (
          DOCUMENT_RE.test(text) &&
          /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(text) &&
          rect.width > 700 &&
          rect.height >= 28 &&
          rect.height <= 100
        );
      });
    const rows = [...tableRows, ...gridRows].sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.top - br.top || ar.left - br.left;
    });
    const seen = new Set();
    const found = [];

    rows.forEach(row => {
      if (row.closest(`#${ROOT_ID}`)) return;

      const rowText = visibleText(row);
      const docMatch = rowText.match(DOCUMENT_RE);
      if (!docMatch) return;

      const documentNumber = docMatch[0].toUpperCase();
      if (seen.has(documentNumber)) return;

      const cells = getCells(row);
      const documentIndex = cells.findIndex(cell => DOCUMENT_RE.test(cell));
      if (documentIndex < 0) return;

      const status = cells[documentIndex + 1] || '';
      const customer = cells[documentIndex + 2] || '';
      const date = cells.find(cell => /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(cell)) || '';
      const total = cells.find((cell, index) => index > documentIndex + 2 && MONEY_RE.test(cell)) || '';

      seen.add(documentNumber);
      found.push({
        id: documentNumber,
        documentNumber,
        customer,
        status,
        date,
        total,
        url: getRowLink(row),
        lines: [],
        discountSummary: '',
        loadStatus: 'Waiting'
      });
    });

    return found;
  }

  function normalizeHeader(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function headerIndex(headers, names) {
    const wanted = names.map(normalizeHeader);
    return headers.findIndex(header => wanted.some(name => header.includes(name)));
  }

  function parseLineTables(doc) {
    const tables = Array.from(doc.querySelectorAll('table'));
    const allLines = [];

    tables.forEach(table => {
      const rawRows = Array.from(table.querySelectorAll('tr'))
        .map(row => Array.from(row.querySelectorAll('th, td')).map(visibleText))
        .filter(cells => cells.some(Boolean));

      if (rawRows.length < 2) return;

      const headerRowIndex = rawRows.findIndex(cells => {
        const joined = cells.map(normalizeHeader).join('|');
        return /(product|item|sku|description)/.test(joined) && /(qty|quantity|price|discount|total)/.test(joined);
      });

      if (headerRowIndex < 0) return;

      const headers = rawRows[headerRowIndex].map(normalizeHeader);
      const productIndex = headerIndex(headers, ['product', 'item', 'description', 'name']);
      const skuIndex = headerIndex(headers, ['sku', 'code']);
      const qtyIndex = headerIndex(headers, ['qty', 'quantity']);
      const priceIndex = headerIndex(headers, ['unitprice', 'price']);
      const discountIndex = headerIndex(headers, ['discount', 'disc']);
      const totalIndex = headerIndex(headers, ['total', 'amount']);

      rawRows.slice(headerRowIndex + 1).forEach(cells => {
        const product = cells[productIndex] || cells[skuIndex] || '';
        if (!clean(product) || /^additional charges/i.test(product)) return;

        allLines.push({
          sku: skuIndex >= 0 ? cells[skuIndex] || '' : '',
          product,
          qty: qtyIndex >= 0 ? cells[qtyIndex] || '' : '',
          price: priceIndex >= 0 ? cells[priceIndex] || '' : '',
          discount: discountIndex >= 0 ? cells[discountIndex] || '' : '',
          total: totalIndex >= 0 ? cells[totalIndex] || '' : ''
        });
      });
    });

    return allLines;
  }

  function parseLineText(doc) {
    const text = clean(doc.body?.innerText || '');
    const discountMatch = text.match(/discount\s*:?\s*(-?\$?\d+(?:\.\d{1,2})?%?)/i);
    if (!discountMatch) return [];

    return [{
      sku: '',
      product: 'Could not read line table',
      qty: '',
      price: '',
      discount: discountMatch[1],
      total: ''
    }];
  }

  function summarizeDiscount(lines) {
    const values = lines
      .map(line => clean(line.discount))
      .filter(value => value && !/^0(?:\.00)?%?$/.test(value) && value !== '$0.00');

    return values.length ? values.join(', ') : 'No discount found';
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

  async function loadWorkflowQuoteDetails(quote) {
    const data = await requestJson(workflowSalesUrl(quote.documentNumber));
    if (!data?.sale) throw new Error('Workflow did not find this quote in Cin7 Core.');

    const lineItems = Array.isArray(data.sale.lineItems)
      ? data.sale.lineItems.map(normalizeWorkflowLine).filter(line => line.product || line.sku)
      : [];

    quote.customer = clean(data.sale.customer) || quote.customer;
    quote.status = clean(data.sale.status) || quote.status;
    quote.total = data.sale.invoiceAmount !== null && data.sale.invoiceAmount !== undefined
      ? String(data.sale.invoiceAmount)
      : quote.total;
    quote.url = quote.url || (data.sale.id ? `https://inventory.dearsystems.com/Sale#${data.sale.id}` : '');

    return lineItems;
  }

  async function fetchDetailDocument(url) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lines = parseLineTables(doc);
    if (lines.length) return { doc, lines };

    return { doc, lines: parseLineText(doc) };
  }

  async function frameDetailDocument(url) {
    let frame = document.getElementById(FRAME_ID);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = FRAME_ID;
      frame.title = 'Quote line review reader';
      frame.style.position = 'fixed';
      frame.style.left = '-10000px';
      frame.style.top = '0';
      frame.style.width = '1200px';
      frame.style.height = '900px';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      document.body.appendChild(frame);
    }

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timed out loading detail page')), 12000);
      frame.onload = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      frame.src = url;
    });

    await wait(2200);

    const doc = frame.contentDocument;
    if (!doc) throw new Error('Could not read detail page');

    const lines = parseLineTables(doc);
    return { doc, lines: lines.length ? lines : parseLineText(doc) };
  }

  async function loadQuoteDetails() {
    if (loading) return;
    loading = true;
    setStatus(`Loading ${quotes.length} visible quotes...`);
    renderQuotes();

    for (let index = 0; index < quotes.length; index += 1) {
      const quote = quotes[index];
      quote.loadStatus = `Loading ${index + 1} of ${quotes.length}`;
      renderQuotes();

      try {
        let lines = await loadWorkflowQuoteDetails(quote);

        if (!lines.length && quote.url) {
          let result = await fetchDetailDocument(quote.url);
          if (!result.lines.length) result = await frameDetailDocument(quote.url);
          lines = result.lines;
        }

        quote.lines = lines;
        quote.discountSummary = summarizeDiscount(lines);
        quote.loadStatus = lines.length ? 'Loaded from Cin7 Core' : 'No line items found';
      } catch (error) {
        try {
          if (!quote.url) throw error;
          const result = await frameDetailDocument(quote.url);
          quote.lines = result.lines;
          quote.discountSummary = summarizeDiscount(result.lines);
          quote.loadStatus = result.lines.length ? 'Loaded' : 'Could not read line items';
        } catch (frameError) {
          quote.loadStatus = frameError.message || error.message || 'Could not read line items';
        }
      }

      renderQuotes();
      await wait(250);
    }

    loading = false;
    setStatus(`Loaded ${quotes.filter(quote => quote.lines.length).length} of ${quotes.length} visible quotes.`);
  }

  function getFilteredQuotes() {
    const root = document.getElementById(ROOT_ID);
    const shadow = root?.shadowRoot;
    const query = clean(shadow?.getElementById('lc-ql-search')?.value).toLowerCase();
    const discountsOnly = Boolean(shadow?.getElementById('lc-ql-discounts-only')?.checked);

    return quotes.filter(quote => {
      const haystack = [
        quote.documentNumber,
        quote.customer,
        quote.status,
        quote.date,
        quote.discountSummary,
        ...quote.lines.flatMap(line => [line.sku, line.product, line.discount])
      ].join(' ').toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (discountsOnly && !quote.lines.some(line => {
        const discount = clean(line.discount);
        return discount && !/^0(?:\.00)?%?$/.test(discount) && discount !== '$0.00';
      })) return false;

      return true;
    });
  }

  function renderQuotes() {
    const root = document.getElementById(ROOT_ID);
    const list = root?.shadowRoot?.getElementById('lc-ql-list');
    const count = root?.shadowRoot?.getElementById('lc-ql-count');
    if (!list) return;

    const filtered = getFilteredQuotes();
    if (count) count.textContent = `${filtered.length} shown / ${quotes.length} visible`;

    if (!quotes.length) {
      list.innerHTML = '<div class="empty">No visible quote rows found on this Sale List page.</div>';
      return;
    }

    list.innerHTML = filtered.map(quote => {
      const linesHtml = quote.lines.length
        ? quote.lines.map(line => `
          <tr>
            <td>${escapeHtml(line.sku)}</td>
            <td>${escapeHtml(line.product)}</td>
            <td>${escapeHtml(line.qty)}</td>
            <td>${escapeHtml(line.price)}</td>
            <td class="${clean(line.discount) && !/^0(?:\.00)?%?$/.test(clean(line.discount)) ? 'discount' : ''}">${escapeHtml(line.discount)}</td>
            <td>${escapeHtml(line.total)}</td>
          </tr>
        `).join('')
        : `<tr><td colspan="6" class="muted">${escapeHtml(quote.loadStatus)}</td></tr>`;

      return `
        <article class="quote">
          <div class="quote-head">
            <div>
              <strong>${escapeHtml(quote.documentNumber)}</strong>
              <span>${escapeHtml(quote.customer || 'Customer not found')}</span>
            </div>
            <div class="meta">
              <span>${escapeHtml(quote.date)}</span>
              <span>${escapeHtml(quote.status)}</span>
              <span>${escapeHtml(quote.discountSummary || quote.loadStatus)}</span>
              ${quote.url ? `<a href="${escapeHtml(quote.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
            </div>
          </div>
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
            <tbody>${linesHtml}</tbody>
          </table>
        </article>
      `;
    }).join('') || '<div class="empty">No quotes match the current filter.</div>';
  }

  function setStatus(message) {
    const root = document.getElementById(ROOT_ID);
    const status = root?.shadowRoot?.getElementById('lc-ql-status');
    if (status) status.textContent = message || '';
  }

  function buildCsv() {
    const rows = [['Quote Number', 'Customer', 'Status', 'Date', 'SKU', 'Line Item', 'Qty', 'Price', 'Discount', 'Total']];
    getFilteredQuotes().forEach(quote => {
      const lines = quote.lines.length ? quote.lines : [{ sku: '', product: quote.loadStatus, qty: '', price: '', discount: '', total: '' }];
      lines.forEach(line => {
        rows.push([
          quote.documentNumber,
          quote.customer,
          quote.status,
          quote.date,
          line.sku,
          line.product,
          line.qty,
          line.price,
          line.discount,
          line.total
        ]);
      });
    });

    return rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  async function copyCsv() {
    const csv = buildCsv();
    await navigator.clipboard.writeText(csv);
    setStatus('Copied the shown rows as CSV.');
  }

  function scanVisibleRows() {
    quotes = readVisibleSaleRows();
    setStatus(`${quotes.length} visible quote rows found. Click Load line items to read the details.`);
    renderQuotes();
  }

  function openPanel() {
    ensureRoot();
    document.getElementById(ROOT_ID).shadowRoot.getElementById('lc-ql-modal').classList.add('open');
    scanVisibleRows();
  }

  function closePanel() {
    document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('lc-ql-modal')?.classList.remove('open');
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
        #lc-ql-modal {
          position: fixed;
          inset: 0;
          display: none;
          background: rgba(24, 34, 42, .35);
          z-index: 2147483647;
          color: #2f3742;
        }
        #lc-ql-modal.open { display: block; }
        .panel {
          position: absolute;
          inset: 42px;
          display: grid;
          grid-template-rows: auto 1fr;
          min-width: 760px;
          background: #fff;
          border: 1px solid #c8d3df;
          border-radius: 8px;
          box-shadow: 0 24px 70px rgba(22, 30, 36, .24);
          overflow: hidden;
        }
        .header {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          padding: 14px 16px;
          background: #0f6f78;
          color: #fff;
        }
        h2 {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          letter-spacing: 0;
        }
        .sub {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(255,255,255,.82);
        }
        .close {
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
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid #dde5ed;
          background: #f7fafc;
        }
        input[type="search"] {
          width: 280px;
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
        button.primary {
          border-color: #05cabe;
          background: #05cabe;
          color: #fff;
        }
        #lc-ql-count {
          margin-left: auto;
          font: 700 12px Arial, sans-serif;
          color: #5a6875;
        }
        #lc-ql-status {
          padding: 8px 16px;
          min-height: 18px;
          border-bottom: 1px solid #dde5ed;
          color: #2d5c4e;
          font: 700 12px Arial, sans-serif;
        }
        #lc-ql-list {
          overflow: auto;
          padding: 14px 16px 18px;
          background: #eef3f7;
        }
        .quote {
          background: #fff;
          border: 1px solid #d9e2ea;
          border-radius: 6px;
          margin-bottom: 12px;
          overflow: hidden;
        }
        .quote-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 10px 12px;
          border-bottom: 1px solid #e4ebf1;
        }
        .quote-head strong {
          display: inline-block;
          min-width: 110px;
          color: #24323d;
          font-size: 14px;
        }
        .quote-head span {
          color: #4f5c68;
          font-size: 13px;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 10px;
          text-align: right;
        }
        .meta a {
          color: #087d76;
          font-weight: 700;
          text-decoration: none;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 12px;
        }
        th, td {
          padding: 8px 10px;
          border-bottom: 1px solid #eef2f5;
          text-align: left;
          vertical-align: top;
          overflow-wrap: anywhere;
        }
        th {
          color: #667384;
          background: #fbfcfd;
          font-weight: 700;
        }
        th:nth-child(1), td:nth-child(1) { width: 120px; }
        th:nth-child(3), td:nth-child(3) { width: 70px; }
        th:nth-child(4), td:nth-child(4),
        th:nth-child(5), td:nth-child(5),
        th:nth-child(6), td:nth-child(6) { width: 100px; }
        .discount {
          color: #a43d20;
          font-weight: 700;
        }
        .muted, .empty {
          color: #6c7884;
          font-weight: 700;
        }
        .empty {
          padding: 22px;
          background: #fff;
          border: 1px solid #d9e2ea;
          border-radius: 6px;
        }
      </style>
      <div id="lc-ql-modal" role="dialog" aria-modal="true" aria-labelledby="lc-ql-title">
        <div class="panel">
          <div>
            <div class="header">
              <div>
                <h2 id="lc-ql-title">Quote Line Review</h2>
                <div class="sub">Read-only view of the visible Cin7 Sale List rows.</div>
              </div>
              <button type="button" class="close" id="lc-ql-close" aria-label="Close">x</button>
            </div>
            <div class="toolbar">
              <button type="button" class="action" id="lc-ql-rescan">Rescan list</button>
              <button type="button" class="action primary" id="lc-ql-load">Load line items</button>
              <button type="button" class="action" id="lc-ql-copy">Copy CSV</button>
              <input id="lc-ql-search" type="search" placeholder="Search quote, customer, SKU" />
              <label><input id="lc-ql-discounts-only" type="checkbox" /> Discounts only</label>
              <div id="lc-ql-count"></div>
            </div>
            <div id="lc-ql-status"></div>
          </div>
          <div id="lc-ql-list"></div>
        </div>
      </div>
    `;

    shadow.getElementById('lc-ql-close').addEventListener('click', closePanel);
    shadow.getElementById('lc-ql-modal').addEventListener('click', event => {
      if (event.target?.id === 'lc-ql-modal') closePanel();
    });
    shadow.getElementById('lc-ql-rescan').addEventListener('click', scanVisibleRows);
    shadow.getElementById('lc-ql-load').addEventListener('click', loadQuoteDetails);
    shadow.getElementById('lc-ql-copy').addEventListener('click', copyCsv);
    shadow.getElementById('lc-ql-search').addEventListener('input', renderQuotes);
    shadow.getElementById('lc-ql-discounts-only').addEventListener('change', renderQuotes);

    return root;
  }

  function boot() {
    if (!document.body) return;
    ensureRoot();
    insertButton();
  }

  boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 3000);

  new MutationObserver(insertButton).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
