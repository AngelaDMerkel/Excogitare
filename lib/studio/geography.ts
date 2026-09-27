import type { Civ5Map, Civ5Tile } from "../civ5-map.ts";
import { featurePlacementVerdict, isWaterTerrain, resourcePlacementVerdict, wonderPlacementVerdict } from "../civ5-rules.ts";
import { generateRiverNetwork } from "../map-generator.ts";
import { reconstructCiv5RiverEdgeSystems } from "../rivers.ts";
import { markGenerationStructureStale } from "../generation-structure.ts";
import type { EngineNarrativeStageSnapshot } from "../engine-narrative-diagnostics.ts";
import { clamp, hash, random, type Cause, type Feature, type Fields, type StudioRecipe, type World } from "./model.ts";
import { adjacency, components, drainageTree, paths, region, tileDistance, trace } from "./spatial.ts";
export { adjacency, components } from "./spatial.ts";
const terrainIndex = (map: Civ5Map, suffix: string, fallback: number) => { const i = map.terrains.findIndex(t => t.endsWith(`_${suffix}`)); return i < 0 ? fallback : i; };
const featureIndex = (map: Civ5Map, suffix: string) => { const i = map.features.findIndex(t => t.endsWith(`_${suffix}`)); return i < 0 ? 255 : i; };

/** Only imports and old projects require inference. Native tile output is never repainted here. */
export function inferFields(map: Civ5Map): Fields {
  const elevation = map.tiles.map((tile, i) => isWaterTerrain(map, tile) ? (/COAST/.test(map.terrains[tile.terrain]) ? .42 : .25) : [.56, .72, .89][tile.elevation] + (hash(`inferred:${i}`) % 1000) * .00003);
  return { elevation, moisture: map.tiles.map(tile => /DESERT|SNOW/.test(map.terrains[tile.terrain]) ? .15 : /GRASS/.test(map.terrains[tile.terrain]) ? .72 : .4), temperature: map.tiles.map(tile => /SNOW/.test(map.terrains[tile.terrain]) ? .05 : /TUNDRA/.test(map.terrains[tile.terrain]) ? .22 : /DESERT/.test(map.terrains[tile.terrain]) ? .8 : .6), drainage: drainageTree(map, elevation).downstream };
}
export function fieldsFromNative(map: Civ5Map, snapshot?: EngineNarrativeStageSnapshot): Fields {
  const inferred = inferFields(map);
  if (!snapshot?.reliefValues || snapshot.reliefValues.length !== map.tiles.length) return inferred;
  const groups = Array.from({ length: 4 }, () => [] as number[]);
  const classOf = (tile: Civ5Tile) => isWaterTerrain(map, tile) ? 0 : tile.elevation + 1;
  map.tiles.forEach((tile, i) => groups[classOf(tile)].push(snapshot.reliefValues![i]));
  const extent = groups.map(values => values.reduce(([low, high], v) => [Math.min(low, v), Math.max(high, v)], [Infinity, -Infinity]));
  const bands = [[.05, .47], [.52, .65], [.68, .81], [.84, .98]];
  const elevation = map.tiles.map((tile, i) => { const group = classOf(tile), [low, high] = extent[group], [a, b] = bands[group]; return a + (b - a) * (high > low ? clamp((snapshot.reliefValues![i] - low) / (high - low)) : .5); });
  return { elevation, moisture: snapshot.moistures?.map(v => clamp(v)) ?? inferred.moisture, temperature: snapshot.temperatures?.map(v => clamp(v)) ?? inferred.temperature, drainage: drainageTree(map, elevation).downstream };
}
export function cleanPlacements(map: Civ5Map, scope?: Iterable<number>) {
  for (const i of scope ?? map.tiles.keys()) {
    const tile = map.tiles[i];
    if (!Number.isInteger(tile.terrain) || !map.terrains[tile.terrain]) tile.terrain = terrainIndex(map, "OCEAN", 0);
    if (![0, 1, 2].includes(tile.elevation) || isWaterTerrain(map, tile)) tile.elevation = 0;
    if (!featurePlacementVerdict(map, tile).valid) tile.feature = 255;
    if (!resourcePlacementVerdict(map, tile).valid) { tile.resource = 255; tile.resourceAmount = 0; }
    if (!wonderPlacementVerdict(map, tile).valid) tile.wonder = 255;
    if (tile.wonder !== 255) { tile.resource = 255; tile.resourceAmount = 0; }
  }
  return map;
}
function eventSurface(world: World, recipe: StudioRecipe) {
  const { map } = world, graph = adjacency(map), elevation = [...world.base], warming = new Array<number>(map.tiles.length).fill(0);
  const causes: Cause[] = [];
  for (const event of recipe.events) {
    let cx = event.x * (map.width - 1), cy = event.y * (map.height - 1);
    const radius = Math.max(2, event.radius * Math.min(map.width, map.height * .866));
    if (event.placement && event.placement !== "FIXED") {
      const baselineMap = { ...map, tiles: world.substrate.tiles };
      const distanceToWater = paths(graph, baselineMap.tiles.flatMap((tile, i) => isWaterTerrain(baselineMap, tile) ? [i] : []), () => 1).distance;
      const candidates = baselineMap.tiles.flatMap((tile, i) => !isWaterTerrain(baselineMap, tile) && tile.elevation < 2 && (event.placement !== "ICE_MARGIN" || world.substrate.fields.temperature[i] < .35) ? [i] : []);
      const score = (i: number) => {
        let dx = Math.abs(i % map.width - cx); if (map.wraps) dx = Math.min(dx, map.width - dx);
        const separation = Math.hypot(dx, (Math.floor(i / map.width) - cy) * .866);
        const setting = event.placement === "INLAND" ? Math.min(radius, distanceToWater[i]) * .8 : -Math.abs(distanceToWater[i] - 2) * .5;
        return setting - separation * .8;
      };
      candidates.sort((a, b) => score(b) - score(a) || a - b);
      if (!candidates.length) throw new Error(`No ${event.placement === "INLAND" ? "continental interior" : "cold ice margin"} fits this event. Choose a fixed location or another foundation.`);
      cx = candidates[0] % map.width; cy = Math.floor(candidates[0] / map.width);
    }
    const footprint: number[] = [], before = [...elevation];
    for (let i = 0; i < elevation.length; i++) {
      let dx = i % map.width - cx; if (map.wraps && Math.abs(dx) > map.width / 2) dx -= Math.sign(dx) * map.width;
      const dy = (Math.floor(i / map.width) - cy) * .866, d = Math.hypot(dx, dy) / radius;
      if (d >= 1.65) continue;
      footprint.push(i);
      const angle = Math.atan2(dy, dx), irregular = 1 + .08 * Math.sin(angle * 5 + hash(event.id) % 17) + .035 * Math.cos(angle * 9);
      const taper = (1 - Math.min(1, Math.max(0, d - 1.2) / .45)) ** 2;
      const rim = Math.exp(-(((d - irregular) / (.13 + event.age * .16)) ** 2)), basin = Math.max(0, 1 - d * d) ** 2;
      if (event.kind === "CRATERS" || event.kind === "FLOOD") elevation[i] = clamp(elevation[i] + event.intensity * taper * (rim * .38 * (1 - event.age * .65) - basin * (event.kind === "FLOOD" ? .5 : .4)));
      else if (event.kind === "THAW") { warming[i] += event.intensity * Math.max(0, 1 - d / 1.65) * (.3 + event.age * .35); elevation[i] = clamp(elevation[i] - event.intensity * basin * .12); }
    }
    if (event.kind === "RUINS" && footprint.length) {
      const center = footprint.reduce((best, i) => Math.hypot(i % map.width - cx, Math.floor(i / map.width) - cy) < Math.hypot(best % map.width - cx, Math.floor(best / map.width) - cy) ? i : best);
      const destination = footprint.filter(i => tileDistance(map, i, center) > radius * .8).sort((a, b) => elevation[a] - elevation[b] || a - b)[0] ?? center;
      const allowed = new Set(footprint), route = paths(graph, [center], (_, j) => allowed.has(j) ? 1 + elevation[j] * 3 : Infinity);
      for (const i of trace(route.previous, destination)) { elevation[i] = clamp(elevation[i] - event.intensity * .3); for (const j of graph[i]) if (allowed.has(j) && hash(`${event.id}:${j}`) % 100 > event.age * 75) elevation[j] = clamp(elevation[j] + event.intensity * .075); }
    }
    // Age changes the event's material contribution, not unrelated terrain.
    if (event.age > 0) for (const i of footprint) { const delta = elevation[i] - before[i]; const nearby = graph[i].reduce((sum, j) => sum + elevation[j] - before[j], 0) / Math.max(1, graph[i].length); elevation[i] = clamp(before[i] + delta * (1 - event.age * .25) + nearby * event.age * .25); }
    causes.push({ id: event.id, kind: event.kind, label: event.kind === "FLOOD" ? "Impact, deposited water and breached basins" : event.kind === "CRATERS" ? "Impact excavation and eroded rim" : event.kind === "THAW" ? "Retreating ice and meltwater" : "Excavation and abandoned embankments", tiles: footprint, parentIds: [world.substrate.id], inferred: false });
  }
  for (const [order, stroke] of world.strokes.entries()) {
    for (const i of stroke.tiles) { if (i < 0 || i >= elevation.length) continue; if (stroke.kind === "RIDGE") elevation[i] = clamp(elevation[i] + stroke.strength * .27); if (stroke.kind === "BASIN") elevation[i] = clamp(elevation[i] - stroke.strength * .34); if (stroke.kind === "LAND") elevation[i] = Math.max(.54, clamp(elevation[i] + stroke.strength * .3)); if (stroke.kind === "PASS") elevation[i] = Math.min(.65, elevation[i]); }
    if (stroke.kind === "PAINT") for (const i of stroke.tiles) {
      const before = world.substrate.tiles[i], terrain = stroke.terrain ?? before.terrain;
      if (isWaterTerrain(map, { ...before, terrain })) elevation[i] = Math.min(.47, elevation[i]);
      else if (stroke.elevation !== undefined && stroke.elevation !== before.elevation) elevation[i] = [.57, .74, .91][stroke.elevation] ?? elevation[i];
      else if (stroke.terrain !== undefined && isWaterTerrain(map, before)) elevation[i] = Math.max(.55, elevation[i]);
    }
    const selected = new Set(stroke.tiles);
    causes.push({ id: `edit-${order}-${hash(stroke.tiles.join(","))}`, kind: stroke.kind, label: `${stroke.kind.toLowerCase()} development`, tiles: [...stroke.tiles], parentIds: world.features.filter(f => f.tiles.some(i => selected.has(i))).map(f => f.id), inferred: false });
  }
  const erosionDelta = (recipe.erosion - world.substrate.recipe.erosion) / 100;
  if (erosionDelta !== 0) {
    const before = [...elevation], drainage = drainageTree(map, before, graph), sediment = new Array<number>(elevation.length).fill(0);
    for (const i of [...drainage.order].reverse()) {
      const outlet = drainage.downstream[i]; if (before[i] < .5 || outlet < 0) continue;
      const drop = Math.max(0, before[i] - before[outlet]);
      if (erosionDelta > 0) {
        const removed = Math.min(Math.max(0, before[i] - .501), drop * erosionDelta * .22);
        elevation[i] -= removed;
        const deposition = before[outlet] >= .5 && drop < .09 ? .65 : .15;
        elevation[i] = clamp(elevation[i] + sediment[i] * deposition);
        sediment[outlet] += removed + sediment[i] * (1 - deposition);
      } else {
        const mean = graph[i].reduce((sum, j) => sum + before[j], 0) / Math.max(1, graph[i].length);
        elevation[i] = clamp(Math.max(.501, before[i] + (before[i] - mean) * -erosionDelta * .25));
      }
    }
  }
  return { elevation, warming, causes };
}
export function transformedSurface(world: World, recipe: StudioRecipe) { return eventSurface(world, recipe).elevation; }
function waterBudget(map: Civ5Map, elevation: number[], water: Set<number>, recipe: StudioRecipe, locked: Set<number>, graph: number[][], allowed?: Set<number>) {
  const n = map.tiles.length, min = Math.round(recipe.water[0] / 100 * n), max = Math.round(recipe.water[1] / 100 * n), target = Math.max(min, Math.min(max, water.size)), grow = water.size < target;
  while (water.size !== target) {
    const boundary = map.tiles.flatMap((_, i) => !locked.has(i) && (!allowed || allowed.has(i)) && water.has(i) !== grow && graph[i].some(j => water.has(j) === grow) ? [i] : []);
    if (!boundary.length) throw new Error("The water range cannot fit this local intervention while preserving unrelated shores. Widen the range or reduce its extent.");
    boundary.sort((a, b) => grow ? elevation[a] - elevation[b] || a - b : elevation[b] - elevation[a] || a - b);
    for (const i of boundary) { if (water.size === target) break; if (grow) water.add(i); else water.delete(i); }
  }
}
function placeFunctionSurvives(world: World, map: Civ5Map, protection: World["protections"][number]) {
  const selected = new Set(protection.tiles);
  if (protection.kind === "RIVER" || protection.kind === "BASIN") {
    const original = reconstructCiv5RiverEdgeSystems(world.map).filter(system => system.tileIndices.some(i => selected.has(i))).sort((a, b) => b.edgeCount - a.edgeCount)[0];
    if (original) return reconstructCiv5RiverEdgeSystems(map).some(system => system.directedToOutlet && system.edgeCount >= Math.max(3, original.edgeCount * .5)
      && original.sourceTileIndices.some(source => system.sourceTileIndices.some(next => tileDistance(map, source, next) <= 3))
      && original.outletTileIndices.some(outlet => system.outletTileIndices.some(next => tileDistance(map, outlet, next) <= 2)));
  }
  if (protection.kind === "PASS") return protection.tiles.every(i => map.tiles[i].elevation < 2 && isWaterTerrain(map, map.tiles[i]) === isWaterTerrain(world.map, world.map.tiles[i]) && !/ICE/.test(map.features[map.tiles[i].feature] ?? ""));
  const waterPlace = protection.kind === "WATER";
  const passable = (source: Civ5Map, i: number) => waterPlace ? isWaterTerrain(source, source.tiles[i]) && !/ICE/.test(source.features[source.tiles[i].feature] ?? "") : !isWaterTerrain(source, source.tiles[i]) && source.tiles[i].elevation < 2;
  const before = protection.tiles.filter(i => passable(world.map, i)).length;
  if (!before) return protection.tiles.every(i => isWaterTerrain(map, map.tiles[i]) === isWaterTerrain(world.map, world.map.tiles[i]));
  const after = components(map, i => selected.has(i) && passable(map, i))[0]?.length ?? 0;
  const originalConnected = components(world.map, i => selected.has(i) && passable(world.map, i))[0]?.length ?? 0;
  return after >= originalConnected * .8 && protection.tiles.filter(i => passable(map, i)).length >= before * .8;
}
/** Rebuild from persistent causes. Only affected channels replace native tiles. */
export function realizeSurface(world: World, recipe: StudioRecipe): { map: Civ5Map; fields: Fields; causes: Cause[]; direct: number[]; dependent: number[] } {
  const map = structuredClone(world.map), graph = adjacency(map), locked = new Set(world.locked), baseline = world.substrate, baseMap = { ...map, tiles: baseline.tiles };
  const { elevation, warming, causes } = eventSurface(world, recipe), moisture = [...baseline.fields.moisture], temperature = [...baseline.fields.temperature];
  const changedRelief = elevation.flatMap((v, i) => Math.abs(v - baseline.fields.elevation[i]) > 1e-8 || Math.abs(world.fields.elevation[i] - baseline.fields.elevation[i]) > 1e-8 ? [i] : []), direct = new Set(changedRelief), affected = new Set(region(graph, changedRelief, 2));
  const water = new Set(baseline.tiles.flatMap((tile, i) => isWaterTerrain(baseMap, tile) ? [i] : []));
  for (const i of changedRelief) { if (elevation[i] < .5) water.add(i); else water.delete(i); }
  waterBudget(baseMap, elevation, water, recipe, locked, graph, JSON.stringify(recipe.water) === JSON.stringify(baseline.recipe.water) ? new Set(region(graph, changedRelief, 2)) : undefined);
  for (let i = 0; i < map.tiles.length; i++) if (water.has(i) !== isWaterTerrain(baseMap, baseline.tiles[i])) { direct.add(i); for (const j of region(graph, [i], 2)) affected.add(j); }
  const globalClimate = recipe.rainfall !== baseline.recipe.rainfall || recipe.temperature !== baseline.recipe.temperature || world.recipe.rainfall !== baseline.recipe.rainfall || world.recipe.temperature !== baseline.recipe.temperature, fieldWet = new Array<number>(map.tiles.length).fill(0);
  for (let i = 0; i < map.tiles.length; i++) if (Math.abs(world.fields.temperature[i] - baseline.fields.temperature[i]) > 1e-8 || Math.abs(world.fields.moisture[i] - baseline.fields.moisture[i]) > 1e-8) affected.add(i);
  for (const stroke of world.strokes) if (stroke.kind === "WET" || stroke.kind === "DRY") for (const i of stroke.tiles) { fieldWet[i] += (stroke.kind === "WET" ? 1 : -1) * stroke.strength * .4; affected.add(i); direct.add(i); }
  for (let i = 0; i < warming.length; i++) if (warming[i] > 0) { affected.add(i); direct.add(i); }
  if (globalClimate) for (let i = 0; i < map.tiles.length; i++) affected.add(i);
  // Bounded windward/leeward response to locally changed relief.
  for (const i of changedRelief) { const delta = elevation[i] - baseline.fields.elevation[i], y = Math.floor(i / map.width), direction = Math.abs(y / Math.max(1, map.height - 1) * 2 - 1) > .35 ? 1 : -1; for (let distance = 1; distance <= 6; distance++) for (const side of [-1, 1]) { let x = i % map.width + distance * direction * side; if (map.wraps) x = (x + map.width) % map.width; if (x < 0 || x >= map.width) continue; const j = y * map.width + x; fieldWet[j] += delta * (side < 0 ? .14 : -.22) * (1 - distance / 7); affected.add(j); } }
  const ocean = terrainIndex(map, "OCEAN", 0), coast = terrainIndex(map, "COAST", 1);
  const ids = { grass: terrainIndex(map, "GRASS", 2), plains: terrainIndex(map, "PLAINS", 3), desert: terrainIndex(map, "DESERT", 4), tundra: terrainIndex(map, "TUNDRA", 5), snow: terrainIndex(map, "SNOW", 6) };
  map.tiles = world.map.tiles.map((tile, i) => ({ ...tile, terrain: baseline.tiles[i].terrain, elevation: baseline.tiles[i].elevation, feature: baseline.tiles[i].feature, river: baseline.tiles[i].river }));
  for (const i of affected) {
    const tile = map.tiles[i], heightDelta = elevation[i] - baseline.fields.elevation[i];
    temperature[i] = clamp(temperature[i] + (recipe.temperature - baseline.recipe.temperature) / 150 - heightDelta * .55 + warming[i]);
    moisture[i] = clamp(moisture[i] + (recipe.rainfall - baseline.recipe.rainfall) / 150 + fieldWet[i] + (water.has(i) ? .25 : graph[i].some(j => water.has(j)) ? Math.max(0, heightDelta * -.1) : 0));
    if (water.has(i)) { tile.terrain = graph[i].some(j => !water.has(j)) ? coast : ocean; tile.elevation = 0; tile.feature = temperature[i] < .12 ? featureIndex(map, "ICE") : 255; }
    else {
      tile.elevation = elevation[i] >= .83 ? 2 : elevation[i] >= .67 ? 1 : 0;
      const t = temperature[i], m = moisture[i];
      if (Math.abs(t - baseline.fields.temperature[i]) > .015 || Math.abs(m - baseline.fields.moisture[i]) > .015 || isWaterTerrain(baseMap, baseline.tiles[i])) {
        tile.terrain = t < .13 ? ids.snow : t < .28 ? ids.tundra : m < .23 ? ids.desert : m < .5 ? ids.plains : ids.grass;
        const noise = random(`${recipe.seed}:ecology:${i}`)();
        tile.feature = tile.elevation === 2 ? 255 : m > .73 && tile.elevation === 0 && t < .7 && noise > .65 ? featureIndex(map, "MARSH") : t > .72 && m > .52 && noise < m ? featureIndex(map, "JUNGLE") : t > .23 && m > .4 && tile.terrain !== ids.desert && noise < m * .8 ? featureIndex(map, "FOREST") : 255;
      }
    }
  }
  if (JSON.stringify(recipe.mountains) !== JSON.stringify(baseline.recipe.mountains) || changedRelief.length > 0) {
    const land = map.tiles.flatMap((_, i) => !water.has(i) ? [i] : []), current = land.filter(i => map.tiles[i].elevation === 2), target = Math.round(clamp(current.length / Math.max(1, land.length) * 100, ...recipe.mountains) / 100 * land.length), grow = target > current.length;
    const explicitRange = JSON.stringify(recipe.mountains) !== JSON.stringify(baseline.recipe.mountains);
    const choices = land.filter(i => !locked.has(i) && (explicitRange || affected.has(i)) && (map.tiles[i].elevation === 2) !== grow).sort((a, b) => grow ? elevation[b] - elevation[a] : elevation[a] - elevation[b]);
    if (choices.length < Math.abs(target - current.length)) throw new Error("The mountain range conflicts with protected terrain.");
    for (const i of choices.slice(0, Math.abs(target - current.length))) { map.tiles[i].elevation = grow ? 2 : 1; elevation[i] = grow ? Math.max(.85, elevation[i]) : Math.min(.8, elevation[i]); direct.add(i); affected.add(i); }
  }
  const drainage = drainageTree(map, elevation, graph).downstream, waterChanged = map.tiles.some((tile, i) => isWaterTerrain(map, tile) !== isWaterTerrain(baseMap, baseline.tiles[i]));
  const hydrologyChanged = changedRelief.length > 0 || waterChanged || globalClimate || recipe.rivers !== baseline.recipe.rivers || world.recipe.rivers !== baseline.recipe.rivers;
  if (hydrologyChanged) {
    const dirty = new Set(affected);
    for (const i of direct) { let j = i, steps = 0; while (j >= 0 && steps++ < map.tiles.length) { dirty.add(j); j = drainage[j]; } }
    const generated = generateRiverNetwork(map.tiles, elevation, moisture, map.width, map.height, map.wraps, recipe.character, recipe.rainfall < 30 ? "ARID" : recipe.rainfall > 70 ? "WET" : "NORMAL", random(`${recipe.seed}:drainage`), map.tiles.map((_, i) => water.has(i)), recipe.rivers < 33 ? "SPARSE" : recipe.rivers > 66 ? "DENSE" : "NORMAL", world.baseRivers.map(r => r & 7 ? .95 : 0), recipe.rivers === 0 ? 0 : Math.max(1, Math.floor(recipe.rivers / 18)));
    const candidate = { ...map, tiles: map.tiles.map((t, i) => ({ ...t, river: recipe.rivers === 0 ? 0 : generated[i] })) }, oldSystems = reconstructCiv5RiverEdgeSystems(baseMap), newSystems = reconstructCiv5RiverEdgeSystems(candidate);
    if (globalClimate || recipe.rivers !== baseline.recipe.rivers) for (let i = 0; i < map.tiles.length; i++) dirty.add(i);
    let grew = true;
    while (grew) { grew = false; for (const system of [...oldSystems, ...newSystems]) if (system.tileIndices.some(i => dirty.has(i))) for (const i of [...system.tileIndices, ...system.ownerIndices]) if (!dirty.has(i)) { dirty.add(i); grew = true; } }
    for (const i of dirty) { map.tiles[i].river = candidate.tiles[i].river; affected.add(i); }
  }
  for (const stroke of world.strokes) if (stroke.kind === "PAINT") for (const i of stroke.tiles) { for (const key of ["terrain", "elevation", "feature", "resource", "river", "wonder", "resourceAmount"] as const) if (stroke[key] !== undefined) map.tiles[i][key] = stroke[key]!; if (stroke.resource !== undefined && stroke.resourceAmount === undefined) map.tiles[i].resourceAmount = stroke.resource === 255 ? 0 : 1; direct.add(i); affected.add(i); }
  const exactPaint = new Set(world.strokes.filter(s => s.kind === "PAINT").flatMap(s => s.tiles));
  cleanPlacements(map, [...affected].filter(i => !exactPaint.has(i)));
  for (let i = 0; i < map.tiles.length; i++) if (!affected.has(i) && !exactPaint.has(i)) map.tiles[i] = { ...world.map.tiles[i] };
  const atFoundation = !world.strokes.length && !recipe.events.length && ["rainfall", "temperature", "erosion", "rivers", "water", "mountains"].every(key => JSON.stringify(recipe[key as keyof StudioRecipe]) === JSON.stringify(baseline.recipe[key as keyof StudioRecipe]));
  if (atFoundation) for (let i = 0; i < map.tiles.length; i++) {
    for (const key of ["terrain", "elevation", "feature", "river"] as const) map.tiles[i][key] = baseline.tiles[i][key];
    elevation[i] = baseline.fields.elevation[i]; moisture[i] = baseline.fields.moisture[i]; temperature[i] = baseline.fields.temperature[i];
  }
  for (const i of locked) {
    if (direct.has(i) && JSON.stringify(map.tiles[i]) !== JSON.stringify(world.map.tiles[i])) throw new Error(`The change touches protected tile ${i}. Move the intervention or release protection.`);
    map.tiles[i] = { ...world.map.tiles[i] }; elevation[i] = world.fields.elevation[i]; moisture[i] = world.fields.moisture[i]; temperature[i] = world.fields.temperature[i];
  }
  for (const protection of world.protections) {
    const broken = protection.policy === "SHAPE" ? protection.tiles.some(i => isWaterTerrain(map, map.tiles[i]) !== isWaterTerrain(world.map, world.map.tiles[i]) || map.tiles[i].elevation !== world.map.tiles[i].elevation) : !placeFunctionSurvives(world, map, protection);
    if (broken) throw new Error(`The change conflicts with the protected ${protection.policy.toLowerCase()} of ${protection.id}.`);
  }
  const actual = map.tiles.flatMap((t, i) => JSON.stringify(t) !== JSON.stringify(world.map.tiles[i]) ? [i] : []);
  if (actual.length) map.structure = markGenerationStructureStale(map.structure, "World development changed realized geography. Native causes remain; previous proof is historical.");
  return { map, fields: { elevation, moisture, temperature, drainage: drainageTree(map, elevation, graph).downstream }, causes, direct: actual.filter(i => direct.has(i)), dependent: actual.filter(i => !direct.has(i)) };
}
export function identifyFeatures(map: Civ5Map, previous: Feature[] = [], inferred = false): Feature[] {
  const graph = adjacency(map), features: Feature[] = [];
  for (const kind of ["LAND", "WATER", "RANGE"] as const) {
    const groups = components(map, i => kind === "WATER" ? isWaterTerrain(map, map.tiles[i]) : kind === "RANGE" ? !isWaterTerrain(map, map.tiles[i]) && map.tiles[i].elevation > 0 : !isWaterTerrain(map, map.tiles[i]), graph);
    groups.filter(g => g.length >= (kind === "RANGE" ? 4 : 8)).slice(0, 35).forEach((tiles, i) => features.push({ id: "", name: `${kind === "LAND" ? "Landmass" : kind === "WATER" ? "Water body" : "Highlands"} ${i + 1}`, kind, tiles, inferred }));
  }
  reconstructCiv5RiverEdgeSystems(map).filter(system => system.edgeCount >= 4).slice(0, 40).forEach((system, i) => features.push({ id: "", name: `River system ${i + 1}`, kind: "RIVER", tiles: [...system.tileIndices], inferred, cause: "Connected tributaries and outlet-directed river edges" }));
  for (const object of map.structure?.objects ?? []) {
    if (!["WATERSHED", "RIVER_BASIN", "REFUGE", "STRAIT", "RAIN_SHADOW", "GLACIAL_REGION", "TECTONIC_PLATE"].includes(object.kind)) continue;
    const kind: Feature["kind"] = /BASIN|WATERSHED/.test(object.kind) ? "BASIN" : object.kind === "STRAIT" ? "PASS" : object.kind === "TECTONIC_PLATE" ? "PLATE" : object.kind === "REFUGE" ? "REFUGE" : "CLIMATE";
    features.push({ id: object.semanticId ?? `native:${object.id}`, sourceId: object.id, name: object.name, kind, tiles: [...object.tileIndices], inferred, ...(object.neighbors ? { neighbors: [...object.neighbors] } : {}), cause: object.kind.toLowerCase().replaceAll("_", " "), status: map.structure?.evidenceState === "STALE" ? "CHANGED" : "RETAINED" });
  }
  const used = new Set<string>();
  const names = new Set<string>();
  const prefixes: Partial<Record<Feature["kind"], string>> = { LAND: "Landmass", WATER: "Water body", RANGE: "Highlands", RIVER: "River system" };
  const counters = new Map<string, number>();
  for (const prior of previous) { const match = prior.name.match(/^(Landmass|Water body|Highlands|River system) (\d+)$/); if (match) counters.set(match[1], Math.max(counters.get(match[1]) ?? 0, Number(match[2]))); }
  for (const feature of features) {
    if (feature.id) { used.add(feature.id); names.add(feature.name); continue; }
    const tiles = new Set(feature.tiles), candidates = previous.filter(old => old.kind === feature.kind && !used.has(old.id)).map(old => { const overlap = old.tiles.filter(i => tiles.has(i)).length; return { old, similarity: overlap / Math.max(1, tiles.size + old.tiles.length - overlap) }; }).sort((a, b) => b.similarity - a.similarity);
    const best = candidates[0];
    if (best && best.similarity >= .3) { feature.id = best.old.id; feature.name = best.old.name; feature.status = best.similarity === 1 ? "RETAINED" : "CHANGED"; }
    else { feature.id = `${feature.kind.toLowerCase()}:${hash(feature.tiles.join(",")).toString(36)}`; feature.status = "CREATED"; const prefix = prefixes[feature.kind]; if (prefix) { const next = (counters.get(prefix) ?? 0) + 1; counters.set(prefix, next); feature.name = `${prefix} ${next}`; } }
    if (names.has(feature.name)) { const prefix = prefixes[feature.kind] ?? feature.name, next = (counters.get(prefix) ?? 0) + 1; counters.set(prefix, next); feature.name = `${prefix} ${next}`; }
    names.add(feature.name);
    used.add(feature.id);
  }
  return features;
}
