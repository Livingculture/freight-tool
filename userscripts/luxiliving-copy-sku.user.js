// ==UserScript==
// @name         Luxi Living Copy SKU
// @namespace    livingculture
// @version      1.0
// @description  Adds a button to Luxi Living product pages to copy the current product SKU.
// @match        https://luxiliving.com.au/products/*
// @match        https://www.luxiliving.com.au/products/*
// @match        https://luxiliving.com.au/collections/*/products/*
// @match        https://www.luxiliving.com.au/collections/*/products/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/luxiliving-copy-sku.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/luxiliving-copy-sku.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'luxi-copy-sku-panel';

  const state = {
    product: null,
    productUrl: '',
    sku: '',
    variantId: ''
  };

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden';
  }

  function isProductPage() {
    return /\/products\//.test(window.location.pathname);
  }

  function getProductJsonUrl() {
    const path = window.location.pathname.replace(/\/$/, '');
    const productMatch = path.match(/\/products\/([^/?#]+)/);

    if (!productMatch?.[1]) return '';

    return `${window.location.origin}/products/${productMatch[1]}.js`;
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

    if (!wantedSku || !document.body) return null;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = clean(node.nodeValue).toUpperCase();

        if (!text.includes(wantedSku) && !/^SKU\b/i.test(text)) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;

        if (!parent || parent.closest(`#${PANEL_ID}, script, style, noscript`)) {
          return NodeFilter.FILTER_REJECT;
        }

        return isVisible(parent)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    const matches = [];
    let node = walker.nextNode();

    while (node) {
      const parent = node.parentElement;
      const text = clean(parent?.textContent || '');

      if (
        parent &&
        text.length < 180 &&
        (text.toUpperCase().includes(wantedSku) || /^SKU\b/i.test(text))
      ) {
        matches.push(parent);
      }

      node = walker.nextNode();
    }

    return matches.sort((a, b) =>
      clean(a.textContent).length - clean(b.textContent).length
    )[0] || null;
  }

  function positionPanel() {
    const panel = document.getElementById(PANEL_ID);

    if (!panel) return;

    if (!isProductPage()) {
      panel.remove();
      return;
    }

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
    const productJsonUrl = getProductJsonUrl();

    if (!productJsonUrl) {
      throw new Error('Not a product page.');
    }

    if (state.product && state.productUrl === productJsonUrl) {
      return state.product;
    }

    const response = await fetch(productJsonUrl, { credentials: 'same-origin' });

    if (!response.ok) {
      throw new Error('Could not load product details.');
    }

    state.product = await response.json();
    state.productUrl = productJsonUrl;

    resolveCurrentSku();

    return state.product;
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    document.execCommand('copy');
    textarea.remove();
  }

  async function copySku(button) {
    const originalText = 'Copy SKU';

    try {
      await loadProduct();

      const sku = resolveCurrentSku();

      if (!sku) {
        button.textContent = 'SKU not found';

        setTimeout(() => {
          button.textContent = originalText;
        }, 1400);

        return;
      }

      await copyText(sku);

      button.textContent = 'SKU copied';

      setTimeout(() => {
        button.textContent = originalText;
      }, 1200);
    } catch (error) {
      console.error(error);

      const fallbackSku = getSkuFromPageText();

      if (fallbackSku) {
        await copyText(fallbackSku);
        button.textContent = 'SKU copied';

        setTimeout(() => {
          button.textContent = originalText;
        }, 1200);

        return;
      }

      button.textContent = 'Copy failed';

      setTimeout(() => {
        button.textContent = originalText;
      }, 1400);
    }
  }

  function createButton() {
    if (!isProductPage()) return;
    if (document.getElementById(PANEL_ID)) return;
    if (!document.body) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    panel.attachShadow({ mode: 'open' });

    panel.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          z-index: 2147483647;
          display: inline-grid;
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

        #luxi-copy-sku-button {
          all: initial;
          appearance: none;
          box-sizing: border-box;
          opacity: 1;
          filter: none;
          mix-blend-mode: normal;
          min-width: 96px;
          min-height: 36px;
          padding: 7px 13px;
          color: #fff;
          background: #ff0000;
          border: 1px solid #ff0000;
          border-radius: 9px;
          box-shadow: 0 6px 16px rgba(0,0,0,.14);
          font: 800 14px Arial, sans-serif;
          line-height: 1.25;
          text-align: center;
          cursor: pointer;
          user-select: none;
        }

        #luxi-copy-sku-button:hover {
          background: #d90000;
          border-color: #d90000;
        }

        #luxi-copy-sku-button:active {
          background: #b00000;
          border-color: #b00000;
        }
      </style>

      <button type="button" id="luxi-copy-sku-button">Copy SKU</button>
    `;

    document.body.appendChild(panel);

    const button = panel.shadowRoot.querySelector('#luxi-copy-sku-button');

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
    positionPanel();
  }

  function handlePageChange() {
    state.product = null;
    state.productUrl = '';
    state.sku = '';
    state.variantId = '';

    setTimeout(boot, 150);
  }

  boot();

  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('popstate', handlePageChange);

  document.addEventListener('change', event => {
    if (event.target?.matches?.('[name="id"], select, input[type="radio"]')) {
      setTimeout(positionPanel, 100);
    }
  });

  setInterval(() => {
    if (isProductPage()) {
      boot();
    }
  }, 1500);
})();
