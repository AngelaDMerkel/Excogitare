/* Pick the clear workspace first; map proportions only determine its zoom. */
(() => {
  const epsilon=1e-7;
  function hexBounds(columns,rows,radius=10){
    if(![columns,rows].every(n=>Number.isInteger(n)&&n>0)||!Number.isFinite(radius)||radius<=0)return null;
    const step=Math.sqrt(3)*radius,left=radius-step/2,top=0;
    const width=step*(columns+(rows>1?.5:0)),height=radius*(1.5*(rows-1)+2);
    return {left,top,width,height};
  }
  function solve({width,height,mapWidth,mapHeight,mapLeft=0,mapTop=0,overlays=[],padding=32}){
    if(![width,height,mapWidth,mapHeight].every(n=>Number.isFinite(n)&&n>0))return null;
    if(![mapLeft,mapTop].every(Number.isFinite))return null;
    const gap=Math.min(Math.max(0,padding),width/4,height/4);
    const frame={left:gap,top:gap,right:width-gap,bottom:height-gap};
    const blockers=overlays.map(r=>({left:Math.max(frame.left,r.left-gap),top:Math.max(frame.top,r.top-gap),right:Math.min(frame.right,r.right+gap),bottom:Math.min(frame.bottom,r.bottom+gap)})).filter(r=>r.right>r.left&&r.bottom>r.top);
    const edges=[...new Set([frame.top,frame.bottom,...blockers.flatMap(r=>[r.top,r.bottom])])].sort((a,b)=>a-b);
    let best=null;
    function consider(left,right,top,bottom){
      if(right-left<1||bottom-top<1)return;
      const room=(right-left)*(bottom-top),distance=Math.hypot((left+right-width)/width,(top+bottom-height)/height);
      if(!best||room>best.room+epsilon||(Math.abs(room-best.room)<epsilon&&distance<best.distance))best={room,distance,space:{left,top,right,bottom},padding:gap};
    }
    for(let a=0;a<edges.length-1;a++)for(let b=a+1;b<edges.length;b++){
      const top=edges[a],bottom=edges[b];
      const blocked=blockers.filter(r=>r.top<bottom-epsilon&&r.bottom>top+epsilon).sort((a,b)=>a.left-b.left);
      let left=frame.left;
      for(const r of blocked){if(r.left>left)consider(left,r.left,top,bottom);left=Math.max(left,r.right);}
      if(left<frame.right)consider(left,frame.right,top,bottom);
    }
    if(!best)return null;
    const {left,right,top,bottom}=best.space;
    const zoom=Math.min((right-left)/mapWidth,(bottom-top)/mapHeight);
    return {...best,zoom,x:left+(right-left-mapWidth*zoom)/2-mapLeft*zoom,y:top+(bottom-top-mapHeight*zoom)/2-mapTop*zoom};
  }
  window.V3MapFit={solve,hexBounds};
})();
