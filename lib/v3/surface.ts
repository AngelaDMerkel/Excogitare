import type { Civ5Map } from '../civ5-map.ts';
import type { EngineNarrativeStageSnapshot } from '../engine-narrative-diagnostics.ts';
import { enforceGeneratedPlacementLegality } from '../map-generator.ts';
import { deterministicPassSeed } from '../generation-pass-graph.ts';
import { featurePlacementVerdict, isWaterTerrain } from '../civ5-rules.ts';
import { applyWorldArchetype } from '../world-archetype.ts';
import { markGenerationStructureStale } from '../generation-structure.ts';
import { adjacency, clamp, noise } from './spatial.ts';
import type { V3Request } from './request.ts';
import type { V3Plan } from './plan.ts';
export type ClimateEvidence = { source: 'NATIVE' | 'INFERRED'; temperature: number[]; moisture: number[]; changedTiles: number };
export function developV3Surface(source: Civ5Map, request: V3Request, plan: V3Plan, native?: EngineNarrativeStageSnapshot): { map: Civ5Map; climate: ClimateEvidence } {
  let map = { ...source, tiles: source.tiles.map(tile => ({ ...tile })) };
  const seed = deterministicPassSeed(request.seed, 'V3:climate', 1);
  const temperature = map.tiles.map((t, i) => clamp(native?.temperatures?.[i] ?? (1 - Math.abs((Math.floor(i / map.width) + .5) / map.height * 2 - 1)) * .85 - t.elevation * .08));
  const moisture = map.tiles.map((t, i) => clamp(native?.moistures?.[i] ?? ({ 2: .72, 3: .45, 4: .12, 5: .4, 6: .3 }[t.terrain] ?? .8)));
  if (request.mode === 'STANDARD') {
    const p = request.parameters, variety = { UNIFORM: .18, SUBTLE: .55, VARIED: 1, DRAMATIC: 1.6 }[p.regionalVariety];
    const thermalShift = { COLD: -.16, COOL: -.04, TEMPERATE: 0, WARM: .04, HOT: .14 }[p.climate];
    const friction = { VERY_SLOW: .9, SLOW: .7, MODERATE: .48, FAST: .25, VERY_FAST: .07 }[p.mobility];
    const isolation = ['OPEN', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'].indexOf(p.isolation) / 4;
    const harshness = ['GENTLE', 'MODERATE', 'DEMANDING', 'HARSH'].indexOf(p.challenge) / 3;
    const forest = map.features.indexOf('FEATURE_FOREST'), jungle = map.features.indexOf('FEATURE_JUNGLE'), marsh = map.features.indexOf('FEATURE_MARSH'), ice = map.features.indexOf('FEATURE_ICE');
    const coastDistance = new Int16Array(map.tiles.length).fill(-1), queue: number[] = [], graph = adjacency(map);
    map.tiles.forEach((tile, i) => { if (!isWaterTerrain(map, tile)) { coastDistance[i] = 0; queue.push(i); } });
    for (let cursor = 0; cursor < queue.length; cursor++) { const i = queue[cursor]; for (const j of graph[i]) if (coastDistance[j] < 0) { coastDistance[j] = coastDistance[i] + 1; queue.push(j); } }
    const coastWidth = [4, 3, 2, 1, 1][Math.round(isolation * 4)];
    const terrain = (name: string) => map.terrains.indexOf(`TERRAIN_${name}`);
    // Keep mountain abundance separate from local travel friction. Rank within
    // the existing ridges first, then add on high native relief if needed.
    const land = map.tiles.flatMap((tile, i) => !isWaterTerrain(map, tile) ? [i] : []);
    const target = Math.round(land.length * plan.recipe.settings.mountainPercent / 100);
    const rank = (i: number) => map.tiles[i].elevation * 4 + (native?.reliefValues?.[i] ?? noise(i % map.width / 7, Math.floor(i / map.width) / 7, seed));
    const mountains = new Set([...land].sort((a, b) => rank(b) - rank(a) || a - b).slice(0, target));
    for (const i of land) { if (mountains.has(i)) map.tiles[i].elevation = 2; else if (map.tiles[i].elevation === 2) map.tiles[i].elevation = 1; }
    for (let i = 0; i < map.tiles.length; i++) {
      const tile = map.tiles[i], x = i % map.width, y = Math.floor(i / map.width);
      const regional = noise(x / 9, y / 9, seed) - .5;
      temperature[i] = clamp(temperature[i] + thermalShift + regional * .12 * variety);
      moisture[i] = clamp(.52 + (moisture[i] - .52) * variety + regional * .3 * variety - harshness * .14);
      if (plan.isolationMechanism === 'DRY_INTERIOR') {
        const interior = 1 - Math.abs(x / Math.max(1, map.width - 1) - .5) * 2;
        moisture[i] = clamp(moisture[i] - Math.max(0, interior - .3) * isolation * .75);
      }
      if (isWaterTerrain(map, tile)) { tile.terrain = terrain(coastDistance[i] <= coastWidth ? 'COAST' : 'OCEAN'); tile.elevation = 0; tile.feature = temperature[i] < .13 && ice >= 0 ? ice : 255; continue; }
      const t = temperature[i], m = moisture[i];
      tile.terrain = terrain(t < .12 ? 'SNOW' : t < .27 ? 'TUNDRA' : m < .24 && t > .38 ? 'DESERT' : m > .5 ? 'GRASS' : 'PLAINS');
      if (tile.terrain < 0) throw new Error('The engine omitted a required terrain definition.');
      tile.feature = 255;
      if (tile.elevation === 2 || tile.wonder !== 255) continue;
      const adoption = noise(x / 2.3, y / 2.3, seed ^ 9217);
      if (adoption < friction * (m + .35)) {
        const feature = m > .72 && tile.elevation === 0 && t > .3 && adoption < friction * .18 ? marsh : t > .7 && m > .62 ? jungle : forest;
        if (feature >= 0 && featurePlacementVerdict(map, { ...tile, feature }).valid) tile.feature = feature;
      }
      if (tile.elevation === 0 && friction > .6 && noise(x / 4, y / 4, seed ^ 1831) < (friction - .6) * .5) tile.elevation = 1;
    }
  } else {
    map = applyWorldArchetype(map, plan.recipe.archetype, plan.recipe.archetypeIntensity);
  }
  enforceGeneratedPlacementLegality(map);
  const changedTiles = map.tiles.filter((tile, i) => tile.terrain !== source.tiles[i].terrain || tile.feature !== source.tiles[i].feature || tile.elevation !== source.tiles[i].elevation).length;
  map.structure = markGenerationStructureStale(map.structure, 'V3 develops climate and movement before its own content and starting-opportunity assessment.', ['CLIMATE', 'RELIEF', 'CONTENT', 'STARTS']);
  return { map, climate: { source: native?.temperatures && native?.moistures ? 'NATIVE' : 'INFERRED', temperature, moisture, changedTiles } };
}
