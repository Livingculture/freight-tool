// ==UserScript==
// @name         Living Culture All-in-One
// @namespace    livingculture
// @version      0.1.80
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
// @resource     installFees https://raw.githubusercontent.com/Livingculture/freight-tool/181a9af1225378a8b5373f4eca9569e0febf8488/userscripts/omni-install-fee-helper.user.js
// @resource     customProducts https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-custom-product-helper.user.js?v=0.1.10
// @resource     websiteShortcuts https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-website-shortcuts.user.js?v=0.1.31
// @resource     productAvailability https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-product-availability.user.js?v=0.1.6
// @resource     chinaWarehouse https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-china-warehouse-popup-clean-mode.user.js?v=0.1.1
// @resource     quoteDefaults https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-quote-defaults.user.js?v=0.1.10
// @resource     hideOrderSettings https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hide-order-settings.user.js?v=0.1.2
// @resource     emailHelperCompose https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-compose.user.js?v=0.1.45
// @resource     pdfAttachments https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pdf-attachments.user.js?v=0.4.9
// @resource     hubspotShortcut https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-hubspot-shortcut.user.js?v=0.2.0
// @resource     workflow https://raw.githubusercontent.com/Livingculture/freight-tool/accc7b86a6960e42d1a5c36136ad65f354e7ceb0/userscripts/omni-livingculture-workflow.user.js
// @resource     emailHelperOnly https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-only.user.js?v=0.1.1
// @resource     quoteMemo https://raw.githubusercontent.com/Livingculture/freight-tool/b3e3a323b1b0ba6a9aed3bf11f328375a7728e34/userscripts/omni-quote-memo-info.user.js
// @resource     pergolaGuide https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pergola-modification-guide.user.js?v=0.1.1
// @resource     hubspotColours https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/hubspot-contrast-colours.user.js?v=0.1.16
// @resource     clearanceInfo https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-clearance-info-sheet.user.js?v=0.1.15
// @resource     promoSummary https://raw.githubusercontent.com/Livingculture/freight-tool/6c7e65a72b06ae04475bf0f16c7f508dcaf5e136/userscripts/cin7-promo-summary.user.js
// @resource     newProducts https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-new-products-info-sheet.user.js?v=0.1.7
// @resource     wecomPayment https://raw.githubusercontent.com/Livingculture/freight-tool/accc7b86a6960e42d1a5c36136ad65f354e7ceb0/userscripts/cin7-wecom-payment-message.user.js
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

  const status = { version: '0.1.80', loaded: [], skipped: [], errors: [] };
  window.__lcAllInOneStatus = status;

  // BEGIN GENERATED GMAIL COMPONENTS
  // Static functions avoid runtime string evaluation under Gmail's page security policy.
  const gmailComponents = {
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
        const QUOTE_RE = /\b(NZSO|SFOR)\s*[-#]?\s*(\d{4,}(?:-[A-Z0-9]+)?)\b/gi;
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
            const target = event.target instanceof Element ? event.target.closest("#lc-quote-pdf-download-button-v1") : null;
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
      if (gmailComponents[component.resource]) {
        gmailComponents[component.resource]();
        status.loaded.push(component.file);
        return;
      }
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
