// ==UserScript==
// @name         HubSpot Living Culture Quote Line Review
// @namespace    livingculture-hubspot
// @version      1.1
// @description  Reviews visible HubSpot quote deals by stage, with customer, quote number, line items, and Cin7 discounts.
// @match        https://app.hubspot.com/*
// @match        https://*.hubspot.com/*
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
  const QUOTE_RE = /\bNZSO-\d+\b/i;
  const INCLUDED_STAGE_RE = /quote\s*[-–]\s*quote sent|quote sent|followed up|follow\s*up|waiting on customer/i;

  let deals = [];
  let loading = false;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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

  function findDealUrl(row) {
    const link = Array.from(row.querySelectorAll('a[href]'))
      .find(anchor => /\/contacts\/\d+\/(?:record\/)?deal\//i.test(anchor.href) || /\/deal\//i.test(anchor.href));
    return link?.href || '';
  }

  function dealFromCells(cells, row) {
    const dealNameIndex = cells.findIndex(cell => QUOTE_RE.test(cell) || /deal name/i.test(cell));
    const stageIndex = cells.findIndex(cell => INCLUDED_STAGE_RE.test(cell));
    if (dealNameIndex < 0 || stageIndex < 0) return null;

    const dealName = cells[dealNameIndex];
    if (/deal name/i.test(dealName)) return null;

    const quoteNumber = dealName.match(QUOTE_RE)?.[0]?.toUpperCase() || '';
    const contactIndex = Math.min(dealNameIndex + 1, cells.length - 1);
    const lineItemIndex = cells.findIndex((cell, index) => index > dealNameIndex && (/records?$/i.test(cell) || (index < stageIndex && index > contactIndex + 1)));
    const statusIndex = cells.findIndex(cell => /phoned|emailed|texted|called|--/i.test(cell));

    return {
      id: quoteNumber || dealName,
      quoteNumber,
      dealName,
      customer: cells[contactIndex] || '',
      hubspotLineItems: lineItemIndex >= 0 ? cells[lineItemIndex] : '',
      salesNote: cells.find((cell, index) => index > contactIndex && index < stageIndex && !/records?$/i.test(cell)) || '',
      status: statusIndex >= 0 ? cells[statusIndex] : '',
      stage: cells[stageIndex],
      lastActivity: cells[stageIndex + 1] || '',
      url: findDealUrl(row),
      cin7Lines: [],
      discountSummary: '',
      loadStatus: quoteNumber ? 'Waiting' : 'No quote number'
    };
  }

  function readVisibleHubSpotDeals() {
    const rows = Array.from(document.querySelectorAll('[role="row"], tr'))
      .filter(isVisible)
      .filter(row => !row.closest(`#${ROOT_ID}`));
    const seen = new Set();
    const found = [];

    rows.forEach(row => {
      const cells = cellTexts(row);
      if (!cells.length || !cells.some(cell => INCLUDED_STAGE_RE.test(cell))) return;

      const deal = dealFromCells(cells, row);
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
    const discountsOnly = Boolean(shadow?.getElementById('lc-hs-discounts-only')?.checked);

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
      if (discountsOnly && !deal.cin7Lines.some(line => hasDiscount(line.discount))) return false;
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
              <strong>${escapeHtml(deal.quoteNumber || deal.dealName)}</strong>
              <span>${escapeHtml(deal.customer || 'Customer not found')}</span>
            </div>
            <div class="meta">
              <span>${escapeHtml(deal.stage)}</span>
              <span>${escapeHtml(deal.status)}</span>
              <span>${escapeHtml(deal.discountSummary || deal.loadStatus)}</span>
              ${deal.url ? `<a href="${escapeHtml(deal.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
            </div>
          </div>
          ${deal.salesNote ? `<div class="note">${escapeHtml(deal.salesNote)}</div>` : ''}
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
    const rows = [['Quote Number', 'Deal Name', 'Customer', 'Stage', 'Status', 'HubSpot Line Items', 'SKU', 'Line Item', 'Qty', 'Price', 'Discount', 'Total', 'Deal URL']];

    filteredDeals().forEach(deal => {
      const lines = deal.cin7Lines.length ? deal.cin7Lines : [{ sku: '', product: deal.hubspotLineItems || deal.loadStatus, qty: '', price: '', discount: '', total: '' }];
      lines.forEach(line => {
        rows.push([
          deal.quoteNumber,
          deal.dealName,
          deal.customer,
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

  function openPanel() {
    ensureRoot();
    document.getElementById(ROOT_ID).shadowRoot.getElementById('lc-hs-modal').classList.add('open');
    scanDeals();
  }

  function closePanel() {
    document.getElementById(ROOT_ID)?.shadowRoot?.getElementById('lc-hs-modal')?.classList.remove('open');
  }

  function findHubSpotToolbarAnchor() {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(isVisible);
    return buttons.find(button => /add deals?/i.test(textOf(button))) ||
      buttons.find(button => /export/i.test(textOf(button)));
  }

  function ensureButton() {
    if (!/hubspot\.com$/i.test(window.location.hostname)) return;

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
          background: rgba(24, 34, 42, .35);
          z-index: 2147483647;
          color: #2f3742;
        }
        #lc-hs-modal.open { display: block; }
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
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          background: #0f6f78;
          color: #fff;
        }
        h2 { margin: 0; font-size: 18px; line-height: 1.2; letter-spacing: 0; }
        .sub { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,.82); }
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
        button.primary { border-color: #05cabe; background: #05cabe; color: #fff; }
        #lc-hs-count { margin-left: auto; font: 700 12px Arial, sans-serif; color: #5a6875; }
        #lc-hs-status {
          padding: 8px 16px;
          min-height: 18px;
          border-bottom: 1px solid #dde5ed;
          color: #2d5c4e;
          font: 700 12px Arial, sans-serif;
        }
        #lc-hs-list { overflow: auto; padding: 14px 16px 18px; background: #eef3f7; }
        .deal {
          background: #fff;
          border: 1px solid #d9e2ea;
          border-radius: 6px;
          margin-bottom: 12px;
          overflow: hidden;
        }
        .deal-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 10px 12px;
          border-bottom: 1px solid #e4ebf1;
        }
        .deal-head strong { display: inline-block; min-width: 110px; color: #24323d; font-size: 14px; }
        .deal-head span, .meta span { color: #4f5c68; font-size: 13px; }
        .meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; text-align: right; }
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
        th:nth-child(1), td:nth-child(1) { width: 120px; }
        th:nth-child(3), td:nth-child(3) { width: 70px; }
        th:nth-child(4), td:nth-child(4),
        th:nth-child(5), td:nth-child(5),
        th:nth-child(6), td:nth-child(6) { width: 100px; }
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
              <button type="button" class="close" id="lc-hs-close" aria-label="Close">x</button>
            </div>
            <div class="toolbar">
              <button type="button" class="action" id="lc-hs-rescan">Rescan HubSpot</button>
              <button type="button" class="action primary" id="lc-hs-load">Load Cin7 discounts</button>
              <button type="button" class="action" id="lc-hs-copy">Copy CSV</button>
              <input id="lc-hs-search" type="search" placeholder="Search quote, customer, SKU" />
              <label><input id="lc-hs-discounts-only" type="checkbox" /> Discounts only</label>
              <div id="lc-hs-count"></div>
            </div>
            <div id="lc-hs-status"></div>
          </div>
          <div id="lc-hs-list"></div>
        </div>
      </div>
    `;

    shadow.getElementById('lc-hs-close').addEventListener('click', closePanel);
    shadow.getElementById('lc-hs-modal').addEventListener('click', event => {
      if (event.target?.id === 'lc-hs-modal') closePanel();
    });
    shadow.getElementById('lc-hs-rescan').addEventListener('click', scanDeals);
    shadow.getElementById('lc-hs-load').addEventListener('click', loadDealLines);
    shadow.getElementById('lc-hs-copy').addEventListener('click', copyCsv);
    shadow.getElementById('lc-hs-search').addEventListener('input', renderDeals);
    shadow.getElementById('lc-hs-discounts-only').addEventListener('change', renderDeals);

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
