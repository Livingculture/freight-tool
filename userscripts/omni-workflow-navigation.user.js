// ==UserScript==
// @name         Living Culture Omni Workflow Navigation
// @namespace    livingculture
// @version      0.1.2
// @description  Adds a Workflow pages dropdown to the Omni top navigation.
// @match        https://go.cin7.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (location.hostname !== 'go.cin7.com' || window.parent !== window) return;
  const id = 'lc-omni-workflow-nav-link';
  const menuId = 'lc-omni-workflow-nav-menu';
  const pages = [
    ['Open Workflow', '/'],
    ['Jobs Overview', '/jobs'],
    ['Customer Photos', '/customer-photos'],
    ['Site Visit', '/?app=workflow&planner=site-visit'],
    ['Quote Review', '/?app=workflow&planner=quote-review'],
    ['Deliver', '/?app=workflow&planner=deliveries'],
    ['Install', '/?app=workflow&planner=installs'],
    ['Collect', '/?app=workflow&planner=pickups'],
    ['Roster', '/?app=workflow&planner=roster'],
    ['Weekly Sales', '/weekly-sales'],
  ];
  const label = element => (element.textContent || '').replace(/[\u2605\u2b50]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  let scheduled = false;
  let menu;

  function closeMenu(focus = false) {
    if (menu) menu.hidden = true;
    const button = document.getElementById(id);
    button?.setAttribute('aria-expanded', 'false');
    if (focus) button?.focus();
  }

  function positionMenu() {
    const button = document.getElementById(id);
    if (!button || !menu || menu.hidden) return;
    const rect = button.getBoundingClientRect();
    menu.style.width = `${Math.min(240, innerWidth - 16)}px`;
    menu.style.maxHeight = `${Math.max(80, Math.min(440, innerHeight - rect.bottom - 12))}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${rect.bottom + 4}px`;
  }

  function openMenu(focus = false) {
    const button = document.getElementById(id);
    if (!button) return;
    if (!menu) {
      menu = document.createElement('div');
      menu.id = menuId;
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-labelledby', id);
      menu.style.cssText = 'position:fixed;z-index:2147483646;box-sizing:border-box;overflow-y:auto;padding:4px 0;background:white;border:1px solid #b7cadb;border-radius:4px;box-shadow:0 6px 20px #0003;font:14px Arial,sans-serif;';
      for (const [name, path] of pages) {
        const item = document.createElement('a');
        item.href = new URL(path, 'https://living-culture-workflow.vercel.app/').href;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        item.textContent = name;
        item.setAttribute('role', 'menuitem');
        item.style.cssText = 'display:block;box-sizing:border-box;padding:9px 14px;color:#123c65;text-decoration:none;white-space:nowrap;line-height:18px;';
        item.addEventListener('mouseenter', () => { item.style.background = '#edf4f9'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => closeMenu());
        menu.appendChild(item);
      }
      document.body.appendChild(menu);
    }
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    positionMenu();
    if (focus) menu.querySelector('a')?.focus();
  }

  function addLink() {
    scheduled = false;
    if (document.getElementById(id)) return;
    closeMenu();
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
    const link = document.createElement('button');
    link.id = id;
    link.type = 'button';
    link.textContent = 'Workflow';
    link.title = 'Open a Workflow page';
    link.setAttribute('aria-haspopup', 'menu');
    link.setAttribute('aria-expanded', 'false');
    link.setAttribute('aria-controls', menuId);
    link.className = newQuote.className;
    link.classList.remove('active', 'selected', 'current');
    const style = getComputedStyle(newQuote);
    link.style.cssText = `color:${style.color};font:${style.font};background:transparent;border:0;padding:${style.padding};display:inline-flex;align-items:center;gap:7px;cursor:pointer;white-space:nowrap;`;
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.style.cssText = 'width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid currentColor;';
    link.appendChild(arrow);
    link.addEventListener('click', () => menu && !menu.hidden ? closeMenu() : openMenu());
    link.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(true); }
    });
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
  document.addEventListener('click', event => {
    if (!menu?.contains(event.target) && !document.getElementById(id)?.contains(event.target)) closeMenu();
  });
  document.addEventListener('focusin', event => {
    if (!menu?.contains(event.target) && !document.getElementById(id)?.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (!menu || menu.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
    if (!menu.contains(event.target) || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.querySelectorAll('a'));
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
  window.addEventListener('resize', () => { positionMenu(); schedule(); });
  document.addEventListener('scroll', event => { if (!menu?.contains(event.target)) closeMenu(); }, true);
  schedule();
})();
