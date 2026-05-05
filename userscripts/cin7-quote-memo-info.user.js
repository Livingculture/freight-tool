// ==UserScript==
// @name         Cin7 Quote Memo Info
// @namespace    livingculture
// @version      2.3
// @description  Quote Memo Info panel with copy and auto-fill into Cin7 Quote Memo only.
// @match        *://cin7.com/*
// @match        *://*.cin7.com/*
// @match        *://*.cin7.co/*
// @match        *://*.cin7core.com/*
// @match        *://*.dearsystems.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-quote-memo-info.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-quote-memo-info.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LOGO_URL = 'https://livingculture.co.nz/cdn/shop/files/logo_ec2b0c5e-42ca-4695-8c7e-43b344144c58.png?v=1675047511&width=220';

  const MEMOS = [
    {
      title: 'Custom Made Terms and Conditions',
      subtitle: 'Installation required quotes',
      text: `Please include relevant after care information when sending the quote as this is usually something discussed during the enquiry.

Dimensions and colour of each custom item:

Installation charges are based on ground floor installations. Other installations are on a case-by-case basis.

Extra charges may be incurred for extra work required in materials and labour outside of a standard basic installation or should any unexpected issues arise during installation. This will be discussed with you and invoiced same-day.`
    },
    {
      title: 'Installation Required Pre-Order Items',
      subtitle: 'Installation required',
      text: `This is an initial quote. Please send through some photos of the area if you haven’t already done so.

This is a Pre-Order item - ETA ______ weeks, pending no shipping delays.

Please make a 50% deposit payment using your quote number and surname as a reference.

Once we are aware of the confirmed arrival date, we will contact you for the balance of payment, which is required prior to scheduling delivery and any installations.

Installation charges are based on ground floor installations. Other installations are on a case-by-case basis.

Extra charges may be incurred for extra work required in materials and labour outside of a standard basic installation or should any unexpected issues arise during installation. This will be discussed with you and invoiced same-day.

Payment of the deposit is confirmation of items and acceptance of our terms and conditions.`
    },
    {
      title: 'Pre-Sale Items',
      subtitle: 'No installation required',
      text: `This is a Pre-Sale item - ETA ______ weeks, pending no shipping delays.

Pre-sale items are sold on a “first in, first serve basis”. A payment is required to secure stock.

Please make a 50% deposit payment using your quote number and surname as a reference.

Once payment is received, we will send you an invoice showing any outstanding balance.

Once we are aware of the confirmed arrival date, we will contact you for the balance of payment, which is required prior to scheduling delivery or collection.

This is a product only quote. Installation is not included.

Payment of the deposit is confirmation of items and acceptance of our terms and conditions.`
    },
    {
      title: 'In Stock Items',
      subtitle: 'Attach to the bottom of all quotes',
      text: `This item is currently in stock. Stock items are sold on a “first in, first serve basis”. A payment is required to secure stock. This quote does not include holding of stock.

To proceed with an order, please refer to our bank transfer/account details on your quote.

Otherwise, we are happy to send you through a secure credit card payment link, which is valid for 24 hours.

Full payment is required prior to scheduling delivery or collection.`
    },
    {
      title: 'Selling Showroom Model Products',
      subtitle: 'Attach to the bottom of all quotes',
      text: `Discounted as ex-showroom. Shop soiling and/or scratches may have incurred.

Purchased as seen. No returns, refunds or exchanges.`
    }
  ];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  function setStatus(message, error = false) {
    const el = document.getElementById('lc-qm-status');
    if (!el) return;

    el.textContent = message || '';
    el.style.color = error ? '#9a2d20' : '#2d5c4e';
  }

  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value
      })
    );
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function findEditableInside(el) {
    if (!el) return null;

    if (el.matches?.('textarea, input, [contenteditable="true"]') && isVisible(el)) {
      return el;
    }

    return (
      Array.from(el.querySelectorAll?.('textarea, input, [contenteditable="true"]') || [])
        .filter(isVisible)
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return br.width * br.height - ar.width * ar.height;
        })[0] || null
    );
  }

  function findQuoteMemoLabel() {
    return Array.from(document.querySelectorAll('label, legend, div, span, p'))
      .filter(isVisible)
      .find(el => clean(el.innerText || el.textContent).toLowerCase() === 'quote memo');
  }

  function findQuoteMemoField() {
    const label = findQuoteMemoLabel();
    if (!label) return null;

    const lr = label.getBoundingClientRect();

    const fields = Array.from(document.querySelectorAll('textarea, input, [contenteditable="true"]'))
      .filter(isVisible)
      .filter(field => {
        const fr = field.getBoundingClientRect();

        return (
          fr.top >= lr.top - 20 &&
          fr.top <= lr.bottom + 260 &&
          (Math.abs(fr.left - lr.left) < 120 || fr.left <= lr.left + 80) &&
          fr.width > 250 &&
          fr.height > 50
        );
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();

        return Math.abs(ar.top - lr.bottom) - Math.abs(br.top - lr.bottom);
      });

    if (fields[0]) return fields[0];

    const probePoints = [
      [lr.left + 40, lr.bottom + 35],
      [lr.left + 120, lr.bottom + 55],
      [lr.left + 250, lr.bottom + 75],
      [lr.left + 400, lr.bottom + 90]
    ];

    for (const [x, y] of probePoints) {
      const el = document.elementFromPoint(x, y);

      const editable =
        findEditableInside(el) ||
        findEditableInside(el?.parentElement) ||
        findEditableInside(el?.closest?.('div, fieldset, section'));

      if (editable) return editable;
    }

    return null;
  }

  async function copyText(text, button) {
    await navigator.clipboard.writeText(text);

    const old = button.textContent;

    button.textContent = 'Copied';
    setStatus('Copied to clipboard.');

    setTimeout(() => {
      button.textContent = old;
    }, 1200);
  }

  async function fillQuoteMemo(text, button) {
    const field = findQuoteMemoField();

    if (!field) {
      await navigator.clipboard.writeText(text);

      setStatus('Could not find Quote memo. Text copied instead.', true);

      alert('Could not find the Quote memo field.\n\nText has been copied. Click inside Quote memo and paste.');

      return;
    }

    field.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    field.focus();
    field.click();

    if (field.getAttribute('contenteditable') === 'true') {
      field.innerText = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: text
        })
      );
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
    } else {
      setNativeValue(field, text);
    }

    await navigator.clipboard.writeText(text);

    const old = button.textContent;

    button.textContent = 'Filled';
    setStatus('Filled Quote memo and copied text as backup.');

    document.getElementById('lc-quote-memo-panel')?.classList.remove('is-open');

    setTimeout(() => {
      button.textContent = old;
    }, 1200);
  }

  function openQuoteMemoPanel() {
    const panel = document.getElementById('lc-quote-memo-panel');
    if (!panel) return;

    panel.classList.toggle('is-open');
  }

  function getAllVisibleElements() {
    return Array.from(document.querySelectorAll('body *')).filter(el => {
      if (!isVisible(el)) return false;
      if (el.closest('#lc-quote-memo-panel')) return false;
      if (el.id === 'lc-quote-memo-inline-button') return false;

      return true;
    });
  }

  function findAdditionalChargesHeading() {
    return getAllVisibleElements().find(el => {
      const text = clean(el.innerText || el.textContent).toLowerCase();
      return text === 'additional charges and services';
    });
  }

  function findAdditionalChargesPlusButton() {
    const heading = findAdditionalChargesHeading();

    if (!heading) return null;

    const headingRect = heading.getBoundingClientRect();

    const candidates = getAllVisibleElements()
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const text = clean(el.innerText || el.textContent);

        const isBelowHeading =
          rect.top >= headingRect.bottom - 5 &&
          rect.top <= headingRect.bottom + 160;

        const isNearLeft =
          rect.left >= headingRect.left - 20 &&
          rect.left <= headingRect.left + 130;

        const isButtonSized =
          rect.width >= 28 &&
          rect.width <= 90 &&
          rect.height >= 28 &&
          rect.height <= 80;

        const tagLooksClickable =
          ['BUTTON', 'A'].includes(el.tagName) ||
          el.getAttribute('role') === 'button' ||
          el.onclick ||
          window.getComputedStyle(el).cursor === 'pointer';

        const textLooksPlus =
          text === '+' ||
          text.includes('+');

        const hasSvgOrIcon =
          !!el.querySelector?.('svg, i, .fa, .icon, [class*="icon"], [class*="plus"]');

        return (
          isBelowHeading &&
          isNearLeft &&
          isButtonSized &&
          (tagLooksClickable || textLooksPlus || hasSvgOrIcon)
        );
      })
      .map(el => ({
        el,
        rect: el.getBoundingClientRect()
      }))
      .sort((a, b) => {
        const aDistance =
          Math.abs(a.rect.top - headingRect.bottom) +
          Math.abs(a.rect.left - headingRect.left);

        const bDistance =
          Math.abs(b.rect.top - headingRect.bottom) +
          Math.abs(b.rect.left - headingRect.left);

        return aDistance - bDistance;
      });

    return candidates[0]?.el || null;
  }

  function placeButtonBesidePlus(button, plusButton) {
    const plusRect = plusButton.getBoundingClientRect();

    const parent =
      plusButton.parentElement ||
      plusButton.closest?.('div, section, fieldset') ||
      document.body;

    const parentStyle = window.getComputedStyle(parent);

    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    if (button.parentElement !== parent) {
      parent.appendChild(button);
    }

    const parentRect = parent.getBoundingClientRect();

    button.style.position = 'absolute';
    button.style.left = `${plusRect.right - parentRect.left + 10}px`;
    button.style.top = `${plusRect.top - parentRect.top}px`;
    button.style.height = `${Math.max(34, plusRect.height || 34)}px`;
    button.style.zIndex = '50';
    button.style.display = 'block';
  }

  function insertQuoteMemoButtonNextToAdditionalPlus() {
    let button = document.getElementById('lc-quote-memo-inline-button');
    const plusButton = findAdditionalChargesPlusButton();

    if (!plusButton) return;

    if (!button) {
      button = document.createElement('button');

      button.id = 'lc-quote-memo-inline-button';
      button.type = 'button';
      button.textContent = 'Quote Memo Info';

      button.style.background = '#05cabe';
      button.style.color = '#fff';
      button.style.border = '1px solid #05cabe';
      button.style.borderRadius = '4px';
      button.style.padding = '0 14px';
      button.style.font = '700 14px Arial, sans-serif';
      button.style.cursor = 'pointer';
      button.style.lineHeight = '1';
      button.style.whiteSpace = 'nowrap';
      button.style.boxSizing = 'border-box';
      button.style.boxShadow = 'none';
      button.style.display = 'none';

      button.addEventListener('mouseenter', () => {
        button.style.background = '#04b5aa';
        button.style.borderColor = '#04b5aa';
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = '#05cabe';
        button.style.borderColor = '#05cabe';
      });

      button.addEventListener('click', openQuoteMemoPanel);
    }

    placeButtonBesidePlus(button, plusButton);
  }

  function createPanel() {
    if (document.getElementById('lc-quote-memo-panel')) return;

    const panel = document.createElement('div');

    panel.id = 'lc-quote-memo-panel';

    panel.innerHTML = `
      <div class="lc-qm-hero">
        <img src="${LOGO_URL}" alt="Living Culture" class="lc-qm-logo" />
        <div class="lc-qm-title">Quote Memo Info</div>
        <p>Copy or auto-fill into the Cin7 Quote memo.</p>
        <button id="lc-qm-close" type="button">×</button>
      </div>

      <div class="lc-qm-list">
        ${MEMOS.map((memo, index) => `
          <div class="lc-qm-card">
            <h3>${memo.title}</h3>
            <small>${memo.subtitle}</small>
            <textarea readonly>${memo.text}</textarea>
            <div class="lc-qm-actions">
              <button type="button" class="lc-qm-copy" data-index="${index}">Copy</button>
              <button type="button" class="lc-qm-fill" data-index="${index}">Copy + Fill Quote Memo</button>
            </div>
          </div>
        `).join('')}
      </div>

      <div id="lc-qm-status"></div>
    `;

    const style = document.createElement('style');

    style.textContent = `
      #lc-quote-memo-panel {
        position: fixed;
        top: 72px;
        right: 372px;
        box-sizing: border-box;
        width: 340px;
        max-height: calc(100vh - 96px);
        overflow: auto;
        display: none;
        z-index: 2147483647;
        background: #cfe2d9;
        border: 1px solid #d9d6cc;
        border-radius: 14px;
        padding: 10px;
        color: #1f2b24;
        font: 13px/1.35 Arial, sans-serif;
        box-shadow: 0 20px 44px rgba(34,48,40,.22);
      }

      #lc-quote-memo-panel.is-open {
        display: block;
      }

      .lc-qm-hero {
        position: relative;
        background: #2d5c4e;
        color: #fff;
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 10px;
      }

      .lc-qm-logo {
        display: block;
        width: 96px;
        max-width: 78%;
        height: auto;
        margin-bottom: 10px;
      }

      .lc-qm-title {
        font-size: 22px;
        line-height: 1.05;
        font-weight: 800;
        text-align: left;
      }

      .lc-qm-hero p {
        margin: 6px 38px 0 0;
        font-size: 12px;
      }

      #lc-qm-close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid #d9d6cc;
        background: #f3f1e8;
        color: #1f2b24;
        font-size: 20px;
        font-weight: 900;
        cursor: pointer;
      }

      .lc-qm-list {
        display: grid;
        gap: 10px;
      }

      .lc-qm-card {
        background: #fffefb;
        border: 1px solid #d9d6cc;
        border-radius: 12px;
        padding: 12px;
        display: grid;
        gap: 7px;
      }

      .lc-qm-card h3 {
        margin: 0;
        font-size: 15px;
        color: #1f2b24;
      }

      .lc-qm-card small {
        color: #637061;
        font-weight: 800;
        text-transform: uppercase;
      }

      .lc-qm-card textarea {
        width: 100%;
        min-height: 105px;
        resize: vertical;
        box-sizing: border-box;
        border: 1px solid #d9d6cc;
        border-radius: 9px;
        padding: 8px;
        font: 12px/1.35 Arial, sans-serif;
        color: #1f2b24;
        background: #fff;
      }

      .lc-qm-actions {
        display: grid;
        grid-template-columns: 72px 1fr;
        gap: 6px;
      }

      .lc-qm-actions button {
        background: #2d5c4e;
        color: #fff;
        border: 0;
        border-radius: 9px;
        padding: 8px 9px;
        font-weight: 900;
        cursor: pointer;
      }

      .lc-qm-actions button:hover {
        background: #244a3f;
      }

      #lc-qm-status {
        margin-top: 10px;
        font-weight: 700;
        color: #2d5c4e;
      }
    `;

    document.head.appendChild(style);
    document.body.append(panel);

    panel.querySelector('#lc-qm-close').addEventListener('click', () => {
      panel.classList.remove('is-open');
    });

    panel.querySelectorAll('.lc-qm-copy').forEach(button => {
      button.addEventListener('click', () => {
        copyText(MEMOS[Number(button.dataset.index)].text, button);
      });
    });

    panel.querySelectorAll('.lc-qm-fill').forEach(button => {
      button.addEventListener('click', () => {
        fillQuoteMemo(MEMOS[Number(button.dataset.index)].text, button);
      });
    });
  }

  function boot() {
    if (!document.body) return;

    createPanel();

    setTimeout(insertQuoteMemoButtonNextToAdditionalPlus, 300);
    setTimeout(insertQuoteMemoButtonNextToAdditionalPlus, 1000);
    setTimeout(insertQuoteMemoButtonNextToAdditionalPlus, 2500);
    setTimeout(insertQuoteMemoButtonNextToAdditionalPlus, 5000);
  }

  boot();

  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);

  setInterval(() => {
    if (!document.getElementById('lc-quote-memo-inline-button')) {
      insertQuoteMemoButtonNextToAdditionalPlus();
    }
  }, 3000);
})();
