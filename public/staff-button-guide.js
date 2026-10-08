(function () {
  'use strict';
  const input = document.getElementById('guide-search');
  const clear = document.getElementById('guide-search-clear');
  const status = document.getElementById('guide-search-status');
  const contents = document.getElementById('contents');
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const sections = Array.from(document.querySelectorAll('.sheet')).filter(section => section.querySelector('.rows'));
  const index = sections.map(section => ({
    section,
    note: section.querySelector('.page-note'),
    entries: Array.from(section.querySelectorAll('.entry')).map(entry => ({
      entry,
      text: normalize(`${section.querySelector('.section-title')?.textContent || ''} ${section.querySelector('.subtitle')?.textContent || ''} ${entry.textContent}`),
    })),
  }));

  function filter() {
    const query = input.value.trim();
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    let count = 0;
    index.forEach(({ section, note, entries }) => {
      let matches = 0;
      entries.forEach(({ entry, text }) => {
        const matched = terms.every(term => text.includes(term));
        entry.hidden = !matched;
        if (matched) { matches += 1; count += 1; }
      });
      section.hidden = matches === 0;
      if (note) note.hidden = terms.length > 0;
    });
    contents.hidden = terms.length > 0;
    clear.hidden = terms.length === 0;
    status.hidden = terms.length === 0;
    status.textContent = count ? `${count} matching ${count === 1 ? 'button' : 'buttons'}` : `No matches for "${query}".`;
    window.scrollTo(0, 0);
  }

  input.addEventListener('input', filter);
  clear.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  document.getElementById('guide-contents-link').addEventListener('click', () => { input.value = ''; filter(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && window.parent !== window) {
      event.preventDefault();
      window.parent.postMessage({ type: 'lc-staff-help-close' }, 'https://go.cin7.com');
    }
  });
})();
