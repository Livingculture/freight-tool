const express = require('express');
const path = require('path');
const { chromium } = require('playwright');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const DEFAULT_WAIT = 10000;
const HEADLESS = process.env.HEADLESS !== 'false';
const CHECKOUT_IDLE_MS = 5 * 60 * 1000;
const productCache = new Map();
const productSummaryCache = new Map();
let activeCheckout = null;
const ADDRESS_INPUT_SELECTORS = [
  '#shipping-address1:visible',
  'input[name="address1"]:visible',
  'input[autocomplete*="address"]',
  'input[placeholder*="address" i]',
  'input[name*="address" i]',
  'input[id*="address" i]',
  'input[aria-label*="address" i]',
  'input[placeholder*="suburb" i]',
  'input[name*="suburb" i]',
  'input[id*="suburb" i]',
  'input[placeholder*="postcode" i]',
  'input[name*="postcode" i]',
  'input[id*="postcode" i]'
];
const SUGGESTION_SELECTORS = [
  '#shipping-address1-options [role="option"]',
  '#shipping-address1-options li',
  '.autocomplete-suggestion',
  '.pac-item',
  '.address-suggestion',
  '[role="option"]',
  '.suggestion-item',
  '[class*="suggestion" i]',
  '[class*="autocomplete" i] li',
  '[class*="dropdown" i] li'
];

async function findElement(page, selectors) {
  for (const selector of selectors) {
    const handle = await page.$(selector);
    if (handle) return handle;
  }
  throw new Error(`None of these selectors were found: ${selectors.join(', ')}`);
}

async function createBrowserSession() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  return {
    page,
    close: () => browser.close()
  };
}

function normaliseQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function normaliseItems({ productUrl, sku, skus, items }) {
  if (Array.isArray(items)) {
    return items
      .map(item => ({
        sku: String(item?.sku || '').trim(),
        productUrl: item?.productUrl ? String(item.productUrl).trim() : '',
        quantity: normaliseQuantity(item?.quantity)
      }))
      .filter(item => item.sku || item.productUrl);
  }

  if (Array.isArray(skus)) {
    return skus
      .map(value => typeof value === 'object'
        ? { sku: String(value?.sku || '').trim(), quantity: normaliseQuantity(value?.quantity) }
        : { sku: String(value).trim(), quantity: 1 })
      .filter(item => item.sku);
  }

  if (sku) {
    return [{ sku: String(sku).trim(), quantity: 1 }];
  }

  if (productUrl) {
    return [{ productUrl: String(productUrl).trim(), quantity: 1 }];
  }

  return [];
}

function makeProductKey({ productUrl, sku, skus, items }) {
  return normaliseItems({ productUrl, sku, skus, items })
    .map(item => item.productUrl ? `url:${item.productUrl}:qty:${item.quantity}` : `sku:${item.sku}:qty:${item.quantity}`)
    .join('|');
}

function scheduleCheckoutCleanup() {
  if (!activeCheckout) return;
  clearTimeout(activeCheckout.cleanupTimer);
  activeCheckout.cleanupTimer = setTimeout(() => {
    closeActiveCheckout().catch(() => {});
  }, CHECKOUT_IDLE_MS);
}

async function closeActiveCheckout() {
  if (!activeCheckout) return;
  const checkout = activeCheckout;
  activeCheckout = null;
  clearTimeout(checkout.cleanupTimer);
  await checkout.session.close().catch(() => {});
}

async function getCheckoutSession({ productUrl, sku, skus, items }) {
  const key = makeProductKey({ productUrl, sku, skus, items });

  if (activeCheckout?.key === key) {
    activeCheckout.lastUsed = Date.now();
    scheduleCheckoutCleanup();

    if (!/\/checkouts\/.*\/information/.test(activeCheckout.page.url())) {
      activeCheckout.products = await prepareCheckout(activeCheckout.page, { productUrl, sku, skus, items });
    }

    return activeCheckout;
  }

  await closeActiveCheckout();
  const session = await createBrowserSession();
  const products = await prepareCheckout(session.page, { productUrl, sku, skus, items });
  activeCheckout = {
    key,
    session,
    page: session.page,
    products,
    cleanupTimer: null,
    lastUsed: Date.now()
  };
  scheduleCheckoutCleanup();
  return activeCheckout;
}

function getVariantIdFromUrl(productUrl) {
  if (!productUrl) return null;
  try {
    const url = new URL(productUrl);
    return url.searchParams.get('variant');
  } catch (error) {
    return null;
  }
}

function buildProductFromDetails(details, resolvedUrl, includeMetrics) {
  const product = {
    url: resolvedUrl,
    variantId: details.variantId,
    sku: details.sku,
    title: normaliseSuggestion(details.variantTitle && details.variantTitle !== 'Default Title' ? `${details.title} - ${details.variantTitle}` : details.title || 'Living Culture product'),
    image: details.image,
    available: details.available,
    weightKg: null,
    cartons: [],
    unitsPerCarton: 1,
    cbm: 0,
    metricsLoaded: false
  };

  if (!includeMetrics) {
    return product;
  }

  const descriptionSource = details.descriptionHtml || '';
  const pageTextSource = `${details.specTableText || ''}\n${details.pageText || ''}`;
  const combinedSource = `${descriptionSource}\n${pageTextSource}`;
  const variantPackageTable = parseVariantPackageTable(descriptionSource, details.variantTitle);
  const tableCartons = parseSpecCellCartons(details.specTableRows, combinedSource);
  const cartons = variantPackageTable.cartons.length ? variantPackageTable.cartons : tableCartons.length ? tableCartons : parseCartonDimensions(pageTextSource);

  product.weightKg = variantPackageTable.weightKg || parseSpecCellWeight(details.specTableRows, combinedSource) || parseGrossWeightKg(descriptionSource) || parseSpecificationTableWeight(pageTextSource) || parseListedWeightKg(combinedSource) || parseGrossWeightKg(pageTextSource) || (details.weightGrams ? roundNumber(details.weightGrams / 1000, 2) : null);
  product.cartons = cartons.length ? cartons : parseCartonDimensions(descriptionSource);
  product.unitsPerCarton = parseUnitsPerCarton(combinedSource);
  product.cbm = variantPackageTable.cbm || roundNumber(product.cartons.reduce((total, carton) => total + carton.cbm, 0), 3);
  product.metricsLoaded = true;
  return product;
}

async function getProductDetails(page, { productUrl, sku }, { includeMetrics = false } = {}) {
  const cacheKey = makeProductKey({ productUrl, sku });
  const cache = includeMetrics ? productCache : productSummaryCache;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (includeMetrics && productCache.has(cacheKey)) {
    return productCache.get(cacheKey);
  }

  let resolvedUrl = productUrl;

  if (!resolvedUrl && sku) {
    resolvedUrl = await getProductUrlBySKU(page, sku);
  }

  if (!resolvedUrl) {
    throw new Error('Product URL or SKU is required');
  }

  await page.goto(resolvedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (includeMetrics) {
    await page.waitForFunction(() => /Specifications|Package Dimensions|Packing size|Gross Weight/i.test(document.body?.innerText || ''), {
      timeout: 5000
    }).catch(() => {});
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('table')).some(table => {
        const text = table.innerText || '';
        return /package\s*dimensions/i.test(text) && /gross\s*weight/i.test(text);
      });
    }, { timeout: 5000 }).catch(() => {});
  }

  const details = await page.evaluate(async ({ requestedSku, includeMetrics }) => {
    const normaliseUrl = value => {
      if (!value) return '';
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return new URL(value, location.origin).toString();
      return value.replace(/^http:\/\//, 'https://');
    };

    const productPath = `${location.pathname.replace(/\/$/, '')}.js`;
    const response = await fetch(productPath);
    const product = response.ok ? await response.json() : null;
    const requestedSkuLower = requestedSku ? requestedSku.toLowerCase() : '';
    const variant =
      product?.variants?.find(item => String(item.sku || '').toLowerCase() === requestedSkuLower) ||
      product?.variants?.find(item => String(item.id) === new URL(location.href).searchParams.get('variant')) ||
      product?.variants?.[0];
    const image =
      variant?.featured_image?.src ||
      product?.featured_image ||
      product?.images?.[0] ||
      document.querySelector('meta[property="og:image"]')?.content ||
      '';
    const specTableRows = Array.from(document.querySelectorAll('table'))
      .filter(table => /package\s*dimensions/i.test(table.innerText || '') && /gross\s*weight/i.test(table.innerText || ''))
      .flatMap(table => Array.from(table.querySelectorAll('tr')).slice(1).map(row =>
        Array.from(row.querySelectorAll('td, th')).map(cell => (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim())
      ))
      .filter(cells => cells.length >= 5);
    const specTableText = Array.from(document.querySelectorAll('table'))
      .filter(table => /package\s*dimensions/i.test(table.innerText || '') && /gross\s*weight/i.test(table.innerText || ''))
      .map(table => table.innerText || '')
      .join('\n');

    return {
      title: product?.title || document.querySelector('meta[property="og:title"]')?.content || document.querySelector('h1')?.textContent?.trim() || document.title,
      image: normaliseUrl(image),
      variantId: variant?.id ? String(variant.id) : '',
      sku: variant?.sku || '',
      variantTitle: variant?.public_title || variant?.title || '',
      available: Boolean(variant?.available),
      weightGrams: Number(variant?.weight || 0),
      descriptionHtml: includeMetrics ? product?.description || '' : '',
      pageText: includeMetrics ? document.body?.innerText || '' : '',
      specTableRows: includeMetrics ? specTableRows : [],
      specTableText: includeMetrics ? specTableText : ''
    };
  }, { requestedSku: sku || '', includeMetrics });

  if (!details.variantId) {
    details.variantId = getVariantIdFromUrl(resolvedUrl);
  }

  if (!details.variantId) {
    throw new Error('Could not find a variant ID for this product');
  }

  if (sku && details.sku.toLowerCase() !== sku.toLowerCase()) {
    throw new Error(`Search result did not contain exact SKU ${sku}`);
  }

  const product = buildProductFromDetails(details, page.url(), includeMetrics);
  cache.set(cacheKey, product);
  if (includeMetrics) {
    productSummaryCache.set(cacheKey, {
      ...product,
      weightKg: null,
      cartons: [],
      unitsPerCarton: 1,
      cbm: 0,
      metricsLoaded: false
    });
  }
  return product;
}

function roundNumber(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseMoneyToCents(priceText) {
  const match = String(priceText || '').replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return match ? Math.round(Number(match[1]) * 100) : 0;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildFreightBreakdown(products, priceText, itemShipping = []) {
  const totalCents = parseMoneyToCents(priceText);
  const basis = products.some(product => Number(product.cbm) > 0) ? 'CBM' : 'weight';
  const basisValues = products.map(product => {
    const quantity = normaliseQuantity(product.quantity);
    if (basis === 'CBM') {
      return getLineCbm(product, quantity);
    }
    return (Number(product.weightKg) || 0) * quantity;
  });
  const basisTotal = basisValues.reduce((total, value) => total + value, 0);
  const shippingBySku = new Map(itemShipping.map(item => [item.sku, item]));
  const hasMissingBasis = basisValues.some(value => !Number.isFinite(value) || value <= 0);

  if (!totalCents || !basisTotal || hasMissingBasis) {
    return {
      basis,
      total: priceText,
      items: products.map((product, index) => ({
        sku: product.sku,
        title: product.title,
        quantity: normaliseQuantity(product.quantity),
        basisValue: basisValues[index] || null,
        itemShipping: shippingBySku.get(product.sku),
        price: null
      }))
    };
  }

  let allocatedCents = 0;
  const items = products.map((product, index) => {
    const cents = index === products.length - 1
      ? totalCents - allocatedCents
      : Math.round((basisValues[index] / basisTotal) * totalCents);
    allocatedCents += cents;
    return {
      sku: product.sku,
      title: product.title,
      quantity: normaliseQuantity(product.quantity),
      basisValue: basisValues[index],
      itemShipping: shippingBySku.get(product.sku),
      price: formatMoney(cents)
    };
  });

  return { basis, total: formatMoney(totalCents), items };
}

function getLineCbm(product, quantity = normaliseQuantity(product.quantity)) {
  const cbm = Number(product.cbm) || 0;
  const unitsPerCarton = normaliseQuantity(product.unitsPerCarton);
  if (!cbm || unitsPerCarton <= 1) return cbm * quantity;
  return cbm * Math.ceil(quantity / unitsPerCarton);
}

async function getSingleProductShippingSummaries(products, selectedAddress) {
  return Promise.all(products.map(async product => {
    const session = await createBrowserSession();
    try {
      await openCheckoutForProducts(session.page, [product]);
      const result = await selectAddressAndGetPrice(session.page, selectedAddress);
      return {
        sku: product.sku,
        method: result.method,
        price: result.price
      };
    } catch (error) {
      return {
        sku: product.sku,
        error: error.message
      };
    } finally {
      await session.close().catch(() => {});
    }
  }));
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function descriptionToLines(descriptionHtml) {
  const text = decodeHtmlEntities(String(descriptionHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' '));

  return text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function descriptionToText(descriptionHtml) {
  return descriptionToLines(descriptionHtml).join('\n');
}

function normalisePackageLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(word => word.endsWith('s') ? word.slice(0, -1) : word)
    .join(' ');
}

function getPackageQuantity(packageQuantities, label) {
  const normalisedLabel = normalisePackageLabel(label);
  if (!normalisedLabel) return 1;

  for (const [contentLabel, quantity] of packageQuantities.entries()) {
    if (normalisedLabel === contentLabel) {
      return quantity;
    }
  }

  const matches = Array.from(packageQuantities.entries())
    .filter(([contentLabel]) => {
      const contentWordCount = contentLabel.split(/\s+/).filter(Boolean).length;
      return contentWordCount >= 2 && (normalisedLabel.includes(contentLabel) || contentLabel.includes(normalisedLabel));
    })
    .sort((a, b) => b[0].length - a[0].length);

  if (matches.length) {
    return matches[0][1];
  }

  return 1;
}

function parsePackageContents(descriptionHtml) {
  const lines = descriptionToLines(descriptionHtml);
  const quantities = new Map();
  const stopPattern = /^(?:product dimensions?|package\s*(?:dimensions?|size)|packaging\s*dimensions?|packing\s*size|carton\s*dimensions?|gross weight|net weight|specifications?|features?|good to know|care|assembly|materials?|colour|warranty)\b/i;
  let inContentsSection = false;

  for (const line of lines) {
    if (/package\s*contents?|box\s*contents?|included\b/i.test(line)) {
      inContentsSection = true;
      continue;
    }

    if (inContentsSection && stopPattern.test(line)) {
      inContentsSection = false;
    }

    if (!inContentsSection) continue;

    const match = line.match(/^(\d+)\s*(?:[x×*]|pcs?|pieces?)?\s+(.+)$/i);
    if (!match) continue;

    const quantity = Number(match[1]);
    const label = normalisePackageLabel(match[2]);
    if (!quantity || !label) continue;

    quantities.set(label, Math.max(quantities.get(label) || 0, quantity));
  }

  return quantities;
}

function getLineLabelBeforeMatch(line, matchIndex) {
  return line
    .slice(0, matchIndex)
    .replace(/(?:package|packaging|packing|carton|box)\s*(?:dimensions?|size)?\s*:?/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[:\-–—]+/g, ' ')
    .trim();
}

function addCarton(cartons, seen, dimensionsCm, label = '', quantity = 1, cbmOverride = null) {
  if (dimensionsCm.some(dimension => !Number.isFinite(dimension) || dimension <= 0)) return;
  const key = `${normalisePackageLabel(label)}:${dimensionsCm.join('x')}`;
  if (seen.has(key)) return;
  seen.add(key);
  const singleCbm = roundNumber(dimensionsCm.reduce((volume, dimension) => volume * dimension, 1) / 1000000, 3);
  const cbm = Number.isFinite(cbmOverride) && cbmOverride > 0 ? cbmOverride : singleCbm * quantity;
  cartons.push({
    label,
    quantity,
    dimensionsCm,
    cbm: roundNumber(cbm, 3)
  });
}

function parseCartonDimensions(descriptionHtml) {
  const specificationCartons = parseSpecificationTableCartons(descriptionHtml);
  if (specificationCartons.length) {
    return specificationCartons;
  }

  const lines = descriptionToLines(descriptionHtml);
  const text = lines.join('\n');
  const packageQuantities = parsePackageContents(descriptionHtml);
  const cartons = [];
  const seen = new Set();
  const dimensionPattern = /(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?/gi;
  const stopPattern = /^(?:gross weight|net weight|product dimensions?|specifications?|features?|good to know|care|assembly|materials?|colour|warranty)\b/i;
  let inPackageSection = false;

  for (const line of lines) {
    if (/package\s*(?:dimensions?|size)|packaging\s*dimensions?|packing\s*size|carton\s*dimensions?|box\s*dimensions?/i.test(line)) {
      inPackageSection = true;
    } else if (inPackageSection && stopPattern.test(line)) {
      inPackageSection = false;
    }

    if (!inPackageSection) continue;

    for (const match of line.matchAll(dimensionPattern)) {
      const label = getLineLabelBeforeMatch(line, match.index);
      addCarton(cartons, seen, match.slice(1, 4).map(Number), label, getPackageQuantity(packageQuantities, label));
    }
  }

  if (cartons.length) {
    return cartons;
  }

  const fallbackPattern = /(?:Package\s*(?:Dimensions?|Size|\d+)?|Packaging\s*Dimensions?|Packing\s*Size|Carton\s*\d*|Box)\s*:?\s*[^0-9\n]{0,80}?(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?/gi;
  for (const match of text.matchAll(fallbackPattern)) {
    addCarton(cartons, seen, match.slice(1, 4).map(Number));
  }

  return cartons;
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTableRows(descriptionHtml) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;

  for (const rowMatch of String(descriptionHtml || '').matchAll(rowPattern)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const colspan = Number.parseInt(cellMatch[1].match(/\bcolspan=["']?(\d+)/i)?.[1] || '1', 10) || 1;
      const text = stripHtml(cellMatch[2]);
      for (let index = 0; index < colspan; index += 1) {
        cells.push(text);
      }
    }
    if (cells.length) {
      rows.push(cells);
    }
  }

  return rows;
}

function parseVariantParts(variantTitle) {
  const parts = String(variantTitle || '').split('/').map(part => part.trim()).filter(Boolean);
  return {
    size: parts[0] || '',
    colour: parts.slice(1).join(' ')
  };
}

function scoreColourCell(cell, selectedColour) {
  const normalisedCell = normalisePackageLabel(cell);
  const normalisedColour = normalisePackageLabel(selectedColour);
  if (!normalisedColour) return 0;
  if (normalisedCell === normalisedColour) return 100;
  if (!normalisedCell.includes(normalisedColour)) return -100;

  let score = 20;
  for (const token of ['black', 'white', 'charcoal']) {
    const selectedHasToken = normalisedColour.includes(token);
    const cellHasToken = normalisedCell.includes(token);
    if (selectedHasToken && cellHasToken) score += 5;
    if (!selectedHasToken && cellHasToken) score -= 4;
  }
  return score;
}

function findVariantTableColumn(rows, variantTitle) {
  const { size, colour } = parseVariantParts(variantTitle);
  const normalisedSize = normalisePackageLabel(size);
  if (!normalisedSize) return -1;

  const sizeRow = rows.find(row => /^size$/i.test(row[0] || '') && row.some(cell => normalisePackageLabel(cell) === normalisedSize));
  if (!sizeRow) return -1;

  const candidates = sizeRow
    .map((cell, index) => ({ index, cell }))
    .filter(item => item.index > 0 && normalisePackageLabel(item.cell) === normalisedSize)
    .map(item => item.index);

  if (!candidates.length) return -1;
  if (candidates.length === 1) return candidates[0];

  const colourRow = rows.find(row => /^colou?r$/i.test(row[0] || ''));
  if (!colourRow) return candidates[0];

  return candidates
    .map(index => ({ index, score: scoreColourCell(colourRow[index] || '', colour) }))
    .sort((a, b) => b.score - a.score)[0]?.index || candidates[0];
}

function parsePackageCell(cell) {
  const text = String(cell || '').replace(/，/g, ',');
  const dimensionsCm = parseDimensionText(text);
  if (!dimensionsCm) return null;

  const weightKg = Number(text.match(/,\s*(\d+(?:\.\d+)?)\s*kgs?\b/i)?.[1] || '');
  const cbm = Number(text.match(/kgs?\s*,\s*(\d+(?:\.\d+)?)/i)?.[1] || '');

  return {
    dimensionsCm,
    weightKg: Number.isFinite(weightKg) ? weightKg : null,
    cbm: Number.isFinite(cbm) ? cbm : null
  };
}

function parseVariantPackageTable(descriptionHtml, variantTitle) {
  const rows = parseTableRows(descriptionHtml);
  const columnIndex = findVariantTableColumn(rows, variantTitle);
  if (columnIndex === -1) return { cartons: [], weightKg: null, cbm: null };

  const cartons = [];
  const seen = new Set();
  let packageWeightKg = 0;
  let packageCbm = 0;

  for (const row of rows) {
    const label = row[0] || '';
    if (!/^package\s+\d+/i.test(label)) continue;

    const packageData = parsePackageCell(row[columnIndex]);
    if (!packageData) continue;

    addCarton(cartons, seen, packageData.dimensionsCm, label, 1, packageData.cbm);
    packageWeightKg += Number(packageData.weightKg) || 0;
    packageCbm += Number(packageData.cbm) || 0;
  }

  if (!cartons.length) return { cartons: [], weightKg: null, cbm: null };

  const grossWeightRow = rows.find(row => /^gross\s*weight$/i.test(row[0] || ''));
  const volumeRow = rows.find(row => /^volume$/i.test(row[0] || ''));
  const grossWeightKg = Number(String(grossWeightRow?.[columnIndex] || '').match(/(\d+(?:\.\d+)?)/)?.[1] || '');
  const volumeCbm = Number(String(volumeRow?.[columnIndex] || '').match(/(\d+(?:\.\d+)?)/)?.[1] || '');

  return {
    cartons,
    weightKg: Number.isFinite(grossWeightKg) && grossWeightKg > 0 ? roundNumber(grossWeightKg, 2) : packageWeightKg ? roundNumber(packageWeightKg, 2) : null,
    cbm: Number.isFinite(volumeCbm) && volumeCbm > 0 ? roundNumber(volumeCbm, 3) : packageCbm ? roundNumber(packageCbm, 3) : null
  };
}

function parseGrossWeightKg(descriptionHtml) {
  const lines = descriptionToLines(descriptionHtml);
  const packageQuantities = parsePackageContents(descriptionHtml);
  const weights = [];
  const weightPattern = /(\d+(?:\.\d+)?)\s*kgs?\b/gi;
  const stopPattern = /^(?:product dimensions?|package\s*(?:dimensions?|size)|packaging\s*dimensions?|packing\s*size|carton\s*dimensions?|specifications?|features?|good to know|care|assembly|materials?|colour|warranty)\b/i;
  let inWeightSection = false;

  for (const line of lines) {
    if (/gross\s*weight/i.test(line)) {
      inWeightSection = true;
    } else if (inWeightSection && stopPattern.test(line)) {
      inWeightSection = false;
    }

    if (!inWeightSection) continue;

    for (const match of line.matchAll(weightPattern)) {
      const label = getLineLabelBeforeMatch(line, match.index);
      weights.push(Number(match[1]) * getPackageQuantity(packageQuantities, label));
    }
  }

  if (!weights.length) {
    const specificationWeight = parseSpecificationTableWeight(descriptionHtml);
    if (specificationWeight) {
      return specificationWeight;
    }

    const text = descriptionToText(descriptionHtml);
    const grossWeightPattern = /gross\s*weight\s*:?\s*[^0-9\n]{0,80}?(\d+(?:\.\d+)?)\s*kgs?\b/gi;
    for (const match of text.matchAll(grossWeightPattern)) {
      weights.push(Number(match[1]));
    }
  }

  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  return totalWeight ? roundNumber(totalWeight, 2) : null;
}

function parseSpecificationTableRows(descriptionHtml) {
  const lines = descriptionToLines(descriptionHtml);
  const rows = [];
  let inSpecificationTable = false;
  let possibleSpecificationTable = false;
  let pendingLabel = '';
  const dimensionPattern = /(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?/gi;

  for (const line of lines) {
    if (/component\b/i.test(line) && /package\s*dimensions?/i.test(line) && /gross\s*weight/i.test(line)) {
      inSpecificationTable = true;
      continue;
    }

    if (/component\b/i.test(line) && /package\s*dimensions?/i.test(line)) {
      possibleSpecificationTable = true;
      continue;
    }

    if (possibleSpecificationTable && /gross\s*weight/i.test(line)) {
      inSpecificationTable = true;
      possibleSpecificationTable = false;
      continue;
    }

    if (!inSpecificationTable) continue;

    if (/^(?:cushion|frame|product warranty|package contents|shipping|warranty|care)\b/i.test(line)) {
      break;
    }

    const dimensions = Array.from(line.matchAll(dimensionPattern));
    if (dimensions.length < 2) {
      if (/[A-Za-z]/.test(line) && !/gross\s*weight|net\s*weight|dimensions?/i.test(line)) {
        pendingLabel = line;
      }
      continue;
    }

    const firstDimensionIndex = dimensions[0].index || 0;
    const label = getLineLabelBeforeMatch(line, firstDimensionIndex) || pendingLabel;
    pendingLabel = '';

    const numericTail = line
      .slice((dimensions[1].index || 0) + dimensions[1][0].length)
      .match(/\d+(?:\.\d+)?/g) || [];
    const grossWeightKg = numericTail.length ? Number(numericTail[numericTail.length - 1]) : null;

    rows.push({
      label,
      packageDimensionsCm: dimensions[1].slice(1, 4).map(Number),
      grossWeightKg
    });
  }

  return rows;
}

function parseDimensionText(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:cm)?/i);
  return match ? match.slice(1, 4).map(Number) : null;
}

function parseSpecCellRows(specTableRows = []) {
  return specTableRows
    .map(cells => {
      const dimensions = cells
        .map((cell, index) => ({ index, dimensionsCm: parseDimensionText(cell) }))
        .filter(item => item.dimensionsCm);
      if (!dimensions.length) return null;

      const label = cells[0] || '';
      const packageDimensions = dimensions.length >= 2 ? dimensions[1] : dimensions[0];
      const grossWeightKg = cells
        .slice(packageDimensions.index + 1)
        .map(cell => String(cell || '').match(/^\s*(\d+(?:\.\d+)?)\s*(?:kg)?\s*$/i)?.[1])
        .filter(Boolean)
        .map(Number)
        .pop();

      return {
        label,
        packageDimensionsCm: packageDimensions.dimensionsCm,
        grossWeightKg: Number.isFinite(grossWeightKg) ? grossWeightKg : null
      };
    })
    .filter(row => row && row.label && row.packageDimensionsCm);
}

function parseSpecCellCartons(specTableRows, descriptionHtml) {
  const packageQuantities = parsePackageContents(descriptionHtml);
  const cartons = [];
  const seen = new Set();

  for (const row of parseSpecCellRows(specTableRows)) {
    addCarton(cartons, seen, row.packageDimensionsCm, row.label, getPackageQuantity(packageQuantities, row.label));
  }

  return cartons;
}

function parseSpecCellWeight(specTableRows, descriptionHtml) {
  const packageQuantities = parsePackageContents(descriptionHtml);
  const totalWeight = parseSpecCellRows(specTableRows).reduce((total, row) => {
    return total + ((Number(row.grossWeightKg) || 0) * getPackageQuantity(packageQuantities, row.label));
  }, 0);

  return totalWeight ? roundNumber(totalWeight, 2) : null;
}

function parseSpecificationTableCartons(descriptionHtml) {
  const packageQuantities = parsePackageContents(descriptionHtml);
  const cartons = [];
  const seen = new Set();

  for (const row of parseSpecificationTableRows(descriptionHtml)) {
    addCarton(cartons, seen, row.packageDimensionsCm, row.label, getPackageQuantity(packageQuantities, row.label));
  }

  return cartons;
}

function parseSpecificationTableWeight(descriptionHtml) {
  const packageQuantities = parsePackageContents(descriptionHtml);
  const totalWeight = parseSpecificationTableRows(descriptionHtml).reduce((total, row) => {
    return total + ((Number(row.grossWeightKg) || 0) * getPackageQuantity(packageQuantities, row.label));
  }, 0);

  return totalWeight ? roundNumber(totalWeight, 2) : null;
}

function parseListedWeightKg(descriptionHtml) {
  const lines = descriptionToLines(descriptionHtml);

  for (const line of lines) {
    const match = line.match(/^(?:product\s*)?weight\s*:?\s*(\d+(?:\.\d+)?)\s*kgs?\b/i);
    if (match) {
      return roundNumber(Number(match[1]), 2);
    }
  }

  return null;
}

function parseUnitsPerCarton(descriptionHtml) {
  const text = descriptionToText(descriptionHtml);
  const rangeMatch = text.match(/\(\s*\d+\s*[-–]\s*(\d+)\s*pcs?\s*\/\s*ctn\s*\)/i);
  if (rangeMatch) {
    return normaliseQuantity(rangeMatch[1]);
  }

  const singleMatch = text.match(/\(\s*(\d+)\s*pcs?\s*\/\s*ctn\s*\)/i);
  return singleMatch ? normaliseQuantity(singleMatch[1]) : 1;
}

async function getProductUrlBySKU(page, sku) {
  const searchUrl = `https://livingculture.co.nz/search?q=${encodeURIComponent(sku)}`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const results = await page.$$eval('.grid__item--content product-grid-item, .grid__item--content .grid-product', nodes =>
    nodes
      .filter(node => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length))
      .map(node => {
        const anchor = node.querySelector('a.grid-item__link[href*="/products/"], a[href*="/products/"]');
        return {
          href: anchor?.href || '',
          text: (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim()
        };
      })
      .filter(item => item.href)
  );

  if (!results.length) {
    throw new Error(`No product page found for SKU ${sku}`);
  }

  return results[0].href;
}

function normaliseProductImage(value) {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `https://livingculture.co.nz${value}`;
  return value.replace(/^http:\/\//, 'https://');
}

async function searchProducts(query) {
  const suggestUrl = new URL('https://livingculture.co.nz/search/suggest.json');
  suggestUrl.searchParams.set('q', query);
  suggestUrl.searchParams.set('resources[type]', 'product');
  suggestUrl.searchParams.set('resources[limit]', '8');

  const response = await fetch(suggestUrl);
  if (!response.ok) {
    throw new Error(`Living Culture search failed: ${response.status}`);
  }

  const data = await response.json();
  const products = data?.resources?.results?.products || [];
  const results = [];

  for (const product of products) {
    const handle = product.handle || String(product.url || '').match(/\/products\/([^?]+)/)?.[1];
    if (!handle) continue;

    const productResponse = await fetch(`https://livingculture.co.nz/products/${handle}.js`);
    if (!productResponse.ok) continue;

    const productData = await productResponse.json();
    const variants = productData.variants || [];
    for (const variant of variants) {
      if (!variant.sku) continue;

      const title = variant.public_title && variant.public_title !== 'Default Title'
        ? `${productData.title} - ${variant.public_title}`
        : productData.title;
      const image = variant.featured_image?.src || productData.featured_image || productData.images?.[0] || product.image || '';

      results.push({
        sku: variant.sku,
        title,
        image: normaliseProductImage(image),
        available: Boolean(variant.available)
      });
    }
  }

  const seen = new Set();
  return results
    .filter(item => {
      const key = item.sku.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

async function prepareCheckout(page, itemInput) {
  const items = normaliseItems(itemInput);
  if (!items.length) {
    throw new Error('At least one SKU is required');
  }

  const products = [];
  for (const item of items) {
    const product = { ...(await getProductDetails(page, item)) };
    product.quantity = item.quantity;
    products.push(product);
  }

  await openCheckoutForProducts(page, products);
  return products;
}

async function getProductMetrics(itemInput) {
  const items = normaliseItems(itemInput);
  if (!items.length) {
    throw new Error('At least one SKU is required');
  }

  const session = await createBrowserSession();
  try {
    const products = [];
    for (const item of items) {
      const product = { ...(await getProductDetails(session.page, item, { includeMetrics: true })) };
      product.quantity = item.quantity;
      products.push(product);
    }
    return products;
  } finally {
    await session.close().catch(() => {});
  }
}

async function getProductSummaries(itemInput) {
  const items = normaliseItems(itemInput);
  if (!items.length) {
    throw new Error('At least one SKU is required');
  }

  const session = await createBrowserSession();
  try {
    const products = [];
    for (const item of items) {
      const product = { ...(await getProductDetails(session.page, item, { includeMetrics: false })) };
      product.quantity = item.quantity;
      products.push(product);
    }
    return products;
  } finally {
    await session.close().catch(() => {});
  }
}

async function openCheckoutForProducts(page, products) {
  const cartItems = products.map(product => `${product.variantId}:${normaliseQuantity(product.quantity)}`).join(',');

  const checkoutUrl = `https://livingculture.co.nz/cart/${cartItems}`;

  await page.goto(checkoutUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  if (!/\/checkouts\//.test(page.url())) {
    await page.locator('#CartTerms:visible, input.cart__terms-checkbox:visible').first().check({ timeout: DEFAULT_WAIT }).catch(() => {});

    const checkoutButton = page
      .locator('button[name="checkout"]:visible, input[name="checkout"]:visible, a[href*="/checkout"]:visible, button:has-text("Checkout"):visible, input[value*="Checkout" i]:visible')
      .first();

    try {
      await Promise.all([
        page.waitForURL(/\/checkouts\//, { timeout: 60000 }).catch(() => {}),
        checkoutButton.click({ timeout: DEFAULT_WAIT })
      ]);
    } catch (error) {
      await page.goto('https://livingculture.co.nz/checkout?skip_shop_pay=true', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    }
  }

  await page.waitForURL(/\/checkouts\/.*\/information/, { timeout: 30000, waitUntil: 'domcontentloaded' }).catch(() => {});

  const addressSelector = ADDRESS_INPUT_SELECTORS.join(',');
  try {
    await page.waitForSelector(addressSelector, { timeout: 20000 });
  } catch (error) {
    await page.goto('https://livingculture.co.nz/checkout?skip_shop_pay=true', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    }).catch(() => {});
    await page.waitForSelector(addressSelector, { timeout: 20000 }).catch(async () => {
      const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      throw new Error(`Checkout address field was not available on ${page.url()}: ${bodyText.slice(0, 500)}`);
    });
  }
}

function normaliseSuggestion(text) {
  return text.replace(/\s+/g, ' ').trim();
}

async function readAddressFields(page) {
  return page.$$eval('input, select', nodes =>
    Array.from(nodes)
      .map(node => ({
        label: node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.name || node.id || '',
        value: node.value || ''
      }))
      .filter(field => field.value && /address|suburb|city|postcode|zip|postal|region/i.test(`${field.label} ${field.value}`))
  );
}

async function getSuggestionsForAddress(page, addressQuery) {
  const addressInput = page.locator(ADDRESS_INPUT_SELECTORS.join(',')).first();

  await addressInput.fill('');
  await addressInput.type(addressQuery, { delay: 35 });

  await page.waitForSelector(SUGGESTION_SELECTORS.join(','), { timeout: DEFAULT_WAIT });
  const suggestions = await page.$$eval(SUGGESTION_SELECTORS.join(','), nodes =>
    Array.from(new Set(Array.from(nodes).map(node => node.textContent || '').map(text => text.replace(/\s+/g, ' ').trim()).filter(Boolean)))
  );

  return suggestions.slice(0, 10);
}

async function selectAddressAndGetPrice(page, addressText) {
  let clickedSuggestion = await clickMatchingSuggestion(page, addressText);

  if (!clickedSuggestion) {
    const addressInput = page.locator(ADDRESS_INPUT_SELECTORS.join(',')).first();
    const addressQueries = Array.from(new Set([
      addressText,
      String(addressText).split(',')[0],
      String(addressText).replace(/,\s*New Zealand$/i, '')
    ].map(value => normaliseSuggestion(String(value || ''))).filter(Boolean)));

    for (const query of addressQueries) {
      await addressInput.fill('');
      await addressInput.type(query, { delay: 35 });

      await page.waitForSelector(SUGGESTION_SELECTORS.join(','), { timeout: DEFAULT_WAIT }).catch(() => {});
      clickedSuggestion = await clickMatchingSuggestion(page, addressText);
      if (clickedSuggestion) break;
    }
  }

  if (!clickedSuggestion) {
    throw new Error(`Could not select address suggestion for "${addressText}"`);
  }

  await page.waitForTimeout(1000);

  await fillCheckoutBasics(page);

  const continueButton = page
    .locator('button:has-text("Continue to shipping"), button:has-text("Continue"), button[type="submit"]:visible')
    .first();

  await Promise.all([
    page.waitForURL(/\/shipping/, { timeout: 45000, waitUntil: 'domcontentloaded' }).catch(() => {}),
    continueButton.click({ timeout: DEFAULT_WAIT })
  ]);

  await page.waitForURL(/\/shipping/, { timeout: 45000, waitUntil: 'domcontentloaded' }).catch(() => {});

  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return /Shipping method/i.test(text) && !/Getting available shipping rates/i.test(text) && (/Ship from[\s\S]*\$\d/.test(text) || /Shipping\s+\$\d/.test(text));
  }, { timeout: 60000 });

  const shipping = await readShippingPrice(page);
  const addressFields = await readAddressFields(page);
  return { price: shipping.price, method: shipping.method, selectedAddress: clickedSuggestion || addressText, addressFields };
}

async function clickMatchingSuggestion(page, addressText) {
  const suggestionHandles = await page.$$(SUGGESTION_SELECTORS.join(','));
  const wantedAddress = normaliseSuggestion(addressText).toLowerCase();
  const wantedStreet = normaliseSuggestion(String(addressText).split(',')[0] || '').toLowerCase();

  for (const handle of suggestionHandles) {
    const text = normaliseSuggestion((await handle.textContent()) || '');
    const normalisedText = text.toLowerCase();
    if (
      normalisedText.includes(wantedAddress) ||
      wantedAddress.includes(normalisedText) ||
      normalisedText === wantedAddress ||
      (wantedStreet && normalisedText.includes(wantedStreet))
    ) {
      await handle.click();
      return text;
    }
  }

  return null;
}

async function readShippingPrice(page) {
  const bodyText = await page.locator('body').innerText({ timeout: DEFAULT_WAIT });
  const lines = bodyText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    if (/^Ship\b|delivery|freight/i.test(lines[index])) {
      const price = lines.slice(index + 1, index + 4).find(line => /^\$\d/.test(line));
      if (price) {
        return { method: lines[index], price };
      }
    }
  }

  const shippingIndex = lines.findIndex(line => /^Shipping$/i.test(line));
  if (shippingIndex !== -1) {
    const price = lines.slice(shippingIndex + 1, shippingIndex + 5).find(line => /^\$\d/.test(line));
    if (price) {
      return { method: 'Shipping', price };
    }
  }

  throw new Error(`Could not find a shipping price on ${page.url()}: ${bodyText.slice(0, 600)}`);
}

async function fillCheckoutBasics(page) {
  const fields = [
    ['#email:visible, input[name="email"]:visible', 'freight-helper@example.com'],
    ['input[name="firstName"]:visible', 'Freight'],
    ['input[name="lastName"]:visible', 'Helper'],
    ['input[name="phone"]:visible', '0210000000']
  ];

  for (const [selector, value] of fields) {
    const field = page.locator(selector).first();
    if (await field.count()) {
      await field.fill(value).catch(() => {});
    }
  }
}

app.post('/api/suggestions', async (req, res) => {
  const { productUrl, sku, skus, items, address } = req.body;
  if (!normaliseItems({ productUrl, sku, skus, items }).length || !address) {
    return res.status(400).json({ error: 'At least one SKU and address are required' });
  }

  try {
    const checkout = await getCheckoutSession({ productUrl, sku, skus, items });
    const { page, products } = checkout;
    const suggestions = await getSuggestionsForAddress(page, address);
    checkout.lastUsed = Date.now();
    scheduleCheckoutCleanup();
    return res.json({ suggestions, products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/prepare', async (req, res) => {
  const { productUrl, sku, skus, items } = req.body;
  if (!normaliseItems({ productUrl, sku, skus, items }).length) {
    return res.status(400).json({ error: 'At least one SKU is required' });
  }

  try {
    const products = await getProductSummaries({ productUrl, sku, skus, items });
    return res.json({ products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/product-search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.json({ products: [] });
  }

  try {
    const products = await searchProducts(query);
    return res.json({ products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/price', async (req, res) => {
  const { productUrl, sku, skus, items, selectedAddress } = req.body;
  if (!normaliseItems({ productUrl, sku, skus, items }).length || !selectedAddress) {
    return res.status(400).json({ error: 'At least one SKU and selectedAddress are required' });
  }

  try {
    const checkout = await getCheckoutSession({ productUrl, sku, skus, items });
    const { page } = checkout;
    const result = await selectAddressAndGetPrice(page, selectedAddress);
    checkout.lastUsed = Date.now();
    scheduleCheckoutCleanup();
    return res.json({
      ...result,
      products: checkout.products,
      freightBreakdown: buildFreightBreakdown(checkout.products, result.price)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-metrics', async (req, res) => {
  const { productUrl, sku, skus, items, price, itemShipping } = req.body;
  if (!normaliseItems({ productUrl, sku, skus, items }).length) {
    return res.status(400).json({ error: 'At least one SKU is required' });
  }

  try {
    const products = await getProductMetrics({ productUrl, sku, skus, items });
    return res.json({
      products,
      freightBreakdown: price ? buildFreightBreakdown(products, price, itemShipping || []) : null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/item-shipping', async (req, res) => {
  const { productUrl, sku, skus, items, selectedAddress } = req.body;
  if (!normaliseItems({ productUrl, sku, skus, items }).length || !selectedAddress) {
    return res.status(400).json({ error: 'At least one SKU and selectedAddress are required' });
  }

  try {
    const checkout = await getCheckoutSession({ productUrl, sku, skus, items });
    const itemShipping = await getSingleProductShippingSummaries(checkout.products, selectedAddress);
    checkout.lastUsed = Date.now();
    scheduleCheckoutCleanup();
    return res.json({
      products: checkout.products,
      itemShipping
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

function startServer(port = Number(process.env.PORT || 3001), host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`Local freight helper running at http://${host}:${port}`);
      resolve({ server, port, host });
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  startServer,
  closeActiveCheckout
};
