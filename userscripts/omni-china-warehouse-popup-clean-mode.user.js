// ==UserScript==
// @name         Omni Living Culture China Warehouse Popup Clean Mode
// @namespace    livingculture-omni
// @version      0.1.0
// @description  Adds Foshan Warehouse beside NZ Availability in Omni and cleans the warehouse popup display.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @match        https://lxexport.dearportal.com/*
// @match        https://*.dearportal.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-china-warehouse-popup-clean-mode.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-china-warehouse-popup-clean-mode.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STOCK_HASH = '#mc|MultiFilter-1-%7B%22MenuItemId%22%3A%22%22%2C%22Categories%22%3A%5B%5D%2C%22Brands%22%3A%5B%5D%2C%22Tags%22%3A%5B%5D%7D';
  const WAREHOUSE_URL = `https://lxexport.dearportal.com/?lc_china_popup=1${STOCK_HASH}`;
  const BUTTON_ID = 'lc-omni-china-warehouse-button';
  const AVAILABILITY_BUTTON_ID = 'lc-omni-product-availability-button';
  const BANNER_ID = 'lc-omni-china-popup-banner';

  function popupPage() {
    return location.hostname.includes('dearportal.com') && location.search.includes('lc_china_popup=1');
  }

  function cleanPopup() {
    if (!popupPage() || document.getElementById(BANNER_ID)) return;
    document.title = 'China Warehouse';
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.innerHTML = '<div><strong>China Warehouse</strong><span>Stock availability view</span></div><button type="button">Refresh</button>';
    document.body.appendChild(banner);
    const style = document.createElement('style');
    style.textContent = `
      body { background:#eef2f7 !important; }
      body::before { content:"" !important; display:block !important; height:58px !important; }
      #${BANNER_ID} { position:fixed !important;inset:0 0 auto 0 !important;height:58px !important;z-index:2147483647 !important;box-sizing:border-box !important;display:flex !important;align-items:center !important;justify-content:space-between !important;padding:0 22px !important;color:#fff !important;background:#13377e !important;border-bottom:1px solid #0f2e6a !important;box-shadow:0 3px 12px rgba(15,46,106,.22) !important;font-family:Arial,sans-serif !important; }
      #${BANNER_ID} div { display:flex !important;flex-direction:column !important;gap:2px !important; }
      #${BANNER_ID} strong { color:#fff !important;font-size:18px !important;line-height:1.1 !important; }
      #${BANNER_ID} span { color:#dce6f4 !important;font-size:12px !important; }
      #${BANNER_ID} button { padding:8px 14px !important;color:#13377e !important;background:#fff !important;border:1px solid #fff !important;border-radius:4px !important;font:700 13px Arial,sans-serif !important;cursor:pointer !important; }
      main,.main,.content,.container,.page,.page-content { background:#fff !important; }
      table,section,article,input[type="text"],input[type="search"],button { border-radius:6px !important; }
    `;
    document.head.appendChild(style);
    banner.querySelector('button').addEventListener('click', () => location.reload());
  }

  if (popupPage()) {
    cleanPopup();
    new MutationObserver(cleanPopup).observe(document.documentElement, { childList:true, subtree:true });
    return;
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function openWarehouse() {
    const width = Math.min(1500, Math.max(1000, Math.round(screen.availWidth * 0.82)));
    const height = Math.min(900, Math.max(700, Math.round(screen.availHeight * 0.84)));
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    const popup = window.open(WAREHOUSE_URL, 'LivingCultureOmniChinaWarehousePopup', `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=yes,status=no`);
    if (!popup) window.alert('Chrome blocked the China Warehouse popup. Please allow popups for Cin7 Omni, then try again.');
    else popup.focus();
  }

  function button() {
    let element = document.getElementById(BUTTON_ID);
    if (element) return element;
    element = document.createElement('button');
    element.id = BUTTON_ID;
    element.type = 'button';
    element.textContent = 'Foshan Warehouse';
    element.title = 'Open China Warehouse stock page';
    element.addEventListener('click', openWarehouse);
    document.body.appendChild(element);
    return element;
  }

  function place() {
    const element = button();
    const anchor = document.getElementById(AVAILABILITY_BUTTON_ID);
    if (!anchor || !visible(anchor)) { element.style.display = 'none'; return; }
    const rect = anchor.getBoundingClientRect();
    element.style.cssText = `position:absolute;display:inline-flex;align-items:center;justify-content:center;left:${scrollX + rect.right + 8}px;top:${scrollY + rect.top}px;z-index:53;box-sizing:border-box;width:auto;height:${Math.max(34,rect.height)}px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;box-shadow:none;font:700 13px Arial,sans-serif;line-height:1;cursor:pointer;white-space:nowrap;`;
  }

  function schedule() {
    if (window.__lcOmniChinaWarehouseFrame) return;
    window.__lcOmniChinaWarehouseFrame = requestAnimationFrame(() => { window.__lcOmniChinaWarehouseFrame = 0; place(); });
  }

  place();
  new MutationObserver(records => {
    if (records.some(record => { const target=record.target instanceof Element?record.target:record.target.parentElement;return target&&!target.closest?.(`#${BUTTON_ID}`); })) schedule();
  }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style'] });
  addEventListener('resize', schedule);
  addEventListener('scroll', schedule, { passive:true });
  setInterval(place, 5000);
})();
