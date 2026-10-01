import type { Civ5Map, Civ5Tile } from '../civ5-map.ts';
import { featurePlacementVerdict, resourcePlacementVerdict, wonderPlacementVerdict, isWaterTerrain } from '../civ5-rules.ts';
import { adjacency, noise } from './spatial.ts';
import { mapResourceCategory } from './map-layers.ts';

export type RefineStrength = 'light' | 'moderate' | 'strong';
export type LocalRefinement = 'pass' | 'flatten' | 'woodland' | 'thin' | 'drain' | 'oasis' | 'redistribute';
export type GlobalRefinement = {
  climate: 'unchanged' | 'cooler' | 'warmer' | 'drier' | 'wetter';
  relief: 'unchanged' | 'flatter' | 'rugged' | 'lower';
  vegetation: 'unchanged' | 'sparser' | 'denser';
  resources: 'unchanged' | 'fewer' | 'more' | 'redistribute';
  strength: RefineStrength;
};
export type RefineResult = { map: Civ5Map; changed: number[]; removedFeatures: number; removedResources: number; movedResources: number; addedResources: number };
const strengths = { light: .2, moderate: .5, strong: 1 };

function selected(map: Civ5Map, indices: number[]) {
  if (indices.some(i => !Number.isInteger(i) || i < 0 || i >= map.tiles.length)) throw new Error('Select the area again; this selection belongs to another map.');
  return [...new Set(indices)];
}
function newPlacementError(map: Civ5Map, before: Civ5Tile, after: Civ5Tile) {
  return [featurePlacementVerdict, resourcePlacementVerdict, wonderPlacementVerdict].some(check => check(map, before).valid && !check(map, after).valid);
}
function fraction(strength: RefineStrength) {
  if (!Object.hasOwn(strengths, strength)) throw new Error('Choose a valid refinement strength.');
  return strengths[strength];
}
function rank(map: Civ5Map, indices: number[], amount: number, score: (i: number) => number = () => 0) {
  // Coherent spatial variation avoids a row-order bias; existing geography supplies the main rank.
  const value = (i: number) => score(i) + noise(i % map.width / 5, Math.floor(i / map.width) / 5, 7411) * .25;
  return [...indices].map(i => ({ i, score: value(i) })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, Math.ceil(indices.length * amount)).map(x => x.i);
}
function result(source: Civ5Map, map: Civ5Map, movedResources = 0): RefineResult {
  const changed: number[] = []; let removedFeatures = 0, removedResources = 0, addedResources = 0;
  map.tiles.forEach((tile, i) => {
    const before = source.tiles[i];
    if (JSON.stringify(before) !== JSON.stringify(tile)) changed.push(i);
    if (before.feature !== 255 && tile.feature === 255) removedFeatures++;
    if (before.resource !== 255 && tile.resource === 255) removedResources++;
    if (before.resource === 255 && tile.resource !== 255) addedResources++;
  });
  return { map, changed, removedFeatures, removedResources: Math.max(0, removedResources - movedResources), addedResources: Math.max(0, addedResources - movedResources), movedResources };
}
function relocate(map: Civ5Map, indices: number[], amount: number) {
  const sources = rank(map, indices.filter(i => map.tiles[i].resource !== 255 && map.tiles[i].wonder === 255), amount);
  const targets = rank(map, indices.filter(i => map.tiles[i].resource === 255 && map.tiles[i].wonder === 255 && map.tiles[i].elevation < 2 && !/ICE/.test(map.features[map.tiles[i].feature] ?? '')), 1);
  const used = new Set<number>(); let moved = 0;
  for (const i of sources) {
    const source = map.tiles[i], target = targets.find(j => !used.has(j) && resourcePlacementVerdict(map, { ...map.tiles[j], resource: source.resource, resourceAmount: source.resourceAmount }).valid);
    if (target === undefined) continue;
    map.tiles[target].resource = source.resource; map.tiles[target].resourceAmount = source.resourceAmount;
    source.resource = 255; source.resourceAmount = 0; used.add(target); moved++;
  }
  return moved;
}

export function refineLocal(source: Civ5Map, action: LocalRefinement, indices: number[], strength: RefineStrength = 'moderate'): RefineResult {
  if (!['pass','flatten','woodland','thin','drain','oasis','redistribute'].includes(action)) throw new Error('Choose a valid local adjustment.');
  const scope = selected(source, indices), amount = fraction(strength);
  if (!scope.length) throw new Error('Select a region, area or tile before previewing a local change.');
  const map = structuredClone(source), graph = adjacency(map);
  if (action === 'redistribute') return result(source, map, relocate(map, scope, amount));
  const forest = map.features.indexOf('FEATURE_FOREST'), oasis = map.features.indexOf('FEATURE_OASIS');
  if (action === 'woodland' && forest < 0) throw new Error('This map has no forest definition.');
  if (action === 'oasis' && oasis < 0) throw new Error('This map has no oasis definition.');
  const candidates = new Map<number, Civ5Tile>();
  for (const i of scope) {
    const original = map.tiles[i]; if (isWaterTerrain(map, original) || original.wonder !== 255) continue;
    const tile = { ...original }, feature = map.features[tile.feature] ?? '';
    if (action === 'pass' && tile.elevation === 2) tile.elevation = 1;
    else if (action === 'flatten' && tile.elevation === 1) tile.elevation = 0;
    else if (action === 'woodland' && tile.feature === 255) tile.feature = forest;
    else if (action === 'oasis' && tile.feature === 255) tile.feature = oasis;
    else if (action === 'thin' && /FOREST|JUNGLE/.test(feature)) tile.feature = 255;
    else if (action === 'drain' && /MARSH/.test(feature)) tile.feature = 255;
    else continue;
    if (!newPlacementError(map, original, tile)) candidates.set(i, tile);
  }
  const proximity = (i: number) => graph[i].filter(j => /FOREST|JUNGLE/.test(map.features[map.tiles[j].feature] ?? '')).length;
  for (const i of rank(map, [...candidates.keys()], amount, action === 'woodland' ? proximity : () => 0)) map.tiles[i] = candidates.get(i)!;
  return result(source, map);
}

export function refineGlobal(source: Civ5Map, options: GlobalRefinement): RefineResult {
  const amount = fraction(options.strength), map = structuredClone(source), graph = adjacency(map), touched = new Set<number>();
  const all = map.tiles.map((_, i) => i), land = (i: number) => !isWaterTerrain(map, map.tiles[i]) && map.tiles[i].wonder === 255;
  const choose = (predicate: (i: number) => boolean, score: (i: number) => number = () => 0) => rank(map, all.filter(predicate), amount, score);
  const climates: Record<string, Record<string, string>> = {
    warmer: { SNOW: 'TUNDRA', TUNDRA: 'PLAINS', GRASS: 'PLAINS' },
    cooler: { DESERT: 'PLAINS', PLAINS: 'TUNDRA', GRASS: 'PLAINS', TUNDRA: 'SNOW' },
    drier: { GRASS: 'PLAINS', PLAINS: 'DESERT' }, wetter: { DESERT: 'PLAINS', PLAINS: 'GRASS' },
  };
  if (options.climate !== 'unchanged') {
    const changes = climates[options.climate]; if (!changes) throw new Error('Choose a valid climate adjustment.');
    const target = (i: number) => map.terrains.indexOf(`TERRAIN_${changes[(source.terrains[source.tiles[i].terrain] ?? '').replace('TERRAIN_', '')]}`);
    for (const i of choose(i => land(i) && target(i) >= 0, i => graph[i].filter(j => source.tiles[j].terrain === target(i)).length)) { map.tiles[i].terrain = target(i); touched.add(i); }
    const ice = map.features.indexOf('FEATURE_ICE');
    if (options.climate === 'warmer') {
      for (const i of choose(i => isWaterTerrain(map, map.tiles[i]) && map.tiles[i].wonder === 255 && /ICE/.test(map.features[map.tiles[i].feature] ?? ''),
        i => graph[i].filter(j => isWaterTerrain(source, source.tiles[j]) && !/ICE/.test(source.features[source.tiles[j].feature] ?? '')).length)) { map.tiles[i].feature = 255; touched.add(i); }
    } else if (options.climate === 'cooler' && ice >= 0) {
      for (const i of choose(i => isWaterTerrain(map, map.tiles[i]) && map.tiles[i].feature === 255 && map.tiles[i].resource === 255 && map.tiles[i].wonder === 255 &&
        graph[i].some(j => /ICE/.test(source.features[source.tiles[j].feature] ?? '') || /SNOW|TUNDRA/.test(source.terrains[source.tiles[j].terrain] ?? '')))) { map.tiles[i].feature = ice; touched.add(i); }
    }
  }
  if (options.relief !== 'unchanged') {
    if (!['flatter', 'rugged', 'lower'].includes(options.relief)) throw new Error('Choose a valid relief adjustment.');
    const candidates = new Map<number, Civ5Tile>();
    for (const i of all) {
      const tile = map.tiles[i]; if (!land(i) || ![0,1,2].includes(tile.elevation)) continue;
      if (options.relief === 'rugged' ? tile.elevation !== 0 : options.relief === 'lower' ? tile.elevation !== 2 : tile.elevation < 1) continue;
      const next = { ...tile, elevation: options.relief === 'rugged' ? 1 : tile.elevation - 1 };
      if (!newPlacementError(map, tile, next)) candidates.set(i, next);
    }
    for (const i of rank(map, [...candidates.keys()], amount, i => graph[i].filter(j => source.tiles[j].elevation > 0).length)) { map.tiles[i] = candidates.get(i)!; touched.add(i); }
  }
  const forest = map.features.indexOf('FEATURE_FOREST');
  if (options.vegetation === 'denser') {
    if (forest < 0) throw new Error('This map has no forest definition.');
    for (const i of choose(i => land(i) && map.tiles[i].feature === 255 && featurePlacementVerdict(map, { ...map.tiles[i], feature: forest }).valid,
      i => graph[i].filter(j => /FOREST|JUNGLE/.test(map.features[source.tiles[j].feature] ?? '')).length)) { map.tiles[i].feature = forest; touched.add(i); }
  } else if (options.vegetation === 'sparser') {
    for (const i of choose(i => land(i) && /FOREST|JUNGLE/.test(map.features[map.tiles[i].feature] ?? ''))) { map.tiles[i].feature = 255; touched.add(i); }
  } else if (options.vegetation !== 'unchanged') throw new Error('Choose a valid vegetation adjustment.');

  // Climate changes can invalidate existing content. Remove only newly incompatible items,
  // and report every removal in the result for the preview; unrelated old errors remain.
  for (const i of touched) {
    const before = source.tiles[i], tile = map.tiles[i];
    if (featurePlacementVerdict(source, before).valid && !featurePlacementVerdict(map, tile).valid) tile.feature = 255;
    if (resourcePlacementVerdict(source, before).valid && !resourcePlacementVerdict(map, tile).valid) { tile.resource = 255; tile.resourceAmount = 0; }
  }
  let moved = 0;
  if (options.resources === 'redistribute') moved = relocate(map, all, amount);
  else if (options.resources === 'fewer') {
    for (const i of rank(map, all.filter(i => map.tiles[i].resource !== 255 && map.tiles[i].wonder === 255), amount * .5)) { map.tiles[i].resource = 255; map.tiles[i].resourceAmount = 0; }
  } else if (options.resources === 'more') {
    const existing = source.tiles.filter(t => t.resource !== 255), present = [...new Set(existing.map(t => t.resource))].filter(i => !!map.resources[i]);
    const choices = present.length ? present : map.resources.flatMap((name, i) => mapResourceCategory(name) !== 'other' ? [i] : []);
    if (!choices.length) throw new Error('This map has no supported resource definitions.');
    const target = Math.max(1, Math.ceil(Math.max(existing.length, map.tiles.length * .03) * amount * .5)); let added = 0;
    const sites = rank(map, all.filter(i => map.tiles[i].resource === 255 && map.tiles[i].wonder === 255 && map.tiles[i].elevation < 2 && !/ICE/.test(map.features[map.tiles[i].feature] ?? '')), 1);
    for (const i of sites) {
      const rotated = [...choices.slice(added % choices.length), ...choices.slice(0, added % choices.length)];
      const resource = rotated.find(resource => resourcePlacementVerdict(map, { ...map.tiles[i], resource }).valid);
      if (resource === undefined) continue;
      map.tiles[i].resource = resource; map.tiles[i].resourceAmount = mapResourceCategory(map.resources[resource]) === 'strategic' ? 2 : 1;
      if (++added >= target) break;
    }
  } else if (options.resources !== 'unchanged') throw new Error('Choose a valid resource adjustment.');
  return result(source, map, moved);
}
