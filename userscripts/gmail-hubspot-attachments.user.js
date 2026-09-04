// ==UserScript==
// @name         Gmail Living Culture HubSpot Attachments
// @namespace    https://livingculture.co.nz/
// @version      0.1.4
// @description  Uploads Gmail attachments to the customer HubSpot deals referenced by the subject and attached quotes.
// @author       Living Culture
// @match        https://mail.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      living-culture-workflow.vercel.app
// @connect      *.supabase.co
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-hubspot-attachments.user.js?v=0.1.4
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-hubspot-attachments.user.js?v=0.1.4
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  "use strict";

  const API_URL = "https://living-culture-workflow.vercel.app/api/hubspot/gmail-attachment";
  const TOOL_TOKEN = "fXlAMocbHnglrq02Vg4WZY0xbHaPsA+b";
  const QUOTE_RE = /\bSFOR\s*[-#]?\s*(\d{4,}(?:-\d+)?)\b/gi;
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
      .map((match) => `SFOR${match[1]}`.toUpperCase())));
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
      GM_xmlhttpRequest({
        ...options,
        timeout: 90000,
        onload(response) {
          let payload = {};
          try { payload = JSON.parse(response.responseText || "{}"); } catch {}
          if (response.status >= 200 && response.status < 300) resolve(payload);
          else reject(new Error(errorMessage(payload, `Upload failed (${response.status}).`)));
        },
        ontimeout() { reject(new Error("The upload timed out.")); },
        onerror() { reject(new Error("Could not connect to the attachment service.")); }
      });
    });
  }

  async function upload(state, key, file, quote, attempt = 0) {
    showStatus(`HubSpot: uploading ${file.name} to ${quote}…`);
    try {
      const prepared = await requestJson({
        method: "POST", url: API_URL,
        headers: { "Content-Type": "application/json", Accept: "application/json", "x-lc-token": TOOL_TOKEN },
        data: JSON.stringify({ action: "prepare", fileName: file.name, fileType: file.type, fileSize: file.size })
      });
      if (!prepared.ok || !prepared.signedUrl || !prepared.storagePath) throw new Error(errorMessage(prepared, "Could not prepare the upload."));

      const stagingForm = new FormData();
      stagingForm.append("cacheControl", "3600");
      stagingForm.append("", file, file.name);
      await requestJson({ method: "PUT", url: prepared.signedUrl, data: stagingForm });

      const payload = await requestJson({
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
    if (!allQuotes.length) {
      showStatus("HubSpot: no SFOR quote numbers were found in the Gmail subject.", "error");
      return;
    }

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
