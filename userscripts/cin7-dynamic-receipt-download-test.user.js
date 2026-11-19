// ==UserScript==
// @name         Cin7 Dynamic Receipt Download Test
// @namespace    livingculture-cin7-receipt-test
// @version      0.3.0
// @description  Tests Cin7 Admin's native two-step Dynamic Receipt generation and download flow.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/ShoppingCartAdmin/*
// @match        https://go.cin7.com/Cloud/Docs/PDF/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-dynamic-receipt-download-test.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-dynamic-receipt-download-test.user.js
// ==/UserScript==

(function () {
  'use strict';
  const STATE_KEY = 'lc-dynamic-receipt-test-v3';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const label = element => clean(element?.value || element?.textContent || element?.getAttribute?.('aria-label') || element?.getAttribute?.('title')).toLowerCase();
  const receiptHref = element => {
    const raw = element?.getAttribute?.('href') || element?.getAttribute?.('formaction') || '';
    if (!raw || /^javascript:/i.test(raw)) return '';
    try {
      const url = new URL(raw.replace(/&amp;/gi, '&'), location.href);
      const template = clean(url.searchParams.get('T')).toLowerCase();
      return url.hostname === 'go.cin7.com' && (template === 'receipt' || template === 'order 5') ? url.href : '';
    } catch { return ''; }
  };
  function readState() { try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null') || {}; } catch { return {}; } }
  function setState(patch) { sessionStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...patch, updatedAt:Date.now() })); }
  function clearState() { sessionStorage.removeItem(STATE_KEY); }

  function showStatus(message, tone = 'working') {
    let status = document.getElementById('lc-receipt-test-status');
    if (!status) {
      status = document.createElement('div'); status.id = 'lc-receipt-test-status';
      status.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:420px;box-sizing:border-box;padding:12px 36px 12px 14px;border:1px solid #7c9bc3;border-radius:6px;background:#edf5ff;color:#143b6b;box-shadow:0 5px 18px #0003;font:600 13px/1.4 Arial,sans-serif;';
      const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Close receipt test status');
      close.style.cssText = 'position:absolute;right:7px;top:5px;border:0;background:transparent;color:inherit;font:20px Arial;cursor:pointer;';
      close.addEventListener('click', () => status.remove()); status.appendChild(close);
      (document.body || document.documentElement).appendChild(status);
    }
    status.querySelector('[data-message]')?.remove();
    const text = document.createElement('span'); text.dataset.message = '1'; text.textContent = message; status.prepend(text);
    status.dataset.tone = tone;
    status.style.background = tone === 'error' ? '#fff0ed' : tone === 'success' ? '#edf9f1' : '#edf5ff';
    status.style.borderColor = tone === 'error' ? '#d16b58' : tone === 'success' ? '#58a66d' : '#7c9bc3';
    status.style.color = tone === 'error' ? '#8d2f20' : tone === 'success' ? '#256238' : '#143b6b';
  }
  function downloadControl() {
    return Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"]')).find(element =>
      ['download', 'download pdf', 'download receipt'].includes(label(element)) && !element.disabled && element.getAttribute('aria-disabled') !== 'true') || null;
  }
  function activateDownload(control) {
    control.setAttribute('target', '_self'); control.setAttribute('formtarget', '_self');
    const form = control.form || control.closest?.('form'); if (form) form.target = '_self'; control.click();
  }
  function continueReceiptDownload() {
    const state = readState();
    if (!state.pending || Date.now() - Number(state.startedAt || 0) > 120000) { clearState(); return; }
    showStatus('Dynamic Receipt opened. Waiting for Cin7’s Download button…');
    let attempts = 0; let observer;
    const findDownload = () => {
      attempts += 1; const control = downloadControl();
      if (control) {
        window.clearInterval(timer); observer?.disconnect(); setState({ pending:false, clicked:true });
        showStatus('Download found. Starting Cin7’s native receipt download…', 'success'); activateDownload(control); window.setTimeout(clearState, 15000); return;
      }
      if (attempts < 240) return;
      window.clearInterval(timer); observer?.disconnect(); clearState();
      showStatus('Receipt test failed: Cin7 did not show a Download button within 60 seconds.', 'error');
    };
    const timer = window.setInterval(findDownload, 250);
    observer = new MutationObserver(findDownload); observer.observe(document.documentElement, { childList:true, subtree:true }); findDownload();
  }
  document.addEventListener('click', event => {
    const control = event.target.closest?.('a,button,input[type="button"],input[type="submit"],[role="button"]');
    if (!control || label(control).includes('dynamic invoice')) return;
    const url = receiptHref(control);
    if (!url && !label(control).includes('dynamic receipt')) return;
    if (!url) { showStatus('Dynamic Receipt was found, but Cin7 did not provide a usable receipt link.', 'error'); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    setState({ pending:true, clicked:false, startedAt:Date.now(), source:location.href });
    showStatus('Opening Cin7 Dynamic Receipt in this tab…'); location.assign(url);
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', continueReceiptDownload, { once:true });
  else continueReceiptDownload();
})();
