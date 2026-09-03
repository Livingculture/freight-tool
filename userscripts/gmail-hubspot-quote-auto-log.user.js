// ==UserScript==
// @name         Gmail Living Culture HubSpot Quote Auto Log
// @namespace    https://livingculture.co.nz/
// @version      0.1.2
// @description  Finds an SFOR quote number in a Gmail draft and automatically selects its matching HubSpot deals for logging.
// @author       Living Culture
// @match        https://mail.google.com/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-hubspot-quote-auto-log.user.js?v=0.1.2
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-hubspot-quote-auto-log.user.js?v=0.1.2
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  "use strict";

  const QUOTE_RE = /\bSFOR\s*[-#]?\s*(\d{4,}(?:-\d+)?)\b/i;
  const processed = new WeakMap();
  let scanTimer = 0;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function subjectFields() {
    return Array.from(document.querySelectorAll('input[name="subjectbox"], input[placeholder="Subject"], input[aria-label="Subject"]')).filter(visible);
  }

  function composeRootFor(subject) {
    let node = subject;
    while (node && node !== document.body) {
      const hasBody = node.querySelector?.('div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][contenteditable="true"], div[g_editable="true"][contenteditable="true"]');
      const hasLog = /\bLog(?:\s+\d+\s*\/\s*\d+)?\b/i.test(clean(node.innerText));
      if (hasBody && hasLog) return node;
      node = node.parentElement;
    }
    return subject.closest('div[role="dialog"], div[role="listitem"]') || document.body;
  }

  function composeRoots() {
    return Array.from(new Set(subjectFields().map(composeRootFor)));
  }

  function quoteNumber(root) {
    const subject = Array.from(root.querySelectorAll('input[name="subjectbox"], input[placeholder="Subject"], input[aria-label="Subject"]'))
      .find(visible)?.value || "";
    const match = clean(subject).match(QUOTE_RE);
    return match ? `SFOR${match[1]}`.toUpperCase() : "";
  }

  function textElements(root, pattern) {
    return Array.from(root.querySelectorAll("button, label, span, div"))
      .filter((element) => visible(element) && pattern.test(clean(element.textContent)));
  }

  function showStatus(message, intent = "working") {
    let toast = document.getElementById("lc-hubspot-auto-log-status");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lc-hubspot-auto-log-status";
      Object.assign(toast.style, {
        position: "fixed", right: "22px", bottom: "72px", zIndex: "2147483647",
        padding: "9px 13px", borderRadius: "7px", color: "#fff", font: "600 13px Arial, sans-serif",
        boxShadow: "0 5px 18px rgba(0,0,0,.22)"
      });
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = intent === "error" ? "#b42318" : intent === "done" ? "#087f8c" : "#ff5c35";
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.remove(), intent === "working" ? 5000 : 3500);
  }

  function waitFor(find, timeout = 8000, interval = 120) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const result = find();
        if (result) return resolve(result);
        if (Date.now() - started >= timeout) return resolve(null);
        setTimeout(check, interval);
      };
      check();
    });
  }

  function setReactInput(input, value) {
    const previous = input.value;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    if (input._valueTracker) input._valueTracker.setValue(previous);
    input.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.at(-1) || "", code: "KeyR" }));
  }

  function checkedState(row) {
    const input = row.querySelector('input[type="checkbox"]');
    if (input) return input.checked;
    const checkbox = row.querySelector('[role="checkbox"]');
    if (checkbox) return checkbox.getAttribute("aria-checked") === "true";
    return row.getAttribute("aria-selected") === "true" || /\bselected\b/i.test(row.getAttribute("class") || "");
  }

  function clickCheckbox(row) {
    const control = row.querySelector('input[type="checkbox"], [role="checkbox"]');
    (control || row).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function matchingDealRows(quote, search) {
    const panel = search.ownerDocument?.body || document.body;
    return Array.from(panel.querySelectorAll("label, [role=option], li, div"))
      .filter((row) => {
        if (!visible(row)) return false;
        const text = clean(row.textContent).toUpperCase();
        if (!text.includes(quote)) return false;
        if (/SEARCH DEALS/.test(text)) return false;
        return Boolean(row.querySelector('input[type="checkbox"], [role="checkbox"]'));
      })
      .sort((left, right) => (left.getBoundingClientRect().width * left.getBoundingClientRect().height)
        - (right.getBoundingClientRect().width * right.getBoundingClientRect().height));
  }

  async function openHubSpotPicker(root) {
    const logLabels = textElements(root, /^Log(?:\s+\d+\s*\/\s*\d+)?$/i);
    if (!logLabels.length) return null;

    const logLabel = logLabels.at(-1);
    const toolbarArea = logLabel.closest("button, label") || logLabel.parentElement || logLabel;
    const nativeCheckbox = toolbarArea.querySelector('input[type="checkbox"]')
      || toolbarArea.parentElement?.querySelector('input[type="checkbox"]');
    if (nativeCheckbox && !nativeCheckbox.checked) nativeCheckbox.click();

    logLabel.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    let search = await waitFor(() => Array.from(document.querySelectorAll('input[placeholder="Search Deals"]')).find(visible), 2500);
    if (search) return search;

    const parent = logLabel.parentElement;
    const clickTargets = parent ? Array.from(parent.querySelectorAll("button, [role=button], svg")) : [];
    for (const target of clickTargets.reverse()) {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      search = await waitFor(() => Array.from(document.querySelectorAll('input[placeholder="Search Deals"]')).find(visible), 650);
      if (search) return search;
    }
    return null;
  }

  async function associate(root, quote) {
    showStatus(`HubSpot: finding ${quote}…`);
    const search = await openHubSpotPicker(root);
    if (!search) {
      showStatus("HubSpot Log control was not found.", "error");
      return false;
    }

    search.focus();
    setReactInput(search, quote);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (clean(search.value).toUpperCase() !== quote) {
      search.focus();
      search.select?.();
      document.execCommand("insertText", false, quote);
    }
    const rows = await waitFor(() => {
      const found = matchingDealRows(quote, search);
      return found.length ? found : null;
    });
    if (!rows) {
      showStatus(`No HubSpot deal found for ${quote}.`, "error");
      return false;
    }

    const controls = new Set();
    const uniqueRows = rows.filter((row) => {
      const control = row.querySelector('input[type="checkbox"], [role="checkbox"]');
      if (!control || controls.has(control)) return false;
      controls.add(control);
      return true;
    });
    uniqueRows.forEach((row) => {
      if (!checkedState(row)) clickCheckbox(row);
    });
    showStatus(`HubSpot: ${uniqueRows.length} deal${uniqueRows.length === 1 ? "" : "s"} selected for ${quote}.`, "done");
    return uniqueRows.length > 0;
  }

  async function scan() {
    for (const root of composeRoots()) {
      const quote = quoteNumber(root);
      if (!quote || processed.get(root) === quote) continue;
      processed.set(root, quote);
      const success = await associate(root, quote);
      if (!success) processed.delete(root);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 500);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("input", scheduleScan, true);
  window.setInterval(scheduleScan, 3000);
  scheduleScan();
})();
