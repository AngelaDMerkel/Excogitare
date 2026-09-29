import type { Civ5Map, Civ5StartLocation } from '../civ5-map.ts';
import { isPassableLand, resourcePlacementVerdict, isWaterTerrain } from '../civ5-rules.ts';
import { generationOptionsFromRecipe } from '../generation-recipe.ts';
import { regenerateMapContent, enforceGeneratedPlacementLegality } from '../map-generator.ts';
import { adjacency, distance, reachable } from './spatial.ts';
import { randomStream, type V3Request } from './request.ts';
import type { V3Plan } from './plan.ts';
export const resourceGroup = (name: string) => /WHEAT|CATTLE|SHEEP|DEER|FISH/.test(name) ? 'bonus' : /IRON|HORSE/.test(name) ? 'earlyStrategic' : /COAL|OIL|ALUMINUM|URANIUM/.test(name) ? 'lateStrategic' : name ? 'luxury' : 'none';
export function openingAreas(map: Civ5Map, graph = adjacency(map)) {
  const starts = map.startLocations.filter(s => !s.cityState).map(s => s.y * map.width + s.x);
  return starts.map((start, player) => reachable(map, graph, start, 3).filter(i => !starts.some((other, j) => j !== player && (distance(map, i, other) < distance(map, i, start) || (distance(map, i, other) === distance(map, i, start) && j < player)))));
}
const startAt = (map: Civ5Map, index: number, player: number, cityState = false, team = player): Civ5StartLocation => ({ x: index % map.width, y: Math.floor(index / map.width), player, team, cityState, playable: !cityState, civilization: '', leader: '' });
export function placeV3Starts(source: Civ5Map, request: V3Request, plan: V3Plan): Civ5Map {
  if (request.mode === 'ADVANCED') return { ...source, startLocations: source.startLocations.map(start => ({ ...start })) };
  const map = { ...source, startLocations: [] as Civ5StartLocation[] }, graph = adjacency(map), options = generationOptionsFromRecipe(plan.recipe);
  const random = randomStream(request.seed, 'starts'), selected: number[] = [];
  const passable = map.tiles.flatMap((tile, i) => isPassableLand(map, tile) && tile.wonder === 255 ? [i] : []);
  const openingCache = new Map<number, number>();
  const quality = (i: number) => { if (!openingCache.has(i)) openingCache.set(i, reachable(map, graph, i, 3).reduce((score, j) => score + (/GRASS|PLAINS/.test(map.terrains[map.tiles[j].terrain]) ? 1.4 : .7), 0)); return openingCache.get(i)!; };
  const originalMajors = source.startLocations.filter(s => !s.cityState);
  const targets = plan.homelands.length ? plan.homelands : Array.from({ length: options.players }, (_, i) => originalMajors[i] ?? { x: Math.floor(random() * map.width), y: Math.floor(random() * map.height) });
  const shortlistLength = Math.max(30, Math.round(map.tiles.length / 45));
  const bestInRegions = targets.map(point => { const anchor = point.y * map.width + point.x; const nearby = [...passable].sort((a, b) => distance(map, a, anchor) - distance(map, b, anchor) || a - b).slice(0, shortlistLength); return Math.max(0, ...nearby.map(quality)); });
  const sharedQuality = Math.min(...bestInRegions);
  for (let player = 0; player < options.players; player++) {
    const anchor = targets[player].y * map.width + targets[player].x;
    const candidates = passable.filter(i => selected.every(other => distance(map, i, other) >= 7));
    candidates.sort((a, b) => distance(map, a, anchor) - distance(map, b, anchor) || a - b);
    const shortlist = candidates.slice(0, shortlistLength);
    const cost = (i: number) => Math.abs(quality(i) - sharedQuality) * 2 + distance(map, i, anchor) * .35;
    shortlist.sort((a, b) => cost(a) - cost(b) || a - b);
    const best = shortlist.find(i => reachable(map, graph, i, 3).length >= plan.minimumOpeningLand);
    if (best === undefined) throw new Error(`Not enough viable starting land for ${options.players} players. Try more land or a larger map.`);
    selected.push(best); map.startLocations.push(startAt(map, best, player, false, options.balance === 'TEAMS' ? Math.floor(player / options.teamSize) : player));
  }
  const shuffled = passable.map(i => ({ i, order: random() })).sort((a, b) => a.order - b.order);
  if (options.cityStateCoastalPreference === 'PREFER') shuffled.sort((a, b) => Number(graph[b.i].some(i => isWaterTerrain(map, map.tiles[i]))) - Number(graph[a.i].some(i => isWaterTerrain(map, map.tiles[i]))));
  for (const { i } of shuffled) {
    if (map.startLocations.length >= options.players + options.cityStates) break;
    if (selected.some(j => distance(map, i, j) < options.cityStateMinSpacing)) continue;
    if (options.cityStateCoastalPreference === 'REQUIRE' && !graph[i].some(j => isWaterTerrain(map, map.tiles[j]))) continue;
    const player = map.startLocations.length; selected.push(i); map.startLocations.push(startAt(map, i, player, true));
  }
  if (map.startLocations.length < options.players + options.cityStates) throw new Error('Not enough room for the requested city states and spacing. Reduce their count or increase map size.');
  map.players = options.players;
  return map;
}
export type BalanceChanges = { changedTiles: number; normalizedTiles: number; frontierPlacements: number; normalized: boolean; targets: Record<string, number> };
export function balanceV3Content(source: Civ5Map, request: V3Request, plan: V3Plan): { map: Civ5Map; changes: BalanceChanges } {
  const options = generationOptionsFromRecipe(plan.recipe), map = regenerateMapContent(source, options, 1);
  const normalize = request.mode === 'STANDARD';
  const areas = openingAreas(map), origins = new Set(map.startLocations.map(s => s.y * map.width + s.x));
  let frontierPlacements = 0;
  if (request.mode === 'STANDARD') {
    const protectedTiles = new Set(areas.flat()), starts = map.startLocations.filter(start => !start.cityState).map(start => start.y * map.width + start.x);
    const deposits = map.tiles.flatMap((tile, i) => !protectedTiles.has(i) && isPassableLand(map, tile) && ['luxury', 'lateStrategic'].includes(resourceGroup(map.resources[tile.resource] ?? '')) ? [{ resource: tile.resource, amount: tile.resourceAmount, original: i }] : []);
    for (const deposit of deposits) { map.tiles[deposit.original].resource = 255; map.tiles[deposit.original].resourceAmount = 0; }
    const shared = (i: number) => { const distances = starts.map(start => distance(map, start, i)).sort((a, b) => a - b); return 1 - (distances[1] - distances[0]) / Math.max(1, distances[0] + distances[1]); };
    const desired = .35 + plan.competition * .65, tie = randomStream(request.seed, 'frontiers');
    const sites = map.tiles.flatMap((tile, i) => !protectedTiles.has(i) && !origins.has(i) && isPassableLand(map, tile) && tile.wonder === 255 && tile.resource === 255 ? [{ i, cost: Math.abs(shared(i) - desired) + tie() * .03 }] : []).sort((a, b) => a.cost - b.cost || a.i - b.i);
    for (const deposit of deposits) { const spot = sites.find(({ i }) => map.tiles[i].resource === 255 && resourcePlacementVerdict(map, { ...map.tiles[i], resource: deposit.resource }).valid); if (!spot) throw new Error('The resource frontier could not retain every deposit.'); map.tiles[spot.i].resource = deposit.resource; map.tiles[spot.i].resourceAmount = deposit.amount; frontierPlacements += Number(spot.i !== deposit.original); }
  }
  const beforeNormalization = map.tiles.map(tile => [tile.resource, tile.resourceAmount]);
  const targets: Record<string, number> = normalize ? { bonus: plan.resourceFloor, luxury: 1, earlyStrategic: 2 } : {};
  const random = randomStream(request.seed, 'balance');
  if (normalize) {
    for (const area of areas) {
      // Give each opening the same early resource budget. Preserve late-game
      // deposits and wonders; variation remains in terrain and expansion land.
      for (const i of area) if (['bonus', 'luxury', 'earlyStrategic'].includes(resourceGroup(map.resources[map.tiles[i].resource] ?? ''))) { map.tiles[i].resource = 255; map.tiles[i].resourceAmount = 0; }
      for (const group of ['bonus', 'luxury', 'earlyStrategic']) {
        const choices = map.resources.flatMap((name, i) => resourceGroup(name) === group && !/FISH|PEARL|WHALE|CRAB/.test(name) ? [i] : []);
        for (let count = 0; count < targets[group]; count++) {
          const candidates = area.filter(i => !origins.has(i) && map.tiles[i].wonder === 255 && map.tiles[i].resource === 255).map(i => ({ i, order: random() })).sort((a, b) => a.order - b.order);
          const offset = Math.floor(random() * choices.length);
          const resources = group === 'earlyStrategic' ? [map.resources.indexOf(count % 2 ? 'RESOURCE_HORSE' : 'RESOURCE_IRON')] : [...choices.slice(offset), ...choices.slice(0, offset)];
          let placed = false;
          for (const resource of resources) {
            const spot = candidates.find(({ i }) => resourcePlacementVerdict(map, { ...map.tiles[i], resource }).valid);
            if (!spot) continue;
            map.tiles[spot.i].resource = resource; map.tiles[spot.i].resourceAmount = group === 'earlyStrategic' ? 2 : 1; placed = true; break;
          }
          if (!placed) throw new Error('A starting region cannot support its resource budget. Try more open land.');
        }
      }
    }
  }
  enforceGeneratedPlacementLegality(map);
  const changedTiles = map.tiles.filter((tile, i) => tile.resource !== source.tiles[i].resource || tile.resourceAmount !== source.tiles[i].resourceAmount).length;
  return { map, changes: { changedTiles, normalizedTiles: map.tiles.filter((tile, i) => tile.resource !== beforeNormalization[i][0] || tile.resourceAmount !== beforeNormalization[i][1]).length, frontierPlacements, normalized: normalize, targets } };
}
