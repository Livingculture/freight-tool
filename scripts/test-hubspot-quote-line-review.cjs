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
assert.match(source, /searchParams\.set\('source', 'core'\)/);
assert.match(source, /HUBSPOT_REVIEW_API_URL = 'https:\/\/living-culture-workflow\.vercel\.app\/api\/hubspot\/quote-review'/);
assert.match(source, /data\.deals\.map\(dealFromWorkflow\)/);
assert.match(source, /Only the logged-in rep's Quote Sent/);
assert.match(source, /deals = \[\];\s*setStatus\(`Could not load your HubSpot quote list/);
assert.match(source, /Refresh all Cin7 Core discounts/);
assert.match(source, /Loaded from Cin7 Core/);
assert.match(source, /No discount only/);
assert.doesNotMatch(source, /matching visible rows/);
assert.doesNotMatch(source, /Showing only .* visible rows as a fallback/);

console.log('PASS: HubSpot quote review loads the complete staged deal list and explicitly loads Cin7 Core discounts.');
