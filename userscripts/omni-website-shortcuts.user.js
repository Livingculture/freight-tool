// ==UserScript==
// @name         Omni Living Culture Website Shortcuts
// @namespace    livingculture-omni
// @version      0.1.32
// @description  Adds Living Culture website shortcuts to the grey space between Cin7 Omni quote sections.
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @match        https://livingculture.co.nz/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-website-shortcuts.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-website-shortcuts.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      livingculture.co.nz
// ==/UserScript==

(function () {
  'use strict';

  if (location.hostname === 'livingculture.co.nz') {
    if (window.name.startsWith('lc_omni_')) {
      document.documentElement.style.zoom = '0.8';
    }
    return;
  }

  const BAR_ID = 'lc-omni-website-shortcuts';
  const SLOT_ID = 'lc-omni-website-shortcut-slot';
  const websitePopups = new Set();
  document.addEventListener('pointerdown', event => {
    // SKU insertion dispatches synthetic pointer events; only a real click dismisses the window.
    if (!event.isTrusted) return;
    for (const popup of websitePopups) {
      if (!popup.closed) popup.close();
      websitePopups.delete(popup);
    }
  }, true);
  const SHORTCUTS = [
    {
      label: 'Tasman',
      url: 'https://livingculture.co.nz/collections/tasman-pergola/products/lc150-premium-custom-freestanding-louvre-roof'
    },
    {
      label: 'Atlantic',
      url: 'https://livingculture.co.nz/collections/atlantic-pergola/products/atlantic-manual-freestanding-louvre-roof'
    },
    {
      label: 'Baltic',
      url: 'https://livingculture.co.nz/collections/baltic-pergola/products/baltic-freestanding-louvre-roof-aluminium-pergola'
    },
    {
      label: 'Caspian',
      url: 'https://livingculture.co.nz/collections/caspian-pergola/products/caspian-motorised-freestanding-louvre-roof-aluminium-pergola'
    },
    {
      label: 'Blinds',
      url: 'https://livingculture.co.nz/collections/blinds'
    },
    {
      label: 'Gas Fire Pits',
      url: 'https://livingculture.co.nz/collections/gas-fire-pits'
    },
    {
      label: 'Teak Sofa',
      url: 'https://livingculture.co.nz/collections/teak-lounge'
    },
    {
      label: 'Aluminium Sofa',
      url: 'https://livingculture.co.nz/collections/aluminium-lounge'
    },
    {
      label: 'Dining Tables',
      url: 'https://livingculture.co.nz/collections/dining-tables'
    },
    {
      label: 'Dining Chairs',
      url: 'https://livingculture.co.nz/collections/outdoor-dining-chairs'
    },
    {
      label: 'Bar Furniture',
      url: 'https://livingculture.co.nz/collections/outdoor-bar-furniture'
    },
    {
      label: 'Cantilever Umbrellas',
      url: 'https://livingculture.co.nz/collections/cantilever-umbrellas'
    },
    {
      label: 'Outdoor Grills',
      url: 'https://livingculture.co.nz/collections/charcoal-grills'
    },
    {
      label: 'Awnings',
      url: 'https://livingculture.co.nz/collections/awnings'
    },
    {
      label: 'Patio Covers',
      url: 'https://livingculture.co.nz/collections/wall-mounted-patio-cover'
    }
  ];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function productTableCard() {
    const addLine = Array.from(document.querySelectorAll('button, input, a, [role="button"]'))
      .filter(visible)
      .find(element => /^add\s+a\s+new\s+line$/i.test(clean(element.value || element.textContent)));
    const headerRows = Array.from(document.querySelectorAll('tr')).filter(visible).filter(row => {
      const labels = Array.from(row.children).map(cell => clean(cell.textContent).toLowerCase());
      return labels.some(value => /(?:^|\s)code$/.test(value)) &&
        labels.some(value => /(?:^|\s)product$/.test(value));
    });
    const headerRow = headerRows.find(row => addLine && row.closest('table')?.parentElement?.contains(addLine)) || headerRows[0];
    const table = headerRow?.closest('table');
    if (!table) return null;
    let current = table.parentElement;
    while (current && current !== document.body) {
      if (addLine && current.contains(addLine)) return current;
      current = current.parentElement;
    }
    return table.parentElement;
  }

  function orderCurrencyCard() {
    const label = Array.from(document.querySelectorAll('label, div, span, td, th'))
      .filter(visible)
      .filter(element => /^order\s+currency$/i.test(clean(element.textContent)))
      .sort((a, b) => a.children.length - b.children.length)[0];
    if (!label) return null;
    const labelRect = label.getBoundingClientRect();
    let current = label.parentElement;
    let best = null;
    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const colour = getComputedStyle(current).backgroundColor;
      if (rect.width > window.innerWidth * 0.65 && rect.top <= labelRect.top && labelRect.top - rect.top < 120 && /rgb\(255, 255, 255\)|rgba\(255, 255, 255/.test(colour)) best = current;
      current = current.parentElement;
    }
    return best;
  }

  function openShortcut(shortcut) {
    const browserWidth = window.outerWidth || window.innerWidth;
    const browserHeight = window.outerHeight || window.innerHeight;
    const browserLeft = Number.isFinite(window.screenX) ? window.screenX : window.screenLeft;
    const browserTop = Number.isFinite(window.screenY) ? window.screenY : window.screenTop;
    const width = Math.min(820, Math.max(680, Math.round(browserWidth * 0.4)));
    const height = Math.min(680, Math.max(520, Math.round(browserHeight * 0.6)));
    const left = Math.round(browserLeft + browserWidth - width - 18);
    const top = Math.round(browserTop + 44);
    const popup = window.open(shortcut.url, `lc_omni_${shortcut.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (!popup) window.alert(`Chrome blocked the ${shortcut.label} popup. Please allow popups for Cin7 Omni and try again.`);
    else {
      websitePopups.add(popup);
      try { popup.moveTo(left, top); } catch (error) { /* Browser positioning from window.open is sufficient. */ }
      popup.focus();
    }
    return popup;
  }

  const pergolaCatalogues = new Map();

  function loadPergolas(family) {
    if (pergolaCatalogues.has(family)) return pergolaCatalogues.get(family);
    const pending = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://livingculture.co.nz/collections/${family === 'Blinds' ? 'blinds' : `${family.toLowerCase()}-pergola`}/products.json?limit=250`,
        timeout: 15000,
        onload: response => {
          try {
            if (response.status < 200 || response.status >= 300) throw new Error('Website products could not be loaded.');
            const products = JSON.parse(response.responseText).products;
            if (!Array.isArray(products)) throw new Error('Website products could not be read.');
            const matches = products.filter(product => family === 'Blinds' ? /blind/i.test(product.title) : product.title.startsWith(`${family} `) && /louvre roof/i.test(product.title));
            if (!matches.length) throw new Error('No matching products were found.');
            resolve(matches);
          } catch (error) { reject(error); }
        },
        onerror: () => reject(new Error('Website products could not be loaded.')),
        ontimeout: () => reject(new Error('Website products took too long to load.'))
      });
    }).catch(error => { pergolaCatalogues.delete(family); throw error; });
    pergolaCatalogues.set(family, pending);
    return pending;
  }

  let closePergolaPicker = null;

  function blindMatches(product, mounting, operation) {
    const title = clean(product.title);
    const mounted = mounting === 'wall' ? /wall[\s-]*mount(?:ed)?/i.test(title) : /free[\s-]*standing/i.test(title);
    const blindName = title.split(/\b(?:for|to suit)\b/i)[0];
    const motorised = /motor(?:ised|ized)/i.test(blindName);
    const manual = !motorised && /manual|retractable/i.test(blindName);
    return mounted && (operation === 'motorised' ? motorised : operation === 'manual' ? manual : false);
  }

  async function selectPergola(shortcut, trigger) {
    const isBlinds = shortcut.label === 'Blinds';
    if (trigger.getAttribute('aria-expanded') === 'true') { closePergolaPicker?.(); return; }
    closePergolaPicker?.(false);
    const root = document.createElement('div');
    root.id = 'lc-omni-pergola-picker';
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{font:14px Arial,sans-serif;color:#172b49}*{box-sizing:border-box}
      .shade{position:fixed;z-index:2147483647;width:300px;max-width:calc(100vw - 16px)}
      .dialog{max-height:calc(100vh - 16px);overflow:auto;background:#fff;border:1px solid #9db3d2;border-radius:4px;box-shadow:0 4px 14px #0003}
      header{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:#13377e;color:#fff}h2{margin:0;font-size:14px}
      button{cursor:pointer}.close{border:0;background:transparent;color:#fff;font-size:20px;width:26px;height:26px}
      .fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;padding:10px}label{display:grid;gap:4px;font-size:12px;font-weight:700}select{width:100%;min-width:0;height:32px;border:1px solid #9db3d2;border-radius:4px;background:#fff;padding:0 5px;font:12px Arial}
      label:has(#model){grid-column:1 / -1}#status,#retry{grid-column:1 / -1}
      #blind-options{display:contents}
      #status{margin:0;color:#526987}#status.error{color:#a32d22}#retry{height:34px;border:1px solid #13377e;border-radius:4px;background:#fff;color:#13377e;font-weight:700}
      [hidden]{display:none!important}
    </style><div class="shade"><section class="dialog" role="dialog" aria-labelledby="title"><header><h2 id="title"></h2><button class="close" aria-label="Close">&times;</button></header><div class="fields"><p id="status" role="status">Loading products...</p><label>Mounting<select id="mount" disabled><option value="">Select mounting</option><option value="free">Freestanding</option><option value="wall">Wall Mounted</option></select></label><label>Model<select id="model" disabled></select></label><label>Size<select id="size" disabled></select></label><label>Colour<select id="colour" disabled></select></label><button id="retry" hidden>Retry</button></div></section></div>`;
    document.body.appendChild(root);
    shadow.getElementById('title').textContent = shortcut.label;
    trigger.setAttribute('aria-expanded', 'true');
    const dropdown = shadow.querySelector('.shade');
    const position = () => {
      if (!trigger.isConnected) { close(false); return; }
      const anchor = trigger.getBoundingClientRect();
      const rect = dropdown.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8));
      const below = anchor.bottom + 6;
      const top = below + rect.height <= window.innerHeight - 8 ? below :
        anchor.top - rect.height - 6 >= 8 ? anchor.top - rect.height - 6 : Math.max(8, window.innerHeight - rect.height - 8);
      dropdown.style.left = `${left}px`;
      dropdown.style.top = `${top}px`;
    };
    const outside = event => { if (!event.composedPath().includes(root) && !trigger.contains(event.target)) close(false); };
    const close = (restoreFocus = true) => {
      root.remove(); trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      resizeObserver.disconnect();
      if (closePergolaPicker === close) closePergolaPicker = null;
      if (restoreFocus) trigger.focus();
    };
    closePergolaPicker = close;
    const onKey = event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const controls = [...shadow.querySelectorAll('button, select')].filter(control => !control.disabled && !control.hidden);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    const resizeObserver = new ResizeObserver(position);
    resizeObserver.observe(dropdown);
    position();
    shadow.querySelector('.close').onclick = close;
    shadow.querySelector('.close').focus();
    const mount = shadow.getElementById('mount'), model = shadow.getElementById('model');
    mount.setAttribute('aria-label', 'Mounting');
    model.setAttribute('aria-label', isBlinds ? 'Blind' : 'Model');
    const size = shadow.getElementById('size'), colour = shadow.getElementById('colour'), status = shadow.getElementById('status');
    const blindOptions = document.createElement('div');
    blindOptions.id = 'blind-options';
    model.closest('label').insertAdjacentElement('afterend', blindOptions);
    let operation = null;
    if (isBlinds) {
      [size, colour].forEach(select => { select.closest('label').hidden = true; });
      model.closest('label').firstChild.textContent = 'Blind';
      const operationLabel = document.createElement('label');
      operationLabel.textContent = 'Operation';
      operation = document.createElement('select');
      operation.id = 'operation';
      operation.setAttribute('aria-label', 'Operation');
      operation.disabled = true;
      operation.append(new Option('Select operation', ''), new Option('Motorised', 'motorised'), new Option('Manual / Retractable', 'manual'));
      operationLabel.appendChild(operation);
      mount.closest('label').insertAdjacentElement('afterend', operationLabel);
    }
    let products = [], selectedProduct = null;
    const fill = (select, placeholder, options) => {
      select.replaceChildren(new Option(placeholder, ''), ...options.map(option => new Option(option.label, option.value)));
      select.disabled = options.length === 0;
    };
    fill(model, 'Select model', []); fill(size, 'Select size', []); fill(colour, 'Select colour', []);
    const variants = () => (selectedProduct?.variants || []).filter(variant => clean(variant.sku));
    const optionKey = name => {
      const option = selectedProduct?.options.find(option => new RegExp(name, 'i').test(option.name));
      return option ? `option${option.position}` : null;
    };
    const openVariant = variant => {
      const url = new URL(`https://livingculture.co.nz/products/${selectedProduct.handle}`);
      url.searchParams.set('variant', variant.id);
      if (!openShortcut({ label: shortcut.label, url: url.href })) return false;
      window.dispatchEvent(new CustomEvent('lc:omni-add-sku', { detail: { sku: clean(variant.sku).toUpperCase() } }));
      close();
      return true;
    };
    const chooseBlind = () => {
      blindOptions.replaceChildren();
      if (!selectedProduct) return;
      const options = [...selectedProduct.options].sort((a, b) => a.position - b.position);
      const selects = options.map(option => {
        const label = document.createElement('label');
        label.textContent = /colou?r/i.test(option.name) ? 'Colour' : option.name;
        const select = document.createElement('select');
        select.dataset.option = `option${option.position}`;
        select.setAttribute('aria-label', label.textContent);
        label.appendChild(select); blindOptions.appendChild(label);
        return select;
      });
      const matching = count => variants().filter(variant => selects.slice(0, count).every(select => variant[select.dataset.option] === select.value));
      const refresh = start => {
        for (let index = start; index < selects.length; index += 1) {
          const values = index === start ? [...new Set(matching(index).map(variant => variant[selects[index].dataset.option]).filter(Boolean))] : [];
          fill(selects[index], `Select ${options[index].name.toLowerCase()}`, values.map(value => ({ label: value, value })));
        }
      };
      selects.forEach((select, index) => {
        select.onchange = () => {
          if (index < selects.length - 1) { refresh(index + 1); return; }
          if (selects.some(select => !select.value)) return;
          const matches = matching(selects.length);
          if (matches.length !== 1) { status.hidden = false; status.className = 'error'; status.textContent = 'This selection does not identify one SKU.'; return; }
          if (!openVariant(matches[0])) select.value = '';
        };
      });
      refresh(0);
    };
    const chooseModel = () => {
      selectedProduct = products.find(product => String(product.id) === model.value);
      model.title = selectedProduct?.title || '';
      if (isBlinds) { chooseBlind(); return; }
      const key = optionKey('size');
      const sizes = [...new Set(variants().map(variant => variant[key]).filter(Boolean))];
      fill(size, 'Select size', sizes.map(value => ({ label: value, value })));
      fill(colour, 'Select colour', []);
    };
    mount.onchange = () => {
      if (isBlinds) {
        operation.value = ''; operation.disabled = !mount.value;
        selectedProduct = null; model.title = ''; blindOptions.replaceChildren();
        fill(model, 'Select blind', []); status.hidden = true;
        return;
      }
      const matches = mount.value ? products.filter(product => mount.value === 'wall' ? /wall mounted/i.test(product.title) : /freestanding/i.test(product.title)) : [];
      fill(model, 'Select model', matches.map(product => ({ value: String(product.id), label: product.title.replace(`${shortcut.label} `, '').replace(/ Louvre Roof Aluminium Pergola/i, '') })));
      selectedProduct = null; fill(size, 'Select size', []); fill(colour, 'Select colour', []);
      if (matches.length === 1) { model.value = String(matches[0].id); chooseModel(); }
    };
    if (isBlinds) operation.onchange = () => {
      selectedProduct = null; model.title = ''; blindOptions.replaceChildren();
      const matches = mount.value && operation.value ? products.filter(product => blindMatches(product, mount.value, operation.value)) : [];
      fill(model, 'Select blind', matches.map(product => ({ value: String(product.id), label: product.title })));
      status.className = '';
      status.textContent = 'No matching blinds were found.';
      status.hidden = !mount.value || !operation.value || matches.length > 0;
      if (matches.length === 1) { model.value = String(matches[0].id); chooseModel(); }
    };
    model.onchange = chooseModel;
    size.onchange = () => {
      const sizeKey = optionKey('size'), colourKey = optionKey('colou?r');
      const colours = [...new Set(variants().filter(variant => variant[sizeKey] === size.value).map(variant => variant[colourKey]).filter(Boolean))];
      fill(colour, 'Select colour', colours.map(value => ({ label: value, value })));
    };
    colour.onchange = () => {
      if (!size.value || !colour.value) return;
      const matches = variants().filter(variant => variant[optionKey('size')] === size.value && variant[optionKey('colou?r')] === colour.value);
      if (matches.length !== 1) { status.hidden = false; status.className = 'error'; status.textContent = 'This selection does not identify one SKU.'; return; }
      if (!openVariant(matches[0])) colour.value = '';
    };
    const load = async () => {
      status.hidden = false; status.className = ''; status.textContent = 'Loading products...';
      shadow.getElementById('retry').hidden = true;
      try {
        products = await loadPergolas(shortcut.label);
        if (!root.isConnected) return;
        status.hidden = true;
        mount.disabled = false; mount.focus();
      } catch (error) {
        status.className = 'error'; status.textContent = error.message;
        shadow.getElementById('retry').hidden = false;
      }
    };
    shadow.getElementById('retry').onclick = load;
    await load();
  }

  function ensureBar() {
    let bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = BAR_ID;
    for (const shortcut of SHORTCUTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = shortcut.label;
      if (['Tasman', 'Atlantic', 'Baltic', 'Caspian', 'Blinds'].includes(shortcut.label)) {
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'lc-omni-pergola-picker');
      }
      button.addEventListener('click', () => {
        if (['Tasman', 'Atlantic', 'Baltic', 'Caspian', 'Blinds'].includes(shortcut.label)) void selectPergola(shortcut, button);
        else openShortcut(shortcut);
      });
      bar.appendChild(button);
    }
    document.body.appendChild(bar);
    return bar;
  }

  function place() {
    const bar = ensureBar();
    const card = productTableCard();
    if (!card || !card.parentElement) {
      bar.style.display = 'none';
      return;
    }
    card.style.marginTop = '';
    let slot = document.getElementById(SLOT_ID);
    if (!slot) { slot = document.createElement('div'); slot.id = SLOT_ID; }
    if (slot.nextElementSibling !== card || slot.parentElement !== card.parentElement) card.parentElement.insertBefore(slot, card);
    const cardRect = card.getBoundingClientRect();
    const width = Math.max(0, Math.min(cardRect.width, window.innerWidth - Math.max(0, cardRect.left) - 16));
    slot.style.cssText = `box-sizing:border-box;display:block;width:${width}px;max-width:100%;padding:16px 0;background:#ededed;`;
    if (bar.parentElement !== slot) slot.appendChild(bar);
    bar.style.cssText = 'position:relative;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:7px;width:100%;';
    for (const button of bar.querySelectorAll('button')) {
      button.style.cssText = 'box-sizing:border-box;height:30px;min-width:92px;padding:0 14px;color:#13377e;background:#fff;border:1px solid #13377e;border-radius:4px;font:700 12px Arial,sans-serif;line-height:28px;text-align:center;cursor:pointer;white-space:nowrap;';
    }
  }

  function schedulePlace() {
    if (window.__lcOmniWebsiteShortcutFrame) return;
    window.__lcOmniWebsiteShortcutFrame = requestAnimationFrame(() => {
      window.__lcOmniWebsiteShortcutFrame = 0;
      place();
    });
  }

  place();
  new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target && !target.closest?.(`#${BAR_ID}, #${SLOT_ID}`);
    })) schedulePlace();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, { passive: true });
  setInterval(place, 5000);
})();
