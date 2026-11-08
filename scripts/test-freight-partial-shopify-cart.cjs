const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('server.js', 'utf8');
const omniSource = fs.readFileSync('userscripts/omni-cin7-lc-freight.user.js', 'utf8');

assert.match(source, /No cart cookie is supplied at the start of a server-side freight request/,
  'A fresh Shopify cart must not be cleared before rating');
assert.doesNotMatch(
  source.slice(source.indexOf('async function getDirectCartShippingQuote'), source.indexOf('function buildFastCartShippingResult')),
  /cart\/clear\.js/,
  'Direct freight rating must avoid the unnecessary rate-limited cart clear');
assert.match(source, /for \(const item of cartItems\)/,
  'Multiple quoted products are added separately so one unavailable product cannot reject every line');
assert.match(source, /sold out\|not enough\|unavailable\|cannot be added\|due to availability/,
  'Unavailable lines are recognised and skipped');
assert.match(source, /const cart = await requestShopifyCartJson\('\/cart\.js'/,
  'The accepted Shopify cart is read back before requesting a rate');
assert.match(source, /availabilityWarning: excludedQuantity/,
  'The response warns staff when unavailable quoted units were excluded');
assert.match(source, /quantity: 0,\s+availableQuantity: 0,/,
  'Products absent from the accepted cart are recorded as unavailable rather than silently retained');
assert.match(omniSource, /const shopifyData = await requestShopifyPostcodeFreight\(freightItems, postcode\)/,
  'Omni first rates freight through the user browser rather than concentrating every request on the hosted server');
assert.match(omniSource, /const acceptedItems = Array\.isArray\(cart\.data\.items\)/,
  'The browser path reads the quantities Shopify actually accepted');
assert.match(omniSource, /sold out\|not enough\|unavailable\|cannot be added\|due to availability/,
  'The browser path also preserves valid lines when one product is unavailable');
assert.match(omniSource, /availabilityWarning: excludedQuantity/,
  'Omni warns staff when the browser calculation excludes unavailable units');

console.log('PASS: Freight rating avoids redundant cart clears, preserves valid lines when Shopify rejects unavailable quantities, and warns about excluded units.');
