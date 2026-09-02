// ==UserScript==
// @name         Omni Living Culture HubSpot Shortcut
// @namespace    livingculture-omni
// @version      0.2.0
// @description  Removes the retired shortcut; HubSpot and Quote Review now use the Cin7 Workflow userscript.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hubspot-shortcut.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hubspot-shortcut.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  document.getElementById('lc-omni-hubspot-shortcut-button')?.remove();
  return;

  const HUBSPOT_URL = 'https://app.hubspot.com/';
  const BUTTON_ID = 'lc-omni-hubspot-shortcut-button';
  const PREFERRED_ANCHORS = [
    'lc-omni-china-warehouse-button',
    'lc-omni-product-availability-button',
    'lc-omni-containers-open'
  ];

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findAnchor() {
    for (const id of PREFERRED_ANCHORS) {
      const anchor = document.getElementById(id);
      if (visible(anchor)) return anchor;
    }
    return null;
  }

  function openHubSpot() {
    const popup = window.open(HUBSPOT_URL, 'LivingCultureOmniHubSpot');
    if (!popup) {
      window.alert('Chrome blocked HubSpot. Please allow popups for Cin7 Omni, then try again.');
      return;
    }
    popup.focus();
  }

  function ensureButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'HubSpot';
    button.title = 'Open HubSpot';
    button.addEventListener('click', openHubSpot);
    document.body.appendChild(button);
    return button;
  }

  function place() {
    const button = ensureButton();
    const anchor = findAnchor();
    if (!anchor) {
      button.style.display = 'none';
      return;
    }
    const rect = anchor.getBoundingClientRect();
    button.style.cssText = `position:absolute;display:inline-flex;align-items:center;justify-content:center;left:${window.scrollX + rect.right + 8}px;top:${window.scrollY + rect.top}px;z-index:54;box-sizing:border-box;width:auto;min-width:88px;height:${Math.max(34, rect.height)}px;padding:0 14px;color:#fff;background:#ff7a59;border:1px solid #e96545;border-radius:4px;box-shadow:none;font:700 13px Arial,sans-serif;line-height:1;cursor:pointer;white-space:nowrap;`;
  }

  function schedulePlace() {
    if (window.__lcOmniHubSpotShortcutFrame) return;
    window.__lcOmniHubSpotShortcutFrame = requestAnimationFrame(() => {
      window.__lcOmniHubSpotShortcutFrame = 0;
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
