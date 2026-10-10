// ==UserScript==
// @name         Living Culture Omni Workflow Navigation
// @namespace    livingculture
// @version      0.1.0
// @description  Adds Workflow to the Omni top navigation.
// @match        https://go.cin7.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (location.hostname !== 'go.cin7.com' || window.parent !== window) return;
  const id = 'lc-omni-workflow-nav-link';
  const label = element => (element.textContent || '').replace(/[\u2605\u2b50]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  let scheduled = false;

  function addLink() {
    scheduled = false;
    if (document.getElementById(id)) return;
    const controls = Array.from(document.querySelectorAll('a,button')).filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 120;
    });
    const newQuote = controls.find(element => label(element) === 'new quote');
    if (!newQuote) return;
    let nav = newQuote.parentElement;
    while (nav && nav !== document.body && !(controls.some(element => nav.contains(element) && label(element) === 'sales orders')
      && controls.some(element => nav.contains(element) && label(element) === 'quotes'))) nav = nav.parentElement;
    if (!nav || nav === document.body) return;
    const link = document.createElement('a');
    link.id = id;
    link.href = 'https://living-culture-workflow.vercel.app/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Workflow';
    link.title = 'Open Living Culture Workflow in a new tab';
    link.className = newQuote.className;
    link.classList.remove('active', 'selected', 'current');
    const style = getComputedStyle(newQuote);
    link.style.cssText = `color:${style.color};font:${style.font};text-decoration:none;white-space:nowrap;`;
    const more = controls.find(element => nav.contains(element) && label(element) === 'more');
    let anchor = more || newQuote;
    while (anchor.parentElement !== nav) anchor = anchor.parentElement;
    if (anchor.tagName === 'LI') {
      const item = document.createElement('li');
      item.className = anchor.className;
      item.classList.remove('active', 'selected', 'current');
      item.appendChild(link);
      anchor.after(item);
    } else {
      link.style.padding = style.padding;
      link.style.display = 'inline-flex';
      link.style.alignItems = 'center';
      anchor.after(link);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(addLink);
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true });
  window.addEventListener('resize', schedule);
  schedule();
})();
