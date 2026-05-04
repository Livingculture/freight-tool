// ==UserScript==
// @name         Living Culture Copy SKU
// @namespace    livingculture
// @version      1.4
// @description  Adds a button to Living Culture product pages to copy the current product SKU.
// @match        https://livingculture.co.nz/products/*
// @match        https://www.livingculture.co.nz/products/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-copy-sku.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/livingculture-copy-sku.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const state = {
    product: null,
    sku: '',
    variantId: ''
  };

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function setStatus(message, error = false) {
    const status = document.getElementById('lc-copy-sku-panel')?.shadowRoot?.getElementById('lc-copy-sku-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = error ? '#9a2d20' : '#2d5c4e';
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getProductJsonUrl() {
    return `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}.js`;
  }

  function getSelectedVariantId() {
    const urlVariant = new URL(window.location.href).searchParams.get('variant');
    if (urlVariant) return urlVariant;

    const form = document.querySelector('form[action*="/cart/add"]');
    const formVariant = form?.querySelector('[name="id"]')?.value;
    if (formVariant) return formVariant;

    return document.querySelector('[name="id"]')?.value || '';
  }

  function getSkuFromPageText() {
    const text = document.body?.innerText || '';
    return clean(
      text.match(/\bSKU\s*:?\s*([A-Z]{1,8}\d{3,}(?:-\d+)?)\b/i)?.[1] ||
      text.match(/\b([A-Z]{1,8}\d{3,}(?:-\d+)?)\b/)?.[1] ||
      ''
    ).toUpperCase();
  }

  function resolveCurrentSku() {
    const product = state.product;
    const selectedVariantId = getSelectedVariantId();
    state.variantId = selectedVariantId;

    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const selectedVariant =
      variants.find(variant => String(variant.id) === String(selectedVariantId)) ||
      variants.find(variant => variant.available) ||
      variants[0];

    state.sku = clean(selectedVariant?.sku || getSkuFromPageText()).toUpperCase();
    return state.sku;
  }

  function findSkuElement(sku) {
    const wantedSku = clean(sku).toUpperCase();
    if (!wantedSku) return null;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = clean(node.nodeValue).toUpperCase();
        if (!text.includes(wantedSku) && !/^SKU\b/i.test(text)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('#lc-copy-sku-panel, script, style, noscript')) return NodeFilter.FILTER_REJECT;
        return isVisible(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const matches = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      const text = clean(parent?.textContent || '');
      if (parent && text.length < 180 && (text.toUpperCase().includes(wantedSku) || /^SKU\b/i.test(text))) {
        matches.push(parent);
      }
      node = walker.nextNode();
    }

    return matches
      .sort((a, b) => clean(a.textContent).length - clean(b.textContent).length)[0] || null;
  }

  function positionPanel() {
    const panel = document.getElementById('lc-copy-sku-panel');
    if (!panel) return;

    const sku = resolveCurrentSku();
    const target = findSkuElement(sku);
    panel.classList.toggle('is-floating', !target);
    panel.classList.toggle('is-inline', Boolean(target));

    if (target && panel.parentElement !== target.parentElement) {
      target.insertAdjacentElement('afterend', panel);
    } else if (target && target.nextElementSibling !== panel) {
      target.insertAdjacentElement('afterend', panel);
    } else if (!target && panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  }

  async function loadProduct() {
    if (state.product) return state.product;

    const response = await fetch(getProductJsonUrl(), { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not load product details.');

    state.product = await response.json();
    resolveCurrentSku();
    return state.product;
  }

  async function copySku(button) {
    try {
      await loadProduct();
      const sku = resolveCurrentSku();

      if (!sku) {
        setStatus('SKU not found.', true);
        return;
      }

      await navigator.clipboard.writeText(sku);
      const oldText = button.textContent;
      button.textContent = 'Copied';
      setStatus(`Copied ${sku}`);
      setTimeout(() => {
        button.textContent = oldText;
      }, 1200);
    } catch (error) {
      console.error(error);
      const fallbackSku = getSkuFromPageText();
      if (fallbackSku) {
        await navigator.clipboard.writeText(fallbackSku);
        setStatus(`Copied ${fallbackSku}`);
        return;
      }
      setStatus(error.message || 'Could not copy SKU.', true);
    }
  }

  function createButton() {
    if (document.getElementById('lc-copy-sku-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'lc-copy-sku-panel';
    panel.attachShadow({ mode: 'open' });
    panel.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          z-index: 2147483647;
          display: inline-grid;
          gap: 7px;
          justify-items: start;
          font: 13px/1.35 Arial, sans-serif;
        }

        :host(.is-inline) {
          margin-left: 10px;
          vertical-align: middle;
        }

        :host(.is-floating) {
          position: fixed;
          right: 22px;
          bottom: 22px;
          justify-items: end;
        }

        #lc-copy-sku-button {
          all: initial;
          appearance: none;
          box-sizing: border-box;
          opacity: 1;
          filter: none;
          mix-blend-mode: normal;
          min-width: 86px;
          min-height: 32px;
          padding: 7px 12px;
          color: #fff;
          background: #ff3131;
          background-color: #ff3131;
          border: 1px solid #ff3131;
          border-radius: 8px;
          box-shadow: 0 8px 22px rgba(0,0,0,.18);
          font: 800 12px Arial, sans-serif;
          line-height: 1.35;
          text-align: center;
          cursor: pointer;
          user-select: none;
        }

        #lc-copy-sku-button:hover {
          background: #c90000;
          background-color: #c90000;
          border-color: #c90000;
        }

        #lc-copy-sku-button:active {
          background: #990000;
          background-color: #990000;
          border-color: #990000;
        }

        #lc-copy-sku-status {
          all: initial;
          box-sizing: border-box;
          min-height: 18px;
          max-width: 180px;
          padding: 5px 8px;
          color: #2d5c4e;
          background: rgba(255,255,255,.96);
          border: 1px solid #d9d6cc;
          border-radius: 8px;
          text-align: right;
          box-shadow: 0 8px 18px rgba(0,0,0,.1);
          font: 13px/1.35 Arial, sans-serif;
        }

        #lc-copy-sku-status:empty {
          display: none;
        }
      </style>
      <button type="button" id="lc-copy-sku-button">Copy SKU</button>
      <div id="lc-copy-sku-status"></div>
    `;
    document.body.appendChild(panel);

    const button = panel.shadowRoot.querySelector('#lc-copy-sku-button');
    button.addEventListener('click', () => copySku(button));

    loadProduct()
      .catch(error => {
        console.error(error);
        resolveCurrentSku();
      })
      .finally(positionPanel);
  }

  function boot() {
    if (!document.body) return;
    createButton();
  }

  boot();
  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('popstate', () => {
    setTimeout(positionPanel, 100);
  });
  document.addEventListener('change', event => {
    if (event.target?.matches?.('[name="id"], select, input[type="radio"]')) {
      setTimeout(positionPanel, 100);
    }
  });
  setInterval(positionPanel, 1500);
})();
