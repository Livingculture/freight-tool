// ==UserScript==
// @name         Cin7 Living Culture Custom Product Helper
// @namespace    livingculture-cin7
// @version      2.1
// @description  Shows Living Culture customised pergola/product SKUs inside Cin7 and fills the product code into the quote line.
// @match        https://*.cin7.com/*
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-custom-product-helper.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-custom-product-helper.user.js
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

  const REMOTE_DATA_URL = 'https://docs.google.com/document/d/1Vm28Nvi7hLqbdHKqe15WdpG1zKfK3Y7M/edit';

  const CACHE_KEY = 'lc-custom-product-data-v16';
  const CACHE_TIME_KEY = 'lc-custom-product-data-time-v16';

  const RAW_DATA = `
Name,CS code,Price/per m2,Memo
Baltic Manual Pergola,SK-00067,$799,The MOQ is 9 m2. If the size less than 9 m2，please quote based on 9 m2
Baltic Motorised Pergola,SK-00072,$880,"Standard colour is black, charcoal, white and frame charcoal+louvre white. Custom colours need increase 15%"
Atlantic Pergola,SK-00918,$779,"Custom Atlantic Manual Pergola (LC150) per m2 The Length ≤5858.2mm, the width≤3000mm The MOQ is 4㎡ Standard Colors: Black / White / Charcoal. Custom colors are not available."
Caspian Motorised Pergola,SK-00887,$880,"Custom Caspian Motorised Pergola (LC150) per m2 The Length ≤7800mm, the width≤3600mm The MOQ is 4㎡ Standard Colors: Black / White / Charcoal. Custom colors are not available."
Tasman Pergola,SK-00071,$1075,"If the post ≥3m, one post need charge $89 if the post over 3m, suggest pre-embedded The Length ≤8000mm, the width≤4000mm The length ≤6000mm, no need middle post The MOQ is 12 m2， If the area is below the minimum square meters, the quote must be based on the minimum square meters. Standard colour: Black / White / Charcoal. Custom colours need increase 20%"
Pacific Pergola,SK-00075,"$1,459","If the post ≥3m, one post need charge $99 if the post over 3m, suggest pre-embedded The length ≤6000mm, no need middle post The MOQ is 9 m2 Standard colour: Black / White / Charcoal. Custom colours need increase 20%"
Mediterranean PRO-MAX Pergola,SK-00073,$3165,"Standard colour is black, charcoal, white and frame charcoal+louvre white. Custom colours need increase 20% The MOQ is 9 m2. If the size less than 9㎡，please quote based on 9 m2. Standard colour is black, charcoal, white and frame charcoal+louvre white. Custom colours need increase 20%."
Mediterranean-SKY Motorised,SK-00390,"$1,840",The MOQ is 12 m2. If the size less than 12 m2 please quote based on 12 m2. Standard colour: White / Charcoal. Custom colours need increase 15%
Dover Motorised PVC Pergola,SK-00492,$690,"1.The MOQ is 12 m2.If the size less than 12 m2,please quote based on 12 m2 2.Standard colour is Dark grey aluminium frame with white PVC Fabric. Custom colours need increase 15% (Frame colour cannot be customized, fabric colour options: white, beige, grey) 3.Maximum dimensions without additional posts: 5m(Length)* 6.0m (Projection) = 4 post for Freestanding model and 2 posts for wall-mounted model 4.Maximum dimensions with additional posts: 9m(Length)* 6.0m Projection) = 6 post for freestanding model & 3 posts for wall Mounted model"
Aluminium Shutter Sliding Door,SK-00391,$590,"1500mm≤width ≤3800mm，Height≤2700mm Aluminium Frame Standard colour: Black / White / Charcoal, cannot customised colour"
Aluminium Shutter Wall,SK-00392,$550,"width ≤1280mm，Height≤2700mm Aluminium Frame Standard colour: Black / White / Charcoal, cannot customised colour"
Patterned Privacy Panel,SK-00393,$350,"width ≤900mm，Height≤2700mm Aluminium Frame Standard colour: Black / White / Charcoal, cannot customised colour"
Slatted Privacy Wall,SK-00394,$230,"width ≤2400mm，Height≤2700mm Aluminium Frame Standard colour: Black / White / Charcoal, cannot customised colour"
Tongue and Groove Privacy Screen,SK-00395,$270,"width ≤2400mm，Height≤2700mm Aluminium Frame Standard colour: Black / White / Charcoal, cannot customised colour"
Glass Sliding Door,SK-00076,$590,"if change handle to lock need charge $80 for each one Height≤2700mm Aluminium Frame Standard colour: Black / White / Charcoal, cannot customised colour"
Bifold Shutter Wall,SK-00078,$829,"width ≤5600mm, Height≤2700mm Folding method: Slide and fold to one side Bifold doors opening from the middle to both sides Aluminium Frame Standard colour: Black / White / Charcoal / Wood"
Bifold Glass Door,SK-00077,$700,"width ≤5600mm, Height≤2700mm Folding method: Slide and fold to one side Bifold doors opening from the middle to both sides Aluminium Frame Standard colour: Black / White / Charcoal"
Manual Blind,SK-00079,$259,"size range: 800mm＜ width ≤4000mm, Height≤2800mm Fabric with 0% openness, width ≤ 3200 mm. Frame Standard colour: Black / White / Charcoal Fabric colour: Black / White / Light Grey / Dark Grey"
Motorised Blind,SK-00140,$389,"size range: 1100mm＜width≤1500mm， Height≤2700mm 1500mm＜width≤4000mm， Height≤3600mm 4000mm＜width≤6000mm， Height≤2900mm Fabric with 0% openness, width ≤ 5000mm,height ≤2700mm Frame Standard colour: Black / White / Charcoal Fabric colour: Black / White / Light Grey / Dark Grey"
PVC manual Blind,SK-01076,$679,"size range: 950mm＜ width ≤4000mm , Height≤2700mm Frame Standard color: Black / White / Charcoal Fabric color: Clear"
PVC Motor Blind,SK-01077,$689,"size range: 950mm＜ width ≤6000mm , Height≤3000mm Frame Standard color: Black / White / Charcoal Fabric color: Clear"
Olympus Motorised Roof Shade,SK-00638,$460,The MOQ is 8 m2
City Window door awning,SK-00080,$330,The width ≤2m MOQ 3 m2 Aluminium Frame Colour Option: White / Grey / Champagne / Coffee Roof panel Colour Option: Clear / Blue / Bronze / Light Grey / Mid Grey / Dark Grey/ Others colour cannot be customised
Country Window door awning,SK-00085,$330,The width ≤2m MOQ 3 m2 Aluminium Frame Colour Option: White / Grey / Champagne / Coffee Roof panel Colour Option: Clear / Blue / Bronze / Light Grey / Mid Grey / Dark Grey/ Others colour cannot be customised
Coastal patio cover,SK-00081,$379,the width ≤4m MOQ 1 m2 Aluminium Frame Colour Option: White / Black / Grey Roof panel Colour Option: Clear / Matte / Light Grey / Dark Grey Others colour cannot be customised
Urban patio cover,SK-00082,$269,"The MOQ is 9 m2 If the area is below the minimum square meters, the quote must be based on the minimum square meters. Aluminium Frame Colour Option: White / Grey / Champagne / Coffee Roof panel Colour Option: Clear / Blue / Bronze / Light Grey / Mid Grey / Dark Grey/ Others colour cannot be customised"
Country patio cover,SK-00083,$269,"The MOQ is 9 m2 If the area is below the minimum square meters, the quote must be based on the minimum square meters. Aluminium Frame Colour Option: White / Grey / Champagne / Coffee Roof panel Colour Option: Clear / Blue / Bronze / Light Grey / Mid Grey / Dark Grey/ Others colour cannot be customised"
Carport,SK-00084,$275,"The MOQ is 12 m2 If the area is below the minimum square meters, the quote must be based on the minimum square meters. Single carport's width ≤3m The post height over 2.7m, need pre-embedded Aluminium Frame Colour Option: White / Grey / Champagne / Coffee Roof panel Colour Option: Clear / Blue / Bronze / Light Grey / Mid Grey / Dark Grey/ Others colour cannot be customised"
Fuji Manual,SK-00396,$145,1. Max. Size: 5m(Width) * 3.0m (Projection) 2. Width >=Projections + 0.5m The MOQ is 6㎡. If the size less than 6㎡，please quote based on ㎡. Only white Frame Outperform Acrylic Fabric（Made in China） Standard size，but Custom colours need increase 15%
Etna Half Cassette,SK-00397,$260,1. Max. Size: 6m(Width) * 3.0m (Projection) 2. Width >=Projections + 0.5m The MOQ is 8㎡. If the size less than 8㎡，please quote based on 8㎡ White or Dark grey Frame Outperform Acrylic Fabric（Made in China） Standard size ，but Custom colours need increase 15%
Rainier Full Cassette,SK-00399,$340,1. Max. Size: 5m(Width) * 3.0m (Projection) 2. Width >=Projections + 0.8m The MOQ is 8㎡. If the size less than 8㎡，please quote based on 8㎡. White or Dark grey Frame Dickson®Acrylic Fabric（Made in France） Standard size，but Custom colours need increase 15%
Rainier Pro Full Cassette,SK-00401,$350,1. Max. Size: 7m(Length) * 4.0m (Projection) 2. Width >=Projections + 0.8m The MOQ is 10㎡. If the size less than 10㎡，please quote based on 10㎡. White or Dark grey Frame Dickson®Acrylic Fabric（Made in France） Standard size，but Custom colours need increase 15%
Solar Window Awning,SK-00551,$245,"1.Max. Size: 4m(Width)* 2.5m (Projection) 2.The MOQ is 6m. lf the size less than 6m, please quote based or 6m 3.White or Dark grey Frame4.0utperform Acrylic Fabric (Made in China) 5.Standard size, but Custom colours need increase 15%"
Etna Half Cassette >10m2,SK-00398,$230,Etna Half Cassette price tier for areas over 10m2.
Rainier Full Cassette >10m2,SK-00400,$300,Rainier Full Cassette price tier for areas over 10m2.
Tasman Side Post Black,CS20954,$329.99,3M leg post.
Tasman Side Post White,CS20955,$329.99,3M leg post.
Tasman Side Post Charcoal,CS20956,$329.99,3M leg post.
Tasman Middle Post Black,CS23434,$329.99,3M leg post.
Tasman Middle Post White,CS23435,$329.99,3M leg post.
Tasman Middle Post Charcoal,CS23436,$329.99,3M leg post.
Baltic Side Post Black,CS22824,$299.99,3M leg post.
Baltic Side Post White,CS22825,$299.99,3M leg post.
Baltic Side Post Charcoal,CS22826,$299.99,3M leg post.
Baltic Middle Post Black,CS22827,$299.99,3M leg post.
Baltic Middle Post White,CS22828,$299.99,3M leg post.
Baltic Middle Post Charcoal,CS22829,$299.99,3M leg post.
Atlantic Side Post Black,CS22253,$329.99,3M leg post.
Atlantic Side Post White,CS22254,$329.99,3M leg post.
Atlantic Side Post Charcoal,CS22255,$329.99,3M leg post.
Caspian Middle Post Black,CS22250,$329.99,"3M leg post. If longer than 3M, quote steel posts individually. Prefer to keep under 4M height."
Caspian Middle Post White,CS22251,$329.99,"3M leg post. If longer than 3M, quote steel posts individually. Prefer to keep under 4M height."
Caspian Middle Post Charcoal,CS22252,$329.99,"3M leg post. If longer than 3M, quote steel posts individually. Prefer to keep under 4M height."
`;

  let dataSourceLabel = 'Built-in backup data';
  let items = [];
  let filteredItems = items;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseCsvLine(line) {
    const values = [];
    let value = '';
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && quoted && next === '"') {
        value += '"';
        i += 1;
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

  function normaliseHeader(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function looksLikeProductCode(value) {
    return /^(?:SK|CS)-?\d{5}$/i.test(clean(value));
  }

  function looksLikeProductPrice(value) {
    return /^\$?\s*\d[\d,]*(?:\.\d+)?\s*$/.test(clean(value));
  }

  function looksLikeVerticalProductName(value) {
    const text = clean(value);
    if (!text || looksLikeProductCode(text) || looksLikeProductPrice(text)) return false;

    return !/[.。:,，;；()（）]|≤|>=|MOQ|colour|color|width|height|size|charge|frame|fabric|projection|maximum|dimensions|post|length|quote|standard|custom|need|m2|㎡|mm|^The |^If |^Only |^Outperform|^Dickson|roof panel|folding method|bifold doors|^Fabric colour|^Fabric color|^Frame Standard|^\d\./i.test(text);
  }

  function parseVerticalData(raw) {
    const lines = String(raw || '')
      .split(/\r?\n/)
      .map(line => clean(line))
      .filter(Boolean);

    const headerText = lines.slice(0, 4).map(normaliseHeader).join('|');
    if (headerText !== 'name|cscode|priceperm2|memo') return [];

    function startsNextProduct(index) {
      if (
        index + 1 < lines.length &&
        looksLikeVerticalProductName(lines[index]) &&
        looksLikeProductCode(lines[index + 1])
      ) {
        return true;
      }

      if (
        index + 2 < lines.length &&
        looksLikeVerticalProductName(lines[index]) &&
        looksLikeVerticalProductName(lines[index + 1]) &&
        looksLikeProductCode(lines[index + 2])
      ) {
        return true;
      }

      return false;
    }

    const rows = [];
    let index = 4;

    while (index < lines.length) {
      const nameParts = [];
      while (index < lines.length && !looksLikeProductCode(lines[index])) {
        nameParts.push(lines[index]);
        index += 1;
      }

      if (index >= lines.length) break;

      const code = lines[index];
      index += 1;

      const beforePrice = [];
      while (
        index < lines.length &&
        !looksLikeProductPrice(lines[index]) &&
        !looksLikeProductCode(lines[index])
      ) {
        beforePrice.push(lines[index]);
        index += 1;
      }

      let price = '';
      if (index < lines.length && looksLikeProductPrice(lines[index])) {
        price = lines[index];
        index += 1;
      }

      const memoParts = [];
      while (
        index < lines.length &&
        !looksLikeProductCode(lines[index]) &&
        !startsNextProduct(index)
      ) {
        memoParts.push(lines[index]);
        index += 1;
      }

      const name = clean(nameParts.concat(beforePrice).join(' '));
      if (name && code) {
        rows.push({
          name,
          code,
          price: clean(price),
          memo: clean(memoParts.join(' '))
        });
      }
    }

    return rows.filter(item => item.name && item.code);
  }

  function knownProductName(code) {
    const names = {
      'SK-00396': 'Fuji Manual',
      'SK-00397': 'Etna Half Cassette',
      'SK-00398': 'Etna Half Cassette >10m2',
      'SK-00399': 'Rainier Full Cassette',
      'SK-00400': 'Rainier Full Cassette >10m2',
      'SK-00401': 'Rainier Pro Full Cassette',
      CS20954: 'Tasman Side Post Black',
      CS20955: 'Tasman Side Post White',
      CS20956: 'Tasman Side Post Charcoal',
      CS23434: 'Tasman Middle Post Black',
      CS23435: 'Tasman Middle Post White',
      CS23436: 'Tasman Middle Post Charcoal',
      CS22824: 'Baltic Side Post Black',
      CS22825: 'Baltic Side Post White',
      CS22826: 'Baltic Side Post Charcoal',
      CS22827: 'Baltic Middle Post Black',
      CS22828: 'Baltic Middle Post White',
      CS22829: 'Baltic Middle Post Charcoal',
      CS22253: 'Atlantic Side Post Black',
      CS22254: 'Atlantic Side Post White',
      CS22255: 'Atlantic Side Post Charcoal',
      CS22250: 'Caspian Middle Post Black',
      CS22251: 'Caspian Middle Post White',
      CS22252: 'Caspian Middle Post Charcoal'
    };

    return names[clean(code).toUpperCase()] || '';
  }

  function needsKnownProductName(name) {
    const text = clean(name).toLowerCase();
    return (
      !text ||
      /^(?:black|white|charcoal|>\s*10\s*m2|>\s*10m2|>\s*10\s*m²)$/i.test(text) ||
      !/(pergola|cassette|manual|awning|post|tasman|baltic|atlantic|caspian|rainier|etna|fuji)/i.test(text)
    );
  }

  function enrichKnownProduct(item) {
    const name = knownProductName(item.code);
    if (!name || !needsKnownProductName(item.name)) return item;

    return {
      ...item,
      name
    };
  }

  function parseData(raw) {
    const text = String(raw || '').trim();

    if (!text || /<!doctype html|<html/i.test(text.slice(0, 300))) {
      return [];
    }

    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = delimiter === '\t' ? lines[0].split('\t') : parseCsvLine(lines[0]);
    const normalisedHeaders = headers.map(normaliseHeader);

    const verticalItems = parseVerticalData(text);
    if (verticalItems.length) return verticalItems.map(enrichKnownProduct);

    function col(...names) {
      const wanted = names.map(normaliseHeader);
      return normalisedHeaders.findIndex(header => wanted.includes(header));
    }

    const colName = col('Name', 'Product Name', 'Product');
    const colCode = col('CS code', 'Code', 'SKU', 'Product Code', 'Item Code');
    const colPrice = col('Price/per m2', 'Price', 'Price per m2', 'Price/m2');
    const colMemo = col('Memo', 'Notes', 'Description', 'Details');

    return lines.slice(1).map(line => {
      const parts = delimiter === '\t' ? line.split('\t') : parseCsvLine(line);

      return enrichKnownProduct({
        name: clean(parts[colName >= 0 ? colName : 0]),
        code: clean(parts[colCode >= 0 ? colCode : 1]),
        price: clean(parts[colPrice >= 0 ? colPrice : 2]),
        memo: clean(parts[colMemo >= 0 ? colMemo : 3])
      });
    }).filter(item => item.name && item.code);
  }

  items = parseData(readCachedRawData() || RAW_DATA);
  filteredItems = items;

  function readCachedRawData() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached || !parseData(cached).length) return '';

      const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY)) || 0;
      const ageHours = cachedAt ? Math.round((Date.now() - cachedAt) / 36e5) : 0;

      dataSourceLabel = ageHours
        ? `Google/Drive data from cache (${ageHours}h old)`
        : 'Google/Drive data from cache';

      return cached;
    } catch (error) {
      console.warn(error);
      return '';
    }
  }

  function normaliseRemoteDataUrl(url) {
    const value = clean(url);
    if (!value) return '';

    const folderMatch = value.match(/drive\.google\.com\/drive\/folders\/([^/?#]+)/i);
    if (folderMatch) return '';

    const sheetMatch = value.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
    if (sheetMatch) {
      const gid = value.match(/[?&]gid=(\d+)/i)?.[1] || value.match(/#gid=(\d+)/i)?.[1] || '0';
      return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=csv&gid=${gid}`;
    }

    const docMatch = value.match(/docs\.google\.com\/document\/d\/([^/]+)/i);
    if (docMatch) {
      return `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
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
          headers: { 'Cache-Control': 'no-cache' },
          onload: response => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.responseText || '');
            } else {
              reject(new Error(`Remote data returned ${response.status}`));
            }
          },
          onerror: () => reject(new Error('Could not load remote data'))
        });
        return;
      }

      fetch(url, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`Remote data returned ${response.status}`);
          return response.text();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  async function loadRemoteData() {
    const remoteUrl = normaliseRemoteDataUrl(REMOTE_DATA_URL);

    if (!remoteUrl) {
      setSourceLabel(`${dataSourceLabel} - folder links cannot load as CSV`);
      renderRows();
      return false;
    }

    setSourceLabel('Loading Google/Drive data...');

    try {
      const raw = await requestText(remoteUrl);

      if (/<!doctype html|<html/i.test(raw.slice(0, 300))) {
        throw new Error('Google returned an HTML page instead of CSV');
      }

      const nextItems = parseData(raw);

      if (!nextItems.length) {
        throw new Error('Remote file had no product rows');
      }

      items = nextItems;
      filteredItems = items;

      localStorage.setItem(CACHE_KEY, raw);
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));

      setSourceLabel('Google/Drive data loaded');

      const root = document.getElementById('lc-custom-product-root');
      const search = root?.shadowRoot?.getElementById('lc-custom-product-search');
      filterItems(search?.value || '');
      return true;
    } catch (error) {
      console.warn(error);
      setSourceLabel(`${dataSourceLabel} - live Google/Drive unavailable`);
      renderRows();
      return false;
    }
  }

  function setSourceLabel(label) {
    dataSourceLabel = label || dataSourceLabel;
    const root = document.getElementById('lc-custom-product-root');
    const source = root?.shadowRoot?.getElementById('lc-custom-product-source');
    if (source) source.textContent = dataSourceLabel;
  }

  async function copyText(text) {
    try {
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
    } catch (error) {
      console.warn('Clipboard copy failed:', error);
    }
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

  function visibleElements() {
    return Array.from(document.querySelectorAll('body *')).filter(element => {
      if (!isElementVisible(element)) return false;
      if (element.closest('#lc-custom-product-root')) return false;
      return true;
    });
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

      if (dx < maxDistance && dy < maxDistance) return active;
    }

    const possible = Array.from(
      document.querySelectorAll('input, textarea, [contenteditable="true"]')
    ).filter(element => {
      if (!isElementVisible(element)) return false;
      if (element.closest('#lc-custom-product-root')) return false;

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
      if (element.closest('#lc-custom-product-root')) return false;

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
    clickAt(rect.left + Math.min(rect.width / 2, 160), rect.top + rect.height / 2);
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

  function closeModal() {
    const root = document.getElementById('lc-custom-product-root');
    const modal = root?.shadowRoot?.getElementById('lc-custom-product-modal');
    if (modal) modal.classList.remove('open');
  }

  function showToast(message) {
    const root = document.getElementById('lc-custom-product-root');
    const toast = root?.shadowRoot?.getElementById('lc-custom-product-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function setModalPassthrough(enabled) {
    const root = document.getElementById('lc-custom-product-root');
    const modal = root?.shadowRoot?.getElementById('lc-custom-product-modal');
    if (!modal) return;

    if (enabled) {
      modal.classList.add('working');
    } else {
      modal.classList.remove('working');
    }
  }

  async function fillQuoteProductOnly(item) {
    try {
      await copyText(item.code);

      setModalPassthrough(true);
      await wait(200);

      const productHeader = findHeaderRect('product');

      if (!productHeader) {
        setModalPassthrough(false);
        closeModal();
        showToast('Could not find quote product header');
        return;
      }

      const emptyRow = findNextEmptyProductRow(productHeader);

      if (!emptyRow) {
        setModalPassthrough(false);
        closeModal();
        showToast('No empty quote line available');
        return;
      }

      const rowY = emptyRow.rect.top + emptyRow.rect.height / 2;
      const productX = emptyRow.rect.left + Math.min(emptyRow.rect.width / 2, 160);

      clickAt(productX, rowY);
      await wait(300);

      let finalProductInput = findActiveInputNear(productX, rowY, 320);

      if (!finalProductInput) {
        const active = document.activeElement;
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active?.isContentEditable
        ) {
          finalProductInput = active;
        }
      }

      if (!finalProductInput) {
        setModalPassthrough(false);
        closeModal();
        showToast('No empty product field available');
        return;
      }

      const productInputRect = finalProductInput.getBoundingClientRect();

      if (Math.abs(productInputRect.top - rowY) > 170) {
        setModalPassthrough(false);
        closeModal();
        showToast('Blocked wrong field');
        return;
      }

      setInputOrEditableValue(finalProductInput, item.code);
      await wait(500);
      await selectFirstCin7ProductOption(finalProductInput, item.code);
      await wait(1200);

      setModalPassthrough(false);
      closeModal();
      showToast(`Added ${item.code}`);
    } catch (error) {
      console.error('Custom product add failed:', error);
      setModalPassthrough(false);
      showToast(`Add failed: ${error.message || 'Unknown error'}`);
    }
  }

  function getProductGroup(item) {
    const labelText = `${item.code} ${item.name}`.toLowerCase();
    const text = `${item.code} ${item.name} ${item.memo}`.toLowerCase();

    if (labelText.includes('post')) return '08_POSTS';
    if (text.includes('baltic')) return '01_PERGOLAS / BALTIC';
    if (text.includes('caspian')) return '02_PERGOLAS / CASPIAN';
    if (text.includes('tasman')) return '03_PERGOLAS / TASMAN';
    if (text.includes('pacific')) return '04_PERGOLAS / PACIFIC';
    if (text.includes('mediterranean')) return '05_PERGOLAS / MEDITERRANEAN';
    if (text.includes('dover')) return '06_PERGOLAS / DOVER PVC';
    if (text.includes('pergola')) return '07_PERGOLAS / OTHER';

    if (
      text.includes('shutter') ||
      text.includes('privacy') ||
      text.includes('slatted') ||
      text.includes('tongue') ||
      text.includes('glass sliding') ||
      text.includes('bifold')
    ) {
      return '09_WALLS / DOORS / SCREENS';
    }

    if (text.includes('blind') || text.includes('shade')) return '10_BLINDS / SHADES';

    if (
      text.includes('awning') ||
      text.includes('patio cover') ||
      text.includes('carport')
    ) {
      return '11_AWNINGS / PATIO COVERS / CARPORTS';
    }

    return '99_OTHER';
  }

  function filterItems(query) {
    const search = clean(query).toLowerCase();

    filteredItems = !search
      ? items
      : items.filter(item => {
        const combined = `${item.code} ${item.name} ${item.price} ${item.memo}`.toLowerCase();
        return combined.includes(search);
      });

    renderRows();
  }

  function renderRows() {
    const root = document.getElementById('lc-custom-product-root');
    if (!root) return;

    const tbody = root.shadowRoot.getElementById('lc-custom-product-tbody');
    const count = root.shadowRoot.getElementById('lc-custom-product-count');

    if (!tbody || !count) return;

    count.textContent = `${filteredItems.length} result${filteredItems.length === 1 ? '' : 's'}`;

    const displayItems = [...filteredItems].sort((a, b) => {
      const groupA = getProductGroup(a);
      const groupB = getProductGroup(b);
      if (groupA !== groupB) return groupA.localeCompare(groupB);
      return a.name.localeCompare(b.name);
    });

    let lastGroup = '';

    tbody.innerHTML = displayItems.map(item => {
      const group = getProductGroup(item);
      const cleanGroup = group.replace(/^\d+_/, '');
      const showGroup = group !== lastGroup;
      lastGroup = group;

      return `
        ${showGroup ? `
          <tr class="group-row">
            <td colspan="4">${escapeHtml(cleanGroup)}</td>
          </tr>
        ` : ''}

        <tr>
          <td class="actions">
            <button data-action="add" data-code="${escapeHtml(item.code)}">Add</button>
          </td>
          <td class="code">${escapeHtml(item.code)}</td>
          <td class="name">
            <strong>${escapeHtml(item.name)}</strong>
            <div>${escapeHtml(item.memo || '')}</div>
          </td>
          <td class="price">${escapeHtml(item.price || '')}</td>
        </tr>
      `;
    }).join('');
  }

  function openModal() {
    const root = document.getElementById('lc-custom-product-root');
    const modal = root?.shadowRoot?.getElementById('lc-custom-product-modal');
    const search = root?.shadowRoot?.getElementById('lc-custom-product-search');

    if (!modal) return;

    modal.classList.add('open');
    loadRemoteData();
    setTimeout(() => search?.focus(), 50);
  }

  function findQuoteSectionHeading() {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span'))
      .filter(element => isElementVisible(element))
      .find(element => {
        if (element.closest('button, a, [role="button"]')) return false;
        return clean(element.textContent || '').toLowerCase() === 'quote';
      });
  }

  function getQuoteHelperRow() {
    let row = document.getElementById('lc-cin7-product-helper-fallback-row');
    if (row) return row;

    const heading = findQuoteSectionHeading();
    if (!heading) return null;
    const header = (() => {
      let current = heading.parentElement;
      while (current && current !== document.body) {
        const text = clean(current.textContent || '').toLowerCase();
        const hasQuoteActions = /email|print|to order|authorise|apply discounts/.test(text);
        if (hasQuoteActions) return current;
        current = current.parentElement;
      }
      return heading;
    })();

    row = document.createElement('div');
    row.id = 'lc-cin7-product-helper-fallback-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.margin = '0 0 12px 0';
    row.style.width = '100%';

    header.insertAdjacentElement('afterend', row);
    return row;
  }

  function insertButtonNextToScan() {
    const visibleButtons = Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(element => isElementVisible(element));
    const scanButton = visibleButtons.find(element => clean(element.textContent || '').toLowerCase() === 'scan');
    const fallbackRow = scanButton ? null : getQuoteHelperRow();
    const targetButton = scanButton || fallbackRow;

    const existingButton = document.getElementById('lc-custom-product-inline-button');
    if (!targetButton) {
      existingButton?.remove();
      return;
    }

    const button = existingButton || document.createElement('button');

    button.id = 'lc-custom-product-inline-button';
    button.type = 'button';
    button.textContent = 'Custom Products';

    button.style.background = '#05cbbf';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cbbf';
    button.style.borderRadius = '4px';
    button.style.padding = '0 14px';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.height = '34px';
    button.style.minHeight = '34px';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.lineHeight = '1';
    button.style.marginLeft = scanButton ? '8px' : '0';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';

    if (!existingButton) {
      button.addEventListener('mouseenter', () => {
        button.style.background = '#04b5aa';
        button.style.borderColor = '#04b5aa';
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = '#05cbbf';
        button.style.borderColor = '#05cbbf';
      });

      button.addEventListener('click', openModal);
    }

    if (fallbackRow) fallbackRow.appendChild(button);
    else targetButton.insertAdjacentElement('afterend', button);
  }

  function createWidget() {
    if (document.getElementById('lc-custom-product-root')) return;
    if (!document.body) return;

    const root = document.createElement('div');
    root.id = 'lc-custom-product-root';
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

        #lc-custom-product-modal {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background: rgba(0,0,0,.20);
          align-items: center;
          justify-content: flex-end;
          padding: 14px 18px 14px 14px;
        }

        #lc-custom-product-modal.open {
          display: flex;
        }

        #lc-custom-product-modal.working {
          background: transparent;
          pointer-events: none;
        }

        #lc-custom-product-modal.working .panel {
          pointer-events: auto;
          opacity: .98;
        }

        .panel {
          width: min(640px, 82vw);
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

        #lc-custom-product-close {
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

        #lc-custom-product-search {
          width: 100%;
          min-height: 30px;
          border: 1px solid #cfd8dc;
          border-radius: 4px;
          padding: 5px 8px;
          font: 12px Arial, sans-serif;
          outline: none;
        }

        #lc-custom-product-search:focus {
          border-color: #05cbbf;
          box-shadow: 0 0 0 2px rgba(5,203,191,.15);
        }

        #lc-custom-product-count {
          min-width: 72px;
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
          padding: 4px 6px;
          border-bottom: 1px solid #edf2f4;
          vertical-align: top;
          line-height: 1.2;
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
          width: 58px;
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
          width: 96px;
          font-weight: 700;
          color: #263238;
          white-space: nowrap;
        }

        .name {
          color: #37474f;
          line-height: 1.15;
        }

        .name strong {
          display: block;
          color: #263238;
          margin-bottom: 3px;
          font-weight: 700;
        }

        .name div {
          color: #607d8b;
          font-size: 10.5px;
          line-height: 1.25;
        }

        .price {
          width: 78px;
          font-weight: 700;
          color: #263238;
          white-space: nowrap;
          text-align: right;
        }

        #lc-custom-product-toast {
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

        #lc-custom-product-toast.show {
          display: block;
        }
      </style>

      <div id="lc-custom-product-modal">
        <div class="panel">
          <div class="header">
            <div>
              <h2 class="title">Living Culture Custom Products</h2>
              <div class="subtitle">
                Search, then click Add to insert the SKU/product code into the next empty Cin7 product line.
              </div>
              <div class="source" id="lc-custom-product-source">${escapeHtml(dataSourceLabel)}</div>
            </div>

            <button id="lc-custom-product-close" type="button">Close</button>
          </div>

          <div class="toolbar">
            <input
              id="lc-custom-product-search"
              type="search"
              placeholder="Search Tasman, Baltic, blind, SK-00071, posts..."
            />
            <div id="lc-custom-product-count">0 results</div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Add</th>
                  <th>SKU</th>
                  <th>Name / Notes</th>
                  <th style="text-align:right;">Price</th>
                </tr>
              </thead>
              <tbody id="lc-custom-product-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="lc-custom-product-toast"></div>
    `;

    document.body.appendChild(root);

    const modal = root.shadowRoot.getElementById('lc-custom-product-modal');
    const close = root.shadowRoot.getElementById('lc-custom-product-close');
    const search = root.shadowRoot.getElementById('lc-custom-product-search');
    const tbody = root.shadowRoot.getElementById('lc-custom-product-tbody');

    close.addEventListener('click', () => modal.classList.remove('open'));

    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.remove('open');
    });

    search.addEventListener('input', event => filterItems(event.target.value));

    tbody.addEventListener('click', async event => {
      const target = event.target;
      if (!target?.matches?.('button[data-action]')) return;

      const code = clean(target.dataset.code);
      const item = items.find(row => row.code === code);
      if (!item) return;

      if (target.dataset.action === 'add') {
        await fillQuoteProductOnly(item);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') modal.classList.remove('open');
    });

    setSourceLabel(dataSourceLabel);
    renderRows();
    loadRemoteData();
    insertButtonNextToScan();
  }

  function boot() {
    if (!document.body) return;
    createWidget();
    setTimeout(insertButtonNextToScan, 500);
    setTimeout(insertButtonNextToScan, 1500);
    setTimeout(insertButtonNextToScan, 3000);
  }

  boot();
  window.addEventListener('load', boot);
})();
