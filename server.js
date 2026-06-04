const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright-core');

const app = express();
app.use((req, res, next) => {
  const origin = String(req.headers.origin || '');
  if (isAllowedBrowserOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    if (origin && !isAllowedBrowserOrigin(origin)) {
      return res.sendStatus(403);
    }
    return res.sendStatus(204);
  }
  return next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const DEFAULT_WAIT = 10000;
const ADDRESS_PREDICTION_WAIT_MS = 6000;
const HEADLESS = process.env.HEADLESS !== 'false';
const CHECKOUT_IDLE_MS = 5 * 60 * 1000;
const AUTOMATION_TIMEOUT_MS = process.env.VERCEL ? 270000 : 120000;
const CIN7_CORE_BASE_URL = process.env.CIN7_CORE_API_BASE_URL || 'https://inventory.dearsystems.com/ExternalApi/v2';
const CIN7_CORE_ACCOUNT_ID = process.env.CIN7_CORE_ACCOUNT_ID;
const CIN7_CORE_APPLICATION_KEY = process.env.CIN7_CORE_APPLICATION_KEY;
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media']);
const BLOCKED_AUTOMATION_URLS = [
  /cdn\.shopify\.com\/extensions\//i,
  /popup\.1clicklabs\.io/i,
  /placement-api\.afterpay\.com/i,
  /static\.hsappstatic\.net/i,
  /googletagmanager\.com/i,
  /google-analytics\.com/i
];
const AUTOMATION_TEMP_PREFIXES = [
  'playwright_chromiumdev_profile-'
];
const PARTIAL_ADDRESS_SUFFIXES = [
  'Road',
  'Street',
  'Avenue',
  'Drive',
  'Place',
  'Crescent',
  'Lane',
  'Parade'
];
const productCache = new Map();
const productSummaryCache = new Map();
const skuUrlCache = new Map();
const addressSuggestionCache = new Map();
const freightQuoteCache = new Map();
const FREIGHT_QUOTE_CACHE_MS = 10 * 60 * 1000;
const cin7AvailabilityCache = new Map();
const CIN7_AVAILABILITY_CACHE_MS = 2 * 60 * 1000;
let activeCheckout = null;
let sharedBrowser = null;
let sharedBrowserPromise = null;
let sharedContext = null;
let sharedPage = null;
let automationQueue = Promise.resolve();
const ADDRESS_INPUT_SELECTORS = [
  '#shipping-address1:visible',
  'input[name="address1"]:visible',
  'input[autocomplete="shipping address-line1"]:visible',
  'input[autocomplete="address-line1"]:visible',
  'input[data-address-field="address1"]:visible',
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

function isAllowedBrowserOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    return [
      /(^|\.)cin7\.com$/i,
      /(^|\.)cin7\.co$/i,
      /(^|\.)cin7core\.com$/i,
      /(^|\.)dearsystems\.com$/i
    ].some(pattern => pattern.test(url.hostname));
  } catch (error) {
    return false;
  }
}

function isCin7Configured() {
  return Boolean(CIN7_CORE_ACCOUNT_ID && CIN7_CORE_APPLICATION_KEY);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getCachedCin7Availability(sku) {
  const cached = cin7AvailabilityCache.get(sku);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CIN7_AVAILABILITY_CACHE_MS) {
    cin7AvailabilityCache.delete(sku);
    return null;
  }
  return cached.payload;
}

async function getCin7ProductAvailability(sku) {
  const normalisedSku = String(sku || '').trim().toUpperCase();
  if (!normalisedSku) {
    return { connected: isCin7Configured(), locations: [] };
  }
  if (!isCin7Configured()) {
    return { connected: false, locations: [] };
  }

  const cached = getCachedCin7Availability(normalisedSku);
  if (cached) return cached;

  const url = new URL(`${CIN7_CORE_BASE_URL.replace(/\/$/, '')}/ProductAvailability`);
  url.searchParams.set('sku', normalisedSku);
  url.searchParams.set('limit', '1000');
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'api-auth-accountid': CIN7_CORE_ACCOUNT_ID,
        'api-auth-applicationkey': CIN7_CORE_APPLICATION_KEY
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Cin7 request timed out after 15s.');
    }
    throw new Error(`Cin7 request failed before response: ${error.message}`);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Cin7 credentials were rejected (${response.status}).`);
    }
    const message = await response.text().catch(() => '') || '';
    throw new Error(`Cin7 stock request failed (${response.status}): ${message.slice(0, 120)}`);
  }

  const raw = await response.text().catch(() => '');
  const statusInfo = `${response.status} ${response.statusText}`.trim();
  const contentType = response.headers.get('content-type') || 'unknown';

  let body;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    const snippet = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (snippet) {
      throw new Error(`Cin7 returned non-JSON (${statusInfo}, content-type: ${contentType}): ${snippet}`);
    }
    throw new Error(`Cin7 returned non-JSON (${statusInfo}, content-type: ${contentType}) with an empty body.`);
  }
  const records = Array.isArray(body)
    ? body
    : body.ProductAvailabilityList || body.ProductAvailability || body.productAvailability || body.Availability || [];
  const locationTotals = new Map();

  records
    .filter(record => String(record.SKU || record.Sku || '').trim().toUpperCase() === normalisedSku)
    .forEach(record => {
      const location = String(record.Location || 'Unspecified location').trim() || 'Unspecified location';
      const total = locationTotals.get(location) || {
        location,
        available: 0,
        onHand: 0,
        allocated: 0,
        onOrder: 0
      };
      total.available += numberValue(record.Available);
      total.onHand += numberValue(record.OnHand);
      total.allocated += numberValue(record.Allocated);
      total.onOrder += numberValue(record.OnOrder);
      locationTotals.set(location, total);
    });

  const payload = {
    connected: true,
    locations: Array.from(locationTotals.values()).sort((left, right) =>
      right.available - left.available || left.location.localeCompare(right.location)
    )
  };
  cin7AvailabilityCache.set(normalisedSku, { cachedAt: Date.now(), payload });
  return payload;
}

async function findElement(page, selectors) {
  for (const selector of selectors) {
    const handle = await page.$(selector);
    if (handle) return handle;
  }
  throw new Error(`None of these selectors were found: ${selectors.join(', ')}`);
}

function handleAutomationRoute(route) {
  const request = route.request();
  if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())
    || BLOCKED_AUTOMATION_URLS.some(pattern => pattern.test(request.url()))) {
    return route.abort().catch(() => {});
  }
  return route.continue().catch(() => {});
}

async function createBrowserSession() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const browser = await getSharedBrowser();
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.route('**/*', handleAutomationRoute);
      const page = await context.newPage();
      return {
        page,
        close: () => context.close().catch(() => {})
      };
    } catch (error) {
      if (!isClosedBrowserError(error) || attempt > 0) throw error;
      console.error('New automation session lost browser; retrying with a new browser.');
      await invalidateSharedAutomation();
    }
  }
  throw new Error('Could not create a browser session');
}

function isClosedBrowserError(error) {
  return /target page, context or browser has been closed|browsercontext\.newpage|browser has been closed|browser closed|browser disconnected/i
    .test(String(error?.message || error || ''));
}

function isTransientNavigationError(error) {
  return /execution context was destroyed|most likely because of a navigation|cannot find context with specified id|frame was detached|element is not attached/i
    .test(String(error?.message || error || ''));
}

function isRetryableCheckoutError(error) {
  return isClosedBrowserError(error) ||
    isTransientNavigationError(error) ||
    /ERR_INSUFFICIENT_RESOURCES|Checkout address field was not available|element is not enabled/i
      .test(String(error?.message || error || ''));
}

function clearCheckoutReference() {
  if (!activeCheckout) return;
  clearTimeout(activeCheckout.cleanupTimer);
  activeCheckout = null;
}

async function invalidateSharedAutomation() {
  clearCheckoutReference();
  const page = sharedPage;
  const context = sharedContext;
  const browser = sharedBrowser;
  sharedPage = null;
  sharedContext = null;
  sharedBrowser = null;
  sharedBrowserPromise = null;

  if (page && !page.isClosed()) {
    await page.close().catch(() => {});
  }
  if (context) {
    await context.close().catch(() => {});
  }
  if (browser) {
    await browser.close().catch(() => {});
  }
}

async function getSharedBrowser() {
  if (sharedBrowser) return sharedBrowser;
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = cleanupServerlessBrowserProfiles()
      .then(() => getBrowserLaunchOptions())
      .then(options => chromium.launch(options))
      .then(browser => {
        sharedBrowser = browser;
        browser.on('disconnected', () => {
          if (sharedBrowser !== browser) return;
          clearCheckoutReference();
          sharedPage = null;
          sharedContext = null;
          sharedBrowser = null;
        });
        return browser;
      })
      .finally(() => {
        sharedBrowserPromise = null;
      });
  }
  return sharedBrowserPromise;
}

async function cleanupServerlessBrowserProfiles() {
  if (!process.env.VERCEL) return;

  const tempDirectory = os.tmpdir();
  const entries = await fs.readdir(tempDirectory, { withFileTypes: true }).catch(() => []);
  const staleProfiles = entries
    .filter(entry => entry.isDirectory() && AUTOMATION_TEMP_PREFIXES.some(prefix => entry.name.startsWith(prefix)))
    .map(entry => path.join(tempDirectory, entry.name));

  if (!staleProfiles.length) return;

  await Promise.all(staleProfiles.map(directory => fs.rm(directory, { recursive: true, force: true }).catch(() => {})));
  console.log(`[automation] removed ${staleProfiles.length} stale Chromium profile director${staleProfiles.length === 1 ? 'y' : 'ies'}`);
}

async function getBrowserLaunchOptions() {
  if (!process.env.VERCEL) {
    return { headless: HEADLESS };
  }

  const serverlessChromium = require('@sparticuz/chromium');
  return {
    args: [
      ...serverlessChromium.args.filter(argument => !argument.startsWith('--disk-cache-size=')),
      '--disk-cache-size=0',
      '--media-cache-size=0',
      '--disable-gpu-shader-disk-cache'
    ],
    executablePath: await serverlessChromium.executablePath(),
    headless: true
  };
}

async function getSharedContext() {
  if (sharedContext) return sharedContext;

  const browser = await getSharedBrowser();

  sharedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await sharedContext.route('**/*', handleAutomationRoute);
  return sharedContext;
}

async function getSharedPage() {
  const context = await getSharedContext();
  if (sharedPage && !sharedPage.isClosed()) return sharedPage;
  try {
    sharedPage = await context.newPage();
    return sharedPage;
  } catch (error) {
    if (!isClosedBrowserError(error)) throw error;
    await invalidateSharedAutomation();
    const retryContext = await getSharedContext();
    sharedPage = await retryContext.newPage();
    return sharedPage;
  }
}

async function resetSharedPage() {
  activeCheckout = null;
  if (sharedPage && !sharedPage.isClosed()) {
    await sharedPage.close().catch(() => {});
  }
  sharedPage = null;
}

function withAutomationPage(label, work, timeoutMs = AUTOMATION_TIMEOUT_MS) {
  const previous = automationQueue.catch(() => {});
  const task = previous.then(async () => {
    try {
      if (process.env.VERCEL) {
        await invalidateSharedAutomation();
        await cleanupServerlessBrowserProfiles();
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const page = await getSharedPage();
        let timeoutId;
        const timeout = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        try {
          return await Promise.race([work(page), timeout]);
        } catch (error) {
          if (isClosedBrowserError(error) && attempt === 0) {
            console.error(`${label} lost browser session; retrying with a new browser.`);
            await invalidateSharedAutomation();
            continue;
          }
          if (/timed out/i.test(error.message)) {
            await resetSharedPage();
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      throw new Error(`${label} could not restore its browser session`);
    } finally {
      if (process.env.VERCEL) {
        await invalidateSharedAutomation();
        await cleanupServerlessBrowserProfiles();
      }
    }
  });
  automationQueue = task.catch(() => {});
  return task;
}

function createTiming(label) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  return {
    async step(name, fn) {
      const stepStartedAt = Date.now();
      try {
        return await fn();
      } finally {
        const now = Date.now();
        console.log(`[timing:${label}] ${name}: ${now - stepStartedAt}ms (+${now - lastAt}ms, total ${now - startedAt}ms)`);
        lastAt = now;
      }
    },
    mark(name) {
      const now = Date.now();
      console.log(`[timing:${label}] ${name}: +${now - lastAt}ms, total ${now - startedAt}ms`);
      lastAt = now;
    }
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

function makeAddressSuggestionKey({ productUrl, sku, skus, items, address }) {
  return `${makeProductKey({ productUrl, sku, skus, items })}|address:${normaliseSuggestion(String(address || '')).toLowerCase()}`;
}

function makeFreightQuoteKey(route, itemInput, address) {
  return `${route}|${makeProductKey(itemInput)}|address:${normaliseSuggestion(String(address || '')).toLowerCase()}`;
}

function getCachedFreightQuote(key) {
  const cached = freightQuoteCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > FREIGHT_QUOTE_CACHE_MS) {
    freightQuoteCache.delete(key);
    return null;
  }
  return cached.payload;
}

function cacheFreightQuote(key, payload) {
  freightQuoteCache.set(key, { createdAt: Date.now(), payload });
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
}

async function getCheckoutSession({ productUrl, sku, skus, items }, page, timing = createTiming('checkout')) {
  const key = makeProductKey({ productUrl, sku, skus, items });

  if (activeCheckout?.key === key) {
    activeCheckout.lastUsed = Date.now();
    scheduleCheckoutCleanup();

    if (!/\/checkouts\/.*\/information/.test(activeCheckout.page.url())) {
      activeCheckout.products = await prepareCheckout(activeCheckout.page, { productUrl, sku, skus, items }, timing);
    }

    return activeCheckout;
  }

  await closeActiveCheckout();
  const checkoutPage = page || await getSharedPage();
  const products = await prepareCheckout(checkoutPage, { productUrl, sku, skus, items }, timing);
  activeCheckout = {
    key,
    page: checkoutPage,
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
    saleState: details.saleState || (details.available ? 'Add to cart' : 'Unavailable'),
    priceCents: Number(details.priceCents || 0),
    unitPrice: details.priceCents ? formatMoneyFromCents(Number(details.priceCents || 0)) : '',
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

async function getProductDetails(page, { productUrl, sku }, { includeMetrics = false, forcePage = false } = {}) {
  const cacheKey = makeProductKey({ productUrl, sku });
  const cache = includeMetrics ? productCache : productSummaryCache;
  if (!forcePage && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (!forcePage && includeMetrics && productCache.has(cacheKey)) {
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
      timeout: 1500
    }).catch(() => {});
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('table')).some(table => {
        const text = table.innerText || '';
        return /package\s*dimensions/i.test(text) && /gross\s*weight/i.test(text);
      });
    }, { timeout: 1000 }).catch(() => {});
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
    const isVisible = element => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    };
    const actionText = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
      .filter(isVisible)
      .map(element => (element.innerText || element.value || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' | ');
    const saleState = /pre[\s-]?sale|pre[\s-]?order/i.test(actionText)
      ? 'Pre sale'
      : /add\s+to\s+cart/i.test(actionText)
        ? 'Add to cart'
        : variant?.available
          ? 'Available'
          : 'Unavailable';

    return {
      title: product?.title || document.querySelector('meta[property="og:title"]')?.content || document.querySelector('h1')?.textContent?.trim() || document.title,
      image: normaliseUrl(image),
      variantId: variant?.id ? String(variant.id) : '',
      sku: variant?.sku || '',
      variantTitle: variant?.public_title || variant?.title || '',
      available: Boolean(variant?.available),
      saleState,
      priceCents: Number(variant?.price || 0),
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

function parseMoneyTextToCents(value) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/\$?\s*(\d+(?:\.\d{1,2})?)/);

  return match ? Math.round(Number(match[1]) * 100) : 0;
}

function formatMoneyFromCents(cents) {
  const number = Number(cents) || 0;

  return `$${(number / 100).toLocaleString('en-NZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function enrichCartItemsWithProducts(cartItems = [], products = []) {
  return products.map((product, index) => {
    const cartItem = cartItems[index] || {};
    const quantity = normaliseQuantity(cartItem.quantity || product.quantity || 1);

    const productUnitCents = Number(product.priceCents || 0);
    const productLineCents = productUnitCents * quantity;

    const cartLineTotalCents = parseMoneyTextToCents(cartItem.lineTotal);
    const lineTotalCents = cartLineTotalCents || productLineCents;

    const unitPriceCents = cartItem.unitPrice
      ? parseMoneyTextToCents(cartItem.unitPrice)
      : productUnitCents || (lineTotalCents && quantity ? Math.round(lineTotalCents / quantity) : 0);

    return {
      sku: product.sku || cartItem.sku || '',
      title: product.title || cartItem.title || '',
      quantity,
      unitPrice: unitPriceCents ? formatMoneyFromCents(unitPriceCents) : '',
      lineTotal: lineTotalCents ? formatMoneyFromCents(lineTotalCents) : '',
      productUrl: product.url || product.productUrl || cartItem.productUrl || '',
      image: product.image || cartItem.image || ''
    };
  });
}

function calculateFinalCartPrice(cartItems = [], freightPrice = '') {
  const itemsTotalCents = cartItems.reduce((total, item) => {
    return total + parseMoneyTextToCents(item.lineTotal);
  }, 0);

  const freightCents = parseMoneyTextToCents(freightPrice);
  const finalCents = itemsTotalCents + freightCents;

  return finalCents ? formatMoneyFromCents(finalCents) : '';
}

async function readCheckoutCartSummary(page) {
  return page.evaluate(() => {
    const clean = value => String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();

    const findMoney = value => {
      const match = clean(value).match(/\$\s?\d[\d,]*(?:\.\d{2})?/);
      return match ? match[0].replace(/\s+/g, '') : '';
    };

    const getText = selector => {
      const element = document.querySelector(selector);
      return element ? clean(element.innerText || element.textContent || '') : '';
    };

    const totalSelectors = [
      '.payment-due__price',
      '[data-checkout-payment-due-target]',
      '[data-checkout-payment-due]',
      '.total-line--total .total-line__price',
      '.total-line__price.payment-due',
      '[class*="payment-due"]',
      '[class*="total"] [class*="price"]'
    ];

    let finalCartPrice = '';

    for (const selector of totalSelectors) {
      const text = getText(selector);
      const money = findMoney(text);

      if (money) {
        finalCartPrice = money;
        break;
      }
    }

    if (!finalCartPrice) {
      const lines = clean(document.body.innerText || '')
        .split('\n')
        .map(clean)
        .filter(Boolean);

      const totalLine = [...lines].reverse().find(line => /total/i.test(line) && /\$\s?\d/.test(line));
      finalCartPrice = findMoney(totalLine || '');
    }

    const rowSelectors = [
      '[data-order-summary-section="line-items"] tr.product',
      '.product-table tr.product',
      'tr.product',
      '[data-product-id]',
      '.product'
    ];

    let rows = [];

    for (const selector of rowSelectors) {
      rows = Array.from(document.querySelectorAll(selector))
        .filter(row => {
          const text = clean(row.innerText || row.textContent || '');
          return text && /\$\s?\d/.test(text);
        });

      if (rows.length) break;
    }

    const cartItems = rows.map(row => {
      const title =
        clean(row.querySelector('.product__description__name')?.innerText) ||
        clean(row.querySelector('[class*="description__name"]')?.innerText) ||
        clean(row.querySelector('[class*="product-title"]')?.innerText) ||
        clean(row.querySelector('[class*="name"]')?.innerText) ||
        '';

      const variant =
        clean(row.querySelector('.product__description__variant')?.innerText) ||
        clean(row.querySelector('[class*="variant"]')?.innerText) ||
        '';

      const quantityText =
        clean(row.querySelector('.product-thumbnail__quantity')?.innerText) ||
        clean(row.querySelector('[class*="quantity"]')?.innerText) ||
        '';

      const quantityMatch = quantityText.match(/\d+/);
      const quantity = quantityMatch ? Number(quantityMatch[0]) : 1;

      const priceText =
        clean(row.querySelector('.product__price .order-summary__emphasis')?.innerText) ||
        clean(row.querySelector('.product__price')?.innerText) ||
        clean(row.querySelector('[class*="price"]')?.innerText) ||
        clean(row.innerText || row.textContent || '');

      const lineTotal = findMoney(priceText);

      return {
        title: variant && title && !title.includes(variant) ? `${title} - ${variant}` : title,
        quantity,
        lineTotal
      };
    }).filter(item => item.title || item.lineTotal);

    return {
      finalCartPrice,
      cartItems
    };
  });
}

function buildFreightBreakdown(products, priceText, itemShipping = []) {
  const totalCents = parseMoneyToCents(priceText);
  const basis = products.some(product => Number(product.cbm) > 0) ? 'CBM' : 'weight';
  const basisValues = products.map(product => {
    const quantity = product.requestedQuantity != null
      ? Math.max(0, Number(product.quantity) || 0)
      : normaliseQuantity(product.quantity);
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
        quantity: product.requestedQuantity != null
          ? Math.max(0, Number(product.quantity) || 0)
          : normaliseQuantity(product.quantity),
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
      quantity: product.requestedQuantity != null
        ? Math.max(0, Number(product.quantity) || 0)
        : normaliseQuantity(product.quantity),
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

function getLineWeight(product, quantity = normaliseQuantity(product.quantity)) {
  const weightKg = Number(product.weightKg) || 0;
  const unitsPerCarton = normaliseQuantity(product.unitsPerCarton);
  if (!weightKg || unitsPerCarton <= 1) return weightKg * quantity;
  return weightKg * Math.ceil(quantity / unitsPerCarton);
}

function getFreightBasisValue(product, quantity, basis) {
  return basis === 'CBM'
    ? getLineCbm(product, quantity)
    : getLineWeight(product, quantity);
}

function buildPreSaleFreightEstimate(products = [], priceText = '') {
  const totalCents = parseMoneyToCents(priceText);
  const basis = products.some(product => Number(product.cbm) > 0) ? 'CBM' : 'weight';
  const rows = products.map(product => {
    const requestedQuantity = normaliseQuantity(product.requestedQuantity || product.quantity);
    const availableQuantity = Math.max(0, Number(product.quantity) || 0);
    const preSaleQuantity = Math.max(0, requestedQuantity - availableQuantity);
    const shipNowBasis = getFreightBasisValue(product, availableQuantity, basis);
    const preSaleBasis = getFreightBasisValue(product, preSaleQuantity, basis);

    return {
      sku: product.sku,
      title: product.title,
      requestedQuantity,
      availableQuantity,
      preSaleQuantity,
      shipNowBasis,
      preSaleBasis
    };
  }).filter(row => row.preSaleQuantity > 0);

  if (!rows.length) return null;

  const shipNowBasisTotal = products.reduce((total, product) =>
    total + getFreightBasisValue(product, Math.max(0, Number(product.quantity) || 0), basis), 0);
  const preSaleBasisTotal = rows.reduce((total, row) => total + row.preSaleBasis, 0);

  if (!totalCents || !shipNowBasisTotal || !preSaleBasisTotal) {
    return {
      basis,
      price: null,
      total: null,
      note: 'Pre-sale freight could not be estimated from available freight.',
      items: rows
    };
  }

  let allocatedCents = 0;
  const items = rows.map((row, index) => {
    const cents = index === rows.length - 1
      ? Math.round((preSaleBasisTotal / shipNowBasisTotal) * totalCents) - allocatedCents
      : Math.round((row.preSaleBasis / shipNowBasisTotal) * totalCents);
    allocatedCents += cents;

    return {
      ...row,
      price: formatMoney(cents)
    };
  });
  const estimateCents = items.reduce((total, item) => total + parseMoneyToCents(item.price), 0);

  return {
    basis,
    price: formatMoney(estimateCents),
    priceNumber: estimateCents / 100,
    total: formatMoney(totalCents + estimateCents),
    note: 'Estimated from the current freight rate and pre-sale weight/CBM.',
    items
  };
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
  const labelledGrossWeightsOnly = [];
  const weightPattern = /(\d+(?:\.\d+)?)\s*kgs?\b/gi;
  const stopPattern = /^(?:product dimensions?|package\s*(?:contents|dimensions?|size)|packaging\s*dimensions?|packing\s*size|carton\s*dimensions?|specifications?|features?|good to know|care|assembly|materials?|colour|warranty)\b/i;
  let inWeightSection = false;

  for (const line of lines) {
    if (/gross\s*weight/i.test(line)) {
      inWeightSection = true;
    } else if (inWeightSection && stopPattern.test(line)) {
      inWeightSection = false;
    }

    if (!inWeightSection) continue;
    if (/net\s*weight/i.test(line) && !/gross\s*weight/i.test(line)) continue;

    const labelledGrossWeights = Array.from(line.matchAll(/gross\s*weight\s*:?\s*(\d+(?:\.\d+)?)\s*kgs?\b/gi));
    if (labelledGrossWeights.length) {
      for (const match of labelledGrossWeights) {
        const label = getLineLabelBeforeMatch(line, match.index);
        labelledGrossWeightsOnly.push(Number(match[1]) * getPackageQuantity(packageQuantities, label));
      }
      continue;
    }

    const grossIndex = line.search(/gross\s*weight/i);
    const weightSource = grossIndex >= 0 ? line.slice(grossIndex) : line;

    for (const match of weightSource.matchAll(weightPattern)) {
      const label = getLineLabelBeforeMatch(line, grossIndex >= 0 ? grossIndex + match.index : match.index);
      weights.push(Number(match[1]) * getPackageQuantity(packageQuantities, label));
    }
  }

  if (labelledGrossWeightsOnly.length) {
    const totalWeight = labelledGrossWeightsOnly.reduce((total, weight) => total + weight, 0);
    return totalWeight ? roundNumber(totalWeight, 2) : null;
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
  const cacheKey = String(sku || '').trim().toLowerCase();
  if (skuUrlCache.has(cacheKey)) {
    return skuUrlCache.get(cacheKey);
  }

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

  skuUrlCache.set(cacheKey, results[0].href);
  return results[0].href;
}

function normaliseProductImage(value) {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `https://livingculture.co.nz${value}`;
  return value.replace(/^http:\/\//, 'https://');
}

function normaliseStorefrontUrl(value) {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `https://livingculture.co.nz${value}`;
  return value.replace(/^http:\/\//, 'https://');
}

function getProductHandleFromUrl(productUrl) {
  try {
    return new URL(normaliseStorefrontUrl(productUrl)).pathname.match(/\/products\/([^/?#]+)/)?.[1] || '';
  } catch (error) {
    return '';
  }
}

async function fetchProductJsonByHandle(handle) {
  if (!handle) return null;
  const response = await fetch(`https://livingculture.co.nz/products/${encodeURIComponent(handle)}.js`);
  if (!response.ok) return null;
  return response.json();
}

function buildProductFromStorefrontData(productData, resolvedUrl, requestedSku = '', includeMetrics = false) {
  const requestedSkuLower = requestedSku ? requestedSku.toLowerCase() : '';
  const variantIdFromUrl = getVariantIdFromUrl(resolvedUrl);
  const variant =
    productData?.variants?.find(item => requestedSkuLower && String(item.sku || '').toLowerCase() === requestedSkuLower) ||
    productData?.variants?.find(item => variantIdFromUrl && String(item.id) === variantIdFromUrl) ||
    productData?.variants?.[0];

  if (!variant) {
    throw new Error('Could not find a variant ID for this product');
  }

  if (requestedSku && String(variant.sku || '').toLowerCase() !== requestedSkuLower) {
    throw new Error(`Search result did not contain exact SKU ${requestedSku}`);
  }

  const image = normaliseProductImage(variant.featured_image?.src || productData.featured_image || productData.images?.[0] || '');
  const details = {
    title: productData.title,
    image,
    variantId: variant.id ? String(variant.id) : '',
    sku: variant.sku || '',
    variantTitle: variant.public_title || variant.title || '',
    available: Boolean(variant.available),
    saleState: variant.available ? 'Add to cart' : 'Unavailable',
    priceCents: Number(variant.price || 0),
    weightGrams: Number(variant.weight || 0),
    descriptionHtml: includeMetrics ? productData.description || '' : '',
    pageText: '',
    specTableRows: includeMetrics ? parseTableRows(productData.description || '') : [],
    specTableText: ''
  };

  return buildProductFromDetails(details, resolvedUrl, includeMetrics);
}

async function getFastProductUrlBySKU(sku) {
  const cacheKey = String(sku || '').trim().toLowerCase();
  if (skuUrlCache.has(cacheKey)) {
    return skuUrlCache.get(cacheKey);
  }

  const suggestUrl = new URL('https://livingculture.co.nz/search/suggest.json');
  suggestUrl.searchParams.set('q', sku);
  suggestUrl.searchParams.set('resources[type]', 'product');
  suggestUrl.searchParams.set('resources[limit]', '8');
  suggestUrl.searchParams.set('resources[options][fields]', 'title,variants.sku');

  const response = await fetch(suggestUrl);
  if (!response.ok) {
    throw new Error(`Living Culture search failed: ${response.status}`);
  }

  const data = await response.json();
  const products = data?.resources?.results?.products || [];

  for (const product of products) {
    const handle = product.handle || String(product.url || '').match(/\/products\/([^?]+)/)?.[1];
    const productData = await fetchProductJsonByHandle(handle);
    const variant = productData?.variants?.find(item => String(item.sku || '').toLowerCase() === cacheKey);
    if (!variant) continue;

    const url = `https://livingculture.co.nz/products/${handle}${variant.id ? `?variant=${variant.id}` : ''}`;
    skuUrlCache.set(cacheKey, url);
    return url;
  }

  throw new Error(`No product page found for SKU ${sku}`);
}

async function getProductDetailsFast({ productUrl, sku }, { includeMetrics = false } = {}) {
  const cacheKey = makeProductKey({ productUrl, sku });
  const cache = includeMetrics ? productCache : productSummaryCache;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const resolvedUrl = productUrl ? normaliseStorefrontUrl(productUrl) : await getFastProductUrlBySKU(sku);
  const handle = getProductHandleFromUrl(resolvedUrl);
  const productData = await fetchProductJsonByHandle(handle);
  if (!productData) {
    throw new Error(`No product data found for ${sku || productUrl}`);
  }

  const product = buildProductFromStorefrontData(productData, resolvedUrl, sku, includeMetrics);
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

async function searchProducts(query) {
  const suggestUrl = new URL('https://livingculture.co.nz/search/suggest.json');
  suggestUrl.searchParams.set('q', query);
  suggestUrl.searchParams.set('resources[type]', 'product');
  suggestUrl.searchParams.set('resources[limit]', '8');
  suggestUrl.searchParams.set('resources[options][fields]', 'title,variants.sku');

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

async function prepareCheckout(page, itemInput, timing = createTiming('checkout')) {
  const items = normaliseItems(itemInput);
  if (!items.length) {
    throw new Error('At least one SKU is required');
  }

  const products = [];
  await timing.step('resolve SKU', async () => {
    const fastProducts = await Promise.all(items.map(async item => {
      try {
        return { product: await getProductDetailsFast(item) };
      } catch (error) {
        return { error };
      }
    }));

    for (const [index, item] of items.entries()) {
      let product = fastProducts[index].product ? { ...fastProducts[index].product } : null;
      if (!product) {
        console.error(`Fast checkout lookup failed for ${item.sku || item.productUrl}:`, fastProducts[index].error.message);
        product = { ...(await getProductDetails(page, item)) };
      }
      product.quantity = item.quantity;
      products.push(product);
    }
  });

  await openCheckoutForProducts(page, products, timing);
  return products;
}

async function getProductMetrics(itemInput) {
  const items = normaliseItems(itemInput);
  if (!items.length) {
    throw new Error('At least one SKU is required');
  }

  return Promise.all(items.map(async item => {
    try {
      const product = { ...(await getProductDetailsFast(item, { includeMetrics: true })) };
      product.quantity = item.quantity;
      return product;
    } catch (error) {
      console.error(`Fast product metrics failed for ${item.sku || item.productUrl}:`, error.message);
      return {
        sku: item.sku || '',
        productUrl: item.productUrl || '',
        title: item.sku || item.productUrl || 'Product',
        quantity: item.quantity,
        weightKg: 0,
        cbm: 0,
        cartons: [],
        metricsLoaded: false,
        error: error.message
      };
    }
  }));
}

async function getProductSummaries(itemInput) {
  const items = normaliseItems(itemInput);
  if (!items.length) {
    throw new Error('At least one SKU is required');
  }

  const fastProducts = await Promise.all(items.map(async item => {
    const product = { ...(await getProductDetailsFast(item)) };
    product.quantity = item.quantity;
    return product;
  }).map(promise => promise.catch(error => ({ error }))));

  if (fastProducts.every(product => !product.error)) {
    return fastProducts;
  }

  const session = await createBrowserSession();
  try {
    const products = [];
    for (const [index, item] of items.entries()) {
      if (!fastProducts[index]?.error) {
        products.push(fastProducts[index]);
        continue;
      }

      console.error(`Fast product summary failed for ${item.sku || item.productUrl}:`, fastProducts[index].error.message);
      const product = { ...(await getProductDetails(session.page, item)) };
      product.quantity = item.quantity;
      products.push(product);
    }
    return products;
  } finally {
    await session.close().catch(() => {});
  }
}

async function hydrateProductsWithMetrics(products = []) {
  return Promise.all(products.map(async product => {
    try {
      const loaded = await getProductDetailsFast({
        productUrl: product.url || product.productUrl,
        sku: product.sku
      }, { includeMetrics: true });

      return {
        ...product,
        ...loaded,
        quantity: product.quantity,
        requestedQuantity: product.requestedQuantity,
        availableQuantity: product.availableQuantity,
        addToCartQuantity: product.addToCartQuantity,
        preSaleQuantity: product.preSaleQuantity,
        saleState: product.saleState || loaded.saleState,
        available: product.available ?? loaded.available
      };
    } catch (error) {
      console.error(`Metric hydration failed for ${product.sku || product.url}:`, error.message);
      return product;
    }
  }));
}

async function getProductAvailability(page, itemInput, timing = createTiming('availability')) {
  const items = normaliseItems(itemInput);
  if (!items.length) {
    throw new Error('At least one SKU is required');
  }

  const summaries = await getProductSummaries({ items });
  const products = [];
  await timing.step('read product action states', async () => {
    for (const [index, item] of items.entries()) {
      const product = { ...(await getProductDetails(page, {
        ...item,
        productUrl: summaries[index]?.url || item.productUrl
      }, { forcePage: true })) };
      product.quantity = item.quantity;
      products.push(product);
    }
  });

  products.forEach(product => {
    product.requestedQuantity = normaliseQuantity(product.quantity);
    product.availableQuantity = product.available && !/pre[\s-]?sale|pre[\s-]?order/i.test(product.saleState)
      ? product.requestedQuantity
      : 0;
  });

  await timing.step('check cart add availability', async () => {
    await applyCartAddAvailability(products);
  });

  const cartProducts = products.filter(product => product.availableQuantity > 0 && product.variantId);
  if (cartProducts.length) {
    const cartItems = cartProducts.map(product =>
      `${product.variantId}:${normaliseQuantity(product.requestedQuantity)}`
    ).join(',');

    await timing.step('clear cart', async () => {
      await page.goto('https://livingculture.co.nz/cart/clear.js', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      }).catch(() => {});
    });

    await timing.step('check cart availability', async () => {
      await page.goto(`https://livingculture.co.nz/cart/${cartItems}`, {
        waitUntil: 'commit',
        timeout: 30000
      });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      if (/\/stock-problems/.test(page.url())) {
        await applyAvailableCheckoutQuantities(page, cartProducts);
      }
    });
  }

  const productAvailability = products.map(product => {
    const requestedQuantity = normaliseQuantity(product.requestedQuantity || product.quantity);
    const addToCartQuantity = Math.max(0, Number(product.availableQuantity) || 0);
    const preSaleQuantity = Math.max(0, requestedQuantity - addToCartQuantity);

    return {
      ...product,
      quantity: requestedQuantity,
      addToCartQuantity,
      preSaleQuantity
    };
  });

  return addCin7StockToProducts(productAvailability);
}

async function applyCartAddAvailability(products = []) {
  for (const product of products) {
    const requestedQuantity = normaliseQuantity(product.requestedQuantity || product.quantity);
    if (!product.variantId || !requestedQuantity) continue;

    try {
      const { response, data } = await requestShopifyAvailabilityAdd(product, requestedQuantity);

      if (response.ok) {
        product.availableQuantity = requestedQuantity;
        await wait(500);
        continue;
      }

      const message = `${data.message || ''} ${data.description || ''}`;
      const partialMatch = message.match(/only\s+(\d+)\s+items?\s+were\s+added/i);
      if (partialMatch) {
        product.availableQuantity = Math.max(0, Math.min(requestedQuantity, Number(partialMatch[1]) || 0));
        await wait(500);
        continue;
      }

      if (/sold out|not enough|unavailable|cannot be added/i.test(message)) {
        product.availableQuantity = 0;
      }
    } catch (error) {
      console.error(`Cart add availability check failed for ${product.sku}:`, error.message);
    }

    await wait(250);
  }
}

async function addCin7StockToProducts(products) {
  return Promise.all(products.map(async product => {
    try {
      return {
        ...product,
        cin7Stock: await getCin7ProductAvailability(product.sku)
      };
    } catch (error) {
      console.error(`Cin7 stock lookup failed for ${product.sku}:`, error.message);
      return {
        ...product,
        cin7Stock: {
          connected: true,
          locations: [],
          error: error.message
        }
      };
    }
  }));
}

async function openCheckoutForProducts(page, products, timing = createTiming('checkout')) {
  const cartItems = products.map(product =>
    `${product.variantId}:${normaliseQuantity(product.quantity)}`
  ).join(',');
  const checkoutCartUrl = `https://livingculture.co.nz/cart/${cartItems}`;

  await timing.step('clear cart', async () => {
    await page.goto('https://livingculture.co.nz/cart/clear.js', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    }).catch(() => {});
  });

  await timing.step('add to cart', async () => {
    // Navigate only until Shopify commits the cart permalink redirect. This
    // uses normal browser traffic to pass Shopify verification on Vercel, but
    // avoids rendering the heavy cart page that exhausts Chromium storage.
    await page.goto(checkoutCartUrl, {
      waitUntil: 'commit',
      timeout: 30000
    });
  });

  await timing.step('open checkout/cart', async () => {
    const addressSelector = ADDRESS_INPUT_SELECTORS.join(',');

    // Shopify's cart permalink normally commits directly to its standard
    // checkout. Reusing that page avoids a second checkout navigation, which
    // closes the serverless Chromium page on Vercel.
    if (!/\/checkouts\//.test(page.url())) {
      await page.goto('https://livingculture.co.nz/checkout?skip_shop_pay=true', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } else {
      await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
    }

    await continuePastStockProblems(page, products);
    await fillCheckoutBasics(page);

    await page.waitForSelector(addressSelector, { timeout: 35000 }).catch(async () => {
      if (await continuePastStockProblems(page, products)) {
        await fillCheckoutBasics(page);
        await page.waitForSelector(addressSelector, { timeout: 35000 });
        return;
      }
      const diagnostics = await readCheckoutDiagnostics(page);
      throw new Error(`Checkout address field was not available on ${page.url()}: ${JSON.stringify(diagnostics)}`);
    });
  });
}

function readSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const header = headers.get('set-cookie');
  if (!header) return [];

  return header.split(/,(?=\s*[^;,=]+=[^;,]+)/);
}

function updateCookieHeader(cookieHeader, headers) {
  const cookies = new Map(String(cookieHeader || '')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      const index = value.indexOf('=');
      return index > 0 ? [value.slice(0, index), value.slice(index + 1)] : ['', ''];
    })
    .filter(([name]) => name));

  for (const cookie of readSetCookies(headers)) {
    const pair = String(cookie || '').split(';')[0];
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function getStorefrontHeaders(cookieHeader = '', hasBody = false) {
  return {
    Accept: 'application/json',
    'Accept-Language': 'en-NZ,en;q=0.9',
    Origin: 'https://livingculture.co.nz',
    Referer: 'https://livingculture.co.nz/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {})
  };
}

const SHOPIFY_CART_RETRY_DELAYS_MS = [1500, 3500, 7000, 12000, 20000];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForShopifyCartRetry(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  const fallbackDelay = SHOPIFY_CART_RETRY_DELAYS_MS[Math.min(attempt, SHOPIFY_CART_RETRY_DELAYS_MS.length - 1)];
  await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : fallbackDelay);
}

async function fetchShopifyCartWithRetry(url, options = {}, { label = 'Shopify cart request', retries = 5, timeoutMs = 25000 } = {}) {
  const { signal: _signal, timeoutMs: optionTimeoutMs, ...fetchOptions } = options;
  const requestTimeoutMs = optionTimeoutMs || timeoutMs;
  let response;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    response = await fetch(url, {
      ...fetchOptions,
      signal: AbortSignal.timeout(requestTimeoutMs)
    });

    if (response.status !== 429 || attempt >= retries) {
      return response;
    }

    console.error(`${label} was rate limited; retrying ${attempt + 1}/${retries}`);
    await response.text().catch(() => {});
    await waitForShopifyCartRetry(response, attempt);
  }

  return response;
}

async function requestShopifyCartJson(path, options = {}, cookieHeader = '') {
  const { signal: _signal, timeoutMs = 25000, ...requestOptions } = options;
  const response = await fetchShopifyCartWithRetry(`https://livingculture.co.nz${path}`, {
    ...requestOptions,
    timeoutMs,
    headers: {
      ...getStorefrontHeaders(cookieHeader, Boolean(options.body)),
      ...(options.headers || {})
    }
  }, {
    label: `Shopify ${path}`,
    timeoutMs
  });
  const nextCookieHeader = updateCookieHeader(cookieHeader, response.headers);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.description || data.message || `Shopify cart request failed (${response.status})`);
  }

  return { data, cookieHeader: nextCookieHeader };
}

async function requestShopifyCartAdd(items, cookieHeader = '', { label = 'Shopify cart add', timeoutMs = 25000, retries = 5 } = {}) {
  const response = await fetchShopifyCartWithRetry('https://livingculture.co.nz/cart/add.js', {
    method: 'POST',
    timeoutMs,
    headers: getStorefrontHeaders(cookieHeader, true),
    body: JSON.stringify({ items })
  }, {
    label,
    retries,
    timeoutMs
  });

  const nextCookieHeader = updateCookieHeader(cookieHeader, response.headers);
  const data = await response.json().catch(() => ({}));
  return { response, data, cookieHeader: nextCookieHeader };
}

async function requestShopifyAvailabilityAdd(product, quantity) {
  const response = await fetchShopifyCartWithRetry('https://livingculture.co.nz/cart/add.js', {
    method: 'POST',
    timeoutMs: 15000,
    headers: getStorefrontHeaders('', true),
    body: JSON.stringify({
      items: [{
        id: product.variantId,
        quantity
      }]
    })
  }, {
    label: `Shopify availability check ${product.sku || product.variantId}`,
    retries: 3,
    timeoutMs: 15000
  });

  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text || '{}');
  } catch {
    data = {};
  }

  return { response, data };
}

async function prepareFastCartShipping(itemInput, addressText, timing = createTiming('fast freight'), { checkAvailability = true } = {}) {
  const fields = parseNewZealandAddress(addressText);
  if (!fields) {
    throw new Error('Fast freight needs a complete New Zealand address');
  }

  const products = await timing.step('resolve SKU fast shipping', async () => {
    return getProductSummaries(itemInput);
  });

  products.forEach(product => {
    product.requestedQuantity = normaliseQuantity(product.quantity);
    product.availableQuantity = product.available && !/pre[\s-]?sale|pre[\s-]?order/i.test(product.saleState)
      ? product.requestedQuantity
      : 0;
  });

  if (checkAvailability) {
    await timing.step('check fast cart availability', async () => {
      await applyCartAddAvailability(products);

      products.forEach(product => {
        const availableQuantity = Math.max(0, Math.min(
          normaliseQuantity(product.requestedQuantity || product.quantity),
          Number(product.availableQuantity) || 0
        ));
        product.quantity = availableQuantity;
        product.availableQuantity = availableQuantity;
      });
    });
  } else {
    products.forEach(product => {
      product.quantity = normaliseQuantity(product.quantity);
      product.availableQuantity = normaliseQuantity(product.quantity);
    });
  }


  const cartItems = products.map(product => ({
    id: product.variantId,
    quantity: Math.max(0, Number(product.availableQuantity) || 0)
  })).filter(item => item.id && item.quantity > 0);

  if (!cartItems.length) {
    throw new Error('Fast freight could not resolve in-stock variant quantities');
  }

  return { fields, products, cartItems };
}

async function getDirectCartShippingQuote(cartItems, fields) {
  let cookieHeader = '';

  const cleared = await requestShopifyCartJson('/cart/clear.js', {
    method: 'POST'
  }, cookieHeader);
  cookieHeader = cleared.cookieHeader;

  const addItemsToCart = async itemsToAdd => {
    const added = await requestShopifyCartAdd(itemsToAdd, cookieHeader);
    cookieHeader = added.cookieHeader;
    return added;
  };

  let added = await addItemsToCart(cartItems);

  if (!added.response.ok) {
    const message = `${added.data.message || ''} ${added.data.description || ''}`;
    const partialMatch = cartItems.length === 1
      ? message.match(/only\s+(\d+)\s+items?\s+were\s+added/i)
      : null;

    if (!partialMatch) {
      throw new Error(added.data.description || added.data.message || `Cart add failed (${added.response.status})`);
    }

    const partialQuantity = Math.max(0, Math.min(cartItems[0].quantity, Number(partialMatch[1]) || 0));
    if (!partialQuantity) {
      throw new Error(added.data.description || added.data.message || `Cart add failed (${added.response.status})`);
    }

    await requestShopifyCartJson('/cart/clear.js', { method: 'POST' }, cookieHeader)
      .then(result => {
        cookieHeader = result.cookieHeader;
      });
    added = await addItemsToCart([{ ...cartItems[0], quantity: partialQuantity }]);

    if (!added.response.ok) {
      throw new Error(added.data.description || added.data.message || `Cart add failed (${added.response.status})`);
    }
  }

  const params = new URLSearchParams();
  params.set('shipping_address[address1]', fields.address1 || '');
  params.set('shipping_address[address2]', fields.address2 || '');
  params.set('shipping_address[city]', fields.city || '');
  params.set('shipping_address[zip]', fields.postcode || '');
  params.set('shipping_address[province]', fields.region || '');
  params.set('shipping_address[country]', 'New Zealand');

  const rates = await requestShopifyCartJson(`/cart/shipping_rates.json?${params.toString()}`, {
    method: 'GET'
  }, cookieHeader);

  const shippingRates = Array.isArray(rates.data.shipping_rates) ? rates.data.shipping_rates : [];
  const rate = shippingRates.find(item => /ship|freight|delivery/i.test(normaliseSuggestion(item.name || item.title || item.code))) || shippingRates[0];
  if (!rate) {
    throw new Error('No shipping rates returned');
  }

  const asMoney = value => {
    const number = Number(value);
    return Number.isFinite(number) ? `$${number.toFixed(2)}` : '';
  };

  return {
    price: asMoney(rate.price),
    method: normaliseSuggestion(rate.name || rate.title || rate.code || 'Shipping'),
    cartItems: (Array.isArray(added.data.items) ? added.data.items : []).map(item => ({
      sku: item.sku || '',
      title: item.product_title || item.title || '',
      quantity: item.quantity || 1,
      unitPrice: item.price ? asMoney(Number(item.price) / 100) : '',
      lineTotal: item.line_price ? asMoney(Number(item.line_price) / 100) : '',
      productUrl: item.url ? `https://livingculture.co.nz${item.url}` : '',
      image: item.image || ''
    }))
  };
}

function buildFastCartShippingResult(result, products, addressText) {
  const cartQuantityBySku = new Map((result.cartItems || [])
    .filter(item => item.sku)
    .map(item => [String(item.sku).toLowerCase(), normaliseQuantity(item.quantity)]));
  const quotedProducts = products.map(product => {
    const cartQuantity = cartQuantityBySku.get(String(product.sku || '').toLowerCase());
    if (cartQuantity == null) return product;

    return {
      ...product,
      quantity: cartQuantity,
      availableQuantity: cartQuantity,
      requestedQuantity: normaliseQuantity(product.requestedQuantity || product.quantity)
    };
  });

  return {
    ...result,
    selectedAddress: addressText,
    addressFields: [{
      label: 'address',
      value: addressText
    }],
    products: quotedProducts,
    finalCartPrice: calculateFinalCartPrice(
      enrichCartItemsWithProducts(result.cartItems || [], quotedProducts),
      result.price
    )
  };
}

async function getDirectFastCartShippingQuote(
  itemInput,
  addressText,
  timing = createTiming('direct freight'),
  { checkAvailability = false } = {}
) {
  const { fields, products, cartItems } = await prepareFastCartShipping(itemInput, addressText, timing, {
    checkAvailability
  });
  const result = await timing.step('read direct cart shipping rates', () =>
    getDirectCartShippingQuote(cartItems, fields)
  );

  if (!result.price) {
    throw new Error('Direct cart freight did not return a price');
  }

  return buildFastCartShippingResult(result, products, addressText);
}

async function getFastCartShippingQuote(page, itemInput, addressText, timing = createTiming('fast freight')) {
  const { fields, products, cartItems } = await prepareFastCartShipping(itemInput, addressText, timing);

  try {
    const result = await timing.step('read direct cart shipping rates', () =>
      getDirectCartShippingQuote(cartItems, fields)
    );

    if (!result.price) {
      throw new Error('Direct cart freight did not return a price');
    }

    return buildFastCartShippingResult(result, products, addressText);
  } catch (error) {
    console.error('Direct cart freight failed, using browser cart:', error.message);
  }

  await timing.step('open storefront fast shipping', async () => {
    await page.goto('https://livingculture.co.nz/', {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    });
  });

  const result = await timing.step('read cart shipping rates', async () => {
    return page.evaluate(async ({ cartItems: pageCartItems, fields: pageFields }) => {
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      const asMoney = value => {
        const number = Number(value);
        return Number.isFinite(number) ? `$${number.toFixed(2)}` : '';
      };
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const retryDelays = [1500, 3500, 7000, 12000, 20000];
      const fetchWithRetry = async (url, options, label) => {
        let response;

        for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
          response = await fetch(url, options);
          if (response.status !== 429 || attempt >= retryDelays.length) {
            return response;
          }

          await response.text().catch(() => {});
          await wait(retryDelays[Math.min(attempt, retryDelays.length - 1)]);
        }

        return response;
      };

      const clearResponse = await fetchWithRetry('/cart/clear.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      }, 'Cart clear');
      if (!clearResponse.ok) {
        throw new Error(`Cart clear failed (${clearResponse.status})`);
      }

      const addResponse = await fetchWithRetry('/cart/add.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: pageCartItems })
      }, 'Cart add');
      const addData = await addResponse.json().catch(() => ({}));
      if (!addResponse.ok) {
        throw new Error(addData.description || addData.message || `Cart add failed (${addResponse.status})`);
      }

      const params = new URLSearchParams();
      params.set('shipping_address[address1]', pageFields.address1 || '');
      params.set('shipping_address[address2]', pageFields.address2 || '');
      params.set('shipping_address[city]', pageFields.city || '');
      params.set('shipping_address[zip]', pageFields.postcode || '');
      params.set('shipping_address[province]', pageFields.region || '');
      params.set('shipping_address[country]', 'New Zealand');

      const ratesResponse = await fetchWithRetry(`/cart/shipping_rates.json?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      }, 'Shipping rates');
      const ratesData = await ratesResponse.json().catch(() => ({}));
      if (!ratesResponse.ok) {
        throw new Error(ratesData.description || ratesData.message || `Shipping rates failed (${ratesResponse.status})`);
      }

      const rates = Array.isArray(ratesData.shipping_rates) ? ratesData.shipping_rates : [];
      const rate = rates.find(item => /ship|freight|delivery/i.test(clean(item.name || item.title || item.code))) || rates[0];
      if (!rate) {
        throw new Error('No shipping rates returned');
      }

      return {
        price: asMoney(rate.price),
        method: clean(rate.name || rate.title || rate.code || 'Shipping'),
        cartItems: (Array.isArray(addData.items) ? addData.items : []).map(item => ({
          sku: item.sku || '',
          title: item.product_title || item.title || '',
          quantity: item.quantity || 1,
          unitPrice: item.price ? asMoney(Number(item.price) / 100) : '',
          lineTotal: item.line_price ? asMoney(Number(item.line_price) / 100) : '',
          productUrl: item.url ? new URL(item.url, location.origin).toString() : '',
          image: item.image || ''
        }))
      };
    }, { cartItems, fields });
  });

  if (!result.price) {
    throw new Error('Fast freight did not return a price');
  }

  return buildFastCartShippingResult(result, products, addressText);
}

function isFastFreightError(error) {
  return /Fast freight|Cart clear|Cart add|Shipping rates|No shipping rates|storefront/i.test(error?.message || '');
}

async function buildFreightResponsePayload(result, fallbackSku = '') {
  const products = await hydrateProductsWithMetrics(result.products || []);
  const cartItems = enrichCartItemsWithProducts(result.cartItems || [], products);
  const finalCartPrice = result.finalCartPrice || calculateFinalCartPrice(cartItems, result.price);

  return {
    ...result,
    sku: products?.[0]?.sku || fallbackSku || '',
    skus: products?.map(product => product.sku).filter(Boolean) || [],
    price: result.price,
    priceNumber: parseMoneyToCents(result.price) / 100,
    finalCartPrice,
    cartItems,
    products,
    quantityAdjustments: buildQuantityAdjustments(products),
    freightBreakdown: buildFreightBreakdown(products, result.price),
    preSaleFreightEstimate: buildPreSaleFreightEstimate(products, result.price)
  };
}

async function continuePastStockProblems(page, products) {
  if (!/\/stock-problems/.test(page.url())) return false;

  await applyAvailableCheckoutQuantities(page, products);
  await Promise.all([
    page.waitForURL(/\/information/, { timeout: 30000, waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.locator('button:has-text("Continue"), button[type="submit"]:visible').first().click({ timeout: DEFAULT_WAIT })
  ]);
  return true;
}

async function applyAvailableCheckoutQuantities(page, products) {
  const bodyText = await page.locator('body').innerText({ timeout: DEFAULT_WAIT });
  const comparableText = normaliseSuggestion(bodyText).toLowerCase();

  products.forEach(product => {
    const title = normaliseSuggestion(String(product.title || '').replace(/\s+-\s+.*$/, '')).toLowerCase();
    const titleIndex = title ? comparableText.indexOf(title) : -1;
    if (titleIndex < 0) return;

    const match = comparableText.slice(titleIndex, titleIndex + title.length + 100)
      .match(/(\d+)\s*→\s*(\d+)/);
    if (!match) return;

    const requestedQuantity = Number(match[1]);
    const availableQuantity = Number(match[2]);
    if (!Number.isFinite(availableQuantity) || availableQuantity < 0) return;
    product.requestedQuantity = requestedQuantity;
    product.availableQuantity = availableQuantity;
    product.quantity = availableQuantity;
  });
}

function buildQuantityAdjustments(products = []) {
  return products
    .map(product => {
      const requestedQuantity = Number(product.requestedQuantity);
      const availableQuantity = Number(product.quantity);

      return {
        sku: product.sku,
        requestedQuantity,
        availableQuantity,
        preSaleQuantity: Math.max(0, requestedQuantity - availableQuantity)
      };
    })
    .filter(adjustment =>
      Number.isFinite(adjustment.requestedQuantity) &&
      Number.isFinite(adjustment.availableQuantity) &&
      adjustment.requestedQuantity !== adjustment.availableQuantity
    );
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

async function getSuggestionsForAddress(page, addressQuery, timing = createTiming('suggestions')) {
  const addressInput = page.locator(ADDRESS_INPUT_SELECTORS.join(',')).first();
  const queries = makeAddressQueries(addressQuery);
  const partialAddress = isPartialStreetAddress(addressQuery);

  for (const query of queries) {
    let predictionSuggestions = [];
    await timing.step('type address', async () => {
      predictionSuggestions = await typeAddressAndReadPredictions(page, addressInput, query);
    });

    if (predictionSuggestions.length) {
      return predictionSuggestions.slice(0, 10);
    }

    const suggestions = await timing.step('read address suggestions', async () => {
      const waitTimeout = partialAddress && query === normaliseSuggestion(String(addressQuery || ''))
        ? 2000
        : DEFAULT_WAIT;
      await page.waitForSelector(SUGGESTION_SELECTORS.join(','), { timeout: waitTimeout }).catch(() => {});
      return readSuggestions(page);
    });

    if (suggestions.length) {
      return suggestions.slice(0, 10);
    }
  }

  return getManualAddressFallback(addressQuery);
}

async function selectAddressAndGetPrice(page, addressText, timing = createTiming('price')) {
  let clickedSuggestion = await timing.step('select address', () => clickMatchingSuggestion(page, addressText));
  const manualAddress = getManualAddressFallback(addressText)[0];

  if (!clickedSuggestion && manualAddress) {
    clickedSuggestion = await timing.step('enter manual address', () => fillManualCheckoutAddress(page, manualAddress));
  }

  if (!clickedSuggestion) {
    const addressInput = page.locator(ADDRESS_INPUT_SELECTORS.join(',')).first();
    const addressQueries = makeAddressQueries(addressText);

    for (const query of addressQueries) {
      let predictionSuggestions = [];
      await timing.step('type address', async () => {
        predictionSuggestions = await typeAddressAndReadPredictions(page, addressInput, query);
      });

      const predictedAddress = findMatchingSuggestion(predictionSuggestions, query);
      if (predictedAddress) {
        await page.waitForSelector(SUGGESTION_SELECTORS.join(','), { timeout: 3000 }).catch(() => {});
        clickedSuggestion = await timing.step('select address', () => clickMatchingSuggestion(page, predictedAddress));

        if (!clickedSuggestion) {
          await addressInput.press('ArrowDown').catch(() => {});
          await page.waitForTimeout(100);
          await addressInput.press('Enter').catch(() => {});
          clickedSuggestion = predictedAddress;
        }
        break;
      }

      await page.waitForSelector(SUGGESTION_SELECTORS.join(','), { timeout: DEFAULT_WAIT }).catch(() => {});
      clickedSuggestion = await timing.step('select address', () => clickMatchingSuggestion(page, addressText));
      if (clickedSuggestion) break;
    }
  }

  if (!clickedSuggestion) {
    clickedSuggestion = await timing.step('enter manual address', async () => {
      if (!manualAddress) return '';

      return fillManualCheckoutAddress(page, manualAddress);
    });
  }

  if (!clickedSuggestion) {
    throw new Error(`Could not select an address suggestion for "${addressText}". Enter a complete delivery address to quote manually.`);
  }

  await page.waitForTimeout(1000);

  await fillCheckoutBasics(page);

  const continueButton = page
    .locator('button:has-text("Continue to shipping"), button:has-text("Continue"), button[type="submit"]:visible')
    .first();

  await timing.step('continue to shipping', async () => {
    await continueButton.click({ timeout: DEFAULT_WAIT });

    // Shopify may render shipping methods in its one-page checkout without
    // changing the URL to /shipping. Do not spend the serverless time budget
    // waiting for a navigation that may never occur.
    await Promise.race([
      page.waitForURL(/\/shipping/, { timeout: 30000, waitUntil: 'domcontentloaded' }),
      page.waitForFunction(() => {
        const text = document.body?.innerText || '';
        return /Shipping method|Getting available shipping rates|Ship from/i.test(text);
      }, { timeout: 30000 })
    ]).catch(() => {});
  });

  await timing.step('read freight', async () => {
    try {
      await page.waitForFunction(() => {
        const text = document.body?.innerText || '';
        return /Shipping method/i.test(text) &&
          !/Getting available shipping rates/i.test(text) &&
          (/Ship from[\s\S]*\$\d/.test(text) || /Shipping\s+\$\d/.test(text));
      }, { timeout: 60000 });
    } catch (error) {
      const checkoutText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      const addressFields = await readAddressFields(page).catch(() => []);
      throw new Error(
        `Shipping rates did not load on ${page.url()}. ` +
        `Address fields: ${JSON.stringify(addressFields)}. ` +
        `Checkout text: ${normaliseSuggestion(checkoutText).slice(0, 600)}`
      );
    }
  });

  const shipping = await timing.step('read freight price', () => readShippingPrice(page));
  const cartSummary = await timing.step('read cart summary', () => readCheckoutCartSummary(page));
  const addressFields = await readAddressFields(page);

  return {
    price: shipping.price,
    method: shipping.method,
    selectedAddress: clickedSuggestion || addressText,
    addressFields,
    finalCartPrice: cartSummary.finalCartPrice || '',
    cartItems: cartSummary.cartItems || []
  };
}

function makeAddressQueries(addressText) {
  const exactAddress = normaliseSuggestion(String(addressText || ''));
  const formattedCin7Address = formatCin7CheckoutAddress(exactAddress);
  const isPartialAddress = isPartialStreetAddress(exactAddress);
  const partialAddressQueries = isPartialAddress
    ? makePartialStreetAddressQueries(exactAddress)
    : [];

  return Array.from(new Set([
    formattedCin7Address,
    ...partialAddressQueries,
    exactAddress,
    ...(!isPartialAddress ? [
      String(addressText).replace(/,\s*New Zealand$/i, ''),
      String(addressText).replace(/\s+New Zealand$/i, ''),
      String(addressText).split(',').slice(0, 2).join(','),
      String(addressText).split(',')[0]
    ] : [])
  ].map(value => normaliseSuggestion(String(value || ''))).filter(Boolean)));
}

function makePartialStreetAddressQueries(addressText) {
  const trailingStreetInitial = addressText.match(/^(.*)\s+(r|ro|roa)$/i);
  if (trailingStreetInitial) {
    return [
      `${trailingStreetInitial[1]} Road`,
      `${trailingStreetInitial[1]} Rd`
    ];
  }

  return PARTIAL_ADDRESS_SUFFIXES
    .slice(0, 4)
    .map(suffix => `${addressText} ${suffix}`);
}

function getManualAddressFallback(addressText) {
  const address = formatCin7CheckoutAddress(addressText) ||
    normaliseSuggestion(String(addressText || ''));
  if (!address.includes(',') || !/\bnew zealand\b/i.test(address)) return [];
  return [address];
}

function parseNewZealandAddress(addressText) {
  const address = normaliseSuggestion(String(addressText || ''));
  const withoutCountry = address.replace(/,\s*New Zealand$/i, '');
  if (withoutCountry === address) return null;

  const parts = withoutCountry.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const cityAndPostcode = parts.pop();
  const match = cityAndPostcode.match(/^(.*?)\s+(\d{4})$/);
  if (!match) return null;

  return {
    address1: parts.shift(),
    address2: parts.join(', '),
    city: match[1].trim(),
    postcode: match[2],
    region: inferNewZealandRegion(match[1].trim(), match[2])
  };
}

function inferNewZealandRegion(city, postcode) {
  const cityRegions = new Map([
    ['auckland', 'Auckland'],
    ['hamilton', 'Waikato'],
    ['tauranga', 'Bay of Plenty'],
    ['rotorua', 'Bay of Plenty'],
    ['gisborne', 'Gisborne'],
    ['napier', 'Hawke’s Bay'],
    ['hastings', 'Hawke’s Bay'],
    ['new plymouth', 'Taranaki'],
    ['palmerston north', 'Manawatū-Whanganui'],
    ['wellington', 'Wellington'],
    ['nelson', 'Nelson'],
    ['blenheim', 'Marlborough'],
    ['christchurch', 'Canterbury'],
    ['dunedin', 'Otago'],
    ['invercargill', 'Southland']
  ]);
  const cityRegion = cityRegions.get(String(city || '').toLowerCase());
  if (cityRegion) return cityRegion;

  const postalNumber = Number.parseInt(postcode, 10);
  if (postalNumber >= 600 && postalNumber <= 2699) return 'Auckland';
  if (postalNumber >= 3000 && postalNumber <= 3199) return 'Bay of Plenty';
  if (postalNumber >= 3200 && postalNumber <= 3999) return 'Waikato';
  if (postalNumber >= 4000 && postalNumber <= 4099) return 'Gisborne';
  if (postalNumber >= 4100 && postalNumber <= 4299) return 'Hawke’s Bay';
  if (postalNumber >= 4300 && postalNumber <= 4399) return 'Taranaki';
  if (postalNumber >= 4400 && postalNumber <= 4999) return 'Manawatū-Whanganui';
  return '';
}

async function fillFirstAvailable(page, selectors, value) {
  if (!value) return false;
  const field = page.locator(selectors.join(',')).first();
  if (!await field.count()) return false;
  await field.fill(value);
  return true;
}

async function fillManualCheckoutAddress(page, addressText) {
  const fields = parseNewZealandAddress(addressText);
  if (!fields) return '';

  await fillFirstAvailable(page, ['#shipping-address1:visible', 'input[name="address1"]:visible'], fields.address1);
  await fillFirstAvailable(page, ['#shipping-address2:visible', 'input[name="address2"]:visible'], fields.address2);
  await fillFirstAvailable(page, ['input[name="city"]:visible', 'input[autocomplete="address-level2"]:visible'], fields.city);
  await fillFirstAvailable(page, ['input[name="postalCode"]:visible', 'input[name="zip"]:visible', 'input[autocomplete="postal-code"]:visible'], fields.postcode);

  const country = page.locator('select[name="countryCode"]:visible').first();
  if (await country.count()) {
    await country.selectOption('NZ').catch(() => country.selectOption({ label: 'New Zealand' }).catch(() => {}));
  }

  const region = page.locator('select[name="zone"]:visible, select[autocomplete="address-level1"]:visible').first();
  if (await region.count() && fields.region) {
    await region.selectOption({ label: fields.region }).catch(() => {});
  }

  await page.locator(ADDRESS_INPUT_SELECTORS.join(',')).first().press('Tab').catch(() => {});
  return addressText;
}

function formatCin7CheckoutAddress(addressText) {
  const address = normaliseSuggestion(String(addressText || ''));
  const regionMatch = address.match(
    /^(.*?\b(?:road|rd|street|st|avenue|ave|drive|dr|place|pl|crescent|cres|lane|ln|parade|terrace|tce|close|court|ct|way|highway|hwy))\s+([^,]+),\s*(.+?)\s+([a-z][a-z -]+?)\s+region\s+(\d{4})\s+new zealand$/i
  );

  if (regionMatch) {
    const [, street, suburb, city, , postcode] = regionMatch;
    return `${street}, ${suburb}, ${city} ${postcode}, New Zealand`;
  }

  const cin7Match = address.match(
    /^(.*?\b(?:road|rd|street|st|avenue|ave|drive|dr|place|pl|crescent|cres|lane|ln|parade|terrace|tce|close|court|ct|way|highway|hwy))\s+([^,]+),\s*(.+?)\s+(\d{4})\s+new zealand$/i
  );

  if (!cin7Match) return '';

  const [, street, suburb, cityText, postcode] = cin7Match;
  const city = normaliseRepeatedAddressWords(cityText);
  return `${street}, ${suburb}, ${city} ${postcode}, New Zealand`;
}

function normaliseRepeatedAddressWords(text) {
  const words = normaliseSuggestion(String(text || '')).split(' ').filter(Boolean);

  if (words.length % 2 === 0) {
    const midpoint = words.length / 2;
    const firstHalf = words.slice(0, midpoint).join(' ').toLowerCase();
    const secondHalf = words.slice(midpoint).join(' ').toLowerCase();

    if (firstHalf === secondHalf) {
      return words.slice(0, midpoint).join(' ');
    }
  }

  return words.join(' ');
}

function isPartialStreetAddress(addressText) {
  const address = normaliseSuggestion(String(addressText || ''));
  if (!/^\d+\s+\S+/.test(address) || address.includes(',')) return false;
  return !/\b(road|rd|street|st|avenue|ave|drive|dr|place|pl|crescent|cres|lane|ln|parade|terrace|tce|close|court|ct|way|highway|hwy)\b/i.test(address);
}

async function typeAddressAndReadPredictions(page, addressInput, query) {
  const predictionResponse = page.waitForResponse(isAddressPredictionResponse, {
    timeout: ADDRESS_PREDICTION_WAIT_MS
  }).catch(() => null);

  await addressInput.fill('');
  await addressInput.type(query, { delay: 20 });

  const response = await predictionResponse;
  if (!response) return [];

  const payload = await response.json().catch(() => null);
  return Array.from(new Set((payload?.data?.predictions || [])
    .map(prediction => normaliseSuggestion(String(prediction?.description || '')))
    .filter(Boolean)));
}

function isAddressPredictionResponse(response) {
  if (!/atlas\.shopifysvc\.com\/graphql/i.test(response.url())) return false;

  try {
    return JSON.parse(response.request().postData() || '{}').operationName === 'predictions';
  } catch (error) {
    return false;
  }
}

function findMatchingSuggestion(suggestions, addressText) {
  const wantedAddress = normaliseAddressForCompare(addressText);
  const wantedStreet = normaliseAddressForCompare(String(addressText).split(',')[0] || '');

  return suggestions.find(suggestion => {
    const comparableSuggestion = normaliseAddressForCompare(suggestion);
    return comparableSuggestion.includes(wantedAddress) ||
      wantedAddress.includes(comparableSuggestion) ||
      comparableSuggestion.includes(wantedStreet);
  }) || '';
}

async function readSuggestions(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.$$eval(SUGGESTION_SELECTORS.join(','), nodes =>
        Array.from(new Set(Array.from(nodes)
          .map(node => node.textContent || '')
          .map(text => text.replace(/\s+/g, ' ').trim())
          .filter(Boolean)))
      );
    } catch (error) {
      if (!isTransientNavigationError(error) || attempt === 2) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }

  return [];
}

async function clickMatchingSuggestion(page, addressText) {
  const wantedAddress = normaliseSuggestion(addressText).toLowerCase();
  const wantedStreet = normaliseSuggestion(String(addressText).split(',')[0] || '').toLowerCase();
  const comparableWantedAddress = normaliseAddressForCompare(addressText);
  const comparableWantedStreet = normaliseAddressForCompare(String(addressText).split(',')[0] || '');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const suggestionHandles = await page.$$(SUGGESTION_SELECTORS.join(','));

      for (const handle of suggestionHandles) {
        const text = normaliseSuggestion((await handle.textContent()) || '');
        const normalisedText = text.toLowerCase();
        const comparableText = normaliseAddressForCompare(text);
        if (
          normalisedText.includes(wantedAddress) ||
          wantedAddress.includes(normalisedText) ||
          normalisedText === wantedAddress ||
          (wantedStreet && normalisedText.includes(wantedStreet)) ||
          (comparableWantedAddress && comparableText.includes(comparableWantedAddress)) ||
          (comparableWantedStreet && comparableText.includes(comparableWantedStreet))
        ) {
          await handle.click();
          return text;
        }
      }

      return null;
    } catch (error) {
      if (!isTransientNavigationError(error) || attempt === 2) throw error;
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }

  return null;
}

function normaliseAddressForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

async function readCheckoutDiagnostics(page) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const visibleInputs = await page.$$eval('input, textarea, select, button', nodes =>
    Array.from(nodes)
      .filter(node => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden';
      })
      .slice(0, 25)
      .map(node => ({
        tag: node.tagName.toLowerCase(),
        type: node.getAttribute('type') || '',
        name: node.getAttribute('name') || '',
        id: node.id || '',
        autocomplete: node.getAttribute('autocomplete') || '',
        placeholder: node.getAttribute('placeholder') || '',
        ariaLabel: node.getAttribute('aria-label') || '',
        disabled: Boolean(node.disabled),
        text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      }))
  ).catch(() => []);

  return {
    text: normaliseSuggestion(bodyText).slice(0, 700),
    visibleInputs
  };
}

app.post('/api/suggestions', async (req, res) => {
  const { productUrl, sku, skus, items, address } = req.body;
  if (!normaliseItems({ productUrl, sku, skus, items }).length || !address) {
    return res.status(400).json({ error: 'At least one SKU and address are required' });
  }

  const cacheKey = makeAddressSuggestionKey({ productUrl, sku, skus, items, address });
  if (addressSuggestionCache.has(cacheKey)) {
    return res.json(addressSuggestionCache.get(cacheKey));
  }

  try {
    const manualAddress = getManualAddressFallback(address)[0];
    if (manualAddress) {
      const payload = {
        suggestions: [manualAddress],
        products: await getProductSummaries({ productUrl, sku, skus, items })
      };
      addressSuggestionCache.set(cacheKey, payload);
      return res.json(payload);
    }

    const payload = await withAutomationPage('api suggestions', async page => {
      const timing = createTiming('api suggestions');
      const checkout = await getCheckoutSession({ productUrl, sku, skus, items }, page, timing);
      const suggestions = await getSuggestionsForAddress(checkout.page, address, timing);
      checkout.lastUsed = Date.now();
      scheduleCheckoutCleanup();
      return { suggestions, products: checkout.products };
    });
    if (payload.suggestions.length) {
      addressSuggestionCache.set(cacheKey, payload);
    }
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'living-culture-freight',
    runtime: process.env.VERCEL ? 'vercel' : 'local'
  });
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

app.post('/api/availability', async (req, res) => {
  const { productUrl, sku, skus, items } = req.body;
  const requestedItems = normaliseItems({ productUrl, sku, skus, items });
  if (!requestedItems.length) {
    return res.status(400).json({ error: 'At least one SKU is required' });
  }

  try {
    let products;
    try {
      products = await Promise.race([
        withAutomationPage('availability', async page => {
          return getProductAvailability(page, { productUrl, sku, skus, items });
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Website availability lookup timed out after 30s.')), 30000);
        })
      ]);
    } catch (error) {
      console.error('Website availability lookup failed; returning Cin7 stock only:', error.message);
      const productSummaries = await getProductSummaries({ productUrl, sku, skus, items }).catch(() =>
        requestedItems.map(item => ({ sku: item.sku || '', title: item.sku || 'Product' }))
      );
      const fallbackProducts = requestedItems.map((item, index) => {
        const requestedQuantity = normaliseQuantity(item.quantity);
        const product = {
          ...productSummaries[index],
          sku: productSummaries[index]?.sku || item.sku,
          requestedQuantity,
          availableQuantity: productSummaries[index]?.available ? requestedQuantity : 0,
          quantity: item.quantity,
          storefrontError: 'Website add-to-cart status could not be loaded.'
        };
        return product;
      });
      await applyCartAddAvailability(fallbackProducts);
      products = await addCin7StockToProducts(fallbackProducts.map(product => {
        const requestedQuantity = normaliseQuantity(product.requestedQuantity || product.quantity);
        const addToCartQuantity = Math.max(0, Number(product.availableQuantity) || 0);
        return {
          ...product,
          quantity: requestedQuantity,
          addToCartQuantity,
          preSaleQuantity: Math.max(0, requestedQuantity - addToCartQuantity)
        };
      }));
    }
    return res.json({ products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/price', async (req, res) => {
  const { productUrl, sku, skus, items, selectedAddress } = req.body;
  const freightAddress = getManualAddressFallback(selectedAddress)[0] || selectedAddress;

  if (!normaliseItems({ productUrl, sku, skus, items }).length || !freightAddress) {
    return res.status(400).json({ error: 'At least one SKU and selectedAddress are required' });
  }

  const cacheKey = makeFreightQuoteKey('api-price', { productUrl, sku, skus, items }, freightAddress);
  const cachedPayload = getCachedFreightQuote(cacheKey);
  if (cachedPayload) {
    return res.json({ ...cachedPayload, fromCache: true });
  }

  try {
    try {
      const directResult = await getDirectFastCartShippingQuote({ productUrl, sku, skus, items }, freightAddress, createTiming('api price direct'));
      const directPayload = await buildFreightResponsePayload(directResult, sku);
      cacheFreightQuote(cacheKey, directPayload);
      return res.json(directPayload);
    } catch (directError) {
      console.error('Direct freight price failed, using browser fallback:', directError.message);
    }

    const payload = await withAutomationPage('api price', async page => {
      const timing = createTiming('api price');
      let result;
      let checkout = null;

      try {
        result = await getFastCartShippingQuote(page, { productUrl, sku, skus, items }, freightAddress, timing);
      } catch (fastError) {
        console.error('Fast freight price failed, using checkout:', fastError.message);
        checkout = await getCheckoutSession({ productUrl, sku, skus, items }, page, timing);

        try {
          result = await selectAddressAndGetPrice(checkout.page, freightAddress, timing);
        } catch (firstError) {
          if (!isRetryableCheckoutError(firstError) || isFastFreightError(fastError)) throw firstError;
          console.error('Retrying freight price with a fresh checkout session:', firstError.message);
          await closeActiveCheckout();
          checkout = await getCheckoutSession({ productUrl, sku, skus, items }, page, timing);
          result = await selectAddressAndGetPrice(checkout.page, freightAddress, timing);
        }
      }

      if (checkout) {
        checkout.lastUsed = Date.now();
        scheduleCheckoutCleanup();
      }

      return buildFreightResponsePayload({
        ...result,
        products: result.products || checkout?.products || []
      }, sku);
    });

    cacheFreightQuote(cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/get-freight', async (req, res) => {
  const { sku, productUrl, address, selectedAddress, quantity } = req.body;
  const requestedAddress = selectedAddress || address;
  const freightAddress = getManualAddressFallback(requestedAddress)[0] || requestedAddress;
  const quoteAvailableQuantityOnly = req.body.quoteAvailableQuantityOnly === true;
  const skipBrowserFallback = req.body.skipBrowserFallback === true;

  const items = Array.isArray(req.body.items) && req.body.items.length
    ? req.body.items.map(item => {
      const itemSkuLooksLikeUrl = /^https?:\/\/.+\/products\//i.test(String(item?.sku || ''));
      return {
        sku: itemSkuLooksLikeUrl ? '' : item?.sku,
        productUrl: item?.productUrl || (itemSkuLooksLikeUrl ? item?.sku : ''),
        quantity: normaliseQuantity(item?.quantity)
      };
    })
    : [{
      sku: /^https?:\/\/.+\/products\//i.test(String(sku || '')) ? '' : sku,
      productUrl: productUrl || (/^https?:\/\/.+\/products\//i.test(String(sku || '')) ? sku : ''),
      quantity: normaliseQuantity(quantity)
    }];

  if (!normaliseItems({ items }).length || !freightAddress) {
    return res.status(400).json({ error: 'SKU or product URL and address are required' });
  }

  const cacheKey = makeFreightQuoteKey('get-freight', { items }, freightAddress);
  const cachedPayload = getCachedFreightQuote(cacheKey);
  if (cachedPayload) {
    return res.json({ ...cachedPayload, fromCache: true });
  }

  try {
    try {
      const directResult = await getDirectFastCartShippingQuote(
        { items },
        freightAddress,
        createTiming('get freight direct'),
        { checkAvailability: quoteAvailableQuantityOnly }
      );
      const directPayload = await buildFreightResponsePayload(directResult, sku);
      cacheFreightQuote(cacheKey, directPayload);
      return res.json(directPayload);
    } catch (directError) {
      const directMessage = directError.message || '';
      const shouldRetryWithBrowserFallback = /429|rate limit/i.test(directMessage);

      if (skipBrowserFallback && !shouldRetryWithBrowserFallback) {
        console.error('Direct Cin7 freight failed and browser fallback was skipped:', directError.message);
        return res.status(422).json({
          error: directError.message || 'Fast freight quote could not be loaded'
        });
      }

      if (skipBrowserFallback && shouldRetryWithBrowserFallback) {
        console.error('Direct Cin7 freight was rate limited, using browser fallback despite skip request:', directError.message);
      } else {
        console.error('Direct Cin7 freight failed, using browser fallback:', directError.message);
      }
    }

    const payload = await withAutomationPage('get freight', async page => {
      const timing = createTiming('get freight');
      let result;
      let checkout = null;

      try {
        result = await getFastCartShippingQuote(page, { items }, freightAddress, timing);
      } catch (fastError) {
        console.error('Fast Cin7 freight failed, using checkout:', fastError.message);
        checkout = await getCheckoutSession({ items }, page, timing);

        try {
          result = await selectAddressAndGetPrice(checkout.page, freightAddress, timing);
        } catch (firstError) {
          if (!isRetryableCheckoutError(firstError) || isFastFreightError(fastError)) throw firstError;
          console.error('Retrying Cin7 freight with a fresh checkout session:', firstError.message);
          await closeActiveCheckout();
          checkout = await getCheckoutSession({ items }, page, timing);
          result = await selectAddressAndGetPrice(checkout.page, freightAddress, timing);
        }
      }

      if (checkout) {
        checkout.lastUsed = Date.now();
        scheduleCheckoutCleanup();
      }

      return buildFreightResponsePayload({
        ...result,
        products: result.products || checkout?.products || []
      }, sku);
    }, 55000);

    cacheFreightQuote(cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/address-suggestions', async (req, res) => {
  const { sku, productUrl, address, quantity } = req.body;
  const skuLooksLikeUrl = /^https?:\/\/.+\/products\//i.test(String(sku || ''));
  const items = [{
    sku: skuLooksLikeUrl ? '' : sku,
    productUrl: productUrl || (skuLooksLikeUrl ? sku : ''),
    quantity: normaliseQuantity(quantity)
  }];

  if (!normaliseItems({ items }).length || !address) {
    return res.status(400).json({ error: 'SKU or product URL and address are required' });
  }

  const cacheKey = makeAddressSuggestionKey({ items, address });
  if (addressSuggestionCache.has(cacheKey)) {
    return res.json(addressSuggestionCache.get(cacheKey));
  }

  try {
    const manualAddress = getManualAddressFallback(address)[0];
    if (manualAddress) {
      const payload = {
        suggestions: [manualAddress],
        products: await getProductSummaries({ items })
      };
      addressSuggestionCache.set(cacheKey, payload);
      return res.json(payload);
    }

    const payload = await withAutomationPage('address suggestions', async page => {
      const timing = createTiming('address suggestions');
      const checkout = await getCheckoutSession({ items }, page, timing);
      const suggestions = await getSuggestionsForAddress(checkout.page, address, timing);
      checkout.lastUsed = Date.now();
      scheduleCheckoutCleanup();
      return { suggestions, products: checkout.products };
    });
    if (payload.suggestions.length) {
      addressSuggestionCache.set(cacheKey, payload);
    }
    return res.json(payload);
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
    const baseProducts = await getProductMetrics({ productUrl, sku, skus, items });
    const products = await addCin7StockToProducts(baseProducts);
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
    const payload = await withAutomationPage('item shipping', async page => {
      const timing = createTiming('item shipping');
      const checkout = await getCheckoutSession({ productUrl, sku, skus, items }, page, timing);
      const itemShipping = await getSingleProductShippingSummaries(checkout.products, selectedAddress);
      checkout.lastUsed = Date.now();
      scheduleCheckoutCleanup();
      return {
        products: checkout.products,
        itemShipping
      };
    });
    return res.json(payload);
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

app.app = app;
app.startServer = startServer;
app.closeActiveCheckout = closeActiveCheckout;
module.exports = app;
