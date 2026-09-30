/* Isolated select-menu studies. The native selects remain the setting source. */
(() => {
  const design=document.body.dataset.choiceDesign,root=document.getElementById('generate-panel');
  const embedded=new URLSearchParams(location.search).has('embed');document.body.classList.toggle('choice-embedded',embedded);
  const chevron='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  const caution='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M7 2.5a1.2 1.2 0 0 1 2 0l5.5 10a1 1 0 0 1-.9 1.5H2.4a1 1 0 0 1-.9-1.5Z"/><path d="M8 6v3m0 2v.5"/></svg>';
  const check='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';
  const catalogues={size:window.V3Dimensions.V3_MAP_SIZES,geometry:window.V3Dimensions.V3_MAP_GEOMETRIES};
  const risk=kind=>kind==='size'?'More memory. Civ V support varies.':'May limit starts. Civ V support varies.';
  const menu=document.createElement('div');menu.className=`choice-menu choice-${design}`;menu.id='choice-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','false');menu.hidden=true;document.body.append(menu);
  const fields=[];let active=null,expanded=false,typed='',typedAt=0;
  function experimental(field,value){return catalogues[field.kind]?.some(item=>item.id===value&&item.experimental)||false;}
  function options(field){return [...field.input.options].filter(option=>!option.disabled).map(option=>({value:option.value,label:option.textContent,experimental:experimental(field,option.value)}));}
  function close(restore=false){const previous=active;if(previous)previous.button.setAttribute('aria-expanded','false');active=null;menu.hidden=true;if(restore)previous?.button.focus();}
  function sync(){
    for(let index=fields.length-1;index>=0;index--)if(!fields[index].input.isConnected)fields.splice(index,1);
    for(const field of fields){
      const label=field.input.selectedOptions[0]?.textContent||'Automatic';
      if(field.value.textContent!==label)field.value.textContent=label;
      const isExperimental=experimental(field,field.input.value);
      field.warning.hidden=!isExperimental;field.button.classList.toggle('is-experimental',isExperimental);
      if(field.button.disabled!==field.input.disabled)field.button.disabled=field.input.disabled;field.button.setAttribute('aria-label',`${field.label}: ${label}${isExperimental?', experimental':''}`);
      if(isExperimental)field.button.setAttribute('aria-description',risk(field.kind));else field.button.removeAttribute('aria-description');
    }
    if(active&&(active.input.disabled||!active.button.getBoundingClientRect().width||active.button.closest('[inert]')))close();
  }
  function position(){
    if(!active)return;
    const anchor=active.button.getBoundingClientRect(),scroller=document.querySelector('.panel-scroll').getBoundingClientRect();
    if(document.body.classList.contains('mobile-simple')||!anchor.width||active.button.closest('[inert]')||anchor.bottom<scroller.top||anchor.top>scroller.bottom){close();return;}
    const minimum=128;
    const longest=Math.max(...options(active).map(option=>option.label.length));
    const width=Math.min(innerWidth-24,Math.max(anchor.width,minimum,longest*6+42));
    menu.style.width=`${width}px`;menu.style.maxHeight='';
    const topLimit=embedded?12:56,below=innerHeight-anchor.bottom-18,above=anchor.top-topLimit-6;
    const height=menu.scrollHeight,up=height>below&&above>below;
    const room=Math.max(64,up?above:below);menu.style.maxHeight=`${room}px`;
    const left=Math.max(12,Math.min(anchor.left,innerWidth-width-12));
    const top=up?anchor.top-Math.min(height,room)-6:anchor.bottom+6;
    menu.style.left=`${left}px`;menu.style.top=`${Math.max(topLimit,top)}px`;menu.dataset.direction=up?'up':'down';
  }
  function visibleOptions(){return [...menu.querySelectorAll('[role=option]')].filter(button=>!button.closest('[hidden]'));}
  function choose(value){
    const field=active;field.input.value=value;field.input.dispatchEvent(new Event('change',{bubbles:true}));sync();close();field.button.focus();
  }
  function row(option){
    const button=document.createElement('button');button.type='button';button.className='choice-option';button.setAttribute('role','option');button.tabIndex=-1;button.dataset.value=option.value;button.dataset.label=option.label;
    const selected=option.value===active.input.value;button.setAttribute('aria-selected',String(selected));
    const mark=document.createElement('span');mark.className='choice-check';mark.innerHTML=check;
    const text=document.createElement('span');text.className='choice-name';text.textContent=option.label;
    button.append(mark,text);button.classList.toggle('is-experimental',option.experimental);
    if(design==='tagged'&&option.experimental){button.setAttribute('aria-label',`${option.label}, experimental`);button.setAttribute('aria-description',risk(active.kind));}
    button.onclick=()=>choose(option.value);return button;
  }
  function list(items,label){const node=document.createElement('div');node.setAttribute('role','listbox');node.setAttribute('aria-label',label);node.append(...items.map(row));return node;}
  function render(){
    if(!active)return;
    menu.replaceChildren();menu.setAttribute('aria-label',`${active.label} choices`);
    const choices=options(active),normal=choices.filter(option=>!option.experimental),special=choices.filter(option=>option.experimental);
    if(design==='tagged')menu.append(list(choices,active.label));
    else{
      menu.append(list(normal,active.label));
      if(special.length){
        const section=document.createElement('section');section.className='choice-experimental';
        if(design==='folded'){
          const toggle=document.createElement('button');toggle.type='button';toggle.className='choice-section-toggle';toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls','experimental-choice-list');toggle.innerHTML=`${caution}<span>Experimental</span><span class="choice-count">${special.length}</span>${chevron}`;
          toggle.onclick=()=>{expanded=!expanded;render();position();menu.querySelector('.choice-section-toggle').focus();};section.append(toggle);
          const content=list(special,`Experimental ${active.label.toLowerCase()}`);content.id='experimental-choice-list';content.hidden=!expanded;section.append(content);
        }else{const heading=document.createElement('div');heading.className='choice-group-title';heading.innerHTML=`${caution}<span>Experimental</span>`;section.append(heading,list(special,`Experimental ${active.label.toLowerCase()}`));}
        menu.append(section);
      }
    }
    if(special.length&&design!=='tagged'){
      const footer=document.createElement('p');footer.className='choice-guidance';
      const selected=choices.find(option=>option.value===active.input.value);
      footer.textContent=selected?.experimental?risk(active.kind):'Experimental sizes and proportions may not load reliably in Civ V.';
      if(design==='folded'&&!expanded)footer.hidden=true;menu.append(footer);
    }
  }
  function open(field,focus=true){
    if(field.input.disabled)return;close();active=field;expanded=experimental(field,field.input.value);typed='';
    render();menu.hidden=false;field.button.setAttribute('aria-expanded','true');position();
    if(focus&&!menu.hidden)(menu.querySelector('[role=option][aria-selected=true]')||visibleOptions()[0])?.focus({preventScroll:true});
  }
  function keys(event,field){
    if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
    const key=event.key;
    if(key==='Tab'){if(active)close(true);return;}
    if(key==='Escape'){if(active){event.preventDefault();event.stopPropagation();close(true);}return;}
    if(key==='Enter'||key===' '){
      if(field){event.preventDefault();event.stopPropagation();if(active===field)close();else open(field);}
      return;
    }
    if(!['ArrowDown','ArrowUp','Home','End'].includes(key)&&key.length!==1)return;
    event.preventDefault();event.stopPropagation();
    if(!active&&field)open(field,false);if(!active)return;
    let choices=[...menu.querySelectorAll('[role=option],.choice-section-toggle')].filter(button=>!button.closest('[hidden]'));let index=choices.indexOf(document.activeElement);
    if(key==='ArrowDown')index=(index+1)%choices.length;
    else if(key==='ArrowUp')index=(index-1+choices.length)%choices.length;
    else if(key==='Home')index=0;
    else if(key==='End')index=choices.length-1;
    else{const now=Date.now();typed=now-typedAt>700?key.toLowerCase():typed+key.toLowerCase();typedAt=now;index=choices.findIndex(button=>(button.dataset.label||'Experimental').toLowerCase().startsWith(typed));if(index<0&&design==='folded'&&!expanded&&options(active).some(option=>option.experimental&&option.label.toLowerCase().startsWith(typed))){expanded=true;render();position();choices=[...menu.querySelectorAll('[role=option],.choice-section-toggle')];index=choices.findIndex(button=>(button.dataset.label||'Experimental').toLowerCase().startsWith(typed));}}
    choices[index]?.focus({preventScroll:true});choices[index]?.scrollIntoView({block:'nearest'});
  }
  function install(){
    for(const input of root.querySelectorAll('select:not([data-choice-source])')){
      const original=input.closest('label');if(!original)continue;
      input.dataset.choiceSource='';input.tabIndex=-1;input.setAttribute('aria-hidden','true');
      const label=input.getAttribute('aria-label'),kind=input.dataset.setting;
      const fieldRow=document.createElement('div');fieldRow.className='generation-field';
      const caption=document.createElement('label');caption.textContent=label;
      const control=document.createElement('span');control.className='choice-control';
      const button=document.createElement('button');button.type='button';button.className='choice-trigger';button.id=`choice-${input.id}`;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',menu.id);button.setAttribute('aria-expanded','false');caption.htmlFor=button.id;
      const value=document.createElement('span');value.className='choice-value';const warning=document.createElement('span');warning.className='choice-warning';warning.innerHTML=caution;warning.setAttribute('aria-hidden','true');const arrow=document.createElement('span');arrow.className='choice-arrow';arrow.innerHTML=chevron;button.append(value,warning,arrow);
      original.replaceWith(fieldRow);control.append(input,button);fieldRow.append(caption,control);
      const field={input,button,value,warning,label,kind};fields.push(field);
      button.onclick=()=>active===field?close():open(field);button.onkeydown=event=>keys(event,field);
      input.addEventListener('change',sync);
    }
    sync();
  }
  menu.addEventListener('keydown',event=>keys(event));
  document.addEventListener('pointerdown',event=>{if(active&&!menu.contains(event.target)&&!active.button.contains(event.target))close();});
  document.addEventListener('v3:controls-change',()=>{sync();close();});document.addEventListener('v3-workspace-change',()=>close());
  document.querySelector('.panel-scroll').addEventListener('scroll',position);window.addEventListener('resize',position);window.addEventListener('v3:sidebar-fit',position);
  new MutationObserver(install).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  new MutationObserver(position).observe(document.body,{attributes:true,attributeFilter:['class']});
  install();
  for(const editor of ['standard','advanced'])for(const [kind,value] of [['size','COLOSSAL'],['geometry','RIBBON']]){const input=document.getElementById(`${editor}-${kind}`);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));}
  sync();requestAnimationFrame(()=>open(fields.find(field=>field.input.id==='standard-geometry'),!embedded));
})();
