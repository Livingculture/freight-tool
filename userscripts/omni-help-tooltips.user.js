// ==UserScript==
// @name         Living Culture Omni Help Tips
// @namespace    livingculture
// @version      0.1.0
// @description  Adds optional, plain-language help tooltips to Living Culture controls in Cin7 Omni.
// @author       Living Culture
// @match        https://go.cin7.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-help-tooltips.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-help-tooltips.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  'use strict';
  if (location.hostname !== 'go.cin7.com' || window.parent !== window) return;
  if (document.documentElement.dataset.lcOmniHelpTooltipsInstalled === '1') return;
  document.documentElement.dataset.lcOmniHelpTooltipsInstalled = '1';

  const TOGGLE_ID = 'lc-omni-help-tips-toggle';
  const TOOLTIP_ID = 'lc-omni-help-tooltip';
  const STYLE_ID = 'lc-omni-help-tooltip-styles';
  const STORAGE_KEY = 'lc-omni-help-tooltips-enabled-v1';
  const CONTROL_SELECTOR = 'button,a[href],input,select,textarea,[role="button"],[role="menuitem"],[role="option"],[role="tab"]';
  const customRoots = new Set([
    'lc-omni-heading-actions', 'lc-omni-customer-photo-actions', 'lc-omni-workflow-tools-bar',
    'lc-omni-website-shortcuts', 'lc-omni-order-settings-toggle-row', 'lc-cin7-action-row-v1',
    'lc-cin7-floating-actions-v1'
  ]);

  const idHelp = {
    'lc-omni-help-tips-toggle': ['Help Tips', 'Turn these Living Culture explanations on or off. Your choice is remembered on this computer.'],
    'lc-omni-staff-help-button': ['Staff Guide', 'Open the step-by-step Living Culture guide for using Omni and the connected Workflow system.'],
    'lc-omni-warranty-button': ['Warranty', 'Open the staff warranty guide to check cover periods, exclusions and the correct claim process.'],
    'lc-omni-report-issue': ['Report Issue', 'Report a problem with a quote, order, product, stock, delivery, installation, system or internal process. The current NZSO and customer are included when available.'],
    'lc-omni-clearance-info-button': ['Clearance Info', 'Open the current clearance-product sheet, including product notes, reasons and available discount information.'],
    'lc-cin7-new-products-button': ['New Products', 'Open the latest Living Culture new-product and incoming-product information.'],
    'lc-omni-customer-photos-button': ['Upload Photos', 'Add site, delivery or installation photos to the album for this customer and NZSO.'],
    'lc-omni-view-customer-album-button': ['View Album', 'Open the photo album linked to this job so you can review, annotate or remove its photos.'],
    'lc-omni-view-customer-albums-button': ['View Albums', 'Show all available photo albums for this customer when more than one job or album exists.'],
    'lc-site-visit-inline-button-v2': ['Site Visit', 'Book or update a site visit for this NZSO. The appointment is recorded in Workflow and the relevant WeCom notification can be sent.'],
    'lc-quote-review-inline-button-v1': ['Quote Review', 'Send this quote for internal review before it progresses. Check the customer, NZSO and optional notes in the confirmation window.'],
    'lc-hubspot-deal-inline-button-v1': ['HubSpot Deal', 'Create, update or open the HubSpot deal linked to this NZSO after the required quote steps are complete.'],
    'lc-quote-pdf-download-button-v2': ['Download Quote or Invoice', 'Download the current Omni document as a PDF. On a quote this produces the quote; on a sales order it produces the invoice.'],
    'lc-quote-pdf-download-button-v1': ['Download Quote or Invoice', 'Older download control. Update All-in-One to use the current quote and invoice downloader.'],
    'lc-clone-quote-button': ['Clone Quote', 'Create a new quote using this quote as the starting point. The original quote is kept unchanged.'],
    'lc-convert-sales-order-button': ['Convert to Sales Order', 'Convert this approved quote to a sales order while keeping the same NZSO number for tracking through Workflow.'],
    'lc-omni-jobs-overview-button': ['Jobs Overview', 'Open the Workflow overview showing all active jobs, progress stages, next actions and items needing attention.'],
    'lc-omni-drawings-button': ['Drawings', 'Open the drawing area for this NZSO to upload drawings, send customer approval links and review signed approvals.'],
    'lc-omni-workflow-nav-link': ['Workflow', 'Open the Living Culture Workflow menu for jobs, photos, site visits, deliveries, installations, collections, roster and sales reports.'],
    'lc-omni-copy-delivery-to-billing': ['Same as delivery address', 'Tick this to copy the delivery name, company and address into the billing-address fields. Unticking it leaves the copied details in place so they can be edited.'],
    'lc-omni-freight-toggle': ['Freight Costs', 'Open the freight calculator for the products and delivery address on this quote or sales order.'],
    'lc-omni-containers-open': ['LC Containers', 'Open the Living Culture container and freight tool for container availability and shipment information.'],
    'lc-omni-panel-close': ['Close Freight Costs', 'Close the freight panel. This does not remove any freight line already added to the document.'],
    'lc-omni-use-cin7': ['Refresh Freight', 'Recalculate freight using the current Omni line-item quantities and delivery address.'],
    'lc-omni-add-product': ['Add Another Product', 'Add another product field to the manual freight calculation.'],
    'lc-omni-manual-get': ['Get Freight Manually', 'Calculate freight from the products, quantities and address entered in this panel.'],
    'lc-omni-freight-description-select': ['Freight Description', 'Choose the freight description that will be used when a freight line is added to the quote.'],
    'lc-omni-custom-comments-button': ['Custom Comments', 'Build standard pergola or product wording, then copy it or fill the appropriate Omni comments fields.'],
    'lc-omni-install-fee-button': ['Install Fees', 'Search the approved installation services and add the selected fee as a new line item. Pergola fees may also be added automatically when installation is required.'],
    'lc-omni-custom-product-button': ['Custom Products', 'Search approved custom-product and service SKUs, then add the selected item to the quote.'],
    'lc-omni-pergola-guide-button': ['Pergola Guide', 'Check whether a pergola request is a minor modification or a custom pergola, and calculate the applicable modification fees.'],
    'lc-omni-quote-memo-button': ['Quote Memo Info', 'View the approved quote wording, copy it, or fill Delivery Instructions with the selected memo.'],
    'lc-omni-product-availability-button': ['NZ Availability', 'Check current New Zealand stock for every product already listed on this quote or sales order.'],
    'lc-omni-china-warehouse-button': ['Foshan Warehouse', 'Open the China warehouse stock view to check product availability at the Foshan warehouse.'],
    'lc-omni-hubspot-shortcut-button': ['HubSpot', 'Open HubSpot from the current Omni document.'],
    'lc-omni-order-settings-toggle': ['Order Settings', 'Show or hide the less frequently used Omni order-setting fields.'],
    'lc-omni-email-helper-compose-button': ['Email Helper', 'Prepare a customer email using the current Omni customer and document details.'],
    'lc-omni-pdf-attachments-button': ['Care Guides', 'Choose Living Culture care-guide PDFs to add to the customer email.'],
    'lc-omni-quote-pdf-button': ['Quote PDF', 'Choose an Omni quote PDF to add to the customer email.'],
    'lc-promo-summary-inline-button': ['Promotion Summary', 'Open the current promotion summary and product offer details.']
  };

  const textHelp = {
    'tasman': ['Tasman', 'Choose a Tasman mounting type, model, size and colour, then open the matching Living Culture product.'],
    'atlantic': ['Atlantic', 'Choose an Atlantic mounting type, model, size and colour, then open the matching Living Culture product.'],
    'baltic': ['Baltic', 'Choose a Baltic mounting type, model, size and colour, then open the matching Living Culture product.'],
    'caspian': ['Caspian', 'Choose a Caspian mounting type, model, size and colour, then open the matching Living Culture product.'],
    'blinds': ['Blinds', 'Choose the blind type, operation, size and colour, then open the matching Living Culture product.'],
    'gas fire pits': ['Gas Fire Pits', 'Open Living Culture gas fire-pit products in a new browser tab.'],
    'teak sofa': ['Teak Sofa', 'Open Living Culture teak outdoor-sofa products in a new browser tab.'],
    'aluminium sofa': ['Aluminium Sofa', 'Open Living Culture aluminium outdoor-sofa products in a new browser tab.'],
    'dining tables': ['Dining Tables', 'Open Living Culture outdoor dining tables in a new browser tab.'],
    'dining chairs': ['Dining Chairs', 'Open Living Culture outdoor dining chairs in a new browser tab.'],
    'bar furniture': ['Bar Furniture', 'Open Living Culture outdoor bar furniture in a new browser tab.'],
    'cantilever umbrellas': ['Cantilever Umbrellas', 'Open Living Culture cantilever umbrellas in a new browser tab.'],
    'outdoor grills': ['Outdoor Grills', 'Open Living Culture outdoor grills and barbecues in a new browser tab.'],
    'awnings': ['Awnings', 'Open Living Culture awnings in a new browser tab.'],
    'patio covers': ['Patio Covers', 'Open Living Culture patio covers in a new browser tab.'],
    'open workflow': ['Open Workflow', 'Open the main Living Culture Workflow planner.'],
    'customer photos': ['Customer Photos', 'Open the Workflow customer-photo albums.'],
    'deliver': ['Deliver', 'Open the Workflow delivery planner.'],
    'install': ['Install', 'Open the Workflow installation planner.'],
    'collect': ['Collect', 'Open the Workflow collection planner.'],
    'roster': ['Roster', 'Open the Workflow staff roster.'],
    'weekly sales': ['Weekly Sales', 'Open the Living Culture weekly sales report.'],
    'refresh data': ['Refresh Data', 'Reload the latest information from the shared spreadsheet.'],
    'print / save pdf': ['Print or Save PDF', 'Open the browser print window so this information can be printed or saved as a PDF.'],
    'open spreadsheet': ['Open Spreadsheet', 'Open the shared source spreadsheet in a new browser tab.'],
    'open products': ['Open Products', 'Open the relevant Omni product records in a new browser tab.'],
    'refresh freight with these quantities': ['Refresh Freight', 'Recalculate freight using the current quantities and delivery address in Omni.'],
    'get freight manually': ['Get Freight Manually', 'Calculate freight using the products and address entered in the freight panel.'],
    'fill comments': ['Fill Comments', 'Insert the prepared wording into the matching Omni comments fields. Review the result before saving.'],
    'fill delivery instructions': ['Fill Delivery Instructions', 'Insert this approved memo into the Omni Delivery Instructions field and copy it to the clipboard.'],
    'clear selections': ['Clear Selections', 'Clear all selected pergola modifications and reset the calculated fee total.'],
    'save annotated copy': ['Save Annotated Copy', 'Save a new copy of the photo containing the arrows, notes or markings you added. The original photo is kept.'],
    'back to album': ['Back to Album', 'Return to the job photo album without saving more changes.'],
    'send review': ['Send Review', 'Submit this quote to Workflow for internal review using the details shown above.'],
    'create deal': ['Create Deal', 'Create the HubSpot deal and link it to this NZSO.'],
    'convert': ['Convert', 'Confirm conversion of this quote to a sales order.'],
    'book site visit': ['Book Site Visit', 'Save the selected site-visit date, time and details to Workflow.'],
    'copy email': ['Copy Email', 'Copy the prepared email text to the clipboard.'],
    'copy to cin7': ['Copy to Omni', 'Copy the prepared email or note back into the matching Omni field.'],
    'open gmail': ['Open Gmail', 'Open Gmail with the prepared customer email details.']
  };

  const contextHelp = {
    'lc-omni-install-fee-root': ['Installation Fees', 'Search the approved services, then use Add to insert the selected installation fee as a new Omni line item.'],
    'lc-omni-custom-product-root': ['Custom Products', 'Search the approved list, then use Add to insert the selected custom product or service as a new Omni line item.'],
    'lc-omni-custom-comments-root': ['Custom Comments', 'Prepare standard wording, then copy it or fill the relevant comments fields in Omni.'],
    'lc-omni-quote-memo-root': ['Quote Memo Info', 'Use the approved wording shown here and fill Delivery Instructions when appropriate.'],
    'lc-omni-quote-stock': ['Available Stock', 'Review stock for the products currently on the quote. Refresh checks the latest quantities again.'],
    'lc-omni-pergola-guide-root': ['Pergola Modification Guide', 'Use this guide to classify a requested change and calculate the correct modification fees.'],
    'lc-omni-pergola-picker': ['Product Selector', 'Choose each available option to identify and open the exact Living Culture product.'],
    'lc-omni-clearance-info-overlay': ['Clearance Information', 'Search or filter the current clearance products and open their product or spreadsheet details.'],
    'lc-cin7-new-products-overlay': ['New Products', 'Search or filter the latest new and incoming Living Culture products.'],
    'lc-omni-customer-album-popup': ['Customer Photos', 'Review the photos for this customer or job, annotate a copy, or remove an incorrect photo.'],
    'lc-omni-photo-editor': ['Photo Editor', 'Add arrows, boxes or notes to the photo and save an annotated copy without changing the original.'],
    'lc-site-visit-overlay-v2': ['Site Visit', 'Enter the appointment details and save the site visit against this NZSO in Workflow.'],
    'lc-omni-quote-review-confirm': ['Quote Review', 'Check the quote details and add any notes before submitting it for internal review.'],
    'lc-hs-modal-overlay': ['HubSpot Deal', 'Complete the required information to create or update the HubSpot deal linked to this NZSO.'],
    'lc-convert-order-confirm': ['Convert to Sales Order', 'Confirm only after the quote is saved and ready to become a sales order.']
  };

  let enabled = readEnabled();
  let activeTarget = null;
  let showTimer = 0;
  let observer = null;
  const bound = new WeakSet();
  const boundElements = new Set();
  const observedRoots = new WeakSet();
  const pendingNodes = new Set();

  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function key(value) { return clean(value).replace(/[\u00d7\u2715\u2304\u2303\u2304\u25be\u25b4]/g, '').replace(/\u2026/g, '').toLowerCase(); }
  function readEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (_) { return true; }
  }
  function saveEnabled(value) {
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch (_) { /* Private storage may be unavailable. */ }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${TOGGLE_ID}{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:36px;flex:0 0 auto;padding:0 12px;border:1px solid #526a82;border-radius:4px;background:#fff;color:#173b5f;font:700 13px Arial,sans-serif;white-space:nowrap;cursor:pointer}
      #${TOGGLE_ID}[aria-pressed="true"]{border-color:#176e58;background:#e8f6ef;color:#155b49}
      #${TOOLTIP_ID}{position:fixed;z-index:2147483647;box-sizing:border-box;width:max-content;max-width:min(380px,calc(100vw - 20px));padding:10px 12px;border:1px solid #526f8e;border-radius:7px;background:#102f52;color:#fff;box-shadow:0 8px 24px rgba(7,29,55,.3);font:14px/1.38 Arial,sans-serif;pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .1s ease,transform .1s ease}
      #${TOOLTIP_ID}[data-open="true"]{opacity:1;transform:none}
      #${TOOLTIP_ID} strong{display:block;margin:0 0 3px;color:#fff;font-size:14px}
      #${TOOLTIP_ID} span{display:block;color:#eaf2f8}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureTooltip() {
    let tooltip = document.getElementById(TOOLTIP_ID);
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = TOOLTIP_ID;
      tooltip.setAttribute('role', 'tooltip');
      tooltip.setAttribute('aria-hidden', 'true');
      tooltip.innerHTML = '<strong></strong><span></span>';
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function rootIdFor(element) {
    for (let node = element; node; node = node.parentElement) {
      if (node.id?.startsWith('lc-')) return node.id;
    }
    const root = element.getRootNode();
    return root instanceof ShadowRoot && root.host?.id?.startsWith('lc-') ? root.host.id : '';
  }

  function fieldLabel(element) {
    if (element.id) {
      const root = element.getRootNode();
      const label = root.querySelector?.(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return clean(label.textContent);
    }
    const wrapping = element.closest?.('label');
    if (wrapping) return clean(Array.from(wrapping.childNodes).filter(node => node !== element).map(node => node.textContent).join(' '));
    return clean(element.getAttribute('aria-label') || element.placeholder || '');
  }

  function helpFor(element) {
    if (idHelp[element.id]) return idHelp[element.id];
    const label = clean(element.value && /^(button|submit)$/i.test(element.type || '') ? element.value : element.textContent || element.getAttribute('aria-label'));
    const normalized = key(label);
    if (textHelp[normalized]) return textHelp[normalized];
    if (normalized.startsWith('book site visit')) return textHelp['book site visit'];
    if (element.matches('.step')) {
      const stage = clean(element.querySelector('.label')?.textContent || 'Job stage');
      const state = clean(element.querySelector('.state')?.textContent || 'Not recorded');
      return [stage, `${state}. This stage is read from Workflow and shows where the current job is up to.`];
    }
    const rootId = rootIdFor(element);
    if (normalized === 'add') {
      if (rootId === 'lc-omni-install-fee-root') return ['Add Installation Fee', 'Add this approved installation service as a new line item on the current quote.'];
      if (rootId === 'lc-omni-custom-product-root') return ['Add Custom Product', 'Add this approved custom product or service as a new line item on the current quote.'];
    }
    if (normalized === 'copy') return ['Copy', 'Copy this prepared wording to the clipboard so it can be pasted elsewhere.'];
    if (/^refresh/.test(normalized)) return ['Refresh', 'Reload the latest available information for this panel.'];
    if (/^(close|cancel)$/.test(normalized) || element.getAttribute('aria-label') === 'Close') return ['Close', 'Close this Living Culture window without changing the underlying Omni document.'];
    if (/^remove/.test(normalized)) return ['Remove', 'Remove this selected item. Check the item carefully before continuing.'];
    if (/^add to email$/.test(normalized)) return ['Add to Email', 'Download the selected PDF files and add them to the email currently being prepared.'];
    if (contextHelp[rootId]) {
      if (element.matches('input,select,textarea')) {
        const name = fieldLabel(element) || (element.matches('select') ? 'Choose an Option' : 'Search or Enter Details');
        return [name, `${contextHelp[rootId][1]} This field helps narrow or complete that action.`];
      }
      return [label || contextHelp[rootId][0], contextHelp[rootId][1]];
    }
    if (element.id?.startsWith('lc-') || rootId) {
      const title = label || fieldLabel(element) || 'Living Culture Tool';
      if (element.matches('select')) return [title, 'Choose the appropriate option for this Living Culture tool.'];
      if (element.matches('input,textarea')) return [title, 'Enter or search for the information requested by this Living Culture tool.'];
      return [title, 'Use this Living Culture control to continue the action shown. Review the result before saving the Omni document.'];
    }
    return null;
  }

  function isCustomControl(element) {
    if (!(element instanceof Element) || element.id === TOGGLE_ID) return false;
    if (idHelp[element.id] || element.id?.startsWith('lc-') || Array.from(element.classList || []).some(name => name.startsWith('lc-'))) return true;
    const root = element.getRootNode();
    if (root instanceof ShadowRoot && root.host?.id?.startsWith('lc-')) return true;
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (node.id?.startsWith('lc-') || customRoots.has(node.id)) return true;
    }
    return false;
  }

  function positionTooltip(target) {
    const tooltip = ensureTooltip();
    const rect = target.getBoundingClientRect();
    const gap = 9;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = Math.max(10, Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - 10));
    const above = rect.top >= height + gap + 10;
    const top = above ? rect.top - height - gap : Math.min(innerHeight - height - 10, rect.bottom + gap);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.max(10, Math.round(top))}px`;
  }

  function hideTooltip() {
    clearTimeout(showTimer);
    showTimer = 0;
    const tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) { tooltip.dataset.open = 'false'; tooltip.setAttribute('aria-hidden', 'true'); }
    if (activeTarget?.getAttribute('aria-describedby') === TOOLTIP_ID) activeTarget.removeAttribute('aria-describedby');
    activeTarget = null;
  }

  function showTooltip(target, immediate = false) {
    if (!enabled || !target?.isConnected) return;
    const help = helpFor(target);
    if (!help) return;
    clearTimeout(showTimer);
    const open = () => {
      if (!enabled || !target.isConnected) return;
      hideTooltip();
      const tooltip = ensureTooltip();
      tooltip.querySelector('strong').textContent = help[0];
      tooltip.querySelector('span').textContent = help[1];
      tooltip.style.left = '-9999px';
      tooltip.style.top = '-9999px';
      tooltip.dataset.open = 'true';
      tooltip.setAttribute('aria-hidden', 'false');
      target.setAttribute('aria-describedby', TOOLTIP_ID);
      activeTarget = target;
      positionTooltip(target);
    };
    if (immediate) open();
    else showTimer = window.setTimeout(open, 280);
  }

  function bind(element) {
    if (bound.has(element) || !isCustomControl(element)) return;
    const help = helpFor(element);
    if (!help) return;
    bound.add(element);
    boundElements.add(element);
    element.dataset.lcHelpTip = '1';
    syncNativeTitle(element);
    element.addEventListener('pointerenter', () => showTooltip(element));
    element.addEventListener('pointerleave', hideTooltip);
    element.addEventListener('focus', () => showTooltip(element, true), true);
    element.addEventListener('blur', hideTooltip, true);
    element.addEventListener('click', hideTooltip);
  }

  function syncNativeTitle(element) {
    if (!element?.isConnected) { boundElements.delete(element); return; }
    if (enabled && element.hasAttribute('title')) {
      element.dataset.lcHelpOriginalTitle = element.getAttribute('title');
      element.removeAttribute('title');
    } else if (!enabled && element.dataset.lcHelpOriginalTitle) {
      element.setAttribute('title', element.dataset.lcHelpOriginalTitle);
      delete element.dataset.lcHelpOriginalTitle;
    }
  }

  function scanRoot(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll(`${CONTROL_SELECTOR}, .step`).forEach(bind);
    root.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) observeRoot(element.shadowRoot);
    });
  }


  function scanNode(node) {
    if (!(node instanceof Element) && !(node instanceof DocumentFragment)) return;
    if (node instanceof Element) {
      if (node.matches(`${CONTROL_SELECTOR}, .step`)) bind(node);
      if (node.shadowRoot) observeRoot(node.shadowRoot);
    }
    scanRoot(node);
  }

  function observeRoot(root) {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    observer.observe(root, { childList: true, subtree: true });
    scanRoot(root);
  }

  function updateToggle(button = document.getElementById(TOGGLE_ID)) {
    if (!button) return;
    const label = `Help Tips: ${enabled ? 'On' : 'Off'}`;
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', `Help Tips are ${enabled ? 'on' : 'off'}. Click to turn them ${enabled ? 'off' : 'on'}.`);
    button.title = 'Show or hide explanations for Living Culture controls';
  }

  function preferredToggleParent() {
    return document.getElementById('lc-omni-heading-actions')
      || document.getElementById('lc-omni-workflow-tools-bar')
      || document.getElementById('lc-omni-website-shortcuts');
  }

  function ensureToggle() {
    if (!document.body) return;
    let button = document.getElementById(TOGGLE_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = TOGGLE_ID;
      button.type = 'button';
      button.addEventListener('click', () => {
        enabled = !enabled;
        saveEnabled(enabled);
        hideTooltip();
        boundElements.forEach(syncNativeTitle);
        updateToggle(button);
      });
      document.body.appendChild(button);
    }
    updateToggle(button);
    const parent = preferredToggleParent();
    if (parent && button.parentElement !== parent) parent.appendChild(button);
    if (!parent) {
      button.style.position = 'fixed';
      button.style.right = '16px';
      button.style.bottom = '16px';
      button.style.zIndex = '2147483645';
    } else {
      button.style.position = 'static';
      button.style.right = '';
      button.style.bottom = '';
      button.style.zIndex = '';
    }
  }

  function scheduleScan(records = []) {
    for (const record of records) for (const node of record.addedNodes || []) pendingNodes.add(node);
    if (scheduleScan.pending) return;
    scheduleScan.pending = true;
    requestAnimationFrame(() => {
      scheduleScan.pending = false;
      ensureToggle();
      const nodes = Array.from(pendingNodes);
      pendingNodes.clear();
      nodes.forEach(scanNode);
    });
  }

  function boot() {
    ensureStyle();
    observer = new MutationObserver(scheduleScan);
    observeRoot(document);
    ensureToggle();
    window.addEventListener('resize', () => { if (activeTarget) positionTooltip(activeTarget); });
    document.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY) return;
      enabled = readEnabled();
      hideTooltip();
      boundElements.forEach(syncNativeTitle);
      updateToggle();
    });
    window.setInterval(() => { ensureToggle(); scanRoot(document); }, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
