import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseCiv5Map, serializeCiv5Map } from "../lib/civ5-map.ts";
import { isWaterTerrain } from "../lib/civ5-rules.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { LANDSCAPES, acceptWorld, defaultRecipe, random, randomRecipe, redo, undo, validateRecipe, type Session, type StudioRecipe } from "../lib/studio/model.ts";
import { exportMap, generateWorld, importMap, mapOptions, runJob, sampleWorld, validateWorld } from "../lib/studio/operations.ts";
import { parseSession, serializeSession } from "../lib/studio/project.ts";

const recipe: StudioRecipe = { ...defaultRecipe(), size: "DUEL", players: 2, cityStates: 2, candidates: 1, seed: "v2-watersheds-proof" };
let reference: ReturnType<typeof generateWorld>;
function world() { reference ??= generateWorld(recipe); return structuredClone(reference); }

test("V2 full randomisation is deterministic under an injected random stream and reaches every control family", () => {
  assert.deepEqual(randomRecipe(random("seed")), randomRecipe(random("seed")));
  const rng = random("sweep"); const recipes = Array.from({ length: 60 }, () => randomRecipe(rng));
  for (const r of recipes) validateRecipe(r);
  for (const recipe of recipes) assert.ok(!("events" in recipe), "randomisation cannot prescribe a fictional history");
  for (const key of ["landscape", "foundation", "players", "size", "temperature", "rainfall", "balance", "geometry", "wraps", "teams", "resources", "candidates"] as const) assert.ok(new Set(recipes.map(r => r[key])).size > 1, key);
  assert.throws(() => validateRecipe({ ...recipe, water: [40, 20] }), /ordered range/);
  assert.throws(() => validateRecipe({ ...recipe, events: [] } as StudioRecipe), /retired story controls/);
  assert.equal(mapOptions({ ...recipe, foundation: "GAMEPLAY" }).engine, mapOptions(recipe).engine, "priority must not replace the selected premise's constructor");
});

test("Watersheds retains a legal deterministic reference and exports ordinary geography without fixed starts", () => {
  const current = world(); const repeated = generateWorld(recipe);
  assert.deepEqual(current.map.tiles, repeated.map.tiles);
  assert.ok(current.features.some(f => f.kind === "RIVER"));
  assert.equal(validateWorld(current).length, 0);
  assert.ok(current.assessment.water >= recipe.water[0] - .2 && current.assessment.water <= recipe.water[1] + .2);
  const parsed = parseCiv5Map(exportMap(current), "test");
  assert.equal(parsed.startLocations.length, 0);
  assert.equal(parsed.scenarioDataPresent, false);
  assert.equal(parsed.tiles.length, current.map.tiles.length);
});

test("rainfall refinement retains coastline and the original elevation substrate while recomputing climate", () => {
  const original = world(); const before = structuredClone(original);
  const dry = runJob({ kind: "REFINE", world: original, recipe: { ...recipe, rainfall: 10 } });
  const wet = runJob({ kind: "REFINE", world: original, recipe: { ...recipe, rainfall: 95 } });
  assert.deepEqual(original, before, "operations must not mutate the source");
  assert.deepEqual(wet.base, original.base);
  assert.deepEqual(wet.map.tiles.map(t => isWaterTerrain(wet.map, t)), original.map.tiles.map(t => isWaterTerrain(original.map, t)));
  assert.ok(wet.fields.moisture.reduce((a, b) => a + b, 0) > dry.fields.moisture.reduce((a, b) => a + b, 0));
  assert.equal(validateWorld(wet).length, 0);
  assert.ok(wet.features.some(f => original.features.some(old => old.id === f.id)), "recognizable features retain identity");
});

test("regional sketches alter retained relief and protected tiles survive dependent recomputation", () => {
  const original = world();
  const index = original.map.tiles.findIndex(t => !isWaterTerrain(original.map, t) && t.elevation === 0);
  const protectedIndex = original.map.tiles.findIndex((t, i) => i !== index && !isWaterTerrain(original.map, t));
  original.locked = [protectedIndex];
  const result = runJob({ kind: "STROKE", world: original, stroke: { kind: "RIDGE", tiles: [index], strength: 1 } });
  assert.ok(result.fields.elevation[index] > original.fields.elevation[index]);
  assert.deepEqual(result.map.tiles[protectedIndex], original.map.tiles[protectedIndex]);
  assert.throws(() => runJob({ kind: "STROKE", world: original, stroke: { kind: "BASIN", tiles: [protectedIndex], strength: 1 } }), /protected tiles/);
});

test("selected repairs leave unselected defects visible and do not silently clean the whole map", () => {
  const broken = world(); broken.map.tiles[5].feature = 200; broken.map.tiles[8].resource = 200;
  const issues = buildRepairIssues(broken.map); const selected = issues.filter(i => i.tileIndex === 5 && i.mutation).map(i => i.id);
  assert.ok(selected.length);
  const result = runJob({ kind: "REPAIR", world: broken, issues: selected });
  assert.notEqual(result.map.tiles[5].feature, 200);
  assert.equal(result.map.tiles[8].resource, 200);
});

test("projects retain world fields, drafts, locks, geographic edits and immutable undo/redo history", () => {
  const original = world(); original.locked = [1, 2];
  const next = runJob({ kind: "REFINE", world: original, recipe: { ...recipe, rainfall: 72 } });
  const initial: Session = { current: original, past: [], future: [] };
  const session = { ...acceptWorld(initial, next, "Wetter world"), draft: { ...recipe, temperature: 80 } };
  const bytes = serializeSession(session, "Watershed atlas");
  const restored = parseSession(bytes);
  assert.deepEqual(restored.session.current.fields, next.fields);
  assert.deepEqual(restored.session.current.locked, [1, 2]);
  assert.equal(restored.session.draft?.temperature, 80);
  assert.deepEqual(undo(restored.session).current.map.tiles, original.map.tiles);
  assert.deepEqual(redo(undo(restored.session)).current.map.tiles, next.map.tiles);
});

test("an imported ordinary map preserves bytes across project handoff and conservative export", () => {
  const source = serializeCiv5Map(world().map); const imported = importMap(source, "known.civ5map");
  const session: Session = { current: imported, past: [], future: [] };
  const saved = serializeSession(session, "Import"); const restored = parseSession(saved);
  assert.deepEqual(restored.session.current.source?.bytes, [...new Uint8Array(source)]);
  const result = parseCiv5Map(exportMap(restored.session.current), "round-trip");
  assert.deepEqual(result.tiles, imported.map.tiles);
  assert.ok(imported.features.every(f => f.inferred));
});

test("failed incompatible refinement leaves the accepted world intact", () => {
  const original = sampleWorld(), before = structuredClone(original);
  assert.throws(() => runJob({ kind: "REFINE", world: original, recipe: { ...original.recipe, landscape: "SHELVES" } }), /new world/);
  assert.deepEqual(original, before);
});

test("every landscape produces lawful final geography within its requested ranges", () => {
  for (const landscape of LANDSCAPES) {
    const r = { ...recipe, landscape: landscape.id, water: landscape.water, mountains: landscape.mountains, seed: `v2-${landscape.id}` };
    const result = generateWorld(r);
    assert.equal(validateWorld(result).length, 0, landscape.name);
    assert.ok(result.assessment.water >= r.water[0] - .2 && result.assessment.water <= r.water[1] + .2, landscape.name);
    assert.ok(result.features.some(f => f.kind === "LAND"));
  }
});

test("strategic foundations and explicit rotational arenas change actual geography", () => {
  const composed = generateWorld({ ...recipe, foundation: "GAMEPLAY", landscape: "RIVAL_SHORES", water: [45, 65], mountains: [15, 26], candidates: 3, seed: "v2-composition" });
  assert.equal(composed.map.structure?.engine, "POLIS");
  assert.ok(composed.map.structure?.strategicGraph?.edges.length);
  const original = world();
  const symmetric = runJob({ kind: "REBALANCE", world: original, balance: "SYMMETRIC" });
  for (let i = 0; i < symmetric.map.tiles.length / 2; i++) {
    const a = symmetric.map.tiles[i], b = symmetric.map.tiles[symmetric.map.tiles.length - i - 1];
    for (const key of ["terrain", "elevation", "resource", "feature", "wonder"] as const) assert.equal(a[key], b[key], `rotated ${key} ${i}`);
  }
  assert.equal(validateWorld(symmetric).length, 0);
  assert.equal(symmetric.map.structure?.evidenceState, "STALE");
  assert.ok(symmetric.development.operations.some(c => c.kind === "ARENA"));
});

test("refinement is stable when reapplied, and wonder controls alter the actual map", () => {
  const original = world(); const r = { ...recipe, rainfall: 72, wonders: 1 };
  const once = runJob({ kind: "REFINE", world: original, recipe: r });
  const twice = runJob({ kind: "REFINE", world: once, recipe: r });
  assert.deepEqual(twice.map.tiles.map(t => [t.terrain, t.elevation, t.feature, t.resource]), once.map.tiles.map(t => [t.terrain, t.elevation, t.feature, t.resource]));
  assert.equal(once.map.tiles.filter(t => t.wonder !== 255).length, 1);
});

test("opening rebalance preserves the reference world's coastline and measured opportunity", () => {
  const reference = JSON.parse(readFileSync(new URL("../app/studio/starter-world.json", import.meta.url), "utf8"));
  const result = runJob({ kind: "REBALANCE", world: reference, balance: "OPENING" });
  const original = runJob({ kind: "DEVELOP", world: reference });
  assert.ok(result.assessment.quality.opportunity >= original.assessment.quality.opportunity);
  assert.equal(result.assessment.axes?.length, 6);
  assert.deepEqual(result.map.tiles.map(t => isWaterTerrain(result.map, t)), reference.map.tiles.map((t: Parameters<typeof isWaterTerrain>[1]) => isWaterTerrain(reference.map, t)));
});
