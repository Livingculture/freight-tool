// ==UserScript==
// @name         Omni Email Helper Only View
// @namespace    livingculture-omni
// @version      0.1.1
// @description  Shows only the Living Culture Email Helper while keeping the Cin7 composer available in the background.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/CRM/ContactLog.aspx*
// @match        https://living-culture-email-helper.vercel.app/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-only.user.js?v=0.1.1
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-email-helper-only.user.js?v=0.1.1
// @supportURL   https://github.com/Livingculture/freight-tool
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "lc-omni-email-helper-only-styles";

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function hideHelperCopySubject() {
    if (location.hostname !== "living-culture-email-helper.vercel.app") return;
    if (new URLSearchParams(location.search).get("embedded") !== "1") return;
    Array.from(document.querySelectorAll("button, a, input[type='button']")).forEach((control) => {
      if (/^copy subject$/i.test(clean(control.textContent || control.value))) {
        control.style.setProperty("display", "none", "important");
      }
    });
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html body #lc-omni-email-helper-layout {
        grid-template-columns: minmax(0, 1380px) !important;
        justify-content: center !important;
        gap: 0 !important;
        width: calc(100vw - 76px) !important;
        max-width: 1440px !important;
        overflow: visible !important;
      }

      html body #lc-omni-email-helper-layout > .lc-omni-compose-column,
      html body #lc-omni-email-helper-layout > .lc-omni-contacts-column {
        position: fixed !important;
        left: -100000px !important;
        top: 0 !important;
        width: 700px !important;
        min-width: 700px !important;
        max-width: 700px !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      html body #lc-omni-email-helper-panel {
        grid-column: 1 !important;
        width: 100% !important;
        max-width: 1380px !important;
        margin: 0 auto !important;
      }

      html body #lc-omni-email-helper-toolbar [data-action="copy"],
      html body #lc-omni-email-helper-toolbar [data-action="cin7"] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  installStyles();
  hideHelperCopySubject();
  new MutationObserver(() => {
    installStyles();
    hideHelperCopySubject();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
