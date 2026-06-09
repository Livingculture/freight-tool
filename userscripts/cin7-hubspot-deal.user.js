// ==UserScript==
// @name         Cin7 Living Culture HubSpot Deal
// @namespace    https://livingculture.co.nz/
// @version      1.0
// @description  Adds a standalone HubSpot Deal button to Cin7 simple sale pages.
// @author       Living Culture
// @match        https://inventory.dearsystems.com/Sale*
// @grant        GM_xmlhttpRequest
// @connect      living-culture-freight.vercel.app
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-hubspot-deal.user.js?v=1.0
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-hubspot-deal.user.js?v=1.0
// ==/UserScript==

(function () {
  'use strict';

  const HUBSPOT_BUTTON_ID = 'lc-hubspot-deal-inline-button-v1';
  const ACTION_ROW_ID = 'lc-cin7-action-row-v1';
  const HUBSPOT_API_URL = 'https://living-culture-freight.vercel.app/api/hubspot/create-deal';
  let lastHandledAt = 0;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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
    return ['AKL', 'PEN', 'CHCH', 'HAM', 'TGA', 'WHG', 'NPE'].includes(code) ? code : '';
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

  function productCompareKey(value) {
    return cleanProductLine(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
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

  function placeHubSpotButton(button) {
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
    button.style.justifySelf = 'end';
    button.style.gridColumn = '3';
    row.appendChild(button);
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

  function readMoneyNearLabels(labels) {
    for (const label of labels) {
      const value = readValueNearLabel(label);
      if (/\d/.test(value || '')) return value;
    }

    const moneyPattern = /(?:NZ)?\$\s*-?\d[\d,]*(?:\.\d{1,2})?|-?\d[\d,]*\.\d{2}/i;
    const bodyText = document.body ? document.body.innerText : '';
    const lines = bodyText.split('\n').map(clean).filter(Boolean);
    const wantedLabels = labels.map(normalizeLabel);
    for (let index = 0; index < lines.length; index += 1) {
      const normalisedLine = normalizeLabel(lines[index]);
      if (!wantedLabels.some(label => normalisedLine === label || normalisedLine.startsWith(label))) continue;
      const nearby = lines.slice(index, index + 4).join(' ');
      const match = nearby.match(moneyPattern);
      if (match) return match[0];
    }

    const moneyMatches = bodyText.match(new RegExp(moneyPattern.source, 'gi')) || [];
    return moneyMatches.length ? moneyMatches.at(-1) : '';
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

  function extractQuoteProductLines() {
    const products = [];
    const tables = Array.from(document.querySelectorAll('table')).filter(isVisible);

    for (const table of tables) {
      const headerCells = Array.from(table.querySelectorAll('thead th, tr th'))
        .map((cell) => normalizeLabel(cell.textContent || ''));
      if (!headerCells.includes('product') || !headerCells.includes('quantity') || !headerCells.includes('price')) continue;

      const rows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(isVisible);
      for (const row of rows) {
        const rowText = clean(row.textContent || '');
        if (!rowText || /^total:?$/i.test(rowText) || /^add more items/i.test(rowText)) continue;
        if (/\b[A-Z]{1,8}\d{3,}(?:-\d+)?\b/.test(rowText) === false) continue;
        const productCell = row.querySelector('td:nth-child(2), th:nth-child(2)') || row.querySelector('td,th');
        const productLink = productCell?.querySelector('a') || row.querySelector('a');
        const productText = cleanProductLine(
          productLink?.textContent ||
          productLink?.getAttribute('title') ||
          productLink?.getAttribute('aria-label') ||
          ''
        );
        if (productText) products.push(productText);
      }
    }

    const unique = [];
    const seen = new Set();
    for (const line of products) {
      const key = productCompareKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(cleanProductLine(line));
    }
    return unique.slice(0, 8);
  }

  function extractProductLines() {
    const quoteProducts = extractQuoteProductLines();
    if (quoteProducts.length) return quoteProducts.join(' | ');

    const products = Array.from(document.querySelectorAll('table a'))
      .filter(isVisible)
      .map((anchor) => getAnchorBestProductText(anchor))
      .filter(Boolean);

    const unique = [];
    const seen = new Set();
    for (const line of products) {
      const key = productCompareKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(cleanProductLine(line));
    }
    return unique.slice(0, 8).join(' | ');
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
    let productText = extractProductLines();
    if (productText && customerName && clean(productText).toLowerCase() === clean(customerName).toLowerCase()) {
      productText = '';
    }

    return {
      orderId: referenceOrderId || titleOrderId || pageOrderId || reference,
      placedBy: rep,
      customerName,
      address: clean(`${address1} ${address2}`),
      phone: readValueNearLabel('Phone'),
      email: readValueNearLabel('Email'),
      product: productText,
      area: deriveBranchFromRep(rep),
      sourceUrl: window.location.href
    };
  }

  function hubspotDraft() {
    const draft = cin7Draft();
    const amount = readMoneyNearLabels([
      'Total',
      'Grand total',
      'Order total',
      'Sale total',
      'Total after tax',
      'Total before tax'
    ]);

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

  function submitHubSpotDeal(button) {
    const payload = hubspotDraft();
    const summary = [
      payload.orderId ? `Sale: ${payload.orderId}` : '',
      payload.customerName ? `Customer: ${payload.customerName}` : '',
      payload.amount ? `Amount: ${payload.amount}` : ''
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
            window.alert(`${message}\n\n${linkStatus}\n\nHubSpot link copied:\n${data.hubspotUrl}`);
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

  function handleHubSpotClick(button) {
    const now = Date.now();
    if (now - lastHandledAt < 900) return;
    lastHandledAt = now;
    try {
      submitHubSpotDeal(button);
    } catch (error) {
      const message = error && error.message ? error.message : String(error || 'Unknown error');
      console.error('[LC HubSpot Deal] Button action failed:', error);
      window.alert(`HubSpot button failed:\n\n${message}`);
    }
  }

  function styleHubSpotButton(button) {
    button.style.background = '#ff5c35';
    button.style.color = '#fff';
    button.style.border = '1px solid #ff5c35';
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

  function wireHubSpotButton(button) {
    if (!button || button.dataset.lcHubSpotWired === '1') return;
    button.dataset.lcHubSpotWired = '1';
    const run = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleHubSpotClick(button);
    };
    ['pointerdown', 'mousedown', 'click'].forEach((eventName) => {
      button.addEventListener(eventName, run, true);
    });
    button.onclick = run;
  }

  function addHubSpotButton() {
    let button = document.getElementById(HUBSPOT_BUTTON_ID);
    if (button) {
      wireHubSpotButton(button);
      placeHubSpotButton(button);
      return;
    }

    const commentsAnchor = findCommentsAnchor();
    const anchor = commentsAnchor || findButtonByLabel('Install Fees') || findButtonByLabel('Scan');
    if (!anchor) return;

    button = document.createElement('button');
    button.id = HUBSPOT_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'HubSpot Deal';
    styleHubSpotButton(button);
    wireHubSpotButton(button);

    if (commentsAnchor && placeHubSpotButton(button)) return;
    anchor.insertAdjacentElement('afterend', button);
  }

  let buttonPassScheduled = false;

  function scheduleButtonPass() {
    if (buttonPassScheduled) return;
    buttonPassScheduled = true;
    window.requestAnimationFrame(() => {
      buttonPassScheduled = false;
      addHubSpotButton();
    });
  }

  function boot() {
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

  const observer = new MutationObserver(scheduleButtonPass);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', scheduleButtonPass);
})();
