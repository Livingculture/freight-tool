// ==UserScript==
// @name         Omni Living Culture Website Shortcuts
// @namespace    livingculture-omni
// @version      0.1.26
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
  const SLOT_ID = 'lc-omni-website-shortcut-slot';
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
    {
      label: 'Blinds',
      url: 'https://livingculture.co.nz/collections/blinds'
    },
    {
      label: 'Gas Fire Pits',
      url: 'https://livingculture.co.nz/collections/gas-fire-pits'
    },
    {
      label: 'Teak Sofa',
      url: 'https://livingculture.co.nz/collections/teak-lounge'
    },
    {
      label: 'Aluminium Sofa',
      url: 'https://livingculture.co.nz/collections/aluminium-lounge'
    },
    {
      label: 'Dining Tables',
      url: 'https://livingculture.co.nz/collections/dining-tables'
    },
    {
      label: 'Dining Chairs',
      url: 'https://livingculture.co.nz/collections/outdoor-dining-chairs'
    },
    {
      label: 'Cantilever Umbrellas',
      url: 'https://livingculture.co.nz/collections/cantilever-umbrellas'
    },
    {
      label: 'Outdoor Grills',
      url: 'https://livingculture.co.nz/collections/charcoal-grills'
    },
    {
      label: 'Awnings',
      url: 'https://livingculture.co.nz/collections/awnings'
    },
    {
      label: 'Patio Covers',
      url: 'https://livingculture.co.nz/collections/wall-mounted-patio-cover'
    },
    {
      label: 'Bar Furniture',
      url: 'https://livingculture.co.nz/collections/outdoor-bar-furniture'
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

  function productTableCard() {
    const addLine = Array.from(document.querySelectorAll('button, input, a, [role="button"]'))
      .filter(visible)
      .find(element => /^add\s+a\s+new\s+line$/i.test(clean(element.value || element.textContent)));
    const headerRows = Array.from(document.querySelectorAll('tr')).filter(visible).filter(row => {
      const labels = Array.from(row.children).map(cell => clean(cell.textContent).toLowerCase());
      return labels.some(value => /(?:^|\s)code$/.test(value)) &&
        labels.some(value => /(?:^|\s)product$/.test(value));
    });
    const headerRow = headerRows.find(row => addLine && row.closest('table')?.parentElement?.contains(addLine)) || headerRows[0];
    const table = headerRow?.closest('table');
    if (!table) return null;
    let current = table.parentElement;
    while (current && current !== document.body) {
      if (addLine && current.contains(addLine)) return current;
      current = current.parentElement;
    }
    return table.parentElement;
  }

  function orderCurrencyCard() {
    const label = Array.from(document.querySelectorAll('label, div, span, td, th'))
      .filter(visible)
      .filter(element => /^order\s+currency$/i.test(clean(element.textContent)))
      .sort((a, b) => a.children.length - b.children.length)[0];
    if (!label) return null;
    const labelRect = label.getBoundingClientRect();
    let current = label.parentElement;
    let best = null;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const colour = getComputedStyle(current).backgroundColor;
      if (rect.width > window.innerWidth * 0.65 && rect.top <= labelRect.top && labelRect.top - rect.top < 120 && /rgb\(255, 255, 255\)|rgba\(255, 255, 255/.test(colour)) best = current;
      current = current.parentElement;
    }
    return best;
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
    const popup = window.open(shortcut.url, `lc_omni_${shortcut.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (!popup) window.alert(`Chrome blocked the ${shortcut.label} popup. Please allow popups for Cin7 Omni and try again.`);
    else {
      try { popup.moveTo(left, top); } catch (error) { /* Browser positioning from window.open is sufficient. */ }
      popup.focus();
    }
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
    const card = productTableCard();
    if (!card || !card.parentElement) {
      bar.style.display = 'none';
      return;
    }
    card.style.marginTop = '';
    let slot = document.getElementById(SLOT_ID);
    if (!slot) { slot = document.createElement('div'); slot.id = SLOT_ID; }
    if (slot.nextElementSibling !== card || slot.parentElement !== card.parentElement) card.parentElement.insertBefore(slot, card);
    slot.style.cssText = 'box-sizing:border-box;display:block;width:100%;height:64px;padding:0;background:#ededed;';
    if (bar.parentElement !== document.body) document.body.appendChild(bar);
    const cardRect = card.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    let previous = slot.previousElementSibling;
    while (previous && !visible(previous)) previous = previous.previousElementSibling;
    const gapTop = previous?.getBoundingClientRect().bottom ?? slotRect.top;
    const gapHeight = Math.max(30, cardRect.top - gapTop);
    const top = gapTop + (gapHeight - 30) / 2;
    bar.style.cssText = `position:absolute;display:flex;align-items:center;gap:7px;left:${window.scrollX + cardRect.left}px;top:${window.scrollY + top}px;z-index:55;height:30px;`;
    for (const button of bar.querySelectorAll('button')) {
      button.style.cssText = 'box-sizing:border-box;height:30px;min-width:92px;padding:0 14px;color:#13377e;background:#fff;border:1px solid #13377e;border-radius:4px;font:700 12px Arial,sans-serif;line-height:28px;text-align:center;cursor:pointer;white-space:nowrap;';
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
      return target && !target.closest?.(`#${BAR_ID}, #${SLOT_ID}`);
    })) schedulePlace();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, { passive: true });
  setInterval(place, 5000);
})();
