const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('userscripts/hubspot-quote-line-review.user.js', 'utf8');
assert.match(source, /searchParams\.set\('source', 'core'\)/);
assert.match(source, /HUBSPOT_REVIEW_API_URL = 'https:\/\/living-culture-workflow\.vercel\.app\/api\/hubspot\/quote-review'/);
assert.match(source, /data\.deals\.map\(dealFromWorkflow\)/);
assert.match(source, /All active NZSO quotes for the logged-in rep/);
assert.match(source, /including every product and assembly type/);
assert.match(source, /id="lc-hs-age-filter"/);
assert.match(source, /<option value="7" selected>Past 7 days<\/option>/);
assert.match(source, /<option value="14">Past 2 weeks<\/option>/);
assert.match(source, /<option value="30">Past 1 month<\/option>/);
assert.match(source, /<option value="custom">Custom dates<\/option>/);
assert.match(source, /id="lc-hs-custom-from" type="date"/);
assert.match(source, /id="lc-hs-custom-to" type="date"/);
assert.match(source, /period === 'custom'/);
assert.match(source, /deals = \[\];[\s\S]{0,100}setStatus\(`Could not load your HubSpot quote list/);
assert.match(source, /Refresh all Cin7 Core discounts/);
assert.match(source, /Loaded from Cin7 Core/);
assert.match(source, /No discount only/);
assert.match(source, /function sortDealsNewestFirst\(\)/);
assert.match(source, /sortDealsNewestFirst\(\);/);
assert.match(source, /excludedCompleted = Math\.max\(0, Number\(data\.excludedCompleted\)/);
assert.match(source, /excluded because that customer already has a won job/);
assert.doesNotMatch(source, /matching visible rows/);
assert.doesNotMatch(source, /Showing only .* visible rows as a fallback/);

console.log('PASS: HubSpot quote review loads all active rep quotes and explicitly loads Cin7 Core discounts without product filtering.');
