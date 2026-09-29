/* Local map-snapshot history. No browser navigation entries or remote storage. */
(() => {
  function create(name='excogitare-v3-snapshots',limit=100){
    const database=new Promise((resolve,reject)=>{
      const request=indexedDB.open(name,1);
      request.onupgradeneeded=()=>{const db=request.result,store=db.createObjectStore('snapshots',{keyPath:'key'});store.createIndex('sequence','sequence');store.createIndex('retention',['kept','sequence']);db.createObjectStore('meta',{keyPath:'key'});};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Close another preview to update local history.'));
    });
    async function transaction(mode,action){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction(['snapshots','meta'],mode);let result,reason;tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(reason||tx.error||new Error('Local history could not be saved.'));const fail=error=>{reason=error;tx.abort();};try{action(tx, value=>{result=value;},fail);}catch(error){fail(error);}});}
    function load(){return transaction('readonly',(tx,done)=>{let records,state,ready=0;const finish=()=>{if(++ready===2)done({history:records.map(record=>record.world),activeId:state?.activeId});};const all=tx.objectStore('snapshots').index('sequence').getAll();all.onsuccess=()=>{records=all.result;finish();};const meta=tx.objectStore('meta').get('state');meta.onsuccess=()=>{state=meta.result;finish();};});}
    function add(world){return transaction('readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('snapshots'),meta=tx.objectStore('meta');let count,state,ready=0;
      const put=evicted=>{const sequence=(state?.sequence||0)+1,key=crypto.randomUUID(),saved={...world,historyId:key,historySequence:sequence};if(evicted)store.delete(evicted);store.put({key,sequence,kept:saved.kept?1:0,world:saved});meta.put({key:'state',sequence,activeId:key});const keys=store.index('sequence').getAllKeys();keys.onsuccess=()=>done({world:saved,keys:keys.result});};
      const finish=()=>{if(++ready!==2)return;if(count<limit){put();return;}const cursor=store.index('sequence').openKeyCursor();cursor.onsuccess=()=>{if(!cursor.result){fail(new Error('Could not find the oldest snapshot.'));return;}put(cursor.result.primaryKey);};};
      const countRequest=store.count();countRequest.onsuccess=()=>{count=countRequest.result;finish();};const stateRequest=meta.get('state');stateRequest.onsuccess=()=>{state=stateRequest.result;finish();};
    });}
    function setKept(key,kept){return transaction('readwrite',(tx,done,fail)=>{const store=tx.objectStore('snapshots'),request=store.get(key);request.onsuccess=()=>{const row=request.result;if(!row){fail(new Error('This snapshot is no longer in local history.'));return;}row.kept=kept?1:0;row.world.kept=kept;store.put(row);done(true);};});}
    function select(key){return transaction('readwrite',(tx,done)=>{const store=tx.objectStore('snapshots'),meta=tx.objectStore('meta'),found=store.getKey(key);found.onsuccess=()=>{if(!found.result){done(false);return;}const state=meta.get('state');state.onsuccess=()=>{meta.put({...state.result,key:'state',activeId:key});done(true);};};});}
    async function close(){(await database).close();}
    return {load,add,setKept,select,close};
  }
  window.V3SnapshotStore={create};
})();
