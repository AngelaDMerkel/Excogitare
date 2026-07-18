import assert from "node:assert/strict";
import test from "node:test";
import { derivedEvidenceIsCurrent, type DerivedEvidence, type ProtectionState } from "../lib/authoring-schema.ts";
import { parseCiv5Map, serializeCiv5Map } from "../lib/civ5-map.ts";
import { addGenerationToHistory, restoreGeneration } from "../lib/generation-history.ts";
import { attachSemanticIdentities, markGenerationStructureStale, type GenerationStructure } from "../lib/generation-structure.ts";
import { GenerationCancelledError, GenerationPassSession, generationInputHash, type GenerationPassDefinition } from "../lib/generation-pass-graph.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, generateMapFromRecipe, randomGenerationOptions } from "../lib/map-generator.ts";
import { cloneGenerationRecipe, generationOptionsFromRecipe, generationRecipeFromOptions, normalizeGenerationRecipe } from "../lib/generation-recipe.ts";
import { ARCHETYPE_PROFILES, applyWorldArchetype } from "../lib/world-archetype.ts";
import { createExcogitareProject, parseExcogitareProject, serializeExcogitareProject } from "../lib/excogitare-project.ts";
import { applyProtectionState, emptyProtectionState, protectSemanticObject, protectTiles } from "../lib/map-protection.ts";

test("legacy options migrate into one authoritative recipe and compile without loss", () => {
  const options = { ...DEFAULT_GENERATION_OPTIONS, seed: "recipe-migration", engine: "POLIS" as const, preset: "RIVAL_CONTINENTS" as const, players: 6, cityStates: 5, balance: "TEAMS" as const, teamSize: 3 as const, dominantTerrains: ["PLAINS" as const] };
  const recipe = generationRecipeFromOptions(options);
  assert.equal(recipe.schemaVersion, 1);
  assert.equal(recipe.mapType, "RIVAL_CONTINENTS");
  assert.equal(recipe.matchIntent.flexiblePlayers, 6);
  assert.equal(recipe.matchIntent.teamIntent, "FIXED_TEAMS");
  assert.deepEqual(generationOptionsFromRecipe(recipe), options);
  assert.deepEqual(normalizeGenerationRecipe(options, DEFAULT_GENERATION_OPTIONS), recipe);
  assert.equal(normalizeGenerationRecipe({ ...options, engine: "REGION_GRAPH" } as unknown, DEFAULT_GENERATION_OPTIONS).engine, "ECCENTRIC");
  assert.throws(() => normalizeGenerationRecipe({ ...options, engine: "UNKNOWN_ENGINE" } as unknown, DEFAULT_GENERATION_OPTIONS), /Unsupported legacy generation engine/);

  const cloned = cloneGenerationRecipe(recipe)!;
  cloned.settings.dominantTerrains.push("DESERT");
  cloned.matchIntent.enabledVictories.pop();
  assert.deepEqual(recipe.settings.dominantTerrains, ["PLAINS"]);
  assert.equal(recipe.matchIntent.enabledVictories.length, 5);
});

test("recipe normalization rejects future schemas and invalid victory contracts", () => {
  const recipe = generationRecipeFromOptions(DEFAULT_GENERATION_OPTIONS);
  assert.throws(() => normalizeGenerationRecipe({ ...recipe, schemaVersion: 2 }, DEFAULT_GENERATION_OPTIONS), /Unsupported generation recipe schema version/);
  assert.throws(() => normalizeGenerationRecipe({ ...recipe, matchIntent: { ...recipe.matchIntent, enabledVictories: [] } }, DEFAULT_GENERATION_OPTIONS), /at least one victory/);
  const normalized = normalizeGenerationRecipe({ ...recipe, matchIntent: { ...recipe.matchIntent, emphasizedVictories: ["SCIENCE", "SCIENCE", "TIME"] } }, DEFAULT_GENERATION_OPTIONS);
  assert.deepEqual(normalized.matchIntent.emphasizedVictories, ["SCIENCE", "TIME"]);
});

const PASS_DEFINITIONS: GenerationPassDefinition[] = [
  { id: "ONE", version: 1, dependencies: [], ownedOutputs: ["one"] },
  { id: "TWO", version: 3, dependencies: ["ONE"], ownedOutputs: ["two"] },
];

test("pass provenance, sub-seeds and input hashes are deterministic", () => {
  const capture = (input: unknown) => {
    const session = new GenerationPassSession(PASS_DEFINITIONS, "pass-seed", input, "THOROUGH");
    session.progress("ONE", "First");
    session.complete("ONE");
    session.progress("TWO", "Second");
    session.complete("TWO", ["bounded correction"]);
    return { hash: session.inputHash, candidates: session.candidateCount, provenance: session.finish() };
  };
  assert.deepEqual(capture({ beta: 2, alpha: 1 }), capture({ alpha: 1, beta: 2 }));
  assert.equal(capture({ alpha: 1 }).candidates, 4);
  assert.notEqual(generationInputHash({ alpha: 1 }), generationInputHash({ alpha: 2 }));
  assert.throws(() => new GenerationPassSession([{ id: "BROKEN", version: 1, dependencies: ["MISSING"], ownedOutputs: [] }], "seed", {}, "STANDARD"), /unknown pass/);

  const cancelled = new GenerationPassSession(PASS_DEFINITIONS, "seed", {}, "STANDARD", undefined, { isCancelled: () => true });
  assert.throws(() => cancelled.progress("ONE", "First"), GenerationCancelledError);
});

test("all engines retain recipes, structured progress, semantic identities and pass provenance", () => {
  for (const [engine, preset] of [["EXCOGITARE", "CONTINENTS"], ["ECCENTRIC", "GREAT_WATERSHEDS"], ["PHYSICAL", "DYNAMIC_EARTH"], ["POLIS", "IMPERIAL_RING"]] as const) {
    const progress: Array<{ stage: string; passId: string; completed: number }> = [];
    const options = { ...DEFAULT_GENERATION_OPTIONS, engine, preset, size: "DUEL" as const, players: 2, cityStates: 1, seed: `substrate-${engine.toLowerCase()}` };
    const first = generateMap(options, (stage, event) => progress.push({ stage, passId: event.passId, completed: event.completedPasses }));
    const second = generateMap(options);
    assert.deepEqual(first.recipe, second.recipe);
    assert.deepEqual(first.tiles, second.tiles);
    assert.deepEqual(first.structure, second.structure);
    assert.equal(first.recipe?.engine, engine);
    assert.equal(first.structure?.schemaVersion, 1);
    assert.equal(first.structure?.provenance?.length, 8);
    assert.deepEqual(first.structure?.provenance?.map((pass) => pass.passId), ["NORMALIZE", "ENGINE", "ACCESSIBILITY", "STARTS", "CONTENT", "HYDROLOGY", "LEGALITY", "SEMANTIC_IDENTITY"]);
    assert.ok(first.structure?.objects.every((object) => Boolean(object.semanticId)));
    assert.equal(new Set(first.structure?.objects.map((object) => object.semanticId)).size, first.structure?.objects.length);
    assert.equal(first.structure?.semanticLineage?.length, first.structure?.objects.length);
    assert.ok(progress.some((event) => event.passId === "SEMANTIC_IDENTITY"));
  }
});

test("semantic lineage retains an earlier identity only for an unambiguous related object", () => {
  const structure = (tiles: number[]): GenerationStructure => ({ engine: "EXCOGITARE", objects: [{ id: "continent-1", name: "Continent 1", kind: "CONTINENT", tileIndices: tiles }], mountainRanges: [], riverSystems: [], diagnostics: {} });
  const previous = attachSemanticIdentities(structure([11, 12, 21, 22]), 10, 10);
  const current = attachSemanticIdentities(structure([12, 13, 22, 23]), 10, 10, previous);
  assert.equal(current.objects[0].semanticId, previous.objects[0].semanticId);
  assert.equal(current.semanticLineage?.[0].status, "MATCHED");
  assert.ok((current.semanticLineage?.[0].confidence ?? 0) >= 0.42);
});

test("derived evidence and history reject stale or shared authoring state", () => {
  const passVersions = { ENGINE: 1, STARTS: 1 };
  const evidence: DerivedEvidence = { inputHash: "abc", generatorVersion: "1", passVersions };
  assert.equal(derivedEvidenceIsCurrent(evidence, "abc", "1", passVersions), true);
  assert.equal(derivedEvidenceIsCurrent(evidence, "changed", "1", passVersions), false);
  assert.equal(derivedEvidenceIsCurrent(evidence, "abc", "2", passVersions), false);
  assert.equal(derivedEvidenceIsCurrent(evidence, "abc", "1", { ENGINE: 2, STARTS: 1 }), false);

  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "history-recipe" });
  const history = addGenerationToHistory([], map, 1);
  const restored = restoreGeneration(history[0]);
  restored.recipe!.matchIntent.enabledVictories.pop();
  restored.structure!.provenance![0].relaxations.push("test-only");
  assert.equal(history[0].map.recipe!.matchIntent.enabledVictories.length, 5);
  assert.deepEqual(history[0].map.structure!.provenance![0].relaxations, []);

  const stale = markGenerationStructureStale(map.structure, "test mutation");
  assert.equal(stale?.evidenceState, "STALE");
  assert.equal(stale?.staleReason, "test mutation");
  assert.equal(map.structure?.evidenceState, "CURRENT");
});

test("imports remain honest about absent generation intent and Randomise produces complete recipes", () => {
  const generated = generateMap({ ...randomGenerationOptions(() => 0.25), size: "DUEL", players: 2, cityStates: 0, seed: "random-recipe" });
  assert.deepEqual(generationOptionsFromRecipe(generated.recipe!), generated.generation);
  const imported = parseCiv5Map(serializeCiv5Map(generated), "imported.Civ5Map");
  assert.equal(imported.recipe, undefined);
  assert.equal(imported.generation, undefined);
});

test("authored archetypes repaint deterministically without changing topography or scenario state", () => {
  const source = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 1, seed: "archetype-preservation" });
  for (const archetype of Object.keys(ARCHETYPE_PROFILES) as Array<keyof typeof ARCHETYPE_PROFILES>) {
    const first = applyWorldArchetype(source, archetype);
    const second = applyWorldArchetype(source, archetype);
    assert.deepEqual(first.tiles, second.tiles);
    assert.deepEqual(first.startLocations, source.startLocations);
    assert.deepEqual(first.cities, source.cities);
    for (let index = 0; index < source.tiles.length; index += 1) {
      assert.equal(first.tiles[index].terrain < 2, source.tiles[index].terrain < 2);
      assert.equal(first.tiles[index].elevation, source.tiles[index].elevation);
      assert.equal(first.tiles[index].river, source.tiles[index].river);
      assert.equal(first.tiles[index].owner, source.tiles[index].owner);
    }
  }
});

test("Thorough effort evaluates a fixed deterministic candidate budget", () => {
  const recipe = { ...generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "thorough-candidates" }), effort: "THOROUGH" as const };
  const progress: Array<{ candidate: number; count: number }> = [];
  const first = generateMapFromRecipe(recipe, (_stage, event) => progress.push({ candidate: event.candidate, count: event.candidateCount }));
  const second = generateMapFromRecipe(recipe);
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.structure, second.structure);
  assert.deepEqual([...new Set(progress.filter((event) => event.count === 4).map((event) => event.candidate))], [1, 2, 3, 4]);
  assert.match(first.structure?.provenance?.find((entry) => entry.passId === "ENGINE")?.relaxations[0] ?? "", /Selected deterministic candidate/);
});

test("downloaded Excogitare projects round-trip complete authored state and reject corruption", () => {
  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 1, seed: "project-round-trip" });
  const recipe = { ...map.recipe!, scale: "REGIONAL" as const, archetype: "SUNSCOURGED" as const };
  const project = createExcogitareProject({ projectName: "A downloaded project", map: { ...map, recipe }, recipe, excogitareVersion: "test", now: "2026-07-17T00:00:00.000Z", projectId: "project-fixture" });
  const serialized = serializeExcogitareProject(project);
  const restored = parseExcogitareProject(serialized);
  assert.equal(restored.manifest.projectName, "A downloaded project");
  assert.equal(restored.recipe.scale, "REGIONAL");
  assert.equal(restored.recipe.archetype, "SUNSCOURGED");
  assert.deepEqual(restored.map.tiles, map.tiles);
  assert.deepEqual(restored.map.structure, JSON.parse(JSON.stringify(map.structure)));
  assert.equal(restored.scenario.factions.length, map.startLocations.length);

  const corrupted = JSON.parse(serialized);
  corrupted.project.map.name = "silently changed";
  assert.throws(() => parseExcogitareProject(JSON.stringify(corrupted)), /checksum failed/);
  const future = JSON.parse(serialized);
  future.schemaVersion = 2;
  assert.throws(() => parseExcogitareProject(JSON.stringify(future)), /Unsupported Excogitare project schema version/);
});

test("tile and semantic protection constrain selective replacement without mutating either input", () => {
  const source = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "protected-source" });
  const candidate = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "protected-candidate" });
  const protectedIndex = source.tiles.findIndex((tile, index) => tile.terrain !== candidate.tiles[index].terrain || tile.elevation !== candidate.tiles[index].elevation);
  assert.ok(protectedIndex >= 0);
  let state: ProtectionState = protectTiles(emptyProtectionState(), source.width, source.height, [protectedIndex], ["TOPOLOGY", "ELEVATION", "HYDROLOGY"], "Test ridge");
  const semantic = source.structure?.objects.find((object) => object.semanticId && object.tileIndices.length > 0);
  assert.ok(semantic?.semanticId);
  state = protectSemanticObject(state, source, semantic!.semanticId!, "FUNCTION");
  const result = applyProtectionState(source, candidate, state);
  assert.equal(result.blocked, false);
  assert.equal(result.map.tiles[protectedIndex].terrain, source.tiles[protectedIndex].terrain);
  assert.equal(result.map.tiles[protectedIndex].elevation, source.tiles[protectedIndex].elevation);
  assert.equal(result.map.tiles[protectedIndex].river, source.tiles[protectedIndex].river);
  assert.equal(result.map.structure?.evidenceState, "STALE");
  assert.notEqual(result.map.tiles, source.tiles);
  assert.notEqual(result.map.tiles, candidate.tiles);
});
