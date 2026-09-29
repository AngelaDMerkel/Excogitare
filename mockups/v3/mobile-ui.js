/* Share map downloads and preserve the two-action mobile boundary. */
(() => {
  const media=matchMedia('(max-width:600px), (max-width:1000px) and (pointer:coarse)');
  const randomise=document.getElementById('mobile-randomise');
  randomise.onclick=()=>window.V3Mobile.randomise();
  for(const save of [document.getElementById('mobile-save'),document.getElementById('desktop-save')].filter(Boolean)){
  save.onclick=event=>{if(document.body.getAttribute('aria-busy')==='true'){event.preventDefault();return;}try{const file=window.V3Mobile.downloadRecord(),url=URL.createObjectURL(new Blob([file.bytes],{type:'application/octet-stream'}));save.href=url;save.download=file.name;setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){event.preventDefault();window.toast(error.message);}};
  save.onkeydown=event=>{if(event.key===' '){event.preventDefault();save.click();}};
  }
  function refresh(){
    document.body.classList.toggle('mobile-simple',media.matches);
    if(media.matches){for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();document.getElementById('layers-menu').hidden=true;document.getElementById('layers-button').setAttribute('aria-expanded','false');}
    requestAnimationFrame(()=>window.V3Mobile.refresh());
  }
  media.addEventListener('change',refresh);refresh();
})();
