// ==UserScript==
// @name         Living Culture Cin7 Site Visit Button
// @namespace    https://livingculture.co.nz/
// @version      1.0.0
// @description  Adds a Site Visit button next to Install Fees on Cin7 Sale pages.
// @author       Living Culture
// @match        https://inventory.dearsystems.com/Sale*
// @match        https://inventory.dearsystems.com/Sale#*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-site-visit-link.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-site-visit-link.user.js
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'lc-site-visit-inline-button';
  const WORKFLOW_SITE_VISIT_URL = 'https://living-culture-workflow.vercel.app/?planner=site-visit';

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getScanButton() {
    return Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(isElementVisible)
      .find((element) => clean(element.textContent || '').toLowerCase() === 'scan');
  }

  function getInstallFeesButton() {
    return Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(isElementVisible)
      .find((element) => clean(element.textContent || '').toLowerCase() === 'install fees');
  }

  function getFieldValueByLabel(labelText) {
    const labels = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(isElementVisible)
      .filter((node) => clean(node.textContent || '').toLowerCase() === labelText.toLowerCase());

    for (const label of labels) {
      const root = label.closest('fieldset, .row, .col, .form-group, div');
      if (!root) continue;
      const input = root.querySelector('input, textarea, select');
      if (!input) continue;
      const value = input.value || input.getAttribute('value') || '';
      if (clean(value)) return clean(value);
    }

    return '';
  }

  function buildWorkflowUrl() {
    const params = new URLSearchParams();

    const customerName = getFieldValueByLabel('Customer');
    const phone = getFieldValueByLabel('Phone');
    const email = getFieldValueByLabel('Email');
    const address1 = getFieldValueByLabel('Shipping address line 1');
    const address2 = getFieldValueByLabel('Shipping address line 2');
    const reference = getFieldValueByLabel('Reference');
    const date = getFieldValueByLabel('Date');

    if (customerName) params.set('customerName', customerName);
    if (phone) params.set('phone', phone);
    if (email) params.set('email', email);
    if (reference) params.set('orderId', reference);
    if (date) params.set('bookedDate', date);

    const address = clean(`${address1} ${address2}`);
    if (address) params.set('address', address);

    params.set('sourceUrl', window.location.href);

    return `${WORKFLOW_SITE_VISIT_URL}&${params.toString()}`;
  }

  function addButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const anchor = getInstallFeesButton() || getScanButton();
    if (!anchor) return;

    const anchorRect = anchor.getBoundingClientRect();

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Site Visit';
    button.style.background = '#05cbbf';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cbbf';
    button.style.borderRadius = '4px';
    button.style.padding = '0 14px';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.height = `${Math.max(34, anchorRect.height || 34)}px`;
    button.style.lineHeight = '1';
    button.style.marginLeft = '8px';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';

    button.addEventListener('mouseenter', () => {
      button.style.background = '#04b5aa';
      button.style.borderColor = '#04b5aa';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#05cbbf';
      button.style.borderColor = '#05cbbf';
    });

    button.addEventListener('click', () => {
      window.open(buildWorkflowUrl(), '_blank', 'noopener,noreferrer');
    });

    anchor.insertAdjacentElement('afterend', button);
  }

  function boot() {
    addButton();
    setTimeout(addButton, 500);
    setTimeout(addButton, 1500);
    setTimeout(addButton, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  const observer = new MutationObserver(() => addButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
