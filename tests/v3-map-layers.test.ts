import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCiv5Map, serializeCiv5Map, type Civ5Map } from '../lib/civ5-map.ts';
import { analyseMapLayers, mapResourceCategory, settlementLayerValues } from '../lib/v3/map-layers.ts';

function fixture(width = 7, height = 7): Civ5Map {
  return { name: 'Layer fixture', description: '', version: 12, worldSize: 'STANDARD', width, height, players: 2, wraps: false, source: 'generated',
    terrains: ['TERRAIN_OCEAN', 'TERRAIN_COAST', 'TERRAIN_GRASS', 'TERRAIN_PLAINS', 'TERRAIN_SNOW'],
    features: ['FEATURE_FOREST', 'FEATURE_JUNGLE', 'FEATURE_MARSH', 'FEATURE_ICE', 'FEATURE_OASIS'], wonders: ['FEATURE_LAKE_VICTORIA'],
    resources: ['RESOURCE_STONE', 'RESOURCE_IRON', 'RESOURCE_GOLD', 'RESOURCE_MOD_CRYSTAL'],
    tiles: Array.from({ length: width * height }, () => ({ terrain: 2, elevation: 0, feature: 255, resource: 255, resourceAmount: 0, wonder: 255, continent: 0, river: 0 })), startLocations: [] };
}
const start = (x: number, y: number, player: number, cityState = false) => ({ x, y, player, cityState, playable: !cityState, team: player, civilization: '', leader: '' });

test('Resource categories include expansion bonuses and do not mislabel mod resources', () => {
  for (const resource of ['STONE', 'BANANA', 'BISON', 'FISH']) assert.equal(mapResourceCategory(`RESOURCE_${resource}`), 'bonus');
  assert.equal(mapResourceCategory('RESOURCE_IRON'), 'strategic');
  assert.equal(mapResourceCategory('RESOURCE_GOLD'), 'luxury');
  assert.equal(mapResourceCategory('RESOURCE_MOD_CRYSTAL'), 'other');
  const map = fixture(); map.resources.forEach((_, i) => { map.tiles[i].resource = i; map.tiles[i].resourceAmount = 2; });
  const counts = analyseMapLayers(map).counts;
  for (const key of ['bonus', 'luxury', 'strategic', 'other']) assert.equal(counts[key], 1);
});

test('Freshwater follows both banks of encoded edges, including the wrap seam, without flow-only ghosts', () => {
  const map = fixture(); map.tiles[24].river = 1;
  let data = analyseMapLayers(map);
  assert.equal(data.counts.rivers, 1); assert.equal(data.freshwater[24], 1); assert.equal(data.freshwater[25], 1); assert.equal(data.freshwater[23], 0);
  map.tiles[24].river = 8; data = analyseMapLayers(map);
  assert.equal(data.counts.rivers, 0); assert.ok(data.freshwater.every(v => v === 0));
  map.wraps = true; map.tiles[27].river = 1; data = analyseMapLayers(map);
  assert.equal(data.freshwater[21], 1);
  for (const [y, bit, expected] of [[2, 2, 10], [2, 4, 9], [3, 2, 18], [3, 4, 17]]) {
    const edgeMap = fixture(); edgeMap.tiles[y * 7 + 3].river = bit;
    assert.equal(analyseMapLayers(edgeMap).freshwater[expected], 1);
  }
});

test('Lake inference handles wrapped components and excludes open boundaries and ocean terrain', () => {
  const map = fixture(); map.tiles[24].terrain = 1;
  let data = analyseMapLayers(map); assert.equal(data.counts.lakes, 1); assert.equal(data.lakes[24], 1); assert.equal(data.freshwater[25], 1);
  map.tiles[24].terrain = 0; assert.equal(analyseMapLayers(map).counts.lakes, 0);
  map.tiles[24].terrain = 2; map.tiles[21].terrain = 1; map.tiles[27].terrain = 1;
  assert.equal(analyseMapLayers(map).counts.lakes, 0);
  map.wraps = true; data = analyseMapLayers(map); assert.equal(data.counts.lakes, 1); assert.equal(data.lakes[21], 1); assert.equal(data.lakes[27], 1);
});

test('Movement and settlement estimates respect impassable terrain and reachable land', () => {
  const map = fixture(); map.tiles[0].terrain = 0; map.tiles[1].elevation = 2; map.tiles[2].elevation = 1; map.tiles[3].feature = 0;
  const data = analyseMapLayers(map); assert.deepEqual(data.movement.slice(0, 5), [null, Infinity, 2, 2, 1]);
  for (const tile of map.tiles) tile.elevation = 2;
  map.tiles[24].elevation = 0; map.tiles[48].elevation = 0; map.tiles[48].resource = 1;
  const scores = settlementLayerValues(map); assert.equal(scores[24], 2); assert.equal(scores[48], 3.5); assert.equal(scores[23], null);
});

test('Opening areas remain disjoint, ignore absent/invalid starts and recompute after edits', () => {
  const map = fixture(12, 7); map.startLocations = [start(2, 3, 0), start(9, 3, 1), start(6, 6, 2, true), start(999, 0, 3)];
  const before = analyseMapLayers(map); assert.equal(before.counts.players, 2); assert.equal(before.counts.cities, 1); assert.equal(before.starts.length, 2);
  assert.equal(before.starts[0].area.filter(i => before.starts[1].area.includes(i)).length, 0);
  const edited = structuredClone(map); edited.tiles[before.starts[0].index].resource = 1;
  assert.equal(analyseMapLayers(edited).starts[0].score, before.starts[0].score + 1.5);
  map.startLocations = []; const empty = analyseMapLayers(map); assert.equal(empty.starts.length, 0); assert.ok(empty.balance.every(v => v === null));
});

test('Analysis and views preserve map bytes and tile round trips', () => {
  const map = fixture(); map.tiles[24].resource = 1; map.tiles[24].resourceAmount = 3;
  const original = structuredClone(map), bytes = serializeCiv5Map(map);
  analyseMapLayers(map); settlementLayerValues(map);
  assert.deepEqual(map, original); assert.deepEqual(serializeCiv5Map(map), bytes);
  assert.deepEqual(parseCiv5Map(bytes, map.name).tiles, map.tiles);
});
