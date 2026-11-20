const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'userscripts', 'omni-livingculture-workflow.user.js'), 'utf8');
assert.match(source, /syncSource:\s*'omni-detail-page'/, 'detail pages identify authoritative backfill snapshots');
assert.match(source, /detailSyncVersion:\s*1/, 'detail pages mark the current backfill schema');
assert.match(source, /GM_openInTab\(url\.href, \{ active:false/, 'backfill opens orders without taking over the staff screen');
assert.match(source, /setTimeout\(requestQueue, 8000\)/, 'backfill remains below the HubSpot write limit');
const functionSource = name => {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const body = source.indexOf('{', start);
  let depth = 0;
  for (let index = body; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
};

const cell = textContent => ({ textContent });
const row = values => ({ children: values.map(cell), closest: () => table });
const header = row(['Created', 'Cin7 Status', 'Stage', 'Created By', 'Ref', 'Total Incl', 'Paid', 'Branch']);
const paid = row(['17 Nov 2026', 'Open', 'Dispatched', 'Steve', 'NZSO-18595', '$439.99', 'PAID: 100%', 'AKL Penrose Showroom']);
const partPaid = row(['17 Nov 2026', 'Open', 'New', 'Jude', 'NZSO-18598', '$279.99', 'PAID: 50%', 'AKL Penrose Showroom']);
const blank = row(['17 Nov 2026', 'Open', 'New', 'Jude', 'NZSO-18597', '$100.00', '', 'AKL Penrose Showroom']);
const table = { querySelectorAll: selector => selector === 'tr' ? [header, paid, partPaid, blank] : [] };

const context = {
  clean: value => String(value || '').replace(/\s+/g, ' ').trim(),
  document: { querySelectorAll: selector => selector === 'table' ? [table] : [] },
  location: { href: 'https://go.cin7.com/Cloud/ShoppingCartAdmin/Orders/OrdersList.aspx' }
};
vm.createContext(context);
vm.runInContext(`${functionSource('omniListHeaderKey')}\n${functionSource('omniListMoney')}\n${functionSource('omniListRowSnapshots')}`, context);
const snapshots = context.omniListRowSnapshots();

assert.equal(snapshots.length, 3);
assert.deepEqual(JSON.parse(JSON.stringify(snapshots[0])), {
  orderNumber: 'NZSO-18595', documentType: 'sales-order', syncSource: 'omni-list-page',
  sourceUrl: context.location.href, stage: 'Dispatched', branch: 'AKL Penrose Showroom', salesRep: 'Steve',
  total: 439.99, fullyDispatched: true, paid: true, paidAmount: 439.99, balanceDue: 0, paymentStatus: 'PAID'
});
assert.equal(snapshots[1].paidAmount, 140);
assert.equal(snapshots[1].balanceDue, 139.99);
assert.equal(snapshots[1].paymentStatus, 'PART PAID');
assert.equal(snapshots[2].paidAmount, undefined, 'blank payment cells must not overwrite known payment data');
assert.equal(snapshots[2].paymentStatus, undefined);

console.log('Omni list sync parser tests passed.');
