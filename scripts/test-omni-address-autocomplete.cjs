const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../userscripts/omni-address-autocomplete.user.js'), 'utf8');

function extract(name) {
  const start = new RegExp(`  function ${name}\\(`).exec(source)?.index;
  assert.notEqual(start, undefined, `Missing ${name}`);
  const next = source.slice(start + 1).search(/\n  function /);
  return source.slice(start, next < 0 ? source.length : start + next + 1);
}

const photonAddress = new Function(`${[
  'clean',
  'normalise',
  'inferRegion',
  'correctKnownPostalAddress',
  'photonAddress'
].map(extract).join('\n')}\nreturn photonAddress;`)();

const greenmeadows = photonAddress({
  properties: {
    housenumber: '37A',
    street: 'Park Road',
    locality: 'Greenmeadows Central',
    district: 'Greenmeadows',
    city: 'Napier',
    state: "Hawke's Bay",
    country: 'New Zealand',
    postcode: '4141'
  }
});

assert.deepEqual(greenmeadows, {
  address1: '37A Park Road',
  address2: 'Greenmeadows',
  city: 'Napier',
  postcode: '4112',
  region: "Hawke's Bay",
  country: 'New Zealand'
});

const unchanged = photonAddress({
  properties: {
    housenumber: '29',
    street: 'Customs Street West',
    suburb: 'Auckland Central',
    city: 'Auckland',
    state: 'Auckland',
    country: 'New Zealand',
    postcode: '1010'
  }
});

assert.deepEqual(unchanged, {
  address1: '29 Customs Street West',
  address2: 'Auckland Central',
  city: 'Auckland',
  postcode: '1010',
  region: 'Auckland',
  country: 'New Zealand'
});

console.log('PASS: Omni address formatting prefers the actual city and corrects the confirmed Greenmeadows, Napier postal address while preserving normal results.');
