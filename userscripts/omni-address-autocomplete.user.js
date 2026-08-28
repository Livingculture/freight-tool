// ==UserScript==
// @name         Omni New Zealand Address Autocomplete
// @namespace    livingculture-omni
// @version      0.1.5
// @description  Adds New Zealand address suggestions to Cin7 Omni delivery addresses.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-address-autocomplete.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-address-autocomplete.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      photon.komoot.io
// ==/UserScript==

(function () {
  'use strict';

  const API_URL = 'https://photon.komoot.io/api/';
  const MIN_QUERY_LENGTH = 4;
  let timer = null;
  let requestNumber = 0;
  let addressInput = null;
  let currentSuggestions = [];
  const attachedInputs = new WeakSet();

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalise(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function allControls() {
    return Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'))
      .filter(control => !control.closest('#lc-omni-address-suggestions'));
  }

  function findField(labelText) {
    const expected = normalise(labelText);
    const aliases = expected === 'deliverypostalcode'
      ? ['deliverypostalcode', 'deliverypostcode']
      : [expected];
    const controls = allControls();
    const named = controls.find(control => {
      const identity = normalise(`${control.id || ''} ${control.name || ''} ${control.getAttribute('aria-label') || ''}`);
      return aliases.some(alias => identity.includes(alias));
    });
    if (named) return named;

    const labels = Array.from(document.querySelectorAll('label, legend, span, div, td, th'))
      .filter(visible)
      .filter(element => aliases.includes(normalise(element.textContent)))
      .sort((a, b) => a.children.length - b.children.length);

    for (const label of labels) {
      if (label.htmlFor) {
        const linked = document.getElementById(label.htmlFor);
        if (linked) return linked;
      }

      const labelRect = label.getBoundingClientRect();
      const centreY = labelRect.top + labelRect.height / 2;
      const aligned = controls
        .filter(visible)
        .map(control => ({ control, rect: control.getBoundingClientRect() }))
        .filter(({ rect }) => rect.left >= labelRect.right - 10)
        .sort((a, b) => (
          Math.abs((a.rect.top + a.rect.height / 2) - centreY) -
          Math.abs((b.rect.top + b.rect.height / 2) - centreY) ||
          a.rect.left - b.rect.left
        ));
      if (aligned[0] && Math.abs((aligned[0].rect.top + aligned[0].rect.height / 2) - centreY) <= 18) {
        return aligned[0].control;
      }
    }

    return null;
  }

  function setField(control, value) {
    if (!control || value == null) return;

    if (control.tagName === 'SELECT') {
      const option = Array.from(control.options).find(item => normalise(item.textContent) === normalise(value));
      value = option?.value ?? value;
    }

    const prototype = control.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : control.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(control, value);
    else control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function inferRegion(postcode) {
    const number = Number(postcode);
    if (number >= 1000 && number <= 2699) return 'Auckland';
    if (number >= 3000 && number <= 3199) return 'Bay of Plenty';
    if (number >= 3200 && number <= 3999) return 'Waikato';
    if (number >= 4000 && number <= 4099) return 'Gisborne';
    if (number >= 4100 && number <= 4299) return "Hawke's Bay";
    if (number >= 4300 && number <= 4399) return 'Taranaki';
    if (number >= 4400 && number <= 4999) return 'Manawatu-Wanganui';
    if (number >= 5000 && number <= 5999) return 'Wellington';
    if (number >= 7000 && number <= 7299) return 'Nelson';
    if (number >= 7300 && number <= 7499) return 'Marlborough';
    if (number >= 7500 && number <= 8999) return 'Canterbury';
    if (number >= 9000 && number <= 9599) return 'Otago';
    if (number >= 9600 && number <= 9999) return 'Southland';
    return '';
  }

  function applySuggestion(address) {
    setField(findField('Delivery Address 1'), address.address1);
    setField(findField('Delivery Address 2'), address.address2);
    setField(findField('Delivery City'), address.city);
    setField(findField('Delivery State/Region'), address.region);
    setField(findField('Delivery Postal Code'), address.postcode);
    setField(findField('Delivery Country'), address.country);
    hideSuggestions();
  }

  function photonAddress(feature) {
    const properties = feature?.properties || {};
    const address1 = clean([properties.housenumber, properties.street || properties.name].filter(Boolean).join(' '));
    const city = clean(properties.city || properties.town || properties.village || properties.locality || properties.county);
    const district = clean(properties.district || properties.suburb || properties.locality);
    return {
      address1,
      address2: district && normalise(district) !== normalise(city) ? district : '',
      city,
      postcode: clean(properties.postcode),
      region: clean(properties.state) || inferRegion(properties.postcode),
      country: 'New Zealand'
    };
  }

  function addressLabel(address) {
    return [address.address1, address.address2, address.city, address.region, address.postcode, address.country]
      .map(clean)
      .filter(Boolean)
      .join(', ');
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      const options = {
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        timeout: 15000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Address lookup failed (${response.status})`));
            return;
          }
          try { resolve(JSON.parse(response.responseText || '{}')); }
          catch { reject(new Error('Address lookup returned invalid data')); }
        },
        ontimeout: () => reject(new Error('Address lookup timed out')),
        onerror: () => reject(new Error('Address lookup failed'))
      };

      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest(options);
      } else if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
        GM.xmlHttpRequest(options).catch(reject);
      } else {
        reject(new Error('Tampermonkey address permission is unavailable'));
      }
    });
  }

  function getList() {
    let list = document.getElementById('lc-omni-address-suggestions');
    if (list) return list;
    list = document.createElement('div');
    list.id = 'lc-omni-address-suggestions';
    document.body.appendChild(list);
    return list;
  }

  function positionList() {
    const list = getList();
    if (!addressInput || !visible(addressInput) || !list.children.length) return;
    const rect = addressInput.getBoundingClientRect();
    list.style.left = `${rect.left}px`;
    list.style.top = `${rect.bottom + 4}px`;
    list.style.width = `${Math.max(360, rect.width)}px`;
  }

  function getLookupButton() {
    let button = document.getElementById('lc-omni-address-lookup-button');
    if (button) return button;
    button = document.createElement('button');
    button.id = 'lc-omni-address-lookup-button';
    button.type = 'button';
    button.textContent = 'Find address';
    document.body.appendChild(button);
    button.addEventListener('click', () => {
      attach();
      const query = clean(addressInput?.value);
      if (query.length < MIN_QUERY_LENGTH) {
        const list = getList();
        list.innerHTML = '<div class="lc-omni-address-message is-error">Enter at least four characters first.</div>';
        positionList();
        return;
      }
      clearTimeout(timer);
      search(query);
    });
    return button;
  }

  function positionLookupButton() {
    const button = getLookupButton();
    if (!addressInput || !visible(addressInput)) {
      button.style.display = 'none';
      return;
    }
    const rect = addressInput.getBoundingClientRect();
    button.style.display = 'block';
    button.style.left = `${window.scrollX + rect.right + 6}px`;
    button.style.top = `${window.scrollY + rect.top}px`;
    button.style.height = `${rect.height}px`;
  }

  function hideSuggestions() {
    const list = document.getElementById('lc-omni-address-suggestions');
    if (list) list.innerHTML = '';
  }

  async function search(query) {
    const currentRequest = ++requestNumber;
    const list = getList();
    const lookupButton = getLookupButton();
    const originalButtonText = lookupButton.textContent;
    lookupButton.textContent = 'Searching…';
    lookupButton.disabled = true;
    list.innerHTML = '<div class="lc-omni-address-message">Finding addresses…</div>';
    positionList();

    try {
      const params = new URLSearchParams({
        q: `${query}, New Zealand`,
        limit: '8',
        bbox: '166,-48,179,-34',
        lang: 'en'
      });
      const data = await requestJson(`${API_URL}?${params}`);
      if (currentRequest !== requestNumber) return;
      currentSuggestions = (Array.isArray(data.features) ? data.features : [])
        .map(photonAddress)
        .filter(address => address.address1 && address.city);
      list.innerHTML = currentSuggestions.length
        ? currentSuggestions.map((item, index) => `<button type="button" data-index="${index}">${addressLabel(item).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</button>`).join('')
        : '<div class="lc-omni-address-message">No matching addresses found.</div>';
      positionList();
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      console.error(error);
      list.innerHTML = '<div class="lc-omni-address-message is-error">Address lookup unavailable. Continue entering the address manually.</div>';
      positionList();
    } finally {
      if (currentRequest === requestNumber) {
        lookupButton.textContent = originalButtonText;
        lookupButton.disabled = false;
      }
    }
  }

  function attach() {
    const input = findField('Delivery Address 1');
    if (!input) return;
    addressInput = input;
    input.setAttribute('autocomplete', 'off');
    input.dataset.lcAddressAutocomplete = 'true';
    positionLookupButton();
    if (attachedInputs.has(input)) return;
    attachedInputs.add(input);
    input.addEventListener('input', event => handleAddressInput(event), true);
    input.addEventListener('keyup', event => handleAddressInput(event), true);
  }

  function handleAddressInput(event) {
    const currentField = event.target?.dataset?.lcAddressAutocomplete === 'true'
      ? event.target
      : findField('Delivery Address 1');
    if (!currentField || (event.target !== currentField && event.type !== 'manual')) return;
    addressInput = currentField;
    addressInput.setAttribute('autocomplete', 'off');
    clearTimeout(timer);
    const query = clean(addressInput.value);
    if (query.length < MIN_QUERY_LENGTH) {
      hideSuggestions();
      return;
    }
    timer = setTimeout(() => search(query), 700);
  }

  const style = document.createElement('style');
  style.textContent = `
    #lc-omni-address-suggestions {
      position: fixed;
      z-index: 2147483646;
      display: grid;
      max-height: 280px;
      overflow: auto;
      background: #fff;
      border: 1px solid #9db3d2;
      border-radius: 6px;
      box-shadow: 0 12px 28px rgba(15, 46, 106, .22);
      font: 13px/1.35 Arial, sans-serif;
    }
    #lc-omni-address-lookup-button {
      position: absolute;
      z-index: 2147483645;
      box-sizing: border-box;
      min-width: 92px;
      padding: 0 10px;
      color: #fff;
      background: #13377e;
      border: 1px solid #13377e;
      border-radius: 4px;
      font: 700 12px Arial, sans-serif;
      cursor: pointer;
    }
    #lc-omni-address-lookup-button:hover { background: #0f2e6a; }
    #lc-omni-address-suggestions:empty { display: none; }
    #lc-omni-address-suggestions button {
      padding: 9px 11px;
      color: #162947;
      background: #fff;
      border: 0;
      border-bottom: 1px solid #e2e8f1;
      text-align: left;
      cursor: pointer;
    }
    #lc-omni-address-suggestions button:hover { color: #fff; background: #13377e; }
    .lc-omni-address-message { padding: 10px 11px; color: #4c6485; }
    .lc-omni-address-message.is-error { color: #9a2d20; }
  `;
  document.head.appendChild(style);

  getList().addEventListener('mousedown', event => {
    const button = event.target.closest('button[data-index]');
    if (!button) return;
    event.preventDefault();
    const suggestion = currentSuggestions[Number(button.dataset.index)];
    if (suggestion) applySuggestion(suggestion);
  });
  document.addEventListener('mousedown', event => {
    if (event.target !== addressInput && !event.target.closest('#lc-omni-address-suggestions')) hideSuggestions();
  });
  document.addEventListener('input', handleAddressInput, true);
  document.addEventListener('keyup', event => {
    if (event.key === 'Escape') {
      hideSuggestions();
      return;
    }
    handleAddressInput(event);
  }, true);
  window.addEventListener('resize', () => { positionList(); positionLookupButton(); });
  window.addEventListener('scroll', () => { positionList(); positionLookupButton(); }, { passive: true });
  setInterval(attach, 1200);
  attach();
})();
