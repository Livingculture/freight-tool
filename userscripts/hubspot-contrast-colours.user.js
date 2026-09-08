// ==UserScript==
// @name         Living Culture HubSpot Contrast & Colours
// @namespace    livingculture-hubspot
// @version      0.1.4
// @description  Makes HubSpot record text black and changes deal-stage pills to softer pastel colours.
// @author       Living Culture
// @match        https://app.hubspot.com/*
// @match        https://*.hubspot.com/*
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
    quote: ['#f8ddea', '#111111'],
    complete: ['#fff0c2', '#111111'],
    deposit: ['#dcefe3', '#111111'],
    paid: ['#e6e0f7', '#111111'],
    ready: ['#e6e0f7', '#111111'],
    default: ['#dfeef7', '#111111']
  };

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Record links are the green text seen in HubSpot's CRM tables. */
      table a:not([role="button"]),
      main a:not([role="button"]),
      [role="main"] a:not([role="button"]),
      [data-test-id*="table" i] a:not([role="button"]),
      [class*="IndexTable"] a:not([role="button"]),
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
        color: #111 !important;
      }
      .${STAGE_CLASS} * {
        background: transparent !important;
        background-color: transparent !important;
      }
      .${STAGE_CLASS}::before, .${STAGE_CLASS}::after,
      .${STAGE_CLASS} *::before, .${STAGE_CLASS} *::after {
        background: transparent !important;
        background-color: transparent !important;
        color: #111 !important;
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
    const leaf = candidates.sort((a, b) => {
      const aBox = a.getBoundingClientRect();
      const bBox = b.getBoundingClientRect();
      return aBox.width * aBox.height - bBox.width * bBox.height;
    })[0] || cell.firstElementChild || cell;
    return outerPill(leaf, cell);
  }

  function outerPill(element, boundary = null) {
    const label = clean(element?.textContent);
    const startingRect = element?.getBoundingClientRect();
    const maximumWidth = Math.min(340, Math.max(80, (startingRect?.width || 0) + 48));
    const maximumHeight = Math.min(55, Math.max(28, (startingRect?.height || 0) + 18));
    let pill = element;
    for (let node = element; node && node !== boundary; node = node.parentElement) {
      if (clean(node.textContent) !== label) break;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.width > maximumWidth || rect.height > maximumHeight) break;
      const style = getComputedStyle(node);
      const radius = parseFloat(style.borderRadius) || 0;
      const coloured = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
      if (radius >= 4 || coloured) pill = node;
    }
    return pill;
  }

  function colourDealStages() {
    // Remove styling from a whole cell if an earlier scan selected it. Only the
    // compact pill inside the cell should receive the pastel background.
    document.querySelectorAll(`td.${STAGE_CLASS}, th.${STAGE_CLASS}, [role="gridcell"].${STAGE_CLASS}, [role="cell"].${STAGE_CLASS}`)
      .forEach((cell) => {
        cell.classList.remove(STAGE_CLASS);
        cell.style.removeProperty('--lc-stage-bg');
        cell.style.removeProperty('--lc-stage-text');
      });
    const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]'));
    for (const header of headers.filter((element) => clean(element.textContent).toLowerCase().startsWith('deal stage'))) {
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

    // HubSpot also renders some list views as nested divs without table roles.
    // Stage pills are compact, so identify those by their displayed stage text.
    const stagePattern = /(opp\s*deal|quote[- ]?sent|deposit\s*paid|ready\s*to\s*deliver|completed)/i;
    for (const element of Array.from(document.querySelectorAll('span, button, div'))) {
      const label = clean(element.textContent);
      if (!label || label.length > 90 || !stagePattern.test(label)) continue;
      if (Array.from(element.children).some((child) => clean(child.textContent) === label)) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.width > 340 || rect.height > 55) continue;
      const pill = outerPill(element);
      const [background, text] = stageColours(label);
      pill.classList.add(STAGE_CLASS);
      pill.style.setProperty('--lc-stage-bg', background);
      pill.style.setProperty('--lc-stage-text', text);
    }
  }

  let scanQueued = false;
  function schedule() {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(() => {
      scanQueued = false;
      colourDealStages();
    });
  }

  addStyles();
  // Watch from document-start. MutationObserver callbacks run before the next
  // browser paint, allowing new HubSpot rows to receive their colours without
  // first displaying the original bright pills.
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
  schedule();
})();
