const skuListEl = document.getElementById('skuList');
const btnAddSku = document.getElementById('btnAddSku');
const addressInput = document.getElementById('address');
const btnSuggest = document.getElementById('btnSuggest');
const btnPrice = document.getElementById('btnPrice');
const productPreviewEl = document.getElementById('productPreview');
const suggestionsContainer = document.getElementById('suggestions');
const selectedAddressEl = document.getElementById('selectedAddress');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const addressFieldsEl = document.getElementById('addressFields');

let selectedAddress = null;
let suggestionTimer = null;
let prepareTimer = null;
let productSearchTimer = null;
let activeSuggestionRequest = null;
let activePrepareRequest = null;
let activeProductSearchRequest = null;
let activePriceRequest = null;
let activeSuggestionAddress = '';
let preparedSkuKey = '';
let latestPriceData = null;
let refreshPriceAfterPrepare = false;
const MIN_ADDRESS_SEARCH_LENGTH = 4;
const MIN_PRODUCT_SEARCH_LENGTH = 2;
const AUTO_SUGGEST_DELAY_MS = 600;
const PREPARE_DELAY_MS = 700;
const PRODUCT_SEARCH_DELAY_MS = 300;
const ADDRESS_SEARCH_TIMEOUT_MS = 45000;
const PRICE_REQUEST_TIMEOUT_MS = 90000;

function getSkus() {
  return getItems().map(item => item.sku);
}

function getItems() {
  return Array.from(document.querySelectorAll('.sku-row'))
    .map(row => ({
      sku: row.querySelector('.sku-input')?.value.trim() || '',
      quantity: Math.max(1, Number.parseInt(row.querySelector('.sku-qty')?.value || '1', 10) || 1)
    }))
    .filter(item => item.sku);
}

function getLineQuantity(product) {
  return Math.max(1, Number.parseInt(product?.quantity || '1', 10) || 1);
}

function getLineCartonCount(product, quantity = getLineQuantity(product)) {
  const baseCartons = Array.isArray(product.cartons)
    ? product.cartons.reduce((total, carton) => total + (Number(carton.quantity) || 1), 0)
    : 0;
  const unitsPerCarton = Math.max(1, Number.parseInt(product?.unitsPerCarton || '1', 10) || 1);
  return unitsPerCarton > 1 ? baseCartons * Math.ceil(quantity / unitsPerCarton) : baseCartons * quantity;
}

function getLineCbm(product, quantity = getLineQuantity(product)) {
  const cbm = Number(product.cbm) || 0;
  const unitsPerCarton = Math.max(1, Number.parseInt(product?.unitsPerCarton || '1', 10) || 1);
  return unitsPerCarton > 1 ? cbm * Math.ceil(quantity / unitsPerCarton) : cbm * quantity;
}

function formatSkuWithQty(sku, quantity) {
  return quantity > 1 ? `${sku} · Qty ${quantity}` : sku;
}

function getSkuInputs() {
  return Array.from(document.querySelectorAll('.sku-input'));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setResult(text) {
  resultEl.textContent = text;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => (
    {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]
  ));
}

function renderSelectedAddress(text) {
  selectedAddressEl.classList.toggle('is-visible', Boolean(text));
  selectedAddressEl.innerHTML = text ? `<strong>Selected address</strong>${escapeHtml(text)}` : '';
}

function renderAddressFields(fields) {
  const usefulFields = (fields || []).filter(field => field.label && field.value);
  addressFieldsEl.classList.toggle('is-visible', usefulFields.length > 0);
  addressFieldsEl.innerHTML = usefulFields.length
    ? `<strong>Address fields filled by cart</strong>${usefulFields
        .map(field => `<div>${escapeHtml(field.label)}: ${escapeHtml(field.value)}</div>`)
        .join('')}`
    : '';
}

function getShippingLocation(method) {
  const match = String(method || '').match(/Ship from\s+([^\n$]+)/i);
  if (!match) return '';

  const locations = match[1]
    .replace(/\s+when quoted alone.*$/i, '')
    .split(/\s*(?:\+|&|\/|,|\band\b)\s*/i)
    .map(location => location.trim())
    .filter(Boolean);

  return Array.from(new Set(locations)).join(' + ');
}

function renderProductPreview(products, itemShipping = []) {
  const productList = Array.isArray(products) ? products : products ? [products] : [];
  const shippingBySku = new Map((itemShipping || []).map(item => [item.sku, item]));
  productPreviewEl.classList.toggle('is-visible', productList.length > 0);
  if (!productList.length) {
    productPreviewEl.innerHTML = '';
    return;
  }

  const totalWeightKg = productList.reduce((total, product) => total + ((Number(product.weightKg) || 0) * getLineQuantity(product)), 0);
  const totalCbm = productList.reduce((total, product) => total + getLineCbm(product), 0);
  const totalCartons = productList.reduce((total, product) => total + getLineCartonCount(product), 0);
  const productRows = productList.map(product => {
    const quantity = getLineQuantity(product);
    const image = product.image
      ? `<img src="${escapeHtml(product.image)}" alt="">`
      : '<div></div>';
    const lineWeight = (Number(product.weightKg) || 0) * quantity;
    const lineCbm = getLineCbm(product, quantity);
    const cartonCount = getLineCartonCount(product, quantity);
    const shippingLocation = getShippingLocation(shippingBySku.get(product.sku)?.method);
    const stock = product.available
      ? `Stock: ${shippingLocation || 'Available'}`
      : 'Stock: Unavailable';
    const saleState = product.saleState || (product.available ? 'Add to cart' : 'Unavailable');
    const detailsLine = product.metricsLoaded
      ? lineWeight && lineCbm && cartonCount ? '' : 'Some product metrics were not found'
      : 'Weight, CBM and carton details loading...';
    const detailsHtml = detailsLine ? `<div class="product-preview__meta">${escapeHtml(detailsLine)}</div>` : '';
    const quantityLine = quantity > 1 ? `<div class="product-preview__meta">Qty ${quantity}</div>` : '';
    const websiteUrl = String(product.url || product.productUrl || '').trim();
    const websiteLine = websiteUrl
      ? `<div class="product-preview__meta product-preview__website"><a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">To website</a></div>`
      : '';
    return `
    <div class="product-preview__inner">
      ${image}
      <div>
        <strong>${escapeHtml(product.title || 'Living Culture product')}</strong>
        ${quantityLine}
        ${detailsHtml}
        <div class="product-preview__meta">${escapeHtml(`Status: ${saleState}`)}</div>
        <div class="product-preview__meta">${escapeHtml(stock)}</div>
        ${websiteLine}
      </div>
    </div>
  `;
  }).join('');

  productPreviewEl.innerHTML = `
    ${productRows}
    <div class="product-preview__totals">
      Total weight: ${totalWeightKg ? totalWeightKg.toFixed(2) : '0.00'} kg · Est CBM: ${totalCbm ? totalCbm.toFixed(3) : '0.000'} · Ctns: ${totalCartons || 0}
    </div>
  `;
}

function renderFreightResult(data) {
  const method = data.method ? `<div class="freight-breakdown__meta">${escapeHtml(data.method)}</div>` : '';
  const breakdown = data.freightBreakdown;

  if (!breakdown || !Array.isArray(breakdown.items)) {
    resultEl.innerHTML = `<strong>Freight price: ${escapeHtml(data.price || '')}</strong>${method}`;
    return;
  }

  const rows = breakdown.items.map(item => {
    const itemShipping = item.itemShipping || {};
    const itemMethod = itemShipping.method ? `<div class="freight-breakdown__meta">${escapeHtml(itemShipping.method)}${itemShipping.price ? ` when quoted alone: ${escapeHtml(itemShipping.price)}` : ''}</div>` : '';
    const itemError = itemShipping.error ? `<div class="freight-breakdown__meta">Single-item quote unavailable: ${escapeHtml(itemShipping.error)}</div>` : '';
    return `
      <div class="freight-breakdown__row">
        <div>
          <strong>${escapeHtml(item.title || 'Product')}</strong>
          <div class="freight-breakdown__meta">${escapeHtml(formatSkuWithQty(item.sku || '', Number(item.quantity) || 1))}${item.basisValue ? ` · ${escapeHtml(String(item.basisValue))} ${escapeHtml(breakdown.basis)}` : ''}</div>
          ${itemMethod}
          ${itemError}
        </div>
        <strong>${escapeHtml(item.price || 'N/A')}</strong>
      </div>
    `;
  }).join('');

  resultEl.innerHTML = `
    <div class="freight-breakdown">
      ${method ? `<div class="freight-breakdown__row"><div><strong>Freight method</strong>${method}</div><strong></strong></div>` : ''}
      ${rows}
      <div class="freight-breakdown__row freight-breakdown__total">
        <div>Total freight</div>
        <div>${escapeHtml(breakdown.total || data.price || '')}</div>
      </div>
    </div>
  `;
}

function parseMoneyToCents(text) {
  const match = String(text || '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return match ? Math.round(Number(match[1]) * 100) : 0;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function enrichBreakdownWithStandalonePrices(priceData, itemShipping) {
  if (!priceData.freightBreakdown?.items || !itemShipping.length) {
    return priceData.freightBreakdown;
  }

  const totalCents = parseMoneyToCents(priceData.freightBreakdown.total || priceData.price);
  const shippingBySku = new Map(itemShipping.map(item => [item.sku, item]));
  const standaloneTotal = priceData.freightBreakdown.items.reduce((total, item) => {
    return total + parseMoneyToCents(shippingBySku.get(item.sku)?.price);
  }, 0);
  const shouldUseStandalonePrices = totalCents > 0 && standaloneTotal === totalCents;

  return {
    ...priceData.freightBreakdown,
    items: priceData.freightBreakdown.items.map(item => {
      const itemShipping = shippingBySku.get(item.sku);
      return {
        ...item,
        itemShipping,
        price: shouldUseStandalonePrices && itemShipping?.price ? itemShipping.price : item.price
      };
    }),
    total: totalCents ? formatMoney(totalCents) : priceData.freightBreakdown.total
  };
}

async function fetchItemShippingDetails(priceData) {
  const items = getItems();
  const selected = priceData.selectedAddress || selectedAddress;
  const requestSkuKey = getSkuKey();
  if (!items.length || !selected) return;

  setStatus('Freight price loaded. Loading warehouse details...');

  try {
    const response = await fetch('/api/item-shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, selectedAddress: selected })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Warehouse lookup failed');

    const itemShipping = data.itemShipping || [];
    const enrichedBreakdown = enrichBreakdownWithStandalonePrices(priceData, itemShipping);

    latestPriceData = {
      ...priceData,
      ...latestPriceData,
      products: latestPriceData?.products || data.products || priceData.products,
      itemShipping,
      freightBreakdown: latestPriceData?.freightBreakdown || enrichedBreakdown
    };

    if (requestSkuKey !== getSkuKey()) return;
    renderFreightResult(latestPriceData);
    renderProductPreview(latestPriceData.products || null, itemShipping);
    setStatus('');
  } catch (error) {
    setStatus('');
  }
}

function showSuggestionsList() {
  suggestionsContainer.style.display = 'block';
}

function hideSuggestionsList() {
  suggestionsContainer.innerHTML = '';
  suggestionsContainer.style.display = 'none';
}

function clearSuggestions() {
  hideSuggestionsList();
  selectedAddress = null;
  btnPrice.disabled = true;
  renderSelectedAddress('');
  renderAddressFields([]);
}

function renderSuggestions(suggestions) {
  clearSuggestions();
  showSuggestionsList();
  if (!suggestions.length) {
    suggestionsContainer.innerHTML = '<div class="suggestion-empty">No address found. Enter the full address including suburb, city, postcode and New Zealand.</div>';
    return;
  }

  suggestions.forEach(text => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = text;
    item.addEventListener('click', () => {
      Array.from(suggestionsContainer.children).forEach(child => child.classList.remove('selected'));
      item.classList.add('selected');
      selectedAddress = text;
      addressInput.value = text;
      btnPrice.disabled = false;
      hideSuggestionsList();
      renderSelectedAddress(text);
      setStatus(`Selected: ${text}`);
    });
    suggestionsContainer.appendChild(item);
  });
}

function canAutoSuggest() {
  return getItems().length > 0 && addressInput.value.trim().length >= MIN_ADDRESS_SEARCH_LENGTH;
}

function getSkuKey() {
  return getItems().map(item => `${item.sku}:${item.quantity}`).join('|');
}

function showSuggestionMessage(text) {
  showSuggestionsList();
  suggestionsContainer.innerHTML = `<div class="suggestion-empty">${escapeHtml(text)}</div>`;
}

function getSkuSuggestionBox(input) {
  return input.closest('.sku-search')?.querySelector('.sku-product-suggestions');
}

function hideSkuSuggestions(input) {
  const box = getSkuSuggestionBox(input);
  if (!box) return;
  box.classList.remove('is-visible');
  box.innerHTML = '';
}

function showSkuSuggestionMessage(input, text) {
  const box = getSkuSuggestionBox(input);
  if (!box) return;
  box.innerHTML = `<div class="sku-product-empty">${escapeHtml(text)}</div>`;
  box.classList.add('is-visible');
}

function renderSkuProductSuggestions(input, products) {
  const box = getSkuSuggestionBox(input);
  if (!box) return;

  if (!products.length) {
    showSkuSuggestionMessage(input, 'No matching products found.');
    return;
  }

  box.innerHTML = products.map(product => `
    <div class="sku-product-option" role="button" tabindex="0" data-sku="${escapeHtml(product.sku)}">
      ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div></div>'}
      <div>
        <strong>${escapeHtml(product.title || 'Living Culture product')}</strong>
        <span>${escapeHtml(product.sku || '')}${product.available ? ' · Available' : ' · Unavailable'}</span>
      </div>
    </div>
  `).join('');
  box.classList.add('is-visible');
}

function scheduleProductSearch(input) {
  clearTimeout(productSearchTimer);
  const query = input.value.trim();

  if (activeProductSearchRequest) {
    activeProductSearchRequest.abort();
    activeProductSearchRequest = null;
  }

  if (query.length < MIN_PRODUCT_SEARCH_LENGTH) {
    hideSkuSuggestions(input);
    return;
  }

  showSkuSuggestionMessage(input, 'Searching products...');
  productSearchTimer = setTimeout(() => searchProductsForSku(input, query), PRODUCT_SEARCH_DELAY_MS);
}

async function searchProductsForSku(input, query) {
  activeProductSearchRequest = new AbortController();

  try {
    const response = await fetch(`/api/product-search?q=${encodeURIComponent(query)}`, {
      signal: activeProductSearchRequest.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Product search failed');

    if (input.value.trim() !== query) return;
    renderSkuProductSuggestions(input, data.products || []);
  } catch (error) {
    if (error.name !== 'AbortError') {
      showSkuSuggestionMessage(input, `Product search unavailable: ${error.message}`);
    }
  } finally {
    activeProductSearchRequest = null;
  }
}

function selectSkuProduct(option) {
  const row = option.closest('.sku-row');
  const input = row?.querySelector('.sku-input');
  const sku = option.dataset.sku || '';
  if (!input || !sku) return;

  input.value = sku;
  hideSkuSuggestions(input);
  resetLookupState({ preserveAddress: true, refreshPrice: true });
  scheduleCheckoutPrepare(100);
  if (!selectedAddress && canAutoSuggest()) {
    scheduleSuggestionLookup(100);
  }
}

function scheduleCheckoutPrepare(delay = PREPARE_DELAY_MS) {
  clearTimeout(prepareTimer);
  const items = getItems();
  const skuKey = getSkuKey();

  if (!skuKey || skuKey === preparedSkuKey || activePrepareRequest) {
    return;
  }

  prepareTimer = setTimeout(() => prepareCheckout(items, skuKey), delay);
}

async function prepareCheckout(items, skuKey) {
  activePrepareRequest = new AbortController();
  setStatus('Preparing products and checkout...');

  try {
    const response = await fetch('/api/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: activePrepareRequest.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Checkout preparation failed');

    preparedSkuKey = skuKey;
    renderProductPreview(data.products || null);

    if (selectedAddress) {
      btnPrice.disabled = false;
      renderSelectedAddress(selectedAddress);
    }

    if (selectedAddress && refreshPriceAfterPrepare) {
      refreshPriceAfterPrepare = false;
      fetchPrice();
      return;
    }

    setStatus(selectedAddress ? 'Products updated. Get freight price to refresh the quote.' : '');

    if (!selectedAddress && canAutoSuggest()) {
      scheduleSuggestionLookup(100);
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      setStatus(`Error: ${error.message}`);
    }
  } finally {
    activePrepareRequest = null;
    if (getSkuKey() && getSkuKey() !== preparedSkuKey) {
      scheduleCheckoutPrepare(100);
    }
  }
}

function scheduleSuggestionLookup(delay = AUTO_SUGGEST_DELAY_MS) {
  clearTimeout(suggestionTimer);
  if (activeSuggestionRequest) {
    activeSuggestionRequest.abort();
    activeSuggestionRequest = null;
  }
  clearSuggestions();
  setResult('');

  const address = addressInput.value.trim();

  if (selectedAddress && address !== selectedAddress) {
    selectedAddress = null;
    latestPriceData = null;
    btnPrice.disabled = true;
    renderSelectedAddress('');
  }

  if (!getItems().length) {
    if (address.length >= MIN_ADDRESS_SEARCH_LENGTH) {
      showSuggestionMessage('Enter at least one SKU before searching addresses.');
    }
    return;
  }

  if (!address) {
    hideSuggestionsList();
    return;
  }

  if (address.length < MIN_ADDRESS_SEARCH_LENGTH) {
    showSuggestionMessage(`Type at least ${MIN_ADDRESS_SEARCH_LENGTH} characters to search the cart autocomplete.`);
    return;
  }

  showSuggestionMessage('Click Find address to search matching delivery addresses.');
}

async function fetchSuggestions() {
  const items = getItems();
  const address = addressInput.value.trim();
  if (!items.length || !address) {
    setStatus('Enter at least one SKU and a complete delivery address.');
    return;
  }

  if (activePrepareRequest && preparedSkuKey !== getSkuKey()) {
    showSuggestionMessage('Preparing checkout, then searching address suggestions...');
    clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(fetchSuggestions, 300);
    return;
  }

  if (activeSuggestionRequest) {
    setStatus('Still loading suggestions from the checkout. I will search the latest address next.');
    return;
  }
  activeSuggestionRequest = new AbortController();
  activeSuggestionAddress = address;
  setStatus('Checking the complete delivery address...');
  setResult('');
  renderAddressFields([]);
  clearSuggestions();
  showSuggestionsList();
  suggestionsContainer.innerHTML = '<div class="suggestion-empty">Checking delivery address...</div>';

  const timeout = setTimeout(() => activeSuggestionRequest?.abort(), ADDRESS_SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, address }),
      signal: activeSuggestionRequest.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Suggestion request failed');

    renderSuggestions(data.suggestions || []);
    renderProductPreview(data.products || data.product || null);
    setStatus((data.suggestions || []).length
      ? 'Address ready. Click it to select it, then get the freight price.'
      : 'No address found. Enter the full address including suburb, city, postcode and New Zealand.');
  } catch (error) {
    if (error.name === 'AbortError') {
      if (addressInput.value.trim() !== address) return;
      showSuggestionMessage('Address check timed out. Enter the full address including suburb, city, postcode and New Zealand, then try again.');
      setStatus('Address check stopped.');
      return;
    }
    setStatus(`Error: ${error.message}`);
  } finally {
    clearTimeout(timeout);
    activeSuggestionRequest = null;
    if (addressInput.value.trim() && addressInput.value.trim() !== activeSuggestionAddress) {
      clearTimeout(suggestionTimer);
      suggestionTimer = setTimeout(fetchSuggestions, 300);
    }
  }
}

async function fetchProductMetrics(priceData) {
  const items = getItems();
  const requestSkuKey = getSkuKey();
  if (!items.length) return;

  setStatus('Freight price loaded. Loading weight, CBM and carton details...');

  try {
    const productsBySku = new Map((latestPriceData?.products || priceData.products || [])
      .filter(product => product?.sku)
      .map(product => [String(product.sku).toLowerCase(), product]));
    const metricItems = items.map(item => {
      const product = productsBySku.get(String(item.sku || '').toLowerCase());
      return product?.url ? { ...item, productUrl: product.url } : item;
    });

    const response = await fetch('/api/product-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: metricItems,
        price: priceData.price,
        itemShipping: latestPriceData?.itemShipping || []
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Product metrics failed');
    if (requestSkuKey !== getSkuKey()) return;

    latestPriceData = {
      ...priceData,
      ...latestPriceData,
      products: data.products || latestPriceData?.products || priceData.products,
      freightBreakdown: data.freightBreakdown || latestPriceData?.freightBreakdown || priceData.freightBreakdown
    };
    renderFreightResult(latestPriceData);
    renderProductPreview(latestPriceData.products || [], latestPriceData.itemShipping || []);
    setStatus('');
  } catch (error) {
    setStatus(`Freight price loaded. Product details unavailable: ${error.message}`);
  }
}

async function fetchPrice() {
  const items = getItems();
  if (!items.length || !selectedAddress) {
    setStatus('Enter at least one SKU and select an address first.');
    return;
  }

  if (activePriceRequest) return;

  activePriceRequest = new AbortController();
  btnPrice.disabled = true;
  setStatus('Requesting freight price...');
  setResult('');

  const timeout = setTimeout(() => activePriceRequest?.abort(), PRICE_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, selectedAddress }),
      signal: activePriceRequest.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Price request failed');

    latestPriceData = data;
    renderFreightResult(latestPriceData);
    renderProductPreview(latestPriceData.products || null, latestPriceData.itemShipping || []);
    renderSelectedAddress(data.selectedAddress || selectedAddress);
    renderAddressFields(data.addressFields || []);
    setStatus('');
    fetchProductMetrics(latestPriceData);
    if (items.length > 1) {
      fetchItemShippingDetails(latestPriceData);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      setStatus('Freight price timed out. Please try again, or use the standalone app for this address.');
    } else {
      setStatus(`Error: ${error.message}`);
    }
  } finally {
    clearTimeout(timeout);
    activePriceRequest = null;
    btnPrice.disabled = !selectedAddress;
  }
}

btnSuggest.addEventListener('click', fetchSuggestions);
btnPrice.addEventListener('click', fetchPrice);
btnAddSku.addEventListener('click', () => {
  const row = document.createElement('div');
  row.className = 'sku-row';
  row.innerHTML = `
    <div class="sku-search">
      <input class="sku-input" type="search" autocomplete="off" />
      <div class="sku-product-suggestions"></div>
    </div>
    <input class="sku-qty" type="number" min="1" step="1" value="1" aria-label="Quantity" />
    <button class="sku-remove" type="button" aria-label="Remove SKU">Remove</button>
  `;
  skuListEl.appendChild(row);
  row.querySelector('.sku-input').focus();
  updateSkuRemoveButtons();
});

skuListEl.addEventListener('click', event => {
  const productOption = event.target.closest('.sku-product-option');
  if (productOption) {
    selectSkuProduct(productOption);
    return;
  }

  if (!event.target.classList.contains('sku-remove')) return;
  event.target.closest('.sku-row').remove();
  updateSkuRemoveButtons();
  resetLookupState({ preserveAddress: true, refreshPrice: true });
  scheduleCheckoutPrepare();
  if (!selectedAddress && canAutoSuggest()) {
    scheduleSuggestionLookup();
  }
});

skuListEl.addEventListener('input', event => {
  if (event.target.classList.contains('sku-input')) {
    scheduleProductSearch(event.target);
  }
  resetLookupState({ preserveAddress: true, refreshPrice: true });
  scheduleCheckoutPrepare();
  if (!selectedAddress && canAutoSuggest()) {
    scheduleSuggestionLookup();
  }
});

skuListEl.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const productOption = event.target.closest('.sku-product-option');
  if (!productOption) return;

  event.preventDefault();
  selectSkuProduct(productOption);
});

document.addEventListener('click', event => {
  if (event.target.closest('.sku-search')) return;
  document.querySelectorAll('.sku-input').forEach(input => hideSkuSuggestions(input));
});

function updateSkuRemoveButtons() {
  const buttons = document.querySelectorAll('.sku-remove');
  buttons.forEach(button => {
    button.disabled = buttons.length === 1;
  });
}

function resetLookupState({ preserveAddress = false, refreshPrice = false } = {}) {
  clearTimeout(prepareTimer);
  preparedSkuKey = '';
  refreshPriceAfterPrepare = preserveAddress && refreshPrice && Boolean(latestPriceData);
  renderProductPreview(null);
  if (preserveAddress && selectedAddress) {
    hideSuggestionsList();
    btnPrice.disabled = false;
    renderSelectedAddress(selectedAddress);
    renderAddressFields([]);
  } else {
    clearSuggestions();
    latestPriceData = null;
  }
  setResult('');
  setStatus('');
}

btnSuggest.hidden = false;
addressInput.addEventListener('input', () => scheduleSuggestionLookup());
addressInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    clearTimeout(suggestionTimer);
    fetchSuggestions();
  }
});
