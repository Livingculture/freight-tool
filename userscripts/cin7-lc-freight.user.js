// ==UserScript==
// @name         Cin7 Living Culture Freight
// @namespace    livingculture
// @version      3.0
// @description  Opens a Living Culture freight panel inside Cin7 with auto and manual lookup modes.
// @match        *://*.cin7.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'http://localhost:3001';
  const state = {
    price: '',
    priceNumber: '',
    method: '',
    selectedAddress: '',
    addressTimer: null
  };

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function moneyToNumber(value) {
    const match = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
    return match ? Number(match[1]).toFixed(4) : '';
  }

  function setNativeValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function findTextNodeElement(pattern) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const text = clean(node.childNodes.length === 1 ? node.textContent : '');
      if (text && pattern.test(text)) return node;
      node = walker.nextNode();
    }
    return null;
  }

  function getFieldValueByLabel(labelText) {
    const labelPattern = new RegExp(labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const labelled = Array.from(document.querySelectorAll('label, legend, span, div'))
      .find(element => labelPattern.test(clean(element.textContent)));

    if (labelled) {
      const container = labelled.closest('fieldset, .form-group, .field, div') || labelled.parentElement;
      const field = container?.querySelector('input, textarea, select, [contenteditable="true"]');
      if (field) return clean(field.value || field.textContent);

      let sibling = labelled.nextElementSibling;
      while (sibling) {
        const nextField = sibling.matches?.('input, textarea, select, [contenteditable="true"]')
          ? sibling
          : sibling.querySelector?.('input, textarea, select, [contenteditable="true"]');
        if (nextField) return clean(nextField.value || nextField.textContent);
        sibling = sibling.nextElementSibling;
      }
    }

    const pageText = document.body.innerText || '';
    const lines = pageText.split('\n').map(clean).filter(Boolean);
    const index = lines.findIndex(line => labelPattern.test(line));
    return index >= 0 ? clean(lines[index + 1]) : '';
  }

  function getSkuFromCin7() {
    const links = Array.from(document.querySelectorAll('table a, a'));
    for (const link of links) {
      const text = clean(link.textContent);
      const sku = text.match(/^([A-Z]{1,6}\d{3,}(?:-\d+)?)\s*:/i)?.[1];
      if (sku) return sku.toUpperCase();
    }

    const textMatch = (document.body.innerText || '').match(/\b([A-Z]{1,6}\d{3,}(?:-\d+)?)\s*:/i);
    return textMatch ? textMatch[1].toUpperCase() : '';
  }

  function getAddressFromCin7() {
    const line1 = getFieldValueByLabel('Shipping address line 1');
    const line2 = getFieldValueByLabel('Shipping address line 2');
    return clean([line1, line2].filter(Boolean).join(', '));
  }

  function findShippingPriceInput() {
    const rows = Array.from(document.querySelectorAll('tr, [role="row"], .row, div'));
    const shippingRows = rows
      .filter(row => /Shipping\s*-\s*Ship from/i.test(clean(row.textContent)) || /\bShipping\b/i.test(clean(row.textContent)))
      .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length);

    for (const row of shippingRows) {
      const inputs = Array.from(row.querySelectorAll('input'));
      const priceInput = inputs.find(input => /number|text|tel|decimal|currency/i.test(input.type || 'text'));
      if (priceInput) return priceInput;
    }

    const additionalCharges = findTextNodeElement(/Additional charges and services/i);
    const section = additionalCharges?.parentElement?.parentElement || additionalCharges?.closest('section, div');
    const inputs = Array.from((section || document).querySelectorAll('input'));
    return inputs.find(input => /^(?:0|0\.0000|\d+(?:\.\d{1,4})?)$/.test(clean(input.value)));
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById('lc-freight-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = isError ? '#9a2d20' : '#405f54';
  }

  function setResult(price, method = '') {
    state.price = price || '';
    state.priceNumber = moneyToNumber(price);
    state.method = method || '';
    document.getElementById('lc-freight-result').textContent = price ? `Freight: ${price}` : 'Freight: -';
    document.getElementById('lc-freight-method').textContent = method || '';
  }

  async function requestFreight({ sku, address, quantity = 1 }) {
    const isUrl = /^https?:\/\/.+\/products\//i.test(sku);
    const response = await fetch(`${API_BASE}/get-freight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: isUrl ? '' : sku,
        productUrl: isUrl ? sku : '',
        address,
        selectedAddress: state.selectedAddress || address,
        quantity
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.price) {
      throw new Error(data.error || 'No freight returned');
    }
    return data;
  }

  async function useCin7Details() {
    setStatus('Reading Cin7 details...');
    const sku = getSkuFromCin7();
    const address = getAddressFromCin7();
    document.getElementById('lc-auto-sku').textContent = sku || '-';
    document.getElementById('lc-auto-address').textContent = address || '-';

    if (!sku || !address) {
      setStatus('Could not detect SKU or shipping address from Cin7.', true);
      return;
    }

    await getAndApplyFreight({ sku, address, fill: true });
  }

  async function getManualFreight() {
    const sku = clean(document.getElementById('lc-manual-sku').value);
    const address = clean(document.getElementById('lc-manual-address').value);
    if (!sku || !address) {
      setStatus('Enter a SKU/product URL and address first.', true);
      return;
    }
    await getAndApplyFreight({ sku, address, fill: false });
  }

  async function getAndApplyFreight({ sku, address, fill }) {
    try {
      setStatus('Getting freight...');
      const data = await requestFreight({ sku, address });
      setResult(data.price, data.method);
      await copyPrice(false);
      if (fill) fillCin7PriceField(false);
      setStatus(fill ? 'Freight applied.' : 'Freight loaded.');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Error getting freight.', true);
    }
  }

  async function copyPrice(showStatus = true) {
    if (!state.price) {
      setStatus('No freight price to copy.', true);
      return;
    }
    await navigator.clipboard.writeText(state.price);
    if (showStatus) setStatus(`Copied ${state.price}`);
  }

  function fillCin7PriceField(showStatus = true) {
    if (!state.priceNumber) {
      setStatus('No freight price to fill.', true);
      return;
    }
    const input = findShippingPriceInput();
    if (!input) {
      setStatus('Could not find the Cin7 shipping price field.', true);
      return;
    }
    setNativeValue(input, state.priceNumber);
    if (showStatus) setStatus(`Filled Cin7 price field with ${state.price}`);
  }

  async function loadAddressSuggestions() {
    const sku = clean(document.getElementById('lc-manual-sku').value);
    const address = clean(document.getElementById('lc-manual-address').value);
    const isUrl = /^https?:\/\/.+\/products\//i.test(sku);
    const list = document.getElementById('lc-address-suggestions');
    state.selectedAddress = '';
    list.innerHTML = '';

    if (sku.length < 2 || address.length < 4) return;

    try {
      setStatus('Getting address suggestions...');
      const response = await fetch(`${API_BASE}/address-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: isUrl ? '' : sku, productUrl: isUrl ? sku : '', address })
      });
      const data = await response.json().catch(() => ({}));
      const suggestions = data.suggestions || [];
      list.innerHTML = suggestions.map(suggestion =>
        `<button type="button" class="lc-suggestion">${suggestion.replace(/[&<>"']/g, char => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]))}</button>`
      ).join('');
      setStatus(suggestions.length ? 'Select an address suggestion, or get freight manually.' : 'No address suggestions found.');
    } catch (error) {
      console.error(error);
      setStatus('Address suggestions unavailable. You can still get freight manually.');
    }
  }

  function renderDetectedDetails() {
    document.getElementById('lc-auto-sku').textContent = getSkuFromCin7() || '-';
    document.getElementById('lc-auto-address').textContent = getAddressFromCin7() || '-';
  }

  function createPanel() {
    if (document.getElementById('lc-freight-panel')) return;

    const button = document.createElement('button');
    button.id = 'lc-freight-toggle';
    button.textContent = 'LC Freight';

    const panel = document.createElement('div');
    panel.id = 'lc-freight-panel';
    panel.innerHTML = `
      <div class="lc-panel-head">
        <strong>Living Culture Freight</strong>
        <button type="button" id="lc-panel-close">×</button>
      </div>

      <div class="lc-block">
        <div class="lc-label">Detected from Cin7</div>
        <div><b>SKU:</b> <span id="lc-auto-sku">-</span></div>
        <div><b>Address:</b> <span id="lc-auto-address">-</span></div>
        <button type="button" id="lc-use-cin7">Use Cin7 details</button>
      </div>

      <div class="lc-block">
        <div class="lc-label">Manual lookup</div>
        <input id="lc-manual-sku" placeholder="SKU or product URL" />
        <input id="lc-manual-address" placeholder="Address" />
        <div id="lc-address-suggestions"></div>
        <button type="button" id="lc-manual-get">Get freight manually</button>
      </div>

      <div class="lc-block lc-result-block">
        <div id="lc-freight-result">Freight: -</div>
        <div id="lc-freight-method"></div>
        <button type="button" id="lc-fill-price">Fill Cin7 price field</button>
        <button type="button" id="lc-copy-price">Copy price</button>
      </div>

      <div id="lc-freight-status"></div>
    `;

    const styles = document.createElement('style');
    styles.textContent = `
      #lc-freight-toggle {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        padding: 10px 14px;
        background: #2d5c4e;
        color: #fff;
        border: 0;
        border-radius: 8px;
        font: 700 14px Arial, sans-serif;
        cursor: pointer;
      }
      #lc-freight-panel {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 2147483647;
        width: 340px;
        max-height: calc(100vh - 110px);
        overflow: auto;
        display: none;
        padding: 14px;
        color: #1f2b24;
        background: #fffefb;
        border: 1px solid #d9d6cc;
        border-radius: 12px;
        box-shadow: 0 20px 44px rgba(34, 48, 40, 0.18);
        font: 14px/1.4 Arial, sans-serif;
      }
      #lc-freight-panel.is-open { display: block; }
      .lc-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        font-size: 16px;
      }
      #lc-panel-close {
        width: 28px;
        height: 28px;
        color: #1f2b24;
        background: #f3f1e8;
        border: 1px solid #d9d6cc;
        border-radius: 6px;
        cursor: pointer;
      }
      .lc-block {
        display: grid;
        gap: 8px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #ebe7dc;
      }
      .lc-label {
        color: #637061;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 11px;
      }
      #lc-freight-panel input {
        width: 100%;
        padding: 9px 10px;
        border: 1px solid #d9d6cc;
        border-radius: 8px;
        font: inherit;
      }
      #lc-freight-panel button:not(#lc-panel-close) {
        padding: 9px 10px;
        color: #fff;
        background: #2d5c4e;
        border: 0;
        border-radius: 8px;
        font-weight: 700;
        cursor: pointer;
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
      .lc-result-block {
        grid-template-columns: 1fr 1fr;
      }
      #lc-freight-result,
      #lc-freight-method {
        grid-column: 1 / -1;
      }
      #lc-freight-result {
        font-weight: 800;
        font-size: 18px;
      }
      #lc-freight-status {
        min-height: 20px;
        margin-top: 10px;
        color: #405f54;
      }
    `;

    document.head.appendChild(styles);
    document.body.append(button, panel);

    button.addEventListener('click', () => {
      panel.classList.toggle('is-open');
      renderDetectedDetails();
    });
    panel.querySelector('#lc-panel-close').addEventListener('click', () => panel.classList.remove('is-open'));
    panel.querySelector('#lc-use-cin7').addEventListener('click', useCin7Details);
    panel.querySelector('#lc-manual-get').addEventListener('click', getManualFreight);
    panel.querySelector('#lc-fill-price').addEventListener('click', () => fillCin7PriceField(true));
    panel.querySelector('#lc-copy-price').addEventListener('click', () => copyPrice(true));
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
    panel.querySelector('#lc-manual-sku').addEventListener('input', () => {
      clearTimeout(state.addressTimer);
      state.addressTimer = setTimeout(loadAddressSuggestions, 700);
    });
  }

  setTimeout(createPanel, 1500);
})();
