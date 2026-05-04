// ==UserScript==
// @name         Living Culture Copy SKU
// @namespace    livingculture
// @version      1.0
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
    const status = document.getElementById('lc-copy-sku-status');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = error ? '#9a2d20' : '#2d5c4e';
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
    panel.innerHTML = `
      <button type="button" id="lc-copy-sku-button">Copy SKU</button>
      <div id="lc-copy-sku-status"></div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #lc-copy-sku-panel {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 2147483647;
        display: grid;
        gap: 7px;
        justify-items: end;
        font: 13px/1.35 Arial, sans-serif;
      }

      #lc-copy-sku-button {
        min-width: 116px;
        min-height: 38px;
        padding: 9px 14px;
        color: #fff;
        background: #05cabe;
        border: 0;
        border-radius: 10px;
        box-shadow: 0 8px 22px rgba(0,0,0,.18);
        font: 800 13px Arial, sans-serif;
        cursor: pointer;
      }

      #lc-copy-sku-status {
        min-height: 18px;
        max-width: 180px;
        padding: 5px 8px;
        color: #2d5c4e;
        background: rgba(255,255,255,.92);
        border: 1px solid #d9d6cc;
        border-radius: 8px;
        text-align: right;
        box-shadow: 0 8px 18px rgba(0,0,0,.1);
      }

      #lc-copy-sku-status:empty {
        display: none;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    const button = panel.querySelector('#lc-copy-sku-button');
    button.addEventListener('click', () => copySku(button));

    loadProduct().catch(error => {
      console.error(error);
      resolveCurrentSku();
    });
  }

  function boot() {
    if (!document.body) return;
    createButton();
  }

  boot();
  window.addEventListener('load', boot);
  document.addEventListener('DOMContentLoaded', boot);
  window.addEventListener('popstate', () => {
    setTimeout(resolveCurrentSku, 100);
  });
  document.addEventListener('change', event => {
    if (event.target?.matches?.('[name="id"], select, input[type="radio"]')) {
      setTimeout(resolveCurrentSku, 100);
    }
  });
})();
