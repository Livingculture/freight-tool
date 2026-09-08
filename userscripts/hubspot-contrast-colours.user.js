// ==UserScript==
// @name         Living Culture HubSpot Contrast & Colours
// @namespace    livingculture-hubspot
// @version      0.1.10
// @description  Adjusts HubSpot record text and changes deal-stage pills to softer pastel colours.
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
  const CONTROLS_ID = 'lc-hubspot-colour-controls';
  const SETTINGS_KEY = 'lcHubSpotColourSettingsV2';
  const defaults = {
    quote: '#f8ddea', complete: '#fff0c2', deposit: '#dcefe3',
    paid: '#e6e0f7', default: '#dfeef7', linkText: '#00a4bd',
    tableText: '#33475b', pillText: '#111111', strength: 100
  };
  let settings = { ...defaults };
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (error) {}

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
        color: var(--lc-hubspot-link-text, #00a4bd) !important;
        text-decoration-color: var(--lc-hubspot-link-text, #00a4bd) !important;
      }
      table a:not([role="button"]) *:not(svg):not(path),
      main a:not([role="button"]) *:not(svg):not(path),
      [role="main"] a:not([role="button"]) *:not(svg):not(path),
      [role="grid"] [role="gridcell"] a:not([role="button"]) *:not(svg):not(path),
      [role="table"] [role="cell"] a:not([role="button"]) *:not(svg):not(path) {
        color: var(--lc-hubspot-link-text, #00a4bd) !important;
        text-decoration-color: var(--lc-hubspot-link-text, #00a4bd) !important;
      }

      table td, table th,
      [role="grid"] [role="gridcell"],
      [role="grid"] [role="columnheader"],
      [role="table"] [role="cell"],
      [role="table"] [role="columnheader"] {
        color: var(--lc-hubspot-table-text, #111) !important;
      }

      table td *:not(a):not(svg):not(path),
      [role="grid"] [role="gridcell"] *:not(a):not(svg):not(path),
      [role="table"] [role="cell"] *:not(a):not(svg):not(path) {
        color: var(--lc-hubspot-table-text, #111) !important;
      }

      .${STAGE_CLASS} {
        background: var(--lc-stage-bg) !important;
        background-color: var(--lc-stage-bg) !important;
        color: var(--lc-stage-text) !important;
        border-color: color-mix(in srgb, var(--lc-stage-text) 18%, transparent) !important;
        box-shadow: none !important;
      }
      .${STAGE_CLASS}, .${STAGE_CLASS} * {
        color: var(--lc-stage-text, #111) !important;
      }
      .${STAGE_CLASS} * {
        background: transparent !important;
        background-color: transparent !important;
      }
      .${STAGE_CLASS}::before, .${STAGE_CLASS}::after,
      .${STAGE_CLASS} *::before, .${STAGE_CLASS} *::after {
        background: transparent !important;
        background-color: transparent !important;
        color: var(--lc-stage-text, #111) !important;
      }
      #${CONTROLS_ID} { position:fixed!important; right:18px!important; bottom:18px!important; z-index:2147483646!important; font:600 13px Arial,sans-serif!important; color:#111!important; }
      #${CONTROLS_ID}.lc-colours-docked { position:relative!important; right:auto!important; bottom:auto!important; display:inline-block!important; margin-left:8px!important; vertical-align:middle!important; }
      #${CONTROLS_ID} button { border:1px solid #aaa!important; border-radius:7px!important; background:#fff!important; color:#111!important; padding:8px 12px!important; font:inherit!important; cursor:pointer!important; box-shadow:0 2px 8px rgba(0,0,0,.14)!important; }
      #${CONTROLS_ID} > button[data-action="toggle"] { border-color:#ff5c35!important; background:#ff5c35!important; color:#fff!important; }
      #${CONTROLS_ID} .lc-colour-panel { position:absolute!important; right:0!important; bottom:43px!important; width:245px!important; padding:14px!important; border:1px solid #c8c8c8!important; border-radius:10px!important; background:#fff!important; color:#111!important; box-shadow:0 8px 28px rgba(0,0,0,.2)!important; }
      #${CONTROLS_ID} .lc-colour-panel[hidden] { display:none!important; }
      #${CONTROLS_ID} label { display:flex!important; align-items:center!important; justify-content:space-between!important; gap:12px!important; margin:8px 0!important; color:#111!important; }
      #${CONTROLS_ID} input[type="color"] { width:44px!important; height:27px!important; padding:1px!important; border:1px solid #aaa!important; border-radius:5px!important; background:#fff!important; }
      #${CONTROLS_ID} input[type="range"] { width:120px!important; }
      #${CONTROLS_ID} .lc-colour-actions { display:flex!important; justify-content:flex-end!important; margin-top:11px!important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stageColours(label) {
    const value = label.toLowerCase();
    let background = settings.default;
    if (value.includes('quote')) background = settings.quote;
    else if (value.includes('complete')) background = settings.complete;
    else if (value.includes('deposit')) background = settings.deposit;
    else if (value.includes('paid') || value.includes('ready')) background = settings.paid;
    return [mixWithWhite(background, Number(settings.strength)), mixWithWhite(settings.pillText, Number(settings.strength))];
  }

  function mixWithWhite(hex, strength) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return '#eeeeee';
    const amount = Math.max(0, Math.min(100, strength)) / 100;
    const parts = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
    return `#${parts.map((part) => Math.round(255 - (255 - part) * amount).toString(16).padStart(2, '0')).join('')}`;
  }

  function applyThemeColours() {
    document.documentElement.style.setProperty('--lc-hubspot-link-text', mixWithWhite(settings.linkText, Number(settings.strength)));
    document.documentElement.style.setProperty('--lc-hubspot-table-text', mixWithWhite(settings.tableText, Number(settings.strength)));
  }

  function ensureControls() {
    if (!document.body || document.getElementById(CONTROLS_ID)) return;
    const root = document.createElement('div');
    root.id = CONTROLS_ID;
    root.innerHTML = `
      <div class="lc-colour-panel" hidden>
        <strong>Deal stage colours</strong>
        <label>Quote sent <input type="color" data-setting="quote"></label>
        <label>Completed <input type="color" data-setting="complete"></label>
        <label>Deposit / stock <input type="color" data-setting="deposit"></label>
        <label>Paid / ready <input type="color" data-setting="paid"></label>
        <label>Other stages <input type="color" data-setting="default"></label>
        <label>Record/link text <input type="color" data-setting="linkText"></label>
        <label>Other table text <input type="color" data-setting="tableText"></label>
        <label>Pill text <input type="color" data-setting="pillText"></label>
        <label>All colour strength <input type="range" min="20" max="100" step="5" data-setting="strength"></label>
        <div class="lc-colour-actions"><button type="button" data-action="reset">Reset</button></div>
      </div>
      <button type="button" data-action="toggle">Colours</button>`;
    document.body.appendChild(root);
    applyThemeColours();
    const syncInputs = () => root.querySelectorAll('[data-setting]').forEach((input) => { input.value = settings[input.dataset.setting]; });
    syncInputs();
    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      const panel = root.querySelector('.lc-colour-panel');
      if (action === 'toggle') panel.hidden = !panel.hidden;
      if (action === 'reset') {
        settings = { ...defaults };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        applyThemeColours();
        syncInputs();
        colourDealStages();
      }
    });
    root.addEventListener('input', (event) => {
      const key = event.target.dataset.setting;
      if (!key) return;
      settings[key] = key === 'strength' ? Number(event.target.value) : event.target.value;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      applyThemeColours();
      colourDealStages();
    });
  }

  function dockControls() {
    const root = document.getElementById(CONTROLS_ID);
    if (!root) return;
    const counters = Array.from(document.querySelectorAll('span, div, p'))
      .filter((element) => /^\d[\d,]*\s+deals$/i.test(clean(element.textContent)))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 20 && rect.width < 220 && rect.height > 10 && rect.height < 65;
      });
    const counter = counters.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return bRect.width * bRect.height - aRect.width * aRect.height;
    })[0];
    if (!counter) return;
    if (counter.nextElementSibling !== root) counter.insertAdjacentElement('afterend', root);
    root.classList.add('lc-colours-docked');
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
    const stagePattern = /(opp\s*deal|quote[- ]?sent|deposit\s*paid|ready\s*to\s*deliver|completed|new\s*enquiry|followed\s*up|waiting\s*on\s*customer|site\s*visit)/i;
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
      ensureControls();
      dockControls();
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
