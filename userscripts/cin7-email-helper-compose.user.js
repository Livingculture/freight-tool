// ==UserScript==
// @name         Cin7 Living Culture Email Helper Compose
// @namespace    https://livingculture.co.nz/
// @version      0.1.3
// @description  Adds a Compose button to Cin7 email popups and sends Living Culture Email Helper drafts back into Cin7.
// @author       Living Culture
// @match        https://inventory.dearsystems.com/Sale*
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-email-helper-compose.user.js?v=0.1.3
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-email-helper-compose.user.js?v=0.1.3
// ==/UserScript==

(function () {
  "use strict";

  const EMAIL_HELPER_URL = "https://living-culture-email-helper.vercel.app";
  const STYLE_ID = "lc-cin7-email-helper-compose-styles";
  const COMPOSE_BUTTON_ID = "lc-cin7-email-helper-compose-button";

  let injectScheduled = false;

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
      document.querySelector("input[name='InvoiceNumber']")?.value,
      document.querySelector("[data-bind*='QuoteNumber']")?.textContent,
      document.querySelector("[data-bind*='OrderNumber']")?.textContent,
      document.querySelector("[data-bind*='SaleOrderNumber']")?.textContent,
      document.querySelector("[data-bind*='InvoiceNumber']")?.textContent,
      primaryPageText,
    ];

    for (const candidate of candidates) {
      const text = clean(candidate);
      const match = text.match(/\b[A-Z]{2,6}SO-\d+\b/i) || text.match(/\bSO-\d+\b/i) || text.match(/\bINV-\d+\b/i);
      if (match) return match[0].toUpperCase();
    }
    return "";
  }

  function injectStyles() {
    if (document.querySelector(`#${STYLE_ID}`)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${COMPOSE_BUTTON_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        margin-right: 8px;
        border: 1px solid #05cabe;
        border-radius: 4px;
        background: #fff;
        color: #138f89;
        padding: 0 14px;
        font: 700 14px Arial, sans-serif;
        line-height: 1;
        white-space: nowrap;
        vertical-align: middle;
        cursor: pointer;
      }
      #${COMPOSE_BUTTON_ID}:hover {
        background: #eefdfb;
      }
    `;
    document.head.appendChild(style);
  }

  function emailDialogCandidates() {
    return Array.from(document.querySelectorAll(".modal, .modal-dialog, .modal-content, [role='dialog'], body"))
      .filter(isVisible)
      .filter((element) => /email template|email subject|send the email/i.test(element.innerText || ""));
  }

  function activeEmailDialog() {
    return emailDialogCandidates().find((dialog) =>
      Array.from(dialog.querySelectorAll("button")).some((button) => /^send$/i.test(clean(button.textContent || button.value || "")) && isVisible(button))
    );
  }

  function findSendButton(dialog) {
    if (!dialog) return null;
    return Array.from(dialog.querySelectorAll("button"))
      .filter(isVisible)
      .find((button) => /^send$/i.test(clean(button.textContent || button.value || "")));
  }

  function openEmailHelper() {
    const order = extractOrderNumber();
    const url = new URL(EMAIL_HELPER_URL);
    if (order) url.searchParams.set("order", order);
    window.open(url.toString(), "lc-email-helper", "width=1500,height=950");
  }

  function injectComposeButton() {
    injectStyles();
    const dialog = activeEmailDialog();
    const sendButton = findSendButton(dialog);
    if (!dialog || !sendButton || dialog.querySelector(`#${COMPOSE_BUTTON_ID}`)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = COMPOSE_BUTTON_ID;
    button.textContent = "Compose";
    button.addEventListener("click", openEmailHelper);
    sendButton.insertAdjacentElement("beforebegin", button);
  }

  function findEmailEditor(dialog) {
    for (const frame of Array.from(dialog.querySelectorAll("iframe")).filter(isVisible)) {
      try {
        const body = frame.contentDocument?.body;
        if (body) return { element: body, frame };
      } catch {
        // Cin7's editor iframe is same-origin when available.
      }
    }

    const contentEditable = Array.from(dialog.querySelectorAll("[contenteditable='true']")).find(isVisible);
    if (contentEditable) {
      const body = contentEditable.ownerDocument?.body;
      if (body && body !== document.body) return { element: body };
      return { element: contentEditable };
    }
    return null;
  }

  function insertDraftIntoCin7Email(html) {
    const dialog = activeEmailDialog();
    const target = findEmailEditor(dialog);
    const editor = target?.element;
    if (!dialog || !editor) {
      window.alert("Open the Cin7 email window first, then click Copy to Cin7 in the email helper again.");
      return false;
    }

    editor.innerHTML = `${html}<p><br></p>`;
    if (window.tinymce?.activeEditor) {
      try {
        window.tinymce.activeEditor.setContent(editor.innerHTML);
        window.tinymce.activeEditor.fire("change");
      } catch {
        // Direct DOM insertion above is still the primary path.
      }
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertHTML" }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== EMAIL_HELPER_URL) return;
    const payload = event.data || {};
    if (payload.type !== "LC_EMAIL_HELPER_DRAFT") return;
    const html = String(payload.html || "").trim() || escapeHtml(payload.text || "").replace(/\n/g, "<br>");
    if (insertDraftIntoCin7Email(html)) {
      event.source?.postMessage({ type: "LC_EMAIL_HELPER_DRAFT_INSERTED" }, EMAIL_HELPER_URL);
      window.focus();
    }
  });

  function scheduleInject() {
    if (injectScheduled) return;
    injectScheduled = true;
    window.setTimeout(() => {
      injectScheduled = false;
      injectComposeButton();
    }, 500);
  }

  function boot() {
    injectComposeButton();
    const observer = new MutationObserver(scheduleInject);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
