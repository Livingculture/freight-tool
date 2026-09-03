// ==UserScript==
// @name         Gmail Living Culture HubSpot Attachments
// @namespace    https://livingculture.co.nz/
// @version      0.1.1
// @description  Uploads Gmail attachments to every HubSpot deal matching the SFOR quote numbers in the subject.
// @author       Living Culture
// @match        https://mail.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      living-culture-workflow.vercel.app
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-hubspot-attachments.user.js?v=0.1.1
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-hubspot-attachments.user.js?v=0.1.1
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  "use strict";

  const API_URL = "https://living-culture-workflow.vercel.app/api/hubspot/gmail-attachment";
  const TOOL_TOKEN = "fXlAMocbHnglrq02Vg4WZY0xbHaPsA+b";
  const QUOTE_RE = /\bSFOR\s*[-#]?\s*(\d{4,}(?:-\d+)?)\b/gi;
  const uploadedFiles = new WeakSet();
  const pendingFiles = new WeakSet();

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function visible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function quoteNumbers(input) {
    let root = input.closest('div[role="dialog"], div[role="listitem"]');
    if (!root) root = document.body;
    const subjects = Array.from(root.querySelectorAll('input[name="subjectbox"], input[placeholder="Subject"], input[aria-label="Subject"]'));
    const subject = subjects.find(visible)?.value || subjects.at(-1)?.value || "";
    return Array.from(new Set(Array.from(clean(subject).matchAll(QUOTE_RE))
      .map((match) => `SFOR${match[1]}`.toUpperCase())));
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

  function upload(file, quotes, attempt = 0) {
    const quoteLabel = quotes.join(", ");
    const form = new FormData();
    form.set("quoteNumbers", JSON.stringify(quotes));
    form.set("file", file, file.name);
    showStatus(`HubSpot: uploading ${file.name} to ${quoteLabel}…`);
    GM_xmlhttpRequest({
      method: "POST",
      url: API_URL,
      headers: { Accept: "application/json", "x-lc-token": TOOL_TOKEN },
      data: form,
      timeout: 90000,
      onload(response) {
        let payload = {};
        try { payload = JSON.parse(response.responseText || "{}"); } catch {}
        if (response.status >= 200 && response.status < 300 && payload.ok) {
          uploadedFiles.add(file);
          pendingFiles.delete(file);
          const count = Array.isArray(payload.deals) ? payload.deals.length : 0;
          const missing = Array.isArray(payload.missingQuoteNumbers) && payload.missingQuoteNumbers.length
            ? ` Missing: ${payload.missingQuoteNumbers.join(", ")}.`
            : "";
          showStatus(`HubSpot: ${file.name} added to ${count} deal${count === 1 ? "" : "s"}.${missing}`, missing ? "error" : "done");
          return;
        }
        if ((response.status === 404 || response.status >= 500) && attempt < 2) {
          setTimeout(() => upload(file, quotes, attempt + 1), 4000 * (attempt + 1));
          return;
        }
        pendingFiles.delete(file);
        showStatus(payload.error || `HubSpot attachment failed (${response.status}).`, "error");
      },
      ontimeout() {
        if (attempt < 2) setTimeout(() => upload(file, quotes, attempt + 1), 4000 * (attempt + 1));
        else {
          pendingFiles.delete(file);
          showStatus(`HubSpot timed out while uploading ${file.name}.`, "error");
        }
      },
      onerror() {
        pendingFiles.delete(file);
        showStatus(`Could not connect to HubSpot for ${file.name}.`, "error");
      }
    });
  }

  function capture(input) {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const quotes = quoteNumbers(input);
    if (!quotes.length) {
      showStatus("HubSpot: no SFOR quote numbers were found in the Gmail subject.", "error");
      return;
    }
    files.forEach((file) => {
      if (uploadedFiles.has(file) || pendingFiles.has(file)) return;
      pendingFiles.add(file);
      upload(file, quotes);
    });
  }

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === "file") capture(input);
  }, true);
})();
