// ==UserScript==
// @name         Gmail Living Culture Drawings
// @namespace    https://livingculture.co.nz/
// @version      0.1.0
// @description  Selects Living Culture pergola drawings from Google Drive and attaches them to Gmail drafts.
// @author       Living Culture
// @match        https://mail.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      drive.google.com
// @connect      drive.usercontent.google.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-drawings.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-drawings.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  "use strict";

  const ROOT_FOLDER_ID = "1Tcxn7LceZztaoWUmgsNZgml18s2LZORj";
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  const BUTTON_ID = "lc-gmail-drawings-button";
  const PANEL_ID = "lc-gmail-drawings-panel";
  const STYLE_ID = "lc-gmail-drawings-styles";
  const state = { levels: [], selected: null, loaded: false, loading: false, preparing: false, busy: false, status: "", error: false, open: false };
  const downloadCache = new Map();
  let syncTimer = 0;

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

  function request(url, responseType = "text") {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Google Drive returned HTTP ${response.status}.`));
            return;
          }
          resolve(response);
        },
        onerror() {
          reject(new Error("Could not reach the Living Culture Drawings folder."));
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

  async function readFolder(folderId) {
    const response = await request(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?usp=sharing`);
    const match = String(response.responseText || "").match(/window\['_DRIVE_ivd'\]\s*=\s*'((?:\\.|[^'])*)'/s);
    if (!match) throw new Error("The Drawings folder could not be read. Check its sharing permissions.");
    const payload = JSON.parse(decodeDriveString(match[1]));
    const items = Array.isArray(payload?.[0]) ? payload[0] : [];
    return {
      folders: items.filter((item) => item?.[3] === FOLDER_MIME)
        .map((item) => ({ id: item[0], name: clean(item[2]) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      files: items.filter((item) => item?.[3] === "application/pdf" || /\.pdf$/i.test(item?.[2] || ""))
        .map((item) => ({
          id: item[0],
          name: clean(item[2]),
          downloadUrl: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(item[0])}&export=download&confirm=t`
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    };
  }

  function activeComposeBody() {
    return Array.from(document.querySelectorAll('div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][contenteditable="true"]'))
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

  function currentFiles() {
    return state.levels.at(-1)?.files || [];
  }

  function levelLabel(index, folders = []) {
    if (index === 0) return "Pergola";
    if (index === 1) return "Type";
    if (folders.length && folders.every((folder) => /\b(manual|motorised|motorized)\b/i.test(folder.name))) return "Operation";
    if (folders.length && folders.every((folder) => /\d+(?:\.\d+)?\s*[x×]\s*\d/i.test(folder.name))) return "Size";
    return index === 2 ? "Type" : "Folder";
  }

  async function loadLevel(folderId, replaceFrom = 0) {
    if (state.loading) return;
    state.loading = true;
    state.status = "Loading folder…";
    state.error = false;
    render();
    try {
      const contents = await readFolder(folderId);
      state.levels.splice(replaceFrom, state.levels.length, { folderId, ...contents, selectedFolderId: "" });
      state.selected = null;
      state.loaded = true;
      state.status = "Choose a size to prepare its drawing.";
    } catch (error) {
      state.status = error.message;
      state.error = true;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function chooseFolder(index, folderId) {
    const level = state.levels[index];
    if (!level) return;
    level.selectedFolderId = folderId;
    state.levels.splice(index + 1);
    state.selected = null;
    if (folderId) await loadLevel(folderId, index + 1);
    else render();
  }

  function downloadDrawing(file) {
    if (!downloadCache.has(file.id)) {
      const promise = request(file.downloadUrl, "arraybuffer").then((response) => new File(
        [response.response], file.name || "Living Culture drawing.pdf", { type: "application/pdf", lastModified: Date.now() }
      )).catch((error) => {
        downloadCache.delete(file.id);
        throw error;
      });
      downloadCache.set(file.id, promise);
    }
    return downloadCache.get(file.id);
  }

  async function prepare(file) {
    state.preparing = true;
    state.status = "Preparing selected drawing…";
    state.error = false;
    render();
    try {
      await downloadDrawing(file);
      state.status = "Selected drawing is ready to attach.";
    } catch (error) {
      state.status = error.message;
      state.error = true;
    } finally {
      state.preparing = false;
      render();
    }
  }

  async function attachSelected() {
    const file = currentFiles().find((item) => item.id === state.selected);
    if (!file) return;
    const composeRoot = activeComposeRoot();
    if (!composeRoot) {
      alert("Open a Gmail compose or reply box first.");
      return;
    }
    state.busy = true;
    state.status = "Attaching drawing to Gmail…";
    state.error = false;
    render();
    try {
      const downloaded = await downloadDrawing(file);
      const localInputs = Array.from(composeRoot.querySelectorAll('input[type="file"]'));
      const inputs = localInputs.length ? localInputs : Array.from(document.querySelectorAll('input[type="file"]'));
      const input = inputs.reverse().find((candidate) => !candidate.disabled);
      if (!input) throw new Error("Could not find Gmail's attachment input. Click the paperclip once, then try again.");
      const transfer = new DataTransfer();
      transfer.items.add(downloaded);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      state.status = "Drawing attached to Gmail.";
      state.selected = null;
      setTimeout(closePanel, 800);
    } catch (error) {
      state.status = error.message;
      state.error = true;
    } finally {
      state.busy = false;
      render();
    }
  }

  function dropdown({ label, placeholder, options, value, level, file = false }) {
    const selected = options.find((option) => option.id === value);
    return `<div class="lc-gd-field"><span>${escapeHtml(label)}</span><div class="lc-gd-select" ${file ? "data-file" : `data-level="${level}"`}>
      <button type="button" class="lc-gd-trigger"><span>${escapeHtml(selected?.name || placeholder)}</span><i></i></button>
      <div class="lc-gd-menu"><button type="button" data-value="" class="${value ? "" : "selected"}">${escapeHtml(placeholder)}</button>
      ${options.map((option) => `<button type="button" data-value="${escapeHtml(option.id)}" class="${value === option.id ? "selected" : ""}">${escapeHtml(option.name)}</button>`).join("")}</div>
    </div></div>`;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function render() {
    const panel = ensurePanel();
    const selectors = state.levels.map((level, index) => {
      if (!level.folders.length) return "";
      const label = levelLabel(index, level.folders);
      return dropdown({ label, placeholder: `Select ${label.toLowerCase()}…`, options: level.folders, value: level.selectedFolderId, level: index });
    }).join("");
    const files = currentFiles();
    const fileSelector = files.length ? dropdown({
      label: "Size", placeholder: "Select size…",
      options: files.map((file) => ({ ...file, name: file.name.replace(/\.pdf$/i, "") })),
      value: state.selected, file: true
    }) : "";
    panel.innerHTML = `<header><strong>Living Culture Drawings</strong><button type="button" data-close aria-label="Close">×</button></header>
      <div class="lc-gd-content">
        ${state.loading && !state.loaded ? '<div class="lc-gd-loading"><i></i> Loading drawings…</div>' : `${selectors}${fileSelector}`}
      </div>
      <footer><div class="lc-gd-status ${state.error ? "error" : ""}">${state.loading || state.preparing || state.busy ? "<i></i>" : ""}<span>${escapeHtml(state.status)}</span></div>
      <button type="button" data-attach ${state.busy || !state.selected ? "disabled" : ""}>${state.busy ? "Attaching…" : "Attach to Gmail"}</button></footer>`;
    panel.querySelector("[data-close]")?.addEventListener("click", closePanel);
    panel.querySelectorAll(".lc-gd-trigger").forEach((trigger) => trigger.addEventListener("click", () => {
      const select = trigger.closest(".lc-gd-select");
      const opening = !select.classList.contains("open");
      panel.querySelectorAll(".lc-gd-select.open").forEach((other) => other.classList.remove("open"));
      select.classList.toggle("open", opening);
    }));
    panel.querySelectorAll(".lc-gd-menu button").forEach((option) => option.addEventListener("click", () => {
      const select = option.closest(".lc-gd-select");
      const value = option.dataset.value || "";
      if (select.hasAttribute("data-file")) {
        state.selected = value || null;
        render();
        const file = currentFiles().find((item) => item.id === value);
        if (file) prepare(file);
      } else chooseFolder(Number(select.dataset.level), value);
    }));
    panel.querySelector("[data-attach]")?.addEventListener("click", attachSelected);
  }

  function openPanel() {
    state.open = true;
    const panel = ensurePanel();
    panel.style.display = "block";
    render();
    if (!state.loaded) loadLevel(ROOT_FOLDER_ID, 0);
  }

  function closePanel() {
    state.open = false;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = "none";
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;z-index:2147483646;display:none;height:28px;border:1px solid #0d6f78;border-radius:15px;background:#fff;color:#0d6f78;padding:0 11px;font:700 12px Arial,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(20,31,38,.18)}
      #${PANEL_ID}{display:none;position:fixed;z-index:2147483647;top:50%;left:50%;transform:translate(-50%,-50%);width:430px;max-width:calc(100vw - 30px);border:1px solid #abc9c6;border-radius:9px;background:#fff;box-shadow:0 18px 45px rgba(20,45,48,.28);color:#18343a;font:13px Arial,sans-serif}
      #${PANEL_ID} header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #dce9e7;background:#0d6f78;color:#fff;border-radius:8px 8px 0 0;font-size:15px}
      #${PANEL_ID} header button{border:0;background:transparent;color:#fff;font:700 22px Arial;cursor:pointer}
      .lc-gd-content{display:grid;gap:10px;padding:14px;min-height:60px}
      .lc-gd-field{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;align-items:center;font-weight:700}
      .lc-gd-select{position:relative;min-width:0}.lc-gd-trigger{width:100%;min-height:39px;display:grid;grid-template-columns:minmax(0,1fr) 14px;align-items:center;gap:8px;border:1px solid #8ab7b3;border-radius:6px;background:#fff;color:#18343a;padding:0 11px;font:600 13px Arial;text-align:left;cursor:pointer}
      .lc-gd-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lc-gd-trigger i{width:8px;height:8px;border-right:2px solid #0d6f78;border-bottom:2px solid #0d6f78;transform:rotate(45deg) translateY(-2px)}
      .lc-gd-select.open .lc-gd-trigger{border-color:#0d6f78;box-shadow:0 0 0 2px rgba(13,111,120,.14)}.lc-gd-select.open .lc-gd-trigger i{transform:rotate(225deg) translate(-1px,-1px)}
      .lc-gd-menu{display:none;position:absolute;z-index:2;top:calc(100% + 4px);left:0;right:0;max-height:270px;overflow:auto;padding:4px;border:1px solid #8ab7b3;border-radius:6px;background:#fff;box-shadow:0 10px 26px rgba(20,45,48,.22)}.lc-gd-select.open .lc-gd-menu{display:grid}
      .lc-gd-menu button{min-height:34px;border:0;border-radius:4px;background:#fff;color:#18343a;padding:7px 9px;font:600 12px Arial;text-align:left;cursor:pointer}.lc-gd-menu button:hover{background:#e5f1ef;color:#0d6f78}.lc-gd-menu button.selected{background:#0d6f78;color:#fff}
      #${PANEL_ID} footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;border-top:1px solid #dce9e7}.lc-gd-status{display:flex;align-items:center;gap:7px;color:#506b6c}.lc-gd-status.error{color:#b42318}
      #${PANEL_ID} footer>button{min-height:34px;border:0;border-radius:5px;background:#0d6f78;color:#fff;padding:0 13px;font:700 12px Arial;cursor:pointer}#${PANEL_ID} footer>button:disabled{opacity:.5;cursor:not-allowed}
      .lc-gd-loading{display:flex;align-items:center;justify-content:center;gap:8px;min-height:70px;color:#0d6f78;font-weight:700}.lc-gd-loading i,.lc-gd-status i{width:14px;height:14px;border:2px solid #c8dfdc;border-top-color:#0d6f78;border-radius:50%;animation:lc-gd-spin .75s linear infinite}@keyframes lc-gd-spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function syncButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    const compose = activeComposeRoot();
    if (!compose) {
      button.style.display = "none";
      if (state.open) closePanel();
      return;
    }
    const careButton = document.getElementById("lc-gmail-care-guides-button");
    const careRect = careButton?.getBoundingClientRect();
    const width = button.offsetWidth || 76;
    if (careRect?.width) {
      button.style.left = `${Math.max(8, careRect.left - width - 8)}px`;
      button.style.top = `${careRect.top}px`;
    } else {
      const rect = compose.getBoundingClientRect();
      button.style.left = `${Math.max(8, rect.right - width - 140)}px`;
      button.style.top = `${Math.max(8, rect.bottom - 42)}px`;
    }
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
  }

  function boot() {
    injectStyles();
    if (!document.getElementById(BUTTON_ID)) {
      const button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.textContent = "Drawings";
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.open) closePanel();
        else openPanel();
      }, true);
      document.body.appendChild(button);
      if (typeof GM_registerMenuCommand === "function") GM_registerMenuCommand("Open Drawings", openPanel);
    }
    syncButton();
    if (!syncTimer) syncTimer = setInterval(syncButton, 500);
    document.addEventListener("pointerdown", (event) => {
      if (!state.open) return;
      const path = event.composedPath?.() || [];
      if (!path.includes(document.getElementById(PANEL_ID)) && !path.includes(document.getElementById(BUTTON_ID))) closePanel();
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
