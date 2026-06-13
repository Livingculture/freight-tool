// ==UserScript==
// @name         Gmail Living Culture Care Guides
// @namespace    https://livingculture.co.nz/
// @version      0.1.2
// @description  Inserts Living Culture care guide download links into Gmail compose windows.
// @author       Living Culture
// @match        https://mail.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      cin7-pdf-attachments.vercel.app
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-care-guides.user.js?v=0.1.2
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-care-guides.user.js?v=0.1.2
// ==/UserScript==

(function () {
  "use strict";

  const API_BASE = "https://cin7-pdf-attachments.vercel.app";
  const EMBEDDED_TOOL_TOKEN = "fXlAMocbHnglrq02Vg4WZY0xbHaPsA+b";
  const BUTTON_ID = "lc-gmail-care-guides-button";
  const PANEL_ID = "lc-gmail-care-guides-panel";

  const state = {
    files: [],
    selected: new Set(),
    loaded: false,
    busy: false,
    open: false,
  };
  let lastToggleAt = 0;
  let menuRegistered = false;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function apiRequest(path) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${API_BASE}${path}`,
        headers: {
          Accept: "application/json",
          "x-lc-token": EMBEDDED_TOOL_TOKEN,
        },
        onload(response) {
          let body = null;
          try {
            body = JSON.parse(response.responseText || "{}");
          } catch {
            reject(new Error("Care Guides returned an invalid response."));
            return;
          }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(body.error || `Care Guides returned HTTP ${response.status}.`));
            return;
          }
          resolve(body);
        },
        onerror() {
          reject(new Error("Could not reach Care Guides."));
        },
      });
    });
  }

  function activeComposeBody() {
    const bodies = Array.from(
      document.querySelectorAll('div[aria-label="Message Body"][contenteditable="true"], div[role="textbox"][contenteditable="true"]'),
    );
    return bodies.reverse().find((body) => {
      const rect = body.getBoundingClientRect();
      const style = window.getComputedStyle(body);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function insertHtmlIntoCompose(html) {
    const body = activeComposeBody();
    if (!body) {
      window.alert("Open a Gmail compose or reply box first.");
      return false;
    }
    body.focus();
    document.execCommand("insertHTML", false, html);
    return true;
  }

  function setStatus(message) {
    const status = document.querySelector("#lc-gmail-care-guides-status");
    if (status) status.textContent = message;
  }

  function renderPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }

    const filesMarkup = state.files.length
      ? state.files
          .map((file) => {
            const checked = state.selected.has(file.id) ? "checked" : "";
            return `
              <label class="lc-gmail-care-row">
                <input type="checkbox" value="${escapeHtml(file.id)}" ${checked}>
                <span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
              </label>
            `;
          })
          .join("")
      : '<div class="lc-gmail-care-empty">No care guides found.</div>';

    panel.innerHTML = `
      <div class="lc-gmail-care-head">
        <strong>Care Guides</strong>
        <button type="button" id="lc-gmail-care-close" title="Close">x</button>
      </div>
      <div class="lc-gmail-care-list">${state.loaded ? filesMarkup : '<div class="lc-gmail-care-empty">Loading guides...</div>'}</div>
      <div class="lc-gmail-care-actions">
        <button type="button" id="lc-gmail-care-refresh">Refresh</button>
        <button type="button" id="lc-gmail-care-insert" ${state.busy || !state.selected.size ? "disabled" : ""}>Insert ${state.selected.size || ""}</button>
      </div>
      <div id="lc-gmail-care-guides-status" class="lc-gmail-care-status"></div>
    `;

    panel.querySelector("#lc-gmail-care-close").addEventListener("click", closePanel);
    panel.querySelector("#lc-gmail-care-refresh").addEventListener("click", loadFiles);
    panel.querySelector("#lc-gmail-care-insert").addEventListener("click", insertSelected);
    panel.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.addEventListener("change", (event) => {
        if (event.target.checked) state.selected.add(event.target.value);
        else state.selected.delete(event.target.value);
        renderPanel();
      });
    });
  }

  async function loadFiles() {
    state.busy = true;
    renderPanel();
    setStatus("Loading guides...");
    try {
      const body = await apiRequest("/api/email-links");
      state.files = body.files || [];
      state.loaded = true;
      state.selected.clear();
      renderPanel();
      setStatus(`${state.files.length} guide${state.files.length === 1 ? "" : "s"} ready.`);
    } catch (error) {
      state.loaded = true;
      renderPanel();
      setStatus(error.message);
    } finally {
      state.busy = false;
      renderPanel();
    }
  }

  function insertSelected() {
    const files = state.files.filter((file) => state.selected.has(file.id));
    if (!files.length) return;

    const items = files
      .map((file) => `<li><a href="${escapeHtml(file.downloadUrl)}" target="_blank">${escapeHtml(file.name)}</a></li>`)
      .join("");
    const html = `
      <div><br></div>
      <div><strong>Care guides:</strong></div>
      <ul>${items}</ul>
    `;

    if (insertHtmlIntoCompose(html)) {
      state.selected.clear();
      closePanel();
    }
  }

  function openPanel() {
    state.open = true;
    renderPanel();
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      document.body.appendChild(panel);
      panel.style.setProperty("left", "50%", "important");
      panel.style.setProperty("top", "50%", "important");
      panel.style.setProperty("right", "auto", "important");
      panel.style.setProperty("bottom", "auto", "important");
      panel.style.setProperty("transform", "translate(-50%, -50%)", "important");
      panel.style.setProperty("display", "block", "important");
      panel.style.setProperty("z-index", "2147483647", "important");
    }
    if (!state.loaded) loadFiles();
  }

  function closePanel() {
    state.open = false;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = "none";
  }

  function injectStyles() {
    if (document.getElementById("lc-gmail-care-styles")) return;
    const style = document.createElement("style");
    style.id = "lc-gmail-care-styles";
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 2147483646;
        height: 38px;
        border: 1px solid #0d6f78;
        border-radius: 19px;
        background: #0d6f78;
        color: #fff;
        padding: 0 16px;
        font: 700 14px Arial, sans-serif;
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        box-shadow: 0 8px 22px rgba(20, 31, 38, .24);
      }
      #${PANEL_ID} {
        display: none;
        position: fixed;
        z-index: 2147483647;
        width: 380px;
        max-width: calc(100vw - 32px);
        background: #fff;
        border: 1px solid #c9d5da;
        border-radius: 8px;
        box-shadow: 0 18px 42px rgba(20, 31, 38, .24);
        color: #17202a;
        font: 13px Arial, sans-serif;
        transform: translate(-50%, -50%);
        pointer-events: auto;
      }
      .lc-gmail-care-head,
      .lc-gmail-care-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border-bottom: 1px solid #e5ecef;
      }
      .lc-gmail-care-head {
        justify-content: space-between;
      }
      .lc-gmail-care-head button {
        border: 0;
        background: transparent;
        cursor: pointer;
        font: 700 14px Arial, sans-serif;
      }
      .lc-gmail-care-list {
        max-height: 300px;
        overflow: auto;
      }
      .lc-gmail-care-row {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        border-bottom: 1px solid #eef3f5;
        cursor: pointer;
      }
      .lc-gmail-care-row span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .lc-gmail-care-actions {
        justify-content: flex-end;
        border-top: 1px solid #e5ecef;
        border-bottom: 0;
      }
      .lc-gmail-care-actions button {
        min-height: 28px;
        border: 0;
        border-radius: 4px;
        background: #e8f0f2;
        color: #18343a;
        padding: 5px 9px;
        font: 700 12px Arial, sans-serif;
        cursor: pointer;
      }
      .lc-gmail-care-actions #lc-gmail-care-insert {
        background: #0d6f78;
        color: #fff;
      }
      .lc-gmail-care-actions button:disabled {
        cursor: not-allowed;
        opacity: .55;
      }
      .lc-gmail-care-empty,
      .lc-gmail-care-status {
        padding: 9px 10px;
        color: #50606b;
      }
    `;
    document.head.appendChild(style);
  }

  function injectButton() {
    injectStyles();
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Care Guides";
    button.title = "Insert Living Culture care guide links";
    const toggle = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      }
      const now = Date.now();
      if (now - lastToggleAt < 250) return;
      lastToggleAt = now;
      button.textContent = state.open ? "Care Guides" : "Opening...";
      if (state.open) closePanel();
      else openPanel();
      window.setTimeout(() => {
        button.textContent = "Care Guides";
      }, 400);
    };
    button.addEventListener("pointerdown", toggle, true);
    button.addEventListener("mousedown", toggle, true);
    button.addEventListener("touchstart", toggle, true);
    button.addEventListener("click", toggle, true);
    button.onclick = toggle;
    document.body.appendChild(button);

    if (!menuRegistered && typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Open Care Guides", () => toggle());
      menuRegistered = true;
    }
  }

  function boot() {
    if (!document.body) return;
    injectButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
