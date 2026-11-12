// ==UserScript==
// @name         Cin7 Dynamic Receipt Download Test
// @namespace    livingculture-cin7-receipt-test
// @version      0.2.0
// @description  Tests intercepting Cin7 Admin's native Dynamic Receipt action and downloading its authenticated PDF.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/ShoppingCartAdmin/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      go.cin7.com
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-dynamic-receipt-download-test.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-dynamic-receipt-download-test.user.js
// ==/UserScript==

(function () {
  'use strict';

  function downloadReceipt(url) {
    GM_xmlhttpRequest({
    method: 'GET',
    url,
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
  }

  document.addEventListener('click', event => {
    const control = event.target.closest?.('a, button, [role="button"]');
    if (!control) return;
    const label = String(control.textContent || control.getAttribute('aria-label') || control.getAttribute('title') || '')
      .replace(/\s+/g, ' ').trim().toLowerCase();
    const rawHref = control.getAttribute('href') || control.getAttribute('formaction') || '';
    let receiptUrl = '';
    try {
      const candidate = new URL(rawHref, location.href);
      if (candidate.searchParams.get('T') === 'Order 5') receiptUrl = candidate.href;
    } catch (error) {}
    if (!receiptUrl && !label.includes('dynamic receipt')) return;
    if (!receiptUrl) {
      window.alert('Receipt test found Dynamic Receipt, but the control did not contain its PDF URL.');
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadReceipt(receiptUrl);
  }, true);
})();
