/* Real IndexedDB checks against a disposable database. */
document.getElementById('run').onclick=async()=>{
  const output=document.getElementById('results'),button=document.getElementById('run');button.disabled=true;output.textContent='Running';
  const name=`excogitare-history-check-${crypto.randomUUID()}`;let store=window.V3SnapshotStore.create(name),passed=[];
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const world=i=>({uid:i+1,title:`Snapshot ${i}`,kept:i===0,originalBytes:new Uint8Array([7,8,9]).buffer,map:{width:1,height:1,tiles:[{terrain:2,elevation:0,resource:255,resourceAmount:0,feature:255,wonder:255,river:0,continent:1}]}});
  try{
    for(let i=0;i<101;i++)await store.add(world(i));
    let saved=await store.load();assert(saved.history.length===100,'The cap is not 100.');assert(!saved.history.some(w=>w.title==='Snapshot 0'),'The oldest snapshot was not evicted.');assert(saved.history[0].title==='Snapshot 1','History is not the latest 100 snapshots.');passed.push('Latest 100 snapshots, including legacy kept records');
    const lastId=saved.activeId;await store.close();store=window.V3SnapshotStore.create(name);saved=await store.load();assert(saved.history.length===100&&saved.activeId===lastId,'Reload did not preserve history and selection.');assert(new Uint8Array(saved.history[0].originalBytes).join(',')==='7,8,9','Imported source bytes were lost.');passed.push('Reload, active selection and source-byte round trip');
    await Promise.all(saved.history.map(w=>store.setKept(w.historyId,true)));await store.add(world(102));saved=await store.load();assert(saved.history.length===100&&saved.history[0].title==='Snapshot 2','Legacy kept flags blocked oldest-first retention.');passed.push('Legacy kept flags do not block new snapshots');
    await Promise.all([103,104,105].map(i=>store.add(world(i))));saved=await store.load();assert(saved.history.length===100&&new Set(saved.history.map(w=>w.historyId)).size===100,'Concurrent inserts violated capacity or identity.');passed.push('Concurrent insertion retains the hard cap');
    const selected=saved.history[2].historyId;await store.select(selected);assert((await store.load()).activeId===selected,'Selected snapshot was not remembered.');passed.push('Snapshot selection persists');
    output.textContent='PASSED\n'+passed.map(p=>'• '+p).join('\n');
  }catch(error){output.textContent='FAILED: '+error.message;}
  finally{await store.close();await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});button.disabled=false;}
};
