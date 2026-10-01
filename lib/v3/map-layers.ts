import type { Civ5Map } from '../civ5-map.ts';
import { isPassableLand, isWaterTerrain } from '../civ5-rules.ts';
import { riverEdgeDefinitions } from '../rivers.ts';
import { adjacency, reachable } from './spatial.ts';
import { openingAreas } from './balance.ts';

const bonus = new Set(['WHEAT', 'CATTLE', 'SHEEP', 'DEER', 'FISH', 'STONE', 'BANANA', 'BISON']);
const strategic = new Set(['IRON', 'HORSE', 'COAL', 'OIL', 'ALUMINUM', 'URANIUM']);
const luxury = new Set(['GOLD', 'SILVER', 'GEMS', 'SPICES', 'FURS', 'DYES', 'SUGAR', 'COTTON', 'WINE', 'INCENSE', 'IVORY', 'PEARLS', 'WHALE', 'SALT', 'TRUFFLES', 'CRAB', 'CITRUS', 'COPPER', 'COCOA', 'NUTMEG', 'CLOVES', 'PEPPER', 'JEWELRY', 'PORCELAIN']);
export function mapResourceCategory(name: string): 'bonus' | 'luxury' | 'strategic' | 'other' {
  const key = name.replace(/^RESOURCE_/, '');
  return bonus.has(key) ? 'bonus' : strategic.has(key) ? 'strategic' : luxury.has(key) ? 'luxury' : 'other';
}

/** Same opening-terrain estimate used by V3 assessment; not city yields or game fairness. */
export function openingTerrainValue(map: Civ5Map, area: number[]) {
  return Math.round(area.reduce((sum, i) => {
    const tile = map.tiles[i], terrain = map.terrains[tile.terrain] ?? '';
    return sum + (/GRASS|PLAINS/.test(terrain) ? 2 : /SNOW/.test(terrain) ? .25 : 1) + (tile.elevation === 1 ? .7 : 0) + (tile.resource !== 255 ? 1.5 : 0);
  }, 0) * 10) / 10;
}

export function analyseMapLayers(map: Civ5Map) {
  const graph = adjacency(map), n = map.tiles.length;
  const water = map.tiles.map(t => isWaterTerrain(map, t));
  const lakes = new Uint8Array(n), riverTouch = new Uint8Array(n), freshwater = new Uint8Array(n);
  const counts: Record<string, number> = { relief: 0, woods: 0, wetlands: 0, rivers: 0, lakes: 0, ice: 0, bonus: 0, luxury: 0, strategic: 0, other: 0, players: 0, cities: 0, wonders: 0 };
  const seen = new Uint8Array(n);
  // The file has no lake flag. Infer only enclosed coastal components of up to ten tiles.
  for (let i = 0; i < n; i++) {
    if (!water[i] || seen[i]) continue;
    const component = [i]; seen[i] = 1; let boundary = false, coastal = true;
    for (let j = 0; j < component.length; j++) {
      const k = component[j], x = k % map.width, y = Math.floor(k / map.width);
      if (y === 0 || y === map.height - 1 || (!map.wraps && (x === 0 || x === map.width - 1))) boundary = true;
      if (!(map.terrains[map.tiles[k].terrain] ?? '').includes('COAST')) coastal = false;
      for (const next of graph[k]) if (water[next] && !seen[next]) { seen[next] = 1; component.push(next); }
    }
    if (!boundary && coastal && component.length <= 10) { counts.lakes++; for (const k of component) lakes[k] = 1; }
  }
  const movement = map.tiles.map((tile, i) => {
    const feature = map.features[tile.feature] ?? '';
    if (water[i]) return null;
    if (!isPassableLand(map, tile) || /ICE/.test(feature)) return Infinity;
    return 1 + Number(tile.elevation === 1 || /FOREST|JUNGLE|MARSH/.test(feature));
  });
  map.tiles.forEach((tile, i) => {
    const feature = map.features[tile.feature] ?? '', x = i % map.width, y = Math.floor(i / map.width);
    if (tile.elevation > 0) counts.relief++;
    if (/FOREST|JUNGLE/.test(feature)) counts.woods++;
    if (/MARSH|FLOOD|OASIS/.test(feature)) counts.wetlands++;
    if (/ICE/.test(feature)) counts.ice++;
    if (tile.resource !== 255) counts[mapResourceCategory(map.resources[tile.resource] ?? '')]++;
    if (tile.wonder !== 255) counts.wonders++;
    for (const edge of riverEdgeDefinitions(x, y)) if (tile.river & edge.bit) {
      counts.rivers++; riverTouch[i] = 1;
      const nx = map.wraps ? (x + edge.dx + map.width) % map.width : x + edge.dx, ny = y + edge.dy;
      if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) riverTouch[ny * map.width + nx] = 1;
    }
  });
  map.tiles.forEach((tile, i) => {
    const sources = [i, ...graph[i]].some(j => lakes[j] || /OASIS/.test(map.features[map.tiles[j].feature] ?? '') || /LAKE_VICTORIA/.test(map.wonders[map.tiles[j].wonder] ?? ''));
    if (!water[i] && (riverTouch[i] || sources)) freshwater[i] = 1;
  });
  const validStarts = map.startLocations.filter(s => Number.isInteger(s.x) && Number.isInteger(s.y) && s.x >= 0 && s.x < map.width && s.y >= 0 && s.y < map.height);
  counts.players = validStarts.filter(s => !s.cityState).length; counts.cities = validStarts.filter(s => s.cityState).length;
  const majorStarts = validStarts.filter(s => !s.cityState && isPassableLand(map, map.tiles[s.y * map.width + s.x]));
  const areas = openingAreas({ ...map, startLocations: majorStarts }, graph);
  const starts = majorStarts.map((start, i) => ({ player: start.player, index: start.y * map.width + start.x, area: areas[i], score: openingTerrainValue(map, areas[i]) }));
  const balance = new Array<number | null>(n).fill(null);
  starts.forEach(start => start.area.forEach(i => { balance[i] = start.score; }));
  return { counts, water, lakes, riverTouch, freshwater, movement, starts, balance, validStarts };
}

/** Reachable terrain within three land steps; a geographic estimate, not a legal-city test. */
export function settlementLayerValues(map: Civ5Map) {
  const graph = adjacency(map);
  return map.tiles.map((tile, i) => isPassableLand(map, tile) && tile.wonder === 255 ? openingTerrainValue(map, reachable(map, graph, i, 3)) : null);
}
