// ==UserScript==
// @name         Omni Living Culture Email Helper Compose
// @namespace    livingculture-omni
// @version      0.1.16
// @description  Opens the Living Culture email helper and inserts its draft into the Cin7 Omni email composer.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/CRM/ContactLog.aspx*
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
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
  const LAYOUT_ID = "lc-omni-email-helper-layout";
  const CONTEXT_KEY = "lcOmniEmailHelperQuoteContext";
  const SIGNATURE_IMAGE_KEY = "lcOmniEmailHelperSignatureImageV1";
  let composePlaceholder = null;
  let contactsPlaceholder = null;
  let composePanel = null;
  let contactsPanel = null;
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
      #lc-signature-image-tools input[type="file"] {
        display: block;
        width: 100%;
        padding: 6px;
        background: #fff;
      }
      #lc-signature-image-preview {
        display: none;
        max-width: 100%;
        max-height: 120px;
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

    const injectSignatureImageUpload = () => {
      if (document.getElementById("lc-signature-image-tools")) return;
      const signatureBox = document.querySelector(".signature-box");
      if (!signatureBox) return;
      const tools = document.createElement("div");
      tools.id = "lc-signature-image-tools";
      tools.innerHTML = `
        <label class="lc-signature-image-label" for="lc-signature-image-input">Signature image</label>
        <input id="lc-signature-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
        <img id="lc-signature-image-preview" alt="Signature image preview">
        <button id="lc-signature-image-remove" type="button" class="ghost">Remove image</button>`;
      signatureBox.appendChild(tools);
      const input = tools.querySelector("#lc-signature-image-input");
      const preview = tools.querySelector("#lc-signature-image-preview");
      const show = (source) => {
        preview.src = source || "";
        tools.classList.toggle("has-image", Boolean(source));
      };
      show(storedSignatureImage());
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

    const maintainSignatureTools = () => {
      injectSignatureImageUpload();
      hideImageUrlOverride();
    };
    maintainSignatureTools();
    new MutationObserver(maintainSignatureTools).observe(document.body, { childList: true, subtree: true });

    const addCin7NumberToSubject = () => {
      const subject = document.querySelector("#subject-output");
      const order = clean(document.querySelector("#order")?.value);
      if (!subject || !order) return;
      const escapedOrder = order.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const base = clean(subject.value)
        .replace(new RegExp(`\\s*[-–—|:]?\\s*${escapedOrder}\\s*$`, "i"), "")
        .trim();
      const next = base ? `${base} - ${order}` : order;
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
      const text = document.querySelector("#body-output, #body")?.value || "";
      const signatureImage = storedSignatureImage();
      const html = `${escapeHtml(text).replace(/\n/g, "<br>")}${signatureImage ? `<br><br><img src="${signatureImage}" alt="Signature" style="display:block;max-width:420px;max-height:160px;width:auto;height:auto">` : ""}`;
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

    window.addEventListener("message", (event) => {
      if (event.origin !== "https://go.cin7.com" || event.data?.type !== "LC_OMNI_EMAIL_CONTEXT") return;
      const context = event.data.context || {};
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
    const productHeader = Array.from(document.querySelectorAll("th, td"))
      .filter(visible)
      .find((cell) => /^product$/i.test(clean(cell.textContent)));
    const row = productHeader?.closest("tr");
    const table = row?.closest("table");
    if (!row || !table) return [];
    const index = Array.from(row.children).indexOf(productHeader);
    return Array.from(table.querySelectorAll("tr")).slice(1)
      .map((item) => {
        const cell = item.children[index];
        return clean(cell?.querySelector("input, textarea")?.value || cell?.textContent);
      })
      .filter((value) => value && !/^search/i.test(value))
      .filter((value, index, values) => values.indexOf(value) === index);
  }

  function captureQuoteContext() {
    const pageText = clean(document.body?.innerText);
    const quoteNumber = pageText.match(/\b(?:SFOR|NZSO)[- ]?\d+(?:-\d+)?\b/i)?.[0]?.replace(/\s+/g, "") || "";
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
        border: 1px solid #8da9cc !important;
        border-radius: 6px !important;
        overflow: hidden !important;
        background: #eef4fb !important;
        box-shadow: 0 12px 32px rgba(15, 46, 106, 0.16) !important;
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
        background: #eef4fb !important;
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
    const subjectQuote = subject.match(/\b(?:SFOR|NZSO)[- ]?\d+(?:-\d+)?\b/i)?.[0]?.replace(/\s+/g, "") || "";
    const sameQuote = !saved.quoteNumber || !subjectQuote
      || saved.quoteNumber.replace(/\D/g, "") === subjectQuote.replace(/\D/g, "");
    return {
      firstName: (sameQuote && saved.firstName)
        || displayName.split(/\s+/)[0]
        || greetingName.split(/\s+/)[0]
        || contactListName.split(/\s+/)[0]
        || "",
      quoteNumber: subjectQuote || saved.quoteNumber || "",
      product: sameQuote ? saved.product || "" : ""
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
    if (document.getElementById(LAYOUT_ID)) return true;
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
    if (frame.src !== url) frame.src = url;
    frame.addEventListener("load", () => sendContextToHelper(frame), { once: true });
    panel.hidden = false;
    buildThreeColumnLayout(panel);
    [500, 1400, 2800].forEach((delay) => setTimeout(() => sendContextToHelper(frame), delay));
  }

  function injectButton() {
    injectStyles();
    document.getElementById(BUTTON_ID)?.remove();
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
