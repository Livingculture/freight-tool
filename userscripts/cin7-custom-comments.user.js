// ==UserScript==
// @name         Cin7 Living Culture Custom Comments
// @namespace    livingculture-cin7
// @version      1.6
// @description  Builds custom pergola comments and fills both the sale Comments box and quote line comment in Cin7.
// @match        https://*.cin7.com/*
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-custom-comments.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-custom-comments.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'lc-custom-comments-root';
  const BUTTON_ID = 'lc-custom-comments-inline-button';

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  function visibleElements(selector = 'body *') {
    return Array.from(document.querySelectorAll(selector)).filter(element => {
      if (!isVisible(element)) return false;
      if (element.closest(`#${ROOT_ID}`)) return false;
      if (element.id === BUTTON_ID) return false;
      return true;
    });
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).catch(() => {});
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    return Promise.resolve();
  }

  function setStatus(message, error = false) {
    const root = document.getElementById(ROOT_ID);
    const status = root?.shadowRoot?.getElementById('lc-cc-status');
    if (!status) return;

    status.textContent = message || '';
    status.className = error ? 'error' : '';
  }

  function setNativeValue(element, value) {
    if (!element) return false;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

      element.focus();

      if (setter) {
        setter.call(element, value);
      } else {
        element.value = value;
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value
        })
      );
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      element.focus();
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value
        })
      );
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    return false;
  }

  function clickAt(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;

    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y
        })
      );
    });

    return element;
  }

  function findTextNode(label) {
    const wanted = label.toLowerCase();

    return visibleElements('label, legend, div, span, p, th')
      .filter(element => clean(element.textContent || '').toLowerCase() === wanted)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
  }

  function findMainCommentsTextarea() {
    const commentsLabel = findTextNode('Comments');
    const fields = visibleElements('textarea, input, [contenteditable="true"]');

    if (!commentsLabel) {
      return fields
        .filter(field => {
          const rect = field.getBoundingClientRect();
          return rect.width > 500 && rect.height > 70;
        })
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
    }

    const labelRect = commentsLabel.getBoundingClientRect();

    return fields
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(({ rect }) => {
        return (
          rect.top >= labelRect.bottom - 8 &&
          rect.top <= labelRect.bottom + 220 &&
          rect.left <= labelRect.left + 80 &&
          rect.width > 500 &&
          rect.height > 50
        );
      })
      .sort((a, b) => a.rect.top - b.rect.top)[0]?.field || null;
  }

  function findQuoteHeaderRect(text) {
    const quoteHeading = visibleElements('h1, h2, h3, div, span')
      .filter(element => clean(element.textContent || '').toLowerCase() === 'quote')
      .map(element => element.getBoundingClientRect())
      .sort((a, b) => b.top - a.top)[0];

    const wanted = text.toLowerCase();

    return visibleElements('th, div, span')
      .filter(element => clean(element.textContent || '').toLowerCase() === wanted)
      .map(element => element.getBoundingClientRect())
      .filter(rect => {
        if (!quoteHeading) return true;
        return rect.top > quoteHeading.top && rect.top < quoteHeading.top + 360;
      })
      .sort((a, b) => a.top - b.top)[0] || null;
  }

  function findFirstQuoteLineRect() {
    const productHeader = findQuoteHeaderRect('product');
    if (!productHeader) return null;

    const additionalTop = findAdditionalChargesTop();
    const candidates = visibleElements('a, td, div, span')
      .map(element => ({ element, rect: element.getBoundingClientRect(), text: clean(element.textContent || '') }))
      .filter(({ rect, text }) => {
        const centerX = rect.left + rect.width / 2;

        return (
          text &&
          rect.top > productHeader.bottom + 6 &&
          rect.top < additionalTop &&
          rect.height >= 16 &&
          rect.width >= 90 &&
          centerX >= productHeader.left - 40 &&
          centerX <= productHeader.right + 520
        );
      })
      .sort((a, b) => a.rect.top - b.rect.top);

    return candidates[0]?.rect || null;
  }

  function findEditableNearPoint(x, y, maxDistance = 360) {
    const active = document.activeElement;

    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active?.isContentEditable
    ) {
      const rect = active.getBoundingClientRect();
      const dx = Math.abs(rect.left + rect.width / 2 - x);
      const dy = Math.abs(rect.top + rect.height / 2 - y);
      if (dx <= maxDistance && dy <= maxDistance) return active;
    }

    const fields = visibleElements('textarea, input, [contenteditable="true"]')
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const dx = Math.abs(rect.left + rect.width / 2 - x);
        const dy = Math.abs(rect.top + rect.height / 2 - y);
        return dx <= maxDistance && dy <= maxDistance;
      })
      .sort((a, b) => {
        const ad =
          Math.abs(a.rect.left + a.rect.width / 2 - x) +
          Math.abs(a.rect.top + a.rect.height / 2 - y);
        const bd =
          Math.abs(b.rect.left + b.rect.width / 2 - x) +
          Math.abs(b.rect.top + b.rect.height / 2 - y);
        return ad - bd;
      });

    return fields[0]?.field || null;
  }

  function findAdditionalChargesTop() {
    return visibleElements('h1, h2, h3, div, span')
      .filter(element => clean(element.textContent || '').toLowerCase().includes('additional charges and services'))
      .map(element => element.getBoundingClientRect().top)
      .sort((a, b) => a - b)[0] || Number.POSITIVE_INFINITY;
  }

  function findLineCommentEditable() {
    const commentHeader = findQuoteHeaderRect('comment');
    if (!commentHeader) return null;

    const additionalTop = findAdditionalChargesTop();
    const fields = visibleElements('textarea, input, [contenteditable="true"]')
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(({ rect }) => {
        const centerX = rect.left + rect.width / 2;
        return (
          rect.top > commentHeader.bottom &&
          rect.top < additionalTop &&
          centerX >= commentHeader.left - 70 &&
          centerX <= commentHeader.right + 180
        );
      })
      .sort((a, b) => a.rect.top - b.rect.top);

    return fields[0]?.field || null;
  }

  async function findLineCommentAfterClick() {
    const commentHeader = findQuoteHeaderRect('comment');
    if (!commentHeader) return null;

    const lineRect = findFirstQuoteLineRect();
    const y = lineRect
      ? lineRect.top + Math.min(Math.max(lineRect.height / 2, 22), 46)
      : commentHeader.bottom + 36;
    const targetPoints = [
      [commentHeader.left + 18, y],
      [commentHeader.left + Math.min(commentHeader.width / 2, 80), y],
      [commentHeader.right - 12, y],
      [commentHeader.left + 18, y + 24]
    ];

    for (const [x, targetY] of targetPoints) {
      clickAt(x, targetY);
      await wait(180);
      clickAt(x, targetY);
      await wait(280);

      const editable = findEditableNearPoint(x, targetY) || findLineCommentEditable();
      if (editable) return editable;
    }

    return null;
  }

  async function fillLineComment(text) {
    let field = findLineCommentEditable();
    if (!field) field = await findLineCommentAfterClick();
    if (!field) return false;

    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus();
    field.click();

    if (setNativeValue(field, text)) return true;

    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (error) {
      console.warn('Could not fill quote line comment:', error);
      return false;
    }
  }

  function buildComment(data) {
    const typeLabel = data.type === 'wall' ? 'Wall Mounted' : 'Freestanding';
    const height = clean(data.height);
    const length = clean(data.length);
    const width = clean(data.width);
    const frameColour = clean(data.frameColour);
    const louvreColour = clean(data.louvreColour);
    const notes = clean(data.notes);

    const lines = [
      typeLabel,
      `Height:${height}mm`,
      `Lenght:${length}mm`,
      `Width:${width}mm`,
      `Frame Colour: ${frameColour}`,
      `Louvre Colour:${louvreColour}`
    ];

    if (notes) lines.push(`Notes: ${notes}`);

    return lines.join('\n');
  }

  function getFormData() {
    const root = document.getElementById(ROOT_ID);
    const shadow = root?.shadowRoot;
    if (!shadow) return null;

    return {
      type: shadow.getElementById('lc-cc-type')?.value || 'freestanding',
      height: shadow.getElementById('lc-cc-height')?.value || '',
      length: shadow.getElementById('lc-cc-length')?.value || '',
      width: shadow.getElementById('lc-cc-width')?.value || '',
      frameColour: shadow.getElementById('lc-cc-frame-colour')?.value || '',
      louvreColour: shadow.getElementById('lc-cc-louvre-colour')?.value || '',
      notes: shadow.getElementById('lc-cc-notes')?.value || ''
    };
  }

  function validateData(data) {
    const missing = [];
    if (!clean(data.height)) missing.push('height');
    if (!clean(data.length)) missing.push('length');
    if (!clean(data.width)) missing.push('width');
    if (!clean(data.frameColour)) missing.push('frame colour');
    if (!clean(data.louvreColour)) missing.push('louvre colour');
    return missing;
  }

  async function fillCommentsFromForm() {
    const data = getFormData();
    if (!data) return;

    const missing = validateData(data);
    if (missing.length) {
      setStatus(`Enter ${missing.join(', ')}.`, true);
      return;
    }

    const text = buildComment(data);
    await copyText(text);

    const mainField = findMainCommentsTextarea();
    const mainFilled = mainField ? setNativeValue(mainField, text) : false;
    let lineFilled = false;
    setModalPassthrough(true);
    await wait(100);
    try {
      lineFilled = await fillLineComment(text);
    } finally {
      setModalPassthrough(false);
    }

    if (mainFilled && lineFilled) {
      setStatus('Filled both comment areas and copied text.');
      closePanel();
      return;
    }

    if (mainFilled || lineFilled) {
      setStatus('Filled one comment area. Text copied for the other one.', true);
      return;
    }

    setStatus('Could not find the comment fields. Text copied to clipboard.', true);
    alert('Could not find the Cin7 comment fields.\n\nThe custom comments have been copied to your clipboard.');
  }

  function openPanel() {
    const root = ensureRoot();
    root.shadowRoot.getElementById('lc-custom-comments-modal').classList.add('open');
    setStatus('');

    setTimeout(() => {
      root.shadowRoot.getElementById('lc-cc-height')?.focus();
    }, 80);
  }

  function closePanel() {
    const root = document.getElementById(ROOT_ID);
    root?.shadowRoot?.getElementById('lc-custom-comments-modal')?.classList.remove('open');
  }

  function setModalPassthrough(enabled) {
    const root = document.getElementById(ROOT_ID);
    const modal = root?.shadowRoot?.getElementById('lc-custom-comments-modal');
    if (!modal) return;

    modal.classList.toggle('working', Boolean(enabled));
  }

  function findButtonByText(label) {
    const wanted = label.toLowerCase();

    return visibleElements('button, a, [role="button"]')
      .find(element => clean(element.textContent || '').toLowerCase() === wanted) || null;
  }

  function findQuoteToolbarAnchor() {
    return (
      findButtonByText('Custom Products') ||
      findButtonByText('Install Fees') ||
      findButtonByText('NZ Availability') ||
      findButtonByText('Scan') ||
      findButtonByText('Family')
    );
  }

  function insertButton() {
    const anchor = findQuoteToolbarAnchor();
    if (!anchor) return;

    let button = document.getElementById(BUTTON_ID);

    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Custom Comments';

      button.addEventListener('mouseenter', () => {
        button.style.background = '#04b5aa';
        button.style.borderColor = '#04b5aa';
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = '#05cabe';
        button.style.borderColor = '#05cabe';
      });

      button.addEventListener('click', openPanel);
    }

    button.className = anchor.className || '';
    button.style.background = '#05cabe';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cabe';
    button.style.borderRadius = '4px';
    button.style.padding = window.getComputedStyle(anchor).padding || '0 16px';
    button.style.height = window.getComputedStyle(anchor).height || 'auto';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.whiteSpace = 'nowrap';
    button.style.marginLeft = '8px';
    button.style.boxSizing = 'border-box';

    if (anchor.nextElementSibling !== button) {
      anchor.insertAdjacentElement('afterend', button);
    }
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);

    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; font-family: Arial, sans-serif; }
        #lc-custom-comments-modal {
          position: fixed;
          inset: 0;
          display: none;
          align-items: flex-start;
          justify-content: center;
          padding-top: 82px;
          background: rgba(28, 37, 42, .28);
          z-index: 2147483647;
          box-sizing: border-box;
        }
        #lc-custom-comments-modal.open { display: flex; }
        #lc-custom-comments-modal.working {
          pointer-events: none;
          background: transparent;
        }
        #lc-custom-comments-modal.working .panel {
          opacity: .38;
        }
        .panel {
          width: min(440px, calc(100vw - 28px));
          background: #fff;
          border: 1px solid #c8d3df;
          border-radius: 8px;
          box-shadow: 0 22px 54px rgba(28, 37, 42, .22);
          color: #2f3742;
          overflow: hidden;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          background: #0f6f78;
          color: #fff;
        }
        .header h2 {
          margin: 0;
          font-size: 17px;
          line-height: 1.2;
          letter-spacing: 0;
        }
        .close {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 4px;
          background: rgba(255,255,255,.16);
          color: #fff;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
        }
        form {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 16px;
        }
        label {
          display: grid;
          gap: 5px;
          color: #46515d;
          font-size: 12px;
          font-weight: 700;
        }
        label.full { grid-column: 1 / -1; }
        input, select {
          min-width: 0;
          height: 38px;
          border: 1px solid #b9c7d6;
          border-radius: 4px;
          padding: 0 10px;
          font: 14px Arial, sans-serif;
          color: #2f3742;
          background: #fff;
          box-sizing: border-box;
        }
        input:focus, select:focus {
          outline: 2px solid rgba(5, 202, 190, .24);
          border-color: #05bdb2;
        }
        .actions {
          grid-column: 1 / -1;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 4px;
        }
        .actions button {
          min-height: 38px;
          border-radius: 4px;
          border: 1px solid #b9c7d6;
          padding: 0 14px;
          font: 700 14px Arial, sans-serif;
          cursor: pointer;
        }
        .secondary { background: #fff; color: #35404a; }
        .primary { background: #05cabe; border-color: #05cabe !important; color: #fff; }
        #lc-cc-status {
          grid-column: 1 / -1;
          min-height: 18px;
          color: #21725d;
          font-size: 12px;
          font-weight: 700;
        }
        #lc-cc-status.error { color: #a63a2a; }
        @media (max-width: 520px) {
          form { grid-template-columns: 1fr; }
        }
      </style>
      <div id="lc-custom-comments-modal" role="dialog" aria-modal="true" aria-labelledby="lc-cc-title">
        <div class="panel">
          <div class="header">
            <h2 id="lc-cc-title">Custom Comments</h2>
            <button type="button" class="close" id="lc-cc-close" aria-label="Close">×</button>
          </div>
          <form id="lc-cc-form">
            <label class="full">
              Type
              <select id="lc-cc-type">
                <option value="freestanding">Freestanding</option>
                <option value="wall">Wall Mounted</option>
              </select>
            </label>
            <label>
              Height (mm)
              <input id="lc-cc-height" inputmode="numeric" />
            </label>
            <label>
              Length (mm)
              <input id="lc-cc-length" inputmode="numeric" />
            </label>
            <label>
              Width (mm)
              <input id="lc-cc-width" inputmode="numeric" />
            </label>
            <label>
              Frame colour
              <input id="lc-cc-frame-colour" />
            </label>
            <label>
              Louvre colour
              <input id="lc-cc-louvre-colour" />
            </label>
            <label>
              Additional notes
              <input id="lc-cc-notes" />
            </label>
            <div id="lc-cc-status"></div>
            <div class="actions">
              <button type="button" class="secondary" id="lc-cc-copy">Copy</button>
              <button type="submit" class="primary">Fill comments</button>
            </div>
          </form>
        </div>
      </div>
    `;

    shadow.getElementById('lc-cc-close').addEventListener('click', closePanel);
    shadow.getElementById('lc-custom-comments-modal').addEventListener('click', event => {
      if (event.target?.id === 'lc-custom-comments-modal') closePanel();
    });
    shadow.getElementById('lc-cc-copy').addEventListener('click', async () => {
      const data = getFormData();
      if (!data) return;
      const missing = validateData(data);
      if (missing.length) {
        setStatus(`Enter ${missing.join(', ')}.`, true);
        return;
      }
      await copyText(buildComment(data));
      setStatus('Copied custom comments.');
    });
    shadow.getElementById('lc-cc-form').addEventListener('submit', event => {
      event.preventDefault();
      fillCommentsFromForm();
    });

    return root;
  }

  function boot() {
    ensureRoot();
    insertButton();
  }

  boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 3000);

  const observer = new MutationObserver(() => {
    insertButton();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
