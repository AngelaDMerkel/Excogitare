/* Approved Layers palette; all changes are display-only. */
(() => {
  const paths={land:'m2 20 7-14 5 9 3-6 5 11ZM6 12l3 2 3-2',wood:'M12 2 5 12h4l-5 6h7v4h2v-4h7l-5-6h4Z',wet:'M4 18h16M6 15V8m6 7V5m6 10V9',water:'M3 7c4-5 6 5 10 0s6 4 8 0M3 15c4-5 6 5 10 0s6 4 8 0',ice:'m12 2 0 20M3 7l18 10M3 17 21 7',bonus:'M12 22V3M12 9C5 9 5 5 5 3c6 0 7 3 7 6Zm0 6c7 0 7-4 7-6-6 0-7 3-7 6Z',luxury:'m3 8 5-5h8l5 5-9 13Zm0 0h18M8 3l4 18 4-18',strategic:'m4 15 5-8h10l3 8-5 5H7Zm0 0h18M9 7l-2 13m12-13-2 13',start:'M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13ZM9 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0',city:'M3 21h18M5 21V9h6v12m0-16h8v16M6 5h3M14 9h2m-2 5h2',wonder:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',grid:'m12 2 9 5v10l-9 5-9-5V7Zm-9 5 9 5 9-5m-9 5v10',coordinates:'M3 12h18M12 3v18M6 6h12v12H6Z',issues:'m12 3 10 18H2Zm0 5v6m0 3v1',close:'m6 6 12 12M6 18 18 6',layers:'m12 3 10 6-10 6L2 9Zm-10 10 10 6 10-6M2 17l10 6 10-6',fish:'M3 12c5-8 10-8 15 0-5 8-10 8-15 0Zm15 0 4-5v10Z',horse:'m6 21 2-10-3-2 6-7 7 4 2 15M11 2v5h5',oil:'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z'};
  const svg=key=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key]||paths.land}"/></svg>`;
  const groups=[
    ['Landscape',[['relief','Hills & mountains','land'],['woods','Forest & jungle','wood'],['wetlands','Marsh, floodplains & oases','wet']]],
    ['Water',[['rivers','Rivers','water'],['lakes','Lakes','water'],['ice','Sea ice','ice']]],
    ['Resources',[['bonus','Bonus','bonus'],['luxury','Luxury','luxury'],['strategic','Strategic','strategic'],['other','Other resources','resources']]],
    ['Starts & landmarks',[['players','Planned player starts','start'],['cities','City-state starts','city'],['wonders','Natural wonders','wonder']]],
    ['Guides',[['grid','Hex grid','grid'],['coordinates','Tile coordinates','coordinates'],['issues','Terrain issues','issues']]]
  ];
  const settings={relief:true,woods:true,wetlands:true,rivers:true,lakes:true,ice:true,bonus:false,luxury:true,strategic:true,other:true,players:true,cities:true,wonders:true,grid:false,coordinates:false,issues:false};
  const views={normal:'Normal',movement:'Movement',freshwater:'Freshwater',settlement:'Settlement potential',balance:'Starting balance'};
  const cache=new WeakMap(),controls=[],images=new Map();
  let lastMap=null,mapView='normal',hoverFrame=0,hoverIndex=null;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const name=value=>(value||'').replace(/^(TERRAIN|FEATURE|RESOURCE)_/,'').toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
  const menu=$('layers-menu'),trigger=$('layers-button');
  menu.className='layer-popover';menu.replaceChildren();menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','false');menu.setAttribute('aria-label','Layers');document.body.append(menu);
  trigger.setAttribute('aria-haspopup','dialog');trigger.innerHTML=svg('layers')+'<span>Layers</span><span class="layers-chevron" aria-hidden="true"></span>';
  const picker=el('label','layer-view-picker'),viewSelect=el('select');viewSelect.setAttribute('aria-label','Map view');
  for(const [value,title] of Object.entries(views)){const option=el('option','',title);option.value=value;viewSelect.append(option);}picker.append(el('span','','Map view'),viewSelect);
  const sections=el('div','layer-sections');menu.append(picker,sections);
  const hints={grid:'Hex tile boundaries',relief:'Tiles with hills or mountains',woods:'Forest or jungle tiles',wetlands:'Marsh, floodplain or oasis tiles',rivers:'Encoded river edges',lakes:'Inferred lakes: enclosed coastal water bodies of up to 10 tiles',ice:'Ice tiles',players:'Start records in this map; ordinary game exports let Civ V assign starts',cities:'City-state start records in this map',wonders:'Natural-wonder tiles',issues:'Tiles with supported placement errors',coordinates:'Coordinates appear when zoomed in',other:'Resources with unrecognised category definitions'};
  for(const [title,items] of groups){const section=el('section','layer-section');section.append(el('h4','layer-group-heading',title));for(const [key,label,icon] of items){const row=el('label','layer-choice'),mark=el('span'),text=el('span','layer-label',label),count=el('span','layer-count'),input=el('input');row.dataset.kind=key;mark.innerHTML=svg(icon);input.type='checkbox';input.id=`layer-${key}`;input.setAttribute('role','switch');input.setAttribute('aria-label',label);input.checked=settings[key];row.title=hints[key]||'Resource deposits on this map';row.append(mark,text,count,input);section.append(row);controls.push({key,input,count,row});input.onchange=()=>{settings[key]=input.checked;renderMap();};}sections.append(section);}
  const inspector=el('aside','layer-inspector');inspector.hidden=true;inspector.setAttribute('aria-label','Tile details');
  const tilePosition=el('div','tile-position'),tileTitle=el('h4'),tileDetails=el('p'),tileResource=el('p','tile-resource'),tileIssues=el('p','tile-issues');inspector.append(tilePosition,tileTitle,tileDetails,tileResource,tileIssues);document.body.append(inspector);
  const legend=el('aside','layer-legend');legend.hidden=true;legend.setAttribute('aria-label','Map view legend');document.body.append(legend);
  function analyse(map){if(!cache.has(map)){const info=window.V3ExistingRules.analyseMapLayers(map),findings=window.V3ExistingRules.inspect(map),byTile=new Map();for(const finding of findings){if(!byTile.has(finding.index))byTile.set(finding.index,[]);byTile.get(finding.index).push(finding);}info.issues=byTile;info.counts.issues=byTile.size;cache.set(map,info);}return cache.get(map);}
  function sync(map,data){
    for(const {key,input,count,row} of controls){input.checked=settings[key];const amount=data.counts[key];count.textContent=amount===undefined?'':amount.toLocaleString();row.hidden=key==='other'&&!amount;input.disabled=amount===0;}
    viewSelect.querySelector('[value=balance]').disabled=data.starts.length<2;
    if(mapView==='balance'&&data.starts.length<2){mapView='normal';viewSelect.value='normal';}
    updateLegend(data);hideInspector();
  }
  function getData(map){const data=analyse(map);if(mapView==='settlement'&&!data.settlement)data.settlement=window.V3ExistingRules.settlementLayerValues(map);if(lastMap!==map){lastMap=map;sync(map,data);}return data;}
  function extent(values){let low=Infinity,high=-Infinity;for(const value of values)if(value!==null&&Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}return low===Infinity?[0,0]:[low,high];}
  function updateLegend(data){
    legend.hidden=mapView==='normal'||mobileMedia.matches;legend.replaceChildren();if(legend.hidden)return;
    const descriptions={movement:['1 step','2 steps','Terrain estimate · mountains blocked'],freshwater:['No source','Water access','Rivers, oases & inferred lakes'],settlement:['Lower','Higher','Reachable terrain within 3 land steps'],balance:['Lower','Higher','Opening terrain value · current map']};
    const [low,high,note]=descriptions[mapView];legend.append(el('strong','',views[mapView]));const scale=el('div','legend-scale');scale.append(el('span','',low),el('i','legend-ramp'),el('span','',high));legend.append(scale,el('small','',note));
    if(mapView==='balance'){const scores=el('div','start-scores');for(const start of data.starts)scores.append(el('span','',`P${start.player+1} ${start.score}`));legend.append(scores);}
    legend.dataset.view=mapView;
  }
  function position(){
    if(mobileMedia.matches){close();hideInspector();legend.hidden=true;return;}
    const anchor=trigger.getBoundingClientRect(),sidebar=document.querySelector('.panel').getBoundingClientRect(),save=$('desktop-save').getBoundingClientRect();
    menu.style.left=`${Math.max(12,anchor.right-264)}px`;menu.style.top=`${anchor.bottom+8}px`;menu.style.maxHeight=`${Math.max(100,Math.min(sidebar.bottom,innerHeight-16)-anchor.bottom-8)}px`;
    inspector.style.left=`${Math.max(12,Math.min(sidebar.right+28,innerWidth-258))}px`;inspector.style.bottom=`${innerHeight-save.bottom}px`;
    legend.style.left=`${sidebar.right+28}px`;legend.style.top=`${$('world-title').getBoundingClientRect().bottom+12}px`;legend.style.maxWidth=`${Math.max(180,innerWidth-sidebar.right-160)}px`;
    if(mapView!=='normal')legend.hidden=false;
  }
  function close(restore=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();}
  function open(focus=false){if(mobileMedia.matches)return;getData(shownMap());menu.hidden=false;trigger.setAttribute('aria-expanded','true');position();if(focus)viewSelect.focus();}
  trigger.onclick=event=>menu.hidden?open(event.detail===0):close();
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!trigger.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();close(true);}},true);
  viewSelect.onchange=()=>{mapView=viewSelect.value;const data=getData(shownMap());updateLegend(data);hideInspector();renderMap();position();};
  function hideInspector(){if(hoverFrame)cancelAnimationFrame(hoverFrame);hoverFrame=0;hoverIndex=null;inspector.hidden=true;}
  function hover(event){
    if(mobileMedia.matches||drag||document.elementFromPoint(event.clientX,event.clientY)!==canvas){hideInspector();return;}
    hoverIndex=tileAt(event);if(hoverIndex===null){hideInspector();return;}
    if(!hoverFrame)hoverFrame=requestAnimationFrame(()=>{hoverFrame=0;if(hoverIndex===null)return;const map=shownMap(),tile=map.tiles[hoverIndex];if(!tile)return;const data=analyse(map),resource=map.resources[tile.resource],feature=map.features[tile.feature],wonder=map.wonders[tile.wonder];tilePosition.textContent=`Tile ${hoverIndex%map.width}, ${Math.floor(hoverIndex/map.width)}`;tileTitle.textContent=`${name(map.terrains[tile.terrain])}${tile.elevation===2?' · Mountain':tile.elevation===1?' · Hills':''}`;tileDetails.textContent=[name(feature),name(wonder),data.riverTouch[hoverIndex]?'River':'',data.lakes[hoverIndex]?'Inferred lake':''].filter(Boolean).join(' · ')||'Open terrain';tileResource.replaceChildren();if(tile.resource!==255){const mark=el('span');mark.innerHTML=resourceSvg(resource||'');tileResource.append(mark,el('span','',`${resource?name(resource):'Unknown resource'} · ${tile.resourceAmount}`));}else tileResource.textContent='No resource';const findings=data.issues.get(hoverIndex)||[];tileIssues.hidden=!findings.length;tileIssues.textContent=findings.map(f=>f.detail).join(' ');position();inspector.hidden=false;});
  }
  canvas.addEventListener('pointermove',hover);canvas.addEventListener('pointerup',hover);
  for(const event of ['pointerleave','pointerdown','pointercancel','wheel'])canvas.addEventListener(event,hideInspector);
  window.addEventListener('blur',hideInspector);
  document.addEventListener('v3-workspace-change',()=>{close();hideInspector();});window.addEventListener('resize',position);window.addEventListener('v3:sidebar-fit',position);mobileMedia.addEventListener('change',position);
  // Distinct silhouettes for the standard catalogue, with category colours and an explicit unknown symbol.
  const resourcePaths={
    WHEAT:paths.bonus,CATTLE:'M5 3v5l4 3h6l4-3V3M8 10v7l4 4 4-4v-7M9 14h1m4 0h1',SHEEP:'M7 9c-6-6-7 9-1 7 0 5 5 5 6 1 5 4 10-1 6-5 3-5-3-8-6-4-2-4-6-3-5 1ZM8 18v4m8-4v4',DEER:'M5 2v5l5 4m9-9v5l-5 4M2 5l6 3m14-3-6 3M9 10v8l3 4 3-4v-8',FISH:paths.fish,STONE:'m2 17 4-9 7-3 8 6-2 9H7Zm4-9 8 5 5 7m-5-7-1-8',BANANA:'M18 2c4 16-8 22-15 12 10 5 14-2 13-11Z',BISON:'M3 7l3 4M21 7l-3 4M5 9c0-9 14-9 14 0v7l-7 6-7-6Zm4 4h1m4 0h1',
    IRON:paths.strategic,HORSE:paths.horse,COAL:'m3 16 4-9 9-3 6 12-8 6Zm4-9 7 15m-1-12 9 6',OIL:paths.oil,ALUMINUM:'m3 8 6-4h10l3 10-6 6H5Zm0 0 13 4 6 2m-6-2v8',URANIUM:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-2-3V2h4v4M7 16l-4 2-2-4 4-2m12 4 4 2 2-4-4-2',
    GOLD:'M3 7a9 4 0 1 0 18 0 9 4 0 1 0-18 0Zm0 0v10c0 5 18 5 18 0V7M3 12c0 5 18 5 18 0',SILVER:'m3 7 9-5 9 5v10l-9 5-9-5Zm9-5v20M3 7l18 10M21 7 3 17',GEMS:paths.luxury,SPICES:'M6 3h12M8 3v5l-3 7v6h14v-6l-3-7V3M7 14h10',FURS:'m7 3 5 3 5-3 5 5-4 4 1 10-7-3-7 3 1-10-4-4Z',DYES:'M7 2h10v5l4 8v6H3v-6l4-8Zm-2 12h14',SUGAR:'m3 8 9-5 9 5v10l-9 4-9-4Zm0 0 9 5 9-5m-9 5v9',COTTON:'M12 17c-12 4-12-11-4-9-2-9 12-9 10-1 9 1 4 12-6 10Zm0 0v6',WINE:'M5 2h14v7c0 7-14 7-14 0Zm7 12v7m-5 1h10',INCENSE:'M3 19h18M6 19l5-7m4 7 3-7M9 9c-6-4 8-3 2-8m5 10c7-3-6-4 0-8',IVORY:'M5 2c-4 18 11 25 15 9-7 10-14 0-12-9Z',PEARLS:'M3 15c5-4 13-4 18 0l-3 6H6Zm9-13a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',WHALE:'M2 13c5-9 13-3 14 1l6-4-2 10H8ZM7 6V2m-3 4V4',SALT:'m3 18 4-12 5-3 7 5 3 10Zm9-15v15M7 6l12 2',TRUFFLES:'M12 3c-14 0-14 18 0 18s14-18 0-18ZM8 8h1m7 2h1m-6 5h1',CRAB:'M5 13c0-7 14-7 14 0v5H5Zm0 0L1 8V3m18 10 4-5V3M5 16l-4 4m18-4 4 4M9 7V4m6 3V4',CITRUS:'M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 0c0-5 7-5 7-5M9 10l6 6m0-6-6 6',COPPER:'m3 8 9-5 9 5v10l-9 4-9-4Zm0 0 9 5 9-5m-9 5v9',COCOA:'M12 2c-14 6-14 14 0 20 14-6 14-14 0-20Zm0 0v20M8 5c-4 7-4 7 0 14m8-14c4 7 4 7 0 14'
  };
  function resourceSvg(resource){const key=resource.replace(/^RESOURCE_/,''),category=window.V3ExistingRules.mapResourceCategory(resource),path=resourcePaths[key]||paths[category]||'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM9 8c0-5 9-3 5 2l-2 2v2m0 3v1';return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${{bonus:'#597145',luxury:'#947033',strategic:'#466176',other:'#756d65'}[category]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;}
  function resourceImage(resource){if(!images.has(resource)){const image=new Image();image.onload=()=>renderMap();image.src='data:image/svg+xml,'+encodeURIComponent(resourceSvg(resource));images.set(resource,image);}return images.get(resource);}
  function color(data,i,base){
    if(mapView==='normal')return settings.lakes&&data.lakes[i]?'#a9cbc9':base;
    if(data.water[i])return base;
    if(mapView==='movement')return data.movement[i]===Infinity?'#6b655d':data.movement[i]===2?'#c9ad79':'#b6c59a';
    if(mapView==='freshwater')return data.freshwater[i]?'#75aaa9':'#d3cbb5';
    const values=mapView==='settlement'?data.settlement:data.balance,value=values[i];if(value===null)return '#c9c7bc';
    const bounds=mapView==='settlement'?(data.settlementExtent??=extent(values)):(data.balanceExtent??=extent(values));const t=bounds[1]===bounds[0] ? .5 : (value-bounds[0])/(bounds[1]-bounds[0]);return `hsl(${35+t*65} 26% ${75-t*22}%)`;
  }
  function drawOverlay(c,map,data){
    const zoom=view.zoom,size=Math.max(8,Math.min(12,9/zoom));
    for(let i=0;i<map.tiles.length;i++){const tile=map.tiles[i],p=center(map,i);if(tile.resource!==255){const resource=map.resources[tile.resource]||'',category=window.V3ExistingRules.mapResourceCategory(resource);if(settings[category]){const image=resourceImage(resource);if(image.complete&&image.naturalWidth){c.fillStyle='#fffdf9e0';c.beginPath();c.arc(p.x,p.y,size*.57,0,Math.PI*2);c.fill();c.drawImage(image,p.x-size/2,p.y-size/2,size,size);}}}
      if(settings.issues&&data.issues.has(i)){hex(c,p.x,p.y);c.strokeStyle='#a15a3f';c.lineWidth=1.5/zoom;c.stroke();}
      if(settings.coordinates&&zoom>=1.3){c.font=`${8/zoom}px sans-serif`;c.fillStyle='#252c40';c.textAlign='center';c.textBaseline='middle';c.fillText(`${i%map.width},${Math.floor(i/map.width)}`,p.x,p.y+5);}
    }
    for(const start of data.validStarts){if(!settings[start.cityState?'cities':'players'])continue;const p=center(map,start.y*map.width+start.x);c.beginPath();c.arc(p.x,p.y,(start.cityState?6:9)/zoom,0,Math.PI*2);c.fillStyle=start.cityState?'#71816d':'#252c40';c.fill();c.strokeStyle='#f2e8d6';c.lineWidth=1/zoom;c.stroke();c.font=`500 ${10/zoom}px sans-serif`;c.fillStyle='#f2e8d6';c.textAlign='center';c.textBaseline='middle';c.fillText(start.cityState?'•':String(start.player+1),p.x,p.y);}
  }
  window.V3Layers={settings,getData,color,drawOverlay,hideInspector};
  getData(shownMap());position();renderMap();
})();
