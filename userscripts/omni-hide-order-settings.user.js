// ==UserScript==
// @name         Omni Living Culture Hide Order Settings
// @namespace    livingculture-omni
// @version      0.1.1
// @description  Hides the Order Currency, Exchange Rate, Price Tier and Order Tax Calculation card in Cin7 Omni.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hide-order-settings.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hide-order-settings.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const REQUIRED_TEXT = [
    'Order Currency',
    'Exchange Rate',
    'Price Tier',
    'Order Tax Calculation'
  ];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function findCard() {
    const orderCurrency = Array.from(document.querySelectorAll('label, div, span, td, th'))
      .find(element => clean(element.textContent) === 'Order Currency');
    if (!orderCurrency) return null;

    let element = orderCurrency;
    let matched = null;
    while (element && element !== document.body) {
      const text = clean(element.textContent);
      if (REQUIRED_TEXT.every(label => text.includes(label))) {
        const rect = element.getBoundingClientRect();
        if (rect.height > 0 && rect.height < 320 && rect.width > 600) matched = element;
        else if (matched) break;
      }
      element = element.parentElement;
    }
    return matched;
  }

  function hideCard() {
    const card = findCard();
    if (!card || card.dataset.lcOrderSettingsHidden === '1') return;
    card.dataset.lcOrderSettingsHidden = '1';
    card.style.setProperty('display', 'none', 'important');
  }

  function schedule() {
    if (window.__lcHideOrderSettingsFrame) return;
    window.__lcHideOrderSettingsFrame = requestAnimationFrame(() => {
      window.__lcHideOrderSettingsFrame = 0;
      hideCard();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  hideCard();
  setInterval(hideCard, 1000);
})();
