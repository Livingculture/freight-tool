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
  let topic = null;
  index.forEach(({ section, entries }) => {
    if (!section.id) section.id = 'guide-automatic-features';
    entries.forEach(({ entry }) => {
      const title = entry.querySelector('.button-name');
      const paragraphs = entry.querySelectorAll('.description > p');
      const details = document.createElement('details');
      details.className = 'help-item';
      const summary = document.createElement('summary');
      const name = document.createElement('span');
      name.className = 'help-item-title'; name.textContent = title.textContent;
      const brief = document.createElement('span');
      brief.className = 'help-summary'; brief.textContent = paragraphs[0].textContent.split(/(?<=[.!?])\s/)[0];
      summary.append(name, brief);
      const body = document.createElement('div'); body.className = 'help-steps';
      if (paragraphs[1]) {
        const heading = document.createElement('h3'); heading.textContent = 'Steps';
        const steps = document.createElement('ol');
        paragraphs[1].textContent.replace(/^How to use:\s*/, '').split(/(?<=[.!?])\s+(?=[A-Z])/).forEach(text => {
          const step = document.createElement('li'); step.textContent = text; steps.appendChild(step);
        });
        body.append(heading, steps);
      } else body.appendChild(paragraphs[0].cloneNode(true));
      if (paragraphs[2]) {
        const note = document.createElement('p'); note.className = 'help-note';
        const label = document.createElement('strong'); label.textContent = 'Note: ';
        note.append(label, document.createTextNode(paragraphs[2].textContent)); body.appendChild(note);
      }
      details.append(summary, body); entry.appendChild(details); entry.classList.add('enhanced');
    });
  });
  const automatic = document.createElement('a');
  automatic.href = '#guide-automatic-features'; automatic.className = 'help-online-link';
  automatic.textContent = 'Automatic features & common questions';
  contents.querySelector('.contents').appendChild(automatic);

  function filter() {
    const query = input.value.trim();
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    let count = 0;
    index.forEach(({ section, note, entries }) => {
      let matches = 0;
      entries.forEach(({ entry, text }) => {
        const matched = terms.every(term => text.includes(term));
        entry.hidden = terms.length ? !matched : section !== topic;
        const details = entry.querySelector('details');
        if (terms.length) details.open = matched && !terms.every(term => normalize(details.querySelector('summary').textContent).includes(term));
        else details.open = false;
        if (matched) { matches += 1; count += 1; }
      });
      section.hidden = terms.length ? matches === 0 : section !== topic;
      if (note) note.hidden = terms.length > 0;
    });
    contents.hidden = terms.length > 0 || topic !== null;
    clear.hidden = terms.length === 0;
    status.hidden = terms.length === 0;
    status.textContent = count ? `${count} matching ${count === 1 ? 'button' : 'buttons'}` : `No matches for "${query}".`;
    window.scrollTo(0, 0);
  }

  input.addEventListener('input', filter);
  clear.addEventListener('click', () => { input.value = ''; filter(); input.focus(); });
  document.getElementById('guide-contents-link').addEventListener('click', event => { event.preventDefault(); topic = null; input.value = ''; filter(); });
  contents.querySelectorAll('.contents a').forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); topic = document.querySelector(link.getAttribute('href')); input.value = ''; filter();
    topic?.querySelector('summary')?.focus();
  }));
  filter();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && window.parent !== window) {
      event.preventDefault();
      window.parent.postMessage({ type: 'lc-staff-help-close' }, 'https://go.cin7.com');
    }
  });
})();
