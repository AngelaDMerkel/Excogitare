/* V3 Generate/Refine interface: worker generation, local history and map editing. */
'use strict';
const $ = id => document.getElementById(id);
const iconPaths = {
  shuffle:'M3 5h3l12 14h3M18 16l3 3-3 3M3 19h3l4-5M14 10l4-5h3M18 2l3 3-3 3',
  bookmark:'M6 3h12v18l-6-4-6 4Z', pin:'m8 3 8 0-1 7 4 4H5l4-4ZM12 14v7',
  chevron:'m6 9 6 6 6-6', arrow:'M4 12h16m-6-6 6 6-6 6', check:'m5 12 4 4L19 6',
  download:'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5', upload:'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5', leaf:'M20 3C9 1 1 7 6 16c9 5 15-2 14-13ZM4 21 15 9',
  mountain:'m2 20 7-14 5 9 3-6 5 11ZM6 12l3 2 3-2', lock:'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4',
  scan:'M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5M8 12l3 3 5-6',
  layers:'m12 3 10 6-10 6L2 9Zm-10 10 10 6 10-6M2 17l10 6 10-6'
};
function icons(root=document) { root.querySelectorAll('[data-icon]').forEach(el => { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.5'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round'); svg.setAttribute('aria-hidden','true'); const path=document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',iconPaths[el.dataset.icon]||''); svg.append(path); el.replaceWith(svg); }); }
icons();

function inflate(sample) {
  const m=sample.map;
  return {name:sample.title,description:sample.description,width:m.width,height:m.height,wraps:false,worldSize:'STANDARD',source:'generated',players:4,version:12,terrains:m.terrains,features:m.features,resources:m.resources,wonders:m.wonders,tiles:m.tiles.map(t=>({terrain:t[0],elevation:t[1],feature:t[2],river:t[3],resource:t[4],wonder:t[5],resourceAmount:t[4]===255?0:1,continent:t[0]>1?1:0})),startLocations:(m.starts||[]).map(([x,y],player)=>({x,y,player,cityState:false}))};
}
let serial=0;
let historyBusy=false,historyStore=null,historyLoaded=false,generationPending=false;
const HISTORY_LIMIT=100;
function sampleWorld(sample) { return {...sample,map:inflate(sample),uid:++serial,kept:false,source:'sample',change:'Original sample'}; }
const samples=window.V3_MAP_SAMPLES;
let current=sampleWorld(samples[0]),history=[current],preview=null,showOriginal=false,mode='generate',issues=[],showKept=false,toastTimer;
let layers={relief:true,vegetation:true,resources:false,grid:false,starts:false};
let selectMode=false,selection=[];
const canvas=$('map'),ctx=canvas.getContext('2d');
let viewport={width:800,height:500,ratio:1},view={x:0,y:0,zoom:1,fit:1},drag=null,highlight=[];
const colors={OCEAN:'#91b1b7',COAST:'#bed0ca',GRASS:'#c0c9a5',PLAINS:'#d3cc9f',DESERT:'#e5d3ab',TUNDRA:'#c3c5b0',SNOW:'#e3e3d3'};
const points=Array.from({length:6},(_,i)=>[Math.cos((i*60-90)*Math.PI/180)*10,Math.sin((i*60-90)*Math.PI/180)*10]);
const center=(map,i)=>({x:(i%map.width+(Math.floor(i/map.width)%2)*.5)*Math.sqrt(3)*10+10,y:(map.height-1-Math.floor(i/map.width))*15+10});
function hex(c,x,y){c.beginPath();points.forEach(([dx,dy],i)=>i?c.lineTo(x+dx,y+dy):c.moveTo(x+dx,y+dy));c.closePath();}
function terrain(map,t){const name=map.terrains[t.terrain]||'';return Object.keys(colors).find(k=>name.includes(k));}
function drawTiles(c,map,activeLayers,marked=[]) {
  const markedSet=new Set(marked);
  for(let i=0;i<map.tiles.length;i++){
    const tile=map.tiles[i],{x,y}=center(map,i),key=terrain(map,tile);
    c.fillStyle=colors[key]||'#bcb9a8';hex(c,x,y);c.fill();c.strokeStyle=c.fillStyle;c.lineWidth=.3;c.stroke();
    if(activeLayers.grid){c.strokeStyle='#75816f40';c.lineWidth=.3;c.stroke();}
  }
  for(let i=0;i<map.tiles.length;i++){
    const tile=map.tiles[i],{x,y}=center(map,i),feature=map.features[tile.feature]||'';
    if(activeLayers.relief&&tile.elevation===2){c.fillStyle='#858c73';c.beginPath();c.moveTo(x-3.8,y+2.8);c.lineTo(x,y-4.5);c.lineTo(x+4,y+2.8);c.closePath();c.fill();c.fillStyle='#acaf93';c.beginPath();c.moveTo(x,y-4.5);c.lineTo(x+4,y+2.8);c.lineTo(x+.5,y+1);c.fill();}
    else if(activeLayers.relief&&tile.elevation===1){c.strokeStyle='#939b7b75';c.lineWidth=.75;c.beginPath();c.moveTo(x-4,y+2);c.quadraticCurveTo(x-1,y-2,x+2,y+1);c.quadraticCurveTo(x+4,y-1,x+5,y+2);c.stroke();}
    if(activeLayers.vegetation&&tile.elevation<2){
      if(/FOREST|JUNGLE/.test(feature)){c.fillStyle=feature.includes('JUNGLE')?'#7b977276':'#8194767f';for(const[dx,dy]of[[-3,1],[0,-2],[3,1]]){c.beginPath();c.moveTo(x+dx-1.4,y+dy+1.6);c.lineTo(x+dx,y+dy-1.8);c.lineTo(x+dx+1.4,y+dy+1.6);c.fill();}}
      else if(/ICE/.test(feature)){c.fillStyle='#eeeee0b5';c.beginPath();c.moveTo(x-5,y+2);c.lineTo(x-2,y-3);c.lineTo(x,y);c.lineTo(x+3,y-3);c.lineTo(x+5,y+2);c.fill();}
      else if(/MARSH/.test(feature)){c.strokeStyle='#7c9a877a';c.lineWidth=.7;for(const dx of[-3,0,3]){c.beginPath();c.moveTo(x+dx,y+2);c.lineTo(x+dx+1,y-2);c.stroke();}}
      else if(/OASIS/.test(feature)){c.fillStyle='#78a796';c.beginPath();c.ellipse(x,y,3,1.7,0,0,Math.PI*2);c.fill();}
    }
    if(tile.river&7){c.strokeStyle='#567f85';c.lineWidth=.85;c.lineCap='round';c.beginPath();for(const[a,b,bit]of[[1,2,1],[2,3,2],[3,4,4]])if(tile.river&bit){c.moveTo(x+points[a][0],y+points[a][1]);c.lineTo(x+points[b][0],y+points[b][1]);}c.stroke();}
    if(activeLayers.resources&&tile.resource!==255){c.fillStyle='#846850';c.beginPath();c.arc(x,y,1.6,0,Math.PI*2);c.fill();}
    if(tile.wonder!==255){c.strokeStyle='#aa9162';c.lineWidth=.9;c.beginPath();c.moveTo(x,y-3);c.lineTo(x+2.5,y);c.lineTo(x,y+3);c.lineTo(x-2.5,y);c.closePath();c.stroke();}
    if(markedSet.has(i)){hex(c,x,y);c.fillStyle='#ad715036';c.fill();c.strokeStyle='#95664ea6';c.lineWidth=.85;c.stroke();}
  }
}
const mobileMedia=matchMedia('(max-width:600px), (max-width:1000px) and (pointer:coarse)');
function shownMap(){return !mobileMedia.matches&&preview&&!showOriginal?preview.map:current.map;}
function drawPlannedStarts(c,map){if(!layers.starts||mobileMedia.matches)return;c.textAlign='center';c.textBaseline='middle';c.font=`600 ${10/view.zoom}px -apple-system, sans-serif`;for(const start of map.startLocations.filter(s=>!s.cityState)){const {x,y}=center(map,start.y*map.width+start.x);c.fillStyle='#252c40';c.strokeStyle='#f2e8d6';c.lineWidth=1/view.zoom;c.beginPath();c.arc(x,y,9/view.zoom,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#d9b678';c.fillText(String(start.player+1),x,y+.5/view.zoom);}}
function renderMap(){ctx.setTransform(viewport.ratio,0,0,viewport.ratio,0,0);ctx.clearRect(0,0,viewport.width,viewport.height);ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.zoom,view.zoom);drawTiles(ctx,shownMap(),layers,mobileMedia.matches?[]:preview&&!showOriginal?preview.changed:[...highlight,...selection]);drawPlannedStarts(ctx,shownMap());ctx.restore();if($('zoom-level'))$('zoom-level').textContent=`${Math.round(view.zoom/view.fit*100)}%`;}
let fitActive=true;
const fitSelectors='.panel,.world-header,.view-actions,.shelf,.zoom,.map-meta,.preview-bar,.mobile-actions,.prototype-details,.footnote,.shelf-filter,.desktop-save,.desktop-map-actions';
function fittedView(){
  const bounds=canvas.getBoundingClientRect();if(!bounds.width||!bounds.height)return null;
  const sx=viewport.width/bounds.width,sy=viewport.height/bounds.height;
  const overlays=[...document.querySelectorAll(fitSelectors)].flatMap(el=>{
    const closed=el.closest('details:not([open])');
    if(closed&&!closed.querySelector('summary')?.contains(el))return [];
    const r=el.getBoundingClientRect();if(!r.width||!r.height||getComputedStyle(el).visibility==='hidden')return [];
    return [{left:(r.left-bounds.left)*sx,top:(r.top-bounds.top)*sy,right:(r.right-bounds.left)*sx,bottom:(r.bottom-bounds.top)*sy}];
  });
  const footprint=window.V3MapFit.hexBounds(current.map.width,current.map.height);if(!footprint)return null;
  return window.V3MapFit.solve({width:viewport.width,height:viewport.height,mapWidth:footprint.width,mapHeight:footprint.height,mapLeft:footprint.left,mapTop:footprint.top,overlays,padding:mobileMedia.matches?20:32});
}
function fitMap(report=false){const next=fittedView();if(!next){fitActive=false;if(report)toast('Make the window larger to fit the map between the controls.');return false;}fitActive=true;view={...view,x:next.x,y:next.y,zoom:next.zoom,fit:next.zoom};renderMap();return true;}
let canvasSized=false,fitRefreshFrame=0;
function refreshFitReference(){if(!canvasSized)return;if(fitActive){fitMap();return;}const next=fittedView();if(next)view.fit=next.zoom;renderMap();}
function scheduleFitRefresh(){if(fitRefreshFrame)return;fitRefreshFrame=requestAnimationFrame(()=>{fitRefreshFrame=0;refreshFitReference();});}
new ResizeObserver(([entry])=>{
  const old={...viewport};viewport={width:entry.contentRect.width,height:entry.contentRect.height,ratio:Math.min(devicePixelRatio||1,2)};
  canvas.width=Math.round(viewport.width*viewport.ratio);canvas.height=Math.round(viewport.height*viewport.ratio);
  if(!canvasSized){canvasSized=true;fitMap();return;}if(fitActive){fitMap();return;}
  view.x+=(viewport.width-old.width)/2;view.y+=(viewport.height-old.height)/2;refreshFitReference();
}).observe($('map-stage'));
window.addEventListener('v3:sidebar-fit',scheduleFitRefresh);
document.querySelector('.prototype-info')?.addEventListener('toggle',scheduleFitRefresh);
const controlsObserver=new ResizeObserver(scheduleFitRefresh);
for(const el of document.querySelectorAll(fitSelectors))controlsObserver.observe(el);
function zoom(factor,anchor={x:viewport.width/2,y:viewport.height/2}){fitActive=false;const next=Math.max(view.fit/32,Math.min(view.fit*32,view.zoom*factor));view.x=anchor.x-(anchor.x-view.x)*next/view.zoom;view.y=anchor.y-(anchor.y-view.y)*next/view.zoom;view.zoom=next;renderMap();}
function tileAt(event){const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left-view.x)/view.zoom,y=(event.clientY-rect.top-view.y)/view.zoom;const row=current.map.height-1-Math.round((y-10)/15),col=Math.round((x-10)/(Math.sqrt(3)*10)-(row%2)*.5);return row>=0&&row<current.map.height&&col>=0&&col<current.map.width?row*current.map.width+col:null;}
function updateSelection(){document.querySelector('#map-stage').classList.toggle('selecting',selectMode);$('select-area').setAttribute('aria-pressed',String(selectMode));$('edit-scope').textContent=selection.length?`${selection.length} tiles`:'Auto area';$('clear-area').hidden=!selection.length;$('selection-hint').hidden=!selectMode;if(!$('map-scale'))$('selection-hint').parentElement.hidden=!selectMode;$('selection-hint').textContent=selection.length?`${selection.length} tiles selected`:'Drag to select tiles';renderMap();}
$('select-area').onclick=()=>{if(guardPreview())return;selectMode=!selectMode;updateSelection();};
$('clear-area').onclick=()=>{selection=[];updateSelection();};
canvas.addEventListener('pointerdown',e=>{if(historyBusy)return;fitActive=false;canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,startX:view.x,startY:view.y,anchor:tileAt(e)};if(selectMode&&!preview&&drag.anchor!==null){selection=[drag.anchor];updateSelection();}});
canvas.addEventListener('pointermove',e=>{if(!drag)return;if(selectMode&&!preview){const end=tileAt(e);if(end===null||drag.anchor===null)return;const w=current.map.width,x0=Math.min(end%w,drag.anchor%w),x1=Math.max(end%w,drag.anchor%w),y0=Math.min(Math.floor(end/w),Math.floor(drag.anchor/w)),y1=Math.max(Math.floor(end/w),Math.floor(drag.anchor/w));selection=[];for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)selection.push(y*w+x);updateSelection();}else{view.x=drag.startX+e.clientX-drag.x;view.y=drag.startY+e.clientY-drag.y;renderMap();}});
for(const event of['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?viewport.height:1,dx=e.deltaX*unit,dy=e.deltaY*unit;if(e.shiftKey||Math.abs(dx)>Math.abs(dy)){fitActive=false;view.x-=dx||dy;renderMap();return;}const r=canvas.getBoundingClientRect();zoom(Math.exp(-Math.max(-600,Math.min(600,dy))*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
canvas.addEventListener('keydown',e=>{if(['+','=','-','0'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoom(1.2);if(e.key==='-')zoom(.8);if(e.key==='0')fitMap(true);});
if($('zoom-in'))$('zoom-in').onclick=()=>zoom(1.2);if($('zoom-out'))$('zoom-out').onclick=()=>zoom(.8);if($('fit'))$('fit').onclick=()=>fitMap(true);
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function guardPreview(){if(generationPending){toast('Finish or cancel generation first.');return true;}if(historyBusy){toast('Local history is busy. Try again in a moment.');return true;}if(!preview)return false;toast('Keep or discard the proposed change first.');return true;}
function setMode(next){
  mode=next;
  for(const workspace of ['generate','refine']){const inactive=next!==workspace,panel=$(`${workspace}-panel`);panel.hidden=inactive;panel.inert=inactive;panel.setAttribute('aria-hidden',String(inactive));$(`${workspace}-tab`).setAttribute('aria-selected',String(!inactive));}
  const actions=document.querySelector('.panel-actions');actions.inert=next!=='generate';actions.setAttribute('aria-hidden',String(next!=='generate'));
  document.querySelector('.panel').classList.toggle('refine',next==='refine');
  if(next==='generate'){selectMode=false;selection=[];updateSelection();}
  document.dispatchEvent(new CustomEvent('v3-workspace-change',{detail:next}));
}
$('generate-tab').onclick=()=>setMode('generate');$('refine-tab').onclick=()=>setMode('refine');
document.querySelector('.modes').setAttribute('role','tablist');
document.querySelectorAll('.modes button').forEach(button=>button.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const next=mode==='generate'?'refine':'generate';setMode(next);$(`${next}-tab`).focus();}});
function setCurrent(world){current=world;updateGenerationSummary();issues=[];highlight=[];selection=[];selectMode=false;$('issues').hidden=true;$('issue-count').textContent='Not checked';$('check-terrain').disabled=false;$('world-title').textContent=world.title;if($('map-scale'))$('map-scale').textContent=`${world.map.width} × ${world.map.height}`;$('map').setAttribute('aria-label',`Map of ${world.title}. Drag to pan or select an area in Refine.`);$('import-note').hidden=world.source!=='imported';$('import-note').textContent=world.filename||'';renderShelf();updateKeep();updateSelection();fitMap();if(historyStore&&historyLoaded&&world.historyId)historyStore.select(world.historyId).catch(()=>toast('Could not remember the selected snapshot.'));}
const thumbnailCache=new WeakMap();
function paintThumbnail(target,world){
  let cached=thumbnailCache.get(world);
  if(!cached){cached=document.createElement('canvas');cached.width=192;cached.height=112;const context=cached.getContext('2d'),bounds=window.V3MapFit.hexBounds(world.map.width,world.map.height),fit=window.V3MapFit.solve({width:192,height:112,mapWidth:bounds.width,mapHeight:bounds.height,mapLeft:bounds.left,mapTop:bounds.top,padding:1});context.translate(fit.x,fit.y);context.scale(fit.zoom,fit.zoom);drawTiles(context,world.map,{relief:true,vegetation:false,resources:false,grid:false});thumbnailCache.set(world,cached);}
  target.getContext('2d').drawImage(cached,0,0);
}
const thumbnailWorlds=new WeakMap();
const thumbnailObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const world=thumbnailWorlds.get(entry.target);if(world)paintThumbnail(entry.target,world);thumbnailObserver.unobserve(entry.target);}},{root:$('world-list'),rootMargin:'100px'});
function renderShelf(){
  thumbnailObserver.disconnect();
  const count=history.filter(w=>w.kept).length;if(!count)showKept=false;
  const filter=$('kept-only');if(filter){filter.disabled=!count;filter.setAttribute('aria-pressed',String(showKept));filter.setAttribute('aria-label',showKept?'Show all maps':'Show kept maps');filter.title=showKept?'Show all maps':'Show kept maps';}
  // Reverse a display copy; storage stays oldest-first for retention.
  const worlds=history.filter(w=>!showKept||w.kept).reverse(),list=$('world-list'),restoreFocus=list.contains(document.activeElement);list.replaceChildren();
  for(const world of worlds){
    const b=document.createElement('button');b.className=`world-card${world===current?' current':''}`;b.setAttribute('aria-label',`Restore ${world.title} — ${world.change}${$('keep-world')&&world.kept?', kept':''}`);b.title=`${world.title} · ${world.change}`;b.setAttribute('aria-pressed',String(world===current));
    const c=document.createElement('canvas');c.width=192;c.height=112;c.setAttribute('aria-hidden','true');b.append(c);thumbnailWorlds.set(c,world);
    if($('keep-world')&&world.kept){const mark=document.createElement('span');mark.className='saved-dot';mark.setAttribute('aria-hidden','true');b.append(mark);}
    b.onclick=()=>{if(!guardPreview())setCurrent(world);};list.append(b);thumbnailObserver.observe(c);
  }
  if(restoreFocus)list.querySelector('.current')?.focus({preventScroll:true});
}
function busyHistory(busy){historyBusy=busy;document.body.setAttribute('aria-busy',String(busy||generationPending));for(const id of ['mobile-save','desktop-save'])if($(id))$(id).setAttribute('aria-disabled',String(busy||generationPending));for(const id of ['surprise','randomise-all','mobile-randomise','accept','discard','keep-world'])if($(id))$(id).disabled=busy||(generationPending&&!['surprise','mobile-randomise'].includes(id));for(const input of document.querySelectorAll('.panel select,.panel input'))input.disabled=busy||generationPending;}
async function addSnapshot(world){
  if(historyBusy)return false;busyHistory(true);
  try{
    if(historyStore){const result=await historyStore.add(world);Object.assign(world,result.world);const retained=new Set(result.keys);history=history.filter(item=>retained.has(item.historyId));history.push(world);}
    else{if(history.length>=HISTORY_LIMIT){const oldest=$('keep-world')?history.findIndex(item=>!item.kept):0;if(oldest<0){toast('History has 100 kept maps. Unkeep one to add another.');return false;}history.splice(oldest,1);}history.push(world);}
    return true;
  }catch(error){toast(error.code==='HISTORY_FULL'?error.message:'Could not save this snapshot locally. The accepted map is unchanged.');return false;}
  finally{busyHistory(false);}
}
async function initialiseHistory(){
  if(document.body.dataset.historyPersistence!=='browser'){historyLoaded=true;return;}
  busyHistory(true);
  try{
    historyStore=window.V3SnapshotStore.create();const saved=await historyStore.load();
    if(saved.history.length){history=saved.history;serial=Math.max(serial,...history.map(item=>item.uid||0));current=history.find(item=>item.historyId===saved.activeId)||history[history.length-1];}
    else{const result=await historyStore.add(current);Object.assign(current,result.world);history=[current];}
    historyLoaded=true;setCurrent(current);
  }catch{historyStore=null;historyLoaded=true;toast('Local history is unavailable. Maps will remain in this session only.');}
  finally{busyHistory(false);}
}

function updateKeep(){if(!$('keep-world'))return;$('keep-world').setAttribute('aria-pressed',String(current.kept));$('keep-world').setAttribute('aria-label',current.kept?'Remove from kept maps':'Keep map');$('keep-world').textContent=current.kept?'Kept':'Keep';}
async function toggleKeep(){if(guardPreview())return;const kept=!current.kept;busyHistory(true);try{if(historyStore&&current.historyId)await historyStore.setKept(current.historyId,kept);current.kept=kept;updateKeep();renderShelf();}catch{toast('Could not update the kept snapshot.');}finally{busyHistory(false);}}
if($('keep-world'))$('keep-world').onclick=toggleKeep;
if($('kept-only'))$('kept-only').onclick=()=>{showKept=!showKept;$('kept-only').setAttribute('aria-pressed',String(showKept));renderShelf();};
function updateGenerationSummary(){const info=$('generation-summary');if(!info)return;const v=current.v3;if(!v){info.textContent=current.source==='imported'?'Imported map. Tile checks and corrections run locally.':'Example map. Generate creates a new world locally.';return;}info.textContent=`${v.version!=='3'?'Created with an earlier generator. Generate again for updated geography. ':''}${v.plan.premise}. Seed ${v.request.seed}. ${v.state==='STALE'?'Edited since generation; the original balance assessment is out of date.':`${v.assessment.starts.length} starting regions checked. ${v.assessment.warnings.join(' ')}`} Civ V assigns starts when loading an ordinary map file.`;}
function generationUI(progress){for(const id of ['generation-status','mobile-status'])if($(id)){$(id).hidden=!generationPending;$(id).textContent=progress?.label||'Generating';}$('surprise').innerHTML=generationPending?'Cancel generation':'<span data-icon="shuffle"></span>Generate';icons($('surprise'));if($('mobile-randomise'))$('mobile-randomise').textContent=generationPending?'Cancel':'Randomise';busyHistory(historyBusy);}
async function runGeneration(request,reflectSettings=false){if(generationPending){window.V3Generator.cancel();return;}if(guardPreview())return;generationPending=true;generationUI();try{const result=await window.V3Generator.generate(request,generationUI);generationPending=false;const world={uid:++serial,id:`generated-${serial}`,title:result.map.name,map:result.map,source:'generated',change:'Generated world',seed:result.provenance.request.seed,generationRequest:result.provenance.request,v3:result.provenance};if(await addSnapshot(world)){if(reflectSettings&&result.provenance.request.mode==='STANDARD')window.V3GenerationControls.applyStandard(result.provenance.request.parameters);setCurrent(world);if(result.provenance.assessment.warnings.length)toast(result.provenance.assessment.warnings[0]);}}catch(error){toast(error.name==='AbortError'?'Generation cancelled.':error.message);}finally{generationPending=false;generationUI();}}
$('surprise').onclick=()=>runGeneration(window.V3GenerationControls.read());
if($('randomise-all'))$('randomise-all').onclick=()=>runGeneration({mode:'RANDOMISE',fullSizeRange:true},true);
$('layers-button').onclick=()=>{const open=$('layers-menu').hidden;$('layers-menu').hidden=!open;$('layers-button').setAttribute('aria-expanded',String(open));};
document.querySelectorAll('[data-layer]').forEach(input=>input.onchange=()=>{layers[input.dataset.layer]=input.checked;renderMap();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('layers-menu').hidden=true;$('layers-button').setAttribute('aria-expanded','false');}});

function changedTiles(map){return map.tiles.flatMap((tile,i)=>JSON.stringify(tile)!==JSON.stringify(current.map.tiles[i])?[i]:[]);}
function startPreview(map,title,detail,kind){const changed=changedTiles(map);if(!changed.length){toast('There are no changes to preview.');return;}preview={map,title,detail,changed,kind};showOriginal=false;$('preview-bar').hidden=false;$('preview-title').textContent=title;$('preview-detail').textContent=`${changed.length} tile${changed.length===1?'':'s'}${detail?' · '+detail:''}`;$('compare').textContent='Show original';$('compare').setAttribute('aria-pressed','false');renderMap();if(innerWidth<761)$('preview-bar').scrollIntoView({block:'center',behavior:'instant'});}
function endPreview(){preview=null;showOriginal=false;$('preview-bar').hidden=true;highlight=[];renderMap();}
$('compare').onclick=()=>{showOriginal=!showOriginal;$('compare').textContent=showOriginal?'Show proposed':'Show original';$('compare').setAttribute('aria-pressed',String(showOriginal));renderMap();};
$('discard').onclick=()=>{endPreview();};
$('accept').onclick=async()=>{const accepted={...current,map:preview.map,uid:++serial,kept:false,change:preview.title,...(current.v3?{v3:{...current.v3,state:'STALE'}}:{})};if(accepted.map.structure){accepted.map.structure={...accepted.map.structure,evidenceState:'STALE',staleReason:'Map edited in Refine; reassessment is required.'};}if(!await addSnapshot(accepted))return;const repaired=preview.kind==='repair';endPreview();setCurrent(accepted);if(repaired)checkTerrain();};
function nudge(kind){if(guardPreview())return;const map=structuredClone(current.map),forest=map.features.findIndex(f=>f==='FEATURE_FOREST'),area=new Set(selection);const candidates=map.tiles.flatMap((t,i)=>(!area.size||area.has(i))&&!window.V3ExistingRules.isWaterTerrain(map,t)&&t.wonder===255&&(kind==='pass'?t.elevation===2:t.elevation<2&&t.feature===255&&/GRASS|PLAINS|TUNDRA/.test(map.terrains[t.terrain]||''))?[i]:[]);if(!candidates.length||(kind==='green'&&forest<0)){toast('No suitable tiles in this area.');return;}const cx=map.width*.56,cy=map.height*.48;candidates.sort((a,b)=>(a%map.width-cx)**2+(Math.floor(a/map.width)-cy)**2-((b%map.width-cx)**2+(Math.floor(b/map.width)-cy)**2));const anchor=candidates[0],near=area.size?candidates:candidates.filter(i=>Math.hypot(i%map.width-anchor%map.width,Math.floor(i/map.width)-Math.floor(anchor/map.width))<5).slice(0,kind==='pass'?5:22);for(const i of near){if(kind==='pass')map.tiles[i].elevation=1;else map.tiles[i].feature=forest;}startPreview(map,kind==='pass'?'Lower mountains':'Add woodland','','tweak');}
document.querySelectorAll('[data-tweak]').forEach(b=>b.onclick=()=>nudge(b.dataset.tweak));
function selectedIssues(){return [...$('issues').querySelectorAll('input:checked')].map(i=>i.value);}
function renderIssues(){const box=$('issues');box.hidden=false;box.replaceChildren();if(!issues.length){const p=document.createElement('p');p.className='issue-message';p.textContent='No tile-placement issues.';box.append(p);return;}for(const issue of issues.slice(0,100)){const label=document.createElement('label');label.className='issue-row';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.value=issue.id;const body=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=issue.detail;detail.textContent=`${issue.index%current.map.width}, ${Math.floor(issue.index/current.map.width)} · ${issue.id.startsWith('relief-')?'Flatten water':issue.id.startsWith('resource-')?'Remove resource':issue.id.startsWith('wonder-')?'Remove wonder':'Remove feature'}`;body.append(title,detail);label.append(checkbox,body);box.append(label);checkbox.onchange=()=>{$('preview-repairs').disabled=!selectedIssues().length;highlight=issues.filter(i=>selectedIssues().includes(i.id)).map(i=>i.index);renderMap();};}const count=document.createElement('p');count.className='issues-footer';count.textContent=issues.length>100?'First 100 findings. Recheck after applying.':'';const button=document.createElement('button');button.id='preview-repairs';button.className='primary full';button.textContent='Preview corrections';button.onclick=()=>{if(guardPreview())return;const ids=selectedIssues(),removals=issues.filter(i=>ids.includes(i.id)&&!i.id.startsWith('relief-')).length;startPreview(window.V3ExistingRules.repair(current.map,ids),'Terrain corrections',`${removals} item${removals===1?'':'s'} removed`,'repair');};box.append(count,button);}
function checkTerrain(){if(guardPreview())return;issues=window.V3ExistingRules.inspect(current.map);$('issue-count').textContent=issues.length?`${issues.length} finding${issues.length===1?'':'s'}`:'Checks clear';highlight=issues.map(i=>i.index);renderIssues();renderMap();}
$('check-terrain').onclick=checkTerrain;
$('import-map').onclick=()=>{if(!guardPreview())$('map-file').click();};
async function importFile(file){if(guardPreview())return;if(!file||!file.name.toLowerCase().endsWith('.civ5map')){toast('Choose a .Civ5Map file.');return;}if(file.size>32*1024*1024){toast('This prototype supports files up to 32 MB.');return;}try{const bytes=await file.arrayBuffer();if(bytes.byteLength>=9){const header=new DataView(bytes);if(header.getUint32(1,true)*header.getUint32(5,true)>20000)throw new Error('This prototype supports maps up to 20,000 tiles.');}const map=window.V3ExistingRules.parse(bytes,file.name);const world={uid:++serial,id:`import-${serial}`,title:map.name||file.name.replace(/\.civ5map$/i,''),subtitle:'An existing world, ready for a light touch.',description:'Explore the geography you brought with you. Preview small adjustments or inspect incompatible tile placements before making a correction.',premise:'Your own map',seed:'Imported',tags:['Imported locally','Original retained','Ready to refine'],source:'imported',filename:file.name,originalBytes:bytes,kept:false,change:'Imported original',map};if(!await addSnapshot(world))return;setMode('refine');setCurrent(world);checkTerrain();}catch(error){toast(`Could not open this map. ${error.message}`);}finally{$('map-file').value='';}}
$('map-file').onchange=e=>importFile(e.target.files[0]);
$('example-map').onclick=async()=>{if(guardPreview())return;const world=sampleWorld(samples[0]);world.source='example';world.title='The Old Survey';world.subtitle='A familiar world with a few rough edges.';world.premise='Imported example';world.description='An example survey with deliberately misplaced content. Review the highlighted tiles, choose corrections and compare the result before keeping it.';world.tags=['Example import','Placement issues','Preview corrections'];world.change='Example with issues';const m=world.map,forest=m.features.findIndex(f=>f==='FEATURE_FOREST'),wheat=m.resources.findIndex(r=>r==='RESOURCE_WHEAT');const water=m.tiles.findIndex(t=>window.V3ExistingRules.isWaterTerrain(m,t)),hill=m.tiles.findIndex(t=>!window.V3ExistingRules.isWaterTerrain(m,t)&&t.elevation===1&&t.wonder===255);m.tiles[water].feature=forest;m.tiles[water].elevation=1;if(hill>=0&&wheat>=0){m.tiles[hill].resource=wheat;m.tiles[hill].resourceAmount=1;}if(!await addSnapshot(world))return;setCurrent(world);checkTerrain();document.querySelector('.prototype-info').open=false;setMode('refine');};
let dropDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dropDepth++;$('drop-target').hidden=false;}});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{dropDepth=Math.max(0,dropDepth-1);if(!dropDepth)$('drop-target').hidden=true;});
document.addEventListener('drop',e=>{e.preventDefault();dropDepth=0;$('drop-target').hidden=true;importFile(e.dataTransfer.files[0]);});
setCurrent(current);

window.V3Mobile={
  async randomise(){if(historyBusy)return;if(!generationPending)endPreview();return runGeneration({mode:'RANDOMISE'});},
  downloadRecord(){const bytes=window.V3ExistingRules.save(current.map,current.originalBytes);return {bytes,name:(current.map.name||'Excogitare map').replace(/[\\/:*?"<>|]/g,'-')+'.Civ5Map'};},
  refresh(){selectMode=false;selection=[];updateSelection();fitMap();}
};

new MutationObserver(()=>{const list=$('world-list');if(list.getBoundingClientRect().width&&list.getBoundingClientRect().height)list.querySelector('.current')?.scrollIntoView({block:'nearest',inline:'nearest'});}).observe($('world-list'),{childList:true});

initialiseHistory();

$('world-list').addEventListener('keydown',event=>{const vertical=getComputedStyle($('world-list')).flexDirection==='column',previous=vertical?'ArrowUp':'ArrowLeft',next=vertical?'ArrowDown':'ArrowRight';if(![previous,next,'Home','End'].includes(event.key))return;const cards=[...$('world-list').querySelectorAll('.world-card')],index=cards.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?cards.length-1:Math.max(0,Math.min(cards.length-1,index+(event.key===next?1:-1)));cards[target]?.focus();});
