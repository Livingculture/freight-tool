// ==UserScript==
// @name         Living Culture All-in-One
// @namespace    livingculture
// @version      0.1.248
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
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
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
// @resource     omniFreight https://raw.githubusercontent.com/Livingculture/freight-tool/06dfe8197c078a343eccfac82d59c89008c4fd3a/userscripts/omni-cin7-lc-freight.user.js
// @resource     addressAutocomplete https://raw.githubusercontent.com/Livingculture/freight-tool/b4535df7b0a37793315db278d6fc022b511591c3/userscripts/omni-address-autocomplete.user.js
// @resource     customComments https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-comments.user.js?v=0.1.15
// @resource     installFees https://raw.githubusercontent.com/Livingculture/freight-tool/f32263abbd7d3eb8be01d52f6f4acffa27b00366/userscripts/omni-install-fee-helper.user.js
// @resource     customProducts https://raw.githubusercontent.com/Livingculture/freight-tool/72e0cf7ff05575a36b275e5a48d911d027daa49c/userscripts/omni-custom-product-helper.user.js
// @resource     customProductData https://raw.githubusercontent.com/Livingculture/freight-tool/454bc4336d12a1adc619d2011ffb61d29c1f08de/userscripts/cin7-custom-product-helper.user.js
// @resource     websiteShortcuts https://raw.githubusercontent.com/Livingculture/freight-tool/86774fbd10544cbc5d6b301c74599fa30ec48df5/userscripts/omni-website-shortcuts.user.js
// @resource     productAvailability https://raw.githubusercontent.com/Livingculture/freight-tool/f32263abbd7d3eb8be01d52f6f4acffa27b00366/userscripts/omni-product-availability.user.js
// @resource     chinaWarehouse https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-china-warehouse-popup-clean-mode.user.js?v=0.1.1
// @resource     caribbeanStock https://raw.githubusercontent.com/Livingculture/freight-tool/28da92afbd1accc345feaaa22904e398d501a81b/userscripts/caribbean-stock.user.js
// @resource     quoteDefaults https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-quote-defaults.user.js?v=0.1.10
// @resource     hideOrderSettings https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hide-order-settings.user.js?v=0.1.2
// @resource     emailHelperCompose https://raw.githubusercontent.com/Livingculture/freight-tool/722b6e81fda1148fdedb7084c658c910395ac77f/userscripts/omni-email-helper-compose.user.js
// @resource     pdfAttachments https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pdf-attachments.user.js?v=0.4.9
// @resource     hubspotShortcut https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hubspot-shortcut.user.js?v=0.2.0
// @resource     workflow https://raw.githubusercontent.com/Livingculture/freight-tool/5d26ad8c76e2f186bb310da93a45dfd95bc13a4a/userscripts/omni-livingculture-workflow.user.js
// @resource     staffUpdatesWidget https://raw.githubusercontent.com/Livingculture/freight-tool/33c91f265329d527a4e25b3c48c2ceac2e046210/userscripts/workflow-updates-dropdown.js
// @resource     workflowNavigation https://raw.githubusercontent.com/Livingculture/freight-tool/48cf388f7d6e6ecf8d5766fb9afd65931ff730a5/userscripts/omni-workflow-navigation.user.js
// @resource     warrantyGuide https://raw.githubusercontent.com/Livingculture/freight-tool/4c8f7709f96fdbd17c59fa9fe4e81cd5dab6345a/userscripts/omni-warranty-guide.user.js
// @resource     omniHelpTooltips https://raw.githubusercontent.com/Livingculture/freight-tool/f32263abbd7d3eb8be01d52f6f4acffa27b00366/userscripts/omni-help-tooltips.user.js
// @resource     emailHelperOnly https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-only.user.js?v=0.1.1
// @resource     quoteMemo https://raw.githubusercontent.com/Livingculture/freight-tool/b3e3a323b1b0ba6a9aed3bf11f328375a7728e34/userscripts/omni-quote-memo-info.user.js
// @resource     pergolaGuide https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pergola-modification-guide.user.js?v=0.1.1
// @resource     hubspotColours https://raw.githubusercontent.com/Livingculture/freight-tool/7a8b7129734197d862365448fafebb651cf4e133/userscripts/hubspot-contrast-colours.user.js
// @resource     hubspotQuoteReview https://raw.githubusercontent.com/Livingculture/freight-tool/2c12856/userscripts/hubspot-quote-line-review.user.js
// @resource     clearanceInfo https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-clearance-info-sheet.user.js?v=0.1.15
// @resource     promoSummary https://raw.githubusercontent.com/Livingculture/freight-tool/6c7e65a72b06ae04475bf0f16c7f508dcaf5e136/userscripts/cin7-promo-summary.user.js
// @resource     newProducts https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-new-products-info-sheet.user.js?v=0.1.7
// @resource     wecomPayment https://raw.githubusercontent.com/Livingculture/freight-tool/7cbb93a4a7401596e9e59ae067e7bdb534e81fb2/userscripts/cin7-wecom-payment-message.user.js
// @resource     staffReps https://raw.githubusercontent.com/Livingculture/freight-tool/ea57776e8bd2538252e992f3a68b3691093cc513/userscripts/livingculture-reps.json
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
  let isOmniReceiptWorker = false;
  if (isOmni) {
    try {
      const receiptHandoff = JSON.parse(localStorage.getItem('lc-quote-pdf-handoff-v2') || 'null');
      isOmniReceiptWorker = Boolean(sessionStorage.getItem('lc-quote-pdf-handoff-v2:worker'))
        || ['receipt', 'invoice'].includes(receiptHandoff?.template);
    } catch (error) {}
  }
  const isEmailHelper = host === 'living-culture-email-helper.vercel.app';
  const isLivingCulture = host === 'livingculture.co.nz' || host === 'www.livingculture.co.nz';
  const isLivingCultureProduct = isLivingCulture && (/^\/products\//i.test(path) || /^\/collections\/[^/]+\/products\//i.test(path));
  const isDearPortal = host === 'lxexport.dearportal.com' || host.endsWith('.dearportal.com');
  const isGmail = host === 'mail.google.com';
  const isHubSpot = host === 'app.hubspot.com' || host.endsWith('.hubspot.com');
  const isCin7Core = host === 'inventory.dearsystems.com' || host.endsWith('.dearsystems.com') || host.endsWith('.cin7core.com') || host.endsWith('.cin7.com');
  const isCin7CoreSale = isCin7Core && /^\/Sale\/?$/i.test(path);

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
    { resource: 'caribbeanStock', file: 'caribbean-stock.user.js', runAt: 'idle', enabled: isOmniQuote || isCin7CoreSale },
    { resource: 'quoteDefaults', file: 'omni-quote-defaults.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'hideOrderSettings', file: 'omni-hide-order-settings.user.js', runAt: 'start', enabled: isOmniQuote },
    { resource: 'emailHelperCompose', file: 'omni-email-helper-compose.user.js', runAt: 'start', enabled: isOmniQuote || isOmniContactLog || isEmailHelper || isGmail },
    { resource: 'pdfAttachments', file: 'omni-pdf-attachments.user.js', runAt: 'idle', enabled: isOmniQuote || isOmniContactLog || isEmailHelper },
    { resource: 'gmailDrawings', file: 'gmail-drawings.user.js', runAt: 'idle', enabled: isGmail },
    { resource: 'gmailCareGuides', file: 'gmail-care-guides.user.js', runAt: 'idle', enabled: isGmail },
    { resource: 'hubspotShortcut', file: 'omni-hubspot-shortcut.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'workflow', file: 'omni-livingculture-workflow.user.js', runAt: 'start', enabled: isOmniQuote || isOmniShoppingAdmin || isOmniReceiptWorker },
    { resource: 'workflowNavigation', file: 'omni-workflow-navigation.user.js', runAt: 'idle', enabled: isOmni },
    { resource: 'warrantyGuide', file: 'omni-warranty-guide.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'omniHelpTooltips', file: 'omni-help-tooltips.user.js', runAt: 'idle', enabled: isOmni },
    { resource: 'gmailHubspotAttachments', file: 'gmail-hubspot-attachments.user.js', runAt: 'start', enabled: isGmail },
    { resource: 'gmailQuotePdfs', file: 'gmail-omni-quote-pdfs.user.js', runAt: 'idle', enabled: isOmniQuote || isOmniShoppingAdmin || isGmail },
    { resource: 'emailHelperOnly', file: 'omni-email-helper-only.user.js', runAt: 'start', enabled: isOmniContactLog || isEmailHelper },
    { resource: 'quoteMemo', file: 'omni-quote-memo-info.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'pergolaGuide', file: 'omni-pergola-modification-guide.user.js', runAt: 'idle', enabled: isOmniQuote },
    { resource: 'hubspotColours', file: 'hubspot-contrast-colours.user.js', runAt: 'start', enabled: isHubSpot },
    { resource: 'hubspotQuoteReview', file: 'hubspot-quote-line-review.user.js', runAt: 'idle', enabled: isHubSpot },
    { resource: 'clearanceInfo', file: 'omni-clearance-info-sheet.user.js', runAt: 'start', enabled: isCin7Core },
    { resource: 'promoSummary', file: 'cin7-promo-summary.user.js', runAt: 'body', enabled: isOmniQuote },
    { resource: 'newProducts', file: 'cin7-new-products-info-sheet.user.js', runAt: 'start', enabled: isCin7Core },
    { resource: 'wecomPayment', file: 'cin7-wecom-payment-message.user.js', runAt: 'idle', enabled: isCin7Core }
  ];

  const earlyOmniTools = new Set(['omniFreight', 'installFees', 'customProducts', 'websiteShortcuts', 'productAvailability', 'chinaWarehouse', 'quoteMemo', 'pergolaGuide']);
  if (isOmniQuote) components.forEach(component => {
    if (earlyOmniTools.has(component.resource)) component.runAt = 'body';
  });

  const status = { version: '0.1.248', loaded: [], skipped: [], errors: [] };
  window.__lcAllInOneStatus = status;

  // BEGIN GENERATED GMAIL COMPONENTS
  // Static functions avoid runtime string evaluation under Gmail's page security policy.
  const gmailComponents = {
    emailHelperCompose: function () {
      (function () {
        "use strict";

        const EMAIL_HELPER_URL = "https://living-culture-email-helper.vercel.app";
        const BUTTON_ID = "lc-omni-email-helper-compose-button";
        const STYLE_ID = "lc-omni-email-helper-compose-styles";
        const PANEL_ID = "lc-omni-email-helper-panel";
        const LAYOUT_ID = "lc-omni-email-helper-layout";
        const TOOLBAR_ID = "lc-omni-email-helper-toolbar";
        const CONTEXT_KEY = "lcOmniEmailHelperQuoteContext";
        const SIGNATURE_IMAGE_KEY = "lcOmniEmailHelperSignatureImageV1";
        const SIGNATURE_MODE_KEY = "lcOmniEmailHelperSignatureModeV1";
        const SIGNATURE_WIDTH_KEY = "lcOmniEmailHelperSignatureWidthV1";
        let composePlaceholder = null;
        let contactsPlaceholder = null;
        let composePanel = null;
        let contactsPanel = null;
        let injectQueued = false;
        const isOmniEmailPage = location.hostname === "go.cin7.com"
          && /\/Cloud\/CRM\/ContactLog\.aspx$/i.test(location.pathname);

        // This runs at document-start, before Omni paints its native composer. Keep the
        // page transparent until the helper layout has taken ownership of the composer.
        // Opacity is used instead of visibility so Omni's controls can still be measured.
        if (isOmniEmailPage) {
          const earlyStyle = document.createElement("style");
          earlyStyle.id = "lc-omni-email-helper-early-style";
          earlyStyle.textContent = `
            html.lc-omni-email-helper-starting {
              background: #fff !important;
            }
            html.lc-omni-email-helper-starting body {
              opacity: 0 !important;
              pointer-events: none !important;
            }
          `;
          document.documentElement.classList.add("lc-omni-email-helper-starting");
          document.documentElement.appendChild(earlyStyle);
          setTimeout(() => document.documentElement.classList.remove("lc-omni-email-helper-starting"), 15000);
        }

        function revealEmailHelperPage() {
          document.documentElement.classList.remove("lc-omni-email-helper-starting");
        }

        if (location.hostname === "go.cin7.com") {
          ["preconnect", "dns-prefetch"].forEach((relation) => {
            const link = document.createElement("link");
            link.rel = relation;
            link.href = EMAIL_HELPER_URL;
            link.crossOrigin = "anonymous";
            (document.head || document.documentElement).appendChild(link);
          });

          if (isOmniEmailPage) {
            const warmHelper = () => {
              if (!document.body) return false;
              const panel = ensurePanel();
              const frame = panel.querySelector("iframe");
              if (!frame.getAttribute("src")) frame.src = `${EMAIL_HELPER_URL}?theme=omni&embedded=1`;
              return true;
            };
            if (!warmHelper()) {
              const earlyObserver = new MutationObserver(() => {
                if (!warmHelper()) return;
                earlyObserver.disconnect();
              });
              earlyObserver.observe(document.documentElement, { childList: true, subtree: true });
            }
          }
        }

        function applyEmbeddedHelperTheme() {
          const params = new URLSearchParams(location.search);
          if (params.get("theme") !== "omni" || params.get("embedded") !== "1") return;
          installReviewStoreSelector();
          let omniRecipientEmail = params.get("recipient") || "";
          const style = document.createElement("style");
          style.textContent = `
            :root {
              --green: #0b3978 !important;
              --green-dark: #072d62 !important;
              --ink: #172b49 !important;
              --muted: #526987 !important;
              --line: #c2d2e6 !important;
              --paper: #fff !important;
              --amber: #0b3978 !important;
              --blue: #0b3978 !important;
              --background: #eef4fb !important;
            }
            body {
              background: #fff !important;
            }
            main {
              width: calc(100% - 24px) !important;
              padding: 12px 0 20px !important;
            }
            header {
              display: none !important;
            }
            header h1 {
              display: none !important;
            }
            header .actions {
              width: 100% !important;
              justify-content: flex-end !important;
            }
            button.secondary,
            .templates button {
              border-color: #c2d2e6 !important;
              background: #e6eef8 !important;
              color: #0b3978 !important;
            }
            button.ghost {
              border-color: #8da9cc !important;
              background: #fff !important;
              color: #0b3978 !important;
            }
            label {
              color: #294467 !important;
            }
            input, select, textarea {
              border-color: #a9bfdc !important;
            }
            .signature-box {
              display: none !important;
            }
            #lc-signature-image-tools {
              margin-top: 9px;
              padding-top: 9px;
              border-top: 1px solid #c2d2e6;
            }
            #lc-signature-image-tools .lc-signature-image-label {
              display: block;
              margin-bottom: 6px;
              font-weight: 700;
              color: #294467;
            }
            #lc-signature-mode-choice {
              display: flex;
              gap: 14px;
              margin-bottom: 9px;
            }
            #lc-signature-mode-choice label {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              font-weight: 700;
            }
            #lc-signature-image-tools:not(.is-image-mode) .lc-signature-image-fields { display: none; }
            #lc-signature-image-tools input[type="file"] {
              display: block;
              width: 100%;
              padding: 6px;
              background: #fff;
            }
            .lc-signature-size-row {
              display: grid;
              grid-template-columns: minmax(0, 1fr) 76px;
              gap: 8px;
              align-items: center;
              margin-top: 8px;
            }
            .lc-signature-size-row input[type="range"] { width: 100%; }
            .lc-signature-size-row input[type="number"] { width: 76px; }
            #lc-signature-image-preview {
              display: none;
              max-width: 100%;
              height: auto;
              margin-top: 8px;
              object-fit: contain;
              object-position: left center;
            }
            #lc-signature-image-tools.has-image #lc-signature-image-preview { display: block; }
            #lc-signature-image-remove {
              display: none;
              margin-top: 7px;
            }
            #lc-signature-image-tools.has-image #lc-signature-image-remove { display: inline-flex; }
            .panel {
              box-shadow: 0 12px 32px rgba(15, 46, 106, .09) !important;
            }
          `;
          document.head.appendChild(style);

          const storedSignatureImage = () => {
            try { return localStorage.getItem(SIGNATURE_IMAGE_KEY) || ""; }
            catch (_) { return ""; }
          };

          const signatureMode = () => {
            try { return localStorage.getItem(SIGNATURE_MODE_KEY) === "image" ? "image" : "text"; }
            catch (_) { return "text"; }
          };

          const signatureWidth = () => {
            try {
              const value = Number(localStorage.getItem(SIGNATURE_WIDTH_KEY) || 420);
              return Math.min(1000, Math.max(80, Number.isFinite(value) ? value : 420));
            } catch (_) {
              return 420;
            }
          };

          const setNativeTextSignature = (enabled) => {
            const checkbox = document.querySelector("#signature") || Array.from(document.querySelectorAll("input[type='checkbox']")).find((input) => {
              const label = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
              return /^signature$/i.test(clean(label?.textContent || input.parentElement?.textContent));
            });
            if (!checkbox || checkbox.checked === enabled) return;
            checkbox.checked = enabled;
            checkbox.dispatchEvent(new Event("input", { bubbles: true }));
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          };

          const injectSignatureImageUpload = () => {
            if (document.getElementById("lc-signature-image-tools")) return;
            const signatureBox = document.querySelector(".signature-box");
            if (!signatureBox) return;
            const tools = document.createElement("div");
            tools.id = "lc-signature-image-tools";
            tools.innerHTML = `
              <div id="lc-signature-mode-choice">
                <label><input type="radio" name="lc-signature-mode" value="text"> Text signature</label>
                <label><input type="radio" name="lc-signature-mode" value="image"> Image signature</label>
              </div>
              <div class="lc-signature-image-fields">
                <label class="lc-signature-image-label" for="lc-signature-image-input">Signature image</label>
                <input id="lc-signature-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                <label class="lc-signature-image-label" for="lc-signature-image-size">Signature width</label>
                <div class="lc-signature-size-row">
                  <input id="lc-signature-image-size" type="range" min="80" max="1000" step="10">
                  <input id="lc-signature-image-size-number" type="number" min="80" max="1000" step="10" aria-label="Signature width in pixels">
                </div>
                <img id="lc-signature-image-preview" alt="Signature image preview">
                <button id="lc-signature-image-remove" type="button" class="ghost">Remove image</button>
              </div>`;
            signatureBox.appendChild(tools);
            const input = tools.querySelector("#lc-signature-image-input");
            const preview = tools.querySelector("#lc-signature-image-preview");
            const sizeSlider = tools.querySelector("#lc-signature-image-size");
            const sizeNumber = tools.querySelector("#lc-signature-image-size-number");
            const applyWidth = (value) => {
              const width = Math.min(1000, Math.max(80, Number(value) || 420));
              sizeSlider.value = String(width);
              sizeNumber.value = String(width);
              preview.style.width = `${width}px`;
              preview.style.maxWidth = "100%";
              try { localStorage.setItem(SIGNATURE_WIDTH_KEY, String(width)); } catch (_) {}
            };
            const show = (source) => {
              preview.src = source || "";
              tools.classList.toggle("has-image", Boolean(source));
            };
            const applyMode = (mode) => {
              const nextMode = mode === "image" ? "image" : "text";
              tools.classList.toggle("is-image-mode", nextMode === "image");
              tools.querySelector(`input[name="lc-signature-mode"][value="${nextMode}"]`).checked = true;
              try { localStorage.setItem(SIGNATURE_MODE_KEY, nextMode); } catch (_) {}
              setNativeTextSignature(nextMode === "text");
            };
            show(storedSignatureImage());
            applyWidth(signatureWidth());
            applyMode(signatureMode());
            sizeSlider.addEventListener("input", () => applyWidth(sizeSlider.value));
            sizeNumber.addEventListener("input", () => applyWidth(sizeNumber.value));
            tools.querySelectorAll('input[name="lc-signature-mode"]').forEach((radio) => {
              radio.addEventListener("change", () => {
                if (radio.checked) applyMode(radio.value);
              });
            });
            input.addEventListener("change", () => {
              const file = input.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                alert("Please choose a signature image smaller than 10 MB.");
                input.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const source = String(reader.result || "");
                try { localStorage.setItem(SIGNATURE_IMAGE_KEY, source); } catch (_) {}
                show(source);
              };
              reader.readAsDataURL(file);
            });
            tools.querySelector("#lc-signature-image-remove").addEventListener("click", () => {
              try { localStorage.removeItem(SIGNATURE_IMAGE_KEY); } catch (_) {}
              input.value = "";
              show("");
            });
          };

          const hideImageUrlOverride = () => {
            const label = Array.from(document.querySelectorAll("label"))
              .find((element) => /^image url override$/i.test(clean(element.textContent)));
            if (!label) return;
            const linkedField = (label.htmlFor && document.getElementById(label.htmlFor))
              || label.querySelector("input, textarea")
              || label.nextElementSibling?.matches?.("input, textarea") && label.nextElementSibling;
            label.style.display = "none";
            if (linkedField) linkedField.style.display = "none";
          };

          const hideLookupButton = () => {
            Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit']"))
              .filter((control) => /^lookup$/i.test(clean(control.textContent || control.value)))
              .forEach((control) => { control.style.display = "none"; });
          };

          const maintainSignatureTools = () => {
            setNativeTextSignature(false);
            const signatureCheckbox = document.querySelector("#signature") || Array.from(document.querySelectorAll("input[type='checkbox']")).find((input) => {
              const label = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
              return /^signature$/i.test(clean(label?.textContent || input.parentElement?.textContent));
            });
            const signatureLabel = signatureCheckbox?.id && document.querySelector(`label[for="${CSS.escape(signatureCheckbox.id)}"]`);
            const signatureRow = signatureCheckbox?.closest("label, .field, .form-row, .control, div");
            if (signatureLabel) signatureLabel.style.display = "none";
            if (signatureRow) signatureRow.style.display = "none";
            hideImageUrlOverride();
            hideLookupButton();
          };
          maintainSignatureTools();
          new MutationObserver(maintainSignatureTools).observe(document.body, { childList: true, subtree: true });

          const addCin7NumberToSubject = () => {
            const subject = document.querySelector("#subject-output");
            const order = clean(document.querySelector("#order")?.value).toUpperCase();
            if (!subject || !order) return;
            const next = order;
            if (subject.value === next) return;
            subject.value = next;
            subject.dispatchEvent(new Event("input", { bubbles: true }));
            subject.dispatchEvent(new Event("change", { bubbles: true }));
          };

          const queueSubjectUpdate = () => [0, 80, 250, 700].forEach((delay) => {
            setTimeout(addCin7NumberToSubject, delay);
          });
          document.addEventListener("input", (event) => {
            if (event.target?.matches?.("#order, #product")) queueSubjectUpdate();
          });
          document.addEventListener("change", (event) => {
            if (event.target?.matches?.("#order, #product")) queueSubjectUpdate();
          });
          document.addEventListener("click", (event) => {
            if (event.target?.closest?.("button")) queueSubjectUpdate();
          });

          document.addEventListener("click", (event) => {
            const button = event.target.closest?.("#copy-cin7");
            if (!button) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            addCin7NumberToSubject();
            const subject = document.querySelector("#subject-output")?.value || "";
            const { text, html } = emailDraftContent();
            window.parent.postMessage({
              type: "LC_EMAIL_HELPER_DRAFT",
              subject,
              text,
              html,
              order: document.querySelector("#order")?.value || ""
            }, "https://go.cin7.com");
            const label = button.textContent;
            button.textContent = "Sent to Omni";
            setTimeout(() => { button.textContent = label; }, 1200);
          }, true);

          document.addEventListener("click", (event) => {
            const button = event.target.closest?.("#open-gmail")
              || Array.from(document.querySelectorAll("button, a")).find((control) => /^open gmail$/i.test(clean(control.textContent)) && control.contains(event.target));
            if (!button || !omniRecipientEmail) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const subject = document.querySelector("#subject-output")?.value || "";
            const body = emailDraftContent().text;
            const gmailAccount = clean(document.querySelector("#gmail-account")?.value || "").toLowerCase();
            const gmailUrl = new URL("https://mail.google.com/mail/");
            if (gmailAccount) gmailUrl.searchParams.set("authuser", gmailAccount);
            gmailUrl.searchParams.set("view", "cm");
            gmailUrl.searchParams.set("fs", "1");
            gmailUrl.searchParams.set("to", omniRecipientEmail);
            if (subject) gmailUrl.searchParams.set("su", subject);
            if (body) gmailUrl.searchParams.set("body", body);
            window.open(gmailUrl.toString(), "_blank", "noopener");
          }, true);

          window.addEventListener("message", (event) => {
            if (event.origin !== "https://go.cin7.com" || event.data?.type !== "LC_OMNI_EMAIL_CONTEXT") return;
            const context = event.data.context || {};
            omniRecipientEmail = context.recipientEmail || omniRecipientEmail;
            const values = {
              order: context.quoteNumber,
              "first-name": context.firstName,
              product: context.product
            };
            Object.entries(values).forEach(([id, value]) => {
              const field = document.getElementById(id);
              if (!field || !value) return;
              field.value = value;
              field.dispatchEvent(new Event("input", { bubbles: true }));
              field.dispatchEvent(new Event("change", { bubbles: true }));
            });
            queueSubjectUpdate();
          });

          window.addEventListener("message", (event) => {
            if (event.origin !== "https://go.cin7.com" || event.data?.type !== "LC_OMNI_EMAIL_ACTION") return;
            const selector = {
              copy: "#copy-body",
              cin7: "#copy-cin7",
              gmail: "#open-gmail"
            }[event.data.action];
            document.querySelector(selector)?.click();
          });

          const applyUrlContext = () => {
            const values = {
              order: params.get("quote") || "",
              "first-name": params.get("first") || "",
              product: params.get("product") || ""
            };
            Object.entries(values).forEach(([id, value]) => {
              const field = document.getElementById(id);
              if (!field || !value || field.value === value) return;
              field.value = value;
              field.dispatchEvent(new Event("input", { bubbles: true }));
              field.dispatchEvent(new Event("change", { bubbles: true }));
            });
            queueSubjectUpdate();
          };
          [0, 400, 1100, 2400].forEach((delay) => setTimeout(applyUrlContext, delay));
        }

        if (location.hostname === "mail.google.com") {
          installGmailReviewLinks();
          return;
        }

        if (location.hostname === "living-culture-email-helper.vercel.app") {
          applyEmbeddedHelperTheme();
          return;
        }

        function clean(value) {
          return String(value || "").replace(/\s+/g, " ").trim();
        }

        function emailDraftContent() {
          const body = document.querySelector("#body-output, #body");
          const value = body?.value || "";
          const label = body?.dataset.reviewLabel, url = body?.dataset.reviewUrl;
          const html = escapeHtml(value).replace(/\n/g, "<br>");
          if (!label || !url) return { text:value, html };
          return {
            text:value.split(label).join(`${label}: ${url}`),
            html:html.split(escapeHtml(label)).join(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`),
          };
        }

        function googleReviewStores() {
          return [
            { id:"wairau", label:"North Shore / Wairau", token:"CeNsNDL_2O3dEBM", place:"ChIJ2wj0ZX45DW0R42w0Mv_Y7d0" },
            { id:"penrose", label:"Penrose", token:"Cbt0916wRtjmEBM", place:"ChIJqftY2JRJDW0Ru3T3XrBG2OY" },
            { id:"hamilton", label:"Hamilton", token:"CdrvKXEiLhd-EBM", place:"ChIJASuiMCgZbW0R2u8pcSIuF34" },
            { id:"tauranga", label:"Tauranga", token:"CfU2pxc8CpPbEBM", place:"ChIJIQsLHb7bbW0R9TanFzwKk9s" },
            { id:"christchurch", label:"Christchurch", token:"CX7Uu_940ID8EBM", place:"ChIJe3H9gkKLMW0RftS7_3jQgPw" },
            { id:"whangarei", label:"Whangarei", token:"CVJ2wVqQrM_TEBM", place:"ChIJuytBw31_C20RUnbBWpCsz9M" },
            { id:"napier", label:"Napier", token:"CfOE4ZpQEwj2EBM", place:"ChIJxTipStOzaW0R84ThmlATCPY" },
          ].map(store => ({ ...store, url:`https://g.page/r/${store.token}/review`, reviewLabel:`${store.label} Google Review` }));
        }

        function installGmailReviewLinks() {
          if (document.documentElement.dataset.lcGmailReviewLinks) return;
          document.documentElement.dataset.lcGmailReviewLinks = "1";
          const stores = googleReviewStores();
          const match = text => stores.find(store => clean(text) === `${store.reviewLabel}: ${store.url}`);
          const excluded = node => node.parentElement?.closest('.gmail_quote,.gmail_signature,blockquote,[contenteditable="false"]');
          const anchor = store => {
            const link = document.createElement("a");
            link.href = store.url;
            link.textContent = store.reviewLabel;
            return link;
          };
          const format = () => {
            for (const body of document.querySelectorAll('div[contenteditable="true"][role="textbox"],div[contenteditable="true"][aria-label="Message Body"],div[contenteditable="true"][g_editable="true"]')) {
              if (!visible(body) || excluded(body)) continue;
              let changed = false;
              // Replace only an exact review line, never the complete compose body or its signature.
              for (const block of [body, ...body.querySelectorAll("div,p")]) {
                if (excluded(block) || block.closest('.gmail_quote,.gmail_signature,blockquote,[contenteditable="false"]') || block.querySelector("div,p,blockquote")) continue;
                const store = match(block.textContent);
                if (!store) continue;
                block.replaceChildren(anchor(store));
                changed = true;
              }
              const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
              const nodes = [];
              while (walker.nextNode()) nodes.push(walker.currentNode);
              for (const node of nodes) {
                if (!node.isConnected || excluded(node) || node.parentElement.closest("a")) continue;
                const lines = node.textContent.split(/(\r?\n)/);
                if (!lines.some(line => match(line))) continue;
                const fragment = document.createDocumentFragment();
                for (const line of lines) {
                  const store = match(line);
                  if (store) {
                    fragment.append(document.createTextNode(line.match(/^\s*/)[0]), anchor(store), document.createTextNode(line.match(/\s*$/)[0]));
                  } else fragment.appendChild(document.createTextNode(line));
                }
                node.replaceWith(fragment);
                changed = true;
              }
              // Gmail can auto-link the URL while leaving the label in the preceding text node.
              for (const link of body.querySelectorAll("a[href]")) {
                if (excluded(link)) continue;
                const store = stores.find(store => link.getAttribute("href") === store.url && clean(link.textContent) === store.url);
                const before = link.previousSibling, after = link.nextSibling;
                if (!store || before?.nodeType !== Node.TEXT_NODE || (after && after.nodeName !== "BR" && !/^\r?\n/.test(after.textContent))) continue;
                const start = before.textContent.lastIndexOf("\n") + 1;
                if (clean(before.textContent.slice(start)) !== `${store.reviewLabel}:`) continue;
                const range = document.createRange();
                range.setStart(before, start); range.setEndAfter(link);
                range.deleteContents(); range.insertNode(anchor(store));
                changed = true;
              }
              if (changed) body.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertReplacementText" }));
            }
          };
          let timer = 0;
          const schedule = () => {
            if (timer) return;
            timer = setTimeout(() => { timer = 0; format(); }, 150);
          };
          new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true, characterData:true });
          document.addEventListener("input", schedule, true);
          schedule();
        }

        function installReviewStoreSelector() {
          const stores = googleReviewStores();
          const placeholder = "[Select a store for the Google review link]";
          const links = stores.flatMap(store => [store.url + "/", store.url, `https://search.google.com/local/writereview?placeid=${store.place}`]);
          const start = () => {
            if (document.getElementById("lc-review-store")) return;
            const templates = document.getElementById("template-buttons");
            const body = document.getElementById("body-output");
            if (!templates || !body) return;
            const label = document.createElement("label");
            label.htmlFor = "lc-review-store";
            label.textContent = "Google review store";
            label.hidden = true;
            label.style.display = "none";
            label.style.marginTop = "12px";
            const select = document.createElement("select");
            select.id = "lc-review-store";
            select.add(new Option("Choose store", ""));
            for (const store of stores) select.add(new Option(store.label, store.id));
            label.appendChild(select);
            templates.after(label);
            const update = () => {
              const active = clean(templates.querySelector("button.active")?.textContent);
              const review = /^(?:review request|request review|purchase thank-you)$/i.test(active)
                || body.value.includes(placeholder) || links.some(link => body.value.includes(link))
                || stores.some(store => body.value.includes(store.reviewLabel));
              label.hidden = !review;
              label.style.display = review ? "grid" : "none";
              select.required = review;
              delete body.dataset.reviewLabel;
              delete body.dataset.reviewUrl;
              if (!review) return false;
              const selected = stores.find(store => store.id === select.value);
              const next = selected?.reviewLabel || placeholder;
              let text = body.value;
              // Replace only known review links; preserve customer wording and other links.
              for (const link of links) text = text.split(link).join(placeholder);
              for (const store of stores) text = text.split(store.reviewLabel).join(placeholder);
              body.value = text.split(placeholder).join(next);
              if (selected) {
                body.dataset.reviewLabel = selected.reviewLabel;
                body.dataset.reviewUrl = selected.url;
              }
              return true;
            };
            select.addEventListener("change", () => { select.setCustomValidity(""); update(); });
            document.addEventListener("input", () => queueMicrotask(update));
            document.addEventListener("change", () => queueMicrotask(update));
            window.addEventListener("click", event => {
              const button = event.target.closest?.("button");
              if (!button || !["copy-body", "copy-cin7", "open-gmail", "save-template"].includes(button.id)) return;
              if (!update()) return;
              if (!select.value) {
                event.preventDefault(); event.stopImmediatePropagation();
                select.setCustomValidity("Choose the store for this Google review request.");
                select.reportValidity();
                return;
              }
              if (button.id !== "copy-body") return;
              event.preventDefault(); event.stopImmediatePropagation();
              // The helper's original HTML template hard-codes Penrose, so copy the visible draft instead.
              const { text, html } = emailDraftContent();
              const copy = navigator.clipboard?.write && typeof ClipboardItem !== "undefined"
                ? navigator.clipboard.write([new ClipboardItem({ "text/plain":new Blob([text], { type:"text/plain" }), "text/html":new Blob([html], { type:"text/html" }) })])
                : navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error("Clipboard unavailable"));
              copy.then(() => {
                const original = button.textContent; button.textContent = "Copied";
                setTimeout(() => { button.textContent = original; }, 1200);
              }).catch(() => window.alert("The email could not be copied. Select and copy the draft text, or use Copy to Cin7."));
            }, true);
            window.addEventListener("click", () => queueMicrotask(update));
            new MutationObserver(update).observe(templates, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
            update();
          };
          if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true });
          else start();
        }

        function escapeHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }

        function visible(element) {
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        }

        function fieldNearLabel(labelText) {
          const wanted = clean(labelText).toLowerCase();
          const labels = Array.from(document.querySelectorAll("label, td, th, div, span"))
            .filter(visible)
            .filter((element) => clean(element.textContent).replace(/:$/, "").toLowerCase() === wanted);
          const fields = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea, select")).filter(visible);
          let emptyFallback = null;
          for (const label of labels) {
            const linked = label.htmlFor && document.getElementById(label.htmlFor);
            if (linked) {
              if (clean(linked.value)) return linked;
              emptyFallback ||= linked;
              continue;
            }
            const rect = label.getBoundingClientRect();
            const candidates = fields
              .map((field) => ({ field, rect: field.getBoundingClientRect() }))
              .filter((item) => item.rect.top >= rect.top - 8 && item.rect.top <= rect.bottom + 32 && item.rect.left >= rect.right - 15)
              .sort((a, b) => a.rect.left - b.rect.left);
            const populated = candidates.find(({ field }) => clean(field.value))?.field;
            if (populated) return populated;
            emptyFallback ||= candidates[0]?.field || null;
          }
          return emptyFallback;
        }

        function customerFirstNameFromQuote() {
          const direct = clean(fieldNearLabel("First Name")?.value);
          if (direct) return direct.split(/\s+/)[0];

          const selected = clean(fieldNearLabel("Selected Customer")?.value)
            .replace(/^[-–—\s]+/, "")
            .replace(/\s+[-–—]\s+/g, " ");
          return selected.split(/\s+/).find(Boolean) || "";
        }

        function productNamesFromQuote() {
          const header = value => clean(value).toLowerCase().replace(/[^a-z]/g, "");
          const productHeader = Array.from(document.querySelectorAll("th, td"))
            .filter(visible)
            .find((cell) => header(cell.textContent) === "product");
          const row = productHeader?.closest("tr");
          const table = row?.closest("table");
          if (!row || !table) return [];
          const index = Array.from(row.children).indexOf(productHeader);
          const bomIndex = Array.from(row.children).findIndex(cell => header(cell.textContent) === "bomload");
          const read = cell => clean(cell?.querySelector("input:not([type='hidden']), textarea, select")?.value || cell?.textContent);
          const rows = Array.from(table.querySelectorAll("tr")).filter(item => item.closest("table") === table);
          // Customer emails describe sold products, not the components consumed by a Make line.
          return rows.slice(rows.indexOf(row) + 1)
            .filter(item => visible(item) && (bomIndex < 0 || read(item.children[bomIndex]).toLowerCase() !== "use"))
            .map((item) => {
              const cell = item.children[index];
              return read(cell);
            })
            .filter((value) => value && !/^search/i.test(value))
            .filter((value, index, values) => values.indexOf(value) === index);
        }

        function captureQuoteContext() {
          const pageText = clean(document.body?.innerText);
          const quoteNumber = pageText.match(/\b(?:SFOR|NZSO)[- ]?\d+[A-Z]?(?:-\d+)?\b(?![-A-Z0-9])/i)?.[0]?.replace(/\s+/g, "") || "";
          const firstName = customerFirstNameFromQuote();
          const products = productNamesFromQuote();
          if (!firstName && !quoteNumber && !products.length) return;
          localStorage.setItem(CONTEXT_KEY, JSON.stringify({
            firstName,
            quoteNumber,
            product: products.join(", "),
            savedAt: Date.now()
          }));
        }

        function bootQuoteCapture() {
          let timer = 0;
          const schedule = () => {
            clearTimeout(timer);
            timer = setTimeout(captureQuoteContext, 180);
          };
          captureQuoteContext();
          new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
          document.addEventListener("input", schedule, true);
          document.addEventListener("change", schedule, true);
        }

        function injectStyles() {
          if (document.getElementById(STYLE_ID)) return;
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = `
            #${PANEL_ID} {
              position: relative !important;
              z-index: 1 !important;
              display: flex !important;
              flex-direction: column !important;
              width: 100% !important;
              min-width: 0 !important;
              height: calc(100vh - 105px) !important;
              min-height: 720px !important;
              border: 0 !important;
              border-radius: 0 !important;
              overflow: hidden !important;
              background: #fff !important;
              box-shadow: none !important;
            }
            #${PANEL_ID}[hidden] {
              display: none !important;
            }
            #${PANEL_ID} iframe {
              flex: 1 1 auto !important;
              display: block !important;
              width: 100% !important;
              min-height: 0 !important;
              border: 0 !important;
              background: #fff !important;
            }
            #${LAYOUT_ID} {
              display: grid !important;
              grid-template-columns: minmax(570px, .9fr) 330px minmax(940px, 1.5fr) !important;
              align-items: start !important;
              gap: 24px !important;
              width: calc(100vw - 76px) !important;
              max-width: 2200px !important;
              margin: 12px auto 24px !important;
            }
            #${LAYOUT_ID} > .lc-omni-compose-column,
            #${LAYOUT_ID} > .lc-omni-contacts-column {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
            }
            #${LAYOUT_ID} > .lc-omni-contacts-column {
              min-width: 330px !important;
              overflow: visible !important;
            }
            #${TOOLBAR_ID} {
              display: inline-flex !important;
              float: right !important;
              align-items: center !important;
              gap: 9px !important;
              margin: 0 42px 0 auto !important;
              vertical-align: middle !important;
            }
            #${TOOLBAR_ID} button {
              min-height: 38px !important;
              border: 1px solid #8da9cc !important;
              border-radius: 6px !important;
              background: #fff !important;
              color: #0b3978 !important;
              padding: 0 15px !important;
              font: 700 14px Arial, sans-serif !important;
              cursor: pointer !important;
            }
            #${TOOLBAR_ID} button:first-child {
              border-color: #0b3978 !important;
              background: #0b3978 !important;
              color: #fff !important;
            }
            @media (max-width: 1750px) {
              #${LAYOUT_ID} {
                grid-template-columns: 570px 330px minmax(940px, 1fr) !important;
                overflow-x: auto !important;
              }
            }
          `;
          document.head.appendChild(style);
        }

        function pageControls() {
          return Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit'], a"))
            .filter(visible);
        }

        function findBackControl() {
          return pageControls().find((element) => /^back$/i.test(clean(element.textContent || element.value)));
        }

        function ensureOmniToolbar() {
          if (document.getElementById(TOOLBAR_ID)) return;
          const back = findBackControl();
          if (!back) return;
          const toolbar = document.createElement("div");
          toolbar.id = TOOLBAR_ID;
          toolbar.innerHTML = `
            <button type="button" data-action="copy">Copy Email</button>
            <button type="button" data-action="cin7">Copy to Cin7</button>
            <button type="button" data-action="gmail">Open Gmail</button>`;
          back.insertAdjacentElement("afterend", toolbar);
          toolbar.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-action]");
            if (!button) return;
            const frame = document.querySelector(`#${PANEL_ID} iframe`);
            frame?.contentWindow?.postMessage({
              type: "LC_OMNI_EMAIL_ACTION",
              action: button.dataset.action
            }, EMAIL_HELPER_URL);
          });
        }

        function findSubjectField() {
          const inputs = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea")).filter(visible);
          const direct = inputs.find((field) => /subject/i.test(`${field.id} ${field.name} ${field.placeholder || ""}`));
          if (direct) return direct;

          const label = Array.from(document.querySelectorAll("label, td, th, div, span"))
            .filter(visible)
            .find((element) => /^subject:?$/i.test(clean(element.textContent)));
          if (!label) return null;
          const labelRect = label.getBoundingClientRect();
          return inputs
            .map((field) => ({ field, rect: field.getBoundingClientRect() }))
            .filter(({ rect }) => rect.top >= labelRect.top - 8 && rect.top <= labelRect.bottom + 30 && rect.left >= labelRect.right - 20)
            .sort((a, b) => a.rect.left - b.rect.left)[0]?.field || null;
        }

        function extractOrderNumber() {
          const subject = clean(findSubjectField()?.value);
          const pageText = clean(document.body?.innerText);
          for (const text of [subject, pageText]) {
            const match = text.match(/\b[A-Z]{2,8}[- ]?\d+(?:-\d+)?\b/i);
            if (match) return match[0].replace(/\s+/g, "").toUpperCase();
          }
          return new URL(location.href).searchParams.get("idOrder") || "";
        }

        function helperUrl() {
          const url = new URL(EMAIL_HELPER_URL);
          const order = extractOrderNumber();
          if (order) url.searchParams.set("order", order);
          const context = emailPageContext();
          if (context.quoteNumber) url.searchParams.set("quote", context.quoteNumber);
          if (context.firstName) url.searchParams.set("first", context.firstName);
          if (context.product) url.searchParams.set("product", context.product);
          if (context.recipientEmail) url.searchParams.set("recipient", context.recipientEmail);
          url.searchParams.set("theme", "omni");
          url.searchParams.set("embedded", "1");
          return url.toString();
        }

        function emailPageContext() {
          let saved = {};
          try {
            saved = JSON.parse(localStorage.getItem(CONTEXT_KEY) || "{}");
          } catch {
            saved = {};
          }
          const directTo = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea"))
            .find((field) => /(^|[_$-])to([_$-]|$)/i.test(`${field.id} ${field.name}`) && clean(field.value));
          const addressField = directTo || Array.from(document.querySelectorAll("input:not([type='hidden']), textarea"))
            .find((field) => /<[^>]+@[^>]+>/.test(clean(field.value)));
          const to = clean(addressField?.value || fieldNearLabel("To")?.value);
          const recipientEmail = to.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
          const subject = clean(findSubjectField()?.value);
          const displayName = clean(to.replace(/<[^>]+>/g, "").replace(/[,;]+$/, ""));
          const contactListName = (() => {
            const heading = Array.from(document.querySelectorAll("div, span, td, th, strong"))
              .filter(visible)
              .find((element) => /^contact list$/i.test(clean(element.textContent)));
            if (!heading) return "";
            const panel = ancestorCandidates(heading)
              .filter(({ rect }) => rect.width >= 180 && rect.width <= 650 && rect.height >= 70)
              .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0]?.node;
            return String(panel?.innerText || "")
              .split(/\n+/)
              .map(clean)
              .find((line) => line && !/^contact list$/i.test(line) && !/@/.test(line) && !/^(to|cc|bcc)$/i.test(line)) || "";
          })();
          const greetingName = editorCandidates()
            .map(({ element }) => clean(element.innerText || element.textContent))
            .map((text) => text.match(/\bHi\s+([^,\n]{1,50}),/i)?.[1] || "")
            .find(Boolean) || "";
          const subjectQuote = subject.match(/\b(?:SFOR|NZSO)[- ]?\d+[A-Z]?(?:-\d+)?\b(?![-A-Z0-9])/i)?.[0]?.replace(/\s+/g, "") || "";
          const sameQuote = !saved.quoteNumber || !subjectQuote
            || saved.quoteNumber.replace(/\D/g, "") === subjectQuote.replace(/\D/g, "");
          return {
            firstName: (sameQuote && saved.firstName)
              || displayName.split(/\s+/)[0]
              || greetingName.split(/\s+/)[0]
              || contactListName.split(/\s+/)[0]
              || "",
            quoteNumber: subjectQuote || saved.quoteNumber || "",
            product: sameQuote ? saved.product || "" : "",
            recipientEmail
          };
        }

        function sendContextToHelper(frame) {
          frame?.contentWindow?.postMessage({
            type: "LC_OMNI_EMAIL_CONTEXT",
            context: emailPageContext()
          }, EMAIL_HELPER_URL);
        }

        function ensurePanel() {
          let panel = document.getElementById(PANEL_ID);
          if (panel) return panel;

          panel = document.createElement("section");
          panel.id = PANEL_ID;
          panel.hidden = true;
          panel.setAttribute("aria-label", "Living Culture Email Helper");
          panel.innerHTML = '<iframe title="Living Culture Email Helper" allow="clipboard-write"></iframe>';
          document.body.appendChild(panel);
          return panel;
        }

        function ancestorCandidates(element) {
          const candidates = [];
          for (let node = element; node && node !== document.body; node = node.parentElement) {
            const rect = node.getBoundingClientRect();
            if (visible(node) && rect.width > 160 && rect.height > 60) candidates.push({ node, rect });
          }
          return candidates;
        }

        function findComposePanel() {
          const subject = findSubjectField();
          if (!subject) return null;
          return ancestorCandidates(subject)
            .filter(({ node, rect }) => rect.width >= 420 && rect.width <= 1100 && rect.height >= 380)
            .filter(({ node }) => /\bfrom\b/i.test(node.innerText || "") && /\battachment\b/i.test(node.innerText || ""))
            .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0]?.node || null;
        }

        function findContactsPanel() {
          const heading = Array.from(document.querySelectorAll("div, span, td, th, strong"))
            .filter(visible)
            .find((element) => /^contact list$/i.test(clean(element.textContent)));
          if (!heading) return null;
          return ancestorCandidates(heading)
            .filter(({ rect }) => rect.width >= 180 && rect.width <= 650 && rect.height >= 70)
            .filter(({ node }) => Array.from(node.querySelectorAll("button, input, a")).some((control) => /^(to|cc|bcc)$/i.test(clean(control.textContent || control.value))))
            .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0]?.node || null;
        }

        function buildThreeColumnLayout(panel) {
          if (document.getElementById(LAYOUT_ID)) {
            revealEmailHelperPage();
            return true;
          }
          composePanel = findComposePanel();
          contactsPanel = findContactsPanel();
          if (!composePanel || !contactsPanel || composePanel.contains(contactsPanel) || contactsPanel.contains(composePanel)) return false;

          composePlaceholder = document.createComment("LC Omni compose panel position");
          contactsPlaceholder = document.createComment("LC Omni contacts panel position");
          composePanel.before(composePlaceholder);
          contactsPanel.before(contactsPlaceholder);

          const layout = document.createElement("section");
          layout.id = LAYOUT_ID;
          composePlaceholder.parentNode.insertBefore(layout, composePlaceholder.nextSibling);
          composePanel.classList.add("lc-omni-compose-column");
          contactsPanel.classList.add("lc-omni-contacts-column");
          layout.append(composePanel, contactsPanel, panel);
          revealEmailHelperPage();
          return true;
        }

        function closeEmailHelper() {
          const panel = document.getElementById(PANEL_ID);
          if (composePlaceholder?.parentNode && composePanel) {
            composePlaceholder.parentNode.insertBefore(composePanel, composePlaceholder);
            composePanel.classList.remove("lc-omni-compose-column");
            composePlaceholder.remove();
          }
          if (contactsPlaceholder?.parentNode && contactsPanel) {
            contactsPlaceholder.parentNode.insertBefore(contactsPanel, contactsPlaceholder);
            contactsPanel.classList.remove("lc-omni-contacts-column");
            contactsPlaceholder.remove();
          }
          document.getElementById(LAYOUT_ID)?.remove();
          document.body.appendChild(panel);
          panel.hidden = true;
          composePlaceholder = null;
          contactsPlaceholder = null;
          composePanel = null;
          contactsPanel = null;
        }

        function openEmailHelper() {
          const panel = ensurePanel();
          const frame = panel.querySelector("iframe");
          const url = helperUrl();
          if (!frame.getAttribute("src")) frame.src = url;
          frame.addEventListener("load", () => sendContextToHelper(frame), { once: true });
          panel.hidden = false;
          buildThreeColumnLayout(panel);
          [500, 1400, 2800].forEach((delay) => setTimeout(() => sendContextToHelper(frame), delay));
        }

        function injectButton() {
          injectStyles();
          document.getElementById(BUTTON_ID)?.remove();
          ensureOmniToolbar();
          openEmailHelper();
        }

        function editorCandidates() {
          const candidates = Array.from(document.querySelectorAll(
            ".note-editable, .fr-element, .tox-edit-area [contenteditable='true'], [contenteditable='true']"
          )).filter(visible);

          for (const frame of Array.from(document.querySelectorAll("iframe")).filter(visible)) {
            try {
              const body = frame.contentDocument?.body;
              if (body) candidates.push(body);
            } catch {
              // Ignore cross-origin frames; Omni's editor frame is normally same-origin.
            }
          }

          return candidates
            .map((element) => ({ element, rect: element.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 300 && rect.height > 80)
            .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
        }

        function setEditorHtml(html) {
          const editor = editorCandidates()[0]?.element;
          if (!editor) return false;

          const content = `${html}<p><br></p>`;
          editor.focus();
          editor.innerHTML = content;

          const editorWindow = editor.ownerDocument?.defaultView || window;
          const InputEventCtor = editorWindow.InputEvent || InputEvent;
          const EventCtor = editorWindow.Event || Event;
          editor.dispatchEvent(new InputEventCtor("input", { bubbles: true, inputType: "insertHTML", data: html }));
          editor.dispatchEvent(new EventCtor("change", { bubbles: true }));
          editor.dispatchEvent(new EventCtor("blur", { bubbles: true }));

          try {
            if (window.tinymce?.activeEditor) {
              window.tinymce.activeEditor.setContent(content);
              window.tinymce.activeEditor.fire("input");
              window.tinymce.activeEditor.fire("change");
            }
            if (window.CKEDITOR?.instances) {
              Object.values(window.CKEDITOR.instances).find((instance) => instance?.setData)?.setData(content);
            }
          } catch {
            // Direct editor insertion remains the primary path.
          }
          return true;
        }

        function setOmniSubject(value) {
          const subject = findSubjectField();
          const next = clean(value);
          if (!subject || !next) return false;
          const prototype = subject instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
          if (setter) setter.call(subject, next);
          else subject.value = next;
          subject.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
          subject.dispatchEvent(new Event("change", { bubbles: true }));
          subject.dispatchEvent(new Event("blur", { bubbles: true }));
          return true;
        }

        window.addEventListener("message", (event) => {
          if (event.origin !== EMAIL_HELPER_URL) return;
          const payload = event.data || {};
          if (payload.type !== "LC_EMAIL_HELPER_DRAFT") return;

          const html = String(payload.html || "").trim()
            || escapeHtml(payload.text || "").replace(/\n/g, "<br>");
          setOmniSubject(payload.subject);
          if (!setEditorHtml(html)) {
            alert("The Omni email editor could not be found. Keep this email page open and try Copy to Cin7 again.");
            return;
          }

          event.source?.postMessage({ type: "LC_EMAIL_HELPER_DRAFT_INSERTED" }, EMAIL_HELPER_URL);
          window.focus();
        });

        function scheduleInject() {
          if (injectQueued) return;
          injectQueued = true;
          setTimeout(() => {
            injectQueued = false;
            injectButton();
          }, 100);
        }

        function boot() {
          injectButton();
          const observer = new MutationObserver(scheduleInject);
          observer.observe(document.body, { childList: true, subtree: true });
        }

        if (/\/Cloud\/TransactionEntry\/TransactionEntry\.aspx$/i.test(location.pathname)) {
          if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootQuoteCapture, { once: true });
          else bootQuoteCapture();
          return;
        }

        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
        else boot();
      })();
    },
    gmailDrawings: function () {
      (function () {
        "use strict";

        const ROOT_FOLDER_ID = "1Tcxn7LceZztaoWUmgsNZgml18s2LZORj";
        const FOLDER_MIME = "application/vnd.google-apps.folder";
        const BUTTON_ID = "lc-gmail-drawings-button";
        const TOOLBAR_ID = "lc-gmail-attachment-toolbar";
        const ATTACH_HINT_ID = "lc-gmail-add-quote-hint";
        const PANEL_ID = "lc-gmail-drawings-panel";
        const STYLE_ID = "lc-gmail-drawings-styles";
        const state = { levels: [], selected: null, loaded: false, loading: false, preparing: false, busy: false, status: "", error: false, open: false };
        const downloadCache = new Map();
        let syncTimer = 0;
        let attachmentToolbar = null;

        function clean(value) {
          return String(value || "").replace(/\s+/g, " ").trim();
        }

        function escapeHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }

        function request(url, responseType = "text") {
          return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: "GET",
              url,
              responseType,
              onload(response) {
                if (response.status < 200 || response.status >= 300) {
                  reject(new Error(`Google Drive returned HTTP ${response.status}.`));
                  return;
                }
                resolve(response);
              },
              onerror() {
                reject(new Error("Could not reach the Living Culture Drawings folder."));
              }
            });
          });
        }

        function decodeDriveString(value) {
          return value
            .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/\\\//g, "/")
            .replace(/\\=/g, "=")
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");
        }

        async function readFolder(folderId) {
          const response = await request(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?usp=sharing`);
          const match = String(response.responseText || "").match(/window\['_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'])*)'/s);
          if (!match) throw new Error("The Drawings folder could not be read. Check its sharing permissions.");
          const payload = JSON.parse(decodeDriveString(match[1]));
          const items = Array.isArray(payload?.[0]) ? payload[0] : [];
          return {
            folders: items.filter((item) => item?.[3] === FOLDER_MIME)
              .map((item) => ({ id: item[0], name: clean(item[2]) }))
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
            files: items.filter((item) => item?.[3] === "application/pdf" || /\.pdf$/i.test(item?.[2] || ""))
              .map((item) => ({
                id: item[0],
                name: clean(item[2]),
                downloadUrl: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(item[0])}&export=download&confirm=t`
              }))
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          };
        }

        function activeComposeBody() {
          return Array.from(document.querySelectorAll('div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][contenteditable="true"], div[g_editable="true"][contenteditable="true"]'))
            .reverse().find((body) => {
              const rect = body.getBoundingClientRect();
              const style = getComputedStyle(body);
              return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            });
        }

        function activeComposeRoot() {
          const body = activeComposeBody();
          return body?.closest('div[role="dialog"], div[role="listitem"]') || body;
        }

        function visible(element) {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        }

        function removeAttachmentHint() {
          document.getElementById(ATTACH_HINT_ID)?.remove();
        }

        function syncAttachmentHint() {
          const selector = '[command="+Att"], [data-tooltip*="Attach files" i], [aria-label*="Attach files" i]';
          const control = Array.from(document.querySelectorAll(selector)).filter(visible).at(-1);
          if (!control?.parentElement) {
            removeAttachmentHint();
            return;
          }
          let hint = document.getElementById(ATTACH_HINT_ID);
          if (!hint) {
            hint = document.createElement("span");
            hint.id = ATTACH_HINT_ID;
            hint.textContent = "Add Quote →";
            hint.setAttribute("aria-hidden", "true");
            hint.style.cssText = "display:inline-flex;align-items:center;height:28px;margin:0 5px;padding:0 10px;border-radius:14px;background:#f4511e;color:#fff;font:700 12px Arial,sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 3px 9px rgba(20,31,38,.20);box-sizing:border-box;vertical-align:middle";
          }
          if (hint.parentElement !== control.parentElement || hint.nextSibling !== control) control.before(hint);
          const toolbar = ensureToolbar();
          if (toolbar.parentElement !== hint.parentElement || toolbar.nextSibling !== hint) hint.before(toolbar);
          toolbar.style.position = "static";
          toolbar.style.display = "inline-flex";
          toolbar.style.visibility = "visible";
          toolbar.style.verticalAlign = "middle";
          toolbar.style.flexWrap = "nowrap";
          return true;
        }

        function ensureToolbar() {
          let toolbar = document.getElementById(TOOLBAR_ID) || attachmentToolbar;
          if (!toolbar) {
            toolbar = document.createElement("div");
            toolbar.id = TOOLBAR_ID;
            toolbar.setAttribute("role", "toolbar");
            toolbar.setAttribute("aria-label", "Living Culture email attachments");
            toolbar.style.position = "fixed";
            toolbar.style.display = "none";
            toolbar.style.visibility = "hidden";
            document.body.appendChild(toolbar);
          }
          attachmentToolbar = toolbar;
          if (!toolbar.isConnected) document.body.appendChild(toolbar);
          [BUTTON_ID, "lc-gmail-care-guides-button"].forEach((id) => {
            const item = document.getElementById(id);
            if (item) toolbar.appendChild(item);
          });
          return toolbar;
        }

        function assistantPromptTop(composeRoot) {
          const labelled = Array.from(composeRoot.querySelectorAll("[aria-label], [placeholder]"))
            .find((element) => /describe your change/i.test(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("placeholder") || ""}`));
          const textNode = labelled || Array.from(composeRoot.querySelectorAll("div, span"))
            .find((element) => !element.children.length && clean(element.textContent) === "Describe your change");
          return visible(textNode) ? textNode.getBoundingClientRect().top : null;
        }

        function currentFiles() {
          return state.levels.at(-1)?.files || [];
        }

        function levelLabel(index, folders = []) {
          if (index === 0) return "Pergola";
          if (index === 1) return "Type";
          if (folders.length && folders.every((folder) => /\b(manual|motorised|motorized)\b/i.test(folder.name))) return "Operation";
          if (folders.length && folders.every((folder) => /\d+(?:\.\d+)?\s*[x×]\s*\d/i.test(folder.name))) return "Size";
          return index === 2 ? "Type" : "Folder";
        }

        async function loadLevel(folderId, replaceFrom = 0) {
          if (state.loading) return;
          state.loading = true;
          state.status = "Loading folder…";
          state.error = false;
          render();
          try {
            const contents = await readFolder(folderId);
            state.levels.splice(replaceFrom, state.levels.length, { folderId, ...contents, selectedFolderId: "" });
            state.selected = null;
            state.loaded = true;
            state.status = "Choose a size to prepare its drawing.";
          } catch (error) {
            state.status = error.message;
            state.error = true;
          } finally {
            state.loading = false;
            render();
          }
        }

        async function chooseFolder(index, folderId) {
          const level = state.levels[index];
          if (!level) return;
          level.selectedFolderId = folderId;
          state.levels.splice(index + 1);
          state.selected = null;
          if (folderId) await loadLevel(folderId, index + 1);
          else render();
        }

        function downloadDrawing(file) {
          if (!downloadCache.has(file.id)) {
            const promise = request(file.downloadUrl, "arraybuffer").then((response) => new File(
              [response.response], file.name || "Living Culture drawing.pdf", { type: "application/pdf", lastModified: Date.now() }
            )).catch((error) => {
              downloadCache.delete(file.id);
              throw error;
            });
            downloadCache.set(file.id, promise);
          }
          return downloadCache.get(file.id);
        }

        async function prepare(file) {
          state.preparing = true;
          state.status = "Preparing selected drawing…";
          state.error = false;
          render();
          try {
            await downloadDrawing(file);
            state.status = "Selected drawing is ready to attach.";
          } catch (error) {
            state.status = error.message;
            state.error = true;
          } finally {
            state.preparing = false;
            render();
          }
        }

        async function attachSelected() {
          const file = currentFiles().find((item) => item.id === state.selected);
          if (!file) return;
          const composeRoot = activeComposeRoot();
          if (!composeRoot) {
            alert("Open a Gmail compose or reply box first.");
            return;
          }
          state.busy = true;
          state.status = "Attaching drawing to Gmail…";
          state.error = false;
          render();
          try {
            const downloaded = await downloadDrawing(file);
            const localInputs = Array.from(composeRoot.querySelectorAll('input[type="file"]'));
            const inputs = localInputs.length ? localInputs : Array.from(document.querySelectorAll('input[type="file"]'));
            const input = inputs.reverse().find((candidate) => !candidate.disabled);
            if (!input) throw new Error("Could not find Gmail's attachment input. Click the paperclip once, then try again.");
            const transfer = new DataTransfer();
            transfer.items.add(downloaded);
            input.files = transfer.files;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            state.status = "Drawing attached to Gmail.";
            state.selected = null;
            setTimeout(closePanel, 800);
          } catch (error) {
            state.status = error.message;
            state.error = true;
          } finally {
            state.busy = false;
            render();
          }
        }

        function element(tag, className = "", text = "") {
          const node = document.createElement(tag);
          if (className) node.className = className;
          if (text) node.textContent = text;
          return node;
        }

        function dropdown({ label, placeholder, options, value, level, file = false, panel }) {
          const selected = options.find((option) => option.id === value);
          const field = element("div", "lc-gd-field");
          field.appendChild(element("span", "", label));
          const select = element("div", "lc-gd-select");
          if (file) select.dataset.file = "";
          else select.dataset.level = String(level);
          const trigger = element("button", "lc-gd-trigger");
          trigger.type = "button";
          trigger.append(element("span", "", selected?.name || placeholder), element("i"));
          trigger.addEventListener("click", () => {
            const opening = !select.classList.contains("open");
            panel.querySelectorAll(".lc-gd-select.open").forEach((other) => other.classList.remove("open"));
            select.classList.toggle("open", opening);
          });
          const menu = element("div", "lc-gd-menu");
          [{ id: "", name: placeholder }, ...options].forEach((option) => {
            const choice = element("button", value === option.id ? "selected" : "", option.name);
            choice.type = "button";
            choice.dataset.value = option.id;
            choice.addEventListener("click", () => {
              if (file) {
                state.selected = option.id || null;
                render();
                const selectedFile = currentFiles().find((item) => item.id === option.id);
                if (selectedFile) prepare(selectedFile);
              } else {
                chooseFolder(level, option.id);
              }
            });
            menu.appendChild(choice);
          });
          select.append(trigger, menu);
          field.appendChild(select);
          return field;
        }

        function ensurePanel() {
          let panel = document.getElementById(PANEL_ID);
          if (!panel) {
            panel = document.createElement("div");
            panel.id = PANEL_ID;
            document.body.appendChild(panel);
          }
          return panel;
        }

        function render() {
          const panel = ensurePanel();
          panel.replaceChildren();

          const head = element("div", "lc-gd-head");
          const close = element("button", "", "×");
          close.type = "button";
          close.setAttribute("aria-label", "Close");
          close.addEventListener("click", closePanel);
          head.append(element("strong", "", "Living Culture Drawings"), close);

          const content = element("div", "lc-gd-content");
          if (state.loading && !state.loaded) {
            const loading = element("div", "lc-gd-loading");
            loading.append(element("i"), document.createTextNode("Loading drawings…"));
            content.appendChild(loading);
          } else {
            state.levels.forEach((level, index) => {
              if (!level.folders.length) return;
              const label = levelLabel(index, level.folders);
              content.appendChild(dropdown({ label, placeholder: `Select ${label.toLowerCase()}…`, options: level.folders, value: level.selectedFolderId, level: index, panel }));
            });
            const files = currentFiles();
            if (files.length) content.appendChild(dropdown({
              label: "Size", placeholder: "Select size…", panel, file: true,
              options: files.map((file) => ({ ...file, name: file.name.replace(/\.pdf$/i, "") })), value: state.selected
            }));
          }

          const footer = element("div", "lc-gd-footer");
          const status = element("div", `lc-gd-status${state.error ? " error" : ""}`);
          if (state.loading || state.preparing || state.busy) status.appendChild(element("i"));
          status.appendChild(element("span", "", state.status));
          const attach = element("button", "", state.busy ? "Attaching…" : "Attach to Gmail");
          attach.type = "button";
          attach.disabled = state.busy || !state.selected;
          attach.addEventListener("click", attachSelected);
          footer.append(status, attach);
          panel.append(head, content, footer);
        }

        function openPanel() {
          state.open = true;
          const panel = ensurePanel();
          panel.style.setProperty("display", "block", "important");
          render();
          if (!state.loaded) loadLevel(ROOT_FOLDER_ID, 0);
        }

        function closePanel() {
          state.open = false;
          const panel = document.getElementById(PANEL_ID);
          if (panel) panel.style.setProperty("display", "none", "important");
        }

        function injectStyles() {
          if (document.getElementById(STYLE_ID)) return;
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = `
            #${TOOLBAR_ID}{position:fixed;z-index:2147483646;display:none;visibility:hidden;align-items:center;gap:8px;max-width:calc(100vw - 16px);transition:none!important}
            #${TOOLBAR_ID}>button{position:static!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;white-space:nowrap!important}
            #${BUTTON_ID}{height:28px;border:1px solid #0d6f78;border-radius:15px;background:#fff;color:#0d6f78;padding:0 11px;font:700 12px Arial,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(20,31,38,.18)}
            #${PANEL_ID}{display:none;position:fixed!important;z-index:2147483647!important;top:50%!important;left:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-50%)!important;width:430px!important;height:auto!important;min-height:170px!important;max-width:calc(100vw - 30px)!important;overflow:visible!important;opacity:1!important;visibility:visible!important;border:1px solid #abc9c6!important;border-radius:9px!important;background:#fff!important;box-shadow:0 18px 45px rgba(20,45,48,.28)!important;color:#18343a!important;font:13px Arial,sans-serif!important}
            #${PANEL_ID} .lc-gd-head{display:flex!important;min-height:24px!important;align-items:center!important;justify-content:space-between!important;padding:12px 14px!important;border-bottom:1px solid #dce9e7!important;background:#0d6f78!important;color:#fff!important;border-radius:8px 8px 0 0!important;font-size:15px!important}
            #${PANEL_ID} .lc-gd-head button{border:0!important;background:transparent!important;color:#fff!important;font:700 22px Arial!important;cursor:pointer!important}
            #${PANEL_ID} .lc-gd-content{display:grid!important;gap:10px!important;padding:14px!important;min-height:70px!important;background:#fff!important;overflow:visible!important}
            .lc-gd-field{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;align-items:center;font-weight:700}
            .lc-gd-select{position:relative;min-width:0}.lc-gd-trigger{width:100%;min-height:39px;display:grid;grid-template-columns:minmax(0,1fr) 14px;align-items:center;gap:8px;border:1px solid #8ab7b3;border-radius:6px;background:#fff;color:#18343a;padding:0 11px;font:600 13px Arial;text-align:left;cursor:pointer}
            .lc-gd-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lc-gd-trigger i{width:8px;height:8px;border-right:2px solid #0d6f78;border-bottom:2px solid #0d6f78;transform:rotate(45deg) translateY(-2px)}
            .lc-gd-select.open .lc-gd-trigger{border-color:#0d6f78;box-shadow:0 0 0 2px rgba(13,111,120,.14)}.lc-gd-select.open .lc-gd-trigger i{transform:rotate(225deg) translate(-1px,-1px)}
            .lc-gd-menu{display:none;position:absolute;z-index:2;top:calc(100% + 4px);left:0;right:0;max-height:270px;overflow:auto;padding:4px;border:1px solid #8ab7b3;border-radius:6px;background:#fff;box-shadow:0 10px 26px rgba(20,45,48,.22)}.lc-gd-select.open .lc-gd-menu{display:grid}
            .lc-gd-menu button{min-height:34px;border:0;border-radius:4px;background:#fff;color:#18343a;padding:7px 9px;font:600 12px Arial;text-align:left;cursor:pointer}.lc-gd-menu button:hover{background:#e5f1ef;color:#0d6f78}.lc-gd-menu button.selected{background:#0d6f78;color:#fff}
            #${PANEL_ID} .lc-gd-footer{display:flex!important;min-height:38px!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:11px 14px!important;border-top:1px solid #dce9e7!important;background:#fff!important;border-radius:0 0 8px 8px!important}.lc-gd-status{display:flex;align-items:center;gap:7px;color:#506b6c}.lc-gd-status.error{color:#b42318}
            #${PANEL_ID} .lc-gd-footer>button{min-height:34px!important;border:0!important;border-radius:5px!important;background:#0d6f78!important;color:#fff!important;padding:0 13px!important;font:700 12px Arial!important;cursor:pointer!important}#${PANEL_ID} .lc-gd-footer>button:disabled{opacity:.5!important;cursor:not-allowed!important}
            .lc-gd-loading{display:flex;align-items:center;justify-content:center;gap:8px;min-height:70px;color:#0d6f78;font-weight:700}.lc-gd-loading i,.lc-gd-status i{width:14px;height:14px;border:2px solid #c8dfdc;border-top-color:#0d6f78;border-radius:50%;animation:lc-gd-spin .75s linear infinite}@keyframes lc-gd-spin{to{transform:rotate(360deg)}}
          `;
          document.head.appendChild(style);
        }

        function syncButton() {
          const toolbar = ensureToolbar();
          const button = document.getElementById(BUTTON_ID);
          if (!button) return;
          if (syncAttachmentHint()) return;
          if (toolbar.parentElement !== document.body) document.body.appendChild(toolbar);
          toolbar.style.position = "fixed";
          const compose = activeComposeRoot();
          if (!compose) {
            toolbar.style.display = "flex";
            toolbar.style.visibility = "visible";
            toolbar.style.left = `${Math.max(8, window.innerWidth - toolbar.offsetWidth - 24)}px`;
            toolbar.style.top = `${Math.max(8, window.innerHeight - toolbar.offsetHeight - 24)}px`;
            delete toolbar.dataset.lcLayoutKey;
            delete toolbar.dataset.lcReadyAt;
            removeAttachmentHint();
            return;
          }
          const rect = compose.getBoundingClientRect();
          toolbar.style.display = "flex";
          const width = toolbar.offsetWidth || 310;
          const height = toolbar.offsetHeight || 28;
          const promptTop = assistantPromptTop(compose);
          const top = promptTop === null ? rect.bottom - height - 56 : promptTop - height - 12;
          toolbar.style.left = `${Math.max(8, Math.min(rect.right - width - 10, window.innerWidth - width - 8))}px`;
          toolbar.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
          toolbar.style.visibility = "visible";
          syncAttachmentHint();
        }

        function boot() {
          injectStyles();
          if (!document.getElementById(BUTTON_ID)) {
            const button = document.createElement("button");
            button.id = BUTTON_ID;
            button.type = "button";
            button.textContent = "Drawings";
            button.addEventListener("pointerdown", (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (state.open) closePanel();
              else openPanel();
            }, true);
            ensureToolbar().appendChild(button);
            if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand("Open Drawings", openPanel);
          }
          syncButton();
          if (!syncTimer) syncTimer = setInterval(syncButton, 500);
          document.addEventListener("pointerdown", (event) => {
            if (!state.open) return;
            const path = event.composedPath?.() || [];
            if (!path.includes(document.getElementById(PANEL_ID)) && !path.includes(document.getElementById(BUTTON_ID))) closePanel();
          }, true);
        }

        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
        else boot();
      })();
    },
    gmailCareGuides: function () {
      (function () {
        "use strict";

        const API_BASE = "https://cin7-pdf-attachments.vercel.app";
        const EMBEDDED_TOOL_TOKEN = "fXlAMocbHnglrq02Vg4WZY0xbHaPsA+b";
        const BUTTON_ID = "lc-gmail-care-guides-button";
        const PANEL_ID = "lc-gmail-care-guides-panel";
        const TOOLBAR_ID = "lc-gmail-attachment-toolbar";
        const ATTACH_HINT_ID = "lc-gmail-add-quote-hint";

        const state = {
          files: [],
          selected: new Set(),
          loaded: false,
          busy: false,
          open: false,
        };
        let lastToggleAt = 0;
        let menuRegistered = false;
        let syncTimer = null;
        let attachmentToolbar = null;

        function apiRequest(path) {
          return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: "GET",
              url: `${API_BASE}${path}`,
              headers: {
                Accept: "application/json",
                "x-lc-token": EMBEDDED_TOOL_TOKEN,
              },
              onload(response) {
                let body = null;
                try {
                  body = JSON.parse(response.responseText || "{}");
                } catch {
                  reject(new Error("Care Guides returned an invalid response."));
                  return;
                }
                if (response.status < 200 || response.status >= 300) {
                  reject(new Error(body.error || `Care Guides returned HTTP ${response.status}.`));
                  return;
                }
                resolve(body);
              },
              onerror() {
                reject(new Error("Could not reach Care Guides."));
              },
            });
          });
        }

        function downloadPdf(file) {
          return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: "GET",
              url: file.downloadUrl,
              responseType: "arraybuffer",
              onload(response) {
                if (response.status < 200 || response.status >= 300) {
                  reject(new Error(`${file.name} download returned HTTP ${response.status}.`));
                  return;
                }
                const blob = new Blob([response.response], { type: "application/pdf" });
                resolve(new File([blob], file.name, { type: "application/pdf" }));
              },
              onerror() {
                reject(new Error(`Could not download ${file.name}.`));
              },
            });
          });
        }

        function activeComposeBody() {
          const bodies = Array.from(
            document.querySelectorAll('div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][contenteditable="true"]'),
          );
          return bodies.reverse().find((body) => {
            const rect = body.getBoundingClientRect();
            const style = window.getComputedStyle(body);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
          });
        }

        function activeComposeRoot() {
          const body = activeComposeBody();
          return body?.closest('div[role="dialog"], div[role="listitem"]') || body;
        }

        function visible(element) {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        }

        function removeAttachmentHint() {
          document.getElementById(ATTACH_HINT_ID)?.remove();
        }

        function syncAttachmentHint() {
          const selector = '[command="+Att"], [data-tooltip*="Attach files" i], [aria-label*="Attach files" i]';
          const control = Array.from(document.querySelectorAll(selector)).filter(visible).at(-1);
          if (!control?.parentElement) {
            removeAttachmentHint();
            return;
          }
          let hint = document.getElementById(ATTACH_HINT_ID);
          if (!hint) {
            hint = document.createElement("span");
            hint.id = ATTACH_HINT_ID;
            hint.textContent = "Add Quote →";
            hint.setAttribute("aria-hidden", "true");
            hint.style.cssText = "display:inline-flex;align-items:center;height:28px;margin:0 5px;padding:0 10px;border-radius:14px;background:#f4511e;color:#fff;font:700 12px Arial,sans-serif;white-space:nowrap;pointer-events:none;box-shadow:0 3px 9px rgba(20,31,38,.20);box-sizing:border-box;vertical-align:middle";
          }
          if (hint.parentElement !== control.parentElement || hint.nextSibling !== control) control.before(hint);
          const toolbar = ensureToolbar();
          if (toolbar.parentElement !== hint.parentElement || toolbar.nextSibling !== hint) hint.before(toolbar);
          toolbar.style.position = "static";
          toolbar.style.display = "inline-flex";
          toolbar.style.visibility = "visible";
          toolbar.style.verticalAlign = "middle";
          toolbar.style.flexWrap = "nowrap";
          return true;
        }

        function ensureToolbar() {
          let toolbar = document.getElementById(TOOLBAR_ID) || attachmentToolbar;
          if (!toolbar) {
            toolbar = document.createElement("div");
            toolbar.id = TOOLBAR_ID;
            toolbar.setAttribute("role", "toolbar");
            toolbar.setAttribute("aria-label", "Living Culture email attachments");
            toolbar.style.position = "fixed";
            toolbar.style.display = "none";
            toolbar.style.visibility = "hidden";
            document.body.appendChild(toolbar);
          }
          attachmentToolbar = toolbar;
          if (!toolbar.isConnected) document.body.appendChild(toolbar);
          ["lc-gmail-drawings-button", BUTTON_ID].forEach((id) => {
            const item = document.getElementById(id);
            if (item) toolbar.appendChild(item);
          });
          return toolbar;
        }

        function assistantPromptTop(composeRoot) {
          const labelled = Array.from(composeRoot.querySelectorAll("[aria-label], [placeholder]"))
            .find((element) => /describe your change/i.test(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("placeholder") || ""}`));
          const textNode = labelled || Array.from(composeRoot.querySelectorAll("div, span"))
            .find((element) => !element.children.length && String(element.textContent || "").replace(/\s+/g, " ").trim() === "Describe your change");
          return visible(textNode) ? textNode.getBoundingClientRect().top : null;
        }

        function insertNodeIntoCompose(node) {
          const body = activeComposeBody();
          if (!body) {
            window.alert("Open a Gmail compose or reply box first.");
            return false;
          }
          body.focus();
          const selection = window.getSelection();
          if (selection && selection.rangeCount) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(node);
            range.setStartAfter(node);
            range.setEndAfter(node);
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            body.appendChild(node);
          }
          return true;
        }

        function setStatus(message) {
          const status = document.querySelector("#lc-gmail-care-guides-status");
          if (status) status.textContent = message;
        }

        function ensurePanel() {
          let panel = document.getElementById(PANEL_ID);
          if (!panel) {
            panel = document.createElement("div");
            panel.id = PANEL_ID;
            document.body.appendChild(panel);
          }
          return panel;
        }

        function positionPanel(panel) {
          document.body.appendChild(panel);
          panel.style.setProperty("left", "50%", "important");
          panel.style.setProperty("top", "50%", "important");
          panel.style.setProperty("right", "auto", "important");
          panel.style.setProperty("bottom", "auto", "important");
          panel.style.setProperty("transform", "translate(-50%, -50%)", "important");
          panel.style.setProperty("display", "block", "important");
          panel.style.setProperty("z-index", "2147483647", "important");
        }

        function createHeader() {
          const head = document.createElement("div");
          head.className = "lc-gmail-care-head";

          const title = document.createElement("strong");
          title.textContent = "Care Guides";
          head.appendChild(title);

          const close = document.createElement("button");
          close.type = "button";
          close.id = "lc-gmail-care-close";
          close.title = "Close";
          close.textContent = "x";
          close.addEventListener("click", closePanel);
          head.appendChild(close);

          return head;
        }

        function createEmpty(message) {
          const empty = document.createElement("div");
          empty.className = "lc-gmail-care-empty";
          empty.textContent = message;
          return empty;
        }

        function renderPanel() {
          const panel = ensurePanel();
          panel.replaceChildren();
          panel.appendChild(createHeader());

          const list = document.createElement("div");
          list.className = "lc-gmail-care-list";
          if (!state.loaded) {
            list.appendChild(createEmpty("Loading guides..."));
          } else if (!state.files.length) {
            list.appendChild(createEmpty("No care guides found."));
          } else {
            state.files.forEach((file) => {
              const row = document.createElement("label");
              row.className = "lc-gmail-care-row";

              const input = document.createElement("input");
              input.type = "checkbox";
              input.value = file.id;
              input.checked = state.selected.has(file.id);
              input.addEventListener("change", (event) => {
                if (event.target.checked) state.selected.add(event.target.value);
                else state.selected.delete(event.target.value);
                renderPanel();
              });
              row.appendChild(input);

              const name = document.createElement("span");
              name.title = file.name;
              name.textContent = file.name;
              row.appendChild(name);
              list.appendChild(row);
            });
          }
          panel.appendChild(list);

          const actions = document.createElement("div");
          actions.className = "lc-gmail-care-actions";

          const refresh = document.createElement("button");
          refresh.type = "button";
          refresh.id = "lc-gmail-care-refresh";
          refresh.textContent = "Refresh";
          refresh.addEventListener("click", loadFiles);
          actions.appendChild(refresh);

          const attach = document.createElement("button");
          attach.type = "button";
          attach.id = "lc-gmail-care-attach";
          attach.disabled = state.busy || !state.selected.size;
          attach.textContent = `Attach ${state.selected.size || ""}`.trim();
          attach.addEventListener("click", attachSelected);
          actions.appendChild(attach);

          panel.appendChild(actions);

          const status = document.createElement("div");
          status.id = "lc-gmail-care-guides-status";
          status.className = "lc-gmail-care-status";
          panel.appendChild(status);
        }

        async function loadFiles() {
          state.busy = true;
          renderPanel();
          setStatus("Loading guides...");
          try {
            const body = await apiRequest("/api/email-links");
            state.files = body.files || [];
            state.loaded = true;
            state.selected.clear();
            renderPanel();
            setStatus(`${state.files.length} guide${state.files.length === 1 ? "" : "s"} ready.`);
          } catch (error) {
            state.loaded = true;
            renderPanel();
            setStatus(error.message);
          } finally {
            state.busy = false;
            renderPanel();
          }
        }

        async function attachSelected() {
          const files = state.files.filter((file) => state.selected.has(file.id));
          if (!files.length) return;

          const composeRoot = activeComposeRoot();
          if (!composeRoot) {
            window.alert("Open a Gmail compose or reply box first.");
            return;
          }

          state.busy = true;
          renderPanel();
          setStatus(`Downloading ${files.length} guide${files.length === 1 ? "" : "s"}...`);
          let resultMessage = "";
          let shouldClose = false;

          try {
            const downloaded = [];
            for (const file of files) {
              setStatus(`Downloading ${file.name}...`);
              downloaded.push(await downloadPdf(file));
            }

            const inputs = Array.from(composeRoot.querySelectorAll('input[type="file"]'));
            const allInputs = inputs.length ? inputs : Array.from(document.querySelectorAll('input[type="file"]'));
            const fileInput = allInputs.reverse().find((input) => !input.disabled);
            if (!fileInput) {
              throw new Error("Could not find Gmail's attachment input. Click the Gmail paperclip once, then try Attach again.");
            }

            const dataTransfer = new DataTransfer();
            downloaded.forEach((file) => dataTransfer.items.add(file));
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event("input", { bubbles: true }));
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));

            resultMessage = `Attached ${downloaded.length} guide${downloaded.length === 1 ? "" : "s"}.`;
            state.selected.clear();
            shouldClose = true;
          } catch (error) {
            resultMessage = error.message || String(error);
          } finally {
            state.busy = false;
            renderPanel();
            if (resultMessage) setStatus(resultMessage);
            if (shouldClose) window.setTimeout(closePanel, 900);
          }
        }

        function insertSelected() {
          const files = state.files.filter((file) => state.selected.has(file.id));
          if (!files.length) return;

          const wrapper = document.createElement("div");
          wrapper.appendChild(document.createElement("br"));

          const label = document.createElement("div");
          const strong = document.createElement("strong");
          strong.textContent = "Care guides:";
          label.appendChild(strong);
          wrapper.appendChild(label);

          const list = document.createElement("ul");
          files.forEach((file) => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.href = file.downloadUrl;
            link.target = "_blank";
            link.textContent = file.name;
            item.appendChild(link);
            list.appendChild(item);
          });
          wrapper.appendChild(list);

          if (insertNodeIntoCompose(wrapper)) {
            state.selected.clear();
            closePanel();
          }
        }

        function openPanel() {
          state.open = true;
          const panel = ensurePanel();
          panel.replaceChildren(createHeader(), createEmpty("Opening guides..."));
          positionPanel(panel);
          window.requestAnimationFrame(() => {
            try {
              renderPanel();
              positionPanel(panel);
              if (!state.loaded) loadFiles();
            } catch (error) {
              panel.replaceChildren(createHeader(), createEmpty(`Could not open guides: ${error.message || error}`));
              positionPanel(panel);
            }
          });
        }

        function closePanel() {
          state.open = false;
          const panel = document.getElementById(PANEL_ID);
          if (panel) panel.style.display = "none";
        }

        function injectStyles() {
          if (document.getElementById("lc-gmail-care-styles")) return;
          const style = document.createElement("style");
          style.id = "lc-gmail-care-styles";
          style.textContent = `
            #${BUTTON_ID} {
              height: 28px;
              border: 1px solid #0d6f78;
              border-radius: 15px;
              background: #0d6f78;
              color: #fff;
              padding: 0 9px;
              font: 700 12px Arial, sans-serif;
              cursor: pointer;
              pointer-events: auto;
              user-select: none;
              box-shadow: 0 4px 12px rgba(20, 31, 38, .20);
            }
            #${TOOLBAR_ID} {
              position: fixed;
              z-index: 2147483646;
              display: none;
              visibility: hidden;
              align-items: center;
              gap: 8px;
              max-width: calc(100vw - 16px);
              transition: none !important;
            }
            #${TOOLBAR_ID} > button {
              position: static !important;
              display: inline-flex !important;
              align-items: center !important;
              justify-content: center !important;
              white-space: nowrap !important;
            }
            #${PANEL_ID} {
              display: none;
              position: fixed;
              z-index: 2147483647;
              width: 380px;
              max-width: calc(100vw - 32px);
              background: #fff;
              border: 1px solid #c9d5da;
              border-radius: 8px;
              box-shadow: 0 18px 42px rgba(20, 31, 38, .24);
              color: #17202a;
              font: 13px Arial, sans-serif;
              transform: translate(-50%, -50%);
              pointer-events: auto;
            }
            .lc-gmail-care-head,
            .lc-gmail-care-actions {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 10px;
              border-bottom: 1px solid #e5ecef;
            }
            .lc-gmail-care-head {
              justify-content: space-between;
            }
            .lc-gmail-care-head button {
              border: 0;
              background: transparent;
              cursor: pointer;
              font: 700 14px Arial, sans-serif;
            }
            .lc-gmail-care-list {
              max-height: 300px;
              overflow: auto;
            }
            .lc-gmail-care-row {
              display: grid;
              grid-template-columns: 22px minmax(0, 1fr);
              gap: 8px;
              align-items: center;
              padding: 8px 10px;
              border-bottom: 1px solid #eef3f5;
              cursor: pointer;
            }
            .lc-gmail-care-row span {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .lc-gmail-care-actions {
              justify-content: flex-end;
              border-top: 1px solid #e5ecef;
              border-bottom: 0;
            }
            .lc-gmail-care-actions button {
              min-height: 28px;
              border: 0;
              border-radius: 4px;
              background: #e8f0f2;
              color: #18343a;
              padding: 5px 9px;
              font: 700 12px Arial, sans-serif;
              cursor: pointer;
            }
            .lc-gmail-care-actions #lc-gmail-care-attach {
              background: #0d6f78;
              color: #fff;
            }
            .lc-gmail-care-actions button:disabled {
              cursor: not-allowed;
              opacity: .55;
            }
            .lc-gmail-care-empty,
            .lc-gmail-care-status {
              padding: 9px 10px;
              color: #50606b;
            }
          `;
          document.head.appendChild(style);
        }

        function injectButton() {
          injectStyles();
          if (document.getElementById(BUTTON_ID)) return;
          const button = document.createElement("button");
          button.id = BUTTON_ID;
          button.type = "button";
          button.textContent = "Care Guides";
          button.title = "Insert Living Culture care guide links";
          const toggle = (event) => {
            if (event) {
              event.preventDefault();
              event.stopPropagation();
              if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            }
            const now = Date.now();
            if (now - lastToggleAt < 250) return;
            lastToggleAt = now;
            button.textContent = state.open ? "Care Guides" : "Opening...";
            window.setTimeout(() => {
              button.textContent = "Care Guides";
            }, 400);
            try {
              if (state.open) closePanel();
              else openPanel();
            } catch (error) {
              button.textContent = "Care Guides";
              window.alert(`Care Guides could not open: ${error.message || error}`);
            }
          };
          button.addEventListener("pointerdown", toggle, true);
          button.addEventListener("mousedown", toggle, true);
          button.addEventListener("touchstart", toggle, true);
          button.addEventListener("click", toggle, true);
          button.onclick = toggle;
          ensureToolbar().appendChild(button);
          syncButtonToCompose();

          if (!menuRegistered && typeof GM_registerMenuCommand === "function") {
            GM_registerMenuCommand("Open Care Guides", () => toggle());
            menuRegistered = true;
          }
        }

        function syncButtonToCompose() {
          const toolbar = ensureToolbar();
          const button = document.getElementById(BUTTON_ID);
          if (!button) return;
          if (syncAttachmentHint()) return;
          if (toolbar.parentElement !== document.body) document.body.appendChild(toolbar);
          toolbar.style.position = "fixed";
          const composeRoot = activeComposeRoot();
          if (!composeRoot) {
            toolbar.style.display = "flex";
            toolbar.style.visibility = "visible";
            toolbar.style.left = `${Math.max(8, window.innerWidth - toolbar.offsetWidth - 24)}px`;
            toolbar.style.top = `${Math.max(8, window.innerHeight - toolbar.offsetHeight - 24)}px`;
            delete toolbar.dataset.lcLayoutKey;
            delete toolbar.dataset.lcReadyAt;
            removeAttachmentHint();
            return;
          }

          const rect = composeRoot.getBoundingClientRect();
          if (!rect.width || !rect.height) {
            toolbar.style.display = "none";
            return;
          }
          toolbar.style.display = "flex";
          const width = toolbar.offsetWidth || 310;
          const height = toolbar.offsetHeight || 28;
          const promptTop = assistantPromptTop(composeRoot);
          const top = promptTop === null ? rect.bottom - height - 56 : promptTop - height - 12;
          toolbar.style.left = `${Math.max(8, Math.min(rect.right - width - 10, window.innerWidth - width - 8))}px`;
          toolbar.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
          toolbar.style.visibility = "visible";
          syncAttachmentHint();
        }

        function boot() {
          if (!document.body) return;
          injectButton();
          if (!syncTimer) {
            syncTimer = window.setInterval(syncButtonToCompose, 500);
            window.addEventListener("resize", syncButtonToCompose);
            document.addEventListener("focusin", syncButtonToCompose);
            document.addEventListener("click", () => window.setTimeout(syncButtonToCompose, 50), true);
          }
        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", boot);
        } else {
          boot();
        }
      })();
    },
    gmailHubspotAttachments: function () {
      (function () {
        "use strict";

        const API_URL = "https://living-culture-workflow.vercel.app/api/hubspot/gmail-attachment";
        const TOOL_TOKEN = "fXlAMocbHnglrq02Vg4WZY0xbHaPsA+b";
        const QUOTE_RE = /\b(NZSO|SFOR)\s*[-#]?\s*(\d{4,}[A-Z]?(?:-[A-Z0-9]+)?)\b(?![-A-Z0-9])/gi;
        const composeStates = new WeakMap();
        let uploadQueue = Promise.resolve();

        function clean(value) {
          return String(value || "").replace(/\s+/g, " ").trim();
        }

        function visible(element) {
          if (!(element instanceof Element)) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }

        function composeRoot(input) {
          return input.closest('div[role="dialog"], div[role="listitem"]') || document.body;
        }

        function extractQuoteNumbers(value) {
          QUOTE_RE.lastIndex = 0;
          return Array.from(new Set(Array.from(clean(value).matchAll(QUOTE_RE))
            .map((match) => `${match[1].toUpperCase()}${match[1].toUpperCase() === 'NZSO' ? '-' : ''}${match[2].toUpperCase()}`)));
        }

        function subjectQuoteNumbers(root) {
          const subjects = Array.from(root.querySelectorAll('input[name="subjectbox"], input[placeholder="Subject"], input[aria-label="Subject"]'));
          const subject = subjects.find(visible)?.value || subjects.at(-1)?.value || "";
          return extractQuoteNumbers(subject);
        }

        function fileKey(file) {
          return `${file.name}|${file.size}|${file.lastModified}`;
        }

        function stateFor(root) {
          let state = composeStates.get(root);
          if (!state) {
            state = { files: new Map(), uploaded: new Map(), pending: new Map() };
            composeStates.set(root, state);
          }
          return state;
        }

        function showStatus(message, intent = "working") {
          let toast = document.getElementById("lc-gmail-hubspot-attachment-status");
          if (!toast) {
            toast = document.createElement("div");
            toast.id = "lc-gmail-hubspot-attachment-status";
            Object.assign(toast.style, {
              position: "fixed", right: "22px", bottom: "72px", zIndex: "2147483647",
              maxWidth: "390px", padding: "10px 14px", borderRadius: "7px", color: "#fff",
              font: "600 13px Arial, sans-serif", boxShadow: "0 5px 18px rgba(0,0,0,.22)"
            });
            document.body.appendChild(toast);
          }
          toast.textContent = message;
          toast.style.background = intent === "error" ? "#b42318" : intent === "done" ? "#087f8c" : "#ff5c35";
          clearTimeout(toast._hideTimer);
          toast._hideTimer = setTimeout(() => toast.remove(), intent === "working" ? 15000 : 5000);
        }

        function errorMessage(payload, fallback) {
          const error = payload?.error;
          if (typeof error === "string") return error;
          if (typeof error?.message === "string") return error.message;
          if (typeof error?.error === "string") return error.error;
          if (typeof payload?.message === "string") return payload.message;
          try {
            if (error && typeof error === "object") return JSON.stringify(error);
          } catch {}
          return fallback;
        }

        function delay(milliseconds) {
          return new Promise((resolve) => setTimeout(resolve, milliseconds));
        }

        function requestJson(options) {
          return new Promise((resolve, reject) => {
            const phase = options.phase || "attachment service";
            const requestOptions = { ...options };
            delete requestOptions.phase;
            GM_xmlhttpRequest({
              ...requestOptions,
              timeout: 180000,
              onload(response) {
                let payload = {};
                try { payload = JSON.parse(response.responseText || "{}"); } catch {}
                if (response.status >= 200 && response.status < 300) resolve(payload);
                else reject(new Error(errorMessage(payload, `Upload failed (${response.status}).`)));
              },
              ontimeout() { reject(new Error(`${phase} timed out.`)); },
              onerror(response) {
                const detail = clean(response?.statusText || "");
                reject(new Error(`Could not connect during ${phase}${detail ? `: ${detail}` : ""}.`));
              }
            });
          });
        }

        async function upload(state, key, file, quote, attempt = 0) {
          showStatus(`HubSpot: uploading ${file.name} to ${quote}…`);
          try {
            const prepared = await requestJson({
              phase: "upload preparation",
              method: "POST", url: API_URL,
              headers: { "Content-Type": "application/json", Accept: "application/json", "x-lc-token": TOOL_TOKEN },
              data: JSON.stringify({ action: "prepare", fileName: file.name, fileType: file.type, fileSize: file.size })
            });
            if (!prepared.ok || !prepared.signedUrl || !prepared.storagePath) throw new Error(errorMessage(prepared, "Could not prepare the upload."));

            const stagingForm = new FormData();
            stagingForm.append("cacheControl", "3600");
            stagingForm.append("", file, file.name);
            await requestJson({ phase: "temporary file upload", method: "PUT", url: prepared.signedUrl, data: stagingForm });

            const payload = await requestJson({
              phase: "HubSpot attachment completion",
              method: "POST", url: API_URL,
              headers: { "Content-Type": "application/json", Accept: "application/json", "x-lc-token": TOOL_TOKEN },
              data: JSON.stringify({
                action: "complete", storagePath: prepared.storagePath, fileName: file.name,
                fileType: file.type, quoteNumbers: [quote]
              })
            });
            if (!payload.ok) throw new Error(errorMessage(payload, "HubSpot did not accept the attachment."));
            if (!state.uploaded.has(key)) state.uploaded.set(key, new Set());
            state.uploaded.get(key).add(quote);
            state.pending.get(key)?.delete(quote);
            const count = Array.isArray(payload.deals) ? payload.deals.length : 0;
            showStatus(`HubSpot: ${file.name} added to ${count} deal${count === 1 ? "" : "s"}.`, "done");
          } catch (error) {
            if (attempt < 2) {
              await delay(4000 * (attempt + 1));
              return upload(state, key, file, quote, attempt + 1);
            }
            state.pending.get(key)?.delete(quote);
            showStatus(error instanceof Error ? error.message : "Could not attach the file to HubSpot.", "error");
          }
        }

        function capture(input) {
          const files = Array.from(input.files || []);
          if (!files.length) return;
          const root = composeRoot(input);
          const state = stateFor(root);
          files.forEach((file) => state.files.set(fileKey(file), file));

          const subjectQuotes = subjectQuoteNumbers(root);
          const attachedQuotes = Array.from(state.files.values()).flatMap((file) => extractQuoteNumbers(file.name));
          const allQuotes = Array.from(new Set([...subjectQuotes, ...attachedQuotes]));
          if (!allQuotes.length) return;

          state.files.forEach((file, key) => {
            const fileQuotes = extractQuoteNumbers(file.name);
            const targets = fileQuotes.length ? fileQuotes : allQuotes;
            if (!state.uploaded.has(key)) state.uploaded.set(key, new Set());
            if (!state.pending.has(key)) state.pending.set(key, new Set());
            targets.forEach((quote) => {
              if (state.uploaded.get(key).has(quote) || state.pending.get(key).has(quote)) return;
              state.pending.get(key).add(quote);
              uploadQueue = uploadQueue
                .catch(() => {})
                .then(() => upload(state, key, file, quote));
            });
          });
        }

        document.addEventListener("change", (event) => {
          const input = event.target;
          if (input instanceof HTMLInputElement && input.type === "file") capture(input);
        }, true);
      })();
    },
    gmailQuotePdfs: function () {
      (function () {
        "use strict";

        const HISTORY_KEY = "lcGmailOmniQuotePdfHistoryV1";
        const PDF_CACHE_KEY = "lcGmailOmniDownloadedQuotePdfsV1";
        const BUTTON_ID = "lc-gmail-omni-quotes-button";
        const PANEL_ID = "lc-gmail-omni-quotes-panel";
        const QUOTES_URL = "https://go.cin7.com/Cloud/ShoppingCartAdmin/Orders/OrdersList.aspx?idWebSite=27265&idCustomerAppsLink=1328006";
        let syncTimer = 0;
        let lastOpenAt = 0;

        function clean(value) {
          return String(value || "").replace(/\s+/g, " ").trim();
        }

        function escapeHtml(value) {
          return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function quoteNumber(value) {
          return clean(value).match(/\bSFOR\d+(?:-[A-Z0-9]+)?\b/i)?.[0]?.toUpperCase() || "";
        }

        function idsFromUrl(value) {
          try {
            const url = new URL(value, location.href);
            const preferred = ["sid", "transactionid", "saleid", "orderid", "id"];
            return preferred.flatMap((name) => Array.from(url.searchParams.entries())
              .filter(([key, item]) => key.toLowerCase() === name && /^\d{6,}$/.test(item))
              .map(([, item]) => item));
          } catch (_) {
            return [];
          }
        }

        function captureOmniQuote() {
          const number = quoteNumber(document.body?.innerText || document.title || "");
          if (!number) return;
          const links = Array.from(document.querySelectorAll("a[href]"))
            .filter((link) => /go to admin|quote/i.test(clean(link.textContent)))
            .map((link) => link.href);
          const hiddenIds = Array.from(document.querySelectorAll('input[type="hidden"]'))
            .filter((input) => /(?:^|_)(?:sid|transactionid|saleid|orderid|id)$/i.test(input.name || input.id || ""))
            .map((input) => clean(input.value))
            .filter((value) => /^\d{6,}$/.test(value));
          const sids = Array.from(new Set([...idsFromUrl(location.href), ...links.flatMap(idsFromUrl), ...hiddenIds]));
          if (!sids.length) return;
          const context = { quoteNumber: number, sids, savedAt: Date.now() };
          const history = GM_getValue(HISTORY_KEY, []);
          GM_setValue(HISTORY_KEY, [context, ...(Array.isArray(history) ? history : [])
            .filter((item) => quoteNumber(item?.quoteNumber) !== number)].slice(0, 30));
        }

        function history() {
          const stored = GM_getValue(HISTORY_KEY, []);
          return (Array.isArray(stored) ? stored : []).filter((item) =>
            quoteNumber(item?.quoteNumber) && Array.isArray(item?.sids) && item.sids.some((sid) => /^\d{6,}$/.test(clean(sid)))
          );
        }

        function quoteContextsFromDocument(root) {
          const contexts = [];
          root.querySelectorAll("a").forEach((link) => {
            const number = quoteNumber(link.textContent || "");
            if (!number) return;
            const row = link.closest("tr");
            const source = [link.getAttribute("href"), link.getAttribute("onclick"), row?.innerHTML].filter(Boolean).join(" ");
            const sids = Array.from(new Set([
              ...idsFromUrl(link.getAttribute("href") || ""),
              ...(source.match(/\b\d{6,}\b/g) || [])
            ]));
            if (!sids.length) return;
            const cells = Array.from(row?.querySelectorAll("td") || []).map((cell) => clean(cell.textContent));
            const customer = cells.find((value) => value && value !== number && !/^\$|^\d|^(open|draft|new|processing|onhold|accepted|declined)$/i.test(value)) || "";
            contexts.push({ quoteNumber: number, sids, customer, savedAt: Date.now() });
          });
          const seen = new Set();
          return contexts.filter((context) => !seen.has(context.quoteNumber) && seen.add(context.quoteNumber));
        }

        function saveQuoteContexts(contexts) {
          if (!contexts.length) return;
          const existing = history();
          const numbers = new Set(contexts.map((item) => item.quoteNumber));
          GM_setValue(HISTORY_KEY, [...contexts, ...existing.filter((item) => !numbers.has(quoteNumber(item.quoteNumber)))].slice(0, 100));
        }

        function loadOmniQuoteList() {
          return new Promise((resolve, reject) => GM_xmlhttpRequest({
            method: "GET", url: QUOTES_URL, timeout: 60000,
            onload(response) {
              if (response.status < 200 || response.status >= 300) {
                reject(new Error(`Omni quotes returned HTTP ${response.status}.`));
                return;
              }
              const documentCopy = new DOMParser().parseFromString(response.responseText || "", "text/html");
              const contexts = quoteContextsFromDocument(documentCopy);
              if (!contexts.length) {
                reject(new Error("Open the Omni Quotes page and reload it once."));
                return;
              }
              saveQuoteContexts(contexts);
              resolve(contexts);
            },
            onerror: () => reject(new Error("Could not connect to the Omni quote list.")),
            ontimeout: () => reject(new Error("The Omni quote list timed out."))
          }));
        }

        function activeComposeBody() {
          return Array.from(document.querySelectorAll('div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][contenteditable="true"], div[g_editable="true"][contenteditable="true"]'))
            .reverse().find((body) => {
              const rect = body.getBoundingClientRect();
              const style = getComputedStyle(body);
              return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            });
        }

        function activeComposeRoot() {
          const body = activeComposeBody();
          return body?.closest('div[role="dialog"], div[role="listitem"]') || body;
        }

        function gmailSubject(root) {
          return Array.from(root?.querySelectorAll('input[name="subjectbox"], input[placeholder="Subject"], input[aria-label="Subject"]') || [])
            .find((input) => input.offsetWidth && input.offsetHeight)?.value || "";
        }

        function isDownloadedOmniQuote(file) {
          return file?.type === "application/pdf"
            && /^SFOR\d+(?:-[A-Z0-9]+)?(?: \(\d+\))?\.pdf$/i.test(clean(file.name));
        }

        function bytesToBase64(buffer) {
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let start = 0; start < bytes.length; start += 32768) {
            binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
          }
          return btoa(binary);
        }

        function cachedQuotePdfs() {
          const stored = GM_getValue(PDF_CACHE_KEY, []);
          return (Array.isArray(stored) ? stored : []).filter((item) => quoteNumber(item?.quoteNumber) && item?.base64);
        }

        function cachedQuoteFile(item) {
          const binary = atob(item.base64);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          return new File([bytes], `${quoteNumber(item.quoteNumber)}.pdf`, { type: "application/pdf", lastModified: item.savedAt || Date.now() });
        }

        function currentOmniPdfContext() {
          const params = new URL(location.href).searchParams;
          const orderEntry = Array.from(params.entries()).find(([key, value]) => /^(?:orderid|idorder|id)$/i.test(key) && /^\d+$/.test(value));
          const number = quoteNumber(document.body?.innerText || document.title || "");
          const source = document.documentElement?.innerHTML || "";
          const sids = Array.from(new Set(Array.from(source.matchAll(/(?:SID|TransactionID|SaleID)\D{0,50}(\d{6,})/gi), (match) => match[1])));
          return { quoteNumber: number, orderId: orderEntry?.[1] || "", sids };
        }

        function fetchCurrentOmniPdf(context) {
          return new Promise(async (resolve, reject) => {
            for (const sid of [...context.sids, ""]) {
              const url = new URL("https://go.cin7.com/Cloud/Docs/PDF/");
              url.searchParams.set("T", "Quote");
              url.searchParams.set("idWebSite", "27265");
              url.searchParams.set("UN", "vi");
              url.searchParams.set("ID", context.orderId);
              if (sid) url.searchParams.set("SID", sid);
              try {
                const response = await new Promise((ok, fail) => GM_xmlhttpRequest({
                  method: "GET", url: url.href, responseType: "arraybuffer", timeout: 120000,
                  onload: (result) => result.status >= 200 && result.status < 300 ? ok(result) : fail(new Error(`HTTP ${result.status}`)),
                  onerror: () => fail(new Error("Could not connect to Cin7.")),
                  ontimeout: () => fail(new Error("Cin7 PDF download timed out."))
                }));
                const bytes = new Uint8Array(response.response || new ArrayBuffer(0));
                if (bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF") return resolve(response.response);
              } catch (_) {}
            }
            reject(new Error("The downloaded quote could not be remembered for Gmail."));
          });
        }

        async function rememberCurrentOmniPdf() {
          const context = currentOmniPdfContext();
          if (!context.quoteNumber || !context.orderId) return;
          try {
            const buffer = await fetchCurrentOmniPdf(context);
            const item = { quoteNumber: context.quoteNumber, base64: bytesToBase64(buffer), savedAt: Date.now() };
            const existing = cachedQuotePdfs().filter((entry) => quoteNumber(entry.quoteNumber) !== context.quoteNumber);
            GM_setValue(PDF_CACHE_KEY, [item, ...existing].slice(0, 25));
            showPickerMessage(`${context.quoteNumber} remembered for Gmail.`);
          } catch (error) {
            showPickerMessage(error.message || "The quote could not be remembered for Gmail.", true);
          }
        }

        function bindOmniDownloadCache() {
          if (document.documentElement.dataset.lcGmailQuoteCacheBound) return;
          document.documentElement.dataset.lcGmailQuoteCacheBound = "1";
          document.addEventListener("pointerdown", (event) => {
            const target = event.target instanceof Element ? event.target.closest("#lc-quote-pdf-download-button-v2, #lc-quote-pdf-download-button-v1") : null;
            if (target) void rememberCurrentOmniPdf();
          }, true);
        }

        function showPickerMessage(message, error = false) {
          document.getElementById("lc-gq-picker-message")?.remove();
          const notice = document.createElement("div");
          notice.id = "lc-gq-picker-message";
          notice.textContent = message;
          notice.style.cssText = `position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:420px;padding:12px 16px;border-radius:7px;background:${error ? "#b3261e" : "#087f8c"};color:#fff;font:700 13px Arial,sans-serif;box-shadow:0 7px 22px rgba(0,0,0,.25)`;
          document.body.appendChild(notice);
          setTimeout(() => notice.remove(), error ? 6000 : 2600);
        }

        function chooseDownloadedQuotePdfs(event) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          const composeRoot = activeComposeRoot();
          if (!composeRoot) {
            showPickerMessage("Open a Gmail compose window first.", true);
            return;
          }
          const quotes = cachedQuotePdfs();
          if (!quotes.length) {
            showPickerMessage("No remembered Omni quotes yet. Download a quote once with Omni's Download Quote PDF button, then return to Gmail.", true);
            return;
          }
          closePanel();
          const panel = document.createElement("div");
          panel.id = PANEL_ID;
          panel.innerHTML = `<div class="lc-gq-head"><strong>Downloaded Omni Quotes</strong><button type="button" data-close>×</button></div>
            <div class="lc-gq-help">Only quotes downloaded with the Omni button are shown here.</div>
            <div class="lc-gq-list">${quotes.map((item, index) => `<label><input type="checkbox" value="${index}"><span>${escapeHtml(quoteNumber(item.quoteNumber))}</span></label>`).join("")}</div>
            <div class="lc-gq-actions"><button type="button" data-close>Cancel</button><button type="button" data-attach>Attach selected</button></div>`;
          document.body.appendChild(panel);
          panel.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closePanel));
          panel.querySelector("[data-attach]").addEventListener("click", () => {
            try {
              const selected = Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map((input) => quotes[Number(input.value)]).filter(Boolean);
              if (!selected.length) return;
              const files = selected.map(cachedQuoteFile);
              const localInputs = Array.from(composeRoot.querySelectorAll('input[type="file"]'));
              const inputs = localInputs.length
                ? localInputs
                : Array.from(document.querySelectorAll('input[type="file"]'));
              const gmailInput = inputs.reverse().find((input) => !input.disabled);
              if (!gmailInput) throw new Error("Gmail's attachment control was not found. Click the paperclip once, cancel it, then try Quote PDFs again.");
              const transfer = new DataTransfer();
              files.forEach((file) => transfer.items.add(file));
              gmailInput.files = transfer.files;
              gmailInput.dispatchEvent(new Event("input", { bubbles: true }));
              gmailInput.dispatchEvent(new Event("change", { bubbles: true }));
              closePanel();
              showPickerMessage(`${files.length} Omni quote PDF${files.length === 1 ? "" : "s"} attached.`);
            } catch (error) {
              showPickerMessage(error.message || String(error), true);
            }
          });
        }

        function downloadPdf(context) {
          return new Promise(async (resolve, reject) => {
            for (const sid of context.sids) {
              const url = `https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&idWebSite=27265&UN=vi&ID=363&SID=${encodeURIComponent(sid)}`;
              try {
                const response = await new Promise((ok, fail) => GM_xmlhttpRequest({
                  method: "GET", url, responseType: "arraybuffer", timeout: 120000,
                  onload: (result) => result.status >= 200 && result.status < 300 ? ok(result) : fail(new Error(`HTTP ${result.status}`)),
                  onerror: () => fail(new Error("Could not connect to Cin7.")),
                  ontimeout: () => fail(new Error("Cin7 PDF download timed out."))
                }));
                const bytes = new Uint8Array(response.response || new ArrayBuffer(0));
                if (bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF") {
                  resolve(new File([response.response], `${quoteNumber(context.quoteNumber)}.pdf`, { type: "application/pdf", lastModified: Date.now() }));
                  return;
                }
              } catch (_) {}
            }
            reject(new Error(`Cin7 could not generate ${quoteNumber(context.quoteNumber)}.`));
          });
        }

        function closePanel() {
          document.getElementById(PANEL_ID)?.remove();
        }

        async function openPanel(event) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          }
          const now = Date.now();
          if (now - lastOpenAt < 350) return;
          lastOpenAt = now;
          closePanel();
          const composeRoot = activeComposeRoot();
          if (!composeRoot) return;
          const loadingPanel = document.createElement("div");
          loadingPanel.id = PANEL_ID;
          loadingPanel.innerHTML = `<div class="lc-gq-head"><strong>Omni Quote PDFs</strong><button type="button" data-close>×</button></div><div class="lc-gq-help">Loading current Omni quotes…</div>`;
          document.body.appendChild(loadingPanel);
          loadingPanel.querySelector("[data-close]").addEventListener("click", closePanel);
          let quotes = [];
          let listWarning = "";
          try {
            quotes = await loadOmniQuoteList();
          } catch (error) {
            quotes = history();
            listWarning = error.message || String(error);
          }
          closePanel();
          if (!quotes.length) {
            alert(listWarning || "No Omni quotes were found.");
            return;
          }
          const subjectQuotes = new Set((gmailSubject(composeRoot).match(/\bSFOR\d+(?:-[A-Z0-9]+)?\b/gi) || []).map((item) => item.toUpperCase()));
          const panel = document.createElement("div");
          panel.id = PANEL_ID;
          panel.innerHTML = `
            <div class="lc-gq-head"><strong>Omni Quote PDFs</strong><button type="button" data-close>×</button></div>
            <div class="lc-gq-help">Select one or more current Omni quotes.${listWarning ? ` ${listWarning}` : ""}</div>
            <input class="lc-gq-search" type="search" placeholder="Search quote or customer">
            <div class="lc-gq-list">${quotes.map((item, index) => `<label data-search="${escapeHtml(clean(`${item.quoteNumber} ${item.customer || ""}`).toLowerCase())}"><input type="checkbox" value="${index}" ${subjectQuotes.has(quoteNumber(item.quoteNumber)) ? "checked" : ""}><span>${escapeHtml(quoteNumber(item.quoteNumber))}${item.customer ? ` — ${escapeHtml(clean(item.customer))}` : ""}</span></label>`).join("")}</div>
            <div class="lc-gq-status"></div>
            <div class="lc-gq-actions"><button type="button" data-close>Cancel</button><button type="button" data-attach>Attach selected</button></div>`;
          document.body.appendChild(panel);
          panel.querySelector(".lc-gq-search").addEventListener("input", (event) => {
            const search = clean(event.target.value).toLowerCase();
            panel.querySelectorAll(".lc-gq-list label").forEach((row) => {
              row.style.display = !search || row.dataset.search.includes(search) ? "flex" : "none";
            });
          });
          panel.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closePanel));
          panel.querySelector("[data-attach]").addEventListener("click", async () => {
            const selected = Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map((input) => quotes[Number(input.value)]).filter(Boolean);
            if (!selected.length) return;
            const status = panel.querySelector(".lc-gq-status");
            const attach = panel.querySelector("[data-attach]");
            attach.disabled = true;
            try {
              const files = [];
              for (const context of selected) {
                status.textContent = `Downloading ${quoteNumber(context.quoteNumber)}…`;
                files.push(await downloadPdf(context));
              }
              const localInputs = Array.from(composeRoot.querySelectorAll('input[type="file"]'));
              const inputs = localInputs.length ? localInputs : Array.from(document.querySelectorAll('input[type="file"]'));
              const input = inputs.reverse().find((candidate) => !candidate.disabled);
              if (!input) throw new Error("Click Gmail’s paperclip once, then try again.");
              const transfer = new DataTransfer();
              files.forEach((file) => transfer.items.add(file));
              input.files = transfer.files;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
              status.textContent = `${files.length} quote PDF${files.length === 1 ? "" : "s"} attached.`;
              setTimeout(closePanel, 900);
            } catch (error) {
              status.textContent = error.message || String(error);
              attach.disabled = false;
            }
          });
        }

        function injectStyles() {
          if (document.getElementById("lc-gmail-omni-quotes-styles")) return;
          const style = document.createElement("style");
          style.id = "lc-gmail-omni-quotes-styles";
          style.textContent = `
            #${BUTTON_ID}{position:fixed;z-index:2147483646;display:none;height:28px;border:1px solid #e2a900;border-radius:15px;background:#f7c948;color:#fff;padding:0 10px;font:700 12px Arial,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(20,31,38,.2)}
            #${PANEL_ID}{position:fixed;z-index:2147483647;left:50%;top:50%;transform:translate(-50%,-50%);width:390px;max-width:calc(100vw - 32px);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #d7c175;border-radius:9px;box-shadow:0 18px 45px rgba(20,31,38,.28);font:13px Arial,sans-serif;color:#17202a}
            .lc-gq-head,.lc-gq-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px;border-bottom:1px solid #eee}.lc-gq-head button{border:0;background:transparent;font-size:20px;cursor:pointer}.lc-gq-help,.lc-gq-status{padding:9px 11px;color:#50606b}.lc-gq-search{box-sizing:border-box;width:calc(100% - 22px);height:34px;margin:0 11px 9px;border:1px solid #c9d5da;border-radius:5px;padding:0 9px}.lc-gq-list{max-height:300px;overflow:auto}.lc-gq-list label{display:flex;gap:9px;padding:9px 11px;border-top:1px solid #eef1f3;cursor:pointer}.lc-gq-actions{justify-content:flex-end;border-top:1px solid #eee;border-bottom:0}.lc-gq-actions button{min-height:30px;border:0;border-radius:5px;padding:0 10px;font-weight:700;cursor:pointer}.lc-gq-actions [data-attach]{background:#f7c948;color:#fff}.lc-gq-actions button:disabled{opacity:.55}`;
          document.head.appendChild(style);
        }

        function syncButton() {
          const button = document.getElementById(BUTTON_ID);
          const root = activeComposeRoot();
          if (!button || !root) {
            if (button) button.style.display = "none";
            return;
          }
          const anchor = document.getElementById("lc-gmail-drawings-button") || document.getElementById("lc-gmail-care-guides-button");
          const rect = anchor?.getBoundingClientRect() || root.getBoundingClientRect();
          const width = button.offsetWidth || 88;
          button.style.left = `${Math.max(8, anchor ? rect.left - width - 8 : rect.right - width - 245)}px`;
          button.style.top = `${Math.max(8, anchor ? rect.top : rect.bottom - 42)}px`;
          button.style.display = "inline-flex";
          button.style.alignItems = "center";
          button.style.justifyContent = "center";
        }

        function bootGmail() {
          injectStyles();
          if (!document.getElementById(BUTTON_ID)) {
            const button = document.createElement("button");
            button.id = BUTTON_ID;
            button.type = "button";
            button.textContent = "Quote PDFs";
            button.addEventListener("click", chooseDownloadedQuotePdfs, true);
            document.body.appendChild(button);
          }
          syncButton();
          if (!syncTimer) syncTimer = setInterval(syncButton, 500);
        }

        if (location.hostname === "go.cin7.com") {
          // Retired: Omni's separate workflow script owns the working PDF download button.
        } else {
          clearInterval(syncTimer);
          syncTimer = 0;
          document.getElementById(BUTTON_ID)?.remove();
          document.getElementById(PANEL_ID)?.remove();
          document.getElementById("lc-gmail-omni-quotes-styles")?.remove();
        }
      })();
    }
  };
  // END GENERATED GMAIL COMPONENTS

  function execute(component) {
    if (!component.enabled) {
      status.skipped.push(component.file);
      return;
    }
    try {
      if (gmailComponents[component.resource] && (component.resource !== 'emailHelperCompose' || isGmail)) {
        gmailComponents[component.resource]();
        status.loaded.push(component.file);
        return;
      }
      const source = GM_getResourceText(component.resource);
      if (!source) throw new Error('Bundled resource is empty');
      const run = new Function(
        'GM_xmlhttpRequest', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand', 'GM_getResourceText', 'unsafeWindow', 'GM_openInTab',
        `${source}\n//# sourceURL=lc-all-in-one/${component.file}`
      );
      run(GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_registerMenuCommand, GM_getResourceText, typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, typeof GM_openInTab === 'function' ? GM_openInTab : undefined);
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
