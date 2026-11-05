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
const products = parse(backup);
const prices = {
  'SK-00067':'$799','SK-00072':'$880','SK-00918':'$779','SK-00887':'$880','SK-00071':'$1075','SK-00075':'$1,459','SK-00073':'$3165','SK-00390':'$1,840','SK-00492':'$690',
  'SK-00391':'$590','SK-00392':'$550','SK-00393':'$350','SK-00394':'$230','SK-00395':'$270','SK-00076':'$590','SK-00078':'$829','SK-00077':'$700',
  'SK-00079':'$259','SK-00140':'$389','SK-01076':'$679','SK-01077':'$689','SK-00638':'$460',
  'SK-01345':'$330','SK-01346':'$330','SK-01350':'$330','SK-00081':'$439','SK-01359':'$330','SK-01395':'$300','SK-01347':'$269','SK-01394':'$300','SK-01348':'$269','SK-01323':'$275',
  'SK-01530':'$350','SK-01531':'$600','SK-01532':'$800','SK-01533':'$850','SK-00551':'$245',
  CS20954:'$349.99',CS20955:'$349.99',CS20956:'$349.99',CS23434:'$349.99',CS23435:'$349.99',CS23436:'$349.99',
  CS22824:'$299.99',CS22825:'$299.99',CS22826:'$299.99',CS22827:'$299.99',CS22828:'$299.99',CS22829:'$299.99',
  CS22253:'$349.99',CS22254:'$349.99',CS22255:'$349.99',CS22250:'$349.99',CS22251:'$349.99',CS22252:'$349.99',
};
assert.equal(products.length,55);assert.equal(new Set(products.map(item=>item.code)).size,55);
assert.deepEqual(Object.fromEntries(products.map(item=>[item.code,item.price])),prices,'All 55 prices match the supplied screenshots, including confirmed CS22824');
const item=code=>products.find(row=>row.code===code);
for(const code of ['SK-00918','SK-00887'])assert.match(item(code).memo,/MOQ 6 m2/);
for(const code of ['SK-00392','SK-00393','SK-00394','SK-00395'])assert.match(item(code).memo,/MOQ 2 m2/);
for(const code of ['SK-00079','SK-00140','SK-01076','SK-01077'])assert.match(item(code).memo,/MOQ 3 m2/);
for(const code of ['SK-00079','SK-00140'])assert.match(item(code).memo,/0% openness and 30% openness.*20% per m2/);
for(const code of ['SK-01530','SK-01531','SK-01532','SK-01533']){
  assert.match(item(code).memo,/Price per metre/);assert.match(item(code).memo,/\$150/);assert.match(item(code).memo,/custom colours add 15%/);
}
assert.match(item('SK-01533').memo,/Minimum order width: 5m/);assert.match(item('SK-01533').memo,/3.5m projection/);
assert.match(item('SK-01532').memo,/projection \+ 0.5m/);
for(const code of ['SK-01345','SK-01346']){assert.match(item(code).memo,/projection: 1m/);assert.match(item(code).memo,/Black frame colour adds 15%/);}
assert.match(item('SK-01323').memo,/Black frame colour adds 15%/);
assert.match(item('SK-00081').memo,/MOQ 9 m2/);
for(const product of products.filter(row=>row.code.startsWith('CS')))assert.match(product.memo,/individually quoted steel posts/);
for(const code of ['SK-00396','SK-00397','SK-00398','SK-00399','SK-00400','SK-00401','SK-00080','SK-00085','SK-00082','SK-00083','SK-00084'])assert(!item(code),'Superseded code removed: '+code);

const ts = require(path.resolve(__dirname,'../../workflow-speed-fix/node_modules/typescript'));
const coreSource = fs.readFileSync(path.join(__dirname,'../userscripts/cin7-custom-product-helper.user.js'),'utf8');
const ast=ts.createSourceFile('core.js',coreSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['clean','parseCsvLine','normaliseHeader','looksLikeProductCode','looksLikeProductPrice','looksLikeVerticalProductName','parseVerticalData','knownProductName','needsKnownProductName','enrichKnownProduct','parseData']);
const declarations=[];
function visit(node){if(ts.isFunctionDeclaration(node)&&names.has(node.name?.text))declarations.push(node.getText(ast));ts.forEachChild(node,visit)}
visit(ast);const core=vm.createContext({});vm.runInContext(declarations.join('\n'),core);
assert.deepEqual(JSON.parse(JSON.stringify(core.parseData(backup))),products,'Core and Omni show identical corrected product data');
assert(source.includes('lc-omni-custom-product-data-v2'));assert(coreSource.includes('lc-custom-product-data-v17'));
console.log('PASS: all 55 screenshot SKUs/prices, confirmed Baltic pricing, minimums, per-metre awnings, modification fees, steel-post notes, retired codes, identical Core/Omni data and Baltic merged memos.');
