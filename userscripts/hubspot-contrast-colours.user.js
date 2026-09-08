// ==UserScript==
// @name         Living Culture HubSpot Contrast & Colours
// @namespace    livingculture-hubspot
// @version      0.1.0
// @description  Makes HubSpot record text black and changes deal-stage pills to softer pastel colours.
// @author       Living Culture
// @match        https://app.hubspot.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/hubspot-contrast-colours.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/hubspot-contrast-colours.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'lc-hubspot-contrast-colours';
  const STAGE_CLASS = 'lc-hubspot-pastel-stage';
  const colours = {
    quote: ['#f8ddea', '#5f173c'],
    complete: ['#fff0c2', '#5c4610'],
    deposit: ['#dcefe3', '#174d2d'],
    paid: ['#e6e0f7', '#39266f'],
    ready: ['#e6e0f7', '#39266f'],
    default: ['#dfeef7', '#183f58']
  };

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Record links are the green text seen in HubSpot's CRM tables. */
      table a:not([role="button"]),
      [role="grid"] [role="gridcell"] a:not([role="button"]),
      [role="table"] [role="cell"] a:not([role="button"]) {
        color: #111 !important;
        text-decoration-color: #777 !important;
      }

      table td, table th,
      [role="grid"] [role="gridcell"],
      [role="grid"] [role="columnheader"],
      [role="table"] [role="cell"],
      [role="table"] [role="columnheader"] {
        color: #111 !important;
      }

      .${STAGE_CLASS} {
        background: var(--lc-stage-bg) !important;
        background-color: var(--lc-stage-bg) !important;
        color: var(--lc-stage-text) !important;
        border-color: color-mix(in srgb, var(--lc-stage-text) 18%, transparent) !important;
        box-shadow: none !important;
      }
      .${STAGE_CLASS}, .${STAGE_CLASS} * {
        color: var(--lc-stage-text) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stageColours(label) {
    const value = label.toLowerCase();
    if (value.includes('quote')) return colours.quote;
    if (value.includes('complete')) return colours.complete;
    if (value.includes('deposit')) return colours.deposit;
    if (value.includes('paid')) return colours.paid;
    if (value.includes('ready')) return colours.ready;
    return colours.default;
  }

  function columnParts(header) {
    const headerCell = header.closest('th, [role="columnheader"]') || header;
    const parent = headerCell.parentElement;
    const siblings = parent ? Array.from(parent.children) : [];
    return {
      index: siblings.indexOf(headerCell),
      ariaIndex: headerCell.getAttribute('aria-colindex')
    };
  }

  function findPill(cell) {
    const label = clean(cell.textContent);
    if (!label) return null;
    const candidates = Array.from(cell.querySelectorAll('span, div, button'))
      .filter((element) => clean(element.textContent) === label)
      .filter((element) => !Array.from(element.children).some((child) => clean(child.textContent) === label));
    return candidates.sort((a, b) => {
      const aBox = a.getBoundingClientRect();
      const bBox = b.getBoundingClientRect();
      return aBox.width * aBox.height - bBox.width * bBox.height;
    })[0] || cell.firstElementChild || cell;
  }

  function colourDealStages() {
    const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]'));
    for (const header of headers.filter((element) => clean(element.textContent).toLowerCase() === 'deal stage')) {
      const { index, ariaIndex } = columnParts(header);
      const table = header.closest('table, [role="grid"], [role="table"]');
      if (!table) continue;
      const rows = Array.from(table.querySelectorAll('tr, [role="row"]'));
      for (const row of rows) {
        let cell = ariaIndex ? row.querySelector(`[aria-colindex="${ariaIndex}"]`) : null;
        if (!cell && index >= 0) {
          const cells = Array.from(row.children).filter((element) => element.matches('td, th, [role="gridcell"], [role="cell"]'));
          cell = cells[index] || null;
        }
        if (!cell || cell === header || clean(cell.textContent).toLowerCase() === 'deal stage') continue;
        const pill = findPill(cell);
        if (!pill) continue;
        const [background, text] = stageColours(clean(cell.textContent));
        pill.classList.add(STAGE_CLASS);
        pill.style.setProperty('--lc-stage-bg', background);
        pill.style.setProperty('--lc-stage-text', text);
      }
    }
  }

  let timer = 0;
  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(colourDealStages, 80);
  }

  addStyles();
  const start = () => {
    colourDealStages();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
