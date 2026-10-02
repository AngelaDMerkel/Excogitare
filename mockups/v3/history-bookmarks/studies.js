/* Isolated bookmark studies. Never open or update the persistent snapshot store. */
(() => {
  const variant=document.body.dataset.bookmarkStudy,list=$('world-list'),bookmarks=new Set();
  const paths={bookmark:'<path class="bookmark-shape" d="M6 3h12v18l-6-4-6 4Z"/>',pin:'<path class="pin-head" d="M8 3h8l-1 7 3 4v2H6v-2l3-4Z"/><path d="M12 16v6"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>'};
  const svg=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>`;
  const original=current;
  history=[...samples.slice(1),...samples.slice(1)].map(sample=>{const world=sampleWorld(sample);world.change='Study snapshot';return world;});
  history.push(original);
  const shown=[...history].reverse();for(const index of [1,4])if(shown[index])bookmarks.add(shown[index].uid);
  const note=document.createElement('small');note.className='bookmark-study-note';note.textContent='Mockup · bookmarks reset on reload';document.querySelector('.workspace').append(note);
  function syncRow(row,button,world){
    const marked=bookmarks.has(world.uid);row.classList.toggle('is-bookmarked',marked);
    const verb=variant==='pin'?(marked?'Unpin':'Pin'):(marked?'Remove bookmark from':'Bookmark');
    button.setAttribute('aria-pressed',String(marked));button.title=`${verb} ${world.title}`;button.setAttribute('aria-label',button.title);
    row.querySelector('.world-card').setAttribute('aria-description',marked?'Bookmarked':'');
  }
  function toggle(row,button,world){if(bookmarks.has(world.uid))bookmarks.delete(world.uid);else bookmarks.add(world.uid);syncRow(row,button,world);toast(bookmarks.has(world.uid)?'Bookmarked for this mockup.':'Bookmark removed.');}
  function saveSnapshot(world){
    try{const bytes=window.V3ExistingRules.save(world.map,world.originalBytes),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=(world.map.name||world.title||'Excogitare map').replace(/[\\/:*?"<>|]/g,'-')+'.Civ5Map';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    catch(error){toast(error.message||'This snapshot could not be saved.');}
  }
  const baseRender=renderShelf;
  renderShelf=function(){
    baseRender();const worlds=history.filter(world=>!showKept||world.kept).reverse();
    for(const [index,card] of [...list.children].entries()){
      const world=worlds[index];if(!world)continue;
      const row=document.createElement('div');row.className='snapshot-row';row.dataset.snapshotId=String(world.uid);card.replaceWith(row);row.append(card);
      const button=document.createElement('button');button.type='button';button.className='snapshot-action snapshot-bookmark';button.innerHTML=svg(variant==='pin'?'pin':'bookmark');
      button.onclick=event=>{event.stopPropagation();toggle(row,button,world);};row.append(button);syncRow(row,button,world);
      if(variant==='actions'){
        const download=document.createElement('button');download.type='button';download.className='snapshot-action snapshot-download';download.innerHTML=svg('download');download.title=`Download ${world.title} (.Civ5Map)`;download.setAttribute('aria-label',download.title);
        download.onclick=event=>{event.stopPropagation();saveSnapshot(world);};row.append(download);
      }
    }
  };
  renderShelf();scheduleFitRefresh();
})();
