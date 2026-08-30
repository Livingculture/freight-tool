// ==UserScript==
// @name         Omni Living Culture PDF Attachments
// @namespace    livingculture-omni
// @version      0.1.1
// @description  Selects Living Culture Google Drive PDFs and loads them into the Cin7 Omni email attachment fields.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/CRM/ContactLog.aspx*
// @grant        GM_xmlhttpRequest
// @connect      cin7-pdf-attachments.vercel.app
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
  const STYLE_ID = "lc-omni-pdf-attachments-styles";
  const state = { files: [], selected: new Set(), loaded: false, busy: false, status: "", statusError: false };
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
            reject(new Error(`Attachment service returned HTTP ${response.status}.`));
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

  async function loadFiles() {
    state.busy = true;
    render();
    try {
      const response = await request(`${API_BASE}/api/email-links`, {
        headers: { Accept: "application/json", "x-lc-token": TOOL_TOKEN }
      });
      const payload = JSON.parse(response.responseText || "{}");
      state.files = Array.isArray(payload.files) ? payload.files : [];
      state.loaded = true;
      state.selected.clear();
    } catch (error) {
      state.loaded = true;
      setStatus(error.message);
    } finally {
      state.busy = false;
      render();
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

  async function downloadFile(file) {
    const response = await request(file.downloadUrl, { responseType: "arraybuffer" });
    return new File([response.response], clean(file.name) || "Living Culture document.pdf", {
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
    const inputs = availableFileInputs();
    if (!files.length) return;
    if (files.length > inputs.length) {
      setStatus(`Omni has ${inputs.length} empty attachment field${inputs.length === 1 ? "" : "s"}. Choose ${inputs.length} PDF${inputs.length === 1 ? "" : "s"} or fewer.`, true);
      return;
    }

    state.busy = true;
    render();
    setStatus("Loading selected PDFs into Omni...");
    try {
      const downloaded = await Promise.all(files.map(downloadFile));
      downloaded.forEach((file, index) => assignFile(inputs[index], file));
      state.selected.clear();
      render();
      setStatus(`${downloaded.length} PDF${downloaded.length === 1 ? "" : "s"} added to the Omni email.`);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const slots = availableFileInputs().length;
    const rows = state.loaded
      ? state.files.map((file) => `
          <label class="lc-omni-pdf-row">
            <input type="checkbox" value="${escapeHtml(file.id)}" ${state.selected.has(file.id) ? "checked" : ""}>
            <span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          </label>`).join("") || '<div class="lc-omni-pdf-empty">No PDFs found.</div>'
      : '<div class="lc-omni-pdf-empty">Loading PDFs...</div>';
    panel.innerHTML = `
      <div class="lc-omni-pdf-summary">Choose up to ${slots} PDF${slots === 1 ? "" : "s"}</div>
      <div class="lc-omni-pdf-list">${rows}</div>
      <div class="lc-omni-pdf-actions">
        <button type="button" data-action="refresh">Refresh</button>
        <button type="button" data-action="add" ${state.busy || !state.selected.size ? "disabled" : ""}>Add to email</button>
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

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${HOST_ID} { position: absolute; z-index: 4; top: 12px; right: 354px; }
      #${BUTTON_ID} { min-height: 34px; border: 1px solid #0b3978; border-radius: 5px; background: #0b3978; color: #fff; padding: 0 14px; font: 700 13px Arial,sans-serif; cursor: pointer; }
      #${BUTTON_ID}:hover { background: #072d62; }
      #${PANEL_ID} { display: none; position: absolute; z-index: 2147483647; top: 42px; right: 0; width: 390px; max-width: calc(100vw - 48px); border: 1px solid #9eb8d8; border-radius: 7px; background: #fff; box-shadow: 0 14px 36px rgba(15,46,106,.22); color: #172b49; font: 13px Arial,sans-serif; }
      #${HOST_ID}.is-open #${PANEL_ID} { display: block; }
      .lc-omni-pdf-summary, .lc-omni-pdf-empty, #lc-omni-pdf-attachments-status { padding: 9px 11px; color: #526987; }
      .lc-omni-pdf-list { max-height: 310px; overflow: auto; border-block: 1px solid #d8e4f2; }
      .lc-omni-pdf-row { display: grid; grid-template-columns: 22px minmax(0,1fr); gap: 7px; align-items: center; padding: 8px 11px; border-bottom: 1px solid #e4edf7; cursor: pointer; }
      .lc-omni-pdf-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lc-omni-pdf-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 9px 11px; }
      .lc-omni-pdf-actions button { min-height: 30px; border: 1px solid #9eb8d8; border-radius: 5px; background: #e6eef8; color: #0b3978; padding: 0 11px; font: 700 12px Arial,sans-serif; cursor: pointer; }
      .lc-omni-pdf-actions [data-action="add"] { border-color: #0b3978; background: #0b3978; color: #fff; }
      .lc-omni-pdf-actions button:disabled { opacity: .5; cursor: not-allowed; }
      #lc-omni-pdf-attachments-status.is-error { color: #b42318; }
    `;
    document.head.appendChild(style);
  }

  function inject() {
    injectStyles();
    if (document.getElementById(HOST_ID)) return;
    const helper = document.getElementById("lc-omni-email-helper-panel");
    if (!helper) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.innerHTML = `
      <button type="button" id="${BUTTON_ID}">PDF Attachments</button>
      <section id="${PANEL_ID}" aria-label="Living Culture PDF Attachments"></section>`;
    helper.appendChild(host);
    host.querySelector(`#${BUTTON_ID}`).addEventListener("click", () => {
      host.classList.toggle("is-open");
      if (host.classList.contains("is-open") && !state.loaded) loadFiles();
      else render();
    });
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
    inject();
    new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
