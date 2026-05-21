// ==UserScript==
// @name         Cin7 WeCom Payment Message Sender
// @namespace    livingculture
// @version      1.7
// @description  Copies or sends a WeCom payment message from Cin7 invoice/payment screen only.
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

  const COPY_BUTTON_ID = 'lc-copy-wecom-payment-btn';
  const SEND_BUTTON_ID = 'lc-send-wecom-payment-btn';
  const STATUS_ID = 'lc-copy-wecom-payment-status';
  const WRAPPER_ID = 'lc-wecom-payment-wrapper';
  const SPACER_ID = 'lc-wecom-payment-spacer';
  const WEBHOOK_STORAGE_KEY = 'lc_wecom_payment_webhook_url';

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

  function isInvoiceScreen() {
    const bodyText = getBodyText().toLowerCase();

    const hasPayment = bodyText.includes('payment');
    const hasBalanceDue = bodyText.includes('balance due');
    const hasInvoiceMemo = bodyText.includes('invoice memo');
    const hasInvoiceLines = bodyText.includes('invoice lines');
    const hasAdditionalCosts = bodyText.includes('additional costs');
    const hasBeforeTax = bodyText.includes('before tax');

    return hasPayment && hasBalanceDue && (hasInvoiceMemo || hasInvoiceLines || hasAdditionalCosts || hasBeforeTax);
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

  function findPaymentHeading() {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span, p, label'))
      .filter(isVisible)
      .find(el => clean(el.innerText || el.textContent).toLowerCase() === 'payment') || null;
  }

  function findPaymentActionRow() {
    const paymentHeading = findPaymentHeading();
    if (!paymentHeading) return null;

    const paymentRect = paymentHeading.getBoundingClientRect();

    const candidates = Array.from(document.querySelectorAll('div, section, fieldset'))
      .filter(isVisible)
      .map(el => ({
        el,
        rect: el.getBoundingClientRect(),
        text: clean(el.innerText || el.textContent)
      }))
      .filter(item => {
        const text = item.text.toLowerCase();

        const belowPayment =
          item.rect.top >= paymentRect.bottom - 10 &&
          item.rect.top <= paymentRect.bottom + 130;

        const hasPaymentButtons =
          text.includes('+ payment') ||
          text.includes('use customer credit') ||
          text.includes('allocate credit note') ||
          text.includes('use a gift card');

        const rowSized =
          item.rect.width > 350 &&
          item.rect.height >= 25 &&
          item.rect.height <= 110;

        return belowPayment && hasPaymentButtons && rowSized;
      })
      .sort((a, b) => {
        const aScore = scoreActionRow(a.text, a.rect, paymentRect);
        const bScore = scoreActionRow(b.text, b.rect, paymentRect);
        return bScore - aScore;
      });

    return candidates[0]?.el || null;
  }

  function scoreActionRow(text, rect, paymentRect) {
    let score = 0;
    const lower = text.toLowerCase();

    if (lower.includes('use a gift card')) score += 50;
    if (lower.includes('allocate credit note')) score += 40;
    if (lower.includes('use customer credit')) score += 40;
    if (lower.includes('+ payment')) score += 35;

    score -= Math.abs(rect.top - paymentRect.bottom) / 5;

    return score;
  }

  function findPaymentRows() {
    const paymentHeading = findPaymentHeading();
    if (!paymentHeading) return [];

    const paymentTop = paymentHeading.getBoundingClientRect().top;

    const rows = Array.from(document.querySelectorAll('tr, [role="row"], div'))
      .filter(isVisible)
      .map(el => ({
        el,
        rect: el.getBoundingClientRect(),
        text: clean(el.innerText || el.textContent)
      }))
      .filter(item => item.rect.top > paymentTop)
      .filter(item => /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(item.text))
      .filter(item => /succeed|eftpos|apos|terminal|q card|credit card|visa|mastercard|bank transfer|cash/i.test(item.text))
      .filter(item => /[0-9,]+\.\d{2}/.test(item.text))
      .map(item => {
        const dateValue = parseDateNZ(item.text);
        const amounts = item.text.match(/[0-9,]+\.\d{2}/g) || [];
        const amount = amounts.length ? moneyToNumber(amounts[amounts.length - 1]) : null;

        return {
          text: item.text,
          dateValue,
          amount,
          rect: item.rect
        };
      })
      .filter(row => row.dateValue !== null && row.amount !== null)
      .sort((a, b) => {
        if (b.dateValue !== a.dateValue) return b.dateValue - a.dateValue;
        return b.rect.top - a.rect.top;
      });

    return rows;
  }

  function findLatestPaymentRow() {
    const rows = findPaymentRows();

    if (rows.length) {
      return rows[0];
    }

    return null;
  }

  function findPaymentMethod() {
    const latestPaymentRow = findLatestPaymentRow();
    const paymentRowText = latestPaymentRow ? latestPaymentRow.text.toLowerCase() : '';
    const bodyText = getBodyText().toLowerCase();
    const text = paymentRowText || bodyText;

    if (text.includes('q card') || text.includes('qcard')) return 'Q card';
    if (text.includes('eftpos') || text.includes('apos') || text.includes('terminal')) return 'EFTPOS';
    if (text.includes('visa') || text.includes('mastercard') || text.includes('credit card')) return 'credit card';
    if (text.includes('bank transfer')) return 'bank transfer';
    if (text.includes('cash')) return 'cash';

    return 'payment';
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
    const bodyText = getBodyText();

    const nzdMatches = [...bodyText.matchAll(/NZD\s*([0-9,]+\.\d{2})/gi)];

    if (nzdMatches.length) {
      return Number(nzdMatches[nzdMatches.length - 1][1].replace(/,/g, ''));
    }

    const paymentHeading = findPaymentHeading();
    const paymentTop = paymentHeading ? paymentHeading.getBoundingClientRect().top : Infinity;

    const summaryAmounts = Array.from(document.querySelectorAll('div, span, td, th'))
      .filter(isVisible)
      .map(el => ({
        text: clean(el.innerText || el.textContent),
        rect: el.getBoundingClientRect()
      }))
      .filter(item => item.rect.top < paymentTop)
      .filter(item => /[0-9,]+\.\d{2}/.test(item.text))
      .flatMap(item => item.text.match(/[0-9,]+\.\d{2}/g) || [])
      .map(value => Number(value.replace(/,/g, '')))
      .filter(value => !Number.isNaN(value));

    if (summaryAmounts.length) {
      return Math.max(...summaryAmounts);
    }

    const totalMatches = [...bodyText.matchAll(/TOTAL\s*([0-9,]+\.\d{2})/gi)];

    if (totalMatches.length) {
      return Number(totalMatches[totalMatches.length - 1][1].replace(/,/g, ''));
    }

    return null;
  }

  function classifyPayment(invoiceTotal, paymentAmount, balanceDue) {
    if (paymentAmount === null) return 'payment';

    const halfTotal = invoiceTotal !== null ? invoiceTotal / 2 : null;

    const balanceIsZero = balanceDue !== null && nearlyEqual(balanceDue, 0, 0.05);
    const paymentEqualsTotal = invoiceTotal !== null && nearlyEqual(paymentAmount, invoiceTotal, 1.5);
    const paymentIsHalf = halfTotal !== null && nearlyEqual(paymentAmount, halfTotal, 2.5);
    const balanceRoughlyEqualsPayment = balanceDue !== null && nearlyEqual(balanceDue, paymentAmount, 2.5);

    if (balanceIsZero && invoiceTotal !== null && paymentAmount < invoiceTotal - 1.5) {
      return 'outstanding balance';
    }

    if (balanceIsZero && paymentEqualsTotal) {
      return 'paid in full';
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

  function buildMessage() {
    const orderNumber = findOrderNumber();
    const paymentMethod = findPaymentMethod();
    const paymentAmount = findPaymentAmount();
    const invoiceTotal = findInvoiceTotal();
    const balanceDue = findBalanceDue();

    const paymentType = classifyPayment(invoiceTotal, paymentAmount, balanceDue);
    const amount = paymentAmount !== null ? `$${formatMoney(paymentAmount)}` : '$';

    if (paymentType === 'paid in full') {
      return `${orderNumber} ${paymentMethod} payment ${amount} paid in full`;
    }

    if (paymentType === '50% deposit') {
      return `${orderNumber} ${paymentMethod} 50% deposit ${amount}`;
    }

    if (paymentType === 'outstanding balance') {
      return `${orderNumber} ${paymentMethod} outstanding balance ${amount}`;
    }

    if (paymentType === 'part payment') {
      return `${orderNumber} ${paymentMethod} part payment ${amount}`;
    }

    return `${orderNumber} ${paymentMethod} payment ${amount}`;
  }

  function setStatus(message, error = false) {
    const status = document.getElementById(STATUS_ID);

    if (status) {
      status.textContent = message;
      status.style.color = error ? '#9a2d20' : '#2d5c4e';
    }
  }

  async function copyToClipboard(message) {
    try {
      await navigator.clipboard.writeText(message);
    } catch (error) {
      const temp = document.createElement('textarea');
      temp.value = message;
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      temp.style.top = '-9999px';
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }
  }

  async function copyMessage() {
    const message = buildMessage();

    await copyToClipboard(message);

    setStatus(`Copied: ${message}`);

    const button = document.getElementById(COPY_BUTTON_ID);

    if (button) {
      const oldText = button.textContent;
      button.textContent = 'Copied';

      setTimeout(() => {
        button.textContent = oldText;
      }, 1400);
    }
  }

  function getWebhookUrl() {
    let url = localStorage.getItem(WEBHOOK_STORAGE_KEY);

    if (!url) {
      url = prompt('Paste the WeCom Message Push webhook URL:');

      if (url) {
        url = url.trim();
        localStorage.setItem(WEBHOOK_STORAGE_KEY, url);
      }
    }

    return url;
  }

  function sendToWeCom() {
    const message = buildMessage();
    const webhookUrl = getWebhookUrl();

    if (!webhookUrl) {
      setStatus('No WeCom webhook URL saved.', true);
      return;
    }

    setStatus('Sending to WeCom...');

    GM_xmlhttpRequest({
      method: 'POST',
      url: webhookUrl,
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

          const button = document.getElementById(SEND_BUTTON_ID);

          if (button) {
            const oldText = button.textContent;
            button.textContent = 'Sent';

            setTimeout(() => {
              button.textContent = oldText;
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

  function resetWebhook() {
    localStorage.removeItem(WEBHOOK_STORAGE_KEY);
    alert('Saved WeCom webhook has been cleared. Click Send to WeCom again to paste a new one.');
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
    button.style.font = '700 14px Arial, sans-serif';
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

  function makeWrapper() {
    const wrapper = document.createElement('div');
    wrapper.id = WRAPPER_ID;
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.marginLeft = 'auto';
    wrapper.style.zIndex = '50';

    const copyButton = makeButton('Copy WeCom Payment', COPY_BUTTON_ID, '#05cabe');
    copyButton.addEventListener('click', copyMessage);

    const sendButton = makeButton('Send to WeCom', SEND_BUTTON_ID, '#2d5c4e');
    sendButton.addEventListener('click', sendToWeCom);

    sendButton.addEventListener('contextmenu', event => {
      event.preventDefault();
      resetWebhook();
    });

    const status = document.createElement('span');
    status.id = STATUS_ID;
    status.style.font = '700 13px Arial, sans-serif';
    status.style.color = '#2d5c4e';
    status.style.whiteSpace = 'nowrap';
    status.style.maxWidth = '520px';
    status.style.overflow = 'hidden';
    status.style.textOverflow = 'ellipsis';

    wrapper.appendChild(copyButton);
    wrapper.appendChild(sendButton);
    wrapper.appendChild(status);

    return wrapper;
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

    if (document.getElementById(COPY_BUTTON_ID) || document.getElementById(SEND_BUTTON_ID)) return;

    const row = findPaymentActionRow();

    if (!row) return;

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
  }

  function boot() {
    if (!document.body) return;

    setTimeout(createButton, 400);
    setTimeout(createButton, 1200);
    setTimeout(createButton, 2500);
    setTimeout(createButton, 5000);
  }

  boot();

  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);

  setInterval(createButton, 3000);
})();
