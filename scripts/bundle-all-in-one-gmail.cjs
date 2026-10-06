const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '../userscripts');
const target = path.join(directory, 'livingculture-all-in-one.user.js');
const sources = {
  gmailDrawings: 'gmail-drawings.user.js',
  gmailCareGuides: 'gmail-care-guides.user.js',
  gmailHubspotAttachments: 'gmail-hubspot-attachments.user.js',
  gmailQuotePdfs: 'gmail-omni-quote-pdfs.user.js'
};
const start = '  // BEGIN GENERATED GMAIL COMPONENTS';
const end = '  // END GENERATED GMAIL COMPONENTS';
const entries = Object.entries(sources).map(([name, file]) => {
  const source = fs.readFileSync(path.join(directory, file), 'utf8')
    .replace(/^\/\/ ==UserScript==[\s\S]*?^\/\/ ==\/UserScript==\s*/m, '').trimEnd();
  return `    ${name}: function () {\n${source.split('\n').map(line => line.trim() ? `      ${line}` : '').join('\n')}\n    }`;
});
const block = `${start}\n  // Static functions avoid runtime string evaluation under Gmail's page security policy.\n  const gmailComponents = {\n${entries.join(',\n')}\n  };\n${end}`;
const current = fs.readFileSync(target, 'utf8');
assert(current.includes(start) && current.includes(end), 'Missing Gmail bundle markers');
const generated = current.slice(0, current.indexOf(start)) + block + current.slice(current.indexOf(end) + end.length);
if (process.argv.includes('--check')) {
  assert.equal(current, generated, 'Run node scripts/bundle-all-in-one-gmail.cjs to refresh the Gmail bundle');
} else {
  fs.writeFileSync(target, generated);
}
