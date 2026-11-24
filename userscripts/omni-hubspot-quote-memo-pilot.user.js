// ==UserScript==
// @name         Living Culture Omni – HubSpot Quote Memo Pilot
// @namespace    livingculture-omni
// @version      0.1.4
// @description  Checks the saved Omni quote memo before Create Deal.
// @match        https://go.cin7.com/Cloud/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const headingSelector = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  const memoSelector = 'textarea,input:not([type="hidden"]),[contenteditable="true"]';
  const clean = value => String(value ?? '').replace(/[\s\u200b]+/g, ' ').trim();

  function quoteNumber(page) {
    for (const heading of page.querySelectorAll(headingSelector)) {
      const match = clean(heading.textContent).match(/\b(?:Edit|New)\s+Quote\s*-.*?\b(NZSO-?\d+[A-Z]?)\b/i);
      if (match) return match[1].replace('-', '').toUpperCase();
    }
    return '';
  }

  function currentMemo() {
    for (const marked of document.querySelectorAll('[aria-label="Delivery Instructions"],[data-lc-delivery-label]')) {
      const field = marked.matches(memoSelector) ? marked : marked.querySelector(memoSelector) ||
        (marked.htmlFor && document.getElementById(marked.htmlFor));
      if (field?.matches(memoSelector)) return field;
    }
    return null;
  }

  const memoValue = field => clean(field?.value ?? field?.textContent);
  const matchesLoadedMemo = field => field?.matches('textarea') &&
    Boolean(memoValue(field) && memoValue(field) === clean(field.defaultValue));
  const reviewNumber = button => {
    const sale = button.closest('.lc-hs-review-panel')?.querySelector('.lc-hs-modal-body p');
    return clean(sale?.textContent).match(/^Sale:\s*(NZSO-?\d+[A-Z]?)$/i)?.[1].replace('-', '').toUpperCase() || '';
  };
  let checking = false;
  let replayButton = null;
  const reviewSelector = '.lc-hs-review-panel #lcHsModalPrimary';

  new MutationObserver(() => {
    const button = document.querySelector(reviewSelector);
    if (!button || button.dataset.lcMemoPilot) return;
    button.dataset.lcMemoPilot = '0.1.4';
    const notice = document.createElement('p');
    notice.style.color = getComputedStyle(button).backgroundColor;
    notice.style.fontWeight = '700';
    notice.style.whiteSpace = 'nowrap';
    notice.style.overflowX = 'auto';
    const field = currentMemo();
    if (matchesLoadedMemo(field)) return;
    if (field && !memoValue(field)) {
      notice.textContent = 'Quote memo is empty. Fill it in and save.';
    } else {
      notice.textContent = 'A saved quote memo is required to create this deal.';
    }
    button.parentElement.before(notice);
  }).observe(document, { childList: true, subtree: true });

  window.addEventListener('click', async event => {
    const button = event.target instanceof Element && event.target.closest(reviewSelector);
    if (!button || replayButton === button) return;
    const order = reviewNumber(button);
    const salesOrder = [...document.querySelectorAll(headingSelector)].some(heading =>
      /^(?:New|Edit) Sales Order\s*-/i.test(clean(heading.textContent)));
    if (salesOrder && !quoteNumber(document)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (checking) return;
    const field = currentMemo();
    if (!order || (field && !memoValue(field))) {
      alert('Enter Quote Memo Info and save the quote before creating the HubSpot deal.');
      return;
    }
    if (!field || (!matchesLoadedMemo(field) && !(field.id || field.name))) {
      alert('Could not locate Delivery Instructions. Reopen the saved quote and try again.');
      return;
    }

    const url = location.href;
    checking = true;
    button.disabled = true;
    let verified = matchesLoadedMemo(field);
    try {
      if (!verified) {
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok || new URL(response.url).pathname !== location.pathname) throw new Error();
        const saved = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (quoteNumber(saved) !== order) throw new Error();
        const savedField = (field.id && saved.getElementById(field.id)) ||
          (field.name && [...saved.querySelectorAll(memoSelector)].find(candidate => candidate.name === field.name));
        if (!savedField?.matches(memoSelector)) throw new Error();
        verified = Boolean(memoValue(savedField) && memoValue(savedField) === memoValue(field));
        if (!verified && button.isConnected) alert('Enter Quote Memo Info and save the quote before creating the HubSpot deal.');
      }
    } catch {
      if (button.isConnected) alert('Could not verify the saved quote memo. Reopen the saved quote and try again.');
    } finally {
      checking = false;
      button.disabled = false;
    }
    if (!verified || !button.isConnected || location.href !== url || reviewNumber(button) !== order) return;
    replayButton = button;
    try { button.click(); } finally { replayButton = null; }
  }, true);
})();
