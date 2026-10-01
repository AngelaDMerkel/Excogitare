import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeCiv5Map, parseCiv5Map, updateCiv5Map, type Civ5Map } from '../lib/civ5-map.ts';
import { featurePlacementVerdict, resourcePlacementVerdict } from '../lib/civ5-rules.ts';
import { refineLocal, refineGlobal, type GlobalRefinement } from '../lib/v3/refine.ts';
import { refineGeometry as geometry } from '../lib/v3/refine-selection.ts';

function fixture(): Civ5Map {
  return { name: 'Refine fixture', description: 'Keep metadata', width: 8, height: 8, players: 2, wraps: false, version: 12, worldSize: 'STANDARD', source: 'generated',
    terrains: ['TERRAIN_OCEAN','TERRAIN_COAST','TERRAIN_GRASS','TERRAIN_PLAINS','TERRAIN_DESERT','TERRAIN_TUNDRA','TERRAIN_SNOW'],
    features: ['FEATURE_FOREST','FEATURE_JUNGLE','FEATURE_MARSH','FEATURE_ICE','FEATURE_OASIS'], resources: ['RESOURCE_WHEAT','RESOURCE_IRON','RESOURCE_FISH','RESOURCE_GOLD'], wonders: ['FEATURE_MT_FUJI'],
    tiles: Array.from({length:64},()=>({terrain:2,elevation:0,feature:255,river:0,resource:255,resourceAmount:0,wonder:255,continent:1})),
    startLocations: [{x:1,y:1,player:0,cityState:false,playable:true,team:0,civilization:'',leader:''},{x:6,y:6,player:1,cityState:false,playable:true,team:1,civilization:'',leader:''}] };
}
const defaults: GlobalRefinement = {climate:'unchanged',relief:'unchanged',vegetation:'unchanged',resources:'unchanged',strength:'moderate'};
const deposits = (map:Civ5Map) => map.tiles.filter(t=>t.resource!==255).map(t=>`${map.resources[t.resource]}:${t.resourceAmount}`).sort();

test('Hex hit testing agrees with all drawn centres, sloping boundaries and empty canvas',()=>{
  const map=fixture();for(let i=0;i<64;i++)assert.equal(geometry.tileAtPoint(map,geometry.point(map,i)),i);
  const p=geometry.point(map,27);assert.equal(geometry.tileAtPoint(map,{x:p.x+8,y:p.y+4}),27);assert.notEqual(geometry.tileAtPoint(map,{x:p.x+8,y:p.y+7}),27);
  assert.equal(geometry.tileAtPoint(map,{x:-20,y:-20}),null);assert.equal(geometry.tileAtPoint(map,{x:NaN,y:0}),null);
});
test('Geographic selection follows current terrain, feature and relief connectivity across wrapping',()=>{
  const map=fixture();for(const t of map.tiles)t.terrain=0;map.tiles[24].terrain=2;map.tiles[31].terrain=2;
  assert.deepEqual(geometry.connected(map,24,'landmass'),[24]);map.wraps=true;assert.equal(geometry.connected(map,24,'landmass').length,2);
  map.tiles[24].feature=0;map.tiles[31].feature=1;assert.equal(geometry.connected(map,24,'woodland').length,2);
  map.tiles[31].terrain=3;assert.deepEqual(geometry.connected(map,24,'terrain'),[24]);map.tiles[24].elevation=2;assert.deepEqual(geometry.connected(map,24,'highlands'),[24]);assert.equal(geometry.connected(map,24,'water').length,0);
});
test('Custom boundaries select enclosed tile centres and reject incomplete or invalid shapes',()=>{
  const map=fixture(),p=geometry.point(map,27),shape=[{x:p.x-1,y:p.y-1},{x:p.x+1,y:p.y-1},{x:p.x+1,y:p.y+1},{x:p.x-1,y:p.y+1}];
  assert.deepEqual(geometry.polygon(map,shape),[27]);assert.deepEqual(geometry.polygon(map,[...shape].reverse()),[27]);assert.deepEqual(geometry.polygon(map,shape.slice(0,2)),[]);assert.deepEqual(geometry.polygon(map,[{x:NaN,y:0},...shape]),[]);
});
test('Local edits require a valid explicit scope and never change the accepted source or other tiles',()=>{
  const map=fixture(),before=structuredClone(map);assert.throws(()=>refineLocal(map,'woodland',[]),/Select/);assert.throws(()=>refineLocal(map,'woodland',[99]),/another map/);
  const edit=refineLocal(map,'woodland',[27,27],'light');assert.deepEqual(edit.changed,[27]);assert.equal(edit.map.tiles[27].feature,0);assert.deepEqual(map,before);
  for(let i=0;i<64;i++)if(i!==27)assert.deepEqual(edit.map.tiles[i],map.tiles[i]);
});
test('Local operations preserve supported placement rules and natural wonders',()=>{
  const map=fixture();map.tiles[0].terrain=0;map.tiles[1].terrain=4;map.tiles[2].terrain=6;map.tiles[3].elevation=2;map.tiles[4].wonder=0;
  const forest=refineLocal(map,'woodland',[0,1,2,3,4,5],'strong');assert.deepEqual(forest.changed,[5]);
  map.tiles[6].terrain=4;const oasis=refineLocal(map,'oasis',[5,6],'strong');assert.deepEqual(oasis.changed,[6]);
  map.tiles[7].feature=2;assert.equal(refineLocal(map,'drain',[7],'strong').map.tiles[7].feature,255);
  assert.equal(refineLocal(map,'pass',[3],'strong').map.tiles[3].elevation,1);assert.deepEqual(forest.map.tiles[4],map.tiles[4]);
});
test('Redistribution preserves deposit types and quantities within the selection, including impossible moves',()=>{
  const map=fixture();map.tiles[20].resource=1;map.tiles[20].resourceAmount=4;map.tiles[50].resource=3;map.tiles[50].resourceAmount=1;
  const edit=refineLocal(map,'redistribute',[20,21],'strong');assert.equal(edit.movedResources,1);assert.equal(edit.removedResources,0);assert.deepEqual(deposits(edit.map),deposits(map));assert.deepEqual(edit.map.tiles[50],map.tiles[50]);
  map.tiles[20].terrain=0;map.tiles[20].resource=2;const impossible=refineLocal(map,'redistribute',[20,21],'strong');assert.deepEqual(impossible.changed,[]);assert.deepEqual(deposits(impossible.map),deposits(map));
});
test('Global climate adjusts existing biomes and reports newly incompatible feature removals',()=>{
  const map=fixture();for(const tile of map.tiles){tile.terrain=5;tile.feature=0;}map.tiles[0].terrain=0;map.tiles[0].feature=3;map.tiles[1].wonder=0;map.tiles[4].river=9;
  const edit=refineGlobal(map,{...defaults,climate:'cooler',strength:'strong'});assert.equal(edit.map.tiles[2].terrain,6);assert.equal(edit.map.tiles[2].feature,255);assert.equal(edit.removedFeatures,62);
  assert.deepEqual(edit.map.tiles[0],map.tiles[0]);assert.deepEqual(edit.map.tiles[1],map.tiles[1]);assert.equal(edit.map.tiles[4].river,9);assert.deepEqual(edit.map.startLocations,map.startLocations);
});
test('Global roughness preserves incompatible content instead of creating illegal hill placements',()=>{
  const map=fixture();map.tiles[2].resource=0;map.tiles[2].resourceAmount=1;map.tiles[3].feature=2;
  const edit=refineGlobal(map,{...defaults,relief:'rugged',strength:'strong'});assert.equal(edit.map.tiles[1].elevation,1);assert.equal(edit.map.tiles[2].elevation,0);assert.equal(edit.map.tiles[3].elevation,0);
  assert.ok(edit.map.tiles.every(t=>featurePlacementVerdict(edit.map,t).valid&&resourcePlacementVerdict(edit.map,t).valid));
});
test('Climate adjusts sea ice at existing cold margins without freezing resource deposits',()=>{
  const map=fixture();map.tiles[27].terrain=1;map.tiles[27].feature=3;map.tiles[28].terrain=1;map.tiles[26].terrain=1;map.tiles[26].resource=2;map.tiles[26].resourceAmount=1;
  const cooler=refineGlobal(map,{...defaults,climate:'cooler',strength:'strong'});
  assert.equal(cooler.map.tiles[28].feature,3);assert.equal(cooler.map.tiles[26].feature,255);
  const warmer=refineGlobal(cooler.map,{...defaults,climate:'warmer',strength:'strong'});
  assert.equal(warmer.map.tiles[27].feature,255);assert.equal(warmer.map.tiles[28].feature,255);
  assert.deepEqual(warmer.map.tiles.map(t=>t.terrain<2),map.tiles.map(t=>t.terrain<2));
});
test('Global density is directional, deterministic and preserves old unrelated errors',()=>{
  const map=fixture();map.tiles[0].terrain=0;map.tiles[0].feature=0;
  const light=refineGlobal(map,{...defaults,vegetation:'denser',strength:'light'}),strong=refineGlobal(map,{...defaults,vegetation:'denser',strength:'strong'});
  assert.ok(strong.changed.length>light.changed.length);assert.deepEqual(strong,refineGlobal(map,{...defaults,vegetation:'denser',strength:'strong'}));assert.deepEqual(strong.map.tiles[0],map.tiles[0]);
  const thinner=refineGlobal(strong.map,{...defaults,vegetation:'sparser'});assert.ok(thinner.removedFeatures>0);
});
test('Global More/Fewer resources and relocation retain legality and honest totals',()=>{
  const map=fixture();for(let i=10;i<18;i++){map.tiles[i].resource=i%2?1:3;map.tiles[i].resourceAmount=i%2?3:1;}
  const more=refineGlobal(map,{...defaults,resources:'more'}),fewer=refineGlobal(map,{...defaults,resources:'fewer'}),moved=refineGlobal(map,{...defaults,resources:'redistribute',strength:'strong'});
  assert.equal(deposits(more.map).length,deposits(map).length+more.addedResources);assert.ok(more.addedResources>0);
  assert.equal(deposits(fewer.map).length,deposits(map).length-fewer.removedResources);assert.ok(fewer.removedResources>0);
  assert.deepEqual(deposits(moved.map),deposits(map));assert.ok(moved.movedResources>0);assert.ok(more.map.tiles.every(t=>resourcePlacementVerdict(more.map,t).valid));
});
test('Refinement preserves metadata, geometry and imported map round trips',()=>{
  const map=fixture(),before=structuredClone(map),original=serializeCiv5Map(map),parsed=parseCiv5Map(original,map.name);
  assert.deepEqual(refineGlobal(map,defaults).changed,[]);
  const edited=refineLocal(parsed,'woodland',[27],'strong'),bytes=updateCiv5Map(original,edited.map),roundTrip=parseCiv5Map(bytes,map.name);
  assert.deepEqual(roundTrip.tiles,edited.map.tiles);assert.deepEqual(map,before);assert.deepEqual(serializeCiv5Map(map),original);assert.equal(edited.map.width,parsed.width);assert.equal(edited.map.height,parsed.height);assert.equal(edited.map.description,parsed.description);
});
