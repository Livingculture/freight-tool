// ==UserScript==
// @name         Living Culture China Warehouse Popup Clean Mode
// @namespace    livingculture-china-warehouse-clean-popup
// @version      5.0
// @description  Adds China Warehouse button beside Install Fees and opens a cleaner popup stock page
// @author       Living Culture
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://lxexport.dearportal.com/*
// @match        https://*.dearportal.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-china-warehouse-popup-clean-mode.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-china-warehouse-popup-clean-mode.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STOCK_HASH =
    '#mc|MultiFilter-1-%7B%22MenuItemId%22%3A%22%22%2C%22Categories%22%3A%5B%5D%2C%22Brands%22%3A%5B%5D%2C%22Tags%22%3A%5B%5D%7D';

  const CHINA_WAREHOUSE_URL =
    'https://lxexport.dearportal.com/?lc_china_popup=1' + STOCK_HASH;

  const BUTTON_ID = 'lc-china-warehouse-btn';
  const STYLE_ID = 'lc-china-warehouse-style';
  const POPUP_STYLE_ID = 'lc-china-warehouse-popup-style';

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
    newButton.style.minWidth = 'unset';
    newButton.style.width = 'auto';
  }

  function openChinaWarehousePopup() {
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
      CHINA_WAREHOUSE_URL,
      'LivingCultureChinaWarehousePopup',
      features
    );

    if (!popup) {
      alert('Chrome blocked the China Warehouse popup. Please allow popups for Cin7, then click again.');
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
    btn.innerText = 'Foshan Warehouse';
    btn.title = 'Open China Warehouse stock page';

    copyExactButtonStyle(targetButton, btn);

    btn.addEventListener('click', openChinaWarehousePopup);

    targetButton.insertAdjacentElement('afterend', btn);
  }

  function addMainStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;

    style.innerHTML = `
      #${BUTTON_ID} {
        white-space: nowrap !important;
      }
    `;

    document.head.appendChild(style);
  }

  function isChinaWarehousePopupPage() {
    return (
      window.location.hostname.includes('dearportal.com') &&
      window.location.search.includes('lc_china_popup=1')
    );
  }

  function addCleanPopupMode() {
    if (!isChinaWarehousePopupPage()) return;
    if (document.getElementById(POPUP_STYLE_ID)) return;

    document.title = 'China Warehouse';

    const banner = document.createElement('div');
    banner.id = 'lc-china-popup-banner';
    banner.innerHTML = `
      <div class="lc-popup-title">
        <strong>China Warehouse</strong>
        <span>Stock availability view</span>
      </div>
      <button id="lc-popup-refresh-btn" type="button">Refresh</button>
    `;

    document.body.appendChild(banner);

    const style = document.createElement('style');
    style.id = POPUP_STYLE_ID;

    style.innerHTML = `
      body {
        background: #f3f6f8 !important;
      }

      #lc-china-popup-banner {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: 58px !important;
        z-index: 2147483647 !important;
        background: #ffffff !important;
        border-bottom: 1px solid #d9e2ea !important;
        box-shadow: 0 3px 12px rgba(15, 23, 42, 0.10) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 0 22px !important;
        box-sizing: border-box !important;
        font-family: Arial, sans-serif !important;
      }

      #lc-china-popup-banner .lc-popup-title {
        display: flex !important;
        flex-direction: column !important;
        gap: 2px !important;
      }

      #lc-china-popup-banner strong {
        color: #1f2937 !important;
        font-size: 18px !important;
        line-height: 1.1 !important;
      }

      #lc-china-popup-banner span {
        color: #667085 !important;
        font-size: 12px !important;
      }

      #lc-popup-refresh-btn {
        background: #13c2b8 !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 9px 14px !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }

      #lc-popup-refresh-btn:hover {
        background: #10afa6 !important;
      }

      body::before {
        content: "" !important;
        display: block !important;
        height: 58px !important;
      }

      /* Makes the loaded page feel more like an app panel */
      main,
      .main,
      .content,
      .container,
      .page,
      .page-content {
        background: #ffffff !important;
      }

      /* Softens common DEAR/Cin7 panels */
      table,
      section,
      article {
        border-radius: 8px !important;
      }

      input[type="text"],
      input[type="search"] {
        border-radius: 8px !important;
      }

      button {
        border-radius: 8px;
      }
    `;

    document.head.appendChild(style);

    const refreshBtn = document.getElementById('lc-popup-refresh-btn');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }

  function initMainCin7Page() {
    addMainStyles();
    addButton();
  }

  function init() {
    if (isChinaWarehousePopupPage()) {
      addCleanPopupMode();
      return;
    }

    if (window.location.hostname.includes('dearsystems.com')) {
      initMainCin7Page();
    }
  }

  setTimeout(init, 500);
  setTimeout(init, 1500);
  setTimeout(init, 3000);
  setTimeout(init, 6000);

  setInterval(() => {
    if (isChinaWarehousePopupPage()) {
      addCleanPopupMode();
    } else if (window.location.hostname.includes('dearsystems.com')) {
      initMainCin7Page();
    }
  }, 3000);
})();
