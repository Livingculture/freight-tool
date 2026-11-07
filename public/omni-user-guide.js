(() => {
  'use strict';
  const input = document.getElementById('guide-search');
  const index = document.getElementById('guide-index');
  const toggle = document.getElementById('contents-toggle');
  const status = document.getElementById('search-status');
  const clear = document.getElementById('clear-search');
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const links = [...index.querySelectorAll('a')];
  const topics = [...document.querySelectorAll('.topic')].map((node,i) => ({ node, link:links[i], text:normalize(node.textContent), id:links[i].hash.slice(1) }));
  const viewer = document.getElementById('screenshot-viewer');
  const large = document.getElementById('enlarged-image');
  const size = document.getElementById('image-size');
  let timer, previousFocus;
  const closeContents = () => { index.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); };
  const markCurrent = id => links.forEach(link => {
    if (link.hash.slice(1) === id) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  });
  function removeMarks() {
    document.querySelectorAll('.source-body mark').forEach(mark => { const parent=mark.parentNode;mark.replaceWith(document.createTextNode(mark.textContent));parent.normalize(); });
  }
  function highlight(root, tokens) {
    const escaped = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const pattern = new RegExp(escaped.sort((a,b)=>b.length-a.length).join('|'),'giu');
    const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) if(walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
    for(const node of nodes){
      const text=node.textContent;pattern.lastIndex=0;
      const matches=[...text.matchAll(pattern)];if(!matches.length)continue;
      const fragment=document.createDocumentFragment();let offset=0;
      for(const match of matches){fragment.append(text.slice(offset,match.index));const mark=document.createElement('mark');mark.textContent=match[0];fragment.append(mark);offset=match.index+match[0].length;}
      fragment.append(text.slice(offset));node.replaceWith(fragment);
    }
  }
  function search() {
    clearTimeout(timer);removeMarks();
    const query=normalize(input.value),tokens=[...new Set(query.split(' ').filter(Boolean))];
    let count=0;
    for(const topic of topics){
      const match=tokens.every(token=>topic.text.includes(token));
      topic.node.hidden=!match;topic.link.parentElement.hidden=!match;
      if(match){count++;if(tokens.length)highlight(topic.node.querySelector('.source-body'),tokens);}
    }
    clear.hidden=!query;status.textContent=`${count} ${count===1?'topic':'topics'}${query?' found':''}`;
    document.getElementById('no-results').hidden=count!==0;
  }
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,130);});
  input.addEventListener('search',search);
  clear.addEventListener('click',()=>{input.value='';search();input.focus();});
  toggle.addEventListener('click',()=>{const open=!index.classList.contains('open');index.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));if(open)document.getElementById('contents-close').focus();});
  document.getElementById('contents-close').addEventListener('click',()=>{closeContents();toggle.focus();});
  document.addEventListener('pointerdown',event=>{if(index.classList.contains('open')&&!index.contains(event.target)&&!toggle.contains(event.target))closeContents();});
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');if(!link)return;
    const id=decodeURIComponent(link.hash.slice(1));const target=document.getElementById(id);if(!target)return;
    const topic=target.closest('.topic');if(topic?.hidden){input.value='';search();}
    if(link.closest('#guide-index')){closeContents();markCurrent(id);}
    if(target.matches('h2,h3,h4,h5,h6')){target.tabIndex=-1;target.focus({preventScroll:true});}
  });
  function followHash(){const id=decodeURIComponent(location.hash.slice(1));const target=document.getElementById(id);if(!target)return;if(target.closest('.topic')?.hidden){input.value='';search();}markCurrent(id);requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}
  window.addEventListener('hashchange',followHash);if(location.hash)followHash();
  const observer=new IntersectionObserver(entries=>{const first=entries.filter(item=>item.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(first){const topic=topics.find(item=>item.node===first.target);if(topic)markCurrent(topic.id);}},{rootMargin:'-165px 0px -60% 0px'});
  topics.forEach(topic=>observer.observe(topic.node));
  document.querySelectorAll('.screenshot').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();previousFocus=link;const image=link.querySelector('img');large.src=image.src;large.alt=image.alt;
    document.getElementById('screenshot-title').textContent=image.alt;viewer.querySelector('.image-stage').classList.remove('actual');size.textContent='Actual size';size.setAttribute('aria-pressed','false');
    viewer.showModal();document.body.classList.add('image-open');document.getElementById('image-close').focus();
  }));
  size.addEventListener('click',()=>{const actual=viewer.querySelector('.image-stage').classList.toggle('actual');size.textContent=actual?'Fit':'Actual size';size.setAttribute('aria-pressed',String(actual));});
  document.getElementById('image-close').addEventListener('click',()=>viewer.close());
  viewer.addEventListener('click',event=>{const rect=viewer.getBoundingClientRect();if(event.target===viewer&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))viewer.close();});
  viewer.addEventListener('close',()=>{document.body.classList.remove('image-open');large.removeAttribute('src');previousFocus?.focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&index.classList.contains('open')){event.preventDefault();event.stopPropagation();closeContents();toggle.focus();}else if(event.key==='Escape'&&viewer.open){event.stopPropagation();}});
  document.getElementById('print-guide').addEventListener('click',async event=>{
    const button=event.currentTarget;
    button.disabled=true;button.textContent='Preparing...';
    try{
      await Promise.all([...document.querySelectorAll('.source-body img')].map(image=>{image.loading='eager';return image.decode();}));
      window.print();
    }catch{status.textContent='An image could not load. Refresh before printing.';}
    finally{button.disabled=false;button.textContent='Print';}
  });
})();
