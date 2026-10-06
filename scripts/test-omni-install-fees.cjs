const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../userscripts/omni-install-fee-helper.user.js'), 'utf8');
const context = vm.createContext({});
for (const name of ['clean', 'dimensions', 'pergolaDetails', 'matchingFee', 'matchedFeePlan', 'parseCsvLine', 'parseCsv', 'memoRequiresInstallation', 'blindWidth', 'blindOperation', 'blindMounting', 'matchingBlindFee', 'assemblyProduct']) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  function ', start + 1);
  vm.runInContext(source.slice(start, end), context);
}
for (const memo of ['', 'No installation required', 'Installation is not required', 'Installation is not included', 'Without installation', 'Installation required. Installation is not included.']) {
  assert.equal(context.memoRequiresInstallation(memo), false);
}
for (const memo of ['Installation required', 'INSTALLATION REQUIRED', 'Installation: required', 'Instalation required\n\nTerms and conditions']) {
  assert.equal(context.memoRequiresInstallation(memo), true);
}
const fees = context.parseCsv(`Product Code,Name,Price
AS10037,Assembly Freestanding Motorised Pergola Tasman Up to 16m²,2000
AS10081,Assembly Freestanding Motorised Pergola Tasman 16.1-24m²,2400
AS10107,Assembly Wall Mount Motorised Pergola Tasman Up to 16m²,2600
AS10077,Assembly Freestanding Manual Pergola Atlantic up to 9m²,1200
AS10078,Assembly Freestanding Manual Pergola Atlantic 9.1-18m²,1500
AS10188,Assembly Freestanding Motorised Pergola Dover Up to 9.1-14m²,2400
AS10143,Assembly Freestanding Motorised Pergola Pacific 4.1x4.6m/6.1x4.6m,2500`);
const line = (name, options, quantity = 1) => ({ code: 'CS123', name, options, quantity });
const tasman = size => line('Tasman Motorised Freestanding Louvre Roof Aluminium Pergola', size);
assert.equal(context.matchingFee(tasman('4 x 3m'), fees).code, 'AS10037');
assert.equal(context.matchingFee(tasman('4x4m'), fees).code, 'AS10037');
assert.equal(context.matchingFee(tasman('6 x 4m'), fees).code, 'AS10081');
assert.equal(context.matchingFee(tasman('4000 x 3000mm'), fees).area, 12);
assert.equal(context.matchingFee(line('Tasman Motorised Wall Mounted Pergola', '4 x 3m'), fees).code, 'AS10107');
assert.equal(context.matchingFee(line('Atlantic Manual Freestanding Pergola', '2.6 x 2.6m'), fees).code, 'AS10077');
assert.equal(context.matchingFee(line('Atlantic Manual Freestanding Pergola', '4 x 3m'), fees).code, 'AS10078');
assert.equal(context.matchingFee(line('Dover Motorised Freestanding Pergola', '4 x 3m'), fees).code, 'AS10188');
assert.equal(context.matchingFee(line('Pacific Motorised Freestanding Pergola', '4.6 x 6.1m'), fees).code, 'AS10143');
for (const product of [tasman('8x8m'), tasman('4.01x4m'), line('Tasman Motorised Pergola', '4x3m'), line('Tasman Freestanding Pergola', '4x3m'), tasman(''), line('Tasman Motorised Freestanding Pergola Blind', '')]) {
  assert.equal(context.matchingFee(product, fees), null);
}
assert.equal(context.matchingFee(tasman('4x3m'), [...fees, fees[0]]), null, 'Ambiguous fees must not be selected');
const existing = { code: 'AS10037', name: fees[0].name, quantity: 1 };
assert.equal(context.matchedFeePlan([tasman('4x3m'), { ...existing, name: '' }], fees).fees[0].quantity, 1, 'Code-only rows are not completed fees');
assert.equal(context.matchedFeePlan([tasman('4x3m'), existing], fees).fees.length, 0);
const multiple = context.matchedFeePlan([{ ...tasman('4x3m'), quantity: 2 }, tasman('4x3m'), existing], fees);
assert.equal(multiple.fees[0].quantity, 2);
assert.equal(context.matchedFeePlan([line('Unknown Freestanding Manual Pergola', '4x3m')], fees).unmatched.length, 1);
if (process.argv[2]) {
  const liveFees = context.parseCsv(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(context.matchingFee(tasman('4x3m'), liveFees).code, 'AS10037');
  assert.equal(context.matchingFee(line('Atlantic Manual Freestanding Pergola', '4x3m'), liveFees).code, 'AS10078');
  assert.equal(context.matchingFee(line('Tasman Motorised Wall Mounted Pergola', '6x4m'), liveFees).code, 'AS10111');
  console.log(`Live chart checked: ${liveFees.length} fees`);
}
console.log('PASS: dimensions, mounting, operation, model, area boundaries, exact footprints, quantities and duplicate protection');
const blindFees = context.parseCsv(`Product Code,Name,Price
AS10069,Assembly Manual Blind Under 4m (Post to Post),250
AS10169,Assembly Manual Blind over 4.1m with Extra Post (Post to Post),450
AS10176,Assembly Manual Wall Mount Blind Under 4m (Post To Wall),450
AS10140,Assembly Motorised Blind Under 4m,500
AS10175,Assembly Motorised Blind Over 4.1m,650
AS10178,Assembly Programme Motorised Blind Call Out Fee,180`);
const blind = (options, name = 'Motorised Blind For Tasman Freestanding Pergola') => line(name, options);
for (const [product, code] of [
  [blind('3m Black'), 'AS10140'], [blind('4m'), 'AS10140'], [blind('4.1m'), 'AS10175'],
  [blind('5m'), 'AS10175'], [blind('3000mm'), 'AS10140'], [blind('300cm'), 'AS10140'],
  [blind('3m', 'Manual Blind For Tasman Freestanding Pergola'), 'AS10069'],
  [blind('5m', 'Manual Blind For Tasman Freestanding Pergola'), 'AS10169'],
  [blind('Post To Wall 3m', 'Manual Blind For Tasman Wall Mounted Pergola'), 'AS10176'],
  [blind('Post To Post 3m', 'Manual Blind For Tasman Wall Mounted Pergola'), 'AS10069'],
  [blind('3m', 'Retractable Shade Blind For Baltic Freestanding Pergola 2.0'), 'AS10069'],
  [blind('3m', 'Motorised Blind For Tasman Wall Mounted Pergola'), 'AS10140'],
  [blind('Black', 'Motorised Blind 3m'), 'AS10140']
]) assert.equal(context.matchingFee(product, blindFees)?.code, code);
for (const product of [blind('4.04m'), blind('4.1 x 4.6m L Black'), blind('Black'), blind('3m', 'Outdoor Blind'), blind('Post To Wall 5m', 'Manual Blind For Tasman Wall Mounted Pergola')]) {
  assert.equal(context.matchingFee(product, blindFees), null);
}
assert.equal(context.matchingFee(blind('3m'), [...blindFees, blindFees[3]]), null);
const combined = context.matchedFeePlan([tasman('4x3m'), { ...blind('3m'), quantity: 2 }, { code: 'AS10140', name: blindFees[3].name, quantity: 1 }], [...fees, ...blindFees]);
assert.equal(combined.fees.find(item => item.code === 'AS10140').quantity, 1);
assert.equal(combined.fees.find(item => item.code === 'AS10037').quantity, 1);
if (process.argv[2]) {
  const liveFees = context.parseCsv(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(context.matchingFee(blind('3m'), liveFees).code, 'AS10140');
  assert.equal(context.matchingFee(blind('5m'), liveFees).code, 'AS10175');
  assert.equal(context.matchingFee(blind('Post To Wall 3m', 'Manual Blind For Tasman Wall Mounted Pergola'), liveFees).code, 'AS10176');
}
console.log('PASS: blind widths, boundaries, mounting, motorised/manual, retractable shade, ambiguous sizes, mixed quotes and live fees');
