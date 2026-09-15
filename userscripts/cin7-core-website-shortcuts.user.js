// ==UserScript==
// @name         Cin7 Core Living Culture Website Shortcuts
// @namespace    livingculture-cin7
// @version      0.1.0
// @description  Adds the Living Culture website shortcuts to the Cin7 Core quote toolbar.
// @author       Living Culture
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @match        https://livingculture.co.nz/*
// @match        https://www.livingculture.co.nz/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-core-website-shortcuts.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-core-website-shortcuts.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const host = location.hostname.toLowerCase();
  if (host === 'livingculture.co.nz' || host === 'www.livingculture.co.nz') {
    if (window.name.startsWith('lc_core_')) document.documentElement.style.zoom = '0.8';
    return;
  }

  const BAR_ID = 'lc-core-website-shortcuts';
  const STYLE_ID = 'lc-core-website-shortcuts-style';
  const ANCHOR_LABELS = [
    'Foshan Warehouse',
    'NZ Availability',
    'Install Fees',
    'Custom Comments',
    'Custom Products',
    'Scan',
    'Family'
  ];
  const SHORTCUTS = [
    {
      label: 'Tasman',
      url: 'https://livingculture.co.nz/collections/tasman-pergola/products/lc150-premium-custom-freestanding-louvre-roof'
    },
    {
      label: 'Atlantic',
      url: 'https://livingculture.co.nz/collections/atlantic-pergola/products/atlantic-manual-freestanding-louvre-roof'
    },
    {
      label: 'Baltic',
      url: 'https://livingculture.co.nz/collections/baltic-pergola/products/baltic-freestanding-louvre-roof-aluminium-pergola'
    },
    {
      label: 'Caspian',
      url: 'https://livingculture.co.nz/collections/caspian-pergola/products/caspian-motorised-freestanding-louvre-roof-aluminium-pergola'
    },
    { label: 'Blinds', url: 'https://livingculture.co.nz/collections/blinds' },
    { label: 'Gas Fire Pits', url: 'https://livingculture.co.nz/collections/gas-fire-pits' },
    { label: 'Teak Sofa', url: 'https://livingculture.co.nz/collections/teak-lounge' },
    { label: 'Aluminium Sofa', url: 'https://livingculture.co.nz/collections/aluminium-lounge' },
    { label: 'Dining Tables', url: 'https://livingculture.co.nz/collections/dining-tables' },
    { label: 'Dining Chairs', url: 'https://livingculture.co.nz/collections/outdoor-dining-chairs' },
    { label: 'Bar Furniture', url: 'https://livingculture.co.nz/collections/outdoor-bar-furniture' },
    { label: 'Cantilever Umbrellas', url: 'https://livingculture.co.nz/collections/cantilever-umbrellas' },
    { label: 'Outdoor Grills', url: 'https://livingculture.co.nz/collections/charcoal-grills' },
    { label: 'Awnings', url: 'https://livingculture.co.nz/collections/awnings' },
    { label: 'Patio Covers', url: 'https://livingculture.co.nz/collections/wall-mounted-patio-cover' }
  ];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function buttonLabel(element) {
    return clean(element?.value || element?.textContent);
  }

  function visibleControls(root = document) {
    return Array.from(root.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'))
      .filter(visible);
  }

  function findToolbar() {
    const controls = visibleControls();
    const anchor = ANCHOR_LABELS
      .map(label => controls.find(element => buttonLabel(element).toLowerCase() === label.toLowerCase()))
      .find(Boolean);
    if (!anchor) return null;

    let current = anchor.parentElement;
    let fallback = current;
    while (current && current !== document.body) {
      const labels = visibleControls(current).map(element => buttonLabel(element).toLowerCase());
      const matches = ANCHOR_LABELS.filter(label => labels.includes(label.toLowerCase())).length;
      if (matches >= 2) return current;
      fallback = current;
      current = current.parentElement;
      if (current && current.getBoundingClientRect().height > 170) break;
    }
    return fallback;
  }

  function addStyles() {
    if (!document.head || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BAR_ID}{display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:6px!important;box-sizing:border-box!important;width:100%!important;margin:8px 0 0!important;padding:8px!important;border:1px solid #d8e0e8!important;border-radius:5px!important;background:#f7f9fb!important;}
      #${BAR_ID}[hidden]{display:none!important;}
      #${BAR_ID} .lc-core-web-label{margin:0 4px 0 2px!important;color:#36475a!important;font:700 12px Arial,sans-serif!important;white-space:nowrap!important;}
      #${BAR_ID} button{box-sizing:border-box!important;height:30px!important;min-width:88px!important;margin:0!important;padding:0 12px!important;border:1px solid #087f8c!important;border-radius:4px!important;background:#fff!important;color:#087f8c!important;font:700 12px Arial,sans-serif!important;line-height:28px!important;text-align:center!important;white-space:nowrap!important;cursor:pointer!important;}
      #${BAR_ID} button:hover,#${BAR_ID} button:focus-visible{border-color:#066c77!important;background:#e7f7f8!important;color:#055d67!important;outline:none!important;}
    `;
    document.head.appendChild(style);
  }

  function openShortcut(shortcut) {
    const browserWidth = window.outerWidth || window.innerWidth;
    const browserHeight = window.outerHeight || window.innerHeight;
    const browserLeft = Number.isFinite(window.screenX) ? window.screenX : window.screenLeft;
    const browserTop = Number.isFinite(window.screenY) ? window.screenY : window.screenTop;
    const width = Math.min(820, Math.max(680, Math.round(browserWidth * 0.4)));
    const height = Math.min(680, Math.max(520, Math.round(browserHeight * 0.6)));
    const left = Math.round(browserLeft + browserWidth - width - 18);
    const top = Math.round(browserTop + 44);
    const popupName = `lc_core_${shortcut.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const popup = window.open(
      shortcut.url,
      popupName,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    if (!popup) {
      window.alert(`Chrome blocked the ${shortcut.label} popup. Please allow popups for Cin7 Core and try again.`);
      return;
    }
    try { popup.moveTo(left, top); } catch (error) { /* The window.open position is normally sufficient. */ }
    popup.focus();
  }

  function ensureBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.hidden = true;
    bar.setAttribute('aria-label', 'Living Culture website shortcuts');

    const label = document.createElement('span');
    label.className = 'lc-core-web-label';
    label.textContent = 'Website:';
    bar.appendChild(label);

    for (const shortcut of SHORTCUTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = shortcut.label;
      button.title = `Open ${shortcut.label} on the Living Culture website`;
      button.addEventListener('click', () => openShortcut(shortcut));
      bar.appendChild(button);
    }
    return bar;
  }

  function place() {
    if (!document.body) return;
    addStyles();
    const toolbar = findToolbar();
    const bar = document.getElementById(BAR_ID) || ensureBar();
    if (!toolbar?.parentElement) {
      bar.hidden = true;
      return;
    }

    if (toolbar.nextElementSibling !== bar || bar.parentElement !== toolbar.parentElement) {
      toolbar.insertAdjacentElement('afterend', bar);
    }
    bar.hidden = false;
  }

  let scheduled = false;
  function schedulePlace() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      place();
    });
  }

  place();
  const observer = new MutationObserver(records => {
    if (records.every(record => record.target.closest?.(`#${BAR_ID}`))) return;
    schedulePlace();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedulePlace);
  window.addEventListener('hashchange', schedulePlace);
  window.setInterval(() => {
    const bar = document.getElementById(BAR_ID);
    if (!bar?.isConnected || bar.hidden) schedulePlace();
  }, 2500);
})();
