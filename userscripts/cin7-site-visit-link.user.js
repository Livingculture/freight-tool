// ==UserScript==
// @name         Living Culture Cin7 Site Visit Card (Popup)
// @namespace    https://livingculture.co.nz/
// @version      1.6.0
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

  const BUTTON_ID = 'lc-site-visit-inline-button-v2';
  const OVERLAY_ID = 'lc-site-visit-overlay-v2';
  const WORKFLOW_API_URL = 'https://living-culture-workflow.vercel.app/api/site-visits';
  const WORKFLOW_PLANNER_URL = 'https://living-culture-workflow.vercel.app/';
  const API_KEY = '';
  const STATUSES = ['To be confirmed', 'Site Visit Confirmed', 'Completed', 'Hold'];
  const VISIT_BY = ['', 'Ian', 'Steve', 'Jaine', 'Vitalii', 'Pakjira', 'Blair', 'James', 'Ian/Steve', 'Ian/Jaine', 'Ian/Vitalii', 'Ian/Pakjira', 'Vitalii/James', 'Blair/James'];
  let apiProductCache = [];

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

  function extractOrderId(text) {
    const match = clean(text).match(/\bNZSO-\d+\b/i);
    return match ? match[0].toUpperCase() : '';
  }

  function deriveBranchFromRep(repName) {
    const raw = clean(repName);
    const code = raw.split('-')[0].trim().toUpperCase();
    if (!code) return '';
    return code;
  }

  function openPlannerWithCard(payload) {
    const params = new URLSearchParams();
    params.set('planner', 'site-visit');
    if (payload.lcBranch) params.set('siteVisitBranch', payload.lcBranch);
    if (payload.bookedDate) params.set('siteVisitDate', payload.bookedDate);
    if (payload.orderId) params.set('siteVisitOrderId', payload.orderId.toUpperCase());
    window.open(`${WORKFLOW_PLANNER_URL}?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  function extractProductLines() {
    if (apiProductCache.length) return apiProductCache.join(' | ');

    const products = [];

    const productHeaders = Array.from(document.querySelectorAll('th, td, div, span'))
      .filter(isVisible)
      .filter((node) => normalizeLabel(node.textContent || '') === 'product');

    for (const header of productHeaders) {
      const table = header.closest('table');
      if (!table) continue;

      const headerRow = header.closest('tr');
      if (!headerRow) continue;
      const headerCells = Array.from(headerRow.children);
      const productColumnIndex = headerCells.indexOf(header.closest('th, td'));
      if (productColumnIndex < 0) continue;

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      for (const row of rows) {
        if (!isVisible(row)) continue;
        const cells = Array.from(row.children);
        if (!cells[productColumnIndex]) continue;
        const cell = cells[productColumnIndex];

        const anchor = cell.querySelector('a');
        const raw = clean(anchor ? anchor.textContent : cell.textContent || '');
        if (!raw) continue;
        if (/^total:?$/i.test(raw)) continue;
        if (/add more items|export|import/i.test(raw)) continue;
        if (/^\d[\d\s,.-]*$/.test(raw)) continue;

        products.push(raw);
      }
    }

    // Fallback for editable line inputs if table selectors fail.
    if (!products.length) {
      const inputs = document.querySelectorAll(
        'input[placeholder*="product" i], input[placeholder*="description" i], textarea[placeholder*="description" i]'
      );
      inputs.forEach((node) => {
        if (!isVisible(node)) return;
        const value = clean(node.value || '');
        if (!value) return;
        if (/^total:?$/i.test(value)) return;
        if (/^\d[\d\s,.-]*$/.test(value)) return;
        products.push(value);
      });
    }

    const unique = [];
    const seen = new Set();
    for (const line of products) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(line);
    }

    return unique.slice(0, 8).join(' | ');
  }

  function collectProductCandidatesFromObject(node, out) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((item) => collectProductCandidatesFromObject(item, out));
      return;
    }
    if (typeof node !== 'object') return;

    const keys = Object.keys(node);
    const keySet = new Set(keys.map((key) => key.toLowerCase()));
    const possibleLine =
      keySet.has('product') ||
      keySet.has('productname') ||
      keySet.has('itemname') ||
      keySet.has('name') ||
      keySet.has('description') ||
      keySet.has('itemdescription');

    if (possibleLine) {
      const candidates = [
        node.ProductName,
        node.Product,
        node.ItemName,
        node.Name,
        node.Description,
        node.ItemDescription,
        node.Comment
      ];
      candidates.forEach((raw) => {
        const value = clean(raw);
        if (!value) return;
        if (/^total:?$/i.test(value)) return;
        if (/^\d[\d\s,.-]*$/.test(value)) return;
        if (/tax|discount|subtotal|total/i.test(value) && value.length < 30) return;
        if (!/[a-z]/i.test(value)) return;
        out.push(value);
      });
    }

    keys.forEach((key) => {
      collectProductCandidatesFromObject(node[key], out);
    });
  }

  function extractProductsFromApiPayload(payload) {
    const candidates = [];
    collectProductCandidatesFromObject(payload, candidates);
    const unique = [];
    const seen = new Set();
    for (const line of candidates) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(line);
    }
    return unique.slice(0, 8);
  }

  function inspectApiTextForProducts(text) {
    if (!text || typeof text !== 'string') return;
    if (text.length < 5 || text[0] !== '{' && text[0] !== '[') return;
    try {
      const json = JSON.parse(text);
      const products = extractProductsFromApiPayload(json);
      if (products.length) apiProductCache = products;
    } catch (error) {
      // Not JSON payload
    }
  }

  function hookNetworkForProductLines() {
    const nativeFetch = window.fetch;
    if (nativeFetch && !window.__lcSiteVisitFetchHooked) {
      window.__lcSiteVisitFetchHooked = true;
      window.fetch = async function patchedFetch(...args) {
        const response = await nativeFetch.apply(this, args);
        try {
          const url = String((args[0] && args[0].url) || args[0] || '');
          if (/sale|quote|order|advancedsale/i.test(url)) {
            response.clone().text().then(inspectApiTextForProducts).catch(() => {});
          }
        } catch (error) {
          // ignore
        }
        return response;
      };
    }

    if (!window.__lcSiteVisitXhrHooked) {
      window.__lcSiteVisitXhrHooked = true;
      const open = XMLHttpRequest.prototype.open;
      const send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__lcReqUrl = String(url || '');
        return open.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function patchedSend(...args) {
        this.addEventListener('load', function onLoad() {
          try {
            if (!/sale|quote|order|advancedsale/i.test(this.__lcReqUrl || '')) return;
            if (typeof this.responseText !== 'string') return;
            inspectApiTextForProducts(this.responseText);
          } catch (error) {
            // ignore
          }
        });
        return send.apply(this, args);
      };
    }
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
    const reference = readValueNearLabel('Reference');
    const rep = readValueNearLabel('Sales rep');
    const parsedDate = /^\d{2}\/\d{2}\/\d{4}$/.test(dateRaw)
      ? `${dateRaw.slice(6, 10)}-${dateRaw.slice(3, 5)}-${dateRaw.slice(0, 2)}`
      : localDateKey();
    const pageOrderId = extractOrderId(document.body ? document.body.innerText : '');
    return {
      status: 'To be confirmed',
      bookedDate: parsedDate,
      time: '',
      orderId: extractOrderId(reference) || pageOrderId || reference,
      placedBy: rep,
      visitBy: '',
      customerName: readValueNearLabel('Customer'),
      address: clean(`${address1} ${address2}`),
      phone: readValueNearLabel('Phone'),
      email: readValueNearLabel('Email'),
      product: extractProductLines(),
      comments: '',
      area: deriveBranchFromRep(rep),
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
      lcBranch: clean(field('lcSvArea').value).toUpperCase(),
      area: clean(field('lcSvArea').value).toUpperCase(),
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
          openPlannerWithCard(payload);
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
            <div class="lc-sv-field"><label>LC Branch</label><input id="lcSvArea" placeholder="AKL / PEN / CHCH / HAM / WHG / NAP" /></div>
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

  hookNetworkForProductLines();

  const observer = new MutationObserver(() => addButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
