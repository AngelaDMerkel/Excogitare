/* Prepared history for layout comparison; these remain existing-engine samples. */
(() => {
  for(const sample of [...samples.slice(1),...samples]){
    const world=sampleWorld(sample);world.change='Layout sample';history.push(world);
  }
  renderShelf();
  const list=document.getElementById('world-list');
  if(document.body.dataset.historyLayout==='bottom')list.addEventListener('wheel',event=>{
    if(list.scrollWidth<=list.clientWidth)return;
    const unit=event.deltaMode===1?16:event.deltaMode===2?list.clientWidth:1;
    const delta=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*unit;
    list.scrollLeft+=delta;event.preventDefault();event.stopPropagation();
  },{passive:false});
})();
