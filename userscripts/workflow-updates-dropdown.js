(function (root) {
  'use strict';

  function mount(button, options) {
    if (button.dataset.updatesMounted) return;
    button.dataset.updatesMounted = 'true';
    const base = options.base || location.origin;
    const request = options.request || (async () => {
      const response = await fetch(base + '/api/workflow-updates?feed=1', { credentials: 'include', cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Sign in to Workflow to view updates.');
      return response.json();
    });
    if (!document.getElementById('lc-updates-dropdown-style')) {
      const style = document.createElement('style');
      style.id = 'lc-updates-dropdown-style';
      style.textContent = `
        @keyframes lc-updates-green {0%,100%{background:#e4f6e9;box-shadow:0 0 0 2px #74c991}50%{background:#19834b;color:#fff;box-shadow:0 0 0 4px #b2e6c3}}
        button.lc-updates-unread {animation:lc-updates-green 2.4s ease-in-out infinite!important;border-color:#19834b!important}
        @media(prefers-reduced-motion:reduce){button.lc-updates-unread{animation:none!important;background:#d9f5e3!important;color:#145b35!important;border-color:#19834b!important}}
        .lc-updates-panel {position:fixed;z-index:2147483000;width:420px;max-width:calc(100vw - 16px);display:flex;flex-direction:column;background:#fff;color:#25433e;border:1px solid #ccdeda;border-radius:6px;box-shadow:0 8px 24px #183c3526;font:14px/1.5 Arial,sans-serif;text-align:left;letter-spacing:0;box-sizing:border-box}
        .lc-updates-panel[hidden]{display:none}
        .lc-updates-panel *{box-sizing:border-box;letter-spacing:0}
        .lc-updates-head,.lc-updates-foot {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;flex-shrink:0}
        .lc-updates-head {border-bottom:1px solid #e0e9e7}
        .lc-updates-head h2 {font:bold 16px/1.4 Arial,sans-serif;margin:0;color:#25433e}
        .lc-updates-head button {width:30px;height:30px;border:0;border-radius:4px;background:#eef4f2;color:#25433e;font:22px Arial,sans-serif;cursor:pointer}
        .lc-updates-list {overflow-y:auto;overscroll-behavior:contain;min-height:0;padding:0 14px}
        .lc-updates-list article {padding:14px 0;border-bottom:1px solid #e0e9e7}
        .lc-updates-list h3 {font:bold 15px/1.4 Arial,sans-serif;margin:4px 0 8px;color:#25433e;overflow-wrap:anywhere}
        .lc-updates-list p {margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
        .lc-updates-list small {font-size:12px;color:#607571}
        .lc-updates-message {padding:16px 0}
        .lc-updates-foot {border-top:1px solid #e0e9e7;font-size:13px}
        .lc-updates-foot a {color:#087d91;text-decoration:underline}
      `;
      document.head.appendChild(style);
    }
    const panel = document.createElement('section');
    panel.id = button.id + '-dropdown';
    panel.className = 'lc-updates-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Omni and Workflow updates');
    panel.innerHTML = '<div class="lc-updates-head"><h2>Updates</h2><button type="button" aria-label="Close updates">&times;</button></div><div class="lc-updates-list" tabindex="0" aria-label="Published updates"></div><div class="lc-updates-foot"><a>All updates</a><a>Edit / approve updates</a></div>';
    const list = panel.querySelector('.lc-updates-list');
    panel.querySelectorAll('a').forEach(link => {
      link.href = base + '/updates';
      if (options.external) { link.target = '_blank'; link.rel = 'noopener'; }
    });
    document.body.appendChild(panel);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');
    let data = null, pending = false;
    function key() { return 'lc-updates-read-v1:' + data.userId; }
    function read() { try { return JSON.parse(localStorage.getItem(key()) || '[]'); } catch { return []; } }
    function tokens() { return data.updates.map(entry => entry.id + ':' + entry.publishedAt); }
    function alertUnread() {
      const seen = read();
      const unread = tokens().some(token => !Array.isArray(seen) || !seen.includes(token));
      button.classList.toggle('lc-updates-unread', unread);
      button.title = unread ? 'New approved updates' : 'Omni and Workflow updates';
    }
    function markRead() {
      if (!data) return;
      try { localStorage.setItem(key(), JSON.stringify(tokens())); } catch { /* Storage may be disabled. */ }
      button.classList.remove('lc-updates-unread');
      button.title = 'Omni and Workflow updates';
    }
    function position() {
      if (panel.hidden) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(420, innerWidth - 16);
      panel.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
      const top = Math.min(rect.bottom + 6, Math.max(8, innerHeight - 180));
      panel.style.top = top + 'px';
      panel.style.maxHeight = Math.max(100, Math.min(520, innerHeight - top - 8)) + 'px';
    }
    function render() {
      list.replaceChildren();
      if (!data.updates.length) {
        const message = document.createElement('p'); message.className = 'lc-updates-message';
        message.textContent = 'No published updates yet.'; list.appendChild(message);
      }
      data.updates.forEach(entry => {
        const article = document.createElement('article');
        const meta = document.createElement('small');
        meta.textContent = (entry.category === 'both' ? 'Omni & Workflow' : entry.category === 'omni' ? 'Omni' : 'Workflow') + ' · ' + new Date(entry.publishedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' }) + (entry.version ? ' · ' + entry.version : '');
        const title = document.createElement('h3'); title.textContent = entry.title;
        const body = document.createElement('p'); body.textContent = entry.body;
        article.append(meta, title, body); list.appendChild(article);
      });
    }
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await request();
        if (!result.userId || !Array.isArray(result.updates)) throw new Error('Sign in to Workflow to view updates.');
        data = result;
        panel.querySelector('.lc-updates-foot a:last-child').hidden = !result.isAdmin;
        render(); alertUnread();
        if (!panel.hidden) markRead();
      } catch {
        data = null;
        button.classList.remove('lc-updates-unread');
        list.replaceChildren();
        const message = document.createElement('p'); message.className = 'lc-updates-message';
        message.textContent = 'Could not load updates. Open Workflow to sign in, then try again.';
        list.appendChild(message);
      } finally { pending = false; }
    }
    function close() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
    button.addEventListener('click', () => {
      if (!panel.hidden) { close(); return; }
      panel.hidden = false; button.setAttribute('aria-expanded', 'true'); position();
      markRead(); refresh(); list.focus({ preventScroll: true });
    });
    panel.querySelector('button').addEventListener('click', () => { close(); button.focus(); });
    document.addEventListener('pointerdown', event => { if (!panel.contains(event.target) && !button.contains(event.target)) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { close(); button.focus(); } });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', event => { if (data && event.key === key()) alertUnread(); });
    document.addEventListener('visibilitychange', refresh);
    setInterval(refresh, 60000);
    list.textContent = 'Loading updates...';
    refresh();
    return { refresh };
  }
  root.LCUpdatesDropdown = { mount };
  function init() {
    const button = document.getElementById('workflowUpdatesButton');
    if (button) mount(button, {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
