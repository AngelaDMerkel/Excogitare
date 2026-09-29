/* Fit the map between visible controls. This never clips or limits the canvas. */
(() => {
  const epsilon=1e-7;
  function solve({width,height,mapWidth,mapHeight,overlays=[],padding=32}){
    if(![width,height,mapWidth,mapHeight].every(n=>Number.isFinite(n)&&n>0))return null;
    const gap=Math.min(Math.max(0,padding),width/4,height/4);
    const frame={left:gap,top:gap,right:width-gap,bottom:height-gap};
    const blockers=overlays.map(r=>({left:Math.max(frame.left,r.left-gap),top:Math.max(frame.top,r.top-gap),right:Math.min(frame.right,r.right+gap),bottom:Math.min(frame.bottom,r.bottom+gap)})).filter(r=>r.right>r.left&&r.bottom>r.top);
    const edges=[...new Set([frame.top,frame.bottom,...blockers.flatMap(r=>[r.top,r.bottom])])].sort((a,b)=>a-b);
    let best=null;
    function consider(left,right,top,bottom){
      if(right-left<1||bottom-top<1)return;
      const zoom=Math.min((right-left)/mapWidth,(bottom-top)/mapHeight);
      const x=left+(right-left-mapWidth*zoom)/2,y=top+(bottom-top-mapHeight*zoom)/2;
      const room=(right-left)*(bottom-top),distance=Math.hypot((left+right-width)/width,(top+bottom-height)/height);
      if(!best||zoom>best.zoom+epsilon||(Math.abs(zoom-best.zoom)<epsilon&&(room>best.room+epsilon||(Math.abs(room-best.room)<epsilon&&distance<best.distance))))best={x,y,zoom,room,distance,space:{left,top,right,bottom},padding:gap};
    }
    for(let a=0;a<edges.length-1;a++)for(let b=a+1;b<edges.length;b++){
      const top=edges[a],bottom=edges[b];
      const blocked=blockers.filter(r=>r.top<bottom-epsilon&&r.bottom>top+epsilon).sort((a,b)=>a.left-b.left);
      let left=frame.left;
      for(const r of blocked){if(r.left>left)consider(left,r.left,top,bottom);left=Math.max(left,r.right);}
      if(left<frame.right)consider(left,frame.right,top,bottom);
    }
    return best;
  }
  window.V3MapFit={solve};
})();
