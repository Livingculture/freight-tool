// ==UserScript==
// @name         Omni Living Culture PDF Attachments
// @namespace    livingculture-omni
// @version      0.4.0
// @description  Selects Living Culture Google Drive PDFs and loads them into the Cin7 Omni email attachment fields.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/CRM/ContactLog.aspx*
// @match        https://living-culture-email-helper.vercel.app/*
// @grant        GM_xmlhttpRequest
// @connect      cin7-pdf-attachments.vercel.app
// @connect      drive.google.com
// @connect      drive.usercontent.google.com
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
  const DRAWINGS_PANEL_ID = "lc-omni-drawings-panel";
  const STYLE_ID = "lc-omni-pdf-attachments-styles";
  const HELPER_ORIGIN = "https://living-culture-email-helper.vercel.app";
  const OMNI_ORIGIN = "https://go.cin7.com";
  const CACHE_KEY = "lc-omni-pdf-files-v1";
  const CACHE_MAX_AGE = 5 * 60 * 1000;
  const DRAWINGS_ROOT_ID = "1Tcxn7LceZztaoWUmgsNZgml18s2LZORj";
  const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
  const state = { files: [], selected: new Set(), loaded: false, loadingList: false, busy: false, status: "", statusError: false };
  const drawingState = { levels: [], selected: new Set(), loaded: false, loading: false, busy: false, status: "", statusError: false };
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
    status.textContent = message;
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

  function setDrawingStatus(message, error = false) {
    drawingState.status = message;
    drawingState.statusError = error;
    const status = document.querySelector("#lc-omni-drawings-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", error);
  }

  async function downloadFile(file) {
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
    const response = await request(file.downloadUrl, { responseType: "arraybuffer" });
    return new File([response.response], clean(file.name) || "Living Culture drawing.pdf", {
      type: "application/pdf",
      lastModified: Date.now()
    });
  }

  function assignFile(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
        <button type="button" data-action="add" ${state.busy || state.loadingList || !state.selected.size ? "disabled" : ""}>Add to email</button>
      </div>
      <div id="lc-omni-pdf-attachments-status" class="${state.statusError ? "is-error" : ""}">${escapeHtml(state.status)}</div>`;

    panel.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.selected.add(input.value);
        else state.selected.delete(input.value);
        render();
      });
    });
    panel.querySelector('[data-action="refresh"]')?.addEventListener("click", loadFiles);
    panel.querySelector('[data-action="add"]')?.addEventListener("click", addSelected);
  }

  function drawingLevelLabel(index) {
    if (index === 0) return "Pergola";
    if (index === 1) return "Type";
    if (index === 2) return "Size";
    return "Folder";
  }

  function renderDrawings() {
    const panel = document.getElementById(DRAWINGS_PANEL_ID);
    if (!panel) return;
    const launchButton = document.getElementById(DRAWINGS_BUTTON_ID);
    if (launchButton) launchButton.innerHTML = drawingState.loading && !drawingState.loaded
      ? '<span class="lc-omni-pdf-spinner" aria-hidden="true"></span> Loading Drawings…'
      : "Drawings";
    const selectors = drawingState.levels.map((level, index) => level.folders.length ? `
      <label class="lc-omni-drawing-select">
        <span>${drawingLevelLabel(index)}</span>
        <select data-level="${index}" ${drawingState.loading ? "disabled" : ""}>
          <option value="">Select ${drawingLevelLabel(index).toLowerCase()}…</option>
          ${level.folders.map((folder) => `<option value="${escapeHtml(folder.id)}" ${level.selectedFolderId === folder.id ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}
        </select>
      </label>` : "").join("");
    const files = currentDrawingFiles();
    const selectedDrawingId = Array.from(drawingState.selected)[0] || "";
    const rows = drawingState.loading
      ? '<div class="lc-omni-pdf-loading"><span class="lc-omni-pdf-spinner" aria-hidden="true"></span><span>Loading folder…</span></div>'
      : files.length
        ? `<div class="lc-omni-drawing-file-choice">
            <label class="lc-omni-drawing-select">
              <span>Drawing</span>
              <select data-drawing-file>
                <option value="">Select size / drawing…</option>
                ${files.map((file) => `<option value="${escapeHtml(file.id)}" ${selectedDrawingId === file.id ? "selected" : ""}>${escapeHtml(file.name.replace(/\.pdf$/i, ""))}</option>`).join("")}
              </select>
            </label>
          </div>`
        : drawingState.loaded && !drawingState.levels.at(-1)?.folders.length
          ? '<div class="lc-omni-pdf-empty">No PDF drawings found in this folder.</div>'
          : '<div class="lc-omni-pdf-empty">Choose each folder to find its drawings.</div>';
    panel.innerHTML = `
      <div class="lc-omni-pdf-summary">Select pergola, type and size</div>
      <div class="lc-omni-drawing-selectors">${selectors}</div>
      <div class="lc-omni-pdf-list">${rows}</div>
      <div class="lc-omni-pdf-actions">
        <button type="button" data-action="drawing-refresh" ${drawingState.loading ? "disabled" : ""}>Refresh</button>
        <button type="button" data-action="drawing-add" ${drawingState.busy || drawingState.loading || !drawingState.selected.size ? "disabled" : ""}>Add to email</button>
      </div>
      <div id="lc-omni-drawings-status" class="${drawingState.statusError ? "is-error" : ""}">${escapeHtml(drawingState.status)}</div>`;
    panel.querySelectorAll("select[data-level]").forEach((select) => {
      select.addEventListener("change", () => chooseDrawingFolder(Number(select.dataset.level), select.value));
    });
    panel.querySelector("select[data-drawing-file]")?.addEventListener("change", (event) => {
      drawingState.selected.clear();
      if (event.target.value) drawingState.selected.add(event.target.value);
      renderDrawings();
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
      #${BUTTON_ID}, #${DRAWINGS_BUTTON_ID} { min-height: 40px; border: 1px solid #8da9cc; border-radius: 6px; background: #fff; color: #0b3978; padding: 0 16px; font: 700 14px Arial,sans-serif; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
      #${BUTTON_ID}:hover, #${DRAWINGS_BUTTON_ID}:hover { background: #eef4fb; }
      #${PANEL_ID}, #${DRAWINGS_PANEL_ID} { display: none; position: absolute; z-index: 2147483647; top: 46px; left: 50%; transform: translateX(-50%); width: 410px; max-width: calc(100vw - 48px); border: 1px solid #9eb8d8; border-radius: 7px; background: #fff; box-shadow: 0 14px 36px rgba(15,46,106,.22); color: #172b49; font: 13px Arial,sans-serif; }
      #${DRAWINGS_PANEL_ID} { top: 96px; }
      #${HOST_ID}.is-care-open #${PANEL_ID}, #${HOST_ID}.is-drawings-open #${DRAWINGS_PANEL_ID} { display: block; }
      .lc-omni-pdf-summary, .lc-omni-pdf-empty, #lc-omni-pdf-attachments-status, #lc-omni-drawings-status { padding: 9px 11px; color: #526987; }
      .lc-omni-pdf-loading { min-height: 76px; display: flex; align-items: center; justify-content: center; gap: 9px; color: #365a87; font-weight: 700; }
      .lc-omni-pdf-spinner { width: 14px; height: 14px; flex: 0 0 14px; border: 2px solid #c6d7ea; border-top-color: #0b3978; border-radius: 50%; animation: lc-omni-pdf-spin .75s linear infinite; }
      @keyframes lc-omni-pdf-spin { to { transform: rotate(360deg); } }
      .lc-omni-pdf-list { max-height: 310px; overflow: auto; border-block: 1px solid #d8e4f2; }
      .lc-omni-drawing-selectors { display: grid; gap: 8px; padding: 0 11px 11px; }
      .lc-omni-drawing-file-choice { padding: 11px; }
      .lc-omni-drawing-select { display: grid; grid-template-columns: 68px minmax(0,1fr); gap: 8px; align-items: center; color: #294467; font-weight: 700; }
      .lc-omni-drawing-select select { min-width: 0; min-height: 34px; border: 1px solid #9eb8d8; border-radius: 5px; background: #fff; color: #172b49; padding: 0 8px; }
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
