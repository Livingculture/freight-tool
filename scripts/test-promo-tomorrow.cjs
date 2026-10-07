const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.TZ = 'Pacific/Auckland';
const source = fs.readFileSync(path.join(__dirname, '../userscripts/cin7-promo-summary.user.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  const next = source.slice(start + 1).search(/\n  (?:async )?function /);
  return source.slice(start, start + next + 1);
}
const dateCode = source.slice(source.indexOf('  function startOfToday()'), source.indexOf('  function isDateRelevant('));
let now = '2026-10-07T15:00:00+13:00';
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
}
const rows = [
  { campaign: 'Current', start: '6-Oct-2026', end: '7-Oct-2026' },
  { campaign: 'Tomorrow', start: '8-Oct-2026', end: '12-Oct-2026' },
  { campaign: 'Later', start: '9-Oct-2026', end: '12-Oct-2026' },
  { campaign: 'Ended', start: '1-Oct-2026', end: '6-Oct-2026' },
];
const elements = {
  'lc-promo-search': { value: '' }, 'lc-promo-filter': { value: 'current' },
  'lc-promo-merge': { checked: false }, 'lc-promo-list': { innerHTML: '' }, 'lc-promo-count': { textContent: '' }
};
const context = vm.createContext({
  Date: Clock, clean: value => String(value || '').trim(), compact: value => String(value || '').trim(),
  document: { getElementById: () => ({ shadowRoot: { getElementById: id => elements[id] } }) },
  getCycleRows: () => rows, sortRows: value => value, isOmniQuote: false,
  escapeHtml: value => String(value || ''), stateHtml: () => '', approvalHtml: () => '', renderOffers: () => '',
  getWeekLabelForRange: () => '',
});
vm.runInContext(`let filteredRows = [];\n${dateCode}\n${extract('dateMin')}\n${extract('dateMax')}\n${extract('formatShortDate')}\n${extract('mergeRows')}\n${extract('applyFilters')}\n${extract('renderRows')}`, context);
context.applyFilters();
assert.equal(elements['lc-promo-count'].textContent, '2 promos');
assert(elements['lc-promo-list'].innerHTML.includes('Starting tomorrow'));
assert(!elements['lc-promo-list'].innerHTML.includes('>Later<'));
assert(!elements['lc-promo-list'].innerHTML.includes('>Ended<'));
now = '2026-10-08T15:00:00+13:00';
assert(!context.isStartingTomorrow(rows[1]), 'Tomorrow promotion becomes current on its start date');
assert(context.isStartingTomorrow(rows[2]));
const merged = context.mergeRows([
  { campaign: 'Same', category: 'Same', start: '7-Oct-2026', end: '8-Oct-2026' },
  { campaign: 'Same', category: 'Same', start: '9-Oct-2026', end: '10-Oct-2026' }
]);
assert.equal(merged.length, 2, 'Do not merge away the starting-tomorrow label');
now = '2026-12-31T15:00:00+13:00';
assert(context.isStartingTomorrow({ start: '1-Jan-2027', end: '3-Jan-2027' }));
now = '2026-09-26T15:00:00+12:00';
assert(context.isStartingTomorrow({ start: '27-Sep-2026', end: '30-Sep-2026' }), 'Use calendar days across daylight savings');
console.log('PASS: Current and tomorrow only, visible label, start-day rollover, separate merge groups, year rollover and NZ daylight savings');
