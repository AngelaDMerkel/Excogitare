import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoMap, parseCiv5Map } from "../lib/civ5-map.ts";
import { parseExcogitareProject } from "../lib/excogitare-project.ts";
import { defaultRecipe, migrateRecipe, type World } from "../lib/studio/model.ts";
import { developWorld } from "../lib/studio/development.ts";
import { exportMap, generateWorld, migrateWorld, runJob, worldFromMap } from "../lib/studio/operations.ts";
import { parseSession, serializeSession, validateWorldRecord } from "../lib/studio/project.ts";

function frozenCoast() {
  const map = createDemoMap();
  map.width = 12;
  map.height = 8;
  map.wraps = false;
  map.startLocations = [];
  const ocean = map.terrains.indexOf("TERRAIN_OCEAN"), coast = map.terrains.indexOf("TERRAIN_COAST"), snow = map.terrains.indexOf("TERRAIN_SNOW");
  const ice = map.features.push("FEATURE_ICE") - 1;
  map.tiles = Array.from({ length: 96 }, (_, i) => ({
    ...map.tiles[0], terrain: i < 36 ? ocean : i < 48 ? coast : snow, elevation: 0,
    feature: i < 48 ? ice : 255, river: 0, resource: 255, resourceAmount: 0, wonder: 255,
  }));
  return worldFromMap(map, { ...defaultRecipe(), water: [50, 50], mountains: [0, 0], rivers: 0 });
}

test("local temperature edits change ice conditions without excavating terrain or inventing an event", () => {
  const original = frozenCoast(), before = structuredClone(original), tiles = [40, 41, 42];
  const warmer = developWorld(original, original.recipe, { kind: "WARM", strength: 1, tiles });
  for (const i of tiles) {
    assert.ok(warmer.fields.temperature[i] > original.fields.temperature[i]);
    assert.equal(warmer.map.tiles[i].feature, 255, "ice clears on the warmed coast");
  }
  for (let i = 0; i < original.map.tiles.length; i++) {
    assert.equal(warmer.map.tiles[i].terrain, original.map.tiles[i].terrain);
    if (!tiles.includes(i)) assert.deepEqual(warmer.map.tiles[i], original.map.tiles[i]);
  }
  assert.deepEqual(warmer.fields.elevation, original.fields.elevation);
  assert.deepEqual(developWorld(warmer, warmer.recipe).map.tiles, warmer.map.tiles);
  const cooler = developWorld(warmer, warmer.recipe, { kind: "COOL", strength: 1, tiles });
  assert.deepEqual(cooler.map.tiles, original.map.tiles);
  assert.deepEqual(cooler.fields.temperature, original.fields.temperature);
  assert.deepEqual(original, before);
  assert.deepEqual(warmer.development.operations.map(operation => operation.kind), ["INFERRED", "WARM"]);
});

test("temperature edits respect protection and survive project and geography export", () => {
  const original = frozenCoast();
  original.locked = [40];
  assert.throws(() => developWorld(original, original.recipe, { kind: "WARM", strength: 1, tiles: [40] }), /protected tiles/);
  const warmed = developWorld(original, original.recipe, { kind: "WARM", strength: 1, tiles: [42] });
  const restored = parseSession(serializeSession({ current: warmed, past: [], future: [] }, "Ice margin")).session.current;
  assert.deepEqual(restored.strokes, warmed.strokes);
  assert.deepEqual(restored.fields, warmed.fields);
  assert.deepEqual(parseCiv5Map(exportMap(restored), "Ice margin").tiles, warmed.map.tiles);
  const invalid = structuredClone(restored);
  invalid.strokes[0].strength = Number.NaN;
  assert.throws(() => validateWorldRecord(invalid), /Invalid geographic edits/);
});

test("an actual schema-3 event project opens unchanged and archives its programme", () => {
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/studio-v3-event-world.excogitare", import.meta.url))).buffer;
  const project = parseExcogitareProject(bytes);
  const previous = (project.extensions!.bundleEntries as Record<string, unknown>)["extensions/studio-v2.json"] as {
    session: { current: World & { recipe: { events: unknown[] } }; past: Array<{ world: World }>; draft: unknown; developmentDraft: unknown };
  };
  const old = previous.session.current, session = parseSession(bytes).session, world = session.current;
  assert.ok(old.recipe.events.length > 0, "fixture contains a real former terrain programme");
  assert.equal(world.version, 4);
  assert.deepEqual(world.map, old.map);
  assert.deepEqual(world.fields, old.fields);
  assert.deepEqual(world.substrate.tiles, old.map.tiles);
  assert.deepEqual(world.substrate.fields, old.fields);
  assert.deepEqual(world.substrate.legacyAuthoring?.foundation, old.substrate);
  assert.deepEqual(world.substrate.legacyAuthoring?.recipe, old.recipe);
  assert.deepEqual(world.substrate.legacyAuthoring?.strokes, old.strokes);
  assert.equal(world.substrate.confidence, "RETAINED");
  assert.equal(world.strokes.length, 0, "the previously edited result is the new baseline");
  assert.equal(world.recipe.landscape, "SHIELDS");
  assert.ok(!("events" in world.recipe));
  assert.deepEqual(world.locked, old.locked);
  assert.deepEqual(world.protections, old.protections);
  assert.deepEqual(session.past[0].world.map.tiles, previous.session.past[0].world.map.tiles);
  assert.deepEqual(session.legacyDrafts, { draft: previous.session.draft, developmentDraft: previous.session.developmentDraft });
  assert.equal(session.draft?.temperature, 61);
  assert.equal(session.developmentDraft?.rainfall, 77);
  assert.deepEqual(developWorld(world, world.recipe).map.tiles, old.map.tiles);

  const copy = structuredClone(world);
  copy.locked = [];
  copy.protections = [];
  const tile = copy.fields.temperature.findIndex(t => t > .2 && t < .6);
  const developed = developWorld(copy, copy.recipe, { kind: "WARM", strength: .2, tiles: [tile] });
  assert.deepEqual(developed.fields.elevation, old.fields.elevation, "the former event cannot excavate the map a second time");
  const reopened = parseSession(serializeSession({ ...session, current: developed }, "Migrated geography")).session;
  assert.deepEqual(reopened.current.map.tiles, developed.map.tiles);
  assert.deepEqual(reopened.current.substrate.legacyAuthoring, world.substrate.legacyAuthoring);
  assert.deepEqual(reopened.legacyDrafts, session.legacyDrafts);
  assert.deepEqual(parseCiv5Map(exportMap(reopened.current), "Migrated geography").tiles, developed.map.tiles);
});

test("schema-3 worlds without events retain their native substrate and replayable alternatives", () => {
  const current = generateWorld({ ...defaultRecipe(), size: "DUEL", candidates: 2, development: 0, cityStates: 0, seed: "geography-migration-replay" });
  const oldRecipe = (recipe: typeof current.recipe) => ({ ...recipe, version: 3, events: [], motifs: [] });
  const old = {
    ...current, version: 3, recipe: oldRecipe(current.recipe),
    substrate: { ...current.substrate, recipe: oldRecipe(current.substrate.recipe) },
    development: {
      ...current.development, causes: current.development.operations,
      candidates: current.development.candidates.map(candidate => ({ ...candidate, recipe: oldRecipe(candidate.recipe!) })),
    },
  };
  const migrated = migrateWorld(old);
  assert.deepEqual(migrated.map.tiles, current.map.tiles);
  assert.deepEqual(migrated.substrate.nativeFields, current.substrate.nativeFields);
  assert.equal(migrated.substrate.confidence, "NATIVE");
  const alternative = migrated.development.candidates.find(candidate => !candidate.selected)!;
  assert.deepEqual(runJob({ kind: "ALTERNATIVE", world: migrated, seed: alternative.seed }).map.tiles,
    runJob({ kind: "ALTERNATIVE", world: current, seed: alternative.seed }).map.tiles);
  validateWorldRecord(migrated);
});

test("recipe migration preserves physical controls but retires story inputs", () => {
  const old = { ...defaultRecipe(), version: 3, landscape: "POLAR_THAW", temperature: 37, events: [{ kind: "THAW" }], motifs: [] };
  const recipe = migrateRecipe(old);
  assert.equal(recipe.landscape, "ICE_MARGINS");
  assert.equal(recipe.temperature, 37);
  assert.equal(recipe.version, 4);
  assert.ok(!("events" in recipe) && !("motifs" in recipe));
  assert.throws(() => migrateRecipe({ ...old, version: 100 }), /Unsupported/);
});
