/* Interface studies only: analytical colours are illustrative, not generator diagnostics. */
(() => {
  const design=document.body.dataset.layerStudy;
  const trigger=$('layers-button'),panel=$('layers-menu'),shelf=document.querySelector('.shelf');
  const paths={land:'m2 20 7-14 5 9 3-6 5 11ZM6 12l3 2 3-2',wood:'M12 2 5 12h4l-5 6h7v4h2v-4h7l-5-6h4Z',wet:'M4 18h16M6 15V8m6 7V5m6 10V9',water:'M3 7c4-5 6 5 10 0s6 4 8 0M3 15c4-5 6 5 10 0s6 4 8 0',ice:'m12 2 0 20M3 7l18 10M3 17 21 7',bonus:'M12 22V3M12 9C5 9 5 5 5 3c6 0 7 3 7 6Zm0 6c7 0 7-4 7-6-6 0-7 3-7 6Z',luxury:'m3 8 5-5h8l5 5-9 13Zm0 0h18M8 3l4 18 4-18',strategic:'m4 15 5-8h10l3 8-5 5H7Zm0 0h18M9 7l-2 13m12-13-2 13',start:'M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13ZM9 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0',city:'M3 21h18M5 21V9h6v12m0-16h8v16M6 5h3M14 9h2m-2 5h2',wonder:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',grid:'m12 2 9 5v10l-9 5-9-5V7Zm-9 5 9 5 9-5m-9 5v10',coordinates:'M3 12h18M12 3v18M6 6h12v12H6Z',issues:'m12 3 10 18H2Zm0 5v6m0 3v1',close:'m6 6 12 12M6 18 18 6',layers:'m12 3 10 6-10 6L2 9Zm-10 10 10 6 10-6M2 17l10 6 10-6',fish:'M3 12c5-8 10-8 15 0-5 8-10 8-15 0Zm15 0 4-5v10Z',horse:'m6 21 2-10-3-2 6-7 7 4 2 15M11 2v5h5',oil:'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z'};
  const svg=key=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key]||paths.land}"/></svg>`;
  const groups=[
    {id:'landscape',label:'Landscape',short:'Land',items:[['relief','Hills & mountains','land'],['woods','Forest & jungle','wood'],['wetlands','Marsh, floodplains & oases','wet']]},
    {id:'water',label:'Water',short:'Water',items:[['rivers','Rivers','water'],['lakes','Lakes','water'],['ice','Sea ice','ice']]},
    {id:'resources',label:'Resources',short:'Resources',items:[['bonus','Bonus','bonus'],['luxury','Luxury','luxury'],['strategic','Strategic','strategic']]},
    {id:'starts',label:'Starts & landmarks',short:'Starts',items:[['players','Planned player starts','start'],['cities','City-state starts','city'],['wonders','Natural wonders','wonder']]},
    {id:'guides',label:'Guides',short:'Guides',items:[['grid','Hex grid','grid'],['coordinates','Tile coordinates','coordinates'],['issues','Terrain issues','issues']]}
  ];
  const enabled={relief:true,woods:true,wetlands:true,rivers:true,lakes:true,ice:true,bonus:false,luxury:true,strategic:true,players:true,cities:true,wonders:true,grid:false,coordinates:false,issues:false};
  const viewNames={normal:'Normal',movement:'Movement',freshwater:'Freshwater',settlement:'Settlement potential',balance:'Starting balance'};
  let mapView='normal',selectedGroup='resources',dockTab='display',pinned=false,inspected=null,lastMap=null,hoverFrame=0;
  const cache=new WeakMap(),controls=[];
  const name=value=>(value||'').replace(/^(TERRAIN|FEATURE|RESOURCE)_/,'').toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  function resourceKind(value){return /WHEAT|CATTLE|SHEEP|DEER|FISH|STONE|BANANA|BISON/.test(value)?'bonus':/IRON|HORSE|COAL|OIL|ALUMINUM|URANIUM/.test(value)?'strategic':'luxury';}
  function resourceSymbol(value){return /FISH|WHALE|PEARL|CRAB/.test(value)?'fish':/HORSE/.test(value)?'horse':/OIL/.test(value)?'oil':resourceKind(value);}
  function data(map){
    if(cache.has(map))return cache.get(map);
    const counts=Object.fromEntries(groups.flatMap(g=>g.items.map(([key])=>[key,0]))),water=new Set(),lakes=new Set(),seen=new Set();
    for(let i=0;i<map.tiles.length;i++)if(/OCEAN|COAST/.test(map.terrains[map.tiles[i].terrain]))water.add(i);
    // Small enclosed water components stand in for a lake classification in these studies.
    for(const start of water){if(seen.has(start))continue;const part=[start];seen.add(start);let edge=false;for(let j=0;j<part.length;j++){
      const i=part[j],x=i%map.width,y=Math.floor(i/map.width);if(!x||x===map.width-1||!y||y===map.height-1)edge=true;
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[(y%2?1:-1),-1],[(y%2?1:-1),1]]){const nx=x+dx,ny=y+dy,ni=ny*map.width+nx;if(nx>=0&&nx<map.width&&ny>=0&&ny<map.height&&water.has(ni)&&!seen.has(ni)){seen.add(ni);part.push(ni);}}
    }if(!edge&&part.length<map.tiles.length*.025){counts.lakes++;part.forEach(i=>lakes.add(i));}}
    map.tiles.forEach(tile=>{const feature=map.features[tile.feature]||'';if(tile.elevation>0)counts.relief++;if(/FOREST|JUNGLE/.test(feature))counts.woods++;if(/MARSH|FLOOD|OASIS/.test(feature))counts.wetlands++;if(/ICE/.test(feature))counts.ice++;if(tile.river&7)counts.rivers++;if(tile.resource!==255)counts[resourceKind(map.resources[tile.resource]||'')]++;if(tile.wonder!==255)counts.wonders++;});
    counts.players=map.startLocations.filter(s=>!s.cityState).length;counts.cities=map.startLocations.filter(s=>s.cityState).length;
    const findings=window.V3ExistingRules.inspect(map),illegal=new Set(findings.map(f=>f.index));counts.issues=illegal.size;
    const result={counts,water,lakes,findings,illegal};cache.set(map,result);return result;
  }
  function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  panel.className='integration-panel';panel.replaceChildren();panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','Map display');document.body.append(panel);
  trigger.innerHTML=svg('layers')+'<span>Layers</span>';trigger.setAttribute('aria-haspopup','dialog');
  const header=el('header','integration-header'),heading=el('h3','',design==='dock'?'Map dock':'Map display'),closeButton=el('button','close-display');closeButton.type='button';closeButton.innerHTML=svg('close');closeButton.setAttribute('aria-label','Close map display');header.append(heading,closeButton);
  const picker=el('label','view-picker'),select=el('select');select.setAttribute('aria-label','Map view');for(const [key,title] of Object.entries(viewNames)){const option=el('option','',title);option.value=key;select.append(option);}picker.append(el('span','','Map view'),select);
  const sections=el('div','layer-sections');
  function row([key,title,icon]){const label=el('label','display-choice'),symbol=el('span'),text=el('span','choice-title',title),count=el('span','count'),input=el('input');label.dataset.key=key;symbol.innerHTML=svg(icon);input.type='checkbox';input.checked=enabled[key];input.setAttribute('aria-label',title);input.dataset.displayLayer=key;input.onchange=()=>{enabled[key]=input.checked;syncControls();renderMap();};label.append(symbol,text,count,input);controls.push({key,count,input});return label;}
  for(const group of groups){const details=el('details','layer-section'),summary=el('summary'),active=el('span','section-count'),list=el('div','layer-options');details.dataset.group=group.id;details.open=group.id==='resources'||(design==='palette'&&group.id==='starts');summary.append(el('span','section-label',group.label),active,el('span','section-caret'));details.append(summary,list);group.items.forEach(item=>list.append(row(item)));sections.append(details);}
  const inspector=el('aside','tile-inspector');inspector.setAttribute('aria-label','Tile details');
  const inspectorHeader=el('header'),tilePosition=el('span'),unpin=el('button','','Pin tile');unpin.type='button';unpin.setAttribute('aria-pressed','false');inspectorHeader.append(tilePosition,unpin);
  const tileTitle=el('h4'),tileFeature=el('p'),tileResource=el('p','tile-resource'),tileIssue=el('p'),hint=el('p','inspector-hint','Hover a tile · click the map to pin');inspector.append(inspectorHeader,tileTitle,tileFeature,tileResource,tileIssue,hint);
  const legend=el('div','analysis-legend');legend.hidden=true;document.body.append(legend);
  const historyPane=el('div','dock-history'),historyGrid=el('div','dock-history-grid');historyPane.append(el('p','','Recent maps · this preview session'),historyGrid);historyPane.hidden=true;
  const dockDisplay=el('div','dock-display');let toolbar=null,dockTabs=null;
  if(design==='toolbar'){
    toolbar=el('div','canvas-toolstrip');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Map display toolbar');toolbar.append(picker);
    for(const group of groups){const button=el('button','',group.short);button.type='button';button.dataset.groupButton=group.id;button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');button.onclick=()=>{if(!panel.hidden&&selectedGroup===group.id)close();else{selectedGroup=group.id;renderToolbarPanel();open();}};toolbar.append(button);}
    document.body.append(toolbar,inspector);document.querySelector('.canvas-layers').style.visibility='hidden';
  }else if(design==='dock'){
    dockTabs=el('div','dock-tabs');dockTabs.setAttribute('role','tablist');dockTabs.setAttribute('aria-label','Map dock');
    for(const [key,label] of [['display','Display'],['history','History']]){const button=el('button','',label);button.type='button';button.id=`dock-${key}-tab`;button.dataset.dockTab=key;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(key==='display'));button.setAttribute('aria-controls',`dock-${key}-panel`);button.onclick=()=>setDockTab(key);button.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setDockTab(key==='display'?'history':'display');dockTabs.querySelector('[aria-selected=true]').focus();}};dockTabs.append(button);}
    dockDisplay.id='dock-display-panel';dockDisplay.setAttribute('role','tabpanel');dockDisplay.setAttribute('aria-labelledby','dock-display-tab');historyPane.id='dock-history-panel';historyPane.setAttribute('role','tabpanel');historyPane.setAttribute('aria-labelledby','dock-history-tab');
    dockDisplay.append(picker,sections,inspector);panel.append(header,dockTabs,dockDisplay,historyPane);
  }else{
    for(const detail of [...sections.children]){const group=groups.find(g=>g.id===detail.dataset.group),section=el('section','layer-section');section.dataset.group=group.id;section.append(el('h4','palette-group-heading',group.label),detail.querySelector('.layer-options'));detail.replaceWith(section);}
    for(const control of controls)control.input.setAttribute('role','switch');
    panel.setAttribute('aria-label','Layers');panel.append(picker,sections);unpin.remove();hint.remove();inspector.hidden=true;document.body.append(inspector);
  }
  function syncControls(){const {counts}=data(shownMap());for(const control of controls){control.input.checked=enabled[control.key];control.count.textContent=['grid','coordinates'].includes(control.key)?'':counts[control.key].toLocaleString();control.input.disabled=['cities','wonders','issues'].includes(control.key)&&counts[control.key]===0;}
    for(const detail of sections.children){const group=groups.find(g=>g.id===detail.dataset.group);const counter=detail.querySelector('.section-count');if(counter)counter.textContent=`${group.items.filter(([key])=>enabled[key]).length}/${group.items.length}`;}}
  function renderToolbarPanel(){const group=groups.find(g=>g.id===selectedGroup);panel.replaceChildren();const title=el('div','toolbar-section-title');title.append(el('strong','',group.label),el('span','','Show on map'));const options=el('div','toolbar-options');group.items.forEach(item=>options.append(row(item)));panel.append(title,options);if(group.id==='resources')panel.append(el('p','toolbar-help','Point to a resource to see its name and quantity.'));syncControls();}
  function setDockTab(key){dockTab=key;dockDisplay.hidden=key!=='display';historyPane.hidden=key!=='history';for(const b of dockTabs.children){b.setAttribute('aria-selected',String(b.dataset.dockTab===key));b.tabIndex=b.dataset.dockTab===key?0:-1;}if(key==='history')refreshHistory();}
  function refreshHistory(){historyGrid.replaceChildren();for(const original of document.querySelectorAll('#world-list .world-card')){const button=el('button'),source=original.querySelector('canvas'),copy=el('canvas');button.type='button';button.setAttribute('aria-label',original.getAttribute('aria-label'));button.setAttribute('aria-pressed',original.getAttribute('aria-pressed'));copy.width=source.width;copy.height=source.height;copy.getContext('2d').drawImage(source,0,0);button.append(copy);button.onclick=()=>{original.click();refreshHistory();};historyGrid.append(button);}}
  function position(){
    if(document.body.classList.contains('mobile-simple')){close();return;}
    const anchor=trigger.getBoundingClientRect(),leftPanel=document.querySelector('.panel').getBoundingClientRect(),title=$('world-title').getBoundingClientRect();
    const top=leftPanel.top,bottom=Math.min(innerHeight-24,leftPanel.bottom),available=Math.max(160,bottom-top);
    panel.style.maxHeight=`${available}px`;panel.style.height='';
    if(design==='toolbar'){
      const x=Math.max(leftPanel.right+24,title.left),width=Math.max(260,innerWidth-x-128);toolbar.style.left=`${x}px`;toolbar.style.top=`${title.bottom+12}px`;toolbar.style.width=`${width}px`;
      const rect=toolbar.getBoundingClientRect();panel.style.left=`${x}px`;panel.style.top=`${rect.bottom+8}px`;panel.style.width=`${Math.min(width,560)}px`;panel.style.maxHeight=`${Math.max(160,bottom-rect.bottom-16)}px`;
      inspector.style.left=`${x}px`;inspector.style.bottom='24px';
    }else if(design==='palette'){
      panel.style.left=`${Math.max(16,anchor.right-264)}px`;panel.style.top=`${anchor.bottom+8}px`;panel.style.maxHeight=`${Math.max(160,bottom-anchor.bottom-8)}px`;
      inspector.style.left=`${leftPanel.right+28}px`;inspector.style.bottom=`${innerHeight-$('desktop-save').getBoundingClientRect().bottom}px`;
    }else{panel.style.left=`${Math.max(16,innerWidth-304)}px`;panel.style.top=`${top}px`;panel.style.height=`${available}px`;}

    legend.style.left=`${leftPanel.right+28}px`;legend.style.bottom=design==='toolbar'?'164px':'24px';
  }
  function close(restore=false){panel.hidden=true;document.body.classList.remove('display-open');trigger.setAttribute('aria-expanded','false');shelf.inert=false;if(toolbar)for(const b of toolbar.querySelectorAll('button'))b.setAttribute('aria-expanded','false');if(restore)(toolbar?.querySelector(`[data-group-button="${selectedGroup}"]`)||trigger).focus();}
  function open(){panel.hidden=false;document.body.classList.add('display-open');trigger.setAttribute('aria-expanded','true');if(design==='dock')shelf.inert=true;if(toolbar)for(const b of toolbar.querySelectorAll('button'))b.setAttribute('aria-expanded',String(b.dataset.groupButton===selectedGroup));syncControls();position();}
  trigger.onclick=()=>panel.hidden?open():close();closeButton.onclick=()=>close(true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true);}},true);
  document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!trigger.contains(event.target)&&!toolbar?.contains(event.target)&&!inspector.contains(event.target)&&event.target!==canvas)close();});
  select.onchange=()=>{mapView=select.value;legend.hidden=mapView==='normal';legend.replaceChildren();if(mapView!=='normal'){const ends=mapView==='movement'?['Easy','Hard']:mapView==='freshwater'?['Dry','Water']:mapView==='balance'?['Near','Far']:['Low','High'];legend.append(el('strong','',viewNames[mapView]),el('span','legend-ends',ends[0]),el('span','legend-ramp'),el('span','legend-ends',ends[1]),el('small','','Illustrative'));}renderMap();position();};
  unpin.onclick=()=>{pinned=!pinned;updateInspector();};
  function updateInspector(){const map=shownMap();if(inspected===null||!map.tiles[inspected])inspected=map.tiles.map((t,i)=>({t,i})).filter(({t})=>t.resource!==255&&t.elevation<2).sort((a,b)=>Math.hypot(a.i%map.width-map.width/2,Math.floor(a.i/map.width)-map.height/2)-Math.hypot(b.i%map.width-map.width/2,Math.floor(b.i/map.width)-map.height/2))[0]?.i??0;if(inspected<0)inspected=0;const tile=map.tiles[inspected],feature=map.features[tile.feature],resource=map.resources[tile.resource],records=data(map).findings.filter(f=>f.index===inspected);tilePosition.textContent=`Tile ${inspected%map.width}, ${Math.floor(inspected/map.width)}`;unpin.textContent=pinned?'Unpin':'Pin tile';unpin.setAttribute('aria-pressed',String(pinned));tileTitle.textContent=`${name(map.terrains[tile.terrain])}${tile.elevation===2?' · Mountain':tile.elevation===1?' · Hills':''}`;tileFeature.textContent=[name(feature),tile.river&7?'River':''].filter(Boolean).join(' · ')||'Open terrain';tileResource.replaceChildren();if(resource){const symbol=el('span');symbol.innerHTML=svg(resourceSymbol(resource));tileResource.append(symbol,el('span','',`${name(resource)} · ${tile.resourceAmount||1}`));}else tileResource.textContent='No resource';tileIssue.textContent=records.length?`${records.length} placement issue${records.length===1?'':'s'}`:'No placement issues';tileIssue.hidden=!records.length;tileIssue.style.color='#9a613e';hint.textContent=pinned?'Pinned · select another tile to inspect':'Hover a tile · click the map to pin';}
  if(design==='palette'){
    let hoveredIndex=null;
    const hideInspector=()=>{if(hoverFrame)cancelAnimationFrame(hoverFrame);hoverFrame=0;hoveredIndex=null;inspector.hidden=true;};
    const hoverInspector=event=>{
      if(drag||document.elementFromPoint(event.clientX,event.clientY)!==canvas){hideInspector();return;}
      hoveredIndex=tileAt(event);if(hoveredIndex===null){hideInspector();return;}
      if(!hoverFrame)hoverFrame=requestAnimationFrame(()=>{hoverFrame=0;inspected=hoveredIndex;updateInspector();inspector.hidden=false;});
    };
    canvas.addEventListener('pointermove',hoverInspector);
    canvas.addEventListener('pointerup',hoverInspector);
    for(const event of ['pointerleave','pointerdown','pointercancel'])canvas.addEventListener(event,hideInspector);
    window.addEventListener('blur',hideInspector);
  }else{
    canvas.addEventListener('pointermove',event=>{if(pinned||drag||hoverFrame)return;const index=tileAt(event);if(index===null)return;hoverFrame=requestAnimationFrame(()=>{hoverFrame=0;inspected=index;updateInspector();});});
    let pointer=null;canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY};});canvas.addEventListener('pointerup',e=>{if(mode==='generate'&&pointer&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<4){const index=tileAt(e);if(index!==null){inspected=index;pinned=true;inspector.hidden=false;updateInspector();}}pointer=null;});
  }

  // Study renderer: existing tile data supplies geography and symbols. Analysis is illustrative.
  const originalDraw=drawTiles;
  drawPlannedStarts=function(){};
  const images={};for(const key of ['bonus','luxury','strategic','fish','horse','oil']){const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(svg(key).replace('currentColor',key==='luxury'?'#936e2e':key==='bonus'?'#596e48':'#415d70'));image.onload=()=>renderMap();images[key]=image;}
  drawTiles=function(c,map,activeLayers,marked=[]){
    if(c!==ctx){originalDraw(c,map,activeLayers,marked);return;}
    const info=data(map),filtered={...map,tiles:map.tiles.map((tile,i)=>{const feature=map.features[tile.feature]||'';const hideFeature=/FOREST|JUNGLE/.test(feature)?!enabled.woods:/ICE/.test(feature)?!enabled.ice:/MARSH|FLOOD|OASIS/.test(feature)?!enabled.wetlands:false;return {...tile,feature:hideFeature?255:tile.feature,river:enabled.rivers?tile.river:0,wonder:enabled.wonders?tile.wonder:255,terrain:!enabled.lakes&&info.lakes.has(i)?map.terrains.indexOf('TERRAIN_OCEAN'):tile.terrain};})};
    originalDraw(c,filtered,{relief:enabled.relief,vegetation:true,resources:false,grid:enabled.grid},marked);
    const size=Math.max(8,Math.min(12,9/view.zoom));
    if(mapView!=='normal')for(let i=0;i<map.tiles.length;i++){if(info.water.has(i))continue;const tile=map.tiles[i],feature=map.features[tile.feature]||'',terrainName=map.terrains[tile.terrain]||'',point=center(map,i);let score;
      if(mapView==='movement')score=Math.min(1,tile.elevation*.45+(/FOREST|JUNGLE|MARSH/.test(feature)?.3:0));
      else if(mapView==='freshwater')score=tile.river&7?1:0;
      else if(mapView==='settlement')score=Math.min(1,(/GRASS|PLAINS/.test(terrainName)?.5:.1)+(tile.resource!==255?.25:0)+(tile.river&7?.2:0)-(tile.elevation===2?.8:0));
      else score=Math.min(1,Math.min(...map.startLocations.filter(s=>!s.cityState).map(s=>Math.hypot(s.x-i%map.width,s.y-Math.floor(i/map.width))))/18);
      c.fillStyle=mapView==='freshwater'?(score?'#4b9fa7b0':'#d5cab179'):`hsla(${100-score*82},28%,${69-score*20}%,.67)`;hex(c,point.x,point.y);c.fill();
    }
    for(let i=0;i<map.tiles.length;i++){const tile=map.tiles[i],point=center(map,i);if(tile.resource!==255){const resource=map.resources[tile.resource]||'',kind=resourceKind(resource),image=images[resourceSymbol(resource)];if(enabled[kind]&&image.complete&&image.naturalWidth){c.fillStyle='#fffdf9d9';c.beginPath();c.arc(point.x,point.y,size*.55,0,Math.PI*2);c.fill();c.drawImage(image,point.x-size/2,point.y-size/2,size,size);}}
      if(enabled.issues&&info.illegal.has(i)){hex(c,point.x,point.y);c.strokeStyle='#a95e42';c.lineWidth=1.5/view.zoom;c.stroke();}
      if(enabled.coordinates&&view.zoom>1.3){c.font=`${4/view.zoom}px sans-serif`;c.textAlign='center';c.fillStyle='#252c40';c.fillText(`${i%map.width},${Math.floor(i/map.width)}`,point.x,point.y+5);}
    }
    for(const start of map.startLocations){if(!enabled[start.cityState?'cities':'players'])continue;const p=center(map,start.y*map.width+start.x),r=(start.cityState?6:9)/view.zoom;c.fillStyle=start.cityState?'#758369':'#252c40';c.strokeStyle='#f2e8d6';c.lineWidth=1/view.zoom;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();c.stroke();c.font=`500 ${10/view.zoom}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#f2e8d6';c.fillText(start.cityState?'•':String(start.player+1),p.x,p.y);}
    if(lastMap!==map){lastMap=map;pinned=false;inspected=null;queueMicrotask(()=>{syncControls();updateInspector();if(dockTab==='history')refreshHistory();});}
  };
  window.addEventListener('resize',position);window.addEventListener('v3:sidebar-fit',position);
  document.addEventListener('v3-workspace-change',()=>close());
  if(design==='toolbar')renderToolbarPanel();syncControls();updateInspector();
  requestAnimationFrame(()=>{open();renderMap();});
})();
