const skuList = document.getElementById('skuList');
const addSkuButton = document.getElementById('addSku');
const scanButton = document.getElementById('scan');
const checkButton = document.getElementById('check');
const statusElement = document.getElementById('status');
const resultsElement = document.getElementById('results');
const scannerBackdrop = document.getElementById('scannerBackdrop');
const closeScannerButton = document.getElementById('closeScanner');

const SEARCH_DELAY_MS = 250;
let productSearchTimer = null;
let productSearchController = null;
let availabilityController = null;
let scanner = null;
let scannerRunning = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

function getRows() {
  return Array.from(skuList.querySelectorAll('.sku-row'));
}

function getItems() {
  return getRows()
    .map(row => ({
      sku: row.querySelector('.sku-input').value.trim(),
      quantity: Math.max(1, Number.parseInt(row.querySelector('.qty').value, 10) || 1)
    }))
    .filter(item => item.sku);
}

function updateRemoveButtons() {
  const removeButtons = skuList.querySelectorAll('.remove');
  removeButtons.forEach(button => {
    button.disabled = removeButtons.length === 1;
  });
}

function createSkuRow(value = '') {
  const row = document.createElement('div');
  row.className = 'sku-row';
  row.innerHTML = `
    <div class="sku-search">
      <input class="sku-input" type="search" autocomplete="off" placeholder="Enter SKU or scan code" aria-label="Product SKU" value="${escapeHtml(value)}" />
      <div class="sku-product-suggestions"></div>
    </div>
    <input class="qty" type="number" min="1" step="1" value="1" aria-label="Quantity" />
    <button class="icon-button remove" type="button" aria-label="Remove product" title="Remove product">&times;</button>
  `;
  skuList.appendChild(row);
  updateRemoveButtons();
  return row;
}

function getSuggestionBox(input) {
  return input.closest('.sku-search').querySelector('.sku-product-suggestions');
}

function hideProductSuggestions(input) {
  const box = getSuggestionBox(input);
  box.classList.remove('is-visible');
  box.innerHTML = '';
}

function hideAllProductSuggestions() {
  skuList.querySelectorAll('.sku-input').forEach(input => hideProductSuggestions(input));
}

function renderProductSuggestions(input, products) {
  const box = getSuggestionBox(input);
  if (!products.length) {
    box.innerHTML = '<div class="sku-product-empty">No matching products found.</div>';
  } else {
    box.innerHTML = products.map(product => `
      <div class="sku-product-option" role="button" tabindex="0" data-sku="${escapeHtml(product.sku)}">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="">` : '<div></div>'}
        <div>
          <strong>${escapeHtml(product.title || 'Product')}</strong>
          <span>${escapeHtml(product.sku)}${product.available ? ' - Available' : ' - Unavailable'}</span>
        </div>
      </div>
    `).join('');
  }
  box.classList.add('is-visible');
}

function scheduleProductSearch(input) {
  clearTimeout(productSearchTimer);
  productSearchController?.abort();
  const query = input.value.trim();

  if (query.length < 2) {
    hideProductSuggestions(input);
    return;
  }

  productSearchTimer = setTimeout(async () => {
    productSearchController = new AbortController();
    try {
      const response = await fetch(`/api/product-search?q=${encodeURIComponent(query)}`, {
        signal: productSearchController.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search failed');
      if (input.value.trim() === query) {
        renderProductSuggestions(input, data.products || []);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        renderProductSuggestions(input, []);
      }
    }
  }, SEARCH_DELAY_MS);
}

function renderAvailability(products) {
  resultsElement.innerHTML = products.map(product => {
    const requested = Math.max(1, Number(product.quantity) || 1);
    const addToCart = Math.max(0, Number(product.addToCartQuantity) || 0);
    const preSale = Math.max(0, Number(product.preSaleQuantity) || 0);
    const storefrontUnavailable = Boolean(product.storefrontError);
    const unavailable = !storefrontUnavailable && addToCart === 0 && preSale === 0;
    const className = unavailable ? 'unavailable' : preSale ? 'presale' : '';
    const image = product.image
      ? `<img class="product-image" src="${escapeHtml(product.image)}" alt="">`
      : '<div class="product-image"></div>';
    const websiteUrl = product.url || product.productUrl || '';

    let pills = '';
    if (storefrontUnavailable) {
      pills += `<span class="pill pending">${escapeHtml(product.storefrontError)}</span>`;
    } else if (addToCart) {
      pills += `<span class="pill">${addToCart} add to cart</span>`;
    }
    if (!storefrontUnavailable && preSale) {
      pills += `<span class="pill presale">${preSale} pre-sale</span>`;
    }
    if (unavailable) {
      pills += '<span class="pill unavailable">Unavailable</span>';
    }

    return `
      <article class="product-card ${className}">
        ${image}
        <div>
          <div class="product-sku">${escapeHtml(product.sku || '')} - Qty ${requested}</div>
          <h2 class="product-name">${escapeHtml(product.title || 'Living Culture product')}</h2>
          <div class="availability">${pills}</div>
          ${websiteUrl ? `<a class="product-link" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">View product</a>` : ''}
        </div>
        ${renderCin7Stock(product.cin7Stock)}
      </article>
    `;
  }).join('');
}

function renderCin7Stock(stock) {
  if (!stock?.connected) {
    return `
      <section class="stock">
        <div class="stock-title">Cin7 location stock</div>
        <p class="stock-message">Cin7 connection is not available.</p>
      </section>
    `;
  }

  if (stock.error) {
    return `
      <section class="stock">
        <div class="stock-title">Cin7 location stock</div>
        <p class="stock-message error">${escapeHtml(stock.error)}</p>
      </section>
    `;
  }

  if (!stock.locations?.length) {
    return `
      <section class="stock">
        <div class="stock-title">Cin7 location stock</div>
        <p class="stock-message">No stock is recorded for this SKU.</p>
      </section>
    `;
  }

  return `
    <section class="stock">
      <div class="stock-title">Cin7 location stock</div>
      <div class="stock-columns"><span>Location</span><span>Avail.</span><span>Hand</span><span>Alloc.</span><span>Order</span></div>
      ${stock.locations.map(location => `
        <div class="stock-row">
          <strong>${escapeHtml(location.location)}</strong>
          <span class="${location.available > 0 ? 'stock-positive' : ''}">${escapeHtml(location.available)}</span>
          <span>${escapeHtml(location.onHand)}</span>
          <span>${escapeHtml(location.allocated)}</span>
          <span>${escapeHtml(location.onOrder)}</span>
        </div>
      `).join('')}
    </section>
  `;
}

async function checkAvailability() {
  const items = getItems();
  if (!items.length) {
    setStatus('Enter or scan at least one SKU.', true);
    return;
  }

  availabilityController?.abort();
  availabilityController = new AbortController();
  clearTimeout(productSearchTimer);
  productSearchController?.abort();
  productSearchController = null;
  hideAllProductSuggestions();
  checkButton.disabled = true;
  setStatus('Checking product availability...');

  try {
    const response = await fetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: availabilityController.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Availability lookup failed');
    renderAvailability(data.products || []);
    setStatus('');
  } catch (error) {
    if (error.name !== 'AbortError') {
      setStatus(`Could not check products: ${error.message}`, true);
    }
  } finally {
    checkButton.disabled = false;
    availabilityController = null;
  }
}

function skuFromScannedText(text) {
  const value = String(text || '').trim();
  const skuMatch = value.match(/\b(?:CS|BDV|PO|PJ|SK)[A-Z0-9-]+\b/i);
  return skuMatch ? skuMatch[0].toUpperCase() : value;
}

function insertScannedSku(scannedText) {
  const sku = skuFromScannedText(scannedText);
  if (!sku) return;

  let row = getRows().find(item => !item.querySelector('.sku-input').value.trim());
  if (!row) row = createSkuRow();
  row.querySelector('.sku-input').value = sku;
  hideProductSuggestions(row.querySelector('.sku-input'));
  closeScanner();
  checkAvailability();
}

async function openScanner() {
  scannerBackdrop.classList.add('open');
  setStatus('');

  if (!window.Html5Qrcode) {
    setStatus('Scanner could not load. Enter the SKU manually.', true);
    return;
  }

  scanner = scanner || new Html5Qrcode('reader');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 150 } },
      decodedText => insertScannedSku(decodedText),
      () => {}
    );
    scannerRunning = true;
  } catch (error) {
    setStatus('Camera access was not available. Enter the SKU manually.', true);
  }
}

async function closeScanner() {
  scannerBackdrop.classList.remove('open');
  if (!scanner || !scannerRunning) return;

  try {
    await scanner.stop();
  } catch (error) {
    // Scanner can already be stopped after a successful read.
  }
  scannerRunning = false;
  document.getElementById('reader').innerHTML = '';
}

addSkuButton.addEventListener('click', () => {
  createSkuRow().querySelector('.sku-input').focus();
});

checkButton.addEventListener('click', checkAvailability);
scanButton.addEventListener('click', openScanner);
closeScannerButton.addEventListener('click', closeScanner);
scannerBackdrop.addEventListener('click', event => {
  if (event.target === scannerBackdrop) closeScanner();
});

skuList.addEventListener('input', event => {
  if (event.target.classList.contains('sku-input')) {
    scheduleProductSearch(event.target);
  }
});

skuList.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.classList.contains('sku-input')) {
    event.preventDefault();
    hideProductSuggestions(event.target);
    checkAvailability();
  }
});

skuList.addEventListener('click', event => {
  const option = event.target.closest('.sku-product-option');
  if (option) {
    const input = option.closest('.sku-search').querySelector('.sku-input');
    input.value = option.dataset.sku || '';
    hideProductSuggestions(input);
    checkAvailability();
    return;
  }

  const removeButton = event.target.closest('.remove');
  if (!removeButton || removeButton.disabled) return;
  removeButton.closest('.sku-row').remove();
  updateRemoveButtons();
});

document.addEventListener('click', event => {
  if (event.target.closest('.sku-search')) return;
  hideAllProductSuggestions();
});
