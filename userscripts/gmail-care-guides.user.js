// ==UserScript==
// @name         Gmail Living Culture Care Guides
// @namespace    https://livingculture.co.nz/
// @version      0.1.9
// @description  Attaches Living Culture care guide PDFs to Gmail compose windows.
// @author       Living Culture
// @match        https://mail.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      cin7-pdf-attachments.vercel.app
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-care-guides.user.js?v=0.1.9
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/gmail-care-guides.user.js?v=0.1.9
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
  let syncTimer = null;

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

  function downloadPdf(file) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: file.downloadUrl,
        responseType: "arraybuffer",
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`${file.name} download returned HTTP ${response.status}.`));
            return;
          }
          const blob = new Blob([response.response], { type: "application/pdf" });
          resolve(new File([blob], file.name, { type: "application/pdf" }));
        },
        onerror() {
          reject(new Error(`Could not download ${file.name}.`));
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

  function activeComposeRoot() {
    const body = activeComposeBody();
    return body?.closest('div[role="dialog"], div[role="listitem"]') || body;
  }

  function insertNodeIntoCompose(node) {
    const body = activeComposeBody();
    if (!body) {
      window.alert("Open a Gmail compose or reply box first.");
      return false;
    }
    body.focus();
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      body.appendChild(node);
    }
    return true;
  }

  function setStatus(message) {
    const status = document.querySelector("#lc-gmail-care-guides-status");
    if (status) status.textContent = message;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function positionPanel(panel) {
    document.body.appendChild(panel);
    panel.style.setProperty("left", "50%", "important");
    panel.style.setProperty("top", "50%", "important");
    panel.style.setProperty("right", "auto", "important");
    panel.style.setProperty("bottom", "auto", "important");
    panel.style.setProperty("transform", "translate(-50%, -50%)", "important");
    panel.style.setProperty("display", "block", "important");
    panel.style.setProperty("z-index", "2147483647", "important");
  }

  function createHeader() {
    const head = document.createElement("div");
    head.className = "lc-gmail-care-head";

    const title = document.createElement("strong");
    title.textContent = "Care Guides";
    head.appendChild(title);

    const close = document.createElement("button");
    close.type = "button";
    close.id = "lc-gmail-care-close";
    close.title = "Close";
    close.textContent = "x";
    close.addEventListener("click", closePanel);
    head.appendChild(close);

    return head;
  }

  function createEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "lc-gmail-care-empty";
    empty.textContent = message;
    return empty;
  }

  function renderPanel() {
    const panel = ensurePanel();
    panel.replaceChildren();
    panel.appendChild(createHeader());

    const list = document.createElement("div");
    list.className = "lc-gmail-care-list";
    if (!state.loaded) {
      list.appendChild(createEmpty("Loading guides..."));
    } else if (!state.files.length) {
      list.appendChild(createEmpty("No care guides found."));
    } else {
      state.files.forEach((file) => {
        const row = document.createElement("label");
        row.className = "lc-gmail-care-row";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = file.id;
        input.checked = state.selected.has(file.id);
        input.addEventListener("change", (event) => {
          if (event.target.checked) state.selected.add(event.target.value);
          else state.selected.delete(event.target.value);
          renderPanel();
        });
        row.appendChild(input);

        const name = document.createElement("span");
        name.title = file.name;
        name.textContent = file.name;
        row.appendChild(name);
        list.appendChild(row);
      });
    }
    panel.appendChild(list);

    const actions = document.createElement("div");
    actions.className = "lc-gmail-care-actions";

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.id = "lc-gmail-care-refresh";
    refresh.textContent = "Refresh";
    refresh.addEventListener("click", loadFiles);
    actions.appendChild(refresh);

    const attach = document.createElement("button");
    attach.type = "button";
    attach.id = "lc-gmail-care-attach";
    attach.disabled = state.busy || !state.selected.size;
    attach.textContent = `Attach ${state.selected.size || ""}`.trim();
    attach.addEventListener("click", attachSelected);
    actions.appendChild(attach);

    panel.appendChild(actions);

    const status = document.createElement("div");
    status.id = "lc-gmail-care-guides-status";
    status.className = "lc-gmail-care-status";
    panel.appendChild(status);
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

  async function attachSelected() {
    const files = state.files.filter((file) => state.selected.has(file.id));
    if (!files.length) return;

    const composeRoot = activeComposeRoot();
    if (!composeRoot) {
      window.alert("Open a Gmail compose or reply box first.");
      return;
    }

    state.busy = true;
    renderPanel();
    setStatus(`Downloading ${files.length} guide${files.length === 1 ? "" : "s"}...`);
    let resultMessage = "";
    let shouldClose = false;

    try {
      const downloaded = [];
      for (const file of files) {
        setStatus(`Downloading ${file.name}...`);
        downloaded.push(await downloadPdf(file));
      }

      const inputs = Array.from(composeRoot.querySelectorAll('input[type="file"]'));
      const allInputs = inputs.length ? inputs : Array.from(document.querySelectorAll('input[type="file"]'));
      const fileInput = allInputs.reverse().find((input) => !input.disabled);
      if (!fileInput) {
        throw new Error("Could not find Gmail's attachment input. Click the Gmail paperclip once, then try Attach again.");
      }

      const dataTransfer = new DataTransfer();
      downloaded.forEach((file) => dataTransfer.items.add(file));
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      resultMessage = `Attached ${downloaded.length} guide${downloaded.length === 1 ? "" : "s"}.`;
      state.selected.clear();
      shouldClose = true;
    } catch (error) {
      resultMessage = error.message || String(error);
    } finally {
      state.busy = false;
      renderPanel();
      if (resultMessage) setStatus(resultMessage);
      if (shouldClose) window.setTimeout(closePanel, 900);
    }
  }

  function insertSelected() {
    const files = state.files.filter((file) => state.selected.has(file.id));
    if (!files.length) return;

    const wrapper = document.createElement("div");
    wrapper.appendChild(document.createElement("br"));

    const label = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = "Care guides:";
    label.appendChild(strong);
    wrapper.appendChild(label);

    const list = document.createElement("ul");
    files.forEach((file) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = file.downloadUrl;
      link.target = "_blank";
      link.textContent = file.name;
      item.appendChild(link);
      list.appendChild(item);
    });
    wrapper.appendChild(list);

    if (insertNodeIntoCompose(wrapper)) {
      state.selected.clear();
      closePanel();
    }
  }

  function openPanel() {
    state.open = true;
    const panel = ensurePanel();
    panel.replaceChildren(createHeader(), createEmpty("Opening guides..."));
    positionPanel(panel);
    window.requestAnimationFrame(() => {
      try {
        renderPanel();
        positionPanel(panel);
        if (!state.loaded) loadFiles();
      } catch (error) {
        panel.replaceChildren(createHeader(), createEmpty(`Could not open guides: ${error.message || error}`));
        positionPanel(panel);
      }
    });
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
        left: 0;
        top: 0;
        z-index: 2147483646;
        display: none;
        height: 28px;
        border: 1px solid #0d6f78;
        border-radius: 15px;
        background: #0d6f78;
        color: #fff;
        padding: 0 9px;
        font: 700 12px Arial, sans-serif;
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        box-shadow: 0 4px 12px rgba(20, 31, 38, .20);
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
      .lc-gmail-care-actions #lc-gmail-care-attach {
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
      window.setTimeout(() => {
        button.textContent = "Care Guides";
      }, 400);
      try {
        if (state.open) closePanel();
        else openPanel();
      } catch (error) {
        button.textContent = "Care Guides";
        window.alert(`Care Guides could not open: ${error.message || error}`);
      }
    };
    button.addEventListener("pointerdown", toggle, true);
    button.addEventListener("mousedown", toggle, true);
    button.addEventListener("touchstart", toggle, true);
    button.addEventListener("click", toggle, true);
    button.onclick = toggle;
    document.body.appendChild(button);
    syncButtonToCompose();

    if (!menuRegistered && typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Open Care Guides", () => toggle());
      menuRegistered = true;
    }
  }

  function syncButtonToCompose() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;

    const composeRoot = activeComposeRoot();
    if (!composeRoot) {
      button.style.display = "none";
      if (state.open) closePanel();
      return;
    }

    const rect = composeRoot.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      button.style.display = "none";
      return;
    }

    const buttonWidth = button.offsetWidth || 96;
    const left = rect.right - buttonWidth - 34;
    const top = rect.bottom - 42;
    button.style.left = `${Math.max(8, left)}px`;
    button.style.top = `${Math.max(8, top)}px`;
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
  }

  function boot() {
    if (!document.body) return;
    injectButton();
    if (!syncTimer) {
      syncTimer = window.setInterval(syncButtonToCompose, 500);
      window.addEventListener("resize", syncButtonToCompose);
      document.addEventListener("focusin", syncButtonToCompose);
      document.addEventListener("click", () => window.setTimeout(syncButtonToCompose, 50), true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
