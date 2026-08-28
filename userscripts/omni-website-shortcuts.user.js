// ==UserScript==
// @name         Omni Living Culture Website Shortcuts
// @namespace    livingculture-omni
// @version      0.1.3
// @description  Adds Living Culture website shortcuts to the grey space between Cin7 Omni quote sections.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @match        https://livingculture.co.nz/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-website-shortcuts.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-website-shortcuts.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (location.hostname === 'livingculture.co.nz') {
    if (window.name.startsWith('lc_omni_')) {
      document.documentElement.style.zoom = '0.8';
    }
    return;
  }

  const BAR_ID = 'lc-omni-website-shortcuts';
  const SHORTCUTS = [
    {
      label: 'Tasman',
      url: 'https://livingculture.co.nz/collections/tasman-pergola/products/lc150-premium-custom-freestanding-louvre-roof'
    },
    {
      label: 'Atlantic',
      url: 'https://livingculture.co.nz/collections/atlantic-pergola/products/atlantic-manual-freestanding-louvre-roof'
    }
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

  function orderCurrencyLabel() {
    return Array.from(document.querySelectorAll('label, div, span, td, th'))
      .filter(visible)
      .filter(element => !element.closest(`#${BAR_ID}`))
      .filter(element => /^order\s+currency$/i.test(clean(element.textContent)))
      .sort((a, b) => a.children.length - b.children.length)[0] || null;
  }

  function currencyCard(label) {
    const labelRect = label?.getBoundingClientRect();
    if (!labelRect) return null;
    let current = label.parentElement;
    let best = null;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const style = getComputedStyle(current);
      if (rect.width > window.innerWidth * 0.65 && rect.top < labelRect.top && labelRect.top - rect.top < 100 && /rgb\(255, 255, 255\)|rgba\(255, 255, 255/.test(style.backgroundColor)) best = current;
      current = current.parentElement;
    }
    return best;
  }

  function productTableCard() {
    const codeHeader = Array.from(document.querySelectorAll('th, td'))
      .filter(visible)
      .find(element => /(?:^|\s)code$/i.test(clean(element.textContent)));
    const table = codeHeader?.closest('table');
    const headerRect = codeHeader?.getBoundingClientRect();
    if (!table || !headerRect) return null;
    let current = table.parentElement;
    let best = null;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const style = getComputedStyle(current);
      if (rect.width > window.innerWidth * 0.65 && rect.top <= headerRect.top && headerRect.top - rect.top < 90 && /rgb\(255, 255, 255\)|rgba\(255, 255, 255/.test(style.backgroundColor)) best = current;
      current = current.parentElement;
    }
    return best || table.parentElement;
  }

  function openShortcut(shortcut) {
    const width = Math.min(820, Math.max(680, Math.round(screen.availWidth * 0.52)));
    const height = Math.min(680, Math.max(520, Math.round(screen.availHeight * 0.65)));
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    const popup = window.open(shortcut.url, `lc_omni_${shortcut.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (!popup) window.alert(`Chrome blocked the ${shortcut.label} popup. Please allow popups for Cin7 Omni and try again.`);
    else popup.focus();
  }

  function ensureBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = BAR_ID;
    for (const shortcut of SHORTCUTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = shortcut.label;
      button.addEventListener('click', () => openShortcut(shortcut));
      bar.appendChild(button);
    }
    document.body.appendChild(bar);
    return bar;
  }

  function place() {
    const bar = ensureBar();
    const label = orderCurrencyLabel();
    const upperCard = currencyCard(label);
    const card = productTableCard();
    if (upperCard) upperCard.style.marginTop = '';
    if (!label || !card) {
      bar.style.display = 'none';
      return;
    }
    card.style.marginTop = '48px';
    const movedCardRect = card.getBoundingClientRect();
    bar.style.cssText = `position:absolute;display:flex;align-items:center;gap:7px;left:${window.scrollX + movedCardRect.left + 16}px;top:${window.scrollY + movedCardRect.top - 39}px;z-index:55;height:30px;`;
    for (const button of bar.querySelectorAll('button')) {
      button.style.cssText = 'box-sizing:border-box;height:30px;min-width:92px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;font:700 12px Arial,sans-serif;line-height:28px;text-align:center;cursor:pointer;white-space:nowrap;';
    }
  }

  function schedulePlace() {
    if (window.__lcOmniWebsiteShortcutFrame) return;
    window.__lcOmniWebsiteShortcutFrame = requestAnimationFrame(() => {
      window.__lcOmniWebsiteShortcutFrame = 0;
      place();
    });
  }

  place();
  new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target && !target.closest?.(`#${BAR_ID}`);
    })) schedulePlace();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, { passive: true });
  setInterval(place, 5000);
})();
