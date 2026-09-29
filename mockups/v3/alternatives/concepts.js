/* Three layouts; every Generate form expands the same Advanced controls. */
(() => {
  const $=id=>document.getElementById(id),concept=document.body.dataset.concept,workspace=document.querySelector('.workspace'),panel=document.querySelector('.panel'),generation=$('generate-panel'),refinement=$('refine-panel'),primary=$('surprise');
  document.querySelector('.modes').hidden=true;
  for(const section of [generation,refinement]){section.removeAttribute('role');section.removeAttribute('aria-labelledby');}
  const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
  const button=(label,className,action)=>{const el=make('button',className,label);el.type='button';el.onclick=action;return el;};
  const guard=()=>window.guardPreview();
  const bothVisible=()=>{generation.hidden=false;refinement.hidden=false;panel.classList.remove('refine');};
  function inspector(){const el=make('aside','inspector paper');el.setAttribute('aria-label','Edit map');el.append(make('header','inspector-head','Edit map'),refinement);workspace.append(el);return el;}
  if(concept==='workspace'){
    document.querySelector('.brand').after(make('h2','panel-label','Generate'));inspector();document.addEventListener('v3-workspace-change',bothVisible);bothVisible();
  }else if(concept==='peers'){
    let active='generate';const nav=make('nav','peer-nav');nav.setAttribute('aria-label','Workspace');const buttons={};
    const update=()=>{for(const[id,b]of Object.entries(buttons))b.setAttribute('aria-pressed',String(active===id));};
    for(const[id,label]of [['generate','Generate'],['refine','Refine']]){const b=button(label,'',()=>window.setMode(id));b.dataset.peer=id;buttons[id]=b;nav.append(b);}
    document.querySelector('.brand').after(nav);document.addEventListener('v3-workspace-change',event=>{active=event.detail;update();});update();
  }else{
    const tools=inspector(),dialog=make('dialog','concept-dialog paper');dialog.id='new-map-dialog';dialog.setAttribute('aria-labelledby','new-map-dialog-title');
    const head=make('header','dialog-head'),title=make('h2','','New map');title.id='new-map-dialog-title';const close=button('×','dialog-close',()=>dialog.close());close.setAttribute('aria-label','Close New map');head.append(title,close);dialog.append(head,panel);document.body.append(dialog);
    const bar=make('div','editor-bar paper'),brand=make('span','editor-brand','◇ Excogitare');bar.append(brand,button('Reroll','primary',()=>{if(!guard())primary.click();}),button('New map…','outline',()=>{if(guard())return;window.setMode('generate');dialog.showModal();}),button('Import…','outline',()=>{if(!guard())$('import-map').click();}));workspace.append(bar);
    document.querySelector('.panel-actions').prepend(button('Cancel','outline',()=>dialog.close()));primary.addEventListener('click',()=>{if(dialog.open&&$('preview-bar').hidden)dialog.close();});
    document.addEventListener('v3-workspace-change',event=>{bothVisible();if(event.detail==='refine'&&dialog.open)dialog.close();});tools.querySelector('.import-block').classList.add('editor-import-block');bothVisible();
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  }
  window.icons(document);
})();
