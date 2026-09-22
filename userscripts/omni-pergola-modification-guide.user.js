// ==UserScript==
// @name         Omni Living Culture Pergola Modification Guide
// @namespace    livingculture-omni
// @version      0.1.0
// @description  Adds an easy-to-read Minor Modification and Custom Pergola guide to Cin7 Omni.
// @author       Living Culture
// @match        https://go.cin7.com/Cloud/TransactionEntry/TransactionEntry.aspx*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pergola-modification-guide.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/omni-pergola-modification-guide.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'lc-omni-pergola-guide-root';
  const BUTTON_ID = 'lc-omni-pergola-guide-button';

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function pageElements(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(element => {
      return visible(element) && !element.closest(`#${ROOT_ID}`) && element.id !== BUTTON_ID;
    });
  }

  function createGuide() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    document.body.appendChild(root);
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{all:initial;font-family:Arial,sans-serif;color:#172b49}
        *{box-sizing:border-box}
        .backdrop{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(8,24,45,.68)}
        .backdrop.open{display:flex}
        .panel{display:flex;flex-direction:column;width:min(1120px,96vw);max-height:94vh;overflow:hidden;border:1px solid #9db3d2;border-radius:14px;background:#eef4fb;box-shadow:0 24px 70px rgba(0,0,0,.34)}
        header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px;background:#13377e;color:#fff}
        .eyebrow{margin-bottom:4px;color:#bfeef1;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
        h1{margin:0;font-size:24px;line-height:1.15}
        .subtitle{margin:5px 0 0;color:#dce8fa;font-size:13px}
        .close{flex:0 0 auto;height:38px;padding:0 16px;border:1px solid #fff;border-radius:6px;background:#fff;color:#13377e;font-weight:800;cursor:pointer}
        main{overflow:auto;padding:16px 18px 22px}
        .decision-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
        .decision{padding:14px 16px;border-radius:9px;background:#fff;box-shadow:0 1px 5px rgba(13,48,87,.08)}
        .decision.minor{border-left:6px solid #ef9f22}.decision.custom{border-left:6px solid #7047c7}
        .decision h2{margin:0 0 6px;font-size:18px}.decision p{margin:0;color:#425b78;font-size:14px;line-height:1.45}
        .fee{display:inline-flex;margin-top:9px;padding:5px 9px;border-radius:999px;background:#fff0cf;color:#704a08;font-size:12px;font-weight:800}
        .calculator{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:14px;margin-bottom:14px;padding:16px;border:1px solid #c4d3e5;border-radius:10px;background:#fff}
        h3{margin:0 0 5px;color:#13377e;font-size:18px}.intro{margin:0 0 12px;color:#526987;font-size:13px;line-height:1.4}
        .checks{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
        .check{display:grid;grid-template-columns:20px 1fr;gap:8px;padding:9px;border:1px solid #dbe5f0;border-radius:7px;background:#f9fbfe;cursor:pointer}
        .check input{width:17px;height:17px;margin:1px 0;accent-color:#13377e}.check strong{display:block;font-size:13px;line-height:1.3}.check small{display:block;margin-top:3px;color:#60758f;font-size:11px;line-height:1.3}
        .total{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:170px;padding:16px;border-radius:9px;background:#13377e;color:#fff;text-align:center}
        .total-label{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.count{margin-top:8px;font-size:15px}.amount{margin:5px 0 11px;font-size:31px;font-weight:900}.reset{height:31px;padding:0 12px;border:1px solid #fff;border-radius:5px;background:transparent;color:#fff;font-weight:700;cursor:pointer}
        .content-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
        .card{padding:15px 16px;border:1px solid #c4d3e5;border-radius:10px;background:#fff}.card h3{margin-bottom:9px}.card ul{margin:0;padding-left:19px}.card li{margin:0 0 7px;color:#334b66;font-size:13px;line-height:1.38}.card li:last-child{margin-bottom:0}.card strong{color:#172b49}
        .included{margin-top:10px;padding:10px 12px;border-radius:7px;background:#eee9fb;color:#4e368c;font-size:12px;font-weight:700;line-height:1.4}
        .examples{margin-bottom:14px;padding:15px 16px;border:1px solid #c4d3e5;border-radius:10px;background:#fff}.examples h3{margin-bottom:10px}
        table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 10px;border-bottom:1px solid #e1e8f1;text-align:left;vertical-align:top}th{background:#edf3fa;color:#294563;font-size:12px}td:last-child{font-weight:800;white-space:nowrap}tr:last-child td{border-bottom:0}
        .warning{margin-bottom:14px;padding:13px 15px;border:1px solid #efc3bd;border-left:6px solid #bd4435;border-radius:8px;background:#fff5f3;color:#703127;font-size:13px;line-height:1.48}.warning strong{display:block;margin-bottom:4px;color:#8e3024;font-size:14px}
        .rule{padding:15px 17px;border-radius:9px;background:#dff3f1;color:#164f55;font-size:14px;line-height:1.5}.rule strong{display:block;margin-bottom:5px;color:#075b66;font-size:17px}
        @media(max-width:760px){.decision-grid,.content-grid,.calculator{grid-template-columns:1fr}.checks{grid-template-columns:1fr}.total{min-height:130px}header{align-items:flex-start}h1{font-size:20px}.panel{max-height:100vh;border-radius:0}.backdrop{padding:0}}
      </style>
      <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="lc-pg-title">
        <section class="panel">
          <header>
            <div><div class="eyebrow">Living Culture · Sales Reference</div><h1 id="lc-pg-title">Pergola Modification Guide</h1><p class="subtitle">Minor Modification Fees and Custom Pergola classification</p></div>
            <button type="button" class="close">Close</button>
          </header>
          <main>
            <div class="decision-grid">
              <article class="decision minor"><h2>Minor Modification</h2><p>The finished pergola keeps its standard dimensions and fundamental structural configuration, with only an approved change listed below.</p><span class="fee">$500 per different modification type</span></article>
              <article class="decision custom"><h2>Custom Pergola</h2><p>The finished design changes the overall size or structural arrangement, or requires bespoke engineering beyond the standard product offering.</p><span class="fee">Quote as a custom pergola</span></article>
            </div>

            <section class="calculator">
              <div><h3>Approved minor modifications</h3><p class="intro">Select each different type requested. One or several identical items still count as one modification type.</p>
                <div class="checks">
                  <label class="check"><input type="checkbox" data-minor><span><strong>Move middle post(s) left or right</strong><small>Moving one or both middle posts counts as one modification.</small></span></label>
                  <label class="check"><input type="checkbox" data-minor><span><strong>Change base plate orientation(s)</strong><small>Changing one or multiple base plates counts as one modification.</small></span></label>
                  <label class="check"><input type="checkbox" data-minor><span><strong>Remove one front post</strong><small>Eligible standard wall-mounted pergola only; engineering approval required.</small></span></label>
                  <label class="check"><input type="checkbox" data-minor><span><strong>Reverse louvre opening direction</strong><small>Standard wall-mounted pergola: anti-clockwise to clockwise.</small></span></label>
                  <label class="check"><input type="checkbox" data-minor><span><strong>Mount the short side to the wall</strong><small>Instead of the standard long side; engineering approval required.</small></span></label>
                </div>
              </div>
              <aside class="total"><div class="total-label">Minor modification total</div><div class="count">0 types × $500</div><div class="amount">$0</div><button type="button" class="reset">Clear selections</button></aside>
            </section>

            <div class="content-grid">
              <section class="card"><h3>What makes it custom?</h3><ul>
                <li><strong>Non-standard sizing</strong></li><li>Cantilevered roof designs</li><li>Converting a standard wall-mounted pergola with two back posts into a mitred-edge design</li><li>Supplying a roof-only structure</li><li><strong>Partial wall-mounted:</strong> only part of one side is wall-mounted and additional post support is required</li><li><strong>Two-sided wall-mounted:</strong> attached to two adjoining walls with the remainder supported by posts</li><li>Any other modification requiring a bespoke engineered design</li>
              </ul></section>
              <section class="card"><h3>Changes included in a custom design</h3><ul>
                <li>Adjust post heights up to <strong>3.0 m</strong></li><li>Select which leg the electrical supply exits from</li><li>Change the louvre opening direction</li><li>Change base plate orientations</li><li>Move, remove or add posts</li>
              </ul><div class="included">These changes do not attract separate Minor Modification Fees when the job is already quoted as a Custom Pergola.</div></section>
            </div>

            <section class="examples"><h3>Minor Modification examples</h3><table><thead><tr><th>Customer request</th><th>Charge</th></tr></thead><tbody>
              <tr><td>Move the middle post(s) only</td><td>1 × $500 = $500</td></tr><tr><td>Change the base plate orientation only</td><td>1 × $500 = $500</td></tr><tr><td>Move middle post(s) + change base plate orientation</td><td>2 × $500 = $1,000</td></tr><tr><td>Move middle post(s) + base plate orientation + reverse wall-mounted louvre direction</td><td>3 × $500 = $1,500</td></tr>
            </tbody></table></section>

            <div class="warning"><strong>Minor modifications cannot be combined to create a custom configuration.</strong>A partial or two-sided wall-mounted pergola remains Custom even if it could be described as adding or removing posts from a standard model. The finished configuration determines the classification.</div>
            <div class="rule"><strong>Rule of thumb</strong>Start with the finished pergola configuration—not the standard model it could theoretically be modified from. If it remains standard with only the approved changes above, charge $500 for each different modification type. If it changes size, creates a non-standard structure or needs bespoke engineering, quote it as a Custom Pergola.</div>
          </main>
        </section>
      </div>`;

    const backdrop = shadow.querySelector('.backdrop');
    const close = () => backdrop.classList.remove('open');
    const updateTotal = () => {
      const count = shadow.querySelectorAll('[data-minor]:checked').length;
      shadow.querySelector('.count').textContent = `${count} ${count === 1 ? 'type' : 'types'} × $500`;
      shadow.querySelector('.amount').textContent = `$${(count * 500).toLocaleString('en-NZ')}`;
    };
    shadow.querySelectorAll('[data-minor]').forEach(input => input.addEventListener('change', updateTotal));
    shadow.querySelector('.reset').addEventListener('click', () => {
      shadow.querySelectorAll('[data-minor]').forEach(input => { input.checked = false; });
      updateTotal();
    });
    shadow.querySelector('.close').addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    shadow.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    return root;
  }

  function openGuide() {
    const root = createGuide();
    root.shadowRoot.querySelector('.backdrop').classList.add('open');
    window.setTimeout(() => root.shadowRoot.querySelector('.close')?.focus(), 40);
  }

  function findAnchor() {
    return document.getElementById('lc-omni-install-fee-button') ||
      document.getElementById('lc-omni-custom-comments-button') ||
      pageElements('button, input, a, [role="button"]').find(element => /^add\s+a\s+new\s+line$/i.test(clean(element.value || element.textContent))) ||
      null;
  }

  function placeButton() {
    const anchor = findAnchor();
    let button = document.getElementById(BUTTON_ID);
    if (!anchor || !visible(anchor)) {
      if (button) button.style.display = 'none';
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Pergola Guide';
      button.title = 'Minor Modification and Custom Pergola guide';
      button.addEventListener('click', openGuide);
      document.body.appendChild(button);
    }
    if (button.parentElement !== document.body) document.body.appendChild(button);
    const rect = anchor.getBoundingClientRect();
    const fixed = getComputedStyle(anchor).position === 'fixed';
    button.style.cssText = `position:${fixed ? 'fixed' : 'absolute'};display:inline-flex;align-items:center;justify-content:center;left:${(fixed ? 0 : window.scrollX) + rect.right + 8}px;top:${(fixed ? 0 : window.scrollY) + rect.top}px;z-index:2147483598;box-sizing:border-box;height:${Math.max(34, rect.height)}px;padding:0 14px;color:#fff;background:#13377e;border:1px solid #13377e;border-radius:4px;font:700 13px Arial,sans-serif;line-height:1;cursor:pointer;white-space:nowrap;`;
  }

  let scheduled = false;
  function schedulePlace() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; placeButton(); });
  }

  placeButton();
  new MutationObserver(records => {
    if (records.every(record => record.target.closest?.(`#${ROOT_ID}`))) return;
    schedulePlace();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedulePlace);
  window.setInterval(() => {
    const button = document.getElementById(BUTTON_ID);
    if (!button || button.style.display === 'none') schedulePlace();
  }, 2500);
})();
