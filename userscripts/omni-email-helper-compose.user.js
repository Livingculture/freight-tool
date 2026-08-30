// ==UserScript==
// @name         Omni Living Culture Email Helper Compose
// @namespace    livingculture-omni
// @version      0.1.1
// @description  Opens the Living Culture email helper and inserts its draft into the Cin7 Omni email composer.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/CRM/ContactLog.aspx*
// @match        https://living-culture-email-helper.vercel.app/*
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
  const PANEL_ID = "lc-omni-email-helper-panel";
  let injectQueued = false;

  function applyEmbeddedHelperTheme() {
    const params = new URLSearchParams(location.search);
    if (params.get("theme") !== "omni" || params.get("embedded") !== "1") return;
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
        background: linear-gradient(180deg, rgba(11, 57, 120, .09), transparent 260px), #eef4fb !important;
      }
      main {
        width: calc(100% - 24px) !important;
        padding: 12px 0 20px !important;
      }
      header {
        padding: 0 0 12px !important;
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
        border-color: #c2d2e6 !important;
        background: #f4f8fd !important;
      }
      .panel {
        box-shadow: 0 12px 32px rgba(15, 46, 106, .09) !important;
      }
    `;
    document.head.appendChild(style);
  }

  if (location.hostname === "living-culture-email-helper.vercel.app") {
    applyEmbeddedHelperTheme();
    return;
  }

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
      #${PANEL_ID} {
        position: fixed !important;
        inset: 48px 0 0 auto !important;
        z-index: 2147483646 !important;
        display: flex !important;
        flex-direction: column !important;
        width: min(940px, 62vw) !important;
        min-width: 720px !important;
        height: calc(100vh - 48px) !important;
        border-left: 1px solid #8da9cc !important;
        background: #eef4fb !important;
        box-shadow: -16px 0 42px rgba(15, 46, 106, 0.24) !important;
      }
      #${PANEL_ID}[hidden] {
        display: none !important;
      }
      #${PANEL_ID} .lc-omni-email-helper-head {
        flex: 0 0 auto !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        min-height: 54px !important;
        padding: 0 14px 0 20px !important;
        background: #0b3978 !important;
        color: #fff !important;
        font: 700 18px Arial, sans-serif !important;
      }
      #${PANEL_ID} .lc-omni-email-helper-close {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 34px !important;
        height: 34px !important;
        min-height: 34px !important;
        padding: 0 !important;
        border: 1px solid #bfd0e6 !important;
        border-radius: 5px !important;
        background: #eef4fb !important;
        color: #0b3978 !important;
        font: 700 22px/1 Arial, sans-serif !important;
        cursor: pointer !important;
      }
      #${PANEL_ID} iframe {
        flex: 1 1 auto !important;
        display: block !important;
        width: 100% !important;
        min-height: 0 !important;
        border: 0 !important;
        background: #eef4fb !important;
      }
      @media (max-width: 1100px) {
        #${PANEL_ID} {
          width: 100vw !important;
          min-width: 0 !important;
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
    url.searchParams.set("theme", "omni");
    url.searchParams.set("embedded", "1");
    return url.toString();
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.setAttribute("aria-label", "Living Culture Email Helper");
    panel.innerHTML = `
      <div class="lc-omni-email-helper-head">
        <span>Living Culture Email Helper</span>
        <button type="button" class="lc-omni-email-helper-close" aria-label="Close Email Helper">×</button>
      </div>
      <iframe title="Living Culture Email Helper" allow="clipboard-write"></iframe>
    `;
    panel.querySelector(".lc-omni-email-helper-close").addEventListener("click", () => {
      panel.hidden = true;
    });
    document.body.appendChild(panel);
    return panel;
  }

  function openEmailHelper() {
    const panel = ensurePanel();
    const frame = panel.querySelector("iframe");
    const url = helperUrl();
    if (frame.src !== url) frame.src = url;
    panel.hidden = false;
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
    ensurePanel();
    const observer = new MutationObserver(scheduleInject);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
