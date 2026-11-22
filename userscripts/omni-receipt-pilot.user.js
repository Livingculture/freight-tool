// ==UserScript==
// @name         Living Culture Receipt Pilot - Private Test
// @namespace    livingculture-receipt-pilot
// @version      0.1.1
// @description  Separate visible-tab receipt test. Not included in All-in-One.
// @match        https://go.cin7.com/Cloud/*
// @run-at       document-idle
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-receipt-pilot.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-receipt-pilot.user.js
// ==/UserScript==

(function () {
  'use strict';
  const isEditScreen = /\/Cloud\/TransactionEntry\/TransactionEntry\.aspx/i.test(location.pathname);
  if ((window.top !== window.self && !isEditScreen) || document.getElementById('lc-receipt-pilot-marker')) return;
  const STATE_KEY = 'lc-receipt-pilot-v1';
  const PARAM = 'lcReceiptPilot';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const headingText = () => [...Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')).map(element=>clean(element.textContent)),document.title,clean(document.body.innerText)].join(' ');
  const visible = element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const labels = element => [element.value, element.textContent, element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('alt')].map(value => clean(value).toLowerCase());
  const read = () => { try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch { return null; } };
  const write = state => sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  let state = read(), busy = false, timer = null;
  const marker = document.createElement('span'); marker.id = 'lc-receipt-pilot-marker'; marker.hidden = true; document.body.append(marker);

  function status(message, failed = false) {
    let panel = document.getElementById('lc-receipt-pilot-status');
    if (!panel) {
      panel = document.createElement('aside'); panel.id = 'lc-receipt-pilot-status';
      panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;box-sizing:border-box;width:360px;max-width:calc(100vw - 32px);padding:14px;border:1px solid #178477;border-radius:6px;background:#f0faf8;color:#163e38;font:14px/1.45 Arial,sans-serif;box-shadow:0 3px 16px #0002';
      const title = document.createElement('strong'); title.textContent = 'Receipt Pilot 0.1.1';
      const text = document.createElement('p'); text.dataset.message = '1'; text.style.margin = '8px 0';
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy diagnostics';
      copy.onclick = async () => {
        // Diagnostics deliberately exclude URLs, document parameters and customer data.
        const current = read();
        const report = JSON.stringify({ version:'0.1.1', stage:current?.stage, page:location.pathname, message:text.textContent, events:current?.events || [] },null,2);
        try { await navigator.clipboard.writeText(report); copy.textContent = 'Copied'; }
        catch { copy.textContent = 'Copy unavailable'; }
      };
      const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop test'; stop.style.marginLeft = '8px';
      stop.onclick = () => { if (timer) clearInterval(timer); sessionStorage.removeItem(STATE_KEY); busy = true; panel.remove(); };
      panel.append(title,text,copy,stop); document.body.append(panel);
    }
    panel.querySelector('[data-message]').textContent = message;
    panel.style.borderColor = failed ? '#c0393a' : '#178477';
  }

  function transition(stage, message) {
    state = { ...state, stage, events:[...(state.events || []),{stage,at:new Date().toISOString()}] };
    write(state); status(message);
  }

  function controls() {
    const roots = [document], seen = new Set();
    const result = [];
    for (let i=0;i<roots.length && i<30;i++) {
      const root = roots[i]; if (seen.has(root)) continue; seen.add(root);
      result.push(...root.querySelectorAll('a,button,input[type="button"],input[type="submit"],input[type="image"],[role="button"]'));
      for (const frame of root.querySelectorAll('iframe,frame')) { try { if (frame.contentDocument) roots.push(frame.contentDocument); } catch {} }
      for (const element of root.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
    }
    return result.filter(element => !element.closest('#lc-receipt-pilot-status') && visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true');
  }

  function receiptUrl(element) {
    const raw = element.getAttribute('href') || element.getAttribute('formaction');
    if (!raw || /^javascript:/i.test(raw)) return '';
    try {
      const url = new URL(raw.replace(/&amp;/gi,'&'),location.href);
      return url.protocol === 'https:' && url.hostname === 'go.cin7.com' && /^\/Cloud\/Docs\/PDF\/?$/i.test(url.pathname)
        && ['receipt','order 5'].includes(clean(url.searchParams.get('T')).toLowerCase()) ? url.href : '';
    } catch { return ''; }
  }

  function activate(control) {
    control.setAttribute('target','_self'); control.setAttribute('formtarget','_self');
    const form = control.form || control.closest('form'); if (form) form.target = '_self';
    control.click();
  }

  function tick() {
    if (busy || !state) return;
    const pageOrder = headingText()
      .match(/\bNZSO-?\d+[A-Z]?\b(?![-A-Z0-9])/i)?.[0]?.replace(/^NZSO(?!-)/i,'NZSO-').toUpperCase();
    if (pageOrder && pageOrder !== state.order) {
      busy = true; clearInterval(timer); status('Stopped: this tab opened a different order.',true); return;
    }
    if (Date.now() - state.startedAt > 180000) {
      busy = true; clearInterval(timer);
      status(`Stopped at ${state.stage}: Cin7 did not show the next control within three minutes. Copy diagnostics and leave this tab open.`,true);
      return;
    }
    if (state.stage === 'edit') {
      const heading = headingText();
      if (!/Edit\s+Sales Order/i.test(heading)) return;
      const order = heading.match(/\bNZSO-?\d+[A-Z]?\b(?![-A-Z0-9])/i)?.[0]?.replace(/^NZSO(?!-)/i,'NZSO-').toUpperCase();
      if (order && order !== state.order) { busy = true; status('Stopped: this tab opened a different order.',true); clearInterval(timer); return; }
      const admin = controls().find(element=>labels(element).includes('go to admin'));
      if (!admin) return;
      transition('admin','Step 1: Go to Admin selected. Waiting for Cin7 Admin.'); activate(admin); return;
    }
    if (state.stage === 'admin') {
      const receipt = controls().find(element=>receiptUrl(element));
      if (!receipt) return;
      transition('receipt','Step 2: Opening the native receipt. Waiting for Download. If a PDF downloads directly, check Chrome Downloads.');
      location.assign(receiptUrl(receipt)); return;
    }
    if (state.stage === 'receipt') {
      const download = controls().find(element=>labels(element).some(value=>['download','download pdf','download receipt'].includes(value)));
      if (!download) return;
      transition('requested','Step 3: Cin7 Download clicked. Check Chrome Downloads. This tab stays open; file completion is not confirmed by the test.');
      busy = true; clearInterval(timer); activate(download);
    }
  }

  const token = new URL(location.href).searchParams.get(PARAM);
  if (token && /^[a-f0-9-]{36}$/i.test(token) && (!state || state.id !== token)) {
    const heading = headingText();
    const order = heading.match(/\bNZSO-?\d+[A-Z]?\b(?![-A-Z0-9])/i)?.[0]?.replace(/^NZSO(?!-)/i,'NZSO-').toUpperCase();
    if (order) { state = {id:token,order,stage:'edit',startedAt:Date.now(),events:[]}; write(state); }
  }
  // A normal edit tab must always retain the launcher, even after an earlier test.
  if (!token && isEditScreen) state = null;
  if (state && Date.now()-state.startedAt > 180000) { sessionStorage.removeItem(STATE_KEY); state = null; }
  if (state && Date.now()-state.startedAt <= 180000 && state.stage !== 'requested') {
    status(`Receipt test: waiting at ${state.stage}. Keep this tab visible.`);
    timer = setInterval(tick,500); tick();
  } else if (state?.stage === 'requested') {
    status('Cin7 Download was requested. Check Chrome Downloads; this test has not confirmed the file.');
  }

  function addButton() {
    if (!/\/Cloud\/TransactionEntry\/TransactionEntry\.aspx/i.test(location.pathname) || document.getElementById('lc-receipt-pilot-button')) return;
    const button = document.createElement('button'); button.id = 'lc-receipt-pilot-button'; button.type = 'button'; button.textContent = 'Receipt Test';
    button.style.cssText = 'position:fixed!important;top:90px!important;right:16px!important;bottom:auto!important;left:auto!important;z-index:2147483647!important;display:block!important;visibility:visible!important;opacity:1!important;padding:11px 18px;background:#177c62;color:white;border:1px solid #11644f;border-radius:4px;font:700 14px Arial;cursor:pointer';
    button.onclick = () => {
      if (!/Edit\s+Sales Order/i.test(headingText())) { status('Receipt Pilot is running. Open a saved sales order to start the test.',true); return; }
      const url = new URL(location.href); url.searchParams.set(PARAM,crypto.randomUUID());
      try {
        const tab = GM_openInTab(url.href,{active:true,insert:true});
        if (!tab) throw Error('No test tab opened.');
        status('Test opened in a separate visible tab. Use Receipt Test, not the normal Download Receipt button, for this pilot.');
      } catch { status('Could not open the test tab. Check Tampermonkey permissions.',true); }
    };
    document.body.append(button);
  }
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Receipt Pilot: show test button', () => {
    addButton(); status('Receipt Pilot 0.1.1 is running. The green Receipt Test button is at the top-right of the order screen.');
  });
  if (!token) {
    addButton();
    const observer = new MutationObserver(addButton); observer.observe(document.body,{childList:true,subtree:true});
  }
})();
