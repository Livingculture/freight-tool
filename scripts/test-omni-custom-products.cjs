const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-custom-product-helper.user.js'), 'utf8');
const parser = source.slice(source.indexOf('  function isCode('), source.indexOf('  function request('));
const context = vm.createContext({});
vm.runInContext("const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();\n" + parser, context);
const parse = raw => JSON.parse(JSON.stringify(context.parse(raw)));
const moq = 'The MOQ is 9 m2. If the size less than 9 m2, please quote based on 9 m2';
const colours = 'Standard colour is black, charcoal, white and frame charcoal+louvre white. Custom colours need increase 15%';

function check(products) {
  const manual = products.find(item => item.code === 'SK-00067');
  const motorised = products.find(item => item.code === 'SK-00072');
  assert.equal(manual.name, 'Baltic Manual Pergola');
  assert.equal(motorised.name, 'Baltic Motorised Pergola');
  assert.equal(manual.price, '$799');
  assert.equal(motorised.price, '$880');
  assert.equal(manual.memo, motorised.memo);
  assert.match(manual.memo, /MOQ is 9 m2/);
  assert.match(manual.memo, /Custom colours need increase 15%/);
  const caspian = products.find(item => item.name === 'Caspian Manual Pergola');
  if (caspian) assert.deepEqual(caspian, { name: 'Caspian Manual Pergola', code: 'SK-00073', price: '$900', memo: 'Separate memo' });
}

check(parse(['Name', 'CS code', 'Price/per m2', 'Memo', 'Baltic Manual Pergola', 'SK-00067', '$799', moq, 'Baltic Motorised Pergola', 'SK-00072', '$880', colours, 'Caspian Manual Pergola', 'SK-00073', '$900', 'Separate memo'].join('\n')));
check(parse(`Name,CS code,Price,Memo\nBaltic Manual Pergola,SK-00067,$799,"${moq}"\nBaltic Motorised Pergola,SK-00072,$880,"${colours}"`));
const backup = fs.readFileSync(path.join(__dirname, '../userscripts/cin7-custom-product-helper.user.js'), 'utf8').match(/const RAW_DATA = `([\s\S]*?)`;\s*\n/)[1];
check(parse(backup));
const ordinary = parse('Name,CS code,Price,Memo\nOther Product,SK-99999,$25,"A note, with a comma"');
assert.deepEqual(ordinary, [{ name: 'Other Product', code: 'SK-99999', price: '$25', memo: 'A note, with a comma' }]);
console.log('PASS: Baltic names, prices and shared memos in document and backup; unrelated products preserved.');
