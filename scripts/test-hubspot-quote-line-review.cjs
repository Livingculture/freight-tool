const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('userscripts/hubspot-quote-line-review.user.js', 'utf8');
const literal = source.match(/const INCLUDED_STAGE_RE = (\/.*\/[a-z]*);/i)?.[1];
assert(literal, 'HubSpot stage matcher is present');
const stageMatcher = Function(`return ${literal}`)();

for (const stage of ['Quote - Quote Sent', 'Quote sent', 'Followed up', 'Follow up', 'Wait On Customer', 'Waiting on customer']) {
  assert(stageMatcher.test(stage), `Includes ${stage}`);
}
assert(!stageMatcher.test('Paid'), 'Paid deals are not included');
assert.match(source, /Load Omni discounts/);
assert.match(source, /Loaded from Cin7 Omni/);

console.log('PASS: HubSpot quote review recognises all required stages and labels the Omni discount source.');
