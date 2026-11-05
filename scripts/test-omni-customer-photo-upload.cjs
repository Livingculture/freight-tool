const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const uploadStart = source.indexOf('  async function uploadCustomerPhotosFromOmni(');
const uploadEnd = source.indexOf('  function chooseCustomerPhotos(', uploadStart);
const pickerEnd = source.indexOf('  async function encodeAnnotatedCustomerPhoto(', uploadEnd);

assert(uploadStart > 0 && uploadEnd > uploadStart && pickerEnd > uploadEnd, 'Customer upload functions are present');
const upload = source.slice(uploadStart, uploadEnd);
const picker = source.slice(uploadEnd, pickerEnd);

assert.match(source, /const CUSTOMER_UPLOAD_MAX_BYTES = 10 \* 1024 \* 1024;/, '10 MB is enforced per selected file');
assert.match(source, /'application\/pdf'/, 'PDF files are accepted');
assert.match(source, /'\.docx'/, 'Office documents are accepted');
assert.match(upload, /for \(let index = 0; index < selectedFiles\.length; index \+= 1\)/, 'Selected files upload sequentially');
assert.equal((upload.match(/new FormData\(\)/g) || []).length, 1, 'One FormData request is created inside the per-file loop');
assert.match(upload, /form\.append\('photos', file, file\.name\)/, 'Each request contains only the current file');
assert.doesNotMatch(upload, /forEach\(\(file\) => form\.append/, 'Files are never combined into one oversized request');
assert.match(upload, /Uploading \$\{index \+ 1\} of \$\{selectedFiles\.length\}/, 'Staff see per-file upload progress');
assert.match(upload, /earlier file/, 'Partial success is reported if a later file fails');
assert.match(picker, /picker\.accept = CUSTOMER_UPLOAD_ACCEPT;/, 'The Omni picker uses the shared supported-file list');
assert.doesNotMatch(source.slice(source.indexOf('  function runButtonPass()'), source.indexOf('  const omniDomObserver')), /ensureOmniShowroomDelivery\(\)/, 'The rolled-back flashing showroom selector stays disabled');

console.log('PASS: Omni uploads selected photos/documents one at a time with a 10 MB per-file limit and keeps the showroom rollback stable.');
