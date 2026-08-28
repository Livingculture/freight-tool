// ==UserScript==
// @name         Omni Living Culture Product Availability
// @namespace    livingculture-omni
// @version      0.1.0
// @description  Adds an NZ Availability button beside LC Containers on Cin7 Omni.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-product-availability.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-product-availability.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PRODUCT_AVAILABILITY_URL = 'https://inventory.dearsystems.com/Stock';
  const BUTTON_ID = 'lc-omni-product-availability-button';
  const CONTAINER_BUTTON_ID = 'lc-omni-containers-open';

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function openPopup() {
    const width = Math.min(1500, Math.max(1000, Math.round(screen.availWidth * 0.82)));
    const height = Math.min(900, Math.max(700, Math.round(screen.availHeight * 0.84)));
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    const popup = window.open(
      PRODUCT_AVAILABILITY_URL,
      'LivingCultureOmniProductAvailabilityPopup',
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=yes,status=no`
    );
    if (!popup) window.alert('Chrome blocked the Product Availability popup. Please allow popups for Cin7 Omni, then try again.');
    else popup.focus();
  }

  function ensureButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'NZ Availability';
    button.title = 'Open Product Availability / Stock page';
    button.addEventListener('click', openPopup);
    document.body.appendChild(button);
    return button;
  }

  function place() {
    const button = ensureButton();
    const anchor = document.getElementById(CONTAINER_BUTTON_ID);
    if (!anchor || !visible(anchor)) {
      button.style.display = 'none';
      return;
    }
    const rect = anchor.getBoundingClientRect();
    button.style.cssText = `position:absolute;display:inline-flex;align-items:center;justify-content:center;left:${window.scrollX + rect.right + 8}px;top:${window.scrollY + rect.top}px;z-index:52;box-sizing:border-box;width:auto;min-width:0;height:${Math.max(34, rect.height)}px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;box-shadow:none;font:700 13px Arial,sans-serif;line-height:1;cursor:pointer;white-space:nowrap;`;
  }

  function schedulePlace() {
    if (window.__lcOmniAvailabilityFrame) return;
    window.__lcOmniAvailabilityFrame = requestAnimationFrame(() => {
      window.__lcOmniAvailabilityFrame = 0;
      place();
    });
  }

  place();
  new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target && !target.closest?.(`#${BUTTON_ID}`);
    })) schedulePlace();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });
  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, { passive: true });
  setInterval(place, 5000);
})();
