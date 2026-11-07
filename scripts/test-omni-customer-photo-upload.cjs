const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('userscripts/omni-livingculture-workflow.user.js', 'utf8');
const signedUploadStart = source.indexOf('  function customerPhotosSignedUpload(');
const uploadStart = source.indexOf('  async function uploadCustomerPhotosFromOmni(');
const uploadEnd = source.indexOf('  function chooseCustomerPhotos(', uploadStart);
const pickerEnd = source.indexOf('  async function encodeAnnotatedCustomerPhoto(', uploadEnd);

assert(signedUploadStart > 0 && uploadStart > signedUploadStart && uploadEnd > uploadStart && pickerEnd > uploadEnd, 'Customer upload functions are present');
const signedUpload = source.slice(signedUploadStart, uploadStart);
const upload = source.slice(uploadStart, uploadEnd);
const picker = source.slice(uploadEnd, pickerEnd);

assert.match(source, /const CUSTOMER_UPLOAD_MAX_BYTES = 10 \* 1024 \* 1024;/, '10 MB is enforced per selected file');
assert.match(source, /'application\/pdf'/, 'PDF files are accepted');
assert.match(source, /'\.docx'/, 'Office documents are accepted');
assert.match(upload, /for \(let index = 0; index < selectedFiles\.length; index \+= 1\)/, 'Selected files upload sequentially');
assert.match(upload, /action: 'prepare-upload'/, 'Each file first requests a short-lived private upload link');
assert.match(upload, /await customerPhotosSignedUpload\(prepared, file\)/, 'The file bypasses the Workflow web-host request limit');
assert.match(upload, /action: 'complete-upload'/, 'Each successful storage upload is recorded in its album');
assert.equal((signedUpload.match(/new FormData\(\)/g) || []).length, 1, 'The signed storage request contains one file');
assert.match(signedUpload, /form\.append\('', file, file\.name\)/, 'The signed storage request contains only the current file');
assert.match(signedUpload, /method: 'PUT'/, 'Signed files upload directly to private storage');
assert.doesNotMatch(upload, /form\.append\('photos'/, 'Files are not sent through the size-limited Workflow request');
assert.match(upload, /Uploading \$\{index \+ 1\} of \$\{selectedFiles\.length\}/, 'Staff see per-file upload progress');
assert.match(upload, /earlier file/, 'Partial success is reported if a later file fails');
assert.match(picker, /picker\.accept = CUSTOMER_UPLOAD_ACCEPT;/, 'The Omni picker uses the shared supported-file list');
assert.match(source.slice(source.indexOf('  function runButtonPass()')), /ensureOmniShowroomDelivery\(\)/, 'The requested destination checkboxes are enabled');

console.log('PASS: Omni uploads selected photos/documents directly to private storage one at a time with a 10 MB per-file limit; destination checkboxes remain enabled.');
