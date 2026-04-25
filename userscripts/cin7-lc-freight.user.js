// ==UserScript==
// @name         Cin7 Living Culture Freight
// @namespace    livingculture
// @version      3.9
// @description  Opens a Living Culture freight panel inside Cin7 with auto and manual lookup modes.
// @match        *://cin7.com/*
// @match        *://*.cin7.com/*
// @match        *://*.cin7.co/*
// @match        *://*.cin7core.com/*
// @match        *://*.dearsystems.com/*
// @match        https://inventory.dearsystems.com/*
// @run-at       document-idle
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

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
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

  function isAddressLike(value) {
    const text = clean(value);
    return text.length >= 5 &&
      !/^(?:on|off|yes|no|\+|-)$/i.test(text) &&
      !/^Shipping address line/i.test(text) &&
      /[a-z0-9]/i.test(text);
  }

  function getAddressLineByLabel(labelText) {
    const labelPattern = new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const labels = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(isVisible)
      .filter(element => labelPattern.test(clean(element.textContent)));

    for (const label of labels) {
      const labelRect = label.getBoundingClientRect();
      const scope = label.closest('fieldset, section, form, main, body') || document.body;
      const fields = Array.from(scope.querySelectorAll('input, textarea, [contenteditable="true"], div, span'))
        .filter(isVisible)
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

      if (fields.length) return fields[0].value;
    }

    const lines = (document.body.innerText || '').split('\n').map(clean).filter(Boolean);
    const index = lines.findIndex(line => labelPattern.test(line));
    if (index >= 0) {
      const nextLine = lines.slice(index + 1, index + 5).find(isAddressLike);
      if (nextLine) return nextLine;
    }

    return '';
  }

  function getSkuFromCin7() {
    return getItemsFromCin7()[0]?.sku || '';
  }

  function getQuantityFromRow(row) {
    const inputs = Array.from(row.querySelectorAll('input'))
      .map(input => clean(input.value))
      .filter(Boolean);
    const inputQuantity = inputs.find(value => /^\d+$/.test(value));
    if (inputQuantity) return Number(inputQuantity);

    const cells = Array.from(row.querySelectorAll('td, [role="cell"], div, span'))
      .map(cell => clean(cell.textContent))
      .filter(Boolean);
    const numericCells = cells
      .map(value => value.match(/^(\d+)$/)?.[1])
      .filter(Boolean)
      .map(Number);
    return numericCells.find(value => value > 0 && value < 1000) || 1;
  }

  function getItemsFromCin7() {
    const rows = Array.from(document.querySelectorAll('tr, [role="row"], tbody > *, [class*="row" i]'));
    const items = [];
    const seen = new Set();

    for (const row of rows) {
      const link = Array.from(row.querySelectorAll('a'))
        .find(anchor => /^[A-Z]{1,6}\d{3,}(?:-\d+)?\s*:/i.test(clean(anchor.textContent)));
      const sku = clean(link?.textContent).match(/^([A-Z]{1,6}\d{3,}(?:-\d+)?)\s*:/i)?.[1]?.toUpperCase();
      if (!sku || seen.has(sku)) continue;
      seen.add(sku);
      items.push({ sku, quantity: getQuantityFromRow(row) });
    }

    if (items.length) return items;

    const matches = Array.from((document.body.innerText || '').matchAll(/\b([A-Z]{1,6}\d{3,}(?:-\d+)?)\s*:/gi));
    for (const match of matches) {
      const sku = match[1].toUpperCase();
      if (seen.has(sku)) continue;
      seen.add(sku);
      items.push({ sku, quantity: 1 });
    }

    return items;
  }

  function getAddressFromCin7() {
    const line1 = getAddressLineByLabel('Shipping address line 1') || getFieldValueByLabel('Shipping address line 1');
    const line2 = getAddressLineByLabel('Shipping address line 2') || getFieldValueByLabel('Shipping address line 2');
    return clean([line1, line2].filter(Boolean).join(', '));
  }

  function getAddressSearchFromCin7() {
    return clean(getAddressLineByLabel('Shipping address line 1') || getFieldValueByLabel('Shipping address line 1') || getAddressFromCin7());
  }

  function findShippingPriceInput() {
    const additionalCharges = findTextNodeElement(/Additional charges and services/i);
    if (!additionalCharges) return null;

    const headingRect = additionalCharges.getBoundingClientRect();
    const visibleElementsBelowHeading = Array.from(document.querySelectorAll('td, th, [role="cell"], [role="columnheader"], div, span'))
      .filter(isVisible)
      .map(element => ({ element, rect: element.getBoundingClientRect(), text: clean(element.textContent) }))
      .filter(item => item.rect.top >= headingRect.bottom - 5);
    const shippingLabel = visibleElementsBelowHeading
      .filter(item => item.text.length < 120 && (/^Shipping\s*-\s*Ship from\s+(?:Auckland|Christchurch)$/i.test(item.text) || /^Shipping\s*-/i.test(item.text)))
      .sort((a, b) => a.text.length - b.text.length || a.rect.top - b.rect.top)[0];
    const pageInputs = Array.from(document.querySelectorAll('input'))
      .filter(isVisible)
      .filter(input => !input.closest('#lc-freight-panel'))
      .filter(input => !/address|contact|company|note|memo|date|carrier|search/i.test(`${input.name || ''} ${input.id || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`));

    if (shippingLabel) {
      const priceHeader = visibleElementsBelowHeading
        .filter(item => /^price$/i.test(item.text) && item.rect.top < shippingLabel.rect.top)
        .sort((a, b) => Math.abs(a.rect.top - shippingLabel.rect.top) - Math.abs(b.rect.top - shippingLabel.rect.top))[0];
      const rowInputs = pageInputs
        .map(input => ({ input, rect: input.getBoundingClientRect() }))
        .filter(item => {
          const centerY = item.rect.top + (item.rect.height / 2);
          return centerY >= shippingLabel.rect.top - 18 &&
            centerY <= shippingLabel.rect.bottom + 42 &&
            item.rect.left > shippingLabel.rect.right;
        });

      if (rowInputs.length && priceHeader) {
        const headerCenter = priceHeader.rect.left + (priceHeader.rect.width / 2);
        return rowInputs
          .map(item => ({
            input: item.input,
            distance: Math.abs((item.rect.left + (item.rect.width / 2)) - headerCenter)
          }))
          .sort((a, b) => a.distance - b.distance)[0].input;
      }

      if (rowInputs.length === 1) return rowInputs[0].input;

      const numericInput = rowInputs.find(item => /^(?:|0|0\.0000|\d+(?:\.\d{1,4})?)$/.test(clean(item.input.value)));
      if (numericInput) return numericInput.input;
    }

    let containers = Array.from(document.querySelectorAll('table, [role="table"], [class*="table" i], [class*="grid" i]'))
      .filter(isVisible)
      .map(element => ({ element, rect: element.getBoundingClientRect(), text: clean(element.textContent) }))
      .filter(item =>
        item.rect.top >= headingRect.bottom - 5 &&
        /description/i.test(item.text) &&
        /price/i.test(item.text) &&
        /total/i.test(item.text) &&
        /shipping\s*-/i.test(item.text)
      )
      .sort((a, b) => a.rect.top - b.rect.top || a.text.length - b.text.length);

    if (!containers.length) {
      containers = Array.from(document.querySelectorAll('section, main > div, body > div, div'))
        .filter(isVisible)
        .map(element => ({ element, rect: element.getBoundingClientRect(), text: clean(element.textContent) }))
        .filter(item =>
          item.rect.top >= headingRect.bottom - 5 &&
          item.text.length < 5000 &&
          /description/i.test(item.text) &&
          /price/i.test(item.text) &&
          /total/i.test(item.text) &&
          /shipping\s*-/i.test(item.text)
        )
        .sort((a, b) => a.text.length - b.text.length);
    }

    const section = containers[0]?.element;
    if (!section) return null;

    const rows = Array.from(section.querySelectorAll('tr, [role="row"], tbody > *, [class*="row" i]'))
      .filter(isVisible)
      .filter(row => {
        const text = clean(row.textContent);
        return /Shipping\s*-/i.test(text) && !/Shipping address/i.test(text);
      })
      .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length);

    for (const row of rows) {
      const inputs = Array.from(row.querySelectorAll('input'))
        .filter(isVisible)
        .filter(input => !/address|contact|company|note|memo|date|carrier/i.test(`${input.name || ''} ${input.id || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`));
      if (inputs.length === 1) return inputs[0];

      const priceHeader = Array.from(section.querySelectorAll('th, [role="columnheader"], div, span'))
        .filter(isVisible)
        .find(element => /^price$/i.test(clean(element.textContent)));
      if (priceHeader) {
        const headerCenter = priceHeader.getBoundingClientRect().left + (priceHeader.getBoundingClientRect().width / 2);
        return inputs
          .map(input => {
            const rect = input.getBoundingClientRect();
            const center = rect.left + (rect.width / 2);
            return { input, distance: Math.abs(center - headerCenter) };
          })
          .sort((a, b) => a.distance - b.distance)[0]?.input || null;
      }

      const numericInput = inputs.find(input => /^(?:|0|0\.0000|\d+(?:\.\d{1,4})?)$/.test(clean(input.value)));
      if (numericInput) return numericInput;
    }

    return null;
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

  async function requestFreight({ sku, items, address, quantity = 1 }) {
    const freightItems = Array.isArray(items) && items.length ? items : [{ sku, quantity }];
    const firstItem = freightItems[0] || {};
    const firstIsUrl = /^https?:\/\/.+\/products\//i.test(firstItem.sku || firstItem.productUrl || '');
    const response = await fetch(`${API_BASE}/get-freight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        selectedAddress: state.selectedAddress || address
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.price) {
      throw new Error(data.error || 'No freight returned');
    }
    return data;
  }

  function scoreAddressSuggestion(suggestion, address) {
    const normalise = value => clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const wanted = normalise(address);
    const candidate = normalise(suggestion);
    if (!wanted || !candidate) return 0;
    if (candidate.includes(wanted)) return 1000 + wanted.length;

    const wantedTokens = wanted.split(' ').filter(token => token.length > 1);
    return wantedTokens.reduce((score, token) => score + (candidate.includes(token) ? 1 : 0), 0);
  }

  async function resolveAddressSuggestion(items, address) {
    const firstItem = items[0] || {};
    const isUrl = /^https?:\/\/.+\/products\//i.test(firstItem.sku || firstItem.productUrl || '');
    const query = clean(address);
    if (!firstItem.sku && !firstItem.productUrl) return query;

    setStatus('Selecting address suggestion...');
    const response = await fetch(`${API_BASE}/address-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: isUrl ? '' : firstItem.sku,
        productUrl: firstItem.productUrl || (isUrl ? firstItem.sku : ''),
        quantity: firstItem.quantity || 1,
        address: query
      })
    });
    const data = await response.json().catch(() => ({}));
    const suggestions = data.suggestions || [];
    if (!response.ok || !suggestions.length) return query;

    const selected = suggestions
      .map(suggestion => ({ suggestion, score: scoreAddressSuggestion(suggestion, query) }))
      .sort((a, b) => b.score - a.score)[0]?.suggestion || suggestions[0];
    state.selectedAddress = selected;
    return selected;
  }

  async function useCin7Details() {
    setStatus('Reading Cin7 details...');
    const items = getItemsFromCin7();
    const address = getAddressFromCin7();
    const searchAddress = getAddressSearchFromCin7();
    state.selectedAddress = '';
    document.getElementById('lc-auto-sku').textContent = items.length ? items.map(item => `${item.sku} x ${item.quantity}`).join(', ') : '-';
    document.getElementById('lc-auto-address').textContent = address || '-';

    if (!items.length || !searchAddress) {
      setStatus('Could not detect product lines or shipping address from Cin7.', true);
      return;
    }

    const selectedAddress = await resolveAddressSuggestion(items, searchAddress);
    await getAndApplyFreight({ items, address: selectedAddress, fill: true });
  }

  async function getManualFreight() {
    const items = getManualItems();
    const address = clean(document.getElementById('lc-manual-address').value);
    if (!items.length || !address) {
      setStatus('Enter at least one SKU/product URL and address first.', true);
      return;
    }
    await getAndApplyFreight({ items, address, fill: false });
  }

  function getManualItems() {
    return Array.from(document.querySelectorAll('.lc-manual-product-row'))
      .map(row => ({
        sku: clean(row.querySelector('.lc-manual-sku')?.value),
        quantity: Number(clean(row.querySelector('.lc-manual-qty')?.value)) || 1
      }))
      .filter(item => item.sku);
  }

  async function getAndApplyFreight({ sku, items, address, fill }) {
    try {
      setStatus('Getting freight...');
      const data = await requestFreight({ sku, items, address });
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
        body: JSON.stringify({ sku: isUrl ? '' : firstItem.sku, productUrl: isUrl ? firstItem.sku : '', address })
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
    const items = getItemsFromCin7();
    document.getElementById('lc-auto-sku').textContent = items.length ? items.map(item => `${item.sku} x ${item.quantity}`).join(', ') : '-';
    document.getElementById('lc-auto-address').textContent = getAddressFromCin7() || '-';
  }

  function addManualProductRow(value = '', quantity = 1) {
    const rows = document.getElementById('lc-manual-products');
    const row = document.createElement('div');
    row.className = 'lc-manual-product-row';
    row.innerHTML = `
      <input class="lc-manual-sku" placeholder="SKU or product URL" value="${value}" />
      <input class="lc-manual-qty" type="number" min="1" step="1" value="${quantity}" />
      <button type="button" class="lc-remove-product">Remove</button>
    `;
    rows.appendChild(row);
  }

  function createPanel() {
    if (document.getElementById('lc-freight-panel')) return;

    const button = document.createElement('button');
    button.id = 'lc-freight-toggle';
    button.textContent = 'LC Freight';

    const panel = document.createElement('div');
    panel.id = 'lc-freight-panel';
    panel.innerHTML = `
      <div class="lc-hero">
        <div class="lc-hero-top">
          <img src="https://livingculture.co.nz/cdn/shop/files/logo_ec2b0c5e-42ca-4695-8c7e-43b344144c58.png?v=1675047511&width=220" alt="Living Culture" />
          <strong>Freight Costing</strong>
        </div>
        <p>Use Cin7 products and delivery details, or enter them manually.</p>
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
        <div id="lc-manual-products"></div>
        <button type="button" id="lc-add-product">Add another product</button>
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
        padding: 11px 16px;
        background: #2d5c4e;
        color: #fff;
        border: 0;
        border-radius: 10px;
        box-shadow: 0 16px 34px rgba(34, 48, 40, 0.2);
        font: 700 14px Arial, sans-serif;
        cursor: pointer;
      }
      #lc-freight-panel {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 2147483647;
        width: 370px;
        max-height: calc(100vh - 110px);
        overflow: auto;
        display: none;
        padding: 0;
        color: #1f2b24;
        background: #c5d9d3;
        border: 1px solid #d9d6cc;
        border-radius: 18px;
        box-shadow: 0 20px 44px rgba(34, 48, 40, 0.18);
        font: 14px/1.4 Arial, sans-serif;
      }
      #lc-freight-panel.is-open { display: block; }
      .lc-hero {
        position: relative;
        margin: 14px;
        padding: 18px 18px 16px;
        color: #fff;
        background: #2d5c4e;
        border-radius: 16px;
        box-shadow: 0 12px 28px rgba(34, 48, 40, 0.14);
      }
      .lc-hero-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding-right: 38px;
      }
      .lc-hero img {
        width: 116px;
        height: auto;
        display: block;
      }
      .lc-hero strong {
        font-size: 22px;
        line-height: 1;
        text-align: right;
      }
      .lc-hero p {
        margin: 14px 0 0;
        color: rgba(255, 255, 255, 0.92);
        font-size: 13px;
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
        gap: 8px;
        margin: 14px;
        padding: 16px;
        background: #fffefb;
        border: 1px solid #d9d6cc;
        border-radius: 16px;
        box-shadow: 0 10px 24px rgba(34, 48, 40, 0.08);
      }
      .lc-label {
        color: #637061;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0;
      }
      #lc-freight-panel input {
        width: 100%;
        min-height: 42px;
        padding: 10px 12px;
        color: #1f2b24;
        background: #fff;
        border: 1px solid #d9d6cc;
        border-radius: 12px;
        font: inherit;
      }
      #lc-freight-panel button:not(#lc-panel-close) {
        min-height: 42px;
        padding: 10px 12px;
        color: #fff;
        background: #2d5c4e;
        border: 0;
        border-radius: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .lc-manual-product-row {
        display: grid;
        grid-template-columns: 1fr 58px 72px;
        gap: 6px;
      }
      .lc-manual-product-row .lc-remove-product {
        min-height: 42px !important;
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
        margin: 10px 14px 16px;
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
    panel.querySelector('#lc-add-product').addEventListener('click', () => addManualProductRow());
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
    addManualProductRow();
  }

  function boot() {
    if (!document.body) return;
    createPanel();
  }

  boot();
  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);
  setInterval(boot, 3000);
})();
