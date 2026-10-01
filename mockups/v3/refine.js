/* Approved Refine workspace. Editing and geometry are provided by the shared map domain. */
(() => {
  const design='generate',root=$('refine-panel'),panel=document.querySelector('.panel');
  document.body.dataset.refineUi='generate';
  let restoring=false,fieldSerial=0;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(cls==='disclosure-mark')node.setAttribute('aria-hidden','true');if(text!==undefined)node.textContent=text;return node;};
  const paths={undo:'M9 4 3 10l6 6M3 10h10c10 0 10 11 0 11',redo:'m15 4 6 6-6 6m6-6H11C1 10 1 21 11 21',rectangle:'M3 3h18v18H3Z',brush:'m14 3 7 7-9 9-7-7Zm-9 9c-5 4-1 10-4 10 7 1 10-3 6-7',balance:'M12 3v18M4 7h16M4 7l-3 7h6Zm16 0-3 7h6ZM6 21h12',water:'M3 7c4-5 6 5 10 0s6 4 8 0M3 15c4-5 6 5 10 0s6 4 8 0',resource:'m12 3 8 5v8l-8 5-8-5V8Zm-8 5 8 5 8-5m-8 5v8'};
  const svg=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key]||iconPaths[key]||iconPaths.leaf}"/></svg>`;
  const categories=[['terrain','Terrain','mountain'],['vegetation','Vegetation','leaf'],['water','Water','water'],['resources','Resources','resource'],['starts','Starts','balance']];
  const actions={terrain:[['pass','Lower mountains'],['flatten','Flatten hills']],vegetation:[['woodland','Add woodland'],['thin','Thin woodland']],water:[['drain','Drain marshland'],['oasis','Add oases']],resources:[['redistribute','Redistribute deposits']],starts:[['review','Review starting balance']]};
  const allActions=Object.entries(actions).flatMap(([category,items])=>items.map(([id,label])=>({id,label,category,icon:categories.find(c=>c[0]===category)[2]})));
  let action='woodland',intent='adjust',strength='moderate',tool='region',scopeValue='selected',savedArea=[],outlinePoints=[],outlining=false,selectDown=null,undoStack=[],redoStack=[],findings=[],pickedIssues=new Set();
  const editControls=[];
  const legacy=make('div');legacy.hidden=true;legacy.append(...root.childNodes);root.append(legacy);
  const toolbar=make('div','rf-toolbar'),importButton=$('import-map'),undo=make('button','rf-history-button'),redo=make('button','rf-history-button');
  importButton.innerHTML=svg('upload')+'<span>Import</span>';importButton.title='Import .Civ5Map';importButton.setAttribute('aria-label','Import .Civ5Map');
  for(const [button,key,label] of [[undo,'undo','Undo edit'],[redo,'redo','Redo edit']]){button.type='button';button.innerHTML=svg(key);button.title=label;button.setAttribute('aria-label',label);}toolbar.append(importButton,undo,redo);root.append(toolbar);
  const area=make('section','rf-section rf-area'),areaHeading=make('div','rf-section-heading'),areaCount=make('span','rf-scope-count');areaHeading.append(make('h3','','Area'),areaCount);area.append(areaHeading);
  function selectField(label,choices,value,onchange){const row=make('label','rf-field'),select=make('select');select.id=`refine-field-${fieldSerial++}`;select.setAttribute('aria-label',label);for(const [id,title] of choices){const option=make('option','',title);option.value=id;select.append(option);}select.value=value;select.onchange=()=>onchange(select.value);row.append(make('span','',label),select);editControls.push(select);return {row,select};}
  const scope=selectField('Scope',[['selected','Selected area'],['whole','Whole map']],scopeValue,value=>{scopeValue=value;intent='adjust';outlinePoints=[];outlining=false;if(value==='whole'){savedArea=[...selection];selection=[];selectMode=false;}else{selection=[...savedArea];selectMode=false;}updateSelection();});areaHeading.querySelector('h3').remove();scope.row.classList.add('rf-scope-choice');areaHeading.prepend(scope.row);
  const tools=make('div','rf-tools'),regionButton=$('select-area'),outlineButton=make('button'),clear=$('clear-area');
  regionButton.innerHTML=svg('layers')+'Region';regionButton.title='Click a geographic region; Shift adds, Alt removes';outlineButton.type='button';outlineButton.innerHTML=svg('rectangle')+'Outline';outlineButton.title='Click boundary corners; Enter finishes, Escape cancels';outlineButton.setAttribute('aria-pressed','false');clear.textContent='Clear';clear.hidden=false;
  tools.append(regionButton,outlineButton,clear);area.append(tools);editControls.push(regionButton,outlineButton,clear);
  const regionType=selectField('Region',[['terrain','Terrain region'],['landmass','Landmass'],['woodland','Woodland'],['highlands','Highlands'],['water','Water body']],'terrain',()=>{});regionType.row.classList.add('rf-region-type');area.append(regionType.row);root.append(area);
  regionButton.onclick=()=>{if(preview)return;tool='region';scopeValue='selected';scope.select.value='selected';selectMode=false;outlining=false;outlinePoints=[];updateSelection();};
  outlineButton.onclick=()=>{if(preview)return;tool='outline';scopeValue='selected';scope.select.value='selected';selectMode=false;outlining=true;outlinePoints=[];updateSelection();};
  clear.onclick=()=>{selection=[];savedArea=[];outlinePoints=[];outlining=false;updateSelection();};
  let selectionField=null,regionChoice=null,regionHint=null,areaShapeField=null,areaShapeValue='rectangle';
  function configureSelection(value){
    if(preview)return;
    tool=value==='region'?'region':value==='tile'?'tile':areaShapeValue==='boundary'?'outline':'rectangle';
    scopeValue='selected';scope.select.value='selected';selection=[];savedArea=[];outlinePoints=[];outlining=tool==='outline';selectDown=null;selectMode=tool==='rectangle';updateSelection();
  }
  if(design==='generate'){
    selectionField=selectField('Select by',[['region','Geographic region'],['area','Area'],['tile','Single tile']],'region',configureSelection);
    regionChoice=selectField('Region type',[['terrain','Terrain region'],['landmass','Landmass'],['woodland','Woodland'],['highlands','Highlands'],['water','Water body']],regionType.select.value,value=>{regionType.select.value=value;configureSelection('region');});
    areaShapeField=selectField('Shape',[['rectangle','Rectangle'],['boundary','Custom boundary']],areaShapeValue,value=>{areaShapeValue=value;configureSelection('area');});areaShapeField.row.hidden=true;
    regionHint=make('p','rf-region-hint');regionHint.id='refine-region-hint';regionChoice.select.setAttribute('aria-describedby',regionHint.id);
    area.append(selectionField.row,regionChoice.row,areaShapeField.row,regionHint);legacy.append(tools,regionType.row);
    importButton.textContent='Import';undo.textContent='Undo';redo.textContent='Redo';
  }
  function strengthField(){return selectField('Strength',[['light','Light'],['moderate','Moderate'],['strong','Strong']],strength,value=>{strength=value;intent='adjust';syncStrength();sync();});}
  const strengthFields=[];
  const editor=make('section',design==='toolbox'?'rf-toolbox':design==='actions'?'rf-quick-list':'rf-section');root.append(editor);
  let categoryField=null,actionField=null;
  function choose(id){action=id;intent='adjust';syncStrength();sync();}
  function syncStrength(){for(const control of strengthFields)control.select.value=strength;}
  {
    const heading=make('div','rf-section-heading');heading.append(make('h3','','Adjustment'));editor.append(heading);
    categoryField=selectField('Category',categories.map(([id,label])=>[id,label]),'vegetation',category=>{intent='adjust';action=actions[category][0][0];rebuildActions();sync();});
    actionField=selectField('Change',actions.vegetation,action,choose);const amount=strengthField();strengthFields.push(amount);editor.append(categoryField.row,actionField.row,amount.row);
  }
  if(design==='generate'){
    const clearRow=make('div','rf-local-clear');clear.textContent='Clear selection';clearRow.append(clear);editor.append(clearRow);
    for(const heading of editor.querySelectorAll('.rf-section-heading'))heading.hidden=true;
    for(const control of editControls)if(control.closest('.rf-field')&&!legacy.contains(control)&&control!==scope.select)control.dataset.refineMenu='';
  }
  function rebuildActions(){actionField.select.replaceChildren();for(const [value,title] of actions[categoryField.select.value]){const option=make('option','',title);option.value=value;actionField.select.append(option);}actionField.select.value=action;}
  const checks=make('section','rf-section'),checkHead=make('div','rf-check-head'),checkButton=make('button','rf-check-button','Check map'),checkResult=make('p','rf-check-result','Not checked'),issueList=make('div'),repairButton=make('button','rf-repair-preview','Preview corrections'),balance=make('button','rf-balance');
  checkButton.type='button';repairButton.type='button';balance.type='button';repairButton.hidden=true;checkHead.append(make('h3','','Check & repair'),checkButton);balance.innerHTML=svg('balance')+'<span>Review starting balance</span>'+svg('chevron');checks.append(checkHead,checkResult,issueList,repairButton);root.append(checks);
  const globalDraft={climate:'unchanged',relief:'unchanged',vegetation:'unchanged',resources:'unchanged',strength:'moderate'};
  const globalBox=make('details','rf-extent rf-global'),localBox=make('details','rf-extent rf-local'),globalSummary=make('summary'),localSummary=make('summary'),globalStatus=make('span','rf-extent-note','Whole map'),globalBody=make('div','rf-global-fields'),localBody=make('div','rf-local-body');
  globalBox.name=localBox.name='refine-extent';localBox.open=true;
  globalSummary.append(make('span','','Global changes'),globalStatus,make('span','disclosure-mark','⌄'));localSummary.append(make('span','','Local refinement'),areaCount,make('span','disclosure-mark','⌄'));
  globalBox.append(globalSummary,globalBody);localBox.append(localSummary,localBody);root.insertBefore(globalBox,area);root.insertBefore(localBox,area);localBody.append(area,editor);legacy.append(scope.row);areaHeading.hidden=true;
  const globalChoices=[
    ['climate','Climate',[['unchanged','Unchanged'],['cooler','Cooler'],['warmer','Warmer'],['drier','Drier'],['wetter','Wetter']]],
    ['relief','Relief',[['unchanged','Unchanged'],['flatter','Flatter'],['rugged','More rugged'],['lower','Lower peaks']]],
    ['vegetation','Vegetation',[['unchanged','Unchanged'],['sparser','Sparser'],['denser','Denser']]],
    ['resources','Resources',[['unchanged','Unchanged'],['fewer','Fewer deposits'],['more','More deposits'],['redistribute','Redistribute']]],
    ['strength','Strength',[['light','Light'],['moderate','Moderate'],['strong','Strong']]]
  ];
  for(const [key,label,choices] of globalChoices){const field=selectField(label,choices,globalDraft[key],value=>{globalDraft[key]=value;intent='adjust';sync();});field.select.setAttribute('aria-label',`Global ${label.toLowerCase()}`);if(design==='generate')field.select.dataset.refineMenu='';globalBody.append(field.row);}
  function activateExtent(whole){
    if(preview)return;
    if(whole&&scopeValue!=='whole'){savedArea=[...selection];selection=[];}
    else if(!whole&&scopeValue!=='selected')selection=savedArea.filter(i=>i<current.map.tiles.length);
    scopeValue=whole?'whole':'selected';scope.select.value=scopeValue;intent='adjust';outlinePoints=[];outlining=false;selectMode=false;updateSelection();
  }
  globalSummary.addEventListener('click',()=>{if(!globalBox.open&&scopeValue!=='whole')activateExtent(true);});localSummary.addEventListener('click',()=>{if(!localBox.open&&scopeValue!=='selected')activateExtent(false);});
  globalBox.addEventListener('toggle',()=>{if(globalBox.open&&scopeValue!=='whole')activateExtent(true);});localBox.addEventListener('toggle',()=>{if(localBox.open&&scopeValue!=='selected')activateExtent(false);});
  function globalChanges(){return Object.keys(globalDraft).filter(key=>key!=='strength'&&globalDraft[key]!=='unchanged');}
  const footer=make('div','refine-footer'),ready=make('div','rf-ready'),readyNote=make('small'),previewButton=make('button','primary','Preview changes');previewButton.type='button';ready.append(readyNote,previewButton);
  const review=$('preview-bar');review.className='refine-review';const copy=review.querySelector('.preview-copy'),compare=$('compare'),discard=$('discard'),accept=$('accept'),compareControls=make('div','rf-compare'),original=make('button','','Original'),proposed=make('button','','Proposed'),reviewTop=make('div','rf-review-top'),reviewActions=make('div','rf-review-actions');
  original.type=proposed.type='button';compare.hidden=true;original.setAttribute('aria-pressed','false');proposed.setAttribute('aria-pressed','true');compareControls.append(original,proposed);reviewTop.append(copy,compareControls);reviewActions.append(discard,accept);review.replaceChildren(reviewTop,reviewActions,compare);footer.append(ready,review);panel.append(footer);
  original.onclick=()=>{if(preview&&!showOriginal)compare.click();sync();};proposed.onclick=()=>{if(preview&&showOriginal)compare.click();sync();};
  if(design==='generate')accept.textContent='Apply';
  function worldChanged(before,world,options={}){
    outlinePoints=[];outlining=false;selectDown=null;intent='adjust';findings=[];pickedIssues.clear();issueList.replaceChildren();repairButton.hidden=true;checkResult.textContent='Not checked';checkResult.classList.remove('has-issues');
    if(before!==world&&!['refine','undo','redo'].includes(options.reason)){undoStack=[];redoStack=[];savedArea=[];}
    sync();
  }
  function accepted(before){undoStack.push(before);if(undoStack.length>=HISTORY_LIMIT)undoStack.shift();redoStack=[];sync();}
  async function restore(from,to,reason){
    if(guardPreview()||restoring||!from.length)return;
    const target=from[from.length-1];let restored=target,retained=history.includes(target);
    restoring=true;sync();
    try{
      if(retained&&historyStore&&target.historyId){busyHistory(true);try{retained=await historyStore.select(target.historyId);}finally{busyHistory(false);}}
      if(!retained){restored={...target,uid:++serial,change:`Restored ${target.change||'map'}`};if(!await addSnapshot(restored))return;}
      from.pop();to.push(current);if(to.length>=HISTORY_LIMIT)to.shift();
      setCurrent(restored,{reason,keepSelection:true,keepView:true,remember:false});
    }catch{toast('Could not restore this edit. The accepted map is unchanged.');}
    finally{restoring=false;sync();}
  }
  undo.onclick=()=>restore(undoStack,redoStack,'undo');redo.onclick=()=>restore(redoStack,undoStack,'redo');
  function reviewBalance(){const select=document.querySelector('.layer-view-picker select');if(select.querySelector('[value=balance]').disabled){toast('This map needs at least two valid player starts.');return;}select.value='balance';select.dispatchEvent(new Event('change',{bubbles:true}));}
  balance.onclick=reviewBalance;
  function sync(){
    if(!previewButton)return;
    const busy=historyBusy||generationPending||restoring;
    const whole=scopeValue==='whole',globalCount=globalChanges().length;areaCount.textContent=`${whole?savedArea.length:selection.length} tile${(whole?savedArea.length:selection.length)===1?'':'s'}`;globalStatus.textContent=globalCount?`${globalCount} change${globalCount===1?'':'s'}`:'Whole map';scope.select.value=scopeValue;clear.hidden=!selection.length;
    if(selectionField){selectionField.select.value=tool==='region'?'region':tool==='tile'?'tile':'area';regionChoice.select.value=regionType.select.value;areaShapeField.select.value=areaShapeValue;(regionChoice.select.closest('.rf-field')||regionChoice.row).hidden=tool!=='region';(areaShapeField.select.closest('.rf-field')||areaShapeField.row).hidden=!['rectangle','outline'].includes(tool);selectMode=mode==='refine'&&!mobileMedia.matches&&!whole&&tool==='rectangle'&&!preview&&!busy;document.querySelector('#map-stage').classList.toggle('selecting',selectMode);}
    if(regionHint){regionHint.hidden=whole||tool!=='region'||!!preview;regionHint.textContent={terrain:'Click a tile to select its connected terrain.',landmass:'Click land to select the whole landmass.',woodland:'Click forest or jungle to select its connected area.',highlands:'Click hills or mountains to select their connected area.',water:'Click water to select the whole water body.'}[regionType.select.value];}
    regionButton.setAttribute('aria-pressed',String(!whole&&tool==='region'));outlineButton.setAttribute('aria-pressed',String(!whole&&tool==='outline'));regionType.row.hidden=whole||tool!=='region';document.body.dataset.selectionTool=mode==='refine'&&!whole?tool:'none';
    for(const control of editControls)control.disabled=!!preview||busy;editor.inert=!!preview||busy;area.inert=!!preview||busy;issueList.inert=!!preview||busy;globalBox.inert=!!preview||busy;localBox.inert=!!preview||busy;
    for(const radio of editor.querySelectorAll('input[type=radio]'))radio.checked=radio.value===action;
    for(const button of editor.querySelectorAll('[data-quick-action]'))button.setAttribute('aria-pressed',String(button.dataset.quickAction===action));
    for(const control of strengthFields)(control.select.closest('.rf-field')||control.row).hidden=action==='review'||(design==='generate'&&tool==='tile');
    undo.disabled=!!preview||busy||!undoStack.length;redo.disabled=!!preview||busy||!redoStack.length;importButton.disabled=!!preview||busy;checkButton.disabled=!!preview||busy;repairButton.disabled=!!preview||busy||!pickedIssues.size;
    ready.hidden=!!preview;review.hidden=!preview;previewButton.textContent=outlining?'Finish boundary':intent==='repair'?'Preview corrections':whole?'Preview global changes':action==='review'?'Review balance':'Preview local changes';previewButton.disabled=busy||(outlining?outlinePoints.length<3:intent==='repair'?!pickedIssues.size:whole?!globalChanges().length:action!=='review'&&!selection.length);original.disabled=proposed.disabled=busy;accept.disabled=discard.disabled=busy||!preview;
    const title=allActions.find(a=>a.id===action).label;readyNote.textContent=outlining?`${outlinePoints.length} points · click corners · Enter to finish`:intent==='repair'?`${pickedIssues.size} corrections · whole map`:whole?(globalChanges().length?`${globalCount} setting${globalCount===1?'':'s'} · entire map`:'Choose a global change'):action==='review'?'Compare current opening regions':!whole&&!selection.length?(tool==='tile'?'Click a tile on the map':tool==='rectangle'?'Drag an area on the map':'Click a region on the map'):`${title} · ${whole?'whole map':`${selection.length} selected tile${selection.length===1?'':'s'}`}`;
    original.setAttribute('aria-pressed',String(showOriginal));proposed.setAttribute('aria-pressed',String(!showOriginal));
  }
  function previewResult(result,title){
    const removed=result.removedFeatures+result.removedResources;
    const detail=removed?`${removed} item${removed===1?'':'s'} removed`:result.movedResources?`${result.movedResources} deposit${result.movedResources===1?'':'s'} moved`:'';
    startPreview(result.map,title,detail,'tweak');
  }
  function propose(){
    if(action==='review'){reviewBalance();return;}if(guardPreview()||restoring)return;
    try{previewResult(window.V3ExistingRules.refineLocal(current.map,action,selection,strength),allActions.find(a=>a.id===action).label);}
    catch(error){toast(error.message);}
  }
  function proposeGlobal(){
    if(guardPreview()||restoring||!globalChanges().length)return;
    try{previewResult(window.V3ExistingRules.refineGlobal(current.map,globalDraft),'Global changes');}
    catch(error){toast(error.message);}
  }
  previewButton.onclick=()=>outlining?finishBoundary():intent==='repair'?repairButton.click():scopeValue==='whole'?proposeGlobal():propose();
  function checkRefine(){if(guardPreview())return;outlinePoints=[];outlining=false;findings=window.V3ExistingRules.inspect(current.map);pickedIssues=new Set(findings.slice(0,100).map(f=>f.id));intent=findings.length?'repair':'adjust';renderChecks();checks.scrollIntoView({block:'nearest'});highlight=findings.map(f=>f.index);renderMap();};checkButton.onclick=checkRefine;
  function renderChecks(){issueList.replaceChildren();checkResult.textContent=findings.length>100?`${findings.length} findings · first 100 shown`:findings.length?`${findings.length} findings across the map`:'No supported placement issues';checkResult.classList.toggle('has-issues',!!findings.length);repairButton.hidden=true;
    const groups=[['relief','Terrain'],['feature','Features'],['resource','Resources'],['wonder','Wonders']];for(const [key,label] of groups){const group=findings.slice(0,100).filter(f=>f.id.startsWith(key));if(!group.length)continue;const details=make('details','rf-issue-group'),summary=make('summary');summary.append(make('span','',label),make('span','issue-total',String(group.length)),make('span','disclosure-mark','⌄'));details.append(summary);for(const finding of group){const row=make('div','rf-issue'),input=make('input'),button=make('button');input.type='checkbox';input.checked=pickedIssues.has(finding.id);input.setAttribute('aria-label',`Correct ${finding.title}`);input.onchange=()=>{intent='repair';if(input.checked)pickedIssues.add(finding.id);else pickedIssues.delete(finding.id);highlight=findings.filter(f=>pickedIssues.has(f.id)).map(f=>f.index);renderMap();sync();};button.type='button';button.append(make('span','',finding.detail),make('small','',`${finding.index%current.map.width}, ${Math.floor(finding.index/current.map.width)} · ${finding.action}`));button.onclick=()=>{highlight=[finding.index];renderMap();};row.append(input,button);details.append(row);}issueList.append(details);}sync();}
  repairButton.onclick=()=>{if(guardPreview()||!pickedIssues.size)return;const ids=[...pickedIssues];startPreview(window.V3ExistingRules.repair(current.map,ids),'Terrain corrections',`${ids.filter(id=>!id.startsWith('relief-')).length} removals`,'repair');};
  const regions=window.V3ExistingRules.refineGeometry;
  function mapPoint(event){const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left-view.x)/view.zoom,y:(event.clientY-r.top-view.y)/view.zoom};}
  const hitTest=event=>regions.tileAtPoint(current.map,mapPoint(event));
  function finishBoundary(){
    if(outlinePoints.length<3)return;
    const cells=regions.polygon(current.map,outlinePoints);if(!cells.length){toast('This boundary contains no tile centres. Adjust it or press Escape.');return;}
    selection=cells;savedArea=[...selection];outlinePoints=[];outlining=false;updateSelection();
  }
  canvas.addEventListener('pointerdown',event=>{if(mode==='refine'&&!mobileMedia.matches&&scopeValue==='selected'&&!preview&&!historyBusy&&!generationPending&&!restoring)selectDown={x:event.clientX,y:event.clientY};});
  canvas.addEventListener('pointerup',event=>{
    if(!selectDown)return;const moved=Math.hypot(event.clientX-selectDown.x,event.clientY-selectDown.y);selectDown=null;if(preview||historyBusy||generationPending||restoring||mode!=='refine'||scopeValue!=='selected')return;
    if(tool==='rectangle'){savedArea=[...selection];updateSelection();return;}if(moved>4)return;
    const index=hitTest(event);if(index===null)return;
    if(tool==='tile'){selection=[index];savedArea=[index];updateSelection();return;}
    if(tool==='outline'){if(!outlining){outlinePoints=[];outlining=true;}outlinePoints.push(mapPoint(event));sync();renderMap();return;}
    const cells=regions.connected(current.map,index,regionType.select.value);if(!cells.length){toast(`Choose a ${regionType.select.selectedOptions[0].textContent.toLowerCase()} tile.`);return;}
    if(event.shiftKey)selection=[...new Set([...selection,...cells])];else if(event.altKey){const removed=new Set(cells);selection=selection.filter(i=>!removed.has(i));}else selection=cells;
    savedArea=[...selection];updateSelection();
  });
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{selectDown=null;});
  canvas.addEventListener('keydown',event=>{if(!outlining)return;if(event.key==='Enter'){event.preventDefault();finishBoundary();}else if(event.key==='Escape'){event.preventDefault();outlinePoints=[];outlining=false;sync();renderMap();}else if(event.key==='Backspace'){event.preventDefault();outlinePoints.pop();sync();renderMap();}});
  function drawSelection(context,map){
    if(preview||mobileMedia.matches||mode!=='refine'||!selection.length)return;
    const selected=new Set(selection);context.fillStyle='#d9b67832';context.strokeStyle='#6c7050';context.lineWidth=1.5/view.zoom;
    for(const index of selected){const point=center(map,index);hex(context,point.x,point.y);context.fill();context.beginPath();for(let edge=0;edge<6;edge++){if(selected.has(regions.neighbor(map,index,edge)))continue;const a=points[edge],b=points[(edge+1)%6];context.moveTo(point.x+a[0],point.y+a[1]);context.lineTo(point.x+b[0],point.y+b[1]);}context.stroke();}
  }
  function drawBoundary(context){
    if(mode!=='refine'||mobileMedia.matches||preview||!outlinePoints.length)return;
    context.save();context.strokeStyle='#252c40';context.lineWidth=1.5/view.zoom;context.setLineDash([4/view.zoom,3/view.zoom]);context.beginPath();outlinePoints.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));if(outlinePoints.length>2)context.closePath();context.stroke();context.setLineDash([]);for(const p of outlinePoints){context.beginPath();context.arc(p.x,p.y,3/view.zoom,0,Math.PI*2);context.fillStyle='#fffdf9';context.fill();context.stroke();}context.restore();
  }
  function selectionChanged(){if(mode==='refine'&&scopeValue==='selected'&&!preview&&!mobileMedia.matches)savedArea=[...selection];sync();}
  document.addEventListener('v3-workspace-change',()=>{outlinePoints=[];outlining=false;selectDown=null;if(mode==='refine'&&scopeValue==='selected')selection=savedArea.filter(i=>i<current.map.tiles.length);sync();renderMap();});
  window.V3Refine={sync,worldChanged,accepted,selectionChanged,drawSelection,drawBoundary,hitTest,check:checkRefine};
  document.dispatchEvent(new Event('v3:refine-ready'));
  sync();
})();
