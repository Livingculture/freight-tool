// ==UserScript==
// @name         Cin7 Living Culture Installation Fee Helper
// @namespace    livingculture-cin7
// @version      2.9
// @description  Shows Living Culture installation fee SKUs and prices inside Cin7 for quick add.
// @match        https://*.cin7.com/*
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-install-fee-helper.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-install-fee-helper.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      drive.google.com
// @connect      googleusercontent.com
// @connect      docs.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  // Add a shared Google Sheet/Drive CSV URL here. Leave blank to use the built-in fallback data.
  const REMOTE_DATA_URL = '';
  const CACHE_KEY = 'lc-install-fee-data-v1';
  const CACHE_TIME_KEY = 'lc-install-fee-data-time-v1';

  const RAW_DATA = `
Product Code	Name	Price
AS10172	Assembly Call Out Fee	150
AS10173	Assembly assessment or Repair Under Warranty	0
AS10170	Assembly Electrician Standard charge	750
AS10098	Assembly Custom flashing 1-4m (Included Custom Flashing)	900
AS10099	Assembly Custom flashing 4.1-8m (Included Custom Flashing)	1200
AS10100	Assembly Custom flashing 8.1-12m (Included Custom Flashing)	1500
AS10177	Assembly Custom flashing 12.1-20m (Included Custom Flashing)	1800
AS00039	Post and Blind Track Cutting Service	80
AS10119	Assembly Fascia/Soffit Wall Mounted Pergola Bracket	90
AS10118	Assembly Wall Mount Timber190x45H3.2over4m (Inculde Timber&installation)	500
AS10117	Assembly Wall Mount Timber190x45H3.2under4m (Inculde Timber&installation)	400
AS10097	Assembly Concrete pad size under L400xW400xH400mm	400
AS10174	Assembly Reinforce the joists under the deck Per Post	200
AS10120	Assembly Gutter Remove and install back	300
AS10022	Assembly Window/door cover Up to 6m²	1000
AS10024	Assembly Window/door cover 6.1-10m²	1200
AS10016	Assembly Awning Manual Up to 15m²	1000
AS10012	Assembly Awning Motorised Up to 12m²	1200
AS10013	Assembly Awning Motorised 12.1-18m²	1500
AS10008	Assembly Wall Mount PatioCover Up to 16m²	1600
AS10010	Assembly Wall Mount PatioCover 16.1-24m²	2000
AS10017	Assembly Freestanding Single Carport 5.5x3m On Concrete Pad	2000
AS10018	Assembly Freestanding Double Carport 5.5x6m On Concrete Pad	3500
AS10069	Assembly Manual Blind Under 4m (Post to Post)	250
AS10169	Assembly Manual Blind over 4.1m with Extra Post (Post to Post)	450
AS10176	Assembly Manual Wall Mount Blind Under 4m ( Post To Wall)	450
AS10140	Assembly Motorised Blind Under 4m	500
AS10175	Assembly Motorised Blind Over 4.1m	650
AS10116	Assembly Patterned Privacy Panel - per panel	200
AS10020	Assembly Louvre Shutter Wall - per panel 1.5m and under	250
AS10068	Assembly Tongue and Groove / Slatted Privacy Wall Under 1.5m Per Panel	300
AS10101	Assembly Tongue and Groove / Slatted Privacy Wall over 1.5m Per Panel	350
AS10063	Assembly glass sliding door for Pergola 4m and under	900
AS10064	Assembly glass sliding door for Pergola over 4.1m	1000
SK-00088	Assembly Bifold Glass Door 4m and under	1000
AS10122	Assembly Bifold Glass Door 4.1m-5m	1100
AS10123	Assembly Bifold Glass Door 5.1m-6m	1200
AS10065	Assembly Shutter Sliding door 4m and under	700
AS10067	Assembly Shutter Sliding door Over 4.1m	900
AS10124	Assembly Bifold Shutter Door Under 4m	800
AS10125	Assembly Bifold Shutter Door 4.1m - 5m	900
AS10126	Assembly Bifold Shutter Door 5.1m-6m	1000
AS10075	Assembly Freestanding Manual Pergola Atlantic up to 15m²	1300
AS10076	Assembly Freestanding Manual Pergola Atlantic 15.1-20m²	1600
AS10026	Assembly Freestanding Manual Pergola Baltic Up to 9m²	1200
AS10028	Assembly Freestanding Manual Pergola Baltic 9.1-14m²	1500
AS10073	Assembly Freestanding Manual Pergola Baltic 14.1-20m²	1800
AS10072	Assembly Freestanding Manual Pergola Baltic 20.1-30m²	2200
AS10040	Assembly Wall Mount Manual Pergola Baltic Up to 9m²	1400
AS10043	Assembly Wall Mount Manual Pergola Baltic 9.1-14m²	1700
AS10045	Assembly Wall Mount Manual Pergola Baltic 14.1-20m²	2300
AS10047	Assembly Wall Mount Manual Pergola Baltic 20.1-30m²	2500
AS10006	Assembly Freestanding Motorised Pergola Baltic Up to 9m²	1400
AS10032	Assembly Freestanding Motorised Pergola Baltic 9.1-14m²	1700
AS10034	Assembly Freestanding Motorised Pergola Baltic 14.1-20m²	2100
AS10036	Assembly Freestanding Motorised Pergola Baltic 20.1-30m²	2300
AS10049	Assembly Wall Mount Motorised Pergola Baltic Up to 9m²	1700
AS10051	Assembly Wall Mount Motorised Pergola Baltic 9.1-14m²	2200
AS10053	Assembly Wall Mount Motorised Pergola Baltic 14.1-20m²	2600
AS10055	Assembly Wall Mount Motorised Pergola Baltic 20.1-30m²	2800
AS10077	Assembly Freestanding Manual Pergola Caspian up to 12m²	1500
AS10078	Assembly Freestanding Manual Pergola Caspian 12.1-17m²	1800
AS10103	Assembly Freestanding Manual Pergola Caspian 17.1-25m²	2300
AS10090	Assembly Wall Mount Manual Pergola Caspian Up to 12m²	1900
AS10089	Assembly Wall Mount Manual Pergola Caspian 12.1-17m²	2600
AS10102	Assembly Wall Mount Manual Pergola Caspian 17.1-25m²	2800
AS10084	Assembly Freestanding Motorised Pergola Caspian Up to 12m²	1500
AS10086	Assembly Freestanding Motorised Pergola Caspian 12.1-17m²	1900
AS10087	Assembly Freestanding Motorised Pergola Caspian 17.1-25m²	2300
AS10093	Assembly Wall Mount Motorised Pergola Caspian Up to 12m²	1900
AS10094	Assembly Wall Mount Motorised Pergola Caspian12.1-17m²	2500
AS10096	Assembly Wall Mount Motorised Pergola Caspian 17.1-25m²	2800
AS10000	Assembly Freestanding Motorised Pergola Caribbean Up to 16m²	1800
AS10002	Assembly Freestanding Motorised Pergola Caribbean 16.1-24m²	2200
AS10004	Assembly Freestanding Motorised Pergola Caribbean 24.1-30m²	2500
AS10056	Assembly Wall Mount Motorised Pergola CaribbeanUp to 16m²	2400
AS10058	Assembly Wall Mount Motorised Pergola Caribbean16.1-24m²	3000
AS10060	Assembly Wall Mount Motorised Pergola Caribbean 24.1-30m²	3200
AS10037	Assembly Freestanding Motorised Pergola Tasman Up to 16m²	2000
AS10081	Assembly Freestanding Motorised Pergola Tasman 16.1-24m²	2400
AS10082	Assembly Freestanding Motorised Pergola Tasman 24.1-32m²	3000
AS10107	Assembly Wall Mount Motorised Pergola Tasman Up to 16m²	2600
AS10111	Assembly Wall Mount Motorised Pergola Tasman 16.1-24m²	3000
AS10112	Assembly Wall Mount Motorised Pergola Tasman 24.1-32m²	3600
AS10143	Assembly Freestanding Motorised Pergola Pacific 4.1x4.6m/6.1x4.6m	2500
AS10148	Assembly Freestanding Motorised Pergola Pacific 5.1mx5.1m/6.1x5.1m/6.1x6.1/8.1x4.6m/8.1x5.1m	4200
AS10150	Assembly Freestanding Motorised Pergola Pacific 8.1x6.1m/10.1x6.1m	5500
AS10152	Assembly Wall Mount Motorised Pergola Pacific 4.1x4.5m/5.1x4.5m/6.1x4.5m	3000
AS10156	Assembly Wall Mount Motorised Pergola Pacific 5.1x5m/6.1x5m/8.1x5m	4900
AS10159	Assembly Freestanding Mediterranean-SKY Motorised Up to 16m²	3600
AS10162	Assembly Freestanding Mediterranean-SKY Motorised 16.1-24m²	4000
AS10165	Assembly Wall Mount Mediterranean-SKY Motorised Up to 16m²	4600
AS10168	Assembly Wall Mount Mediterranean-SKY Motorised 16.1-24m²	5000
AS10127	Assembly Aluminium Pool Fence Panel - Vertical (1.2H) & Post with Base Plate Mount onto Concrete or Timber Surface only (Min 10M)	95
AS10128	Aluminium Pool Fence Panel - Vertical (1.2H) & Post with with Bury into concrete (Min 10M)	115
AS10129	Assembly Aluminium Pool Gate (1.2H) (Assembly Service only available with Fence assembly service order)	150
AS10130	Assembly Aluminium Blade Fence Panel - Vertical (1.8H) & Post with Base Plate Mount onto Concrete or Timber Surface only (Min 10M)	105
AS10131	Assembly Aluminium Blade Fence Panel - Vertical (1.8H) & Post with Bury into concrete (Min 10M)	135
AS10132	Assembly Aluminium Blade Gate (Assembly Service only available with Fence assembly service order)	300
AS10133	Assembly Aluminium Slat Privacy Fence Panel - Horizontal (1.8H)& Post with Base Plate Mount onto Concrete or Timber Surface only (Min 10M)	135
AS10134	Assembly Aluminium Slat Privacy Fence Panel - Horizontal (1.8H) & Post with Bury into concrete (Min 10M)	165
AS10135	Assembly Aluminium Slat Privacy Gate (Assembly Service only available with Fence assembly service order)	300
AS10136	Assembly Lincoln Aluminium Privacy Slat Gate & Post with Base Plate Mount onto Concrete (3M Gate & under)	800
AS10137	Assembly Lincoln Aluminium Privacy Slat Gate & Post with Post with Bury into concrete (3M Gate & under)	1200
AS10138	Assembly Roosevelt Motorised Sliding Gate & Post with Base Plate Mount onto Concrete (5M Gate & under)	1500
AS10139	Assembly Roosevelt Motorised Sliding Gate & Post with Post with Bury into concrete (5M Gate & under)	1800
`;

  let dataSourceLabel = 'Built-in fallback pricing';
  let items = parseData(readCachedRawData() || RAW_DATA);
  let filteredItems = items;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function parseCsvLine(line) {
    const values = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];

      if (char === '"' && quoted && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(value);
        value = '';
      } else {
        value += char;
      }
    }

    values.push(value);
    return values;
  }

  function parseData(raw) {
    const lines = String(raw || '').trim().split(/\r?\n/).filter(Boolean);
    const delimiter = lines[0]?.includes('\t') ? '\t' : ',';

    return lines
      .slice(1)
      .map(line => {
        const parts = delimiter === '\t' ? line.split('\t') : parseCsvLine(line);

        return {
          code: clean(parts[0]),
          name: clean(parts[1]),
          price: clean(parts[2])
        };
      })
      .filter(item => item.code && item.name && item.price !== '');
  }

  function readCachedRawData() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);

      if (!cached || !parseData(cached).length) return '';

      const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY)) || 0;
      const ageHours = cachedAt ? Math.round((Date.now() - cachedAt) / 36e5) : 0;

      dataSourceLabel = ageHours
        ? `Google Drive pricing from cache (${ageHours}h old)`
        : 'Google Drive pricing from cache';

      return cached;
    } catch (error) {
      console.warn(error);
      return '';
    }
  }

  function normaliseRemoteDataUrl(url) {
    const value = clean(url);

    if (!value) return '';

    const sheetMatch = value.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);

    if (sheetMatch) {
      const gid = value.match(/[?&]gid=(\d+)/i)?.[1] || '0';
      return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv&gid=${gid}`;
    }

    const driveFileMatch = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i);

    if (driveFileMatch) {
      return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
    }

    return value;
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: {
            'Cache-Control': 'no-cache'
          },
          onload: response => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.responseText || '');
            } else {
              reject(new Error(`Google data returned ${response.status}`));
            }
          },
          onerror: () => reject(new Error('Could not load Google data'))
        });

        return;
      }

      fetch(url, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`Google data returned ${response.status}`);
          return response.text();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function setSourceLabel(label) {
    const root = document.getElementById('lc-install-fee-root');
    const source = root?.shadowRoot?.getElementById('lc-install-fee-source');

    dataSourceLabel = label || dataSourceLabel;

    if (source) source.textContent = dataSourceLabel;
  }

  async function loadRemoteInstallFees() {
    const remoteUrl = normaliseRemoteDataUrl(REMOTE_DATA_URL);

    if (!remoteUrl) {
      setSourceLabel(dataSourceLabel);
      return false;
    }

    setSourceLabel('Loading Google Drive pricing...');

    try {
      const raw = await requestText(remoteUrl);
      const nextItems = parseData(raw);

      if (!nextItems.length) {
        throw new Error('Google data had no install-fee rows');
      }

      items = nextItems;
      filteredItems = items;

      localStorage.setItem(CACHE_KEY, raw);
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));

      setSourceLabel('Google Drive pricing loaded');

      const root = document.getElementById('lc-install-fee-root');
      const search = root?.shadowRoot?.getElementById('lc-install-fee-search');

      filterItems(search?.value || '');
      return true;
    } catch (error) {
      console.warn(error);
      setSourceLabel(`${dataSourceLabel} - Google data unavailable`);
      renderRows();
      return false;
    }
  }

  function getCleanPrice(price) {
    return String(price || '').replace(/[^\d.]/g, '');
  }

  function formatPrice(price) {
    const number = Number(String(price || '').replace(/[^\d.-]/g, ''));
    if (Number.isNaN(number)) return String(price || '');
    return number.toLocaleString('en-NZ', { maximumFractionDigits: 0 });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
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
  }

  function closeModal() {
    const root = document.getElementById('lc-install-fee-root');
    const modal = root?.shadowRoot?.getElementById('lc-install-fee-modal');
    if (modal) modal.classList.remove('open');
  }

  function openModal() {
    const root = document.getElementById('lc-install-fee-root');
    const modal = root?.shadowRoot?.getElementById('lc-install-fee-modal');
    const search = root?.shadowRoot?.getElementById('lc-install-fee-search');

    if (!modal) return;

    modal.classList.add('open');
    loadRemoteInstallFees();
    setTimeout(() => search?.focus(), 50);
  }

  function setInstallFeeModalPassthrough(enabled) {
    const root = document.getElementById('lc-install-fee-root');
    const modal = root?.shadowRoot?.getElementById('lc-install-fee-modal');

    if (!modal) return;

    if (enabled) {
      modal.classList.add('working');
    } else {
      modal.classList.remove('working');
    }
  }

  function showToast(message) {
    const root = document.getElementById('lc-install-fee-root');
    const toast = root?.shadowRoot?.getElementById('lc-install-fee-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 1700);
  }

  function isElementVisible(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  }

  function setNativeInputValue(input, value) {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter) {
      valueSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: String(value).slice(-1) || ' ' }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: String(value).slice(-1) || ' ' }));
  }

  function setInputOrEditableValue(element, value) {
    if (!element) return false;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus();
      setNativeInputValue(element, value);
      return true;
    }

    if (element.isContentEditable) {
      element.focus();
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    return false;
  }

  function visibleElements() {
    return Array.from(document.querySelectorAll('body *')).filter(element => {
      if (!isElementVisible(element)) return false;
      if (element.closest('#lc-install-fee-root')) return false;
      return true;
    });
  }

  function findLowestQuoteSection() {
    const quoteRects = visibleElements()
      .filter(element => clean(element.textContent || '').toLowerCase() === 'quote')
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);

    return quoteRects.sort((a, b) => b.top - a.top)[0] || null;
  }

  function findAdditionalChargesSection() {
    const quoteRect = findLowestQuoteSection();

    const matches = visibleElements()
      .filter(element =>
        clean(element.textContent || '').toLowerCase().includes('additional charges and services')
      )
      .map(element => element.getBoundingClientRect())
      .filter(rect => {
        if (!quoteRect) return true;
        return rect.top > quoteRect.top;
      })
      .filter(rect => rect.width > 0 && rect.height > 0);

    return matches.sort((a, b) => a.top - b.top)[0] || null;
  }

  function findHeaderRect(headerText) {
    const quoteRect = findLowestQuoteSection();
    if (!quoteRect) return null;

    const matches = visibleElements()
      .filter(element => clean(element.textContent || '').toLowerCase() === headerText.toLowerCase())
      .map(element => element.getBoundingClientRect())
      .filter(rect => {
        if (rect.top < quoteRect.top) return false;
        if (rect.top > quoteRect.top + 360) return false;
        return rect.width > 0 && rect.height > 0;
      });

    return matches.sort((a, b) => {
      const ad = Math.abs((a.top - quoteRect.top) - 150);
      const bd = Math.abs((b.top - quoteRect.top) - 150);
      return ad - bd;
    })[0] || null;
  }

  function findNextEmptyProductRow(productHeader) {
    const quoteRect = findLowestQuoteSection();
    const additionalRect = findAdditionalChargesSection();

    if (!quoteRect || !productHeader) return null;

    const candidates = visibleElements()
      .filter(element => {
        const text = clean(element.textContent || '').toLowerCase();
        if (!text.includes('type to search')) return false;

        const rect = element.getBoundingClientRect();

        if (rect.top <= productHeader.bottom) return false;
        if (rect.top < quoteRect.top) return false;
        if (additionalRect && rect.top > additionalRect.top) return false;
        if (rect.left > window.innerWidth * 0.55) return false;
        if (rect.top < productHeader.bottom + 10) return false;

        return true;
      })
      .map(element => ({
        element,
        rect: element.getBoundingClientRect()
      }))
      .sort((a, b) => a.rect.top - b.rect.top);

    return candidates[0] || null;
  }

  function clickAt(x, y) {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;

    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        })
      );
    });

    return element;
  }

  function findActiveInputNear(x, y, maxDistance = 220) {
    const active = document.activeElement;

    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active?.isContentEditable
    ) {
      const rect = active.getBoundingClientRect();
      const dx = Math.abs(rect.left + rect.width / 2 - x);
      const dy = Math.abs(rect.top + rect.height / 2 - y);

      if (dx < maxDistance && dy < maxDistance) {
        return active;
      }
    }

    const possible = Array.from(
      document.querySelectorAll('input, textarea, [contenteditable="true"]')
    ).filter(element => {
      if (!isElementVisible(element)) return false;
      if (element.closest('#lc-install-fee-root')) return false;

      const rect = element.getBoundingClientRect();
      const dx = Math.abs(rect.left + rect.width / 2 - x);
      const dy = Math.abs(rect.top + rect.height / 2 - y);

      return dx < maxDistance && dy < maxDistance;
    });

    possible.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();

      const ad = Math.abs(ar.left + ar.width / 2 - x) + Math.abs(ar.top + ar.height / 2 - y);
      const bd = Math.abs(br.left + br.width / 2 - x) + Math.abs(br.top + br.height / 2 - y);

      return ad - bd;
    });

    return possible[0] || null;
  }

  function keyOn(element, key) {
    if (!element) return;

    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key
      })
    );

    element.dispatchEvent(
      new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key
      })
    );
  }

  function clickFirstVisibleDropdownOptionNear(input, sku) {
    if (!input) return false;

    const inputRect = input.getBoundingClientRect();

    const candidates = Array.from(
      document.querySelectorAll('[role="option"], li, .select2-results__option, .ui-select-choices-row, .ui-menu-item, div, span')
    ).filter(element => {
      if (!isElementVisible(element)) return false;
      if (element.closest('#lc-install-fee-root')) return false;

      const rect = element.getBoundingClientRect();
      const text = clean(element.textContent || '').toLowerCase();

      if (!text) return false;

      if (rect.top < inputRect.bottom - 5) return false;
      if (rect.top > inputRect.bottom + 350) return false;
      if (Math.abs(rect.left - inputRect.left) > 420) return false;

      if (text.includes(String(sku).toLowerCase())) return true;
      if (rect.height <= 55 && rect.width >= 60 && rect.width <= 1000) return true;

      return false;
    });

    if (!candidates.length) return false;

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();

      const aText = clean(a.textContent || '').toLowerCase();
      const bText = clean(b.textContent || '').toLowerCase();

      const aExact = aText.includes(String(sku).toLowerCase()) ? -1000 : 0;
      const bExact = bText.includes(String(sku).toLowerCase()) ? -1000 : 0;

      return aExact + ar.top - (bExact + br.top);
    });

    const option = candidates[0];
    const rect = option.getBoundingClientRect();
    const x = rect.left + Math.min(rect.width / 2, 160);
    const y = rect.top + rect.height / 2;

    clickAt(x, y);

    return true;
  }

  async function selectFirstCin7ProductOption(input, sku) {
    if (!input) return false;

    input.focus();

    await wait(1200);

    keyOn(input, 'ArrowDown');
    await wait(250);
    keyOn(input, 'Enter');
    await wait(700);

    clickFirstVisibleDropdownOptionNear(input, sku);
    await wait(900);

    keyOn(input, 'Tab');
    await wait(500);

    return true;
  }

  async function fillQuoteProductAndPrice(item) {
    await copyText(item.code);

    setInstallFeeModalPassthrough(true);
    await wait(200);

    const productHeader = findHeaderRect('product');
    const priceHeader = findHeaderRect('price');

    if (!productHeader || !priceHeader) {
      setInstallFeeModalPassthrough(false);
      closeModal();
      showToast('Could not find quote product/price headers');
      return;
    }

    const emptyRow = findNextEmptyProductRow(productHeader);

    if (!emptyRow) {
      setInstallFeeModalPassthrough(false);
      closeModal();
      showToast('No empty quote line available');
      return;
    }

    const rowY = emptyRow.rect.top + emptyRow.rect.height / 2;
    const productX = emptyRow.rect.left + Math.min(emptyRow.rect.width / 2, 160);
    const priceX = priceHeader.left + priceHeader.width / 2;

    clickAt(productX, rowY);
    await wait(300);

    const finalProductInput = findActiveInputNear(productX, rowY, 320);

    if (!finalProductInput) {
      setInstallFeeModalPassthrough(false);
      closeModal();
      showToast('No empty product field available');
      return;
    }

    const productInputRect = finalProductInput.getBoundingClientRect();

    if (Math.abs(productInputRect.top - rowY) > 170) {
      setInstallFeeModalPassthrough(false);
      closeModal();
      showToast('Blocked wrong field');
      return;
    }

    setInputOrEditableValue(finalProductInput, item.code);

    await selectFirstCin7ProductOption(finalProductInput, item.code);

    await wait(1200);

    clickAt(priceX, rowY);
    await wait(300);

    const priceInput = findActiveInputNear(priceX, rowY, 320);

    if (!priceInput) {
      setInstallFeeModalPassthrough(false);
      showToast(`SKU selected. Price copied: ${item.price}`);
      await copyText(String(item.price));
      return;
    }

    const priceInputRect = priceInput.getBoundingClientRect();

    if (Math.abs(priceInputRect.top - rowY) > 170) {
      setInstallFeeModalPassthrough(false);
      showToast(`SKU selected. Price copied: ${item.price}`);
      await copyText(String(item.price));
      return;
    }

    setInputOrEditableValue(priceInput, getCleanPrice(item.price));

    setInstallFeeModalPassthrough(false);
    showToast(`Added ${item.code} + $${formatPrice(item.price)}`);
  }

  function getInstallFeeGroup(item) {
    const text = `${item.code} ${item.name}`.toLowerCase();

    if (
      text.includes('call out') ||
      text.includes('assessment') ||
      text.includes('warranty') ||
      text.includes('electrician')
    ) {
      return '01_COMMON / CALL OUTS';
    }

    if (text.includes('atlantic')) return '02_01_PERGOLAS / ATLANTIC';
    if (text.includes('baltic')) return '02_02_PERGOLAS / BALTIC';
    if (text.includes('caspian')) return '02_03_PERGOLAS / CASPIAN';
    if (text.includes('caribbean')) return '02_04_PERGOLAS / CARIBBEAN';
    if (text.includes('tasman')) return '02_05_PERGOLAS / TASMAN';
    if (text.includes('pacific')) return '02_06_PERGOLAS / PACIFIC';

    if (
      text.includes('mediterranean') ||
      text.includes('mediterranean-sky')
    ) {
      return '02_07_PERGOLAS / MEDITERRANEAN-SKY';
    }

    if (text.includes('pergola')) return '02_99_PERGOLAS / OTHER';

    if (
      text.includes('flashing') ||
      text.includes('bracket') ||
      text.includes('timber') ||
      text.includes('concrete') ||
      text.includes('joists') ||
      text.includes('gutter') ||
      text.includes('cutting')
    ) {
      return '03_SITE PREP / BRACKETS / FLASHING';
    }

    if (
      text.includes('blind') ||
      text.includes('privacy') ||
      text.includes('shutter') ||
      text.includes('sliding door') ||
      text.includes('bifold') ||
      text.includes('glass') ||
      text.includes('tongue') ||
      text.includes('slatted')
    ) {
      return '04_BLINDS / WALLS / DOORS';
    }

    if (
      text.includes('window') ||
      text.includes('door cover') ||
      text.includes('awning') ||
      text.includes('patiocover') ||
      text.includes('carport')
    ) {
      return '05_AWNINGS / PATIO COVERS / CARPORTS';
    }

    if (
      text.includes('fence') ||
      text.includes('gate') ||
      text.includes('pool') ||
      text.includes('lincoln') ||
      text.includes('roosevelt')
    ) {
      return '06_FENCING / GATES';
    }

    return '07_OTHER';
  }

  function filterItems(query) {
    const search = clean(query).toLowerCase();

    filteredItems = !search
      ? items
      : items.filter(item => {
          const combined = `${item.code} ${item.name} ${item.price}`.toLowerCase();
          return combined.includes(search);
        });

    renderRows();
  }

  function renderRows() {
    const root = document.getElementById('lc-install-fee-root');
    if (!root) return;

    const tbody = root.shadowRoot.getElementById('lc-install-fee-tbody');
    const count = root.shadowRoot.getElementById('lc-install-fee-count');

    if (!tbody || !count) return;

    count.textContent = `${filteredItems.length} result${filteredItems.length === 1 ? '' : 's'}`;

    const displayItems = [...filteredItems].sort((a, b) => {
      const groupA = getInstallFeeGroup(a);
      const groupB = getInstallFeeGroup(b);

      if (groupA !== groupB) return groupA.localeCompare(groupB);

      return a.name.localeCompare(b.name);
    });

    let lastGroup = '';

    tbody.innerHTML = displayItems
      .map(item => {
        const group = getInstallFeeGroup(item);
        const cleanGroup = group.replace(/^\d+(?:_\d+)?_/, '');
        const showGroup = group !== lastGroup;

        lastGroup = group;

        const realIndex = filteredItems.indexOf(item);

        return `
          ${showGroup ? `
            <tr class="group-row">
              <td colspan="4">${escapeHtml(cleanGroup)}</td>
            </tr>
          ` : ''}

          <tr>
            <td class="actions">
              <button data-action="add" data-index="${realIndex}">Add</button>
            </td>
            <td class="code">${escapeHtml(item.code)}</td>
            <td class="name">${escapeHtml(item.name)}</td>
            <td class="price">$${escapeHtml(formatPrice(item.price))}</td>
          </tr>
        `;
      })
      .join('');
  }

  function insertInstallFeeButtonNextToScan() {
    if (document.getElementById('lc-install-fee-inline-button')) return;

    const scanButton = Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(element => isElementVisible(element))
      .find(element => clean(element.textContent || '').toLowerCase() === 'scan');

    if (!scanButton) return;

    const button = document.createElement('button');
    button.id = 'lc-install-fee-inline-button';
    button.type = 'button';
    button.textContent = 'Install Fees';

    const scanRect = scanButton.getBoundingClientRect();

    button.style.background = '#05cbbf';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cbbf';
    button.style.borderRadius = '4px';
    button.style.padding = '0 14px';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.height = `${Math.max(34, scanRect.height || 34)}px`;
    button.style.lineHeight = '1';
    button.style.marginLeft = '8px';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';

    button.addEventListener('mouseenter', () => {
      button.style.background = '#04b5aa';
      button.style.borderColor = '#04b5aa';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#05cbbf';
      button.style.borderColor = '#05cbbf';
    });

    button.addEventListener('click', openModal);

    scanButton.insertAdjacentElement('afterend', button);
  }

  function createWidget() {
    if (document.getElementById('lc-install-fee-root')) return;
    if (!document.body) return;

    const root = document.createElement('div');
    root.id = 'lc-install-fee-root';
    root.attachShadow({ mode: 'open' });

    root.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: Arial, Helvetica, sans-serif;
          color: #1f2933;
          position: relative;
          z-index: 2147483647;
        }

        * {
          box-sizing: border-box;
        }

        #lc-install-fee-modal {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background: rgba(0,0,0,.20);
          align-items: center;
          justify-content: flex-end;
          padding: 14px 22px 14px 14px;
        }

        #lc-install-fee-modal.open {
          display: flex;
        }

        #lc-install-fee-modal.working {
          background: transparent;
          pointer-events: none;
        }

        #lc-install-fee-modal.working .panel {
          pointer-events: auto;
          opacity: .98;
        }

        .panel {
          width: min(650px, 90vw);
          max-height: 88vh;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 14px 45px rgba(0,0,0,.25);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid #d9e1e5;
          background: #f6f8f9;
        }

        .title {
          margin: 0;
          font: 700 16px Arial, sans-serif;
          color: #263238;
        }

        .subtitle {
          margin-top: 3px;
          font: 11px Arial, sans-serif;
          color: #607d8b;
        }

        .source {
          margin-top: 4px;
          font: 700 10px Arial, sans-serif;
          color: #008f8f;
        }

        #lc-install-fee-close {
          background: #fff;
          border: 1px solid #cfd8dc;
          border-radius: 4px;
          padding: 4px 8px;
          font: 700 11px Arial, sans-serif;
          cursor: pointer;
          color: #263238;
        }

        .toolbar {
          display: flex;
          gap: 7px;
          align-items: center;
          padding: 7px 12px;
          border-bottom: 1px solid #d9e1e5;
        }

        #lc-install-fee-search {
          width: 100%;
          min-height: 30px;
          border: 1px solid #cfd8dc;
          border-radius: 4px;
          padding: 5px 8px;
          font: 12px Arial, sans-serif;
          outline: none;
        }

        #lc-install-fee-search:focus {
          border-color: #05cbbf;
          box-shadow: 0 0 0 2px rgba(5,203,191,.15);
        }

        #lc-install-fee-count {
          min-width: 68px;
          text-align: right;
          font: 700 10px Arial, sans-serif;
          color: #607d8b;
        }

        .table-wrap {
          overflow: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font: 11px Arial, sans-serif;
        }

        thead th {
          position: sticky;
          top: 0;
          background: #ffffff;
          z-index: 1;
          text-align: left;
          padding: 5px 6px;
          border-bottom: 1px solid #d9e1e5;
          color: #37474f;
          font: 700 10px Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: .02em;
        }

        tbody td {
          padding: 3px 6px;
          border-bottom: 1px solid #edf2f4;
          vertical-align: middle;
          line-height: 1.15;
        }

        tbody tr:hover {
          background: #eefafa;
        }

        .group-row td {
          padding: 8px 6px 5px;
          background: #f1f8f7;
          color: #008f8f;
          font: 800 10px Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: .05em;
          border-top: 10px solid #ffffff;
          border-bottom: 1px solid #d9e1e5;
        }

        tbody tr.group-row:hover {
          background: #f1f8f7;
        }

        .actions {
          width: 52px;
          white-space: nowrap;
          text-align: left;
        }

        .actions button {
          border: 1px solid #05cbbf;
          border-radius: 4px;
          background: #05cbbf;
          color: #fff;
          padding: 3px 8px;
          font: 700 10px Arial, sans-serif;
          cursor: pointer;
          min-height: 22px;
        }

        .actions button:hover {
          background: #04b5aa;
          border-color: #04b5aa;
        }

        .code {
          width: 82px;
          font-weight: 700;
          color: #263238;
          white-space: nowrap;
        }

        .name {
          color: #37474f;
          line-height: 1.15;
        }

        .price {
          width: 62px;
          font-weight: 700;
          color: #263238;
          white-space: nowrap;
        }

        #lc-install-fee-toast {
          position: fixed;
          right: 155px;
          bottom: 58px;
          z-index: 2147483647;
          display: none;
          background: #263238;
          color: #fff;
          border-radius: 4px;
          padding: 6px 9px;
          font: 700 11px Arial, sans-serif;
          box-shadow: 0 6px 18px rgba(0,0,0,.22);
        }

        #lc-install-fee-toast.show {
          display: block;
        }
      </style>

      <div id="lc-install-fee-modal">
        <div class="panel">
          <div class="header">
            <div>
              <h2 class="title">Living Culture Installation Fees</h2>
              <div class="subtitle">
                Search, then click Add to insert SKU and price.
              </div>
              <div class="source" id="lc-install-fee-source">${escapeHtml(dataSourceLabel)}</div>
            </div>

            <button id="lc-install-fee-close" type="button">Close</button>
          </div>

          <div class="toolbar">
            <input
              id="lc-install-fee-search"
              type="search"
              placeholder="Search Tasman, blind, AS10037..."
            />
            <div id="lc-install-fee-count">0 results</div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Add</th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody id="lc-install-fee-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="lc-install-fee-toast"></div>
    `;

    document.body.appendChild(root);

    const modal = root.shadowRoot.getElementById('lc-install-fee-modal');
    const close = root.shadowRoot.getElementById('lc-install-fee-close');
    const search = root.shadowRoot.getElementById('lc-install-fee-search');
    const tbody = root.shadowRoot.getElementById('lc-install-fee-tbody');

    close.addEventListener('click', () => {
      modal.classList.remove('open');
    });

    modal.addEventListener('click', event => {
      if (event.target === modal) {
        modal.classList.remove('open');
      }
    });

    search.addEventListener('input', event => {
      filterItems(event.target.value);
    });

    tbody.addEventListener('click', async event => {
      const target = event.target;

      if (!target?.matches?.('button[data-action]')) return;

      const index = Number(target.dataset.index);
      const item = filteredItems[index];

      if (!item) return;

      if (target.dataset.action === 'add') {
        await fillQuoteProductAndPrice(item);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        modal.classList.remove('open');
      }
    });

    setSourceLabel(dataSourceLabel);
    renderRows();
    loadRemoteInstallFees();
    insertInstallFeeButtonNextToScan();
  }

  function boot() {
    if (!document.body) return;

    createWidget();

    setTimeout(insertInstallFeeButtonNextToScan, 500);
    setTimeout(insertInstallFeeButtonNextToScan, 1500);
    setTimeout(insertInstallFeeButtonNextToScan, 3000);
  }

  boot();
  window.addEventListener('load', boot);
})();
