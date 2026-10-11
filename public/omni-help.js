(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const frames = [...document.querySelectorAll('iframe')];
  function closeOnEscape(event) {
    if (event.key === 'Escape' && window.parent !== window) {
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({ type: 'lc-staff-help-close' }, 'https://go.cin7.com');
    }
  }
  function loadFrame(frame) {
    if (!frame.getAttribute('src')) frame.src = frame.dataset.src;
  }
  function select(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (tab.id === 'tab-connections') loadFrame(document.getElementById('connections-frame'));
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault();select(tabs[next], true); }
    });
  });
  document.getElementById('button-reference').addEventListener('toggle', event => {
    if (event.target.open) loadFrame(document.getElementById('reference-frame'));
  });
  // Same-origin child guides keep Escape working from inside their own content.
  frames.forEach(frame => frame.addEventListener('load', () => {
    try { frame.contentDocument?.addEventListener('keydown', closeOnEscape, true); } catch { /* No access if the frame navigates away. */ }
  }));
  document.addEventListener('keydown', closeOnEscape);
})();
