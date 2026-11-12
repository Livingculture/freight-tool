// ==UserScript==
// @name         Cin7 Dynamic Receipt Download Test
// @namespace    livingculture-cin7-receipt-test
// @version      0.1.0
// @description  Tests downloading Cin7's native Dynamic Receipt PDF from its authenticated Order 5 URL.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/Docs/PDF/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      go.cin7.com
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-dynamic-receipt-download-test.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-dynamic-receipt-download-test.user.js
// ==/UserScript==

(function () {
  'use strict';

  const url = new URL(location.href);
  if (url.searchParams.get('T') !== 'Order 5') return;

  const runKey = `lc-dynamic-receipt-test:${url.href}`;
  if (sessionStorage.getItem(runKey)) return;
  sessionStorage.setItem(runKey, '1');

  GM_xmlhttpRequest({
    method: 'GET',
    url: url.href,
    responseType: 'arraybuffer',
    timeout: 60000,
    onload(response) {
      const bytes = new Uint8Array(response.response || new ArrayBuffer(0));
      const isPdf = bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF';
      if (response.status < 200 || response.status >= 300 || !isPdf) {
        window.alert(`Receipt test failed: Cin7 returned HTTP ${response.status} instead of a PDF.`);
        return;
      }

      const blobUrl = URL.createObjectURL(new Blob([response.response], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'receipt-test.pdf';
      (document.body || document.documentElement).appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    },
    onerror() {
      window.alert('Receipt test failed: the authenticated Cin7 PDF request could not be completed.');
    },
    ontimeout() {
      window.alert('Receipt test failed: Cin7 took longer than 60 seconds to return the PDF.');
    }
  });
})();
