// ==UserScript==
// @name         Product Availability
// @namespace    livingculture-product-availability
// @version      1.1
// @description  Adds a Product Availability button beside China Warehouse and matches its exact style
// @author       Living Culture
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/product-availability.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/product-availability.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PRODUCT_AVAILABILITY_URL = 'https://inventory.dearsystems.com/Stock';

  const BUTTON_ID = 'lc-product-availability-btn';

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  }

  function findButtonByText(textToFind) {
    const items = Array.from(
      document.querySelectorAll('button, a, div[role="button"], input[type="button"]')
    );

    return items.find(el => {
      const text = cleanText(el.innerText || el.value || '').toLowerCase();
      return isVisible(el) && text === textToFind.toLowerCase();
    });
  }

  function findTargetButton() {
    return (
      findButtonByText('China Warehouse') ||
      findButtonByText('Install Fees') ||
      findButtonByText('Custom Products') ||
      findButtonByText('Promo Summary')
    );
  }

  function copyExactButtonStyle(sourceButton, newButton) {
    const s = window.getComputedStyle(sourceButton);

    if (sourceButton.className) {
      newButton.className = sourceButton.className;
    }

    newButton.style.background = s.background;
    newButton.style.backgroundColor = s.backgroundColor;
    newButton.style.color = s.color;
    newButton.style.border = s.border;
    newButton.style.borderRadius = s.borderRadius;
    newButton.style.padding = s.padding;
    newButton.style.font = s.font;
    newButton.style.fontSize = s.fontSize;
    newButton.style.fontWeight = s.fontWeight;
    newButton.style.fontFamily = s.fontFamily;
    newButton.style.lineHeight = s.lineHeight;
    newButton.style.height = s.height;
    newButton.style.minHeight = s.minHeight;
    newButton.style.maxHeight = s.maxHeight;
    newButton.style.boxShadow = s.boxShadow;
    newButton.style.display = s.display === 'none' ? 'inline-flex' : s.display;
    newButton.style.alignItems = 'center';
    newButton.style.justifyContent = 'center';
    newButton.style.verticalAlign = s.verticalAlign;
    newButton.style.marginLeft = '8px';
    newButton.style.marginRight = '0';
    newButton.style.cursor = 'pointer';
    newButton.style.whiteSpace = 'nowrap';

    // Important: do not force it wider than needed
    newButton.style.minWidth = 'unset';
    newButton.style.width = 'auto';
  }

  function openProductAvailabilityPopup() {
    const popupWidth = 1500;
    const popupHeight = 900;

    const left = Math.max(0, Math.round((window.screen.width - popupWidth) / 2));
    const top = Math.max(0, Math.round((window.screen.height - popupHeight) / 2));

    const features = [
      `width=${popupWidth}`,
      `height=${popupHeight}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes',
      'toolbar=no',
      'menubar=no',
      'location=yes',
      'status=no'
    ].join(',');

    const popup = window.open(
      PRODUCT_AVAILABILITY_URL,
      'LivingCultureProductAvailabilityPopup',
      features
    );

    if (!popup) {
      alert('Chrome blocked the Product Availability popup. Please allow popups for Cin7, then click again.');
      return;
    }

    popup.focus();
  }

  function removeOldButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
  }

  function addButton() {
    const targetButton = findTargetButton();
    if (!targetButton) return;

    const existing = document.getElementById(BUTTON_ID);

    if (existing && existing.previousElementSibling === targetButton) {
      copyExactButtonStyle(targetButton, existing);
      return;
    }

    removeOldButton();

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';

    // Shorter label keeps the box size closer to the others
    btn.innerText = 'NZ Availability';
    btn.title = 'Open Product Availability / Stock page';

    copyExactButtonStyle(targetButton, btn);

    btn.addEventListener('click', openProductAvailabilityPopup);

    targetButton.insertAdjacentElement('afterend', btn);
  }

  function init() {
    addButton();
  }

  setTimeout(init, 500);
  setTimeout(init, 1500);
  setTimeout(init, 3000);
  setTimeout(init, 6000);

  setInterval(init, 3000);
})();
