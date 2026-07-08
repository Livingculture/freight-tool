#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ENV_FILES = [
  process.env.HUBSPOT_ENV_FILE,
  '/tmp/workflow-production.env',
  '/tmp/workflow-production-scope.env',
  '/Users/steveforeman/projects/workflow/.env.production.local',
  '/Users/steveforeman/projects/workflow/.env.local',
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env')
].filter(Boolean);

const DEAL_PROPERTIES = [
  'dealname',
  'amount',
  'hubspot_owner_id',
  'pipeline',
  'dealstage',
  'createdate',
  'hs_lastmodifieddate',
  'copy_order_deal_name',
  'leads_source',
  'closedate'
];

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex);
    let value = trimmed.slice(equalsIndex + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function loadEnv() {
  for (const filePath of DEFAULT_ENV_FILES) parseEnvFile(filePath);
}

function getAccessToken() {
  return process.env.HUBSPOT_ACCESS_TOKEN ||
    process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
    process.env.HUBSPOT_API_KEY ||
    '';
}

async function hubspotRequest(pathname, options = {}) {
  const token = getAccessToken();
  if (!token) {
    throw new Error(
      'No HubSpot token found. Set HUBSPOT_ACCESS_TOKEN or run: ' +
      'HUBSPOT_ENV_FILE=/path/to/env npm run hubspot:inspect -- NZSO-13194'
    );
  }

  const baseUrl = (process.env.HUBSPOT_API_BASE_URL || 'https://api.hubapi.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`HubSpot request failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function searchDeals(query) {
  const payload = await hubspotRequest('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: {
      query,
      properties: DEAL_PROPERTIES,
      limit: 10
    }
  });
  return Array.isArray(payload.results) ? payload.results : [];
}

async function readDealAssociations(dealId, objectType) {
  const payload = await hubspotRequest(`/crm/v4/objects/deals/${dealId}/associations/${objectType}?limit=100`);
  return Array.isArray(payload.results) ? payload.results : [];
}

async function readDealsByIds(ids) {
  if (!ids.length) return [];
  const payload = await hubspotRequest('/crm/v3/objects/deals/batch/read', {
    method: 'POST',
    body: {
      properties: DEAL_PROPERTIES,
      inputs: ids.map((id) => ({ id: String(id) }))
    }
  });
  return Array.isArray(payload.results) ? payload.results : [];
}

async function readOwners() {
  const owners = [];
  let after = '';
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('after', after);
    const payload = await hubspotRequest(`/crm/v3/owners/?${query.toString()}`);
    owners.push(...(Array.isArray(payload.results) ? payload.results : []));
    after = payload.paging?.next?.after || '';
  } while (after);

  return Object.fromEntries(owners.map((owner) => {
    const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || owner.email || owner.id;
    return [String(owner.id), name];
  }));
}

function compactDeal(deal, ownerNames) {
  const properties = deal.properties || {};
  return {
    id: deal.id,
    dealname: properties.dealname || '',
    owner: ownerNames[String(properties.hubspot_owner_id)] || properties.hubspot_owner_id || '',
    pipeline: properties.pipeline || '',
    stage: properties.dealstage || '',
    amount: properties.amount || '',
    orderName: properties.copy_order_deal_name || '',
    leadSource: properties.leads_source || '',
    created: properties.createdate || '',
    modified: properties.hs_lastmodifieddate || ''
  };
}

function associationIds(results) {
  return results.map((result) => String(result.toObjectId || result.id || '')).filter(Boolean);
}

async function inspectSaleNumbers(saleNumbers) {
  const ownerNames = await readOwners();

  for (const saleNumber of saleNumbers) {
    const deals = await searchDeals(saleNumber);
    console.log(`\n${saleNumber}`);
    if (!deals.length) {
      console.log('  No deals found.');
      continue;
    }

    for (const deal of deals) {
      const compact = compactDeal(deal, ownerNames);
      console.log(`  Deal: ${compact.dealname}`);
      console.log(`    id: ${compact.id}`);
      console.log(`    owner: ${compact.owner || '--'}`);
      console.log(`    pipeline/stage: ${compact.pipeline || '--'} / ${compact.stage || '--'}`);
      console.log(`    amount: ${compact.amount || '--'}`);
      if (compact.orderName) console.log(`    order name property: ${compact.orderName}`);
      if (compact.leadSource) console.log(`    lead source: ${compact.leadSource}`);

      const associatedDealIds = associationIds(await readDealAssociations(deal.id, 'deals'));
      const associatedDeals = await readDealsByIds(associatedDealIds);
      console.log(`    associated deals: ${associatedDeals.length}`);
      for (const associatedDeal of associatedDeals) {
        const associated = compactDeal(associatedDeal, ownerNames);
        console.log(`      - ${associated.dealname} (${associated.id}) owner: ${associated.owner || '--'}`);
      }

      const contacts = associationIds(await readDealAssociations(deal.id, 'contacts'));
      const lineItems = associationIds(await readDealAssociations(deal.id, 'line_items'));
      console.log(`    contacts: ${contacts.length ? contacts.join(', ') : '--'}`);
      console.log(`    line items: ${lineItems.length}`);
    }
  }
}

loadEnv();

const saleNumbers = process.argv.slice(2).filter(Boolean);
if (!saleNumbers.length) {
  console.error('Usage: npm run hubspot:inspect -- NZSO-13194 NZSO-13160');
  process.exit(1);
}

inspectSaleNumbers(saleNumbers).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
