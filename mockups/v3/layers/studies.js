/* Preview-only controls. The original inputs retain the app's drawing handlers. */
(() => {
  const trigger=document.getElementById('layers-button'),menu=document.getElementById('layers-menu');
  const design=document.body.dataset.layerDesign;
  const paths={relief:'m2 20 7-14 5 9 3-6 5 11ZM6 12l3 2 3-2',vegetation:'M20 3C9 1 1 7 6 16c9 5 15-2 14-13ZM4 21 15 9',resources:'m12 3 8 5v8l-8 5-8-5V8Zm-8 5 8 5 8-5m-8 5v8',grid:'M12 1 17 4v6l-5 3-5-3V4ZM6 10l5 3v6l-5 3-5-3v-6ZM18 10l5 3v6l-5 3-5-3v-6Z',starts:'M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13ZM9 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0',close:'m6 6 12 12M6 18 18 6',chevron:'m6 9 6 6 6-6'};
  const svg=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key]}"/></svg>`;
  const labels={relief:'Relief',vegetation:'Vegetation',resources:'Resources',grid:'Hex grid',starts:'Planned starts'};
  const inputs=[...menu.querySelectorAll('input[data-layer]')];
  const header=document.createElement('header'),title=document.createElement('h3'),closeButton=document.createElement('button');
  title.textContent='Map layers';title.id='layers-heading';
  closeButton.type='button';closeButton.className='layer-close';closeButton.setAttribute('aria-label','Close Layers');closeButton.innerHTML=svg('close');
  header.append(title,closeButton);
  const list=document.createElement('div');list.className='layer-list';
  for(const input of inputs){
    const key=input.dataset.layer,label=document.createElement('label'),mark=document.createElement('span'),text=document.createElement('span');
    label.className='layer-choice';label.dataset.kind=key;
    mark.className='layer-symbol';mark.innerHTML=svg(key);text.textContent=labels[key];
    input.id=`study-layer-${key}`;input.setAttribute('aria-label',labels[key]);
    if(design==='switches')input.setAttribute('role','switch');
    const sync=()=>{label.classList.toggle('is-on',input.checked);if(design==='switches')input.setAttribute('aria-checked',String(input.checked));};
    input.addEventListener('change',sync);sync();label.append(mark,text,input);list.append(label);
  }
  menu.replaceChildren(header,list);menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','false');menu.setAttribute('aria-labelledby',title.id);
  // This class was excluded from layout obstacles before app.js initialized.
  // A document-level overlay can cover the canvas without resizing any controls.
  document.body.append(menu);
  trigger.setAttribute('aria-haspopup','dialog');
  const chevron=document.createElement('span');chevron.innerHTML=svg('chevron');chevron.firstElementChild.classList.add('layers-chevron');trigger.append(chevron);
  function position(){
    if(menu.hidden)return;
    if(document.body.classList.contains('mobile-simple')){close();return;}
    menu.style.maxHeight='';
    const anchor=trigger.getBoundingClientRect(),panel=document.querySelector('.panel').getBoundingClientRect(),width=menu.offsetWidth;
    let left=anchor.left-width-12,top=anchor.top;
    if(left<Math.max(16,panel.right+12)){left=Math.max(16,Math.min(anchor.right-width,innerWidth-width-16));top=anchor.bottom+12;}
    top=Math.max(16,Math.min(top,innerHeight-80));
    menu.style.left=`${left}px`;menu.style.top=`${top}px`;menu.style.maxHeight=`${innerHeight-top-16}px`;
  }
  function close(restoreFocus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus();}
  function open(focus=false){if(document.body.classList.contains('mobile-simple'))return;menu.hidden=false;trigger.setAttribute('aria-expanded','true');position();if(focus)inputs[0].focus();}
  trigger.onclick=event=>menu.hidden?open(event.detail===0):close();
  closeButton.onclick=()=>close(true);
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();close(true);}},true);
  document.addEventListener('v3-workspace-change',()=>close());
  window.addEventListener('resize',position);window.addEventListener('v3:sidebar-fit',position);
  new MutationObserver(position).observe(document.body,{attributes:true,attributeFilter:['class']});
  requestAnimationFrame(()=>open());
})();
