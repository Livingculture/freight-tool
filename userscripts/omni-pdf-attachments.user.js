// ==UserScript==
// @name         Omni Living Culture PDF Attachments
// @namespace    livingculture-omni
// @version      0.4.9
// @description  Selects Living Culture Google Drive PDFs and loads them into the Cin7 Omni email attachment fields.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/CRM/ContactLog.aspx*
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @match        https://living-culture-email-helper.vercel.app/*
// @grant        GM_xmlhttpRequest
// @connect      go.cin7.com
// @connect      cin7-pdf-attachments.vercel.app
// @connect      drive.google.com
// @connect      drive.usercontent.google.com
// @connect      github.com
// @connect      release-assets.githubusercontent.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pdf-attachments.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pdf-attachments.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  "use strict";

  const API_BASE = "https://cin7-pdf-attachments.vercel.app";
  const TOOL_TOKEN = "fXlAMocbHnglrq02Vg4WZY0xbHaPsA+b";
  const HOST_ID = "lc-omni-pdf-attachments-host";
  const BUTTON_ID = "lc-omni-pdf-attachments-button";
  const PANEL_ID = "lc-omni-pdf-attachments-panel";
  const DRAWINGS_BUTTON_ID = "lc-omni-drawings-button";
  const QUOTE_BUTTON_ID = "lc-omni-quote-pdf-button";
  const DRAWINGS_PANEL_ID = "lc-omni-drawings-panel";
  const STYLE_ID = "lc-omni-pdf-attachments-styles";
  const HELPER_ORIGIN = "https://living-culture-email-helper.vercel.app";
  const OMNI_ORIGIN = "https://go.cin7.com";
  const CACHE_KEY = "lc-omni-pdf-files-v1";
  const CACHE_MAX_AGE = 5 * 60 * 1000;
  const QUOTE_CONTEXT_KEY = "lcOmniQuotePdfContextV1";
  const QUOTE_HISTORY_KEY = "lcOmniQuotePdfHistoryV1";
  const DRAWINGS_ROOT_ID = "1Tcxn7LceZztaoWUmgsNZgml18s2LZORj";
  const OPTIMIZED_CARE_BASE = "https://github.com/Livingculture/freight-tool/releases/download/care-guides-email-v1";
  const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
  const state = { files: [], selected: new Set(), loaded: false, loadingList: false, preparing: false, busy: false, status: "", statusError: false };
  const drawingState = { levels: [], selected: new Set(), loaded: false, loading: false, preparing: false, busy: false, status: "", statusError: false };
  let quoteBusy = false;
  const downloadCache = new Map();
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

  function request(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url,
        headers: options.headers || {},
        responseType: options.responseType || "text",
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            const error = new Error(`Attachment service returned HTTP ${response.status}.`);
            error.status = response.status;
            reject(error);
            return;
          }
          resolve(response);
        },
        onerror() {
          reject(new Error("Could not reach the PDF attachment service."));
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

  async function loadDriveFolder(folderId) {
    const response = await request(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?usp=sharing`);
    const match = String(response.responseText || "").match(/window\['_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'])*)'/s);
    if (!match) throw new Error("The Drawings folder could not be read. Check its Google Drive sharing permissions.");
    const payload = JSON.parse(decodeDriveString(match[1]));
    const items = Array.isArray(payload?.[0]) ? payload[0] : [];
    return {
      folders: items
        .filter((item) => item?.[3] === DRIVE_FOLDER_MIME)
        .map((item) => ({ id: item[0], name: clean(item[2]) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      files: items
        .filter((item) => item?.[3] === "application/pdf" || /\.pdf$/i.test(item?.[2] || ""))
        .map((item) => ({
          id: item[0],
          name: clean(item[2]),
          downloadUrl: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(item[0])}&export=download&confirm=t`
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    };
  }

  async function loadDrawingLevel(folderId, replaceFrom = 0) {
    if (drawingState.loading) return;
    drawingState.loading = true;
    drawingState.status = "";
    drawingState.statusError = false;
    renderDrawings();
    try {
      const contents = await loadDriveFolder(folderId);
      drawingState.levels.splice(replaceFrom, drawingState.levels.length, {
        folderId,
        folders: contents.folders,
        files: contents.files,
        selectedFolderId: ""
      });
      drawingState.selected.clear();
      drawingState.loaded = true;
    } catch (error) {
      setDrawingStatus(error.message, true);
    } finally {
      drawingState.loading = false;
      renderDrawings();
    }
  }

  async function chooseDrawingFolder(levelIndex, folderId) {
    const level = drawingState.levels[levelIndex];
    if (!level) return;
    level.selectedFolderId = folderId;
    drawingState.levels.splice(levelIndex + 1);
    drawingState.selected.clear();
    if (folderId) await loadDrawingLevel(folderId, levelIndex + 1);
    else renderDrawings();
  }

  async function loadFiles() {
    if (state.loadingList) return;
    state.loadingList = true;
    state.status = "";
    state.statusError = false;
    render();
    try {
      const response = await request(`${API_BASE}/api/email-links`, {
        headers: { Accept: "application/json", "x-lc-token": TOOL_TOKEN }
      });
      const payload = JSON.parse(response.responseText || "{}");
      state.files = Array.isArray(payload.files) ? payload.files : [];
      state.loaded = true;
      state.selected.clear();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), files: state.files }));
      } catch (_) {}
    } catch (error) {
      state.loaded = true;
      setStatus(error.message, true);
    } finally {
      state.loadingList = false;
      render();
    }
  }

  function restoreCachedFiles() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!cached || !Array.isArray(cached.files) || Date.now() - Number(cached.savedAt || 0) > CACHE_MAX_AGE) return false;
      state.files = cached.files;
      state.loaded = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function visibleFileInputs() {
    return Array.from(document.querySelectorAll("input[type='file']")).filter((input) => {
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return !input.disabled && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
  }

  function availableFileInputs() {
    return visibleFileInputs().filter((input) => !input.files?.length);
  }

  function setStatus(message, error = false) {
    state.status = message;
    state.statusError = error;
    const status = document.querySelector("#lc-omni-pdf-attachments-status");
    if (!status) return;
    const text = status.querySelector("span:last-child");
    if (text) text.textContent = message;
    else status.textContent = message;
    status.classList.toggle("is-error", error);
  }

  function selectedFiles() {
    return state.files.filter((file) => state.selected.has(file.id));
  }

  function currentDrawingFiles() {
    return drawingState.levels.at(-1)?.files || [];
  }

  function selectedDrawingFiles() {
    return currentDrawingFiles().filter((file) => drawingState.selected.has(file.id));
  }

  function cachedDownload(key, factory) {
    if (!downloadCache.has(key)) {
      const promise = Promise.resolve().then(factory).catch((error) => {
        downloadCache.delete(key);
        throw error;
      });
      downloadCache.set(key, promise);
    }
    return downloadCache.get(key);
  }

  function setDrawingStatus(message, error = false) {
    drawingState.status = message;
    drawingState.statusError = error;
    const status = document.querySelector("#lc-omni-drawings-status");
    if (!status) return;
    const text = status.querySelector("span:last-child");
    if (text) text.textContent = message;
    else status.textContent = message;
    status.classList.toggle("is-error", error);
  }

  async function downloadFile(file) {
    return cachedDownload(`care:${file.id}`, () => downloadCareGuide(file));
  }

  async function downloadCareGuide(file) {
    try {
      const optimized = await request(`${OPTIMIZED_CARE_BASE}/${encodeURIComponent(file.id)}.pdf`, { responseType: "arraybuffer" });
      return new File([optimized.response], clean(file.name) || "Living Culture document.pdf", {
        type: "application/pdf",
        lastModified: Date.now()
      });
    } catch (_) {
      // Fall back to the original attachment service if an optimised copy is unavailable.
    }
    const options = { responseType: "arraybuffer", headers: { "x-lc-token": TOOL_TOKEN } };
    let response;
    try {
      response = await request(file.downloadUrl, options);
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) throw error;
      const listResponse = await request(`${API_BASE}/api/email-links`, {
        headers: { Accept: "application/json", "x-lc-token": TOOL_TOKEN }
      });
      const freshFiles = JSON.parse(listResponse.responseText || "{}").files || [];
      const freshFile = freshFiles.find((item) => item.id === file.id);
      if (!freshFile?.downloadUrl) throw error;
      state.files = freshFiles;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), files: freshFiles }));
      response = await request(freshFile.downloadUrl, options);
    }
    return new File([response.response], clean(file.name) || "Living Culture document.pdf", {
      type: "application/pdf",
      lastModified: Date.now()
    });
  }

  async function downloadDrawing(file) {
    return cachedDownload(`drawing:${file.id}`, async () => {
      const response = await request(file.downloadUrl, { responseType: "arraybuffer" });
      return new File([response.response], clean(file.name) || "Living Culture drawing.pdf", {
        type: "application/pdf",
        lastModified: Date.now()
      });
    });
  }

  async function prepareCareGuides() {
    const files = selectedFiles();
    if (!files.length) return;
    state.preparing = true;
    state.status = "Preparing selected Care Guides…";
    state.statusError = false;
    render();
    try {
      await Promise.all(files.map(downloadFile));
      state.status = "Selected Care Guides are ready to add.";
    } catch (error) {
      state.status = error.message;
      state.statusError = true;
    } finally {
      state.preparing = false;
      render();
    }
  }

  async function prepareDrawing() {
    const files = selectedDrawingFiles();
    if (!files.length) return;
    drawingState.preparing = true;
    drawingState.status = "Preparing selected drawing…";
    drawingState.statusError = false;
    renderDrawings();
    try {
      await Promise.all(files.map(downloadDrawing));
      drawingState.status = "Selected drawing is ready to add.";
    } catch (error) {
      drawingState.status = error.message;
      drawingState.statusError = true;
    } finally {
      drawingState.preparing = false;
      renderDrawings();
    }
  }

  function assignFile(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function extractQuoteNumber(value) {
    return clean(value).match(/\bSFOR\d+(?:-[A-Z0-9]+)?\b/i)?.[0]?.toUpperCase() || "";
  }

  function numericIdsFromUrl(value) {
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

  function captureQuotePdfContext() {
    const quoteNumber = extractQuoteNumber(document.body?.innerText || document.title || "");
    if (!quoteNumber) return;
    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter((link) => /go to admin|quote/i.test(clean(link.textContent)))
      .map((link) => link.href);
    const hiddenIds = Array.from(document.querySelectorAll('input[type="hidden"]'))
      .filter((input) => /(?:^|_)(?:sid|transactionid|saleid|orderid|id)$/i.test(input.name || input.id || ""))
      .map((input) => clean(input.value))
      .filter((value) => /^\d{6,}$/.test(value));
    const sids = Array.from(new Set([
      ...numericIdsFromUrl(location.href),
      ...links.flatMap(numericIdsFromUrl),
      ...hiddenIds
    ]));
    const context = { quoteNumber, sids, savedAt: Date.now() };
    localStorage.setItem(QUOTE_CONTEXT_KEY, JSON.stringify(context));
    try {
      const history = JSON.parse(localStorage.getItem(QUOTE_HISTORY_KEY) || "[]");
      const updated = [context, ...(Array.isArray(history) ? history : [])
        .filter((item) => extractQuoteNumber(item?.quoteNumber) !== quoteNumber)]
        .slice(0, 20);
      localStorage.setItem(QUOTE_HISTORY_KEY, JSON.stringify(updated));
    } catch (_) {
      localStorage.setItem(QUOTE_HISTORY_KEY, JSON.stringify([context]));
    }
  }

  function quotePdfContext() {
    try {
      const context = JSON.parse(localStorage.getItem(QUOTE_CONTEXT_KEY) || "null");
      if (!context || !extractQuoteNumber(context.quoteNumber) || !Array.isArray(context.sids)) return null;
      return { quoteNumber: extractQuoteNumber(context.quoteNumber), sids: context.sids.filter((value) => /^\d{6,}$/.test(clean(value))) };
    } catch (_) {
      return null;
    }
  }

  function quotePdfHistory() {
    const current = quotePdfContext();
    try {
      const history = JSON.parse(localStorage.getItem(QUOTE_HISTORY_KEY) || "[]");
      const contexts = [current, ...(Array.isArray(history) ? history : [])].filter(Boolean);
      const seen = new Set();
      return contexts.filter((context) => {
        const quoteNumber = extractQuoteNumber(context.quoteNumber);
        if (!quoteNumber || seen.has(quoteNumber) || !Array.isArray(context.sids) || !context.sids.length) return false;
        seen.add(quoteNumber);
        context.quoteNumber = quoteNumber;
        context.sids = context.sids.filter((value) => /^\d{6,}$/.test(clean(value)));
        return context.sids.length > 0;
      });
    } catch (_) {
      return current ? [current] : [];
    }
  }

  function chooseQuotePdfs(contexts, maximum) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "lc-omni-quote-picker";
      overlay.innerHTML = `
        <div class="lc-omni-quote-picker-card">
          <h3>Add Quote PDFs</h3>
          <p>Select up to ${maximum} quote${maximum === 1 ? "" : "s"}. Open a quote in Omni first if it is not listed.</p>
          <div class="lc-omni-quote-picker-list">
            ${contexts.map((context, index) => `<label><input type="checkbox" value="${index}" ${index === 0 ? "checked" : ""}> <span>${escapeHtml(context.quoteNumber)}</span></label>`).join("")}
          </div>
          <div class="lc-omni-quote-picker-actions">
            <button type="button" data-cancel>Cancel</button>
            <button type="button" data-add>Add to email</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const finish = (value) => {
        overlay.remove();
        resolve(value);
      };
      overlay.querySelector("[data-cancel]").addEventListener("click", () => finish([]));
      overlay.querySelector("[data-add]").addEventListener("click", () => {
        const selected = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked'))
          .map((input) => contexts[Number(input.value)])
          .filter(Boolean);
        if (!selected.length) return;
        if (selected.length > maximum) {
          window.alert(`Choose ${maximum} quote${maximum === 1 ? "" : "s"} or fewer.`);
          return;
        }
        finish(selected);
      });
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finish([]);
      });
    });
  }

  function isPdf(buffer) {
    const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
    return bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
  }

  async function addQuotePdf() {
    const contexts = quotePdfHistory();
    if (!contexts.length) {
      window.alert("Open the quote screen once, then return to its email screen and try Quote PDF again.");
      return;
    }
    const inputs = availableFileInputs();
    if (!inputs.length) {
      window.alert("Omni has no empty attachment field available.");
      return;
    }
    const selectedContexts = await chooseQuotePdfs(contexts, inputs.length);
    if (!selectedContexts.length) return;
    quoteBusy = true;
    const button = document.getElementById(QUOTE_BUTTON_ID);
    if (button) {
      button.disabled = true;
      button.textContent = "Loading Quote…";
    }
    try {
      for (let index = 0; index < selectedContexts.length; index += 1) {
        const context = selectedContexts[index];
        let pdfResponse = null;
        for (const sid of context.sids) {
          const url = `https://go.cin7.com/Cloud/Docs/PDF/?T=Quote&idWebSite=27265&UN=vi&ID=363&SID=${encodeURIComponent(sid)}`;
          try {
            const response = await request(url, { responseType: "arraybuffer" });
            if (isPdf(response.response)) {
              pdfResponse = response;
              break;
            }
          } catch (_) {}
        }
        if (!pdfResponse) throw new Error(`Cin7 could not generate the PDF for ${context.quoteNumber}.`);
        assignFile(inputs[index], new File([pdfResponse.response], `${context.quoteNumber}.pdf`, {
          type: "application/pdf",
          lastModified: Date.now()
        }));
      }
      if (button) button.textContent = selectedContexts.length === 1 ? "Quote Added" : "Quotes Added";
    } catch (error) {
      window.alert(error.message || "The quote PDF could not be added.");
      if (button) button.textContent = "Quote PDF";
    } finally {
      quoteBusy = false;
      if (button) button.disabled = false;
    }
  }

  async function addSelected() {
    const files = selectedFiles();
    if (!files.length) return;
    if (files.length > 2) {
      setStatus("Omni has two attachment fields. Choose two PDFs or fewer.", true);
      return;
    }

    state.busy = true;
    render();
    setStatus("Loading selected PDFs into Omni...");
    try {
      const downloaded = await Promise.all(files.map(downloadFile));
      if (location.origin === OMNI_ORIGIN) {
        const inputs = availableFileInputs();
        if (downloaded.length > inputs.length) throw new Error(`Omni has ${inputs.length} empty attachment field${inputs.length === 1 ? "" : "s"}.`);
        downloaded.forEach((file, index) => assignFile(inputs[index], file));
        state.selected.clear();
        setStatus(`${downloaded.length} PDF${downloaded.length === 1 ? "" : "s"} added to the Omni email.`);
      } else {
        window.parent.postMessage({ type: "LC_OMNI_PDF_FILES", files: downloaded }, OMNI_ORIGIN);
        setStatus("Adding selected PDFs to Omni...");
      }
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function addSelectedDrawings() {
    const files = selectedDrawingFiles();
    if (!files.length) return;
    if (files.length > 2) {
      setDrawingStatus("Omni has two attachment fields. Choose two drawings or fewer.", true);
      return;
    }
    drawingState.busy = true;
    renderDrawings();
    setDrawingStatus("Loading selected drawings into Omni...");
    try {
      const downloaded = await Promise.all(files.map(downloadDrawing));
      const inputs = availableFileInputs();
      if (downloaded.length > inputs.length) throw new Error(`Omni has ${inputs.length} empty attachment field${inputs.length === 1 ? "" : "s"}.`);
      downloaded.forEach((file, index) => assignFile(inputs[index], file));
      drawingState.selected.clear();
      setDrawingStatus(`${downloaded.length} drawing${downloaded.length === 1 ? "" : "s"} added to the Omni email.`);
    } catch (error) {
      setDrawingStatus(error.message, true);
    } finally {
      drawingState.busy = false;
      renderDrawings();
    }
  }

  function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const launchButton = document.getElementById(BUTTON_ID);
    if (launchButton) launchButton.innerHTML = state.loadingList
      ? '<span class="lc-omni-pdf-spinner" aria-hidden="true"></span> Loading Care Guides…'
      : "Care Guides";
    const slots = 2;
    const rows = state.loadingList && !state.loaded
      ? '<div class="lc-omni-pdf-loading"><span class="lc-omni-pdf-spinner" aria-hidden="true"></span><span>Loading Care Guides…</span></div>'
      : state.loaded
      ? state.files.map((file) => `
          <label class="lc-omni-pdf-row">
            <input type="checkbox" value="${escapeHtml(file.id)}" ${state.selected.has(file.id) ? "checked" : ""}>
            <span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          </label>`).join("") || '<div class="lc-omni-pdf-empty">No PDFs found.</div>'
      : '<div class="lc-omni-pdf-empty">PDF list is not loaded yet.</div>';
    panel.innerHTML = `
      <div class="lc-omni-pdf-summary">Choose up to ${slots} PDF${slots === 1 ? "" : "s"}</div>
      <div class="lc-omni-pdf-list">${rows}</div>
      <div class="lc-omni-pdf-actions">
        <button type="button" data-action="refresh" ${state.loadingList ? "disabled" : ""}>${state.loadingList ? "Refreshing…" : "Refresh"}</button>
        <button type="button" data-action="add" ${state.busy || state.loadingList || !state.selected.size ? "disabled" : ""}>${state.busy ? '<span class="lc-omni-pdf-spinner" aria-hidden="true"></span> Adding…' : "Add to email"}</button>
      </div>
      <div id="lc-omni-pdf-attachments-status" class="${state.statusError ? "is-error" : ""}">${state.preparing || state.busy ? '<span class="lc-omni-pdf-spinner" aria-hidden="true"></span>' : ""}<span>${escapeHtml(state.status)}</span></div>`;

    panel.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.selected.add(input.value);
        else state.selected.delete(input.value);
        render();
        if (input.checked) prepareCareGuides();
      });
    });
    panel.querySelector('[data-action="refresh"]')?.addEventListener("click", loadFiles);
    panel.querySelector('[data-action="add"]')?.addEventListener("click", addSelected);
  }

  function drawingLevelLabel(index, folders = []) {
    if (index === 0) return "Pergola";
    if (index === 1) return "Type";
    if (folders.length && folders.every((folder) => /\b(manual|motorised|motorized)\b/i.test(folder.name))) return "Operation";
    if (folders.length && folders.every((folder) => /\d+(?:\.\d+)?\s*[x×]\s*\d/i.test(folder.name))) return "Size";
    if (index === 2) return "Type";
    return "Folder";
  }

  function customDropdown({ label, placeholder, options, value, level, file = false }) {
    const selected = options.find((option) => option.id === value);
    return `
      <div class="lc-omni-drawing-select">
        <span>${escapeHtml(label)}</span>
        <div class="lc-omni-custom-select" ${file ? "data-file-select" : `data-level-select="${level}"`}>
          <button type="button" class="lc-omni-select-trigger" aria-haspopup="listbox" aria-expanded="false">
            <span>${escapeHtml(selected?.name || placeholder)}</span><i aria-hidden="true"></i>
          </button>
          <div class="lc-omni-select-menu" role="listbox">
            <button type="button" class="lc-omni-select-option${value ? "" : " is-selected"}" data-value="" role="option">${escapeHtml(placeholder)}</button>
            ${options.map((option) => `<button type="button" class="lc-omni-select-option${value === option.id ? " is-selected" : ""}" data-value="${escapeHtml(option.id)}" role="option">${escapeHtml(option.name)}</button>`).join("")}
          </div>
        </div>
      </div>`;
  }

  function renderDrawings() {
    const panel = document.getElementById(DRAWINGS_PANEL_ID);
    if (!panel) return;
    const launchButton = document.getElementById(DRAWINGS_BUTTON_ID);
    if (launchButton) launchButton.innerHTML = drawingState.loading && !drawingState.loaded
      ? '<span class="lc-omni-pdf-spinner" aria-hidden="true"></span> Loading Drawings…'
      : "Drawings";
    const selectors = drawingState.levels.map((level, index) => {
      const label = drawingLevelLabel(index, level.folders);
      return level.folders.length
      ? customDropdown({
          label,
          placeholder: `Select ${label.toLowerCase()}…`,
          options: level.folders,
          value: level.selectedFolderId,
          level: index
        })
      : "";
    }).join("");
    const files = currentDrawingFiles();
    const selectedDrawingId = Array.from(drawingState.selected)[0] || "";
    const rows = drawingState.loading
      ? '<div class="lc-omni-pdf-loading"><span class="lc-omni-pdf-spinner" aria-hidden="true"></span><span>Loading folder…</span></div>'
      : files.length
        ? `<div class="lc-omni-drawing-file-choice">${customDropdown({
            label: "Size",
            placeholder: "Select size…",
            options: files.map((file) => ({ ...file, name: file.name.replace(/\.pdf$/i, "") })),
            value: selectedDrawingId,
            file: true
          })}</div>`
        : drawingState.loaded && !drawingState.levels.at(-1)?.folders.length
          ? '<div class="lc-omni-pdf-empty">No PDF drawings found in this folder.</div>'
          : '<div class="lc-omni-pdf-empty">Choose each folder to find its drawings.</div>';
    panel.innerHTML = `
      <div class="lc-omni-pdf-summary">Select pergola, type and size</div>
      <div class="lc-omni-drawing-selectors">${selectors}</div>
      <div class="lc-omni-pdf-list">${rows}</div>
      <div class="lc-omni-pdf-actions">
        <button type="button" data-action="drawing-refresh" ${drawingState.loading ? "disabled" : ""}>Refresh</button>
        <button type="button" data-action="drawing-add" ${drawingState.busy || drawingState.loading || !drawingState.selected.size ? "disabled" : ""}>${drawingState.busy ? '<span class="lc-omni-pdf-spinner" aria-hidden="true"></span> Adding…' : "Add to email"}</button>
      </div>
      <div id="lc-omni-drawings-status" class="${drawingState.statusError ? "is-error" : ""}">${drawingState.preparing || drawingState.busy ? '<span class="lc-omni-pdf-spinner" aria-hidden="true"></span>' : ""}<span>${escapeHtml(drawingState.status)}</span></div>`;
    panel.querySelectorAll(".lc-omni-select-trigger").forEach((button) => {
      button.addEventListener("click", () => {
        const select = button.closest(".lc-omni-custom-select");
        const opening = !select.classList.contains("is-open");
        panel.querySelectorAll(".lc-omni-custom-select.is-open").forEach((other) => {
          other.classList.remove("is-open");
          other.querySelector(".lc-omni-select-trigger")?.setAttribute("aria-expanded", "false");
        });
        select.classList.toggle("is-open", opening);
        button.setAttribute("aria-expanded", String(opening));
      });
    });
    panel.querySelectorAll(".lc-omni-select-option").forEach((option) => {
      option.addEventListener("click", () => {
        const select = option.closest(".lc-omni-custom-select");
        const value = option.dataset.value || "";
        if (select.hasAttribute("data-file-select")) {
          drawingState.selected.clear();
          if (value) drawingState.selected.add(value);
          renderDrawings();
          if (value) prepareDrawing();
          return;
        }
        chooseDrawingFolder(Number(select.dataset.levelSelect), value);
      });
    });
    panel.querySelector('[data-action="drawing-refresh"]')?.addEventListener("click", () => loadDrawingLevel(DRAWINGS_ROOT_ID, 0));
    panel.querySelector('[data-action="drawing-add"]')?.addEventListener("click", addSelectedDrawings);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${HOST_ID} { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; margin-top: 24px; }
      #${BUTTON_ID}, #${DRAWINGS_BUTTON_ID}, #${QUOTE_BUTTON_ID} { min-height: 40px; border: 1px solid #8da9cc; border-radius: 6px; background: #fff; color: #0b3978; padding: 0 16px; font: 700 14px Arial,sans-serif; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
      #${BUTTON_ID}:hover, #${DRAWINGS_BUTTON_ID}:hover, #${QUOTE_BUTTON_ID}:hover { background: #eef4fb; }
      #${QUOTE_BUTTON_ID} { border-color: #e2a900; background: #f7c948; color: #fff; }
      #${QUOTE_BUTTON_ID}:hover { background: #eebc2e; }
      #${QUOTE_BUTTON_ID}:disabled { opacity: .65; cursor: wait; }
      #lc-omni-quote-picker { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: rgba(9,30,66,.5); }
      .lc-omni-quote-picker-card { width: 430px; max-width: calc(100vw - 40px); max-height: calc(100vh - 50px); overflow: auto; padding: 20px; border-radius: 10px; background: #fff; color: #172b49; box-shadow: 0 18px 50px rgba(0,0,0,.28); font: 14px Arial,sans-serif; }
      .lc-omni-quote-picker-card h3 { margin: 0 0 8px; font-size: 21px; }
      .lc-omni-quote-picker-card p { margin: 0 0 14px; color: #526987; }
      .lc-omni-quote-picker-list { display: grid; gap: 7px; max-height: 330px; overflow: auto; }
      .lc-omni-quote-picker-list label { display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #d8e4f2; border-radius: 6px; cursor: pointer; }
      .lc-omni-quote-picker-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .lc-omni-quote-picker-actions button { min-height: 36px; padding: 0 14px; border: 1px solid #8da9cc; border-radius: 6px; background: #fff; color: #0b3978; font-weight: 700; cursor: pointer; }
      .lc-omni-quote-picker-actions [data-add] { border-color: #e2a900; background: #f7c948; color: #fff; }
      #${PANEL_ID}, #${DRAWINGS_PANEL_ID} { display: none; position: absolute; z-index: 2147483647; top: 46px; left: 50%; transform: translateX(-50%); width: 410px; max-width: calc(100vw - 48px); border: 1px solid #9eb8d8; border-radius: 7px; background: #fff; box-shadow: 0 14px 36px rgba(15,46,106,.22); color: #172b49; font: 13px Arial,sans-serif; }
      #${DRAWINGS_PANEL_ID} { top: 96px; }
      #${HOST_ID}.is-care-open #${PANEL_ID}, #${HOST_ID}.is-drawings-open #${DRAWINGS_PANEL_ID} { display: block; }
      .lc-omni-pdf-summary, .lc-omni-pdf-empty, #lc-omni-pdf-attachments-status, #lc-omni-drawings-status { padding: 9px 11px; color: #526987; }
      #lc-omni-pdf-attachments-status, #lc-omni-drawings-status { display: flex; align-items: center; gap: 8px; min-height: 18px; }
      .lc-omni-pdf-actions button .lc-omni-pdf-spinner { display: inline-block; margin-right: 6px; vertical-align: -2px; border-color: rgba(255,255,255,.45); border-top-color: #fff; }
      .lc-omni-pdf-loading { min-height: 76px; display: flex; align-items: center; justify-content: center; gap: 9px; color: #365a87; font-weight: 700; }
      .lc-omni-pdf-spinner { width: 14px; height: 14px; flex: 0 0 14px; border: 2px solid #c6d7ea; border-top-color: #0b3978; border-radius: 50%; animation: lc-omni-pdf-spin .75s linear infinite; }
      @keyframes lc-omni-pdf-spin { to { transform: rotate(360deg); } }
      .lc-omni-pdf-list { max-height: 310px; overflow: auto; border-block: 1px solid #d8e4f2; }
      #${DRAWINGS_PANEL_ID} .lc-omni-pdf-list { overflow: visible; }
      .lc-omni-drawing-selectors { display: grid; gap: 8px; padding: 0 11px 11px; }
      .lc-omni-drawing-file-choice { padding: 11px; }
      .lc-omni-drawing-select { display: grid; grid-template-columns: 68px minmax(0,1fr); gap: 8px; align-items: center; color: #294467; font-weight: 700; }
      .lc-omni-custom-select { position: relative; min-width: 0; }
      .lc-omni-select-trigger {
        width: 100%; min-height: 38px; display: grid; grid-template-columns: minmax(0,1fr) 14px; gap: 8px; align-items: center;
        border: 1px solid #8da9cc; border-radius: 5px; background: #fff; color: #172b49; padding: 0 11px;
        font: 600 13px Arial,sans-serif; text-align: left; cursor: pointer;
      }
      .lc-omni-select-trigger span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lc-omni-select-trigger i { width: 8px; height: 8px; border-right: 2px solid #0b3978; border-bottom: 2px solid #0b3978; transform: rotate(45deg) translateY(-2px); justify-self: center; }
      .lc-omni-select-trigger:hover { border-color: #517daf; background: #f7faff; }
      .lc-omni-custom-select.is-open .lc-omni-select-trigger { border-color: #0b3978; box-shadow: 0 0 0 2px rgba(11,57,120,.14); }
      .lc-omni-custom-select.is-open .lc-omni-select-trigger i { transform: rotate(225deg) translate(-1px,-1px); }
      .lc-omni-select-menu {
        display: none; position: absolute; z-index: 2147483647; top: calc(100% + 4px); left: 0; right: 0; max-height: 260px; overflow-y: auto;
        padding: 4px; border: 1px solid #8da9cc; border-radius: 6px; background: #fff; box-shadow: 0 10px 24px rgba(15,46,106,.2);
      }
      .lc-omni-custom-select.is-open .lc-omni-select-menu { display: grid; }
      .lc-omni-select-option {
        min-height: 34px; border: 0; border-radius: 4px; background: #fff; color: #172b49; padding: 7px 9px;
        font: 600 12px Arial,sans-serif; text-align: left; cursor: pointer;
      }
      .lc-omni-select-option:hover { background: #e6eef8; color: #0b3978; }
      .lc-omni-select-option.is-selected { background: #0b3978; color: #fff; }
      .lc-omni-pdf-row { display: grid; grid-template-columns: 22px minmax(0,1fr); gap: 7px; align-items: center; padding: 8px 11px; border-bottom: 1px solid #e4edf7; cursor: pointer; }
      .lc-omni-pdf-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lc-omni-pdf-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 9px 11px; }
      .lc-omni-pdf-actions button { min-height: 30px; border: 1px solid #9eb8d8; border-radius: 5px; background: #e6eef8; color: #0b3978; padding: 0 11px; font: 700 12px Arial,sans-serif; cursor: pointer; }
      .lc-omni-pdf-actions [data-action="add"], .lc-omni-pdf-actions [data-action="drawing-add"] { border-color: #0b3978; background: #0b3978; color: #fff; }
      .lc-omni-pdf-actions button:disabled { opacity: .5; cursor: not-allowed; }
      #lc-omni-pdf-attachments-status.is-error, #lc-omni-drawings-status.is-error { color: #b42318; }
    `;
    document.head.appendChild(style);
  }

  function inject() {
    injectStyles();
    if (document.getElementById(HOST_ID)) return;
    const contactsColumn = document.querySelector(".lc-omni-contacts-column");
    if (!contactsColumn) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.innerHTML = `
      <button type="button" id="${BUTTON_ID}" class="ghost">Care Guides</button>
      <section id="${PANEL_ID}" aria-label="Living Culture Care Guides"></section>
      <button type="button" id="${DRAWINGS_BUTTON_ID}" class="ghost">Drawings</button>
      <section id="${DRAWINGS_PANEL_ID}" aria-label="Living Culture Drawings"></section>`;
    contactsColumn.appendChild(host);
    host.querySelector(`#${BUTTON_ID}`).addEventListener("click", () => {
      host.classList.remove("is-drawings-open");
      host.classList.toggle("is-care-open");
      if (host.classList.contains("is-care-open") && !state.loaded && !state.loadingList) loadFiles();
      else render();
    });
    host.querySelector(`#${DRAWINGS_BUTTON_ID}`).addEventListener("click", () => {
      host.classList.remove("is-care-open");
      host.classList.toggle("is-drawings-open");
      if (host.classList.contains("is-drawings-open") && !drawingState.loaded && !drawingState.loading) loadDrawingLevel(DRAWINGS_ROOT_ID, 0);
      else renderDrawings();
    });
    document.addEventListener("click", (event) => {
      if (!host.isConnected) return;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const insideOpenPanel = path.includes(host.querySelector(`#${PANEL_ID}`))
        || path.includes(host.querySelector(`#${DRAWINGS_PANEL_ID}`));
      const onLaunchButton = path.includes(host.querySelector(`#${BUTTON_ID}`))
        || path.includes(host.querySelector(`#${DRAWINGS_BUTTON_ID}`));
      if (!insideOpenPanel && !onLaunchButton) host.classList.remove("is-care-open", "is-drawings-open");
    });
    render();
    renderDrawings();
  }

  function scheduleInject() {
    if (injectQueued) return;
    injectQueued = true;
    requestAnimationFrame(() => {
      injectQueued = false;
      inject();
    });
  }

  function boot() {
    if (/\/Cloud\/TransactionEntry\/TransactionEntry\.aspx$/i.test(location.pathname)) {
      captureQuotePdfContext();
      let captureTimer = 0;
      new MutationObserver(() => {
        clearTimeout(captureTimer);
        captureTimer = setTimeout(captureQuotePdfContext, 200);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
      return;
    }
    if (location.origin === HELPER_ORIGIN) {
      window.addEventListener("message", (event) => {
        if (event.origin !== OMNI_ORIGIN || event.data?.type !== "LC_OMNI_PDF_RESULT") return;
        state.busy = false;
        if (event.data.ok) state.selected.clear();
        setStatus(event.data.message || (event.data.ok ? "PDFs added to the Omni email." : "PDFs could not be added."), !event.data.ok);
        render();
      });
      return;
    }

    const restoredCache = restoreCachedFiles();
    inject();
    if (!restoredCache) loadFiles();
    new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });

    window.addEventListener("message", (event) => {
      if (event.origin !== HELPER_ORIGIN || event.data?.type !== "LC_OMNI_PDF_FILES") return;
      const files = Array.isArray(event.data.files) ? event.data.files : [];
      const inputs = availableFileInputs();
      if (!files.length || files.length > inputs.length) {
        event.source?.postMessage({
          type: "LC_OMNI_PDF_RESULT",
          ok: false,
          message: `Omni has ${inputs.length} empty attachment field${inputs.length === 1 ? "" : "s"}.`
        }, HELPER_ORIGIN);
        return;
      }
      try {
        files.forEach((file, index) => assignFile(inputs[index], file));
        event.source?.postMessage({
          type: "LC_OMNI_PDF_RESULT",
          ok: true,
          message: `${files.length} PDF${files.length === 1 ? "" : "s"} added to the Omni email.`
        }, HELPER_ORIGIN);
      } catch (error) {
        event.source?.postMessage({ type: "LC_OMNI_PDF_RESULT", ok: false, message: error.message }, HELPER_ORIGIN);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
