const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-install-fee-helper.user.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  return source.slice(start, source.indexOf('\n  function ', start + 1));
}

(async () => {
  for (const age of [60000, 16 * 60 * 1000, -60000]) {
    const raw = 'Product Code,Name,Price\nAS10140,Assembly Motorised Blind Under 4m,500';
    const values = new Map([['cache', raw], ['time', String(Date.now() - age)]]);
    const context = vm.createContext({
      localStorage: { getItem: key => values.get(key) },
      document: { getElementById: () => null }, filterRows: () => {}
    });
    vm.runInContext(`let items = []; let feesLoading = null; let requests = 0;
      const CACHE_KEY = 'cache', CACHE_TIME_KEY = 'time', ROOT_ID = 'root';
      function loadItems() { requests++; return Promise.resolve().then(() => { items = parseCsv(${JSON.stringify(raw)}); }); }`, context);
    for (const name of ['clean', 'parseCsvLine', 'parseCsv', 'prepareFees']) vm.runInContext(extract(name), context);
    const first = context.prepareFees();
    const second = context.prepareFees();
    await first;
    await second;
    assert.equal(vm.runInContext('requests', context), age === 60000 ? 0 : 1);
    assert.equal(vm.runInContext('items[0].code', context), 'AS10140');
    await context.prepareFees();
    assert.equal(vm.runInContext('requests', context), age === 60000 ? 0 : 1);
  }
  console.log('PASS: fresh cache reuse, stale/future timestamp refresh, concurrent request sharing, prepared data reuse');
})().catch(error => { console.error(error); process.exitCode = 1; });
