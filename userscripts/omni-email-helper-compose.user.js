// ==UserScript==
// @name         Omni Living Culture Email Helper Compose
// @namespace    livingculture-omni
// @version      0.1.0
// @description  Opens the Living Culture email helper and inserts its draft into the Cin7 Omni email composer.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/CRM/ContactLog.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-compose.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-compose.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const EMAIL_HELPER_URL = "https://living-culture-email-helper.vercel.app";
  const BUTTON_ID = "lc-omni-email-helper-compose-button";
  const STYLE_ID = "lc-omni-email-helper-compose-styles";
  let injectQueued = false;

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

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 122px !important;
        min-height: 36px !important;
        margin-left: 10px !important;
        padding: 0 18px !important;
        border: 1px solid #0b3978 !important;
        border-radius: 5px !important;
        background: #0b3978 !important;
        box-shadow: none !important;
        color: #fff !important;
        font: 700 14px Arial, sans-serif !important;
        line-height: 1 !important;
        text-decoration: none !important;
        white-space: nowrap !important;
        vertical-align: middle !important;
        cursor: pointer !important;
      }
      #${BUTTON_ID}:hover,
      #${BUTTON_ID}:focus {
        border-color: #072d62 !important;
        background: #072d62 !important;
        color: #fff !important;
        outline: none !important;
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

  function openEmailHelper() {
    const url = new URL(EMAIL_HELPER_URL);
    const order = extractOrderNumber();
    if (order) url.searchParams.set("order", order);

    const width = Math.min(1250, Math.max(900, Math.round(screen.availWidth * 0.68)));
    const height = Math.min(900, Math.max(700, Math.round(screen.availHeight * 0.82)));
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    window.open(url.toString(), "lc-email-helper", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  }

  function injectButton() {
    injectStyles();
    if (document.getElementById(BUTTON_ID)) return;

    const anchor = findBackControl();
    const subject = findSubjectField();
    if (!anchor && !subject) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Email Helper";
    button.title = "Open Living Culture Email Helper";
    button.addEventListener("click", openEmailHelper);

    if (anchor) anchor.insertAdjacentElement("afterend", button);
    else subject.insertAdjacentElement("afterend", button);
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

  window.addEventListener("message", (event) => {
    if (event.origin !== EMAIL_HELPER_URL) return;
    const payload = event.data || {};
    if (payload.type !== "LC_EMAIL_HELPER_DRAFT") return;

    const html = String(payload.html || "").trim()
      || escapeHtml(payload.text || "").replace(/\n/g, "<br>");
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
