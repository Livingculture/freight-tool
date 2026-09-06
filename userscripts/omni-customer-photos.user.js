// ==UserScript==
// @name         Omni Living Culture Customer Photos
// @namespace    livingculture-omni-customer-photos
// @version      0.1.0
// @description  Opens a Workflow customer photo album prefilled from the current Cin7 Omni quote.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-customer-photos.user.js?v=0.1.0
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-customer-photos.user.js?v=0.1.0
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'lc-omni-customer-photos-button';
  const WORKFLOW_URL = 'https://living-culture-workflow.vercel.app/customer-photos';

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');

  function controlValue(control) {
    if (!control) return '';
    if (control.tagName === 'SELECT') return clean(control.selectedOptions?.[0]?.textContent || control.value);
    return clean(control.value || control.textContent);
  }

  function byLabel(labelPattern) {
    const labels = Array.from(document.querySelectorAll('label, td, th, div, span'));
    for (const label of labels) {
      const ownText = clean(Array.from(label.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' '));
      if (!labelPattern.test(ownText)) continue;
      const forId = label.getAttribute('for');
      const associated = forId ? document.getElementById(forId) : null;
      const nested = label.querySelector('input, textarea, select');
      const sibling = label.nextElementSibling?.matches?.('input, textarea, select') ? label.nextElementSibling : label.parentElement?.querySelector('input, textarea, select');
      const value = controlValue(associated || nested || sibling);
      if (value) return value;
    }
    return '';
  }

  function quoteNumber() {
    const heading = clean(Array.from(document.querySelectorAll('h1,h2,h3')).map((node) => node.textContent).join(' '));
    return heading.match(/\b(?:SFOR|NZSO)[A-Z0-9-]+\b/i)?.[0] || byLabel(/^(?:NZSO|Cin7 number|Order ID|Reference)$/i);
  }

  function context() {
    const first = byLabel(/^First Name$/i);
    const last = byLabel(/^Last Name$/i);
    const selectedCustomer = byLabel(/^Selected Customer$/i);
    const address = [
      byLabel(/^Delivery Address 1$/i), byLabel(/^Delivery Address 2$/i),
      byLabel(/^Delivery City$/i), byLabel(/^Delivery State\/Region$/i),
      byLabel(/^Delivery Postal Code$/i), byLabel(/^Delivery Country$/i),
    ].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(', ');
    return {
      customer: selectedCustomer || [first, last].filter(Boolean).join(' '),
      email: byLabel(/^Email Address$/i),
      phone: byLabel(/^(?:Mobile|Phone)$/i),
      address,
      quote: quoteNumber(),
    };
  }

  function openCustomerPhotos() {
    const url = new URL(WORKFLOW_URL);
    Object.entries(context()).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  function findActionRow() {
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    const anchor = candidates.find((element) => visible(element) && /^(Go to Admin|Actions)$/i.test(clean(element.value || element.textContent)));
    return anchor?.parentElement || null;
  }

  function mount() {
    if (document.getElementById(BUTTON_ID)) return;
    const row = findActionRow();
    if (!row) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Customer Photos';
    button.title = 'Open or create a Workflow photo album for this customer';
    button.style.cssText = 'background:#08a6bc;color:#fff;border:0;border-radius:4px;padding:0 14px;min-height:34px;font-weight:700;cursor:pointer;margin-left:8px;';
    button.addEventListener('click', openCustomerPhotos);
    row.appendChild(button);
  }

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(mount, 2500);
})();
