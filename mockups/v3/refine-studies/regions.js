/* Geometry helpers for the isolated region-selection studies. */
(() => {
  function neighbor(map,index,edge){
    const x=index%map.width,y=Math.floor(index/map.width),odd=y%2;
    const offsets=[[odd?1:0,1],[1,0],[odd?1:0,-1],[odd?0:-1,-1],[-1,0],[odd?0:-1,1]];
    const [dx,dy]=offsets[edge],ny=y+dy;let nx=x+dx;
    if(map.wraps)nx=(nx+map.width)%map.width;
    return nx<0||nx>=map.width||ny<0||ny>=map.height?null:ny*map.width+nx;
  }
  const water=(map,index)=>/OCEAN|COAST/.test(map.terrains[map.tiles[index].terrain]||'');
  function connected(map,origin,kind){
    if(!map.tiles[origin])return [];
    const terrain=map.tiles[origin].terrain;
    const matches=index=>kind==='landmass'?!water(map,index):kind==='water'?water(map,index):kind==='terrain'?map.tiles[index].terrain===terrain:kind==='woodland'?/FOREST|JUNGLE/.test(map.features[map.tiles[index].feature]||''):kind==='highlands'?!water(map,index)&&map.tiles[index].elevation>0:false;
    if(!matches(origin))return [];
    const result=[origin],seen=new Set(result);
    for(let cursor=0;cursor<result.length;cursor++)for(let edge=0;edge<6;edge++){const next=neighbor(map,result[cursor],edge);if(next!==null&&!seen.has(next)&&matches(next)){seen.add(next);result.push(next);}}
    return result;
  }
  function point(map,index){return {x:(index%map.width+(Math.floor(index/map.width)%2)*.5)*Math.sqrt(3)*10+10,y:(map.height-1-Math.floor(index/map.width))*15+10};}
  function tileAtPoint(map,p){
    const row=map.height-1-Math.round((p.y-10)/15),halfWidth=Math.sqrt(3)*5;
    let closest=null,distance=Infinity;
    for(let y=row-1;y<=row+1;y++){
      if(y<0||y>=map.height)continue;
      const col=Math.round((p.x-10)/(Math.sqrt(3)*10)-(y%2)*.5);
      for(let x=col-1;x<=col+1;x++){
        if(x<0||x>=map.width)continue;
        const index=y*map.width+x,c=point(map,index),dx=Math.abs(p.x-c.x),dy=Math.abs(p.y-c.y),d=dx*dx+dy*dy;
        if(dx<=halfWidth+1e-8&&dy+dx/Math.sqrt(3)<=10+1e-8&&d<distance){closest=index;distance=d;}
      }
    }
    return closest;
  }
  function polygon(map,vertices){
    if(vertices.length<3)return [];
    const result=[];
    for(let index=0;index<map.tiles.length;index++){const p=point(map,index);let inside=false;for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){const a=vertices[i],b=vertices[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}if(inside)result.push(index);}
    return result;
  }
  window.V3RefineRegions={neighbor,connected,point,tileAtPoint,polygon};
})();
