// ==UserScript==
// @name         Cin7 Living Culture Care Guides
// @namespace    https://livingculture.co.nz/
// @version      0.1.12
// @description  Adds a Care Guides dropdown to attach Google Drive PDFs to Cin7 quote and sale pages.
// @author       Living Culture
// @match        https://inventory.dearsystems.com/Sale*
// @grant        GM_xmlhttpRequest
// @connect      cin7-pdf-attachments.vercel.app
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-care-guides.user.js?v=0.1.12
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-care-guides.user.js?v=0.1.12
// ==/UserScript==

(function () {
  "use strict";

  const API_BASE = "https://cin7-pdf-attachments.vercel.app";
  const PANEL_ID = "lc-cin7-pdf-panel";
  const BUTTON_ID = "lc-cin7-pdf-button";
  const TOKEN_KEY = "lcCin7PdfToken";
  const EMBEDDED_TOOL_TOKEN = "fXlAMocbHnglrq02Vg4WZY0xbHaPsA+b";
  const ACTION_ROW_ID = "lc-cin7-action-row-v1";
  const SITE_VISIT_BUTTON_ID = "lc-site-visit-inline-button-v2";
  const QUOTE_REVIEW_BUTTON_ID = "lc-quote-review-inline-button-v1";
  const HUBSPOT_BUTTON_ID = "lc-hubspot-deal-inline-button-v1";
  const TOP_ROW_SETTLE_MS = 1800;
  const scriptStartedAt = Date.now();

  const state = {
    files: [],
    selected: new Set(),
    open: false,
    busy: false,
    loaded: false,
  };
  let injectScheduled = false;
  let revealRetryTimer = null;

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

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function extractOrderNumber() {
    const url = new URL(window.location.href);
    const visibleText = clean(document.body?.innerText || "");
    const attachmentsStart = visibleText.search(/\bATTACHMENTS\b/i);
    const primaryPageText = attachmentsStart > 0 ? visibleText.slice(0, attachmentsStart) : visibleText;
    const candidates = [
      url.searchParams.get("OrderNumber"),
      url.searchParams.get("orderNumber"),
      url.searchParams.get("SaleOrderNumber"),
      document.querySelector("input[name='QuoteNumber']")?.value,
      document.querySelector("input[name='OrderNumber']")?.value,
      document.querySelector("input[name='SaleOrderNumber']")?.value,
      document.querySelector("[data-bind*='QuoteNumber']")?.textContent,
      document.querySelector("[data-bind*='OrderNumber']")?.textContent,
      document.querySelector("[data-bind*='SaleOrderNumber']")?.textContent,
      primaryPageText,
    ];
    for (const candidate of candidates) {
      const text = clean(candidate);
      const match = text.match(/\b[A-Z]{2,6}SO-\d+\b/i) || text.match(/\bSO-\d+\b/i);
      if (match) return match[0].toUpperCase();
    }

    const invoiceCandidates = [
      document.querySelector("input[name='InvoiceNumber']")?.value,
      document.querySelector("input[name='Invoice']")?.value,
      document.querySelector("[data-bind*='InvoiceNumber']")?.textContent,
      document.querySelector("[data-bind*='Invoice']")?.textContent,
      primaryPageText,
    ];
    for (const candidate of invoiceCandidates) {
      const text = clean(candidate);
      const match = text.match(/\bINV-\d+\b/i);
      if (match) return match[0].toUpperCase();
    }

    const fallbackCandidates = [
      document.querySelector("input[name='OrderNumber']")?.value,
      document.querySelector("input[name='SaleOrderNumber']")?.value,
      document.querySelector("[data-bind*='OrderNumber']")?.textContent,
      visibleText,
    ];
    for (const candidate of fallbackCandidates) {
      const text = clean(candidate);
      const match = text.match(/\b[A-Z]{2,6}SO-\d+\b/i) || text.match(/\bSO-\d+\b/i) || text.match(/\bINV-\d+\b/i);
      if (match) return match[0].toUpperCase();
    }
    return "";
  }

  function extractSaleId() {
    const hash = window.location.hash || "";
    const match = hash.match(/#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return match ? match[1] : "";
  }

  function apiRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem(TOKEN_KEY) || "";
      const toolToken = token || EMBEDDED_TOOL_TOKEN;
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url: `${API_BASE}${path}`,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(toolToken ? { "x-lc-token": toolToken } : {}),
        },
        data: options.body ? JSON.stringify(options.body) : undefined,
        onload(response) {
          let body = null;
          try {
            body = JSON.parse(response.responseText || "{}");
          } catch (error) {
            reject(new Error("Attachment service returned an invalid response."));
            return;
          }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(body.error || `Attachment service returned HTTP ${response.status}.`));
            return;
          }
          resolve(body);
        },
        onerror() {
          reject(new Error("Could not reach the attachment service."));
        },
      });
    });
  }

  function ensureToken() {
    if (localStorage.getItem(TOKEN_KEY) || EMBEDDED_TOOL_TOKEN) return true;
    const value = window.prompt("Enter the Cin7 PDF attachment tool token");
    if (!value) return false;
    localStorage.setItem(TOKEN_KEY, value.trim());
    return true;
  }

  function setStatus(message) {
    const status = document.querySelector("#lc-cin7-pdf-status");
    if (status) status.textContent = message;
  }

  function selectedLabel() {
    return state.selected.size ? `Attach ${state.selected.size}` : "Attach";
  }

  function renderPanel() {
    let panel = document.querySelector(`#${PANEL_ID}`);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }

    const orderNumber = extractOrderNumber();
    const saleId = extractSaleId();
    const filesMarkup = state.files.length
      ? state.files
          .map((file) => {
            const checked = state.selected.has(file.id) ? "checked" : "";
            return `
              <label class="lc-cin7-pdf-row">
                <input type="checkbox" value="${escapeHtml(file.id)}" ${checked}>
                <span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
              </label>
            `;
          })
          .join("")
      : '<div class="lc-cin7-pdf-empty">No PDFs found.</div>';

    panel.innerHTML = `
      <div class="lc-cin7-pdf-head">
        <strong>Care Guides</strong>
        <button type="button" id="lc-cin7-pdf-close" title="Close">x</button>
      </div>
      <div class="lc-cin7-pdf-order">${escapeHtml(orderNumber || "Order number not detected")}</div>
      <div class="lc-cin7-pdf-list">${state.loaded ? filesMarkup : '<div class="lc-cin7-pdf-empty">Loading PDFs...</div>'}</div>
      <div class="lc-cin7-pdf-actions">
        <button type="button" id="lc-cin7-pdf-refresh">Refresh</button>
        <button type="button" id="lc-cin7-pdf-attach" ${state.busy || !state.selected.size || (!orderNumber && !saleId) ? "disabled" : ""}>${selectedLabel()}</button>
      </div>
      <div id="lc-cin7-pdf-status" class="lc-cin7-pdf-status"></div>
    `;

    panel.querySelector("#lc-cin7-pdf-close").addEventListener("click", closePanel);
    panel.querySelector("#lc-cin7-pdf-refresh").addEventListener("click", loadFiles);
    panel.querySelector("#lc-cin7-pdf-attach").addEventListener("click", attachSelected);
    panel.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", (event) => {
        if (event.target.checked) state.selected.add(event.target.value);
        else state.selected.delete(event.target.value);
        renderPanel();
      });
    });
  }

  async function loadFiles() {
    if (!ensureToken()) return;
    state.busy = true;
    renderPanel();
    setStatus("Loading PDFs...");
    try {
      const body = await apiRequest("/api/list-pdfs");
      state.files = body.files || [];
      state.loaded = true;
      state.selected.clear();
      renderPanel();
      setStatus(`${state.files.length} PDF${state.files.length === 1 ? "" : "s"} ready.`);
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
    const orderNumber = extractOrderNumber();
    const saleId = extractSaleId();
    if ((!orderNumber && !saleId) || !state.selected.size) return;
    state.busy = true;
    renderPanel();
    setStatus("Attaching PDFs...");
    try {
      const body = await apiRequest("/api/attach-pdfs", {
        method: "POST",
        body: { saleId, orderNumber, fileIds: Array.from(state.selected) },
      });
      state.selected.clear();
      renderPanel();
      setStatus(`Attached ${body.attached.length} PDF${body.attached.length === 1 ? "" : "s"}. Refreshing...`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setStatus(error.message);
      window.alert(`PDF attachment failed: ${error.message}`);
    } finally {
      state.busy = false;
      renderPanel();
    }
  }

  function openPanel() {
    state.open = true;
    renderPanel();
    const button = document.querySelector(`#${BUTTON_ID}`);
    const panel = document.querySelector(`#${PANEL_ID}`);
    if (button && panel) {
      const rect = button.getBoundingClientRect();
      panel.style.top = `${Math.max(12, rect.bottom + window.scrollY + 8)}px`;
      panel.style.left = `${Math.max(12, Math.min(window.innerWidth - 380, rect.left + window.scrollX))}px`;
      panel.style.display = "block";
    }
    if (!state.loaded) loadFiles();
  }

  function closePanel() {
    state.open = false;
    const panel = document.querySelector(`#${PANEL_ID}`);
    if (panel) panel.style.display = "none";
  }

  function injectStyles() {
    if (document.querySelector("#lc-cin7-pdf-styles")) return;
    const style = document.createElement("style");
    style.id = "lc-cin7-pdf-styles";
    style.textContent = `
      #${BUTTON_ID} {
        display: inline-flex;
        visibility: hidden;
        opacity: 0;
        align-items: center;
        justify-content: center;
        height: 34px;
        margin-left: 8px;
        margin-bottom: 0;
        border: 1px solid #0d6f78;
        border-radius: 4px;
        background: #0d6f78;
        color: #fff;
        padding: 0 14px;
        font: 700 14px Arial, sans-serif;
        line-height: 1;
        white-space: nowrap;
        vertical-align: middle;
        cursor: pointer;
        pointer-events: auto;
      }
      #${PANEL_ID} {
        display: none;
        position: absolute;
        z-index: 2147483647;
        width: 360px;
        max-width: calc(100vw - 24px);
        background: #fff;
        border: 1px solid #c9d5da;
        border-radius: 6px;
        box-shadow: 0 18px 42px rgba(20, 31, 38, .22);
        color: #17202a;
        font: 13px Arial, sans-serif;
      }
      .lc-cin7-pdf-head,
      .lc-cin7-pdf-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border-bottom: 1px solid #e5ecef;
      }
      .lc-cin7-pdf-head {
        justify-content: space-between;
      }
      .lc-cin7-pdf-head button {
        border: 0;
        background: transparent;
        cursor: pointer;
        font: 700 14px Arial, sans-serif;
      }
      .lc-cin7-pdf-order,
      .lc-cin7-pdf-status,
      .lc-cin7-pdf-empty {
        padding: 9px 10px;
        color: #50606b;
      }
      .lc-cin7-pdf-list {
        max-height: 300px;
        overflow: auto;
        border-top: 1px solid #eef3f5;
        border-bottom: 1px solid #eef3f5;
      }
      .lc-cin7-pdf-row {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        border-bottom: 1px solid #eef3f5;
        cursor: pointer;
      }
      .lc-cin7-pdf-row span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lc-cin7-pdf-actions {
        justify-content: flex-end;
        border-bottom: 0;
      }
      .lc-cin7-pdf-actions button {
        min-height: 28px;
        border: 0;
        border-radius: 4px;
        background: #e8f0f2;
        color: #18343a;
        padding: 5px 9px;
        font: 700 12px Arial, sans-serif;
        cursor: pointer;
      }
      .lc-cin7-pdf-actions #lc-cin7-pdf-attach {
        background: #0d6f78;
        color: #fff;
      }
      .lc-cin7-pdf-actions button:disabled {
        cursor: not-allowed;
        opacity: .55;
      }
    `;
    document.head.appendChild(style);
  }

  function findButtonByLabel(label) {
    return Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit']"))
      .filter(isVisible)
      .find((button) => clean(button.textContent || button.value || "").toLowerCase() === label.toLowerCase());
  }

  function positionButtonBetweenQuoteAndHubspot(button) {
    const row = document.querySelector(`#${ACTION_ROW_ID}`);
    if (!row || !button) return false;

    const quoteReviewButton = document.querySelector(`#${QUOTE_REVIEW_BUTTON_ID}`);
    const hubspotButton = document.querySelector(`#${HUBSPOT_BUTTON_ID}`);
    if (!quoteReviewButton || !hubspotButton) return false;

    if (button.parentElement !== row) row.appendChild(button);

    const rowRect = row.getBoundingClientRect();
    const quoteRect = quoteReviewButton.getBoundingClientRect();
    const hubspotRect = hubspotButton.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const centerBetween = quoteRect.right + (hubspotRect.left - quoteRect.right) / 2;

    button.style.position = "absolute";
    button.style.left = `${Math.max(0, centerBetween - rowRect.left - buttonRect.width / 2)}px`;
    button.style.top = `${Math.max(0, quoteRect.top - rowRect.top)}px`;
    button.style.zIndex = "2147483601";
    button.style.marginLeft = "0";
    button.style.marginBottom = "0";
    button.style.height = "34px";
    button.style.filter = "";
    const elapsed = Date.now() - scriptStartedAt;
    if (elapsed < TOP_ROW_SETTLE_MS) {
      button.style.visibility = "hidden";
      button.style.opacity = "0";
      if (!revealRetryTimer) {
        revealRetryTimer = window.setTimeout(() => {
          revealRetryTimer = null;
          injectButton();
        }, TOP_ROW_SETTLE_MS - elapsed + 80);
      }
    } else {
      button.style.visibility = "visible";
      button.style.opacity = "1";
    }
    return true;
  }

  function findInsertTarget() {
    const actionRow = document.querySelector(`#${ACTION_ROW_ID}`);
    if (actionRow) return actionRow;

    const hubspotButton = document.querySelector(`#${HUBSPOT_BUTTON_ID}`) || findButtonByLabel("HubSpot Deal");
    if (hubspotButton?.parentElement) return hubspotButton.parentElement;

    const visibleButtons = Array.from(document.querySelectorAll("button, a.btn, input[type='button'], input[type='submit']")).filter(isVisible);
    const saveButton = visibleButtons.find((button) => /save|authorise|email|print/i.test(button.textContent || button.value || ""));
    return saveButton?.parentElement || document.querySelector("form") || document.body;
  }

  function injectButton() {
    injectStyles();
    let button = document.querySelector(`#${BUTTON_ID}`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = BUTTON_ID;
      button.textContent = "Care Guides";
      button.addEventListener("mouseenter", () => {
        if (button.disabled) return;
        button.style.filter = "brightness(.92)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.filter = "none";
      });
      button.addEventListener("click", () => {
        if (state.open) closePanel();
        else openPanel();
      });
    }
    button.style.visibility = "hidden";
    button.style.opacity = "0";

    if (positionButtonBetweenQuoteAndHubspot(button)) return;

    const hubspotButton = document.querySelector(`#${HUBSPOT_BUTTON_ID}`) || findButtonByLabel("HubSpot Deal");
    if (hubspotButton?.parentElement) {
      hubspotButton.insertAdjacentElement("beforebegin", button);
      return;
    }

    const target = findInsertTarget();
    target.appendChild(button);
  }

  function scheduleInjectButton() {
    if (injectScheduled) return;
    injectScheduled = true;
    window.setTimeout(() => {
      injectScheduled = false;
      injectButton();
    }, 500);
  }

  function boot() {
    injectButton();
    const observer = new MutationObserver(() => scheduleInjectButton());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
