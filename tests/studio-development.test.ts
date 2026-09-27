import assert from "node:assert/strict";
import test from "node:test";
import { generateMap } from "../lib/map-generator.ts";
import { createDemoMap } from "../lib/civ5-map.ts";
import { isWaterTerrain } from "../lib/civ5-rules.ts";
import { defaultRecipe, LANDSCAPES, selectLandscape, newEvent, random, type World } from "../lib/studio/model.ts";
import { generateWorld, runJob, worldFromMap, mapOptions, migrateWorld, validateWorld } from "../lib/studio/operations.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { developWorld } from "../lib/studio/development.ts";
import { assess, movementCost } from "../lib/studio/assessment.ts";
import { adjacency, drainageTree, paths, region } from "../lib/studio/spatial.ts";
import { parseSession, serializeSession, validateWorldRecord } from "../lib/studio/project.ts";
import { riverEdgeDefinitions } from "../lib/rivers.ts";

const recipe = { ...defaultRecipe(), size: "DUEL" as const, players: 2, cityStates: 2, candidates: 1, development: 0, seed: "development-contract" };
let cached: World;
const world = () => structuredClone(cached ??= generateWorld(recipe));

test("each native constructor crosses the world boundary with identical tiles and retained causes", () => {
  for (const id of ["WATERSHEDS", "COLLISION", "CONTINENTS", "RIVAL_SHORES"] as const) {
    const landscape = LANDSCAPES.find(l => l.id === id)!;
    const r = { ...recipe, landscape: id, water: landscape.water, mountains: landscape.mountains, seed: `v2-${id}` };
    const native = generateMap(mapOptions(r)), result = generateWorld(r);
    assert.deepEqual(result.map.tiles, native.tiles, id);
    assert.equal(result.map.structure?.engine, native.structure?.engine);
    assert.deepEqual(result.map.structure?.narrativeNativePlan, native.structure?.narrativeNativePlan);
    assert.equal(result.substrate.confidence, "NATIVE");
    assert.equal(result.substrate.nativeFields?.relief.length, native.tiles.length);
    assert.ok(result.features.some(f => f.kind === "LAND"));
  }
});

test("no-op refinement preserves the entire accepted document and does not mutate its source", () => {
  const original = world(), before = structuredClone(original), result = runJob({ kind: "REFINE", world: original, recipe: original.recipe });
  assert.deepEqual(original, before);
  assert.deepEqual(result.map, original.map);
  assert.deepEqual(result.fields, original.fields);
  assert.deepEqual(result.substrate, original.substrate);
});

test("local moisture development preserves unrelated tiles, native plans and stable place identities", () => {
  const original = world(), graph = adjacency(original.map);
  const center = original.map.tiles.findIndex((t, i) => !isWaterTerrain(original.map, t) && t.elevation < 2 && original.fields.temperature[i] > .3 && original.fields.moisture[i] < .6);
  assert.ok(center >= 0);
  const selection = region(graph, [center], 1), result = developWorld(original, original.recipe, { kind: "WET", tiles: selection, strength: .8 });
  const possibleContentMoves = new Set(region(graph, selection, 5));
  for (let i = 0; i < original.map.tiles.length; i++) if (!possibleContentMoves.has(i)) assert.deepEqual(result.map.tiles[i], original.map.tiles[i], `untouched tile ${i}`);
  assert.deepEqual(result.substrate, original.substrate);
  assert.deepEqual(result.map.structure?.narrativeNativePlan, original.map.structure?.narrativeNativePlan);
  assert.equal(result.map.structure?.evidenceState, "STALE");
  assert.ok(result.features.some(f => original.features.some(old => old.id === f.id)));
  assert.ok(result.development.changes.retained > original.map.tiles.length * .7);
  assert.equal(validateWorld(result).length, 0);
});

test("removing a history event restores foundation geography instead of baking in the old edit", () => {
  const original = world(), event = { ...newEvent("FLOOD", random("removable")), x: .5, y: .5, radius: .2, intensity: .5 };
  const changed = developWorld(original, { ...original.recipe, events: [event] });
  assert.notDeepEqual(changed.fields.elevation, original.fields.elevation);
  const restored = developWorld(changed, { ...changed.recipe, events: [] });
  assert.deepEqual(restored.fields, original.fields);
  for (const key of ["terrain", "elevation", "river", "feature"] as const) assert.deepEqual(restored.map.tiles.map(t => t[key]), original.map.tiles.map(t => t[key]), key);
});

test("history order has physical consequences and a repeated accepted refinement is stable", () => {
  const original = world(), impact = { ...newEvent("CRATERS", random("age")), x: .5, y: .5, intensity: .55, radius: .22 }, engineering = { ...newEvent("RUINS", random("engineering")), x: .5, y: .5, intensity: .5, radius: .22 };
  const first = developWorld(original, { ...original.recipe, events: [impact, engineering] });
  const second = developWorld(original, { ...original.recipe, events: [engineering, impact] });
  assert.notDeepEqual(first.fields.elevation, second.fields.elevation);
  assert.deepEqual(developWorld(first, first.recipe).map.tiles, first.map.tiles);
});

test("the two narrative foundations change actual fields and carry distinct causal histories", () => {
  for (const id of ["COMET_SEAS", "POLAR_THAW"] as const) {
    const r = selectLandscape({ ...recipe, seed: `development-${id}` }, id), result = generateWorld(r);
    assert.ok(result.development.causes.some(c => c.kind === (id === "COMET_SEAS" ? "FLOOD" : "THAW")));
    assert.notDeepEqual(result.fields.elevation, result.substrate.fields.elevation);
    assert.equal(validateWorld(result).length, 0);
    if (id === "POLAR_THAW") assert.ok(result.fields.temperature.some((t, i) => t > result.substrate.fields.temperature[i]));
    if (id === "COMET_SEAS") {
      const edge = result.map.tiles.flatMap((_, i) => i % result.map.width === 0 || i % result.map.width === result.map.width - 1 || Math.floor(i / result.map.width) === 0 || Math.floor(i / result.map.width) === result.map.height - 1 ? [i] : []);
      assert.ok(edge.filter(i => result.map.tiles[i].elevation === 2).length / edge.length < .8, "the comet world must not inherit a rectangular mountain enclosure");
      const event = result.development.causes.find(c => c.kind === "FLOOD")!;
      const affected = new Set(region(adjacency(result.map), event.tiles, 6));
      for (let i = 0; i < result.map.tiles.length; i++) if (!affected.has(i)) assert.equal(result.map.tiles[i].terrain, result.substrate.tiles[i].terrain, `unrelated shoreline ${i}`);
    }
  }
});

test("river crossing costs use owned hex edges rather than penalizing every river-adjacent tile", () => {
  const map = createDemoMap(); for (const t of map.tiles) { t.terrain = map.terrains.indexOf("TERRAIN_GRASS"); t.elevation = 0; t.feature = 255; t.river = 0; }
  const i = map.width * 3 + 4, edge = riverEdgeDefinitions(4, 3)[0], j = i + edge.dx + edge.dy * map.width;
  map.tiles[i].river = edge.bit;
  const cost = movementCost(map, "LAND");
  assert.equal(cost(i, j), 3); assert.equal(cost(j, i), 3);
  assert.equal(cost(i, i - 1), 1);
});

test("coastal and ocean travel produce different connectivity on a synthetic separated world", () => {
  const map = createDemoMap(); map.width = 16; map.height = 12; map.wraps = false;
  const grass = map.terrains.indexOf("TERRAIN_GRASS"), ocean = map.terrains.indexOf("TERRAIN_OCEAN");
  map.tiles = Array.from({ length: 192 }, (_, i) => ({ ...map.tiles[0], terrain: i % 16 === 7 || i % 16 === 8 ? ocean : grass, elevation: 0, resource: 255, wonder: 255, feature: 255, river: 0 }));
  const graph = adjacency(map), from = 5 * 16 + 3, to = 5 * 16 + 12;
  assert.equal(paths(graph, [from], movementCost(map, "LAND")).distance[to], Infinity);
  assert.equal(paths(graph, [from], movementCost(map, "COASTAL")).distance[to], Infinity);
  assert.ok(Number.isFinite(paths(graph, [from], movementCost(map, "OCEAN")).distance[to]));
  const evaluation = assess(map, { ...recipe, players: 4 });
  assert.equal(evaluation.layouts.length, 4);
  assert.ok(evaluation.stages[2].reachablePairs >= evaluation.stages[0].reachablePairs);
});

test("priority-flood drainage is acyclic even across a flat enclosed depression", () => {
  const original = world(), fields = new Array(original.map.tiles.length).fill(.6), tree = drainageTree(original.map, fields);
  for (let i = 0; i < tree.downstream.length; i++) { const seen = new Set<number>(); let j = i; while (j >= 0) { assert.ok(!seen.has(j), `cycle at ${j}`); seen.add(j); j = tree.downstream[j]; } }
});

test("projects retain raw fields, native plans, proposals and place protections", () => {
  const original = world(), feature = original.features.find(f => f.kind === "RIVER")!;
  original.protections.push({ id: feature.id, policy: "FUNCTION", tiles: feature.tiles, kind: feature.kind });
  const restored = parseSession(serializeSession({ current: original, past: [], future: [], draft: original.recipe }, "Development contract")).session.current;
  assert.deepEqual(restored.substrate, original.substrate);
  assert.deepEqual(restored.development, original.development);
  assert.deepEqual(restored.protections, original.protections);
  assert.equal(restored.assessment.quality.identity, original.assessment.quality.identity);
  assert.equal(restored.assessment.quality.fidelity, original.assessment.quality.fidelity);
  assert.deepEqual(restored.map.structure?.narrativeNativePlan, original.map.structure?.narrativeNativePlan);
  const broken = structuredClone(restored); broken.substrate.fields.elevation.pop(); assert.throws(() => validateWorldRecord(broken), /foundation fields/);
});

test("place shape protection rejects a conflicting edit atomically", () => {
  const original = world(), index = original.map.tiles.findIndex(t => !isWaterTerrain(original.map, t) && t.elevation === 0);
  original.protections.push({ id: "protected-valley", policy: "SHAPE", tiles: [index], kind: "LAND" });
  const before = structuredClone(original);
  assert.throws(() => developWorld(original, original.recipe, { kind: "BASIN", strength: 1, tiles: [index] }), /protected shape/);
  assert.deepEqual(original, before);
});

test("imported geography is preserved and its inferred causes remain explicit", () => {
  const map = createDemoMap(), imported = worldFromMap(map);
  assert.deepEqual(imported.map.tiles, map.tiles);
  assert.equal(imported.substrate.confidence, "INFERRED");
  assert.ok(imported.development.causes.every(c => c.inferred));
});

test("a selected search result keeps the author seed and reproduces from its saved recipe", () => {
  const selected = generateWorld({ ...recipe, candidates: 3, development: 1 });
  assert.equal(selected.recipe.seed, recipe.seed);
  assert.equal(selected.development.candidates.filter(c => c.selected).length, 1);
  assert.equal(selected.development.candidates.find(c => c.selected)?.seed, selected.substrate.seed);
  assert.deepEqual(generateWorld(selected.recipe).map.tiles, selected.map.tiles);
  const other = selected.development.candidates.find(c => !c.selected)!;
  const alternative = runJob({ kind: "ALTERNATIVE", world: selected, seed: other.seed });
  assert.equal(alternative.substrate.seed, other.seed);
  assert.equal(alternative.development.candidates.find(c => c.selected)?.seed, other.seed);
  assert.equal(selected.development.candidates.find(c => c.selected)?.seed, selected.substrate.seed);
  const restored = parseSession(serializeSession({ current: selected, past: [], future: [], draft: { ...selected.recipe, rainfall: 30 }, developmentDraft: { ...selected.recipe, rainfall: 80 } }, "Search alternatives")).session;
  assert.equal(restored.draft?.rainfall, 30); assert.equal(restored.developmentDraft?.rainfall, 80);
  assert.deepEqual(runJob({ kind: "ALTERNATIVE", world: restored.current, seed: other.seed }).map.tiles, alternative.map.tiles);
});

test("strategic intentions and team composition affect the assessed opportunity", () => {
  const map = createDemoMap(), grass = map.terrains.indexOf("TERRAIN_GRASS");
  for (const t of map.tiles) { t.terrain = grass; t.elevation = 0; t.feature = 255; t.river = 0; t.resource = 255; t.wonder = 255; }
  const close = assess(map, { ...recipe, players: 4, contact: [1, 2], frontage: [1, 2] });
  const open = assess(map, { ...recipe, players: 4, contact: [1, 80], frontage: [4, 8] });
  assert.ok(open.quality.opportunity > close.quality.opportunity);
  assert.equal(open.stages[0].pairs, 6);
  assert.equal(assess(map, { ...recipe, players: 4, teams: 2 }).stages[0].pairs, 4);
});

test("function protection keeps a connected river with its source and outlet", () => {
  const original = world(), river = original.features.find(f => f.kind === "RIVER")!;
  original.protections.push({ id: river.id, policy: "FUNCTION", tiles: river.tiles, kind: "RIVER" });
  assert.throws(() => developWorld(original, { ...original.recipe, rivers: 0 }), /protected function/);
});

test("selected corrections survive later refinement without rewriting the retained foundation", () => {
  const broken = world(), substrate = structuredClone(broken.substrate); broken.map.tiles[5].feature = 200;
  const ids = buildRepairIssues(broken.map).filter(issue => issue.tileIndex === 5 && issue.mutation).map(issue => issue.id);
  const repaired = runJob({ kind: "REPAIR", world: broken, issues: ids });
  assert.deepEqual(repaired.substrate, substrate);
  assert.ok(repaired.strokes.some(s => s.kind === "PAINT" && s.tiles.includes(5)));
  const refined = developWorld(repaired, { ...repaired.recipe, rainfall: 75 });
  assert.equal(refined.map.tiles[5].feature, repaired.map.tiles[5].feature);
});

test("earlier V2 records migrate as intact snapshots with their former authoring data retained", () => {
  const original = world();
  const old = { ...original, version: 2, recipe: { ...original.recipe, version: 2 }, substrate: undefined, development: undefined, protections: undefined };
  const migrated = migrateWorld(old);
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.map.tiles, original.map.tiles);
  assert.deepEqual(migrated.substrate.legacyAuthoring?.recipe, old.recipe);
  assert.equal(migrated.substrate.confidence, "INFERRED");
  validateWorldRecord(migrated);
});
