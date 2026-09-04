// ==UserScript==
// @name         Gmail Omni Quote PDFs
// @namespace    https://livingculture.co.nz/
// @version      0.1.4
// @description  Selects downloaded Cin7 Omni quote PDFs and attaches them to Gmail drafts.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @match        https://go.cin7.com/Cloud/ShoppingCartAdmin/Orders/OrdersList.aspx*
// @match        https://mail.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      go.cin7.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-omni-quote-pdfs.user.js?v=0.1.4
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-omni-quote-pdfs.user.js?v=0.1.4
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  "use strict";

  const HISTORY_KEY = "lcGmailOmniQuotePdfHistoryV1";
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
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".pdf,application/pdf";
    picker.multiple = true;
    picker.style.display = "none";
    document.body.appendChild(picker);
    picker.addEventListener("change", () => {
      try {
        const selected = Array.from(picker.files || []);
        if (!selected.length) return;
        const files = selected.filter(isDownloadedOmniQuote);
        const rejected = selected.filter((file) => !isDownloadedOmniQuote(file));
        if (!files.length) {
          showPickerMessage("No Omni quote PDFs selected. Choose files named like SFOR38454-2.pdf.", true);
          return;
        }
        const localInputs = Array.from(composeRoot.querySelectorAll('input[type="file"]')).filter((input) => input !== picker);
        const inputs = localInputs.length
          ? localInputs
          : Array.from(document.querySelectorAll('input[type="file"]')).filter((input) => input !== picker);
        const gmailInput = inputs.reverse().find((input) => !input.disabled);
        if (!gmailInput) throw new Error("Gmail's attachment control was not found. Click the paperclip once, cancel it, then try Quote PDFs again.");
        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        gmailInput.files = transfer.files;
        gmailInput.dispatchEvent(new Event("input", { bubbles: true }));
        gmailInput.dispatchEvent(new Event("change", { bubbles: true }));
        showPickerMessage(`${files.length} Omni quote PDF${files.length === 1 ? "" : "s"} attached.${rejected.length ? ` ${rejected.length} non-Omni file${rejected.length === 1 ? " was" : "s were"} skipped.` : ""}`);
      } catch (error) {
        showPickerMessage(error.message || String(error), true);
      } finally {
        picker.remove();
      }
    }, { once: true });
    picker.click();
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
    const capture = () => {
      if (/\/Orders\/OrdersList\.aspx$/i.test(location.pathname)) saveQuoteContexts(quoteContextsFromDocument(document));
      else captureOmniQuote();
    };
    capture();
    let timer = 0;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(capture, 200);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  } else {
    bootGmail();
  }
})();
