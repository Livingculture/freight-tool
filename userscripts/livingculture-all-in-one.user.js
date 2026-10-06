// ==UserScript==
// @name         Living Culture All-in-One
// @namespace    livingculture
// @version      0.1.58
// @description  Approved Living Culture Omni, Cin7 Core, Gmail, HubSpot and website tools in one Tampermonkey install.
// @author       Living Culture
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @match        https://*.dearsystems.com/*
// @match        https://*.cin7core.com/*
// @match        https://*.cin7.com/*
// @match        https://livingculture.co.nz/*
// @match        https://www.livingculture.co.nz/*
// @match        https://living-culture-email-helper.vercel.app/*
// @match        https://lxexport.dearportal.com/*
// @match        https://*.dearportal.com/*
// @match        https://mail.google.com/*
// @match        https://app.hubspot.com/*
// @match        https://*.hubspot.com/*
// @run-at       document-start
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      livingculture.co.nz
// @connect      photon.komoot.io
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      *.googleusercontent.com
// @connect      raw.githubusercontent.com
// @connect      go.cin7.com
// @connect      cin7-pdf-attachments.vercel.app
// @connect      drive.google.com
// @connect      drive.usercontent.google.com
// @connect      github.com
// @connect      release-assets.githubusercontent.com
// @connect      living-culture-workflow.vercel.app
// @connect      living-culture-freight.vercel.app
// @connect      qvoacxmzsmulhnllfntfl.supabase.co
// @connect      qvoacxmzsmulhnllfntl.supabase.co
// @connect      supabase.co
// @connect      *.supabase.co
// @connect      qyapi.weixin.qq.com
// @resource     copySku https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-copy-sku.user.js?v=2.0
// @resource     omniFreight https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-cin7-lc-freight.user.js?v=0.1.29
// @resource     addressAutocomplete https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-address-autocomplete.user.js?v=0.1.10
// @resource     customComments https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-comments.user.js?v=0.1.15
// @resource     installFees https://raw.githubusercontent.com/Livingculture/freight-tool/b3e3a323b1b0ba6a9aed3bf11f328375a7728e34/userscripts/omni-install-fee-helper.user.js
// @resource     customProducts https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-product-helper.user.js?v=0.1.10
// @resource     websiteShortcuts https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-website-shortcuts.user.js?v=0.1.31
// @resource     productAvailability https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-product-availability.user.js?v=0.1.6
// @resource     chinaWarehouse https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-china-warehouse-popup-clean-mode.user.js?v=0.1.1
// @resource     quoteDefaults https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-quote-defaults.user.js?v=0.1.10
// @resource     hideOrderSettings https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hide-order-settings.user.js?v=0.1.2
// @resource     emailHelperCompose https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-compose.user.js?v=0.1.45
// @resource     pdfAttachments https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pdf-attachments.user.js?v=0.4.9
// @resource     gmailDrawings https://raw.githubusercontent.com/Livingculture/freight-tool/fcfb0351d321f7cc3aa08aecd2919121a6f81046/userscripts/gmail-drawings.user.js
// @resource     gmailCareGuides https://raw.githubusercontent.com/Livingculture/freight-tool/fcfb0351d321f7cc3aa08aecd2919121a6f81046/userscripts/gmail-care-guides.user.js
// @resource     hubspotShortcut https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hubspot-shortcut.user.js?v=0.2.0
// @resource     workflow https://raw.githubusercontent.com/Livingculture/freight-tool/20a15c2d99fd90179a2d2c2e7f6c4381b7e0545b/userscripts/omni-livingculture-workflow.user.js
// @resource     gmailHubspotAttachments https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-hubspot-attachments.user.js?v=0.1.6
// @resource     gmailQuotePdfs https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-omni-quote-pdfs.user.js?v=0.1.7
// @resource     emailHelperOnly https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-only.user.js?v=0.1.1
// @resource     quoteMemo https://raw.githubusercontent.com/Livingculture/freight-tool/b3e3a323b1b0ba6a9aed3bf11f328375a7728e34/userscripts/omni-quote-memo-info.user.js
// @resource     pergolaGuide https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pergola-modification-guide.user.js?v=0.1.1
// @resource     hubspotColours https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/hubspot-contrast-colours.user.js?v=0.1.16
// @resource     clearanceInfo https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-clearance-info-sheet.user.js?v=0.1.15
// @resource     promoSummary https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-promo-summary.user.js?v=3.7
// @resource     newProducts https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-new-products-info-sheet.user.js?v=0.1.7
// @resource     wecomPayment https://raw.githubusercontent.com/Livingculture/freight-tool/98e93c9ee313744f16daeab95a35f8d04bbf580d/userscripts/cin7-wecom-payment-message.user.js
// @resource     staffReps https://raw.githubusercontent.com/Livingculture/freight-tool/3cc7c5d5391066307b53282bd4cd89a63adc99ea/userscripts/livingculture-reps.json
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-all-in-one.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-all-in-one.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  'use strict';

  const host = location.hostname.toLowerCase();
  const path = location.pathname;
  const isOmni = host === 'go.cin7.com';
  const isOmniQuote = isOmni && /\/Cloud\/TransactionEntry\/TransactionEntry\.aspx/i.test(path);
  const isOmniContactLog = isOmni && /\/Cloud\/CRM\/ContactLog\.aspx/i.test(path);
  const isOmniShoppingAdmin = isOmni && /\/Cloud\/ShoppingCartAdmin\//i.test(path);
  const isEmailHelper = host === 'living-culture-email-helper.vercel.app';
  const isLivingCulture = host === 'livingculture.co.nz' || host === 'www.livingculture.co.nz';
  const isLivingCultureProduct = isLivingCulture && (/^\/products\//i.test(path) || /^\/collections\/[^/]+\/products\//i.test(path));
  const isDearPortal = host === 'lxexport.dearportal.com' || host.endsWith('.dearportal.com');
  const isGmail = host === 'mail.google.com';
  const isHubSpot = host === 'app.hubspot.com' || host.endsWith('.hubspot.com');
  const isCin7Core = host === 'inventory.dearsystems.com' || host.endsWith('.dearsystems.com') || host.endsWith('.cin7core.com') || host.endsWith('.cin7.com');

  const components = [
    { resource: 'copySku', file: 'livingculture-copy-sku.user.js', runAt: 'idle', enabled: isLivingCultureProduct },
    { resource: 'omniFreight', file: 'omni-cin7-lc-freight.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'addressAutocomplete', file: 'omni-address-autocomplete.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'customComments', file: 'omni-custom-comments.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'installFees', file: 'omni-install-fee-helper.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'customProducts', file: 'omni-custom-product-helper.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'websiteShortcuts', file: 'omni-website-shortcuts.user.js', runAt: 'idle', enabled: isOmniQuote || isLivingCulture },
    { resource: 'productAvailability', file: 'omni-product-availability.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'chinaWarehouse', file: 'omni-china-warehouse-popup-clean-mode.user.js', runAt: 'idle', enabled: isOmniQuote || isDearPortal },
    { resource: 'quoteDefaults', file: 'omni-quote-defaults.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'hideOrderSettings', file: 'omni-hide-order-settings.user.js', runAt: 'start', enabled: isOmniQuote },
    { resource: 'emailHelperCompose', file: 'omni-email-helper-compose.user.js', runAt: 'start', enabled: isOmniQuote || isOmniContactLog || isEmailHelper },
    { resource: 'pdfAttachments', file: 'omni-pdf-attachments.user.js', runAt: 'idle', enabled: isOmniQuote || isOmniContactLog || isEmailHelper },
    { resource: 'gmailDrawings', file: 'gmail-drawings.user.js', runAt: 'idle', enabled: isGmail },
    { resource: 'gmailCareGuides', file: 'gmail-care-guides.user.js', runAt: 'idle', enabled: isGmail },
    { resource: 'hubspotShortcut', file: 'omni-hubspot-shortcut.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'workflow', file: 'omni-livingculture-workflow.user.js', runAt: 'start', enabled: isOmniQuote || isOmniShoppingAdmin },
    { resource: 'gmailHubspotAttachments', file: 'gmail-hubspot-attachments.user.js', runAt: 'start', enabled: isGmail },
    { resource: 'gmailQuotePdfs', file: 'gmail-omni-quote-pdfs.user.js', runAt: 'idle', enabled: isOmniQuote || isOmniShoppingAdmin || isGmail },
    { resource: 'emailHelperOnly', file: 'omni-email-helper-only.user.js', runAt: 'start', enabled: isOmniContactLog || isEmailHelper },
    { resource: 'quoteMemo', file: 'omni-quote-memo-info.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'pergolaGuide', file: 'omni-pergola-modification-guide.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'hubspotColours', file: 'hubspot-contrast-colours.user.js', runAt: 'start', enabled: isHubSpot },
    { resource: 'clearanceInfo', file: 'omni-clearance-info-sheet.user.js', runAt: 'start', enabled: isCin7Core },
    { resource: 'promoSummary', file: 'cin7-promo-summary.user.js', runAt: 'body', enabled: isOmniQuote },
    { resource: 'newProducts', file: 'cin7-new-products-info-sheet.user.js', runAt: 'start', enabled: isCin7Core },
    { resource: 'wecomPayment', file: 'cin7-wecom-payment-message.user.js', runAt: 'idle', enabled: isCin7Core }
  ];

  const earlyOmniTools = new Set(['omniFreight', 'installFees', 'customProducts', 'websiteShortcuts', 'productAvailability', 'chinaWarehouse', 'quoteMemo', 'pergolaGuide']);
  if (isOmniQuote) components.forEach(component => {
    if (earlyOmniTools.has(component.resource)) component.runAt = 'body';
  });

  const status = { version: '0.1.58', loaded: [], skipped: [], errors: [] };
  window.__lcAllInOneStatus = status;

  function execute(component) {
    if (!component.enabled) {
      status.skipped.push(component.file);
      return;
    }
    try {
      const source = GM_getResourceText(component.resource);
      if (!source) throw new Error('Bundled resource is empty');
      const run = new Function(
        'GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand', 'GM_getResourceText',
        `${source}\n//# sourceURL=lc-all-in-one/${component.file}`
      );
      run(GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_registerMenuCommand, GM_getResourceText);
      status.loaded.push(component.file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.errors.push({ file: component.file, message });
      console.error(`[Living Culture All-in-One] ${component.file} failed:`, error);
    }
  }

  components.filter((component) => component.runAt === 'start').forEach(execute);

  let bodyComponentsStarted = false;
  function runBodyComponents() {
    if (bodyComponentsStarted || !document.body) return;
    bodyComponentsStarted = true;
    components.filter(component => component.runAt === 'body').forEach(execute);
  }
  if (document.body) runBodyComponents();
  else {
    const bodyObserver = new MutationObserver(() => {
      if (!document.body) return;
      bodyObserver.disconnect();
      runBodyComponents();
    });
    bodyObserver.observe(document, { childList: true, subtree: true });
  }

  function runIdleComponents() {
    components.filter((component) => component.runAt === 'idle').forEach(execute);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runIdleComponents, { once: true });
  } else {
    window.setTimeout(runIdleComponents, 0);
  }
})();
