// ==UserScript==
// @name         Cin7 WeCom Payment Message Sender
// @namespace    livingculture
// @version      4.2
// @description  Sends a WeCom payment message from Cin7 invoice/payment screen only.
// @match        *://cin7.com/*
// @match        *://*.cin7.com/*
// @match        *://*.cin7.co/*
// @match        *://*.cin7core.com/*
// @match        *://*.dearsystems.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-wecom-payment-message.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-wecom-payment-message.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      qyapi.weixin.qq.com
// ==/UserScript==

(function () {
  'use strict';

  const SEND_AS_BUTTON_ID = 'lc-send-as-wecom-payment-btn';
  const SEND_AS_MENU_ID = 'lc-send-as-wecom-menu';
  const STATUS_ID = 'lc-wecom-payment-status';
  const WRAPPER_ID = 'lc-wecom-payment-wrapper';
  const SPACER_ID = 'lc-wecom-payment-spacer';

  const WECOM_WEBHOOK_URL = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=f875dc80-5d4e-4bb4-8a8d-cd66193dc7e5';

  const CIN7_TEXT_GREY = '#3f454d';
  const CIN7_MUTED_GREY = '#6f7786';
  const CIN7_FONT = 'inherit';

  const SEND_AS_REPS = [
    'AKL-Blair',
    'AKL-Daniel',
    'AKL-Jaine',
    'AKL-Pakiira',
    'PEN-Steve',
    'AKL-Vitalii',
    'CHCH-Bronwyn',
    'CHCH-Jake',
    'CHCH-Marty',
    'CHCH-Tim',
    'HAM-Linet',
    'HAM-Malcolm',
    'NPE-Chris',
    'NPE-Kirsty',
    'TGA-Dennis',
    'TGA-Jason',
    'WHG-Yash'
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

  function getBodyText() {
    return clean(document.body?.innerText || '');
  }

  function formatMoney(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '';

    return Number(value).toLocaleString('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function nearlyEqual(a, b, tolerance = 1.5) {
    if (a === null || b === null) return false;
    return Math.abs(Number(a) - Number(b)) <= tolerance;
  }

  function moneyToNumber(value) {
    if (!value) return null;

    const cleaned = String(value).replace(/[^0-9.]/g, '');
    if (!cleaned) return null;

    return Number(cleaned);
  }

  function parseDateNZ(value) {
    const match = String(value || '').match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);

    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);

    return new Date(year, month, day).getTime();
  }

  function formatRep(rep) {
    const value = clean(rep).replace(/\s+/g, '-');
    const match = value.match(/^([A-Z]{2,6})[-\s]+(.+)$/i);

    if (!match) return value;

    const branch = match[1].toUpperCase();
    const name = clean(match[2]);

    return `${name}, ${branch}`;
  }

  function findPaymentHeading() {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span, p, label'))
      .filter(isVisible)
      .find(el => clean(el.innerText || el.textContent).toLowerCase() === 'payment') || null;
  }

  function isInvoiceScreen() {
    const bodyText = getBodyText().toLowerCase();
    const paymentHeading = findPaymentHeading();

    const hasPaymentHeading = !!paymentHeading;
    const hasBalanceDue = bodyText.includes('balance due');
    const hasInvoiceClues =
      bodyText.includes('invoice memo') ||
      bodyText.includes('invoice lines') ||
      bodyText.includes('additional costs') ||
      bodyText.includes('before tax') ||
      bodyText.includes('total before tax') ||
      bodyText.includes('nzso');

    return hasPaymentHeading && hasBalanceDue && hasInvoiceClues;
  }

  function findOrderNumber() {
    const bodyText = getBodyText();

    const patterns = [
      /NZSO[-\s]*\d+/i,
      /NzSO[-\s]*\d+/i,
      /SO[-\s]*\d+/i
    ];

    for (const pattern of patterns) {
      const match = bodyText.match(pattern);

      if (match) {
        return match[0]
          .replace(/\s+/g, '')
          .replace(/^nzso/i, 'NZSO')
          .replace(/^so/i, 'SO');
      }
    }

    return 'NZSO-';
  }

  function findPaymentActionRow() {
    const paymentHeading = findPaymentHeading();
    if (!paymentHeading) return null;

    const paymentRect = paymentHeading.getBoundingClientRect();

    const candidates = Array.from(document.querySelectorAll('div, section, fieldset, form'))
      .filter(isVisible)
      .map(el => ({
        el,
        rect: el.getBoundingClientRect(),
        text: clean(el.innerText || el.textContent)
      }))
      .filter(item => {
        const text = item.text.toLowerCase();

        const nearPayment =
          item.rect.top >= paymentRect.bottom - 20 &&
          item.rect.top <= paymentRect.bottom + 180;

        const hasPaymentButtons =
          text.includes('+ payment') ||
          text.includes('payment') ||
          text.includes('use customer credit') ||
          text.includes('allocate credit note') ||
          text.includes('use a gift card');

        const sensibleSize =
          item.rect.width > 250 &&
          item.rect.height >= 20 &&
          item.rect.height <= 160;

        return nearPayment && hasPaymentButtons && sensibleSize;
      })
      .sort((a, b) => {
        const aDistance = Math.abs(a.rect.top - paymentRect.bottom);
        const bDistance = Math.abs(b.rect.top - paymentRect.bottom);

        return aDistance - bDistance;
      });

    return candidates[0]?.el || null;
  }

  function getPaymentMethodFromText(text) {
    const lower = String(text || '').toLowerCase();

    if (lower.includes('q card') || lower.includes('qcard')) return 'Q card';
    if (lower.includes('eftpos') || lower.includes('apos') || lower.includes('terminal')) return 'EFTPOS';
    if (lower.includes('visa') || lower.includes('mastercard') || lower.includes('credit card')) return 'credit card';
    if (lower.includes('bank transfer')) return 'bank transfer';
    if (lower.includes('cash')) return 'cash';

    return 'payment';
  }

  function findPaymentRows() {
    const paymentHeading = findPaymentHeading();
    if (!paymentHeading) return [];

    const paymentTop = paymentHeading.getBoundingClientRect().top;

    const candidates = Array.from(document.querySelectorAll('tr, [role="row"], div'))
      .filter(isVisible)
      .map(el => ({
        el,
        rect: el.getBoundingClientRect(),
        text: clean(el.innerText || el.textContent)
      }))
      .filter(item => item.rect.top > paymentTop)
      .filter(item => item.rect.height >= 20 && item.rect.height <= 120)
      .filter(item => item.text.length <= 320)
      .filter(item => /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(item.text))
      .filter(item => /succeed|success|eftpos|apos|terminal|q card|credit card|visa|mastercard|bank transfer|cash/i.test(item.text))
      .filter(item => /[0-9,]+\.\d{2}/.test(item.text))
      .map(item => {
        const dateMatch = item.text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
        const dateText = dateMatch ? dateMatch[0] : '';
        const dateValue = parseDateNZ(dateText);
        const amounts = item.text.match(/[0-9,]+\.\d{2}/g) || [];
        const amount = amounts.length ? moneyToNumber(amounts[amounts.length - 1]) : null;
        const method = getPaymentMethodFromText(item.text);

        return {
          text: item.text,
          dateText,
          dateValue,
          amount,
          method,
          rect: item.rect
        };
      })
      .filter(row => row.dateValue !== null && row.amount !== null);

    const unique = new Map();

    for (const row of candidates) {
      const key = `${row.dateText}|${row.amount.toFixed(2)}|${row.method}`;
      const existing = unique.get(key);

      if (!existing) {
        unique.set(key, row);
        continue;
      }

      const existingScore = scorePaymentCandidate(existing);
      const rowScore = scorePaymentCandidate(row);

      if (rowScore > existingScore) {
        unique.set(key, row);
      }
    }

    return Array.from(unique.values()).sort((a, b) => {
      if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
      return b.rect.top - a.rect.top;
    });
  }

  function scorePaymentCandidate(row) {
    let score = 0;

    if (/succeed|success/i.test(row.text)) score += 50;
    if (/eftpos|apos|terminal/i.test(row.text)) score += 40;
    if (/q card|credit card|visa|mastercard|bank transfer|cash/i.test(row.text)) score += 30;

    score -= Math.abs(row.rect.height - 58);
    score -= row.text.length / 20;

    return score;
  }

  function findLatestPaymentRow() {
    const rows = findPaymentRows();
    return rows.length ? rows[0] : null;
  }

  function findPaymentMethod() {
    const latestPaymentRow = findLatestPaymentRow();

    if (latestPaymentRow) {
      return latestPaymentRow.method;
    }

    return getPaymentMethodFromText(getBodyText());
  }

  function findPaymentAmount() {
    const latestPaymentRow = findLatestPaymentRow();

    if (latestPaymentRow && latestPaymentRow.amount !== null) {
      return latestPaymentRow.amount;
    }

    const bodyText = getBodyText();

    const paymentMatch = bodyText.match(/(?:APOS|Eftpos|EFTPOS|Q card|credit card|bank transfer|cash).*?([0-9,]+\.\d{2})/i);

    if (paymentMatch) {
      return Number(paymentMatch[1].replace(/,/g, ''));
    }

    return null;
  }

  function findBalanceDue() {
    const bodyText = getBodyText();
    const match = bodyText.match(/Balance due\s*\(NZD\)\s*([0-9,]+\.\d{2})/i);

    if (match) {
      return Number(match[1].replace(/,/g, ''));
    }

    return null;
  }

  function findInvoiceTotal() {
    const paymentHeading = findPaymentHeading();
    const paymentTop = paymentHeading ? paymentHeading.getBoundingClientRect().top : Infinity;

    const visibleBlocks = Array.from(document.querySelectorAll('div, span, td, th'))
      .filter(isVisible)
      .map(el => ({
        text: clean(el.innerText || el.textContent),
        rect: el.getBoundingClientRect()
      }))
      .filter(item => item.rect.top < paymentTop)
      .filter(item => item.text.toLowerCase().includes('total') || item.text.toLowerCase().includes('nzd'))
      .filter(item => /[0-9,]+\.\d{2}/.test(item.text));

    for (const item of visibleBlocks) {
      const nzdMatch = item.text.match(/NZD\s*([0-9,]+\.\d{2})/i);

      if (nzdMatch) {
        return Number(nzdMatch[1].replace(/,/g, ''));
      }
    }

    for (const item of visibleBlocks) {
      if (item.text.toLowerCase().includes('total')) {
        const amounts = item.text.match(/[0-9,]+\.\d{2}/g) || [];

        if (amounts.length) {
          return Number(amounts[amounts.length - 1].replace(/,/g, ''));
        }
      }
    }

    const amountsAbovePayment = Array.from(document.querySelectorAll('div, span, td, th'))
      .filter(isVisible)
      .map(el => ({
        text: clean(el.innerText || el.textContent),
        rect: el.getBoundingClientRect()
      }))
      .filter(item => item.rect.top < paymentTop)
      .flatMap(item => item.text.match(/[0-9,]+\.\d{2}/g) || [])
      .map(value => Number(value.replace(/,/g, '')))
      .filter(value => !Number.isNaN(value))
      .filter(value => value > 0);

    if (amountsAbovePayment.length) {
      return Math.max(...amountsAbovePayment);
    }

    return null;
  }

  function classifyPayment(invoiceTotal, paymentAmount, balanceDue, paymentCount) {
    if (paymentAmount === null) return 'payment';

    const balanceIsZero = balanceDue !== null && nearlyEqual(balanceDue, 0, 0.05);
    const paymentEqualsTotal = invoiceTotal !== null && nearlyEqual(paymentAmount, invoiceTotal, 1.5);
    const twentyPercentTotal = invoiceTotal !== null ? invoiceTotal * 0.2 : null;
    const paymentIsTwentyPercent = twentyPercentTotal !== null && nearlyEqual(paymentAmount, twentyPercentTotal, 2.5);
    const halfTotal = invoiceTotal !== null ? invoiceTotal / 2 : null;
    const paymentIsHalf = halfTotal !== null && nearlyEqual(paymentAmount, halfTotal, 2.5);
    const balanceRoughlyEqualsPayment = balanceDue !== null && nearlyEqual(balanceDue, paymentAmount, 2.5);

    if (paymentCount <= 1 && balanceIsZero && paymentEqualsTotal) {
      return 'paid in full';
    }

    if (paymentCount > 1 && balanceIsZero) {
      return 'outstanding balance';
    }

    if (balanceIsZero && invoiceTotal !== null && paymentAmount < invoiceTotal - 1.5) {
      return 'outstanding balance';
    }

    if (!balanceIsZero && paymentIsTwentyPercent) {
      return '20% deposit/payment';
    }

    if (!balanceIsZero && paymentIsHalf) {
      return '50% deposit';
    }

    if (!balanceIsZero && balanceRoughlyEqualsPayment) {
      return '50% deposit';
    }

    if (balanceIsZero) {
      return 'paid in full';
    }

    return 'part payment';
  }

  function buildMessage(senderOverride) {
    const paymentRows = findPaymentRows();
    const orderNumber = findOrderNumber();
    const paymentMethod = findPaymentMethod();
    const paymentAmount = findPaymentAmount();
    const invoiceTotal = findInvoiceTotal();
    const balanceDue = findBalanceDue();
    const senderDetails = senderOverride || '';

    const paymentType = classifyPayment(invoiceTotal, paymentAmount, balanceDue, paymentRows.length);
    const amount = paymentAmount !== null ? `$${formatMoney(paymentAmount)}` : '$';

    let message = '';

    if (paymentType === 'paid in full') {
      message = `${orderNumber} ${paymentMethod} payment ${amount} paid in full`;
    } else if (paymentType === '20% deposit/payment') {
      message = `${orderNumber} ${paymentMethod} 20% deposit/payment ${amount}`;
    } else if (paymentType === '50% deposit') {
      message = `${orderNumber} ${paymentMethod} 50% deposit ${amount}`;
    } else if (paymentType === 'outstanding balance') {
      message = `${orderNumber} ${paymentMethod} outstanding balance ${amount}`;
    } else if (paymentType === 'part payment') {
      message = `${orderNumber} ${paymentMethod} part payment ${amount}`;
    } else {
      message = `${orderNumber} ${paymentMethod} payment ${amount}`;
    }

    if (senderDetails) {
      message += ` — ${senderDetails}`;
    }

    return message;
  }

  function setStatus(message, error = false) {
    const status = document.getElementById(STATUS_ID);

    if (status) {
      status.textContent = message;
      status.style.color = error ? '#9a2d20' : CIN7_TEXT_GREY;
    }
  }

  function sendMessageToWeCom(message) {
    if (!WECOM_WEBHOOK_URL) {
      setStatus('WeCom webhook URL is missing from the script.', true);
      alert('WeCom webhook URL is missing from the script.');
      return;
    }

    setStatus('Sending to WeCom...');

    GM_xmlhttpRequest({
      method: 'POST',
      url: WECOM_WEBHOOK_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        msgtype: 'text',
        text: {
          content: message
        }
      }),
      onload: function (response) {
        let ok = false;
        let errorMessage = '';

        try {
          const result = JSON.parse(response.responseText || '{}');
          ok = result.errcode === 0;
          errorMessage = result.errmsg || '';
        } catch (error) {
          ok = response.status >= 200 && response.status < 300;
        }

        if (ok) {
          setStatus(`Sent to WeCom: ${message}`);

          const button = document.getElementById(SEND_AS_BUTTON_ID);

          if (button) {
            button.textContent = 'Sent';

            setTimeout(() => {
              button.textContent = 'Send as ▾';
            }, 1400);
          }
        } else {
          setStatus(`WeCom send failed: ${errorMessage || response.responseText || response.status}`, true);
          alert(`WeCom send failed.\n\n${errorMessage || response.responseText || response.status}`);
        }
      },
      onerror: function () {
        setStatus('Could not send to WeCom. Check webhook URL.', true);
        alert('Could not send to WeCom. Check webhook URL.');
      }
    });
  }

  function sendToWeComAsPerson(rep) {
    if (!rep) {
      setStatus('Select a person first.', true);
      return;
    }

    const senderDetails = formatRep(rep);
    const message = buildMessage(senderDetails);

    sendMessageToWeCom(message);

    const menu = document.getElementById(SEND_AS_MENU_ID);
    if (menu) menu.style.display = 'none';
  }

  function makeButton(text, id, bg) {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = text;

    button.style.background = bg;
    button.style.color = '#fff';
    button.style.border = `1px solid ${bg}`;
    button.style.borderRadius = '4px';
    button.style.padding = '8px 14px';
    button.style.font = '700 14px ' + CIN7_FONT;
    button.style.cursor = 'pointer';
    button.style.lineHeight = '1';
    button.style.whiteSpace = 'nowrap';
    button.style.boxSizing = 'border-box';

    button.addEventListener('mouseenter', () => {
      button.style.filter = 'brightness(0.94)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.filter = 'none';
    });

    return button;
  }

  function makeSendAsMenu() {
    const menu = document.createElement('div');
    menu.id = SEND_AS_MENU_ID;

    menu.style.display = 'none';
    menu.style.position = 'absolute';
    menu.style.top = '40px';
    menu.style.right = '0';
    menu.style.minWidth = '190px';
    menu.style.background = '#fff';
    menu.style.border = '1px solid #05cabe';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 6px 18px rgba(0,0,0,0.16)';
    menu.style.zIndex = '10000';
    menu.style.overflow = 'hidden';

    SEND_AS_REPS.forEach(rep => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = rep;

      item.style.display = 'block';
      item.style.width = '100%';
      item.style.background = '#fff';
      item.style.color = CIN7_TEXT_GREY;
      item.style.border = '0';
      item.style.borderBottom = '1px solid #e6f7f5';
      item.style.padding = '10px 14px';
      item.style.textAlign = 'left';
      item.style.font = '700 14px ' + CIN7_FONT;
      item.style.cursor = 'pointer';

      item.addEventListener('mouseenter', () => {
        item.style.background = '#f6f8fb';
      });

      item.addEventListener('mouseleave', () => {
        item.style.background = '#fff';
      });

      item.addEventListener('click', () => {
        sendToWeComAsPerson(rep);
      });

      menu.appendChild(item);
    });

    return menu;
  }

  function makeWrapper() {
    const wrapper = document.createElement('div');
    wrapper.id = WRAPPER_ID;
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.marginLeft = 'auto';
    wrapper.style.zIndex = '9999';
    wrapper.style.flexWrap = 'wrap';

    const sendAsWrap = document.createElement('div');
    sendAsWrap.style.position = 'relative';
    sendAsWrap.style.display = 'inline-flex';

    const sendAsButton = makeButton('Send as ▾', SEND_AS_BUTTON_ID, '#05cabe');
    sendAsButton.title = 'Choose a staff member and send the WeCom payment message.';

    const sendAsMenu = makeSendAsMenu();

    sendAsButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const isOpen = sendAsMenu.style.display === 'block';
      sendAsMenu.style.display = isOpen ? 'none' : 'block';
    });

    sendAsWrap.appendChild(sendAsButton);
    sendAsWrap.appendChild(sendAsMenu);

    const status = document.createElement('span');
    status.id = STATUS_ID;
    status.style.font = '700 13px ' + CIN7_FONT;
    status.style.color = CIN7_TEXT_GREY;
    status.style.whiteSpace = 'nowrap';
    status.style.maxWidth = '700px';
    status.style.overflow = 'hidden';
    status.style.textOverflow = 'ellipsis';

    wrapper.appendChild(sendAsWrap);
    wrapper.appendChild(status);

    document.addEventListener('click', () => {
      const menu = document.getElementById(SEND_AS_MENU_ID);
      if (menu) menu.style.display = 'none';
    });

    return wrapper;
  }

  function insertButtonUnderPaymentHeading() {
    const paymentHeading = findPaymentHeading();
    if (!paymentHeading) return false;

    const wrapper = makeWrapper();
    wrapper.style.marginTop = '10px';
    wrapper.style.marginBottom = '10px';

    paymentHeading.insertAdjacentElement('afterend', wrapper);

    return true;
  }

  function removeButton() {
    document.getElementById(WRAPPER_ID)?.remove();
    document.getElementById(SPACER_ID)?.remove();
  }

  function createButton() {
    if (!document.body) return;

    if (!isInvoiceScreen()) {
      removeButton();
      return;
    }

    if (
      document.getElementById(SEND_AS_BUTTON_ID) ||
      document.getElementById(SEND_AS_MENU_ID)
    ) {
      return;
    }

    const row = findPaymentActionRow();

    if (row) {
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.width = '100%';

      const spacer = document.createElement('div');
      spacer.id = SPACER_ID;
      spacer.style.flex = '1';

      const wrapper = makeWrapper();

      row.appendChild(spacer);
      row.appendChild(wrapper);

      return;
    }

    insertButtonUnderPaymentHeading();
  }

  function boot() {
    if (!document.body) return;

    setTimeout(createButton, 400);
    setTimeout(createButton, 1200);
    setTimeout(createButton, 2500);
    setTimeout(createButton, 5000);
    setTimeout(createButton, 8000);
  }

  boot();

  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);

  setInterval(createButton, 3000);
})();
