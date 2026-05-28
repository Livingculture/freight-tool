// ==UserScript==
// @name         Living Culture Cin7 Site Visit Card
// @namespace    https://livingculture.co.nz/
// @version      1.1.0
// @description  Adds a Site Visit button beside Install Fees/Scan, opens editable card popup, then saves to Workflow planner.
// @author       Living Culture
// @match        https://inventory.dearsystems.com/Sale*
// @grant        GM_xmlhttpRequest
// @connect      living-culture-workflow.vercel.app
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/freight-mobile/userscripts/cin7-site-visit-link.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/freight-mobile/userscripts/cin7-site-visit-link.user.js
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'lc-site-visit-inline-button';
  const OVERLAY_ID = 'lc-site-visit-overlay';
  const WORKFLOW_API_URL = 'https://living-culture-workflow.vercel.app/api/site-visits';
  const API_KEY = '';
  const STATUSES = ['To be confirmed', 'Site Visit Confirmed', 'Completed', 'Hold'];
  const VISIT_BY = ['', 'Ian', 'Steve', 'Jaine', 'Vitalii', 'Pakjira', 'Blair', 'James', 'Ian/Steve', 'Ian/Jaine', 'Ian/Vitalii', 'Ian/Pakjira', 'Vitalii/James', 'Blair/James'];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeLabel(value) {
    return clean(value || '')
      .toLowerCase()
      .replace(/[*:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findButtonByLabel(label) {
    return Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(isVisible)
      .find((element) => clean(element.textContent || '').toLowerCase() === label.toLowerCase());
  }

  function readValueNearLabel(labelText) {
    const wanted = normalizeLabel(labelText);

    const fieldsets = Array.from(document.querySelectorAll('fieldset'))
      .filter(isVisible)
      .filter((fieldset) => {
        const legend = fieldset.querySelector('legend');
        return normalizeLabel(legend?.textContent || '') === wanted;
      });

    for (const fieldset of fieldsets) {
      const directControl = fieldset.querySelector('input:not([type="hidden"]), textarea, select');
      if (directControl) {
        const value = clean(directControl.value || directControl.getAttribute('value') || '');
        if (value) return value;
      }

      const displayNode = fieldset.querySelector('.select2-chosen, .chosen-container .chosen-single span, .k-input, .ui-select-match-text');
      if (displayNode) {
        const value = clean(displayNode.textContent || '');
        if (value && value !== 'choose...' && value !== 'type to search...') return value;
      }
    }

    const labels = Array.from(document.querySelectorAll('label, legend, span, div'))
      .filter(isVisible)
      .filter((node) => normalizeLabel(node.textContent || '') === wanted);

    for (const label of labels) {
      const root = label.closest('fieldset, .row, .col, .form-group, .input-group, div');
      if (!root) continue;
      const controls = Array.from(root.querySelectorAll('input:not([type="hidden"]), textarea, select'));
      for (const control of controls) {
        const value = clean(control.value || control.getAttribute('value') || '');
        if (value) return value;
      }

      const displayNodes = root.querySelectorAll('.select2-chosen, .chosen-container .chosen-single span, .k-input, .ui-select-match-text');
      for (const node of displayNodes) {
        const value = clean(node.textContent || '');
        if (value && value !== 'choose...' && value !== 'type to search...') return value;
      }
    }
    return '';
  }

  function cin7Draft() {
    const address1 = readValueNearLabel('Shipping address line 1') || readValueNearLabel('Billing address line 1');
    const address2 = readValueNearLabel('Shipping address line 2') || readValueNearLabel('Billing address line 2');
    const dateRaw = readValueNearLabel('Date');
    const parsedDate = /^\d{2}\/\d{2}\/\d{4}$/.test(dateRaw)
      ? `${dateRaw.slice(6, 10)}-${dateRaw.slice(3, 5)}-${dateRaw.slice(0, 2)}`
      : localDateKey();
    return {
      status: 'To be confirmed',
      bookedDate: parsedDate,
      time: '',
      orderId: readValueNearLabel('Reference'),
      placedBy: readValueNearLabel('Sales rep'),
      visitBy: '',
      customerName: readValueNearLabel('Customer'),
      address: clean(`${address1} ${address2}`),
      phone: readValueNearLabel('Phone'),
      email: readValueNearLabel('Email'),
      product: '',
      comments: '',
      area: '',
      sourceUrl: window.location.href
    };
  }

  function ensureStyles() {
    if (document.getElementById('lc-site-visit-style')) return;
    const style = document.createElement('style');
    style.id = 'lc-site-visit-style';
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:2147483645;display:none;align-items:center;justify-content:center;font-family:Arial,sans-serif}
      #${OVERLAY_ID}.open{display:flex}
      .lc-sv-panel{width:min(640px,94vw);max-height:92vh;background:#fff;border-radius:14px;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.35);border:1px solid #c9d6d3}
      .lc-sv-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #d9e3e1}
      .lc-sv-head h3{margin:0;font-size:28px;color:#20453f}
      .lc-sv-tag{font-size:12px;background:#e8efed;padding:6px 10px;border-radius:999px;font-weight:700;color:#3b635d}
      .lc-sv-body{padding:14px 16px;display:grid;gap:10px}
      .lc-sv-note{background:#dce6e4;border-left:5px solid #4e7a73;border-radius:8px;padding:10px;font-size:14px;color:#516764}
      .lc-sv-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .lc-sv-field{display:grid;gap:5px}
      .lc-sv-field label{font-size:12px;font-weight:800;color:#2f675f}
      .lc-sv-field input,.lc-sv-field textarea,.lc-sv-field select{border:1px solid #b9c8c5;border-radius:8px;padding:9px 10px;font-size:14px;color:#2e2e2e}
      .lc-sv-field textarea{min-height:72px;resize:vertical}
      .lc-sv-actions{display:flex;gap:10px;padding-top:4px}
      .lc-sv-actions button{border:1px solid #b6c8c5;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer}
      .lc-sv-primary{background:#f3c42f;border-color:#f3c42f;color:#193d37;flex:1}
      .lc-sv-close{background:#fff;color:#305f58}
      .lc-sv-msg{font-size:12px;font-weight:700;min-height:16px}
      .lc-sv-msg.error{color:#9b2d25}
      .lc-sv-msg.ok{color:#2d7a45}
      @media (max-width:680px){.lc-sv-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function field(id) {
    return document.getElementById(id);
  }

  function setMessage(text, error) {
    const el = field('lcSvMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = `lc-sv-msg ${error ? 'error' : 'ok'}`;
  }

  function fillForm(data) {
    field('lcSvStatus').value = data.status || 'To be confirmed';
    field('lcSvDate').value = data.bookedDate || localDateKey();
    field('lcSvTime').value = data.time || '';
    field('lcSvOrder').value = data.orderId || '';
    field('lcSvPlacedBy').value = data.placedBy || '';
    field('lcSvVisitBy').value = data.visitBy || '';
    field('lcSvCustomer').value = data.customerName || '';
    field('lcSvAddress').value = data.address || '';
    field('lcSvPhone').value = data.phone || '';
    field('lcSvEmail').value = data.email || '';
    field('lcSvProduct').value = data.product || '';
    field('lcSvComments').value = data.comments || '';
    field('lcSvArea').value = data.area || '';
  }

  function readForm() {
    return {
      status: clean(field('lcSvStatus').value),
      bookedDate: clean(field('lcSvDate').value) || localDateKey(),
      time: clean(field('lcSvTime').value),
      orderId: clean(field('lcSvOrder').value),
      placedBy: clean(field('lcSvPlacedBy').value),
      visitBy: clean(field('lcSvVisitBy').value),
      customerName: clean(field('lcSvCustomer').value),
      address: clean(field('lcSvAddress').value),
      phone: clean(field('lcSvPhone').value),
      email: clean(field('lcSvEmail').value),
      product: clean(field('lcSvProduct').value),
      comments: clean(field('lcSvComments').value),
      area: clean(field('lcSvArea').value),
      sourceUrl: window.location.href
    };
  }

  function closePanel() {
    const overlay = field(OVERLAY_ID);
    if (overlay) overlay.classList.remove('open');
  }

  function submitSiteVisit(event) {
    event.preventDefault();
    const payload = readForm();
    if (!payload.customerName && !payload.orderId && !payload.address) {
      setMessage('Add customer, order ID, or address before save.', true);
      return;
    }
    setMessage('Saving site visit card...', false);

    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

    GM_xmlhttpRequest({
      method: 'POST',
      url: WORKFLOW_API_URL,
      headers,
      data: JSON.stringify(payload),
      onload: (response) => {
        const data = JSON.parse(response.responseText || '{}');
        if (response.status >= 200 && response.status < 300 && data.ok) {
          setMessage('Saved to Site Visit planner.', false);
          window.setTimeout(closePanel, 700);
        } else {
          setMessage(data.error || `Save failed (${response.status}).`, true);
        }
      },
      onerror: () => setMessage('Could not connect to workflow API.', true)
    });
  }

  function ensureOverlay() {
    if (field(OVERLAY_ID)) return;
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="lc-sv-panel">
        <div class="lc-sv-head">
          <h3>New site visit card</h3>
          <span class="lc-sv-tag">From Cin7</span>
        </div>
        <form id="lcSvForm" class="lc-sv-body">
          <div class="lc-sv-note">Pre-filled from visible Cin7 fields. Edit anything before saving.</div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Status</label><select id="lcSvStatus">${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select></div>
            <div class="lc-sv-field"><label>Area</label><input id="lcSvArea" /></div>
          </div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Booked Date</label><input id="lcSvDate" type="date" /></div>
            <div class="lc-sv-field"><label>Time</label><input id="lcSvTime" placeholder="10:00 am" /></div>
          </div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Order ID</label><input id="lcSvOrder" /></div>
            <div class="lc-sv-field"><label>Placed By</label><input id="lcSvPlacedBy" /></div>
          </div>
          <div class="lc-sv-field"><label>Visit By</label><select id="lcSvVisitBy">${VISIT_BY.map((s) => `<option value="${s}">${s || '—'}</option>`).join('')}</select></div>
          <div class="lc-sv-field"><label>Customer Name</label><input id="lcSvCustomer" /></div>
          <div class="lc-sv-field"><label>Address</label><textarea id="lcSvAddress"></textarea></div>
          <div class="lc-sv-grid">
            <div class="lc-sv-field"><label>Phone</label><input id="lcSvPhone" /></div>
            <div class="lc-sv-field"><label>Email</label><input id="lcSvEmail" /></div>
          </div>
          <div class="lc-sv-field"><label>Product</label><textarea id="lcSvProduct"></textarea></div>
          <div class="lc-sv-field"><label>Comments</label><textarea id="lcSvComments"></textarea></div>
          <div class="lc-sv-actions">
            <button type="submit" class="lc-sv-primary">Save Site Visit Card</button>
            <button type="button" class="lc-sv-close" id="lcSvCloseBtn">Close</button>
          </div>
          <div id="lcSvMsg" class="lc-sv-msg"></div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    field('lcSvCloseBtn').addEventListener('click', closePanel);
    field('lcSvForm').addEventListener('submit', submitSiteVisit);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closePanel();
    });
  }

  function openPanel() {
    ensureOverlay();
    fillForm(cin7Draft());
    setMessage('', false);
    field(OVERLAY_ID).classList.add('open');
  }

  function addButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const anchor = findButtonByLabel('Install Fees') || findButtonByLabel('Scan');
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Site Visit';
    button.style.background = '#05cbbf';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cbbf';
    button.style.borderRadius = '4px';
    button.style.padding = '0 14px';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.height = `${Math.max(34, rect.height || 34)}px`;
    button.style.lineHeight = '1';
    button.style.marginLeft = '8px';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';
    button.addEventListener('mouseenter', () => {
      button.style.background = '#04b5aa';
      button.style.borderColor = '#04b5aa';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = '#05cbbf';
      button.style.borderColor = '#05cbbf';
    });
    button.addEventListener('click', openPanel);
    anchor.insertAdjacentElement('afterend', button);
  }

  function boot() {
    addButton();
    setTimeout(addButton, 500);
    setTimeout(addButton, 1500);
    setTimeout(addButton, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  const observer = new MutationObserver(() => addButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
