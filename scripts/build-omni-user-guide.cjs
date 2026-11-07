const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Zip = require('adm-zip');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const sourceUrl = 'https://docs.google.com/document/d/1R51CXdMjwtX_48Nbsx7NgprED0eoFz-hEklN9uAN6wU/edit';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

async function main() {
  const sourceArg = process.argv.indexOf('--source');
  let bytes;
  if (sourceArg >= 0) bytes = fs.readFileSync(process.argv[sourceArg + 1]);
  else {
    const response = await fetch(sourceUrl.replace('/edit', '/export?format=zip'));
    if (!response.ok) throw new Error(`Google export returned HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const zip = new Zip(bytes);
  const htmlEntries = zip.getEntries().filter(entry => !entry.isDirectory && entry.entryName.endsWith('.html'));
  if (htmlEntries.length !== 1) throw new Error('Expected one exported document.');
  const browser = await chromium.launch();
  let converted;
  try {
    const page = await browser.newPage();
    converted = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const original = doc.body.cloneNode(true);
      const compact = value => value.replace(/\s+/g, ' ').trim();
      const text = node => {
        const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const parts = [];
        while (walker.nextNode()) if (compact(walker.currentNode.textContent)) parts.push(compact(walker.currentNode.textContent));
        return parts.join(' ');
      };
      const originalText = text(original);
      const imageOrder = [...doc.querySelectorAll('img')].map(img => img.getAttribute('src'));
      if (doc.querySelector('script,iframe,object,form,input')) throw new Error('Unexpected active content in document.');
      // Retain source emphasis, colours and highlights, not print-page geometry.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(doc.head.querySelector('style')?.textContent || '');
      const properties = ['font-weight','font-style','text-decoration','text-decoration-line','color','background-color'];
      const sourceCss = [...sheet.cssRules].filter(rule => rule.type === CSSRule.STYLE_RULE && /^\.c\d+$/.test(rule.selectorText)).map(rule => {
        const declarations = properties.map(property => rule.style.getPropertyValue(property) ? `${property}:${rule.style.getPropertyValue(property)}` : '').filter(Boolean);
        return declarations.length ? `.source-body ${rule.selectorText}{${declarations.join(';')}}` : '';
      }).filter(Boolean).join('\n');
      const headings = [...doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(node => compact(node.textContent));
      if (headings.length < 10 || !imageOrder.length) throw new Error('The export is incomplete.');
      headings.forEach((node,index) => {
        node.dataset.guideHeading = String(index);
        if (!node.id) node.id = `manual-heading-${index + 1}`;
      });
      // Ranges can split a Google Docs list across topics. Explicit values retain
      // its original numbering even when an individual topic is opened alone.
      doc.body.querySelectorAll('ol').forEach(list => {
        let next = Number(list.getAttribute('start') || 1);
        [...list.children].filter(node => node.tagName === 'LI').forEach(item => {
          next = Number(item.getAttribute('value') || next);
          item.setAttribute('value', String(next++));
        });
      });
      const sections = [];
      let imageNumber = 0;
      for (let index = 0; index < headings.length; index++) {
        const heading = headings[index], range = doc.createRange();
        if (!index) range.setStart(doc.body, 0);
        else range.setStartBefore(heading);
        if (headings[index + 1]) range.setEndBefore(headings[index + 1]);
        else range.setEnd(doc.body, doc.body.childNodes.length);
        const fragment = range.cloneContents();
        const wrapper = doc.createElement('div');
        wrapper.append(fragment);
        const title = compact(heading.textContent), level = Number(heading.tagName.slice(1));
        const allowedTags = new Set(['H1','H2','H3','H4','H5','H6','SPAN','P','OL','UL','LI','IMG','BR','TABLE','TBODY','THEAD','TR','TD','TH','A','B','STRONG','I','EM','U','DIV']);
        for (const node of [...wrapper.querySelectorAll('*')]) {
          if (!allowedTags.has(node.tagName)) throw new Error(`Unsupported source element: ${node.tagName}`);
          const attrs = Object.fromEntries([...node.attributes].map(attr => [attr.name,attr.value]));
          for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
          if (/^h\.[a-z0-9]+$/i.test(attrs.id || '') || /^manual-heading-\d+$/.test(attrs.id || '')) node.id = attrs.id;
          const classes = (attrs.class || '').split(/\s+/).filter(name => /^c\d+$/.test(name));
          if (classes.length) node.className = classes.join(' ');
          for (const attr of ['start','value','colspan','rowspan']) if (/^\d+$/.test(attrs[attr] || '')) node.setAttribute(attr,attrs[attr]);
          if (node.tagName === 'A') {
            let href = attrs.href || '';
            if (href.startsWith('https://www.google.com/url?')) href = new URL(href).searchParams.get('q') || '';
            if (/^https:\/\//.test(href)) { node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
            else if (/^#h\.[a-z0-9]+$/i.test(href)) node.href = href;
          }
          if (node.tagName === 'IMG') {
            const src = attrs.src || '';
            if (!/^images\/image\d+\.(png|jpe?g)$/i.test(src)) throw new Error('Unexpected exported image path.');
            const imageStyle = doc.createElement('span'); imageStyle.setAttribute('style',attrs.style || '');
            const width = parseFloat(imageStyle.style.width), height = parseFloat(imageStyle.style.height);
            node.src = `omni-user-guide/${src}`;
            imageNumber += 1;
            node.alt = attrs.alt || `Screenshot ${imageNumber}: ${title}`;
            node.loading = imageNumber <= 2 ? 'eager' : 'lazy'; node.decoding = 'async';
            if (width > 0 && height > 0) { node.width = Math.round(width); node.height = Math.round(height); node.style.width = `${width}px`; }
            const link = doc.createElement('a'); link.className = 'screenshot'; link.href = node.getAttribute('src');
            link.target = '_blank'; link.rel = 'noopener'; link.title = 'View screenshot'; link.setAttribute('aria-label',`View ${node.alt}`);
            node.replaceWith(link); link.append(node);
          }
        }
        wrapper.querySelectorAll('p,h1,h2,h3,h4,h5,h6').forEach(node => {
          if (!compact(node.textContent) && !node.querySelector('img')) node.remove();
          else if (/^H[1-6]$/.test(node.tagName)) {
            const replacement = doc.createElement(compact(node.textContent) ? `h${Math.min(6, Number(node.tagName.slice(1)) + 1)}` : 'p');
            for (const attr of node.attributes) replacement.setAttribute(attr.name,attr.value);
            replacement.append(...node.childNodes); node.replaceWith(replacement);
          }
        });
        sections.push({ id: heading.id, title, level, html: wrapper.innerHTML, text: text(wrapper) });
      }
      const outputText = sections.map(section => section.text).filter(Boolean).join(' ');
      if (originalText !== outputText) throw new Error('Source text changed during conversion.');
      const outputImages = sections.flatMap(section => {
        const d = new DOMParser().parseFromString(section.html,'text/html');
        return [...d.querySelectorAll('img')].map(img => img.getAttribute('src').replace('omni-user-guide/',''));
      });
      if (JSON.stringify(imageOrder) !== JSON.stringify(outputImages)) throw new Error('Image sequence changed during conversion.');
      return { sections, sourceCss, originalText, imageOrder };
    }, htmlEntries[0].getData().toString('utf8'));
  } finally { await browser.close(); }

  const output = path.join(root,'public');
  const assetDir = path.join(output,'omni-user-guide');
  fs.mkdirSync(path.join(assetDir,'images'),{recursive:true});
  const images = [...new Set(converted.imageOrder)].map(name => {
    const entry = zip.getEntry(name);
    if (!entry) throw new Error(`Missing screenshot ${name}`);
    const data = entry.getData();
    fs.writeFileSync(path.join(assetDir,name),data);
    return { path:name, bytes:data.length, sha256:hash(data) };
  });
  const toc = converted.sections.map((section,index) => `<li data-level="${section.level}"><a href="#${escape(section.id)}"><span>${escape(section.title)}</span></a></li>`).join('\n');
  const topics = converted.sections.map((section,index) => `<section class="topic" data-topic="${index}" data-title="${escape(section.title)}" aria-labelledby="${escape(section.id)}"><div class="source-body">${section.html}</div></section>`).join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Omni Manual | Living Culture</title><link rel="stylesheet" href="omni-user-guide.css"><link rel="stylesheet" href="omni-user-guide/source-emphasis.css"><script src="omni-user-guide.js" defer></script></head>
<body><a class="skip" href="#manual-content">Skip to guide</a>
<header class="guide-header"><div class="heading"><div><span class="brand">Living Culture</span><h1>Omni Manual</h1></div><nav aria-label="Guide actions"><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Source document</a><button id="print-guide" type="button">Print</button></nav></div><div class="search-row"><button id="contents-toggle" type="button" aria-controls="guide-index" aria-expanded="false">Contents</button><label for="guide-search">Search manual</label><input id="guide-search" type="search" placeholder="Search manual" autocomplete="off" spellcheck="false"><button id="clear-search" type="button" hidden>Clear</button><span id="search-status" role="status" aria-live="polite">${converted.sections.length} topics</span></div></header>
<div class="guide-layout"><aside id="guide-index" aria-label="Contents"><div class="index-head"><h2>Contents</h2><button id="contents-close" type="button">Close</button></div><nav aria-label="Manual topics"><ol>${toc}</ol></nav></aside><main id="manual-content" tabindex="-1">${topics}<p id="no-results" hidden>No matching topics.</p><footer><a href="#manual-content" id="back-to-top">Back to top</a><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Original Google document</a></footer></main></div>
<dialog id="screenshot-viewer" aria-label="Screenshot"><header><h2 id="screenshot-title">Screenshot</h2><div><button id="image-size" type="button" aria-pressed="false">Actual size</button><button id="image-close" type="button">Close</button></div></header><div class="image-stage"><img id="enlarged-image" alt=""></div></dialog>
</body></html>`;
  fs.writeFileSync(path.join(output,'omni-user-guide.html'),html);
  fs.writeFileSync(path.join(assetDir,'source-emphasis.css'),converted.sourceCss+'\n');
  fs.writeFileSync(path.join(assetDir,'source-manifest.json'),JSON.stringify({ sourceUrl, sourceZipSha256:hash(bytes), textSha256:hash(converted.originalText), headings:converted.sections.map(({id,title,level})=>({id,title,level})), imageOrder:converted.imageOrder, images },null,2)+'\n');
  console.log(`Built ${converted.sections.length} indexed topics; ${converted.imageOrder.length} unchanged screenshot placements (${images.length} original files). Exact source text and image sequence verified.`);
}
main().catch(error => { console.error(error); process.exitCode=1; });
