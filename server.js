const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
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
const HUBSPOT_API_BASE_URL = process.env.HUBSPOT_API_BASE_URL || 'https://api.hubapi.com';
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN ||
  process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
  process.env.HUBSPOT_API_KEY;
const HUBSPOT_DEAL_PIPELINE = process.env.HUBSPOT_DEAL_PIPELINE || process.env.HUBSPOT_PIPELINE || '';
const HUBSPOT_DEAL_STAGE = process.env.HUBSPOT_DEAL_STAGE || process.env.HUBSPOT_DEALSTAGE || '';
const HUBSPOT_ORDER_DEAL_PIPELINE = process.env.HUBSPOT_ORDER_DEAL_PIPELINE || '790272560';
const HUBSPOT_ORDER_DEAL_STAGE = process.env.HUBSPOT_ORDER_DEAL_STAGE || '2688209343';
const HUBSPOT_CIN7_SALE_PROPERTY = process.env.HUBSPOT_CIN7_SALE_PROPERTY || '';
const HUBSPOT_CIN7_ORDER_NAME_PROPERTY = process.env.HUBSPOT_CIN7_ORDER_NAME_PROPERTY || '';
const HUBSPOT_CIN7_ORDER_AMOUNT_PROPERTY = process.env.HUBSPOT_CIN7_ORDER_AMOUNT_PROPERTY || '';
const HUBSPOT_CIN7_SALE_URL_PROPERTY = process.env.HUBSPOT_CIN7_SALE_URL_PROPERTY || '';
const HUBSPOT_LEAD_SOURCE_PROPERTY = process.env.HUBSPOT_LEAD_SOURCE_PROPERTY || 'leads_source';
const HUBSPOT_LEAD_SOURCE_PROPERTY_LABEL = process.env.HUBSPOT_LEAD_SOURCE_PROPERTY_LABEL || 'Leads Source';
const HUBSPOT_LEAD_SOURCE_FALLBACK_OPTIONS = [
  'Email',
  'Ticket',
  'Repeat customer',
  'Referral customer',
  'AKL Homeshow',
  'Waikato Homeshow',
  'Canterbury Homeshow',
  'Fieldays Exhibition'
];
const HUBSPOT_ASSOCIATE_CIN7_ORDER_DEAL = process.env.HUBSPOT_ASSOCIATE_CIN7_ORDER_DEAL !== 'false';
const HUBSPOT_OWNER_BY_REP_JSON = process.env.HUBSPOT_OWNER_BY_REP_JSON || '';
const HUBSPOT_DEFAULT_OWNER_ID = process.env.HUBSPOT_DEFAULT_OWNER_ID || '';
const HUBSPOT_DEFAULT_OWNER_EMAIL = process.env.HUBSPOT_DEFAULT_OWNER_EMAIL || '';
const HUBSPOT_DEFAULT_OWNER_NAME = process.env.HUBSPOT_DEFAULT_OWNER_NAME || '';
const HUBSPOT_CREATE_MISSING_CONTACTS = process.env.HUBSPOT_CREATE_MISSING_CONTACTS === 'true';
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || process.env.HUBSPOT_ACCOUNT_ID || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const HUBSPOT_DEAL_TO_CONTACT_ASSOCIATION_TYPE_ID = Number(
  process.env.HUBSPOT_DEAL_TO_CONTACT_ASSOCIATION_TYPE_ID || 3
);
const HUBSPOT_DEAL_TO_DEAL_ASSOCIATION_TYPE_ID = Number(
  process.env.HUBSPOT_DEAL_TO_DEAL_ASSOCIATION_TYPE_ID || 451
);
const CONTAINER_SHEET_ID = process.env.CONTAINER_SHEET_ID || '1vdNuRxr2nD9IKz923KdJPtNGV3EvLPAsQkhikG5KnpY';
const CONTAINER_SHEET_GID = process.env.CONTAINER_SHEET_GID || '853793483';
const CONTAINER_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${CONTAINER_SHEET_ID}/export?format=csv&gid=${CONTAINER_SHEET_GID}`;
const CONTAINER_SHEET_XLSX_URL = `https://docs.google.com/spreadsheets/d/${CONTAINER_SHEET_ID}/export?format=xlsx`;
const CONTAINER_SHEET_CACHE_MS = 5 * 60 * 1000;
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
const productPageSaleStateCache = new Map();
const addressSuggestionCache = new Map();
const freightQuoteCache = new Map();
const freightQuoteInFlight = new Map();
const FREIGHT_QUOTE_CACHE_MS = 30 * 60 * 1000;
const cin7AvailabilityCache = new Map();
const CIN7_AVAILABILITY_CACHE_MS = 2 * 60 * 1000;
let containerSheetCache = null;
let containerSheetCacheAt = 0;
let activeCheckout = null;
let sharedBrowser = null;
let sharedBrowserPromise = null;
let sharedContext = null;
let sharedPage = null;
let automationQueue = Promise.resolve();
let hubspotLeadSourcePropertyCache = { at: 0, property: null };
let hubspotDealOrderPropertyCache = { loadedAt: 0, names: [] };
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

function isHubSpotConfigured() {
  return Boolean(HUBSPOT_ACCESS_TOKEN && HUBSPOT_DEAL_STAGE);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanTextValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function columnIndex(column) {
  return String(column || '').split('').reduce((index, char) => (
    index * 26 + char.toUpperCase().charCodeAt(0) - 64
  ), 0) - 1;
}

function parseSharedStringsXml(xml) {
  if (!xml) return [];

  return Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map(match => (
    Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))
      .map(textMatch => decodeXmlText(textMatch[1]))
      .join('')
  ));
}

function getZipText(zip, entryName) {
  const entry = zip.getEntry(entryName);
  return entry ? entry.getData().toString('utf8') : '';
}

function parseWorkbookSheets(zip) {
  const workbookXml = getZipText(zip, 'xl/workbook.xml');
  const relsXml = getZipText(zip, 'xl/_rels/workbook.xml.rels');
  const relTargets = {};

  for (const match of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relTargets[match[1]] = match[2].replace(/^\/?xl\//, '');
  }

  return Array.from(workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g))
    .map(match => ({
      name: decodeXmlText(match[1]),
      path: `xl/${relTargets[match[2]] || ''}`.replace(/\/+$/, '')
    }))
    .filter(sheet => sheet.name && sheet.path !== 'xl/');
}

function parseWorksheetRows(xml, sharedStrings) {
  const rows = [];

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];

    for (const cellMatch of rowMatch[1].matchAll(/<c[^>]*r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const index = columnIndex(cellMatch[1]);
      const attrs = cellMatch[2];
      const body = cellMatch[3];
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
      row[index] = attrs.includes('t="s"') ? sharedStrings[Number(rawValue)] || '' : rawValue;
    }

    if (row.some(Boolean)) rows.push(row.map(cleanTextValue));
  }

  return rows;
}

function normaliseHeader(value) {
  return cleanTextValue(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findHeaderIndex(headers, names) {
  const wanted = names.map(normaliseHeader);
  return headers.findIndex(header => wanted.includes(normaliseHeader(header)));
}

function parseContainerDetailRows(sheetName, rows) {
  const headerIndex = rows.findIndex(row => {
    const headers = row.map(normaliseHeader);
    return headers.includes('sku') && headers.includes('title');
  });

  if (headerIndex < 0) return null;

  const headers = rows[headerIndex] || [];
  const skuIndex = findHeaderIndex(headers, ['sku', 'variant sku']);
  const titleIndex = findHeaderIndex(headers, ['title', 'product title']);
  const setIndex = findHeaderIndex(headers, ['set']);
  const cartonsIndex = findHeaderIndex(headers, ['cartons', 'carton']);
  const dimensionIndex = findHeaderIndex(headers, ['dimension', 'dimensions']);
  const totalIndex = findHeaderIndex(headers, ['total']);
  const locationIndex = findHeaderIndex(headers, ['location']);

  const items = rows.slice(headerIndex + 1)
    .map(row => ({
      sku: skuIndex >= 0 ? row[skuIndex] : '',
      title: titleIndex >= 0 ? row[titleIndex] : '',
      set: setIndex >= 0 ? row[setIndex] : '',
      cartons: cartonsIndex >= 0 ? row[cartonsIndex] : '',
      dimension: dimensionIndex >= 0 ? row[dimensionIndex] : '',
      total: totalIndex >= 0 ? row[totalIndex] : '',
      location: locationIndex >= 0 ? row[locationIndex] : ''
    }))
    .filter(item => item.title)
    .slice(0, 80);

  if (!items.length) return null;

  return {
    sourceSheet: sheetName,
    itemCount: items.length,
    items
  };
}

function containerNumberKey(value) {
  const match = cleanTextValue(value).match(/\d+/);
  return match ? String(Number(match[0])) : '';
}

async function getContainerWorkbookDetails() {
  const response = await fetch(CONTAINER_SHEET_XLSX_URL, {
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*' }
  });

  if (!response.ok) {
    throw new Error(`Google Sheet workbook returned ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(buffer);
  const sharedStrings = parseSharedStringsXml(getZipText(zip, 'xl/sharedStrings.xml'));
  const detailsByContainer = {};

  for (const sheet of parseWorkbookSheets(zip)) {
    const key = containerNumberKey(sheet.name);
    if (!key || ['f'].includes(sheet.name.toLowerCase())) continue;

    const rows = parseWorksheetRows(getZipText(zip, sheet.path), sharedStrings);
    const detail = parseContainerDetailRows(sheet.name, rows);
    if (detail) detailsByContainer[key] = detail;
  }

  return detailsByContainer;
}

function normaliseContainerRows(csvText) {
  const rows = parseCsv(csvText)
    .map(row => row.map(cleanTextValue))
    .filter(row => row.some(Boolean));
  const headerIndex = rows.findIndex(row => /^con#$/i.test(row[0] || ''));
  const sourceRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;
  const containers = [];
  let month = '';

  for (const row of sourceRows) {
    const first = cleanTextValue(row[0]);
    const restHasData = row.slice(1).some(Boolean);

    if (/^20\d{2}\s+[A-Za-z]{3,}/.test(first) && !restHasData) {
      month = first;
      continue;
    }

    if (!first || /^etd$/i.test(first)) continue;

    const container = {
      month,
      container: first,
      po: row[1] || '',
      tristarRef: row[2] || '',
      dischargeDate: row[3] || '',
      dispatchToWarehouse: row[4] || '',
      lastFreeDate: row[5] || '',
      dehireDate: row[6] || '',
      volume: row[7] || '',
      products: row[8] || '',
      shipper: row[9] || '',
      categoryManager: row[10] || '',
      status: row[11] || '',
      loadingDate: row[12] || '',
      departure: row[13] || '',
      arrive: row[14] || '',
      preArrivalNotice: row[15] || '',
      productValueRmb: row[16] || '',
      productValueUsd: row[17] || '',
      freightUsd: row[18] || '',
      productValueNzd: row[19] || '',
      importTaxEstimate: row[20] || '',
      actualTax: row[21] || ''
    };

    if (container.container || container.po || container.products) {
      containers.push(container);
    }
  }

  return containers;
}

async function getContainerSheetData() {
  const now = Date.now();
  if (containerSheetCache && now - containerSheetCacheAt < CONTAINER_SHEET_CACHE_MS) {
    return {
      ...containerSheetCache,
      cached: true,
      cacheAgeSeconds: Math.round((now - containerSheetCacheAt) / 1000)
    };
  }

  const response = await fetch(CONTAINER_SHEET_CSV_URL, {
    headers: { Accept: 'text/csv,*/*' }
  });

  if (!response.ok) {
    throw new Error(`Google Sheet returned ${response.status}`);
  }

  const csvText = await response.text();
  const containers = normaliseContainerRows(csvText);
  let detailsByContainer = {};

  try {
    detailsByContainer = await getContainerWorkbookDetails();
  } catch (error) {
    console.error('Container workbook details fetch failed:', error.message);
  }

  for (const container of containers) {
    const key = containerNumberKey(container.container);
    if (key && detailsByContainer[key]) {
      container.contents = detailsByContainer[key];
    }
  }

  containerSheetCache = {
    ok: true,
    source: 'google-sheet',
    sheetId: CONTAINER_SHEET_ID,
    gid: CONTAINER_SHEET_GID,
    updatedAt: new Date().toISOString(),
    count: containers.length,
    containers
  };
  containerSheetCacheAt = now;

  return {
    ...containerSheetCache,
    cached: false,
    cacheAgeSeconds: 0
  };
}

function parseMoneyValue(value) {
  const match = cleanTextValue(value).replace(/,/g, '').match(/-?\d+(?:\.\d{1,2})?/);
  if (!match) return '';
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount.toFixed(2) : '';
}

function splitContactName(customerName) {
  const parts = cleanTextValue(customerName).split(' ').filter(Boolean);
  if (!parts.length) return { firstname: '', lastname: '' };
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return {
    firstname: parts.slice(0, -1).join(' '),
    lastname: parts.at(-1)
  };
}

function phoneDigits(value) {
  return cleanTextValue(value).replace(/\D+/g, '');
}

function cleanHubSpotProperties(properties) {
  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, value]) => [key, cleanTextValue(value)])
      .filter(([, value]) => value)
  );
}

function hubspotDealUrl(dealId) {
  const id = cleanTextValue(dealId);
  if (!id || !HUBSPOT_PORTAL_ID) return '';
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/deal/${id}`;
}

function normaliseOwnerMapKey(value) {
  return cleanTextValue(value).toLowerCase();
}

function getSalesRepMatchKeys(sale) {
  const rawReps = [
    sale.salesRep,
    sale.placedBy,
    sale.rep
  ].map(cleanTextValue).filter(Boolean);

  const keys = [];
  for (const rep of rawReps) {
    keys.push(rep);
    const branchless = rep.split(/[-–—]/).slice(1).join('-').trim();
    if (branchless) keys.push(branchless);
  }

  return Array.from(new Set(keys.map(normaliseOwnerMapKey).filter(Boolean)));
}

function looksLikeHubSpotOwnerId(value) {
  return /^\d+$/.test(cleanTextValue(value));
}

function getHubSpotOwnerByRepMap() {
  if (!HUBSPOT_OWNER_BY_REP_JSON) return {};
  try {
    const rawMap = JSON.parse(HUBSPOT_OWNER_BY_REP_JSON);
    return Object.fromEntries(
      Object.entries(rawMap || {}).map(([key, value]) => [normaliseOwnerMapKey(key), cleanTextValue(value)])
    );
  } catch (error) {
    console.error('Invalid HUBSPOT_OWNER_BY_REP_JSON:', error.message);
    return {};
  }
}

function getMappedHubSpotOwnerIdForSale(sale) {
  const explicitOwnerId = cleanTextValue(sale.hubspotOwnerId || sale.ownerId);
  if (looksLikeHubSpotOwnerId(explicitOwnerId)) return explicitOwnerId;

  const ownerByRep = getHubSpotOwnerByRepMap();
  const repCandidates = getSalesRepMatchKeys(sale);

  for (const rep of repCandidates) {
    const ownerId = cleanTextValue(ownerByRep[rep]);
    if (looksLikeHubSpotOwnerId(ownerId)) return ownerId;
  }

  const defaultOwnerId = cleanTextValue(HUBSPOT_DEFAULT_OWNER_ID);
  return looksLikeHubSpotOwnerId(defaultOwnerId) ? defaultOwnerId : '';
}

function getMappedHubSpotOwnerMatchValuesForSale(sale) {
  const ownerByRep = getHubSpotOwnerByRepMap();
  const repCandidates = getSalesRepMatchKeys(sale);

  return repCandidates
    .map(rep => cleanTextValue(ownerByRep[rep]))
    .filter(value => value && !looksLikeHubSpotOwnerId(value));
}

function normaliseOwnerName(owner) {
  return cleanTextValue([owner.firstName, owner.lastName].filter(Boolean).join(' ')).toLowerCase();
}

function getOwnerMatchValues(owner) {
  return [
    owner.email,
    normaliseOwnerName(owner)
  ].map(normaliseOwnerMapKey).filter(Boolean);
}

function findOwnerIdByValues(owners, candidates) {
  const normalisedCandidates = candidates.map(normaliseOwnerMapKey).filter(Boolean);
  if (!normalisedCandidates.length) return '';

  for (const owner of owners) {
    const ownerId = cleanTextValue(owner.id);
    if (!ownerId || owner.archived) continue;

    const ownerValues = getOwnerMatchValues(owner);
    if (normalisedCandidates.some(candidate => ownerValues.some(ownerValue =>
      ownerValue === candidate || ownerValue.includes(candidate) || candidate.includes(ownerValue)
    ))) {
      return ownerId;
    }
  }

  return '';
}

async function getHubSpotOwners() {
  const owners = [];
  let after = '';

  do {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('after', after);
    const payload = await hubspotRequest(`/crm/v3/owners/?${query.toString()}`);
    owners.push(...(Array.isArray(payload.results) ? payload.results : []));
    after = cleanTextValue(payload.paging?.next?.after);
  } while (after);

  return owners;
}

async function getHubSpotOwnerIdForSale(sale) {
  const mappedOwnerId = getMappedHubSpotOwnerIdForSale(sale);
  if (mappedOwnerId) return mappedOwnerId;

  const repCandidates = getSalesRepMatchKeys(sale);
  const mappedOwnerCandidates = getMappedHubSpotOwnerMatchValuesForSale(sale);

  const defaultCandidates = [
    HUBSPOT_DEFAULT_OWNER_EMAIL,
    HUBSPOT_DEFAULT_OWNER_NAME
  ].map(normaliseOwnerMapKey).filter(Boolean);

  if (!repCandidates.length && !mappedOwnerCandidates.length && !defaultCandidates.length) return '';

  try {
    const owners = await getHubSpotOwners();
    return findOwnerIdByValues(owners, repCandidates) ||
      findOwnerIdByValues(owners, mappedOwnerCandidates) ||
      findOwnerIdByValues(owners, defaultCandidates);
  } catch (error) {
    console.error('HubSpot owner lookup failed:', error.message);
  }

  return '';
}

function normaliseHubSpotPropertyLabel(value) {
  return cleanTextValue(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isHubSpotLeadSourcePropertyCandidate(property) {
  if (!property || property.archived) return false;
  const name = cleanTextValue(property.name).toLowerCase();
  const label = normaliseHubSpotPropertyLabel(property.label);
  const configuredLabel = normaliseHubSpotPropertyLabel(HUBSPOT_LEAD_SOURCE_PROPERTY_LABEL);
  return label === configuredLabel ||
    label === 'leads source' ||
    label === 'lead source' ||
    name === 'leads_source' ||
    name === 'leadssource' ||
    name === 'lead_source' ||
    name === 'leadsource' ||
    name === 'deal_source';
}

async function listHubSpotDealProperties() {
  const payload = await hubspotRequest('/crm/v3/properties/deals');
  return Array.isArray(payload.results) ? payload.results : [];
}

async function resolveHubSpotLeadSourceProperty() {
  const cacheAge = Date.now() - hubspotLeadSourcePropertyCache.at;
  if (hubspotLeadSourcePropertyCache.property && cacheAge < 10 * 60 * 1000) {
    return hubspotLeadSourcePropertyCache.property;
  }

  let property = null;
  if (HUBSPOT_LEAD_SOURCE_PROPERTY) {
    property = await hubspotRequest(`/crm/v3/properties/deals/${encodeURIComponent(HUBSPOT_LEAD_SOURCE_PROPERTY)}`);
  } else {
    const properties = await listHubSpotDealProperties();
    property = properties.find(isHubSpotLeadSourcePropertyCandidate) || null;
  }

  if (!property?.name) {
    throw new Error('HubSpot lead source property was not found. Set HUBSPOT_LEAD_SOURCE_PROPERTY to the internal deal property name.');
  }

  hubspotLeadSourcePropertyCache = { at: Date.now(), property };
  return property;
}

async function getHubSpotLeadSourceOptions() {
  let property = null;
  try {
    property = await resolveHubSpotLeadSourceProperty();
  } catch (error) {
    console.error('HubSpot lead source property lookup failed; using configured fallback options:', error.message);
    return {
      propertyName: HUBSPOT_LEAD_SOURCE_PROPERTY,
      label: HUBSPOT_LEAD_SOURCE_PROPERTY_LABEL,
      options: HUBSPOT_LEAD_SOURCE_FALLBACK_OPTIONS.map(option => ({ label: option, value: option })),
      fallback: true
    };
  }

  const options = Array.isArray(property.options)
    ? property.options
      .filter(option => !option.hidden && cleanTextValue(option.value))
      .map(option => ({
        label: cleanTextValue(option.label) || cleanTextValue(option.value),
        value: cleanTextValue(option.value)
      }))
    : [];

  if (!options.length) {
    console.error(`HubSpot property "${property.label || property.name}" has no readable options; using configured fallback options.`);
    return {
      propertyName: property.name,
      label: property.label || property.name,
      options: HUBSPOT_LEAD_SOURCE_FALLBACK_OPTIONS.map(option => ({ label: option, value: option })),
      fallback: true
    };
  }

  return {
    propertyName: property.name,
    label: property.label || property.name,
    options
  };
}

async function buildHubSpotLeadSourceProperties(sale) {
  const selectedValue = cleanTextValue(sale.leadSource || sale.hubspotLeadSource);
  if (!selectedValue) return {};

  const { propertyName, options } = await getHubSpotLeadSourceOptions();
  const matchingOption = options.find(option => option.value === selectedValue || option.label === selectedValue);
  if (!matchingOption) {
    throw new Error('Selected lead source is not a valid HubSpot option.');
  }

  return { [propertyName]: matchingOption.value };
}

function buildHubSpotDealNames(sale) {
  const saleNumber = cleanTextValue(sale.orderId || sale.saleNumber || sale.reference);
  const customerName = cleanTextValue(sale.customerName);
  const phone = cleanTextValue(sale.phone);
  const dateFallback = new Date().toISOString().slice(0, 10);
  const baseName = [saleNumber, customerName, phone].filter(Boolean).join(' - ') ||
    customerName ||
    saleNumber ||
    dateFallback;
  const dealName = cleanTextValue(sale.dealName) || baseName || 'Cin7 Sale';
  const legacyName = saleNumber || customerName
    ? `Cin7 Sale ${saleNumber || dateFallback} - ${customerName || 'Cin7 customer'}`
    : dealName;
  const recentName = [saleNumber || dateFallback, customerName].filter(Boolean).join(' - ');

  return {
    dealName,
    legacyName,
    recentName,
    saleNumber,
    customerName
  };
}

async function hubspotRequest(pathname, options = {}) {
  if (!HUBSPOT_ACCESS_TOKEN) {
    throw new Error('HubSpot access token is not configured.');
  }

  const response = await fetch(`${HUBSPOT_API_BASE_URL.replace(/\/$/, '')}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout || 20000)
  });

  const raw = await response.text().catch(() => '');
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const message = payload.message || payload.error || raw || response.statusText;
    throw new Error(`HubSpot request failed (${response.status}): ${message}`);
  }

  return payload;
}

async function searchHubSpotObject(objectType, filters, properties = []) {
  const payload = await hubspotRequest(`/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    body: {
      filterGroups: [{ filters }],
      properties,
      limit: 1
    }
  });
  return Array.isArray(payload.results) && payload.results.length ? payload.results[0] : null;
}

async function searchHubSpotObjectsByFilterGroups(objectType, filterGroups, properties = [], limit = 10) {
  const payload = await hubspotRequest(`/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    body: {
      filterGroups,
      properties,
      limit
    }
  });
  return Array.isArray(payload.results) ? payload.results : [];
}

async function searchHubSpotObjectsByQuery(objectType, query, properties = []) {
  const cleanQuery = cleanTextValue(query);
  if (!cleanQuery) return [];

  const payload = await hubspotRequest(`/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    body: {
      query: cleanQuery,
      properties,
      limit: 10
    }
  });
  return Array.isArray(payload.results) ? payload.results : [];
}

function scoreHubSpotContactMatch(contact, sale) {
  const properties = contact?.properties || {};
  const saleEmail = cleanTextValue(sale.email).toLowerCase();
  const salePhone = phoneDigits(sale.phone);
  const saleName = normaliseOwnerMapKey(sale.customerName);
  const contactEmail = cleanTextValue(properties.email).toLowerCase();
  const contactPhone = phoneDigits(properties.phone || properties.mobilephone);
  const contactName = normaliseOwnerMapKey([properties.firstname, properties.lastname].filter(Boolean).join(' '));

  let score = 0;
  if (saleEmail && contactEmail && saleEmail === contactEmail) score += 100;
  if (salePhone && contactPhone && (salePhone === contactPhone || contactPhone.endsWith(salePhone) || salePhone.endsWith(contactPhone))) score += 70;
  if (saleName && contactName && (saleName === contactName || contactName.includes(saleName) || saleName.includes(contactName))) score += 40;
  return score;
}

async function findExistingHubSpotContact(sale) {
  const properties = ['email', 'firstname', 'lastname', 'phone', 'mobilephone'];
  const email = cleanTextValue(sale.email).toLowerCase();
  if (email) {
    const existing = await searchHubSpotObject('contacts', [
      { propertyName: 'email', operator: 'EQ', value: email }
    ], properties);
    if (existing?.id) return existing;
  }

  const queries = [
    sale.email,
    sale.phone,
    phoneDigits(sale.phone),
    sale.customerName
  ].map(cleanTextValue).filter(Boolean);

  const candidates = [];
  const seen = new Set();
  for (const query of Array.from(new Set(queries))) {
    const results = await searchHubSpotObjectsByQuery('contacts', query, properties).catch(error => {
      console.error(`HubSpot contact query failed for "${query}":`, error.message);
      return [];
    });
    for (const contact of results) {
      if (!contact?.id || seen.has(contact.id)) continue;
      seen.add(contact.id);
      candidates.push(contact);
    }
  }

  const bestMatch = candidates
    .map(contact => ({ contact, score: scoreHubSpotContactMatch(contact, sale) }))
    .sort((left, right) => right.score - left.score)[0];
  return bestMatch?.score > 0 ? bestMatch.contact : null;
}

async function findOrCreateHubSpotContact(sale) {
  const existing = await findExistingHubSpotContact(sale);
  if (existing?.id) return { contact: existing, created: false };

  if (!HUBSPOT_CREATE_MISSING_CONTACTS) {
    return { contact: null, created: false };
  }

  const name = splitContactName(sale.customerName);
  const properties = cleanHubSpotProperties({
    email,
    firstname: name.firstname,
    lastname: name.lastname,
    phone: sale.phone,
    address: sale.address
  });

  if (!properties.email && !properties.firstname && !properties.lastname && !properties.phone) {
    return { contact: null, created: false };
  }

  const contact = await hubspotRequest('/crm/v3/objects/contacts', {
    method: 'POST',
    body: { properties }
  });
  return { contact, created: true };
}

async function findExistingHubSpotDeal(dealNames, saleNumber) {
  const saleId = cleanTextValue(saleNumber);
  if (HUBSPOT_CIN7_SALE_PROPERTY && saleId) {
    const saleSearchValues = Array.from(new Set([saleId, `${saleId} (DEAR)`].map(cleanTextValue)));
    for (const value of saleSearchValues) {
      const existingBySaleId = await searchHubSpotObject('deals', [
        { propertyName: HUBSPOT_CIN7_SALE_PROPERTY, operator: 'EQ', value }
      ], ['dealname', 'amount', HUBSPOT_CIN7_SALE_PROPERTY]).catch(error => {
        console.error(`HubSpot deal search by ${HUBSPOT_CIN7_SALE_PROPERTY} failed:`, error.message);
        return null;
      });
      if (existingBySaleId?.id) return existingBySaleId;
    }
  }

  for (const dealName of Array.from(new Set(dealNames.map(cleanTextValue).filter(Boolean)))) {
    const existingByName = await searchHubSpotObject('deals', [
      { propertyName: 'dealname', operator: 'EQ', value: dealName }
    ], ['dealname', 'amount']);
    if (existingByName?.id) return existingByName;
  }

  return null;
}

async function findHubSpotDealByName(dealName, properties = []) {
  const name = cleanTextValue(dealName);
  if (!name) return null;

  return searchHubSpotObject('deals', [
    { propertyName: 'dealname', operator: 'EQ', value: name }
  ], ['dealname', 'amount', ...properties]);
}

async function getHubSpotDealOrderPropertyNames() {
  const now = Date.now();
  if (hubspotDealOrderPropertyCache.names.length && now - hubspotDealOrderPropertyCache.loadedAt < 10 * 60 * 1000) {
    return hubspotDealOrderPropertyCache.names;
  }

  const configuredNames = [
    HUBSPOT_CIN7_SALE_PROPERTY,
    HUBSPOT_CIN7_ORDER_NAME_PROPERTY
  ].map(cleanTextValue).filter(Boolean);

  const likelyNames = [
    'copy_order_deal_name',
    'dear_sale_id',
    'cin7_sale_number',
    'cin7_order_name',
    'cin7_order_number',
    'cin7_inv_paid',
    'cin7_so_status',
    'cin7_sale_id',
    'cin7_sale_order',
    'dear_order_number',
    'dear_sale_number',
    'order_number',
    'order_name',
    'sale_number',
    'reference'
  ].map(cleanTextValue).filter(Boolean);

  try {
    const payload = await hubspotRequest('/crm/v3/properties/deals?archived=false');
    const propertyNames = new Set((Array.isArray(payload.results) ? payload.results : [])
      .map((property) => cleanTextValue(property.name))
      .filter(Boolean));
    const discovered = (Array.isArray(payload.results) ? payload.results : [])
      .filter((property) => {
        const haystack = `${property.name || ''} ${property.label || ''} ${property.description || ''}`.toLowerCase();
        return /cin7|dear|order|sale|invoice|quote|reference/.test(haystack);
      })
      .map((property) => cleanTextValue(property.name))
      .filter(Boolean);

    hubspotDealOrderPropertyCache = {
      loadedAt: now,
      names: Array.from(new Set([
        ...configuredNames.filter((name) => propertyNames.has(name)),
        ...likelyNames.filter((name) => propertyNames.has(name)),
        ...discovered
      ]))
    };
  } catch (error) {
    console.error('HubSpot deal property discovery failed:', error.message);
    hubspotDealOrderPropertyCache = {
      loadedAt: now,
      names: Array.from(new Set(configuredNames))
    };
  }

  return hubspotDealOrderPropertyCache.names;
}

function hubSpotDealContainsSaleId(deal, saleId) {
  const wanted = cleanTextValue(saleId).toUpperCase();
  if (!wanted || !deal?.properties) return false;
  return Object.values(deal.properties).some((value) => cleanTextValue(value).toUpperCase().includes(wanted));
}

function pickHubSpotOrderDealCandidate(deals, saleId, excludeDealId = '') {
  const excludedId = cleanTextValue(excludeDealId);
  const candidates = (Array.isArray(deals) ? deals : [])
    .filter((deal) => cleanTextValue(deal?.id) !== excludedId)
    .filter((deal) => hubSpotDealContainsSaleId(deal, saleId));
  const orderDealCandidates = candidates.filter((deal) =>
    /\(DEAR\)/i.test(cleanTextValue(deal.properties?.dealname)) ||
    (HUBSPOT_ORDER_DEAL_PIPELINE && cleanTextValue(deal.properties?.pipeline) === HUBSPOT_ORDER_DEAL_PIPELINE)
  );

  return orderDealCandidates.find((deal) => /\(DEAR\)/i.test(cleanTextValue(deal.properties?.dealname)))
    || orderDealCandidates[0]
    || null;
}

async function findHubSpotDealByOrderNumber(saleNumber, properties = [], options = {}) {
  const saleId = cleanTextValue(saleNumber).toUpperCase();
  if (!saleId) return null;

  const customerName = cleanTextValue(options.customerName);
  const excludeDealId = cleanTextValue(options.excludeDealId);
  const propertyNames = await getHubSpotDealOrderPropertyNames();
  const searchValues = Array.from(new Set([saleId, `${saleId} (DEAR)`]));
  const returnProperties = Array.from(new Set(['dealname', 'amount', 'pipeline', 'dealstage', ...propertyNames, ...properties]));
  const priorityProperties = propertyNames.slice(0, 12);

  for (let index = 0; index < priorityProperties.length; index += 5) {
    const chunk = priorityProperties.slice(index, index + 5);
    const filterGroups = chunk.map((propertyName) => ({
      filters: [{ propertyName, operator: 'CONTAINS_TOKEN', value: saleId }]
    }));
    const matches = await searchHubSpotObjectsByFilterGroups('deals', filterGroups, returnProperties, 10).catch((error) => {
      console.error(`HubSpot order deal token search failed for ${chunk.join(', ')}:`, error.message);
      return [];
    });
    const tokenMatch = pickHubSpotOrderDealCandidate(matches, saleId, excludeDealId);
    if (tokenMatch?.id) return tokenMatch;
  }

  for (let index = 0; index < priorityProperties.length; index += 2) {
    const chunk = priorityProperties.slice(index, index + 2);
    const filterGroups = [];
    for (const propertyName of chunk) {
      for (const value of searchValues) {
        filterGroups.push({
          filters: [{ propertyName, operator: 'EQ', value }]
        });
      }
    }
    const matches = await searchHubSpotObjectsByFilterGroups('deals', filterGroups, returnProperties, 10).catch((error) => {
      console.error(`HubSpot order deal exact search failed for ${chunk.join(', ')}:`, error.message);
      return [];
    });
    const exactMatch = pickHubSpotOrderDealCandidate(matches, saleId, excludeDealId);
    if (exactMatch?.id) return exactMatch;
  }

  const queriedDeals = await searchHubSpotObjectsByQuery('deals', saleId, returnProperties).catch((error) => {
    console.error('HubSpot order deal query search failed:', error.message);
    return [];
  });
  const orderQueryMatch = pickHubSpotOrderDealCandidate(queriedDeals, saleId, excludeDealId);
  if (orderQueryMatch?.id) return orderQueryMatch;

  if (customerName) {
    const customerDeals = await searchHubSpotObjectsByQuery('deals', customerName, returnProperties).catch((error) => {
      console.error('HubSpot order deal customer query failed:', error.message);
      return [];
    });
    const customerMatch = pickHubSpotOrderDealCandidate(customerDeals, saleId, excludeDealId);
    if (customerMatch?.id) return customerMatch;
  }

  return null;
}

function getCin7OrderDealName(saleNumber) {
  const saleId = cleanTextValue(saleNumber);
  return saleId ? `${saleId} (DEAR)` : '';
}

async function getHubSpotOrderDealNameProperty() {
  const propertyNames = await getHubSpotDealOrderPropertyNames();
  return [
    HUBSPOT_CIN7_ORDER_NAME_PROPERTY,
    HUBSPOT_CIN7_SALE_PROPERTY,
    'copy_order_deal_name'
  ].map(cleanTextValue).find((name) => name && propertyNames.includes(name));
}

async function buildHubSpotPendingOrderLinkProperties(saleNumber) {
  const orderDealName = getCin7OrderDealName(saleNumber);
  if (!orderDealName) return {};

  const orderNameProperty = await getHubSpotOrderDealNameProperty();
  return orderNameProperty ? { [orderNameProperty]: orderDealName } : {};
}

async function buildHubSpotOrderDealProperties(saleNumber, sale = {}) {
  const orderDealName = getCin7OrderDealName(saleNumber);
  if (!orderDealName) return {};

  const propertyNames = await getHubSpotDealOrderPropertyNames();
  const properties = {};
  Object.assign(properties, await buildHubSpotLeadSourceProperties(sale));
  const orderNameProperty = await getHubSpotOrderDealNameProperty();
  if (orderNameProperty) properties[orderNameProperty] = orderDealName;

  const amount = parseMoneyValue(sale.amount || sale.total);
  const amountProperty = [
    HUBSPOT_CIN7_ORDER_AMOUNT_PROPERTY,
    'cin7_order_amount'
  ].map(cleanTextValue).find((name) => name && propertyNames.includes(name));
  if (amountProperty && amount) properties[amountProperty] = amount;

  return properties;
}

async function updateHubSpotCin7OrderDealDetails(orderDealId, saleNumber, sale = {}) {
  const properties = await buildHubSpotOrderDealProperties(saleNumber, sale).catch((error) => {
    console.error('HubSpot order deal property build failed:', error.message);
    return {};
  });
  return updateHubSpotDealProperties(orderDealId, properties).catch((error) => {
    console.error('HubSpot order deal property update failed:', error.message);
    return null;
  });
}

async function createHubSpotDeal(sale, contactId) {
  const { saleNumber, dealName } = buildHubSpotDealNames(sale);
  const amount = parseMoneyValue(sale.amount || sale.total);
  const ownerId = await getHubSpotOwnerIdForSale(sale);
  const leadSourceProperties = await buildHubSpotLeadSourceProperties(sale);
  const pendingOrderLinkProperties = await buildHubSpotPendingOrderLinkProperties(saleNumber);

  const properties = cleanHubSpotProperties({
    dealname: dealName,
    dealstage: HUBSPOT_DEAL_STAGE,
    pipeline: HUBSPOT_DEAL_PIPELINE,
    amount,
    hubspot_owner_id: ownerId
  });
  Object.assign(properties, leadSourceProperties);
  Object.assign(properties, pendingOrderLinkProperties);

  if (HUBSPOT_CIN7_SALE_PROPERTY && saleNumber) {
    properties[HUBSPOT_CIN7_SALE_PROPERTY] = HUBSPOT_CIN7_SALE_PROPERTY === HUBSPOT_CIN7_ORDER_NAME_PROPERTY
      ? `${saleNumber} (DEAR)`
      : saleNumber;
  }
  if (HUBSPOT_CIN7_ORDER_NAME_PROPERTY && saleNumber) {
    properties[HUBSPOT_CIN7_ORDER_NAME_PROPERTY] = `${saleNumber} (DEAR)`;
  }
  if (HUBSPOT_CIN7_ORDER_AMOUNT_PROPERTY && amount) {
    properties[HUBSPOT_CIN7_ORDER_AMOUNT_PROPERTY] = amount;
  }
  if (HUBSPOT_CIN7_SALE_URL_PROPERTY && sale.sourceUrl) {
    properties[HUBSPOT_CIN7_SALE_URL_PROPERTY] = sale.sourceUrl;
  }

  const associations = contactId ? [{
    to: { id: String(contactId) },
    types: [{
      associationCategory: 'HUBSPOT_DEFINED',
      associationTypeId: HUBSPOT_DEAL_TO_CONTACT_ASSOCIATION_TYPE_ID
    }]
  }] : [];

  const deal = await hubspotRequest('/crm/v3/objects/deals', {
    method: 'POST',
    body: {
      properties,
      ...(associations.length ? { associations } : {})
    }
  });

  return { deal, dealName, saleNumber };
}

async function updateHubSpotDealProperties(dealId, properties) {
  const cleanedProperties = cleanHubSpotProperties(properties);
  if (!cleanTextValue(dealId) || !Object.keys(cleanedProperties).length) return null;

  return hubspotRequest(`/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    body: { properties: cleanedProperties }
  });
}

async function associateHubSpotDealToContact(dealId, contactId) {
  if (!cleanTextValue(dealId) || !cleanTextValue(contactId)) return false;
  try {
    await hubspotRequest(`/crm/v4/objects/contacts/${contactId}/associations/default/deals/${dealId}`, {
      method: 'PUT'
    });
    return true;
  } catch (error) {
    console.error('HubSpot default contact-deal association failed; trying v3 association:', error.message);
  }

  await hubspotRequest(`/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/${HUBSPOT_DEAL_TO_CONTACT_ASSOCIATION_TYPE_ID}`, {
    method: 'PUT'
  });
  return true;
}

async function getAssociatedHubSpotDealIds(dealId) {
  const id = cleanTextValue(dealId);
  if (!id) return [];

  const associatedDealIds = [];
  let after = '';
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('after', after);
    const payload = await hubspotRequest(`/crm/v4/objects/deals/${id}/associations/deals?${query.toString()}`);
    for (const result of Array.isArray(payload.results) ? payload.results : []) {
      const associatedId = cleanTextValue(result.toObjectId || result.id);
      if (associatedId) associatedDealIds.push(associatedId);
    }
    after = cleanTextValue(payload.paging?.next?.after);
  } while (after);

  return Array.from(new Set(associatedDealIds));
}

async function associateHubSpotDealToDeal(fromDealId, toDealId) {
  const fromId = cleanTextValue(fromDealId);
  const toId = cleanTextValue(toDealId);
  if (!fromId || !toId || fromId === toId) return false;

  try {
    await hubspotRequest(`/crm/v4/objects/deal/${fromId}/associations/deal/${toId}`, {
      method: 'PUT',
      body: [{
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: HUBSPOT_DEAL_TO_DEAL_ASSOCIATION_TYPE_ID
      }]
    });
    return true;
  } catch (error) {
    console.error('HubSpot v4 deal-deal association failed; trying v3 association:', error.message);
  }

  await hubspotRequest(`/crm/v3/objects/deals/${fromId}/associations/deals/${toId}/${HUBSPOT_DEAL_TO_DEAL_ASSOCIATION_TYPE_ID}`, {
    method: 'PUT'
  });
  return true;
}

async function associateCin7OrderDealIfAvailable(customerDealId, saleNumber, sale = {}) {
  if (!HUBSPOT_ASSOCIATE_CIN7_ORDER_DEAL) {
    return { associated: false, skipped: true, reason: 'disabled' };
  }

  const dealId = cleanTextValue(customerDealId);
  const orderDealName = getCin7OrderDealName(saleNumber);
  if (!dealId || !orderDealName) {
    return { associated: false, skipped: true, reason: 'missing_order_number' };
  }

  let orderDeal = await findHubSpotDealByName(orderDealName, ['amount'])
    || await findHubSpotDealByOrderNumber(saleNumber, ['amount'], {
      customerName: sale.customerName,
      excludeDealId: dealId
    });
  if (!orderDeal?.id) {
    const pendingProperties = await buildHubSpotPendingOrderLinkProperties(saleNumber).catch(() => ({}));
    await updateHubSpotDealProperties(dealId, pendingProperties).catch((error) => {
      console.error('HubSpot pending order link marker update failed:', error.message);
      return null;
    });
    const searchedProperties = await getHubSpotDealOrderPropertyNames().catch(() => []);
    return {
      associated: false,
      skipped: true,
      pending: true,
      reason: 'order_deal_pending',
      orderDealName,
      searchedProperties: searchedProperties.slice(0, 20)
    };
  }
  const orderDealAmount = parseMoneyValue(orderDeal.properties?.amount);
  if (String(orderDeal.id) === String(dealId)) {
    return { associated: false, skipped: true, reason: 'same_deal', orderDealId: orderDeal.id, orderDealName, orderDealAmount };
  }

  await updateHubSpotCin7OrderDealDetails(orderDeal.id, saleNumber, sale);
  const orderDealLineItems = await createHubSpotLineItemsForDeal(orderDeal.id, sale.lineItems).catch((error) => {
    console.error('HubSpot order deal line item creation failed:', error.message);
    return { created: 0, skipped: 0, errors: [error.message] };
  });

  const customerAssociatedDealIds = await getAssociatedHubSpotDealIds(dealId);
  const orderAssociatedDealIds = await getAssociatedHubSpotDealIds(orderDeal.id);
  const customerToOrderLinked = customerAssociatedDealIds.includes(String(orderDeal.id));
  const orderToCustomerLinked = orderAssociatedDealIds.includes(String(dealId));

  let customerToOrderAssociated = false;
  let orderToCustomerAssociated = false;

  if (!customerToOrderLinked) {
    customerToOrderAssociated = await associateHubSpotDealToDeal(dealId, orderDeal.id);
  }

  if (!orderToCustomerLinked) {
    orderToCustomerAssociated = await associateHubSpotDealToDeal(orderDeal.id, dealId);
  }

  const alreadyAssociated = customerToOrderLinked && orderToCustomerLinked;

  return {
    associated: true,
    skipped: alreadyAssociated,
    reason: alreadyAssociated ? 'already_associated' : '',
    orderDealId: orderDeal.id,
    orderDealName,
    orderDealAmount,
    orderDealCreated: false,
    orderDealLineItems,
    customerToOrderAssociated: customerToOrderLinked || customerToOrderAssociated,
    orderToCustomerAssociated: orderToCustomerLinked || orderToCustomerAssociated
  };
}

function extractSaleNumberFromOrderDealName(value) {
  const match = cleanTextValue(value).match(/\bNZSO-\d+\b/i);
  return match ? match[0].toUpperCase() : '';
}

function isAuthorizedCronRequest(req) {
  if (!CRON_SECRET) return true;
  const headerValue = cleanTextValue(req.headers.authorization);
  const bearerToken = headerValue.replace(/^Bearer\s+/i, '');
  const querySecret = cleanTextValue(req.query?.secret);
  const headerSecret = cleanTextValue(req.headers['x-cron-secret']);
  return bearerToken === CRON_SECRET || querySecret === CRON_SECRET || headerSecret === CRON_SECRET;
}

async function findPendingHubSpotOrderLinks(limit = 100) {
  const orderNameProperty = await getHubSpotOrderDealNameProperty();
  if (!orderNameProperty) {
    return { orderNameProperty: '', deals: [] };
  }

  const filters = [
    { propertyName: orderNameProperty, operator: 'HAS_PROPERTY' }
  ];
  if (HUBSPOT_DEAL_PIPELINE) {
    filters.push({ propertyName: 'pipeline', operator: 'EQ', value: HUBSPOT_DEAL_PIPELINE });
  }

  const payload = await hubspotRequest('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: {
      filterGroups: [{ filters }],
      properties: ['dealname', 'amount', 'pipeline', 'dealstage', 'leads_source', orderNameProperty],
      limit
    }
  });

  return {
    orderNameProperty,
    deals: Array.isArray(payload.results) ? payload.results : []
  };
}

async function linkPendingHubSpotOrderDeals({ limit = 100 } = {}) {
  const { orderNameProperty, deals } = await findPendingHubSpotOrderLinks(limit);
  const results = [];

  for (const deal of deals) {
    const saleNumber = extractSaleNumberFromOrderDealName(deal.properties?.[orderNameProperty]) ||
      extractSaleNumberFromOrderDealName(deal.properties?.dealname);
    if (!saleNumber) {
      results.push({ dealId: deal.id, associated: false, skipped: true, reason: 'missing_order_number' });
      continue;
    }

    const existingAssociatedDealIds = await getAssociatedHubSpotDealIds(deal.id).catch(() => []);
    const alreadyLinked = Boolean(existingAssociatedDealIds.length);
    if (alreadyLinked) {
      results.push({ dealId: deal.id, saleNumber, associated: false, skipped: true, reason: 'already_has_deal_association' });
      continue;
    }

    const association = await associateCin7OrderDealIfAvailable(deal.id, saleNumber, {
      amount: deal.properties?.amount,
      total: deal.properties?.amount,
      leadSource: deal.properties?.leads_source
    }).catch((error) => ({
      associated: false,
      skipped: false,
      reason: 'error',
      error: error.message
    }));

    results.push({
      dealId: deal.id,
      dealName: deal.properties?.dealname || '',
      saleNumber,
      ...association
    });
  }

  return {
    checked: deals.length,
    linked: results.filter((result) => result.associated && !result.skipped).length,
    alreadyLinked: results.filter((result) => result.reason === 'already_has_deal_association' || result.reason === 'already_associated').length,
    pending: results.filter((result) => result.reason === 'order_deal_pending').length,
    results
  };
}

function normaliseHubSpotLineItem(item) {
  const name = cleanTextValue(item?.name || item?.description || item?.product);
  if (!name) return null;
  const quantity = Number(cleanTextValue(item?.quantity || item?.qty || 1).replace(/,/g, ''));
  const price = parseMoneyValue(item?.price || item?.unitPrice || item?.total);
  const total = parseMoneyValue(item?.total || item?.amount);
  return {
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    price: price || (total && quantity ? total / quantity : 0),
    sku: cleanTextValue(item?.sku)
  };
}

async function getAssociatedHubSpotLineItems(dealId) {
  const id = cleanTextValue(dealId);
  if (!id) return [];

  const query = new URLSearchParams({ limit: '100' });
  const payload = await hubspotRequest(`/crm/v4/objects/deals/${id}/associations/line_items?${query.toString()}`);
  const ids = (Array.isArray(payload.results) ? payload.results : [])
    .map(result => cleanTextValue(result.toObjectId || result.id))
    .filter(Boolean);
  if (!ids.length) return [];

  const batch = await hubspotRequest('/crm/v3/objects/line_items/batch/read', {
    method: 'POST',
    body: {
      properties: ['name', 'quantity', 'price', 'hs_sku'],
      inputs: ids.map(lineItemId => ({ id: lineItemId }))
    }
  });
  return Array.isArray(batch.results) ? batch.results : [];
}

function hubSpotLineItemKeyFromProperties(properties) {
  return [
    cleanTextValue(properties?.hs_sku).toLowerCase(),
    cleanTextValue(properties?.name).toLowerCase()
  ].filter(Boolean).join('|');
}

function hubSpotLineItemKey(item) {
  return [
    cleanTextValue(item?.sku).toLowerCase(),
    cleanTextValue(item?.name).toLowerCase()
  ].filter(Boolean).join('|');
}

async function associateHubSpotLineItemToDeal(lineItemId, dealId) {
  const itemId = cleanTextValue(lineItemId);
  const id = cleanTextValue(dealId);
  if (!itemId || !id) return false;

  await hubspotRequest(`/crm/v4/objects/line_items/${itemId}/associations/default/deals/${id}`, {
    method: 'PUT'
  });
  return true;
}

async function createHubSpotLineItemsForDeal(dealId, lineItems) {
  const id = cleanTextValue(dealId);
  const items = Array.isArray(lineItems)
    ? lineItems.map(normaliseHubSpotLineItem).filter(Boolean).slice(0, 50)
    : [];
  if (!id || !items.length) return { created: 0, skipped: 0, errors: [] };

  let existingKeys = new Set();
  try {
    const existingItems = await getAssociatedHubSpotLineItems(id);
    existingKeys = new Set(existingItems.map(item => hubSpotLineItemKeyFromProperties(item.properties || {})).filter(Boolean));
  } catch (error) {
    console.error('HubSpot existing line item lookup failed:', error.message);
  }

  const result = { created: 0, skipped: 0, errors: [] };
  for (const item of items) {
    const key = hubSpotLineItemKey(item);
    if (key && existingKeys.has(key)) {
      result.skipped += 1;
      continue;
    }

    try {
      const lineItem = await hubspotRequest('/crm/v3/objects/line_items', {
        method: 'POST',
        body: {
          properties: cleanHubSpotProperties({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            hs_sku: item.sku
          })
        }
      });
      await associateHubSpotLineItemToDeal(lineItem.id, id);
      result.created += 1;
      if (key) existingKeys.add(key);
    } catch (error) {
      console.error('HubSpot line item creation failed:', error.message);
      result.errors.push(error.message);
    }
  }

  return result;
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

async function runFreightQuoteOnce(key, quoteFn) {
  const existing = freightQuoteInFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve().then(quoteFn);
  freightQuoteInFlight.set(key, promise);

  try {
    return await promise;
  } finally {
    if (freightQuoteInFlight.get(key) === promise) {
      freightQuoteInFlight.delete(key);
    }
  }
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
  const variantSizeTokens = extractSizeTokens(details.variantTitle || '');
  const hasSpecificVariantSize = variantSizeTokens.length > 0;
  const variantSpecTableRows = hasSpecificVariantSize ? filterSpecTableRowsBySizeTokens(details.specTableRows, variantSizeTokens) : [];
  const metricSpecTableRows = variantSpecTableRows.length ? variantSpecTableRows : !hasSpecificVariantSize ? details.specTableRows : [];
  const canUseWholePageMetrics = !hasSpecificVariantSize || variantPackageTable.cartons.length > 0;
  const tableCartons = metricSpecTableRows.length ? parseSpecCellCartons(metricSpecTableRows, combinedSource) : [];
  const pageCartons = canUseWholePageMetrics ? parseCartonDimensions(pageTextSource) : [];
  const cartons = variantPackageTable.cartons.length ? variantPackageTable.cartons : tableCartons.length ? tableCartons : pageCartons;
  const tableWeightKg = metricSpecTableRows.length ? parseSpecCellWeight(metricSpecTableRows, combinedSource) : null;
  const wholePageWeightKg = canUseWholePageMetrics
    ? parseSpecCellWeight(details.specTableRows, combinedSource) ||
      parseGrossWeightKg(descriptionSource) ||
      parseSpecificationTableWeight(pageTextSource) ||
      parseListedWeightKg(combinedSource) ||
      parseGrossWeightKg(pageTextSource)
    : null;

  product.weightKg = variantPackageTable.weightKg || tableWeightKg || wholePageWeightKg || (details.weightGrams ? roundNumber(details.weightGrams / 1000, 2) : null);
  product.cartons = cartons.length ? cartons : canUseWholePageMetrics ? parseCartonDimensions(descriptionSource) : [];
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
    const productFormText = Array.from(document.querySelectorAll('form[action*="/cart/add"], form[action*="/cart/add.js"], [data-product-form], product-form, .product-form'))
      .filter(isVisible)
      .map(element => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' | ');
    const statusText = [actionText, productFormText].filter(Boolean).join(' | ');
    const saleState = /\bpre[\s-]?order\b/i.test(statusText)
      ? 'Pre order'
      : /\bpre[\s-]?sale\b/i.test(statusText)
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
    .replace(/×/g, 'x')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(word => word.endsWith('s') ? word.slice(0, -1) : word)
    .join(' ');
}

function normaliseSizeToken(value) {
  const source = String(value || '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\bmetres?\b/g, 'm')
    .replace(/\s+/g, '');
  const match = source.match(/(\d+(?:\.\d+)?)(?:m)?x(\d+(?:\.\d+)?)(?:m)?/i);
  if (!match) return '';
  return `${Number(match[1])}x${Number(match[2])}m`;
}

function extractSizeTokens(value) {
  const source = String(value || '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\bmetres?\b/g, 'm');
  const tokens = new Set();
  for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*(?:m)?\s*x\s*(\d+(?:\.\d+)?)\s*(?:m)?/gi)) {
    tokens.add(`${Number(match[1])}x${Number(match[2])}m`);
  }
  return Array.from(tokens);
}

function textMatchesSizeToken(value, sizeToken) {
  if (!sizeToken) return false;
  return normaliseSizeToken(value) === sizeToken || extractSizeTokens(value).includes(sizeToken);
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
  const sizeToken = normaliseSizeToken(size) || extractSizeTokens(variantTitle)[0] || '';
  if (!normalisedSize && !sizeToken) return -1;

  const sizeRow = rows.find(row => {
    if (!/^size$/i.test(row[0] || '')) return false;
    return row.some(cell => {
      const cellLabel = normalisePackageLabel(cell);
      return (normalisedSize && cellLabel === normalisedSize) || textMatchesSizeToken(cell, sizeToken);
    });
  });
  if (!sizeRow) return -1;

  const candidates = sizeRow
    .map((cell, index) => ({ index, cell }))
    .filter(item => {
      if (item.index === 0) return false;
      const cellLabel = normalisePackageLabel(item.cell);
      return (normalisedSize && cellLabel === normalisedSize) || textMatchesSizeToken(item.cell, sizeToken);
    })
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

function filterSpecTableRowsBySizeTokens(specTableRows = [], sizeTokens = []) {
  const tokens = Array.from(new Set(sizeTokens.filter(Boolean)));
  if (!tokens.length) return [];

  return specTableRows.filter(cells => {
    const rowText = cells.join(' ');
    return tokens.some(token => textMatchesSizeToken(rowText, token));
  });
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

function cleanProductTextValues(...values) {
  return values
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => value !== null && value !== undefined)
    .map(value => String(value).replace(/<[^>]*>/g, ' '))
    .map(value => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function productTextIndicatesPreOrder(...values) {
  const textValues = cleanProductTextValues(...values);

  if (textValues.some(value => value.length <= 80 && /\bpre[\s-]?order\b/i.test(value))) return 'Pre order';
  if (textValues.some(value => value.length <= 80 && /\bpre[\s-]?sale\b/i.test(value))) return 'Pre sale';
  return '';
}

function productTagsIndicatePreOrder(tags) {
  const tagValues = cleanProductTextValues(tags)
    .flatMap(value => value.split(',').map(tag => tag.trim()))
    .filter(Boolean);

  if (tagValues.some(tag => /^(?:pre[\s-]?order|preorder)$/i.test(tag))) return 'Pre order';
  if (tagValues.some(tag => /^(?:pre[\s-]?sale|presale)$/i.test(tag))) return 'Pre sale';
  return '';
}

function isPreOrderSaleState(value) {
  return /\bpre[\s-]?(?:order|sale)\b/i.test(String(value || ''));
}

function decodeBasicHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, code) => {
      const number = Number(code);
      return Number.isFinite(number) ? String.fromCharCode(number) : match;
    });
}

function htmlToPlainText(value) {
  return decodeBasicHtmlEntities(
    String(value || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function getProductPreOrderSnippetsFromHtml(html) {
  const source = String(html || '');
  const snippets = [];
  const seen = new Set();

  function push(value) {
    const text = htmlToPlainText(value);
    if (!text) return;

    for (const match of text.matchAll(/\bpre[\s-]?(?:order|sale)\b/gi)) {
      const start = Math.max(0, match.index - 60);
      const end = Math.min(text.length, match.index + 120);
      const snippet = text.slice(start, end).trim();

      if (snippet && !seen.has(snippet)) {
        seen.add(snippet);
        snippets.push(snippet);
      }
    }
  }

  const blockPatterns = [
    /<form\b[^>]*(?:action=["'][^"']*\/cart\/add[^"']*["']|class=["'][^"']*(?:product-form|shopify-product-form)[^"']*["'])[^>]*>[\s\S]*?<\/form>/gi,
    /<[^>]+class=["'][^"']*(?:product-form|product__info|product-info|product-single__meta|product__inventory|inventory|availability|badge|preorder|pre-order)[^"']*["'][^>]*>[\s\S]{0,2500}?<\/[^>]+>/gi,
    /<button\b[^>]*[\s\S]{0,900}?<\/button>/gi
  ];

  for (const pattern of blockPatterns) {
    for (const match of source.matchAll(pattern)) {
      push(match[0]);
    }
  }

  const preorderIndex = source.search(/\bpre[\s-]?(?:order|sale)\b/i);
  if (preorderIndex >= 0) {
    push(source.slice(Math.max(0, preorderIndex - 500), preorderIndex + 700));
  }

  return snippets;
}

async function fetchProductPageSaleState(productUrl) {
  const resolvedUrl = normaliseStorefrontUrl(productUrl);
  const cacheKey = resolvedUrl.split('#')[0];
  if (!cacheKey) return '';
  if (productPageSaleStateCache.has(cacheKey)) return productPageSaleStateCache.get(cacheKey);

  let saleState = '';
  try {
    const response = await fetch(cacheKey, { headers: { Accept: 'text/html' } });
    if (response.ok) {
      const html = await response.text();
      saleState = productTextIndicatesPreOrder(...getProductPreOrderSnippetsFromHtml(html));
    }
  } catch (error) {
    // Product JSON and cart state are still usable if product page HTML cannot be read.
  }

  productPageSaleStateCache.set(cacheKey, saleState);
  return saleState;
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
  const preorderSaleState =
    productTagsIndicatePreOrder(productData.tags) ||
    productTextIndicatesPreOrder(productData.title, variant.title, variant.public_title);
  const details = {
    title: productData.title,
    image,
    variantId: variant.id ? String(variant.id) : '',
    sku: variant.sku || '',
    variantTitle: variant.public_title || variant.title || '',
    available: Boolean(variant.available),
    saleState: preorderSaleState || (variant.available ? 'Add to cart' : 'Unavailable'),
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
  if (!isPreOrderSaleState(product.saleState)) {
    const pageSaleState = await fetchProductPageSaleState(resolvedUrl);
    if (pageSaleState) {
      product.saleState = pageSaleState;
    }
  }

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
      const loadedSaleState = loaded.saleState || '';
      const productSaleState = product.saleState || '';
      const saleState = isPreOrderSaleState(loadedSaleState)
        ? loadedSaleState
        : productSaleState || loadedSaleState;

      return {
        ...product,
        ...loaded,
        quantity: product.quantity,
        requestedQuantity: product.requestedQuantity,
        availableQuantity: product.availableQuantity,
        addToCartQuantity: product.addToCartQuantity,
        preSaleQuantity: product.preSaleQuantity,
        saleState,
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
  const { signal: _signal, timeoutMs = 25000, retries = 5, ...requestOptions } = options;
  const response = await fetchShopifyCartWithRetry(`https://livingculture.co.nz${path}`, {
    ...requestOptions,
    timeoutMs,
    headers: {
      ...getStorefrontHeaders(cookieHeader, Boolean(options.body)),
      ...(options.headers || {})
    }
  }, {
    label: `Shopify ${path}`,
    retries,
    timeoutMs
  });
  const nextCookieHeader = updateCookieHeader(cookieHeader, response.headers);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.description || data.message || `Shopify ${path} failed (${response.status})`);
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

async function getDirectCartShippingQuote(cartItems, fields, { retries = 5 } = {}) {
  let cookieHeader = '';

  const cleared = await requestShopifyCartJson('/cart/clear.js', {
    method: 'POST',
    retries
  }, cookieHeader);
  cookieHeader = cleared.cookieHeader;

  const addItemsToCart = async itemsToAdd => {
    const added = await requestShopifyCartAdd(itemsToAdd, cookieHeader, { retries });
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
      throw new Error(added.data.description || added.data.message || `Shopify /cart/add.js failed (${added.response.status})`);
    }

    const partialQuantity = Math.max(0, Math.min(cartItems[0].quantity, Number(partialMatch[1]) || 0));
    if (!partialQuantity) {
      throw new Error(added.data.description || added.data.message || `Shopify /cart/add.js failed (${added.response.status})`);
    }

    await requestShopifyCartJson('/cart/clear.js', { method: 'POST', retries }, cookieHeader)
      .then(result => {
        cookieHeader = result.cookieHeader;
      });
    added = await addItemsToCart([{ ...cartItems[0], quantity: partialQuantity }]);

    if (!added.response.ok) {
      throw new Error(added.data.description || added.data.message || `Shopify /cart/add.js failed (${added.response.status})`);
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
    method: 'GET',
    retries
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
  { checkAvailability = false, cartRetries = 5 } = {}
) {
  const { fields, products, cartItems } = await prepareFastCartShipping(itemInput, addressText, timing, {
    checkAvailability
  });
  const result = await timing.step('read direct cart shipping rates', () =>
    getDirectCartShippingQuote(cartItems, fields, { retries: cartRetries })
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

function buildFreightPriceOnlyPayload(result, fallbackSku = '') {
  const products = Array.isArray(result.products) ? result.products : [];
  const cartItems = Array.isArray(result.cartItems) ? result.cartItems : [];

  return {
    sku: products?.[0]?.sku || fallbackSku || '',
    skus: products.map(product => product.sku).filter(Boolean),
    selectedAddress: result.selectedAddress || '',
    price: result.price,
    priceNumber: parseMoneyToCents(result.price) / 100,
    method: result.method || '',
    cartItems,
    products: products.map(product => ({
      sku: product.sku || '',
      title: product.title || product.name || product.sku || '',
      quantity: normaliseQuantity(product.quantity || product.requestedQuantity || 1),
      requestedQuantity: normaliseQuantity(product.requestedQuantity || product.quantity || 1),
      productUrl: product.productUrl || product.url || '',
      url: product.url || product.productUrl || '',
      image: product.image || ''
    })),
    quantityAdjustments: []
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
  const formattedAddress = formatCin7CheckoutAddress(addressText);
  const address = formattedAddress || normaliseSuggestion(String(addressText || ''));
  if (!address.includes(',') || !/\bnew zealand\b/i.test(address) || !parseNewZealandAddress(address)) return [];
  return [address];
}

function parseNewZealandAddress(addressText) {
  const address = normaliseSuggestion(String(addressText || ''));
  const withoutCountry = address.replace(/(?:,\s*|\s+)New Zealand$/i, '');
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
    ['invercargill', 'Southland'],
    ['coopers beach', 'Northland']
  ]);
  const cityRegion = cityRegions.get(String(city || '').toLowerCase());
  if (cityRegion) return cityRegion;

  const postalNumber = Number.parseInt(postcode, 10);
  if (postalNumber >= 100 && postalNumber <= 599) return 'Northland';
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
  const regionOnlyMatch = address.match(
    /^(.*?\b(?:road|rd|street|st|avenue|ave|drive|dr|place|pl|crescent|cres|lane|ln|parade|terrace|tce|close|court|ct|way|highway|hwy))\s*,\s*(.+?)\s+region\s+(\d{4})\s+new zealand$/i
  );

  if (regionOnlyMatch) {
    const [, street, cityAndRegion, postcode] = regionOnlyMatch;
    const city = stripTrailingNewZealandRegion(cityAndRegion);
    return `${street}, ${city} ${postcode}, New Zealand`;
  }

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

function stripTrailingNewZealandRegion(text) {
  const value = normaliseSuggestion(String(text || ''));
  const regions = [
    'Bay of Plenty',
    'Hawke’s Bay',
    'Hawkes Bay',
    'Manawatū-Whanganui',
    'Manawatu-Whanganui',
    'Northland',
    'Auckland',
    'Waikato',
    'Gisborne',
    'Taranaki',
    'Wellington',
    'Nelson',
    'Marlborough',
    'Canterbury',
    'Otago',
    'Southland'
  ];

  for (const region of regions) {
    const pattern = new RegExp(`\\s+${region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const stripped = value.replace(pattern, '').trim();
    if (stripped && stripped !== value) return stripped;
  }

  return value;
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
    runtime: process.env.VERCEL ? 'vercel' : 'local',
    hubspotConfigured: isHubSpotConfigured()
  });
});

app.get('/api/containers', async (req, res) => {
  try {
    const payload = await getContainerSheetData();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.json(payload);
  } catch (error) {
    console.error('Container sheet fetch failed:', error);
    return res.status(502).json({
      ok: false,
      error: error.message || 'Could not load container spreadsheet.'
    });
  }
});

app.get('/api/hubspot/lead-source-options', async (req, res) => {
  if (!isHubSpotConfigured()) {
    return res.status(503).json({
      error: 'HubSpot is not configured. Set HUBSPOT_ACCESS_TOKEN and HUBSPOT_DEAL_STAGE on the server.'
    });
  }

  try {
    const payload = await getHubSpotLeadSourceOptions();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.json({ ok: true, ...payload });
  } catch (error) {
    console.error('HubSpot lead source option lookup failed:', error);
    return res.status(502).json({ error: error.message || 'Could not load HubSpot lead sources.' });
  }
});

app.all('/api/hubspot/link-pending-orders', async (req, res) => {
  if (!isAuthorizedCronRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }
  if (!isHubSpotConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'HubSpot is not configured. Set HUBSPOT_ACCESS_TOKEN and HUBSPOT_DEAL_STAGE on the server.'
    });
  }

  try {
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit || req.body?.limit || 100) || 100));
    const result = await linkPendingHubSpotOrderDeals({ limit });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('HubSpot pending order link failed:', error);
    return res.status(502).json({ ok: false, error: error.message || 'HubSpot pending order link failed.' });
  }
});

app.post('/api/hubspot/create-deal', async (req, res) => {
  if (!isHubSpotConfigured()) {
    return res.status(503).json({
      error: 'HubSpot is not configured. Set HUBSPOT_ACCESS_TOKEN and HUBSPOT_DEAL_STAGE on the server.'
    });
  }

  const sale = req.body || {};
  const customerName = cleanTextValue(sale.customerName);
  const email = cleanTextValue(sale.email);
  const phone = cleanTextValue(sale.phone);
  const saleNumber = cleanTextValue(sale.orderId || sale.saleNumber || sale.reference);

  if (!customerName && !email && !phone) {
    return res.status(400).json({ error: 'Customer name, email, or phone is required.' });
  }

  try {
    const { contact, created: contactCreated } = await findOrCreateHubSpotContact(sale);
    const { dealName, legacyName, recentName } = buildHubSpotDealNames({
      ...sale,
      customerName: customerName || email || phone || 'Cin7 customer'
    });
    const existingDeal = await findExistingHubSpotDeal([dealName, recentName, legacyName], saleNumber);

    if (existingDeal?.id) {
      const ownerId = await getHubSpotOwnerIdForSale(sale);
      const leadSourceProperties = await buildHubSpotLeadSourceProperties(sale);
      const pendingOrderLinkProperties = await buildHubSpotPendingOrderLinkProperties(saleNumber);
      const orderDealAssociation = await associateCin7OrderDealIfAvailable(existingDeal.id, saleNumber, sale).catch(error => {
        console.error('HubSpot existing Cin7 order deal association failed:', error.message);
        return { associated: false, skipped: false, reason: 'error', error: error.message };
      });
      const amount = parseMoneyValue(sale.amount || sale.total) || orderDealAssociation.orderDealAmount;
      const patchedDeal = await updateHubSpotDealProperties(existingDeal.id, {
        hubspot_owner_id: ownerId,
        dealstage: HUBSPOT_DEAL_STAGE,
        pipeline: HUBSPOT_DEAL_PIPELINE,
        amount,
        ...leadSourceProperties,
        ...pendingOrderLinkProperties
      }).catch(error => {
        console.error('HubSpot existing deal update failed:', error.message);
        return null;
      });
      const contactAssociated = contact?.id
        ? await associateHubSpotDealToContact(existingDeal.id, contact.id).catch(error => {
          console.error('HubSpot existing deal contact association failed:', error.message);
          return false;
        })
        : false;
      const lineItems = await createHubSpotLineItemsForDeal(existingDeal.id, sale.lineItems).catch(error => {
        console.error('HubSpot existing deal line item creation failed:', error.message);
        return { created: 0, skipped: 0, errors: [error.message] };
      });

      return res.json({
        ok: true,
        duplicate: true,
        ownerUpdated: Boolean(patchedDeal),
        stageUpdated: Boolean(patchedDeal),
        contactAssociated,
        orderDealAssociated: Boolean(orderDealAssociation.associated),
        orderDealAssociation,
        lineItems,
        contactCreated,
        contactId: contact?.id || '',
        dealId: existingDeal.id,
        dealName: patchedDeal?.properties?.dealname || existingDeal.properties?.dealname || dealName,
        hubspotUrl: hubspotDealUrl(existingDeal.id)
      });
    }

    const { deal } = await createHubSpotDeal(sale, contact?.id);
    const contactAssociated = contact?.id
      ? await associateHubSpotDealToContact(deal.id, contact.id).catch(error => {
        console.error('HubSpot new deal contact association failed:', error.message);
        return false;
      })
      : false;
    const orderDealAssociation = await associateCin7OrderDealIfAvailable(deal.id, saleNumber, sale).catch(error => {
      console.error('HubSpot new Cin7 order deal association failed:', error.message);
      return { associated: false, skipped: false, reason: 'error', error: error.message };
    });
    const orderDealAmountUpdated = orderDealAssociation.orderDealAmount && !cleanTextValue(deal.properties?.amount)
      ? await updateHubSpotDealProperties(deal.id, { amount: orderDealAssociation.orderDealAmount }).then(() => true).catch(error => {
        console.error('HubSpot new deal order amount update failed:', error.message);
        return false;
      })
      : false;
    const lineItems = await createHubSpotLineItemsForDeal(deal.id, sale.lineItems).catch(error => {
      console.error('HubSpot new deal line item creation failed:', error.message);
      return { created: 0, skipped: 0, errors: [error.message] };
    });
    return res.status(201).json({
      ok: true,
      duplicate: false,
      contactAssociated,
      orderDealAssociated: Boolean(orderDealAssociation.associated),
      orderDealAssociation,
      lineItems,
      amountUpdated: orderDealAmountUpdated,
      contactCreated,
      contactId: contact?.id || '',
      dealId: deal.id,
      dealName: deal.properties?.dealname || dealName,
      hubspotUrl: hubspotDealUrl(deal.id)
    });
  } catch (error) {
    console.error('HubSpot deal creation failed:', error);
    return res.status(502).json({ error: error.message || 'HubSpot deal creation failed.' });
  }
});

app.post('/api/cin7-stock', async (req, res) => {
  const { productUrl, sku, skus, items } = req.body;
  const requestedItems = normaliseItems({ productUrl, sku, skus, items });
  if (!requestedItems.length) {
    return res.status(400).json({ error: 'At least one SKU is required' });
  }

  try {
    const products = await Promise.all(requestedItems.map(async item => {
      const itemSku = String(item.sku || '').trim();
      let cin7Stock;

      try {
        cin7Stock = await getCin7ProductAvailability(itemSku);
      } catch (error) {
        cin7Stock = {
          connected: isCin7Configured(),
          locations: [],
          error: error.message
        };
      }

      return {
        sku: itemSku,
        productUrl: item.productUrl || item.url || '',
        quantity: normaliseQuantity(item.quantity),
        cin7Stock
      };
    }));

    return res.json({ products });
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
  const freightPriceOnly = req.body.freightPriceOnly === true;
  const quoteAvailableQuantityOnly = freightPriceOnly ? false : req.body.quoteAvailableQuantityOnly === true;
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

  const cacheRoute = freightPriceOnly && skipBrowserFallback ? 'get-freight-lite' : 'get-freight';
  const cacheKey = makeFreightQuoteKey(cacheRoute, { items }, freightAddress);
  const cachedPayload = getCachedFreightQuote(cacheKey);
  if (cachedPayload) {
    return res.json({ ...cachedPayload, fromCache: true });
  }

  try {
    try {
      const directPayload = await runFreightQuoteOnce(cacheKey, async () => {
        const directResult = await getDirectFastCartShippingQuote(
          { items },
          freightAddress,
          createTiming('get freight direct'),
          {
            checkAvailability: quoteAvailableQuantityOnly,
            cartRetries: freightPriceOnly && skipBrowserFallback ? 1 : 5
          }
        );
        return freightPriceOnly
          ? buildFreightPriceOnlyPayload(directResult, sku)
          : await buildFreightResponsePayload(directResult, sku);
      });

      cacheFreightQuote(cacheKey, directPayload);
      return res.json(directPayload);
    } catch (directError) {
      const directMessage = directError.message || '';
      const shouldRetryWithBrowserFallback = /429|rate limit/i.test(directMessage);

      if (skipBrowserFallback) {
        console.error('Direct Cin7 freight failed and browser fallback was skipped:', directError.message);
        return res.status(shouldRetryWithBrowserFallback ? 429 : 422).json({
          error: directError.message || 'Fast freight quote could not be loaded'
        });
      }

      console.error('Direct Cin7 freight failed, using browser fallback:', directError.message);
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

      const freightResult = {
        ...result,
        products: result.products || checkout?.products || []
      };

      return freightPriceOnly
        ? buildFreightPriceOnlyPayload(freightResult, sku)
        : buildFreightResponsePayload(freightResult, sku);
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
