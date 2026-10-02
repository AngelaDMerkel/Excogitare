/* Isolated bookmark studies. Never open or update the persistent snapshot store. */
(() => {
  const variant=document.body.dataset.bookmarkStudy,list=$('world-list'),bookmarks=new Set();
  const paths={bookmark:'<path class="bookmark-shape" d="M6 3h12v18l-6-4-6 4Z"/>',pin:'<path class="pin-head" d="M8 3h8l-1 7 3 4v2H6v-2l3-4Z"/><path d="M12 16v6"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>'};
  const svg=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>`;
  const original=current;
  history=[...samples.slice(1),...samples.slice(1)].map(sample=>{const world=sampleWorld(sample);world.change='Study snapshot';return world;});
  history.push(original);
  const shown=[...history].reverse();for(const index of [1,4])if(shown[index])bookmarks.add(shown[index].uid);
  const note=document.createElement('small');note.className='bookmark-study-note';note.textContent='Mockup · bookmarks reset on reload';document.querySelector('.workspace').append(note);
  const menu=document.createElement('div');menu.className='snapshot-menu';menu.id='snapshot-actions';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Snapshot actions');document.body.append(menu);
  let openAction=null;
  function closeMenu(focus=false){const button=openAction;menu.hidden=true;openAction=null;button?.setAttribute('aria-expanded','false');if(focus)button?.focus({preventScroll:true});}
  function syncRow(row,button,world){
    const marked=bookmarks.has(world.uid);row.classList.toggle('is-bookmarked',marked);
    if(variant==='actions'){
      button.title=`Actions for ${world.title}`;button.setAttribute('aria-label',button.title);
      row.querySelector('.snapshot-bookmark-mark')?.remove();
      if(marked){const mark=document.createElement('span');mark.className='snapshot-bookmark-mark';mark.innerHTML=svg('bookmark');mark.setAttribute('aria-hidden','true');row.append(mark);}
      row.querySelector('.world-card').setAttribute('aria-description',marked?'Bookmarked':'');
    }else{
      const verb=variant==='pin'?(marked?'Unpin':'Pin'):(marked?'Remove bookmark from':'Bookmark');
      button.setAttribute('aria-pressed',String(marked));button.title=`${verb} ${world.title}`;button.setAttribute('aria-label',button.title);
    }
  }
  function toggle(row,button,world){if(bookmarks.has(world.uid))bookmarks.delete(world.uid);else bookmarks.add(world.uid);syncRow(row,button,world);toast(bookmarks.has(world.uid)?'Bookmarked for this mockup.':'Bookmark removed.');}
  function saveSnapshot(world){
    try{const bytes=window.V3ExistingRules.save(world.map,world.originalBytes),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=(world.map.name||world.title||'Excogitare map').replace(/[\\/:*?"<>|]/g,'-')+'.Civ5Map';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    catch(error){toast(error.message||'This snapshot could not be saved.');}
  }
  function openMenu(row,button,world){
    if(openAction===button){closeMenu(true);return;}closeMenu();openAction=button;button.setAttribute('aria-expanded','true');menu.replaceChildren();
    const bookmark=document.createElement('button');bookmark.type='button';bookmark.setAttribute('role','menuitemcheckbox');bookmark.setAttribute('aria-checked',String(bookmarks.has(world.uid)));bookmark.innerHTML=svg('bookmark')+'<span>Bookmark</span>';bookmark.onclick=()=>{toggle(row,button,world);closeMenu(true);};
    const save=document.createElement('button');save.type='button';save.setAttribute('role','menuitem');save.innerHTML=svg('download')+'<span>Save .Civ5Map</span>';save.onclick=()=>{closeMenu(true);saveSnapshot(world);};menu.append(bookmark,save);menu.hidden=false;
    const rect=button.getBoundingClientRect();menu.style.left=`${Math.max(8,rect.left-menu.offsetWidth-8)}px`;menu.style.top=`${Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,rect.bottom-menu.offsetHeight))}px`;bookmark.focus({preventScroll:true});
  }
  const baseRender=renderShelf;
  renderShelf=function(){
    closeMenu();baseRender();const worlds=history.filter(world=>!showKept||world.kept).reverse();
    for(const [index,card] of [...list.children].entries()){
      const world=worlds[index];if(!world)continue;
      const row=document.createElement('div');row.className='snapshot-row';row.dataset.snapshotId=String(world.uid);card.replaceWith(row);row.append(card);
      const button=document.createElement('button');button.type='button';button.className='snapshot-action';button.innerHTML=svg(variant==='pin'?'pin':variant==='actions'?'more':'bookmark');
      if(variant==='actions'){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',menu.id);}
      button.onclick=event=>{event.stopPropagation();if(variant==='actions')openMenu(row,button,world);else toggle(row,button,world);};row.append(button);syncRow(row,button,world);
    }
  };
  menu.addEventListener('keydown',event=>{const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;items[next].focus();}if(event.key==='Tab')closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();closeMenu(true);}});
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!openAction?.contains(event.target))closeMenu();});
  list.addEventListener('scroll',()=>closeMenu(),{passive:true});window.addEventListener('resize',()=>closeMenu());
  renderShelf();scheduleFitRefresh();
})();
