// ==UserScript==
// @name         Omni Living Culture Quote Defaults
// @namespace    livingculture-omni
// @version      0.1.0
// @description  Sets Expected Order Date to 14 days after Created Date and Probability of Winning to 50%.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-quote-defaults.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-quote-defaults.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function label(text) {
    const wanted = text.toLowerCase();
    return Array.from(document.querySelectorAll('label, div, span, td, th'))
      .filter(visible)
      .filter(element => clean(element.textContent).replace(/^\d+\s*/, '').replace(/\*$/, '').trim().toLowerCase() === wanted)
      .sort((a, b) => a.children.length - b.children.length)[0] || null;
  }

  function fieldNearLabel(text, selector) {
    const heading = label(text);
    if (!heading) return null;
    const headingRect = heading.getBoundingClientRect();
    return Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => item.rect.top < headingRect.bottom + 65 && item.rect.bottom > headingRect.top - 12)
      .filter(item => item.rect.left >= headingRect.left - 45 && item.rect.left < headingRect.right + 280)
      .sort((a, b) => Math.abs(a.rect.top - headingRect.bottom) - Math.abs(b.rect.top - headingRect.bottom) || a.rect.left - b.rect.left)[0]?.field || null;
  }

  function parseDate(value) {
    const text = clean(value);
    let match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return null;
  }

  function formatDate(date, example) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    if (/^\d{4}-/.test(example)) return `${year}-${month}-${day}`;
    const separator = example.match(/[-/.]/)?.[0] || '-';
    return `${day}${separator}${month}${separator}${year}`;
  }

  function setInput(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setProbability(select) {
    if (!select || clean(select.value)) return;
    const option = Array.from(select.options || []).find(item => /^50\s*%?$/.test(clean(item.textContent))) ||
      Array.from(select.options || []).find(item => /(?:^|\D)50(?:\D|$)/.test(clean(item.textContent)));
    if (!option) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(select, option.value); else select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyDefaults() {
    const created = fieldNearLabel('Created Date', 'input:not([type="hidden"])');
    const expected = fieldNearLabel('Expected Order Date', 'input:not([type="hidden"])');
    if (created && expected && !clean(expected.value)) {
      const createdDate = parseDate(created.value);
      if (createdDate && !Number.isNaN(createdDate.getTime())) {
        createdDate.setDate(createdDate.getDate() + 14);
        setInput(expected, formatDate(createdDate, created.value));
      }
    }
    setProbability(fieldNearLabel('Probability of Winning', 'select'));
  }

  function schedule() {
    if (window.__lcOmniQuoteDefaultsFrame) return;
    window.__lcOmniQuoteDefaultsFrame = requestAnimationFrame(() => {
      window.__lcOmniQuoteDefaultsFrame = 0;
      applyDefaults();
    });
  }

  applyDefaults();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('change', event => {
    if (event.target === fieldNearLabel('Created Date', 'input:not([type="hidden"])')) schedule();
  }, true);
  setInterval(applyDefaults, 2000);
})();
