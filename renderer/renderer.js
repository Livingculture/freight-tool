const productRowsEl = document.getElementById('productRows');
const addProductEl = document.getElementById('addProduct');
const addressInput = document.getElementById('address');
const suggestionsEl = document.getElementById('suggestions');
const selectedAddressEl = document.getElementById('selectedAddress');
const productPreviewEl = document.getElementById('productPreview');
const getFreightEl = document.getElementById('getFreight');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const copyFreightEl = document.getElementById('copyFreight');

let selectedAddress = null;
let preparedKey = '';
let latestPriceData = null;
let refreshPriceAfterPrepare = false;
let productSearchTimer = null;
let prepareTimer = null;
let addressTimer = null;
let activeProductSearch = null;
let activePrepare = false;
let activeAddressSearch = false;
let lastAddressQuery = '';

const MIN_PRODUCT_SEARCH_LENGTH = 2;
const MIN_ADDRESS_SEARCH_LENGTH = 4;
const PRODUCT_SEARCH_DELAY_MS = 300;
const PREPARE_DELAY_MS = 700;
const ADDRESS_SEARCH_DELAY_MS = 650;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function setStatus(message) {
  statusEl.textContent = message || '';
}

function isProductUrl(value) {
  return /^https?:\/\/.+\/products\//i.test(String(value || '').trim());
}

function normaliseQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function getItems() {
  return Array.from(document.querySelectorAll('.product-row'))
    .map(row => {
      const value = row.querySelector('.sku-input')?.value.trim() || '';
      const quantity = normaliseQuantity(row.querySelector('.sku-qty')?.value || '1');
      return isProductUrl(value)
        ? { productUrl: value, sku: '', quantity }
        : { sku: value, quantity };
    })
    .filter(item => item.sku || item.productUrl);
}

function getProductKey() {
  return getItems()
    .map(item => `${item.productUrl ? `url:${item.productUrl}` : `sku:${item.sku}`}:qty:${item.quantity}`)
    .join('|');
}

function getLineQuantity(product) {
  return normaliseQuantity(product?.quantity);
}

function getLineCartonCount(product, quantity = getLineQuantity(product)) {
  const baseCartons = Array.isArray(product.cartons)
    ? product.cartons.reduce((total, carton) => total + (Number(carton.quantity) || 1), 0)
    : 0;
  const unitsPerCarton = normaliseQuantity(product?.unitsPerCarton);
  return unitsPerCarton > 1 ? baseCartons * Math.ceil(quantity / unitsPerCarton) : baseCartons * quantity;
}

function getLineCbm(product, quantity = getLineQuantity(product)) {
  const cbm = Number(product.cbm) || 0;
  const unitsPerCarton = normaliseQuantity(product?.unitsPerCarton);
  return unitsPerCarton > 1 ? cbm * Math.ceil(quantity / unitsPerCarton) : cbm * quantity;
}

function formatSkuWithQty(sku, quantity) {
  return quantity > 1 ? `${sku} · Qty ${quantity}` : sku;
}

function mergeProductLists(baseProducts = [], updateProducts = []) {
  const updatesByKey = new Map(updateProducts.map(product => [product.sku || product.variantId || product.title, product]));
  return baseProducts.map(product => {
    const key = product.sku || product.variantId || product.title;
    return updatesByKey.has(key) ? { ...product, ...updatesByKey.get(key) } : product;
  });
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

function request(path, body, method = 'POST') {
  return window.freightApi.request({ path, method, body });
}

function renderSelectedAddress(text) {
  selectedAddressEl.classList.toggle('is-visible', Boolean(text));
  selectedAddressEl.innerHTML = text ? `<strong>Selected address</strong>${escapeHtml(text)}` : '';
}

function hideAddressSuggestions() {
  suggestionsEl.classList.remove('is-visible');
  suggestionsEl.innerHTML = '';
}

function showAddressMessage(message) {
  suggestionsEl.classList.add('is-visible');
  suggestionsEl.innerHTML = `<div class="empty-message">${escapeHtml(message)}</div>`;
}

function clearSelectedAddress() {
  selectedAddress = null;
  getFreightEl.disabled = true;
  renderSelectedAddress('');
}

function renderAddressSuggestions(suggestions) {
  clearSelectedAddress();
  suggestionsEl.classList.add('is-visible');

  if (!suggestions.length) {
    suggestionsEl.innerHTML = '<div class="empty-message">No matching addresses found.</div>';
    return;
  }

  suggestionsEl.innerHTML = suggestions
    .map(text => `<div class="suggestion-item" role="button" tabindex="0" data-address="${escapeHtml(text)}">${escapeHtml(text)}</div>`)
    .join('');
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

  productPreviewEl.innerHTML = `
    ${productList.map(product => {
      const quantity = getLineQuantity(product);
      const image = product.image
        ? `<img src="${escapeHtml(product.image)}" alt="">`
        : '<div></div>';
      const lineWeight = (Number(product.weightKg) || 0) * quantity;
      const lineCbm = getLineCbm(product, quantity);
      const cartonCount = getLineCartonCount(product, quantity);
      const shippingLocation = getShippingLocation(shippingBySku.get(product.sku)?.method);
      const saleState = product.saleState || (product.available ? 'Add to cart' : 'Unavailable');
      const stock = product.available ? `Stock: ${shippingLocation || 'Available'}` : 'Stock: Unavailable';
      const dimensions = product.metricsLoaded
        ? `${lineWeight ? `${lineWeight.toFixed(2)} kg` : 'Weight not found'} · ${lineCbm ? `${lineCbm.toFixed(3)} CBM` : 'CBM not found'}${cartonCount ? ` (${cartonCount} carton${cartonCount === 1 ? '' : 's'})` : ''}`
        : 'Weight, CBM and carton details loading after freight price';

      return `
        <div class="product-preview__inner">
          ${image}
          <div>
            <strong>${escapeHtml(product.title || 'Living Culture product')}</strong>
            <div class="product-preview__meta">${escapeHtml(formatSkuWithQty(product.sku || '', quantity))}</div>
            <div class="product-preview__meta">${escapeHtml(dimensions)}</div>
            <div class="product-preview__meta">${escapeHtml(`Status: ${saleState}`)}</div>
            <div class="product-preview__meta">${escapeHtml(stock)}</div>
          </div>
        </div>
      `;
    }).join('')}
    <div class="product-preview__totals">
      Total weight: ${totalWeightKg ? totalWeightKg.toFixed(2) : '0.00'} kg · Estimated CBM: ${totalCbm ? totalCbm.toFixed(3) : '0.000'}
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

function renderFreightResult(data) {
  copyFreightEl.hidden = !getFreightPriceText(data);
  const breakdown = data.freightBreakdown;
  if (!breakdown?.items) {
    resultEl.innerHTML = `<div class="freight-breakdown"><div class="freight-breakdown__row"><strong>Freight price</strong><strong>${escapeHtml(data.price || '')}</strong></div></div>`;
    return;
  }

  resultEl.innerHTML = `
    <div class="freight-breakdown">
      ${data.method ? `<div class="freight-breakdown__row"><div><strong>Freight method</strong><div class="freight-breakdown__meta">${escapeHtml(data.method)}</div></div><div></div></div>` : ''}
      ${breakdown.items.map(item => {
        const itemShipping = item.itemShipping || {};
        const itemMethod = itemShipping.method
          ? `<div class="freight-breakdown__meta">${escapeHtml(itemShipping.method)}${itemShipping.price ? ` when quoted alone: ${escapeHtml(itemShipping.price)}` : ''}</div>`
          : '';
        return `
          <div class="freight-breakdown__row">
            <div>
              <strong>${escapeHtml(item.title || 'Product')}</strong>
              <div class="freight-breakdown__meta">${escapeHtml(formatSkuWithQty(item.sku || '', Number(item.quantity) || 1))}${item.basisValue ? ` · ${escapeHtml(String(item.basisValue))} ${escapeHtml(breakdown.basis)}` : ''}</div>
              ${itemMethod}
            </div>
            <strong>${escapeHtml(item.price || 'N/A')}</strong>
          </div>
        `;
      }).join('')}
      <div class="freight-breakdown__row freight-breakdown__total">
        <div>Total freight</div>
        <div>${escapeHtml(breakdown.total || data.price || '')}</div>
      </div>
    </div>
  `;
}

function getFreightPriceText(data = latestPriceData) {
  return data?.freightBreakdown?.total || data?.price || '';
}

async function copyFreightPrice() {
  const price = getFreightPriceText();
  if (!price) return;

  try {
    await navigator.clipboard.writeText(price);
    setStatus(`Copied freight price ${price}`);
  } catch (error) {
    console.error(error);
    setStatus(`Freight price ${price}`);
  }
}

function getProductSuggestionBox(input) {
  return input.closest('.product-search')?.querySelector('.product-suggestions');
}

function hideProductSuggestions(input) {
  const box = getProductSuggestionBox(input);
  if (!box) return;
  box.classList.remove('is-visible');
  box.innerHTML = '';
}

function showProductMessage(input, message) {
  const box = getProductSuggestionBox(input);
  if (!box) return;
  box.classList.add('is-visible');
  box.innerHTML = `<div class="empty-message">${escapeHtml(message)}</div>`;
}

function renderProductSuggestions(input, products) {
  const box = getProductSuggestionBox(input);
  if (!box) return;

  if (!products.length) {
    showProductMessage(input, 'No matching products found.');
    return;
  }

  box.classList.add('is-visible');
  box.innerHTML = products.map(product => `
    <div class="product-option" role="button" tabindex="0" data-sku="${escapeHtml(product.sku)}">
      ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div></div>'}
      <div>
        <strong>${escapeHtml(product.title || 'Living Culture product')}</strong>
        <span>${escapeHtml(product.sku || '')}${product.available ? ' · Available' : ' · Unavailable'}</span>
      </div>
    </div>
  `).join('');
}

function scheduleProductSearch(input) {
  clearTimeout(productSearchTimer);
  const query = input.value.trim();

  if (activeProductSearch) {
    activeProductSearch.cancelled = true;
    activeProductSearch = null;
  }

  if (isProductUrl(query) || query.length < MIN_PRODUCT_SEARCH_LENGTH) {
    hideProductSuggestions(input);
    return;
  }

  showProductMessage(input, 'Searching products...');
  productSearchTimer = setTimeout(() => searchProducts(input, query), PRODUCT_SEARCH_DELAY_MS);
}

async function searchProducts(input, query) {
  const token = { cancelled: false };
  activeProductSearch = token;

  try {
    const data = await window.freightApi.request({
      path: `/api/product-search?q=${encodeURIComponent(query)}`,
      method: 'GET'
    });
    if (token.cancelled || input.value.trim() !== query) return;
    renderProductSuggestions(input, data.products || []);
  } catch (error) {
    if (!token.cancelled) {
      showProductMessage(input, `Product search unavailable: ${error.message}`);
    }
  } finally {
    if (activeProductSearch === token) {
      activeProductSearch = null;
    }
  }
}

function resetProductState({ preserveAddress = true, refreshPrice = true } = {}) {
  clearTimeout(prepareTimer);
  preparedKey = '';
  refreshPriceAfterPrepare = preserveAddress && refreshPrice && Boolean(latestPriceData);
  renderProductPreview(null);
  resultEl.innerHTML = '<div class="result-empty">Freight pricing will appear here after an address is selected.</div>';

  if (preserveAddress && selectedAddress) {
    getFreightEl.disabled = false;
    renderSelectedAddress(selectedAddress);
  } else {
    clearSelectedAddress();
  }
}

function schedulePrepare(delay = PREPARE_DELAY_MS) {
  clearTimeout(prepareTimer);
  const items = getItems();
  const productKey = getProductKey();

  if (!items.length || !productKey || productKey === preparedKey || activePrepare) return;
  prepareTimer = setTimeout(() => prepareProducts(items, productKey), delay);
}

async function prepareProducts(items, productKey) {
  activePrepare = true;
  setStatus('Preparing products...');

  try {
    const data = await request('/api/prepare', { items });
    preparedKey = productKey;
    renderProductPreview(data.products || []);

    if (selectedAddress) {
      getFreightEl.disabled = false;
      renderSelectedAddress(selectedAddress);
    }

    if (selectedAddress && refreshPriceAfterPrepare) {
      refreshPriceAfterPrepare = false;
      fetchFreightPrice();
      return;
    }

    setStatus(selectedAddress ? 'Products updated. Click Get freight price to refresh.' : '');
    if (!selectedAddress && canSearchAddress()) {
      scheduleAddressLookup(100);
    }
  } catch (error) {
    console.error(error);
    setStatus('Could not prepare those products. Check the SKU, then try again.');
  } finally {
    activePrepare = false;
    if (getProductKey() && getProductKey() !== preparedKey) {
      schedulePrepare(100);
    }
  }
}

function canSearchAddress() {
  return getItems().length > 0 && addressInput.value.trim().length >= MIN_ADDRESS_SEARCH_LENGTH;
}

function scheduleAddressLookup(delay = ADDRESS_SEARCH_DELAY_MS) {
  clearTimeout(addressTimer);
  const address = addressInput.value.trim();

  if (selectedAddress && address !== selectedAddress) {
    clearSelectedAddress();
    latestPriceData = null;
  }

  if (!address) {
    hideAddressSuggestions();
    return;
  }

  if (!getItems().length) {
    if (address.length >= MIN_ADDRESS_SEARCH_LENGTH) {
      showAddressMessage('Select at least one product first.');
    }
    return;
  }

  if (address.length < MIN_ADDRESS_SEARCH_LENGTH) {
    showAddressMessage(`Type at least ${MIN_ADDRESS_SEARCH_LENGTH} characters to search addresses.`);
    return;
  }

  showAddressMessage(preparedKey === getProductKey() ? 'Searching address suggestions...' : 'Preparing products, then searching addresses...');
  addressTimer = setTimeout(fetchAddressSuggestions, delay);
}

async function fetchAddressSuggestions() {
  const items = getItems();
  const address = addressInput.value.trim();
  if (!items.length || !address) return;

  if (activePrepare && preparedKey !== getProductKey()) {
    clearTimeout(addressTimer);
    addressTimer = setTimeout(fetchAddressSuggestions, 300);
    return;
  }

  if (activeAddressSearch) {
    lastAddressQuery = address;
    return;
  }

  activeAddressSearch = true;
  lastAddressQuery = address;
  setStatus('Loading address suggestions...');
  showAddressMessage('Loading address suggestions...');

  try {
    const data = await request('/api/suggestions', { items, address });
    renderAddressSuggestions(data.suggestions || []);
    renderProductPreview(data.products || []);
    setStatus('Select the correct address from the list.');
  } catch (error) {
    console.error(error);
    setStatus('Could not load address suggestions. Keep typing or try the full street address.');
  } finally {
    activeAddressSearch = false;
    if (addressInput.value.trim() && addressInput.value.trim() !== lastAddressQuery) {
      clearTimeout(addressTimer);
      addressTimer = setTimeout(fetchAddressSuggestions, 300);
    }
  }
}

async function fetchStandaloneShipping(priceData) {
  const items = getItems();
  const address = priceData.selectedAddress || selectedAddress;
  const requestKey = getProductKey();
  if (!items.length || !address) return;

  setStatus('Freight price loaded. Loading warehouse details...');

  try {
    const data = await request('/api/item-shipping', { items, selectedAddress: address });
    if (requestKey !== getProductKey()) return;

    const itemShipping = data.itemShipping || [];
    const products = mergeProductLists(data.products || priceData.products || [], latestPriceData?.products || []);
    latestPriceData = {
      ...priceData,
      ...latestPriceData,
      products,
      itemShipping,
      freightBreakdown: enrichBreakdownWithStandalonePrices(latestPriceData || priceData, itemShipping)
    };

    renderFreightResult(latestPriceData);
    renderProductPreview(latestPriceData.products || [], itemShipping);
    setStatus('');
  } catch (_error) {
    setStatus('');
  }
}

async function fetchProductMetrics(priceData) {
  const items = getItems();
  const requestKey = getProductKey();
  if (!items.length) return;

  setStatus('Freight price loaded. Loading weight, CBM and carton details...');

  try {
    const data = await request('/api/product-metrics', {
      items,
      price: priceData.price,
      itemShipping: latestPriceData?.itemShipping || []
    });
    if (requestKey !== getProductKey()) return;

    latestPriceData = {
      ...priceData,
      ...latestPriceData,
      products: data.products || latestPriceData?.products || priceData.products,
      freightBreakdown: data.freightBreakdown || latestPriceData?.freightBreakdown || priceData.freightBreakdown
    };

    renderFreightResult(latestPriceData);
    renderProductPreview(latestPriceData.products || [], latestPriceData.itemShipping || []);
    setStatus('');
  } catch (_error) {
    setStatus('');
  }
}

async function fetchFreightPrice() {
  const items = getItems();
  if (!items.length || !selectedAddress) {
    setStatus('Select at least one product and an address first.');
    return;
  }

  setStatus('Getting freight price...');
  resultEl.innerHTML = '<div class="result-empty">Loading freight price from checkout...</div>';

  try {
    const data = await request('/api/price', { items, selectedAddress });
    latestPriceData = data;
    renderFreightResult(latestPriceData);
    renderProductPreview(latestPriceData.products || [], latestPriceData.itemShipping || []);
    selectedAddress = data.selectedAddress || selectedAddress;
    renderSelectedAddress(selectedAddress);
    setStatus('');
    await copyFreightPrice();
    fetchProductMetrics(latestPriceData);
    fetchStandaloneShipping(latestPriceData);
  } catch (error) {
    console.error(error);
    resultEl.innerHTML = '<div class="result-empty">Freight price could not be loaded. Try again, or reselect the address.</div>';
    copyFreightEl.hidden = true;
    setStatus('Could not get freight price. Try clicking Get freight price again.');
  }
}

function updateRemoveButtons() {
  const buttons = Array.from(document.querySelectorAll('.remove-product'));
  buttons.forEach(button => {
    button.disabled = buttons.length === 1;
  });
}

function addProductRow() {
  const row = document.createElement('div');
  row.className = 'product-row';
  row.innerHTML = `
    <div class="product-search">
      <label>Product URL or SKU</label>
      <input class="sku-input" type="search" autocomplete="off" />
      <div class="product-suggestions"></div>
    </div>
    <div>
      <label>Qty</label>
      <input class="sku-qty" type="number" min="1" step="1" value="1" />
    </div>
    <button class="remove-product" type="button">Remove</button>
  `;
  productRowsEl.appendChild(row);
  updateRemoveButtons();
  row.querySelector('.sku-input').focus();
}

function selectProduct(option) {
  const row = option.closest('.product-row');
  const input = row?.querySelector('.sku-input');
  const sku = option.dataset.sku || '';
  if (!input || !sku) return;

  input.value = sku;
  hideProductSuggestions(input);
  resetProductState({ preserveAddress: true, refreshPrice: true });
  schedulePrepare(100);
  if (!selectedAddress && canSearchAddress()) {
    scheduleAddressLookup(100);
  }
}

addProductEl.addEventListener('click', addProductRow);
getFreightEl.addEventListener('click', fetchFreightPrice);
copyFreightEl.addEventListener('click', copyFreightPrice);

productRowsEl.addEventListener('input', event => {
  if (event.target.classList.contains('sku-input')) {
    scheduleProductSearch(event.target);
  }
  resetProductState({ preserveAddress: true, refreshPrice: true });
  schedulePrepare();
  if (!selectedAddress && canSearchAddress()) {
    scheduleAddressLookup();
  }
});

productRowsEl.addEventListener('click', event => {
  const productOption = event.target.closest('.product-option');
  if (productOption) {
    selectProduct(productOption);
    return;
  }

  if (!event.target.classList.contains('remove-product')) return;
  event.target.closest('.product-row').remove();
  updateRemoveButtons();
  resetProductState({ preserveAddress: true, refreshPrice: true });
  schedulePrepare();
});

suggestionsEl.addEventListener('click', event => {
  const item = event.target.closest('.suggestion-item');
  if (!item) return;

  selectedAddress = item.dataset.address || item.textContent.trim();
  addressInput.value = selectedAddress;
  getFreightEl.disabled = false;
  hideAddressSuggestions();
  renderSelectedAddress(selectedAddress);
  setStatus('');
});

addressInput.addEventListener('input', () => {
  scheduleAddressLookup();
});

document.addEventListener('click', event => {
  if (event.target.closest('.product-search')) return;
  document.querySelectorAll('.sku-input').forEach(input => hideProductSuggestions(input));
});

updateRemoveButtons();
