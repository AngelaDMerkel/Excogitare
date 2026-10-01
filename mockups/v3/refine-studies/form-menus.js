/* Isolated reuse of the approved Generate menu behavior for study 04. */
/* Field-anchored menus; existing selects and change handlers own the settings. */
(() => {
  const root=document.getElementById('refine-panel');if(!root)return;
  const chevron='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
  const caution='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M7 2.5a1.2 1.2 0 0 1 2 0l5.5 10a1 1 0 0 1-.9 1.5H2.4a1 1 0 0 1-.9-1.5Z"/><path d="M8 6v3m0 2v.5"/></svg>';
  const check='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>';
  const catalogues={size:window.V3Dimensions.V3_MAP_SIZES,geometry:window.V3Dimensions.V3_MAP_GEOMETRIES};
  const risk=kind=>kind==='size'?'More memory. Civ V support varies.':'May limit starts. Civ V support varies.';
  const fields=[];
  const menu=document.createElement('div');menu.id='refine-setting-options';menu.className='select-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','false');menu.hidden=true;document.body.append(menu);
  let active=null,typed='',typedAt=0;
  function experimental(field,value){return catalogues[field.kind]?.some(option=>option.id===value&&option.experimental)||false;}
  function options(field){return [...field.input.options].filter(option=>!option.disabled&&!option.parentElement.disabled).map(option=>({value:option.value,label:option.textContent,group:option.parentElement.tagName==='OPTGROUP'?option.parentElement.label:'',experimental:experimental(field,option.value)}));}
  function visible(field){
    if(!field.button.isConnected||field.button.closest('[hidden],[inert]')||document.body.classList.contains('mobile-simple'))return false;
    const closed=field.button.closest('details:not([open])');
    return !closed&&field.button.getBoundingClientRect().width>0;
  }
  function close(restore=false){const previous=active;if(previous)previous.button.setAttribute('aria-expanded','false');active=null;menu.hidden=true;if(restore&&previous?.button.isConnected)previous.button.focus();}
  function sync(){
    for(let i=fields.length-1;i>=0;i--)if(!fields[i].input.isConnected)fields.splice(i,1);
    for(const field of fields){
      const label=field.input.selectedOptions[0]?.textContent||'Automatic',warning=experimental(field,field.input.value);
      if(field.value.textContent!==label)field.value.textContent=label;
      if(field.warning.hidden===warning)field.warning.hidden=!warning;
      if(field.button.disabled!==field.input.disabled)field.button.disabled=field.input.disabled;
      field.button.classList.toggle('is-experimental',warning);
      field.button.setAttribute('aria-label',`${field.label}: ${label}${warning?', experimental':''}`);
      if(warning)field.button.setAttribute('aria-description',risk(field.kind));else field.button.removeAttribute('aria-description');
    }
    if(active&&(active.input.disabled||!visible(active)))close();
  }
  function position(){
    if(!active)return;
    if(!visible(active)){close();return;}
    const anchor=active.button.getBoundingClientRect(),scroller=document.querySelector('.panel-scroll').getBoundingClientRect();
    if(anchor.bottom<scroller.top||anchor.top>scroller.bottom){close();return;}
    const longest=Math.max(0,...options(active).map(option=>option.label.length));
    const width=Math.min(innerWidth-24,Math.max(anchor.width,128,longest*6+42));
    menu.style.width=`${width}px`;menu.style.maxHeight='';
    const height=menu.scrollHeight,below=innerHeight-anchor.bottom-18,above=anchor.top-18;
    const up=height>below&&above>below,room=Math.max(0,up?above:below);
    if(room<40){close(true);return;}
    menu.style.maxHeight=`${room}px`;
    menu.style.left=`${Math.max(12,Math.min(anchor.left,innerWidth-width-12))}px`;
    menu.style.top=`${up?anchor.top-Math.min(height,room)-6:anchor.bottom+6}px`;
  }
  function choose(value){
    const field=active;if(!field||field.input.disabled)return;
    if(field.input.value!==value){field.input.value=value;field.input.dispatchEvent(new Event('change',{bubbles:true}));}
    sync();close();if(field.button.isConnected)field.button.focus();
  }
  function render(){
    menu.replaceChildren();menu.setAttribute('aria-label',`${active.label} choices`);
    const list=document.createElement('div');list.setAttribute('role','listbox');list.setAttribute('aria-label',active.label);
    let container=list,previousGroup='';
    for(const option of options(active)){
      const group=option.group==='Experimental'?'':option.group;
      if(group!==previousGroup){
        container=list;previousGroup=group;
        if(group){container=document.createElement('div');container.setAttribute('role','group');container.setAttribute('aria-label',group);const heading=document.createElement('div');heading.className='select-group-title';heading.textContent=group;container.append(heading);list.append(container);}
      }
      const button=document.createElement('button');button.type='button';button.tabIndex=-1;button.className='select-option';button.classList.toggle('is-experimental',option.experimental);button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.value===active.input.value));button.dataset.value=option.value;button.dataset.label=option.label;
      if(option.experimental){button.setAttribute('aria-label',`${option.label}, experimental`);button.setAttribute('aria-description',risk(active.kind));}
      const label=document.createElement('span');label.className='select-option-name';label.textContent=option.label;const mark=document.createElement('span');mark.className='select-check';mark.innerHTML=check;button.append(label,mark);button.onclick=()=>choose(option.value);container.append(button);
    }
    menu.append(list);
  }
  function focusOption(button){if(button){button.focus({preventScroll:true});button.scrollIntoView({block:'nearest',inline:'nearest'});}}
  function open(field,focus=true){
    if(field.input.disabled||!visible(field))return;
    close();active=field;typed='';render();menu.hidden=false;field.button.setAttribute('aria-expanded','true');position();
    if(focus&&!menu.hidden)focusOption(menu.querySelector('[aria-selected=true]')||menu.querySelector('[role=option]'));
  }
  function keys(event,field){
    if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;
    const key=event.key;
    if(key==='Tab'){if(active)close(true);return;}
    if(key==='Escape'){if(active){event.preventDefault();event.stopPropagation();close(true);}return;}
    if(key==='Enter'||key===' '){
      if(event.repeat){event.preventDefault();event.stopPropagation();return;}
      if(field){event.preventDefault();event.stopPropagation();if(active===field)close(true);else open(field);}
      return;
    }
    if(!['ArrowDown','ArrowUp','Home','End'].includes(key)&&key.length!==1)return;
    event.preventDefault();event.stopPropagation();
    if(field&&active!==field)open(field,false);if(!active)return;
    const choices=[...menu.querySelectorAll('[role=option]')];if(!choices.length)return;
    let index=choices.indexOf(document.activeElement);if(index<0)index=Math.max(0,choices.findIndex(button=>button.dataset.value===active.input.value));
    if(key==='ArrowDown')index=Math.min(choices.length-1,index+1);
    else if(key==='ArrowUp')index=Math.max(0,index-1);
    else if(key==='Home')index=0;
    else if(key==='End')index=choices.length-1;
    else{
      const now=Date.now();typed=now-typedAt>700?key.toLowerCase():typed+key.toLowerCase();typedAt=now;
      let match=choices.findIndex(button=>button.dataset.label.toLowerCase().startsWith(typed));
      if(match<0){typed=key.toLowerCase();match=choices.findIndex(button=>button.dataset.label.toLowerCase().startsWith(typed));}
      if(match>=0)index=match;
    }
    focusOption(choices[index]);
  }
  function install(){
    for(const input of root.querySelectorAll('select[data-refine-menu]:not([data-menu-source])')){
      const original=input.closest('label');if(!original)continue;
      input.dataset.menuSource='';input.tabIndex=-1;input.setAttribute('aria-hidden','true');
      const fieldRow=document.createElement('div');fieldRow.className='rf-field generation-field';fieldRow.hidden=original.hidden;const label=input.getAttribute('aria-label');const caption=document.createElement('label');caption.textContent=original.querySelector('span')?.textContent||label;
      const control=document.createElement('span');control.className='select-control';const button=document.createElement('button');button.type='button';button.id=`menu-${input.id||('refine-'+fields.length)}`;button.className='select-trigger';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',menu.id);button.setAttribute('aria-expanded','false');caption.htmlFor=button.id;if(input.hasAttribute('aria-describedby'))button.setAttribute('aria-describedby',input.getAttribute('aria-describedby'));
      const value=document.createElement('span');value.className='select-value';const warning=document.createElement('span');warning.className='select-warning';warning.innerHTML=caution;warning.setAttribute('aria-hidden','true');const arrow=document.createElement('span');arrow.className='select-arrow';arrow.innerHTML=chevron;button.append(value,warning,arrow);
      original.replaceWith(fieldRow);control.append(input,button);fieldRow.append(caption,control);
      const field={input,button,value,warning,label,kind:input.dataset.setting};fields.push(field);button.onclick=()=>{if(active===field)close();else open(field);};button.onkeydown=event=>keys(event,field);input.addEventListener('change',sync);
    }
    sync();
  }
  menu.addEventListener('keydown',event=>keys(event));
  document.addEventListener('pointerdown',event=>{if(active&&!menu.contains(event.target)&&!active.button.contains(event.target))close();});
  document.addEventListener('v3:controls-change',()=>{sync();close();});document.addEventListener('v3-workspace-change',()=>close());document.addEventListener('toggle',position,true);
  document.querySelector('.panel-scroll').addEventListener('scroll',position);window.addEventListener('resize',position);window.addEventListener('v3:sidebar-fit',position);
  new MutationObserver(install).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','inert']});
  new MutationObserver(position).observe(document.body,{attributes:true,attributeFilter:['class']});
  install();
})();
