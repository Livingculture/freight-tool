// ==UserScript==
// @name         Omni Living Culture Hide Order Settings
// @namespace    livingculture-omni
// @version      0.1.2
// @description  Collapses the Omni order settings card by default and adds a small chevron to show or hide it.
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
  const TOGGLE_ROW_ID = 'lc-omni-order-settings-toggle-row';
  let activeCard = null;

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

  function ensureToggle(card) {
    let row = document.getElementById(TOGGLE_ROW_ID);
    if (row && activeCard !== card) {
      row.remove();
      row = null;
    }
    activeCard = card;
    if (row) return;

    row = document.createElement('div');
    row.id = TOGGLE_ROW_ID;
    row.style.cssText = 'box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:20px;margin:0;padding:0;background:transparent;';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '⌄';
    button.title = 'Show order settings';
    button.setAttribute('aria-label', 'Show order settings');
    button.style.cssText = 'box-sizing:border-box;width:34px;height:16px;padding:0;border:1px solid #b8bdc5;border-radius:0 0 7px 7px;background:#d7d9dd;color:#69717d;font:700 16px/12px Arial,sans-serif;text-align:center;cursor:pointer;';
    button.addEventListener('click', () => {
      const collapsed = getComputedStyle(card).display === 'none';
      if (collapsed) {
        card.style.removeProperty('display');
        button.textContent = '⌃';
        button.title = 'Hide order settings';
        button.setAttribute('aria-label', 'Hide order settings');
      } else {
        card.style.setProperty('display', 'none', 'important');
        button.textContent = '⌄';
        button.title = 'Show order settings';
        button.setAttribute('aria-label', 'Show order settings');
      }
    });
    row.appendChild(button);
    card.parentElement?.insertBefore(row, card);
  }

  function hideCard() {
    const card = activeCard?.isConnected ? activeCard : findCard();
    if (!card) return;
    ensureToggle(card);
    if (card.dataset.lcOrderSettingsInitialised === '1') return;
    card.dataset.lcOrderSettingsInitialised = '1';
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
