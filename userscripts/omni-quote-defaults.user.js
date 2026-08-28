// ==UserScript==
// @name         Omni Living Culture Quote Defaults
// @namespace    livingculture-omni
// @version      0.1.7
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

  function showDiagnostic(message) {
    let box = document.getElementById('lc-omni-defaults-diagnostic');
    if (!box) {
      box = document.createElement('div');
      box.id = 'lc-omni-defaults-diagnostic';
      Object.assign(box.style, {
        position: 'fixed', left: '18px', bottom: '18px', zIndex: '2147483647',
        maxWidth: '720px', padding: '10px 14px', border: '2px solid #e67e00',
        borderRadius: '6px', background: '#fff7e8', color: '#172b4d',
        font: '600 13px/1.4 Arial, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,.22)'
      });
      document.body.appendChild(box);
    }
    box.textContent = message;
  }

  function fieldDescription(field) {
    if (!field) return 'not found';
    return `${field.tagName.toLowerCase()}#${field.id || '-'} name=${field.name || '-'} type=${field.type || '-'} value="${dateValue(field)}"`;
  }

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
      .map(element => ({
        element,
        value: clean(element.textContent).replace(/^\d+\s*/, '').replace(/\*$/, '').trim().toLowerCase()
      }))
      .filter(item => item.value === wanted || item.value.endsWith(wanted))
      .sort((a, b) => a.value.length - b.value.length || a.element.children.length - b.element.children.length)[0]?.element || null;
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
      .sort((a, b) => {
        const aHorizontal = Math.abs(a.rect.left - headingRect.left);
        const bHorizontal = Math.abs(b.rect.left - headingRect.left);
        return aHorizontal - bHorizontal || Math.abs(a.rect.top - headingRect.bottom) - Math.abs(b.rect.top - headingRect.bottom);
      })[0]?.field || null;
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
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.setAttribute('value', value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    if (window.jQuery) window.jQuery(input).val(value).trigger('input').trigger('change').trigger('blur');
  }

  function dateValue(input) {
    if (!input) return '';
    return clean(input.value || input.getAttribute('value') || input.getAttribute('data-value'));
  }

  function dateFieldNearLabel(text) {
    const heading = label(text);
    if (!heading) return null;
    const headingRect = heading.getBoundingClientRect();
    return Array.from(document.querySelectorAll('input:not([type="hidden"])'))
      .filter(visible)
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => item.rect.top >= headingRect.top - 8 && item.rect.top <= headingRect.bottom + 55)
      .filter(item => item.rect.left >= headingRect.left - 65 && item.rect.left <= headingRect.right + 220)
      .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top)[0]?.field || null;
  }

  function expectedDateField(probability) {
    if (!probability) return dateFieldNearLabel('Expected Order Date');
    const probabilityRect = probability.getBoundingClientRect();
    return Array.from(document.querySelectorAll('input:not([type="hidden"])'))
      .filter(visible)
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => item.rect.top < probabilityRect.bottom + 8 && item.rect.bottom > probabilityRect.top - 8)
      .filter(item => item.rect.right <= probabilityRect.left && item.rect.left >= probabilityRect.left - 320)
      .sort((a, b) => a.rect.left - b.rect.left)[0]?.field || dateFieldNearLabel('Expected Order Date');
  }

  function calendarTriggerNearLabel(text, input) {
    const heading = label(text);
    if (!heading || !input) return null;
    const headingRect = heading.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    return Array.from(document.querySelectorAll('button, a, img, input[type="button"], input[type="image"]'))
      .filter(visible)
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(item => item.rect.top < inputRect.bottom + 12 && item.rect.bottom > inputRect.top - 12)
      .filter(item => item.rect.left > inputRect.right && item.rect.left < headingRect.right + 300)
      .sort((a, b) => a.rect.left - b.rect.left)[0]?.element || null;
  }

  function setCalendarDate(input, date, value) {
    let usedWidget = false;
    const jq = window.jQuery ? window.jQuery(input) : null;

    try {
      const kendo = jq?.data('kendoDatePicker');
      if (kendo?.value) {
        kendo.value(date);
        kendo.trigger?.('change');
        usedWidget = true;
      }
    } catch (_) {}

    try {
      if (jq && typeof jq.datepicker === 'function' && (jq.hasClass('hasDatepicker') || jq.data('datepicker'))) {
        jq.datepicker('setDate', date).trigger('change');
        usedWidget = true;
      }
    } catch (_) {}

    try {
      if (input._flatpickr?.setDate) {
        input._flatpickr.setDate(date, true);
        usedWidget = true;
      }
    } catch (_) {}

    setInput(input, value);
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'Enter', code: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));

    if (!usedWidget && !input.dataset.lcCalendarOpened) {
      const trigger = calendarTriggerNearLabel('Expected Order Date', input);
      if (trigger) {
        input.dataset.lcCalendarOpened = '1';
        trigger.click();
        setTimeout(() => {
          setInput(input, value);
          input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
        }, 150);
      }
    }
  }

  function setProbability(select) {
    if (!select) return;
    const option = Array.from(select.options || []).find(item => /^50\s*%?$/.test(clean(item.textContent))) ||
      Array.from(select.options || []).find(item => /(?:^|\D)50(?:\D|$)/.test(clean(item.textContent)));
    if (!option) return;
    if (select.value === option.value && /^50\s*%?$/.test(clean(select.selectedOptions?.[0]?.textContent))) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(select, option.value); else select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyDefaults() {
    const probability = fieldNearLabel('Probability of Winning', 'select');
    const created = dateFieldNearLabel('Created Date');
    const expected = expectedDateField(probability);
    if (!created || !expected) {
      showDiagnostic(`Quote date diagnostic — Created control: ${fieldDescription(created)} | Expected control: ${fieldDescription(expected)}`);
    }
    if (created && expected && !parseDate(dateValue(expected))) {
      const createdValue = dateValue(created);
      const createdDate = parseDate(createdValue);
      if (createdDate && !Number.isNaN(createdDate.getTime())) {
        createdDate.setDate(createdDate.getDate() + 14);
        const targetValue = formatDate(createdDate, createdValue);
        setCalendarDate(expected, createdDate, targetValue);
        setTimeout(() => {
          if (!parseDate(dateValue(expected))) {
            showDiagnostic(`Quote date diagnostic — Created: ${fieldDescription(created)} | Expected target: ${targetValue} | Selected control after attempt: ${fieldDescription(expected)}`);
          }
        }, 500);
      } else {
        showDiagnostic(`Quote date diagnostic — Created value could not be read as a date: ${fieldDescription(created)} | Expected control: ${fieldDescription(expected)}`);
      }
    }
    setProbability(probability);
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
    if (event.target === dateFieldNearLabel('Created Date')) schedule();
  }, true);
  setInterval(applyDefaults, 2000);
})();
