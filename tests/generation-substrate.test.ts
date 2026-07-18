import assert from "node:assert/strict";
import test from "node:test";
import { derivedEvidenceIsCurrent, type DerivedEvidence, type ProtectionState } from "../lib/authoring-schema.ts";
import { parseCiv5Map, serializeCiv5Map, type Civ5Map } from "../lib/civ5-map.ts";
import { addGenerationToHistory, restoreGeneration } from "../lib/generation-history.ts";
import { attachSemanticIdentities, markGenerationStructureStale, type GenerationStructure } from "../lib/generation-structure.ts";
import { dependentPassIds, GENERATION_PASS_DEFINITIONS, GenerationCancelledError, GenerationPassSession, generationInputHash, invalidatePassEvidence, type GenerationPassDefinition } from "../lib/generation-pass-graph.ts";
import { DEFAULT_GENERATION_OPTIONS, estimateGenerationResources, generateMap, generateMapFromRecipe, randomGenerationOptions, randomGenerationRecipe } from "../lib/map-generator.ts";
import { cloneGenerationRecipe, generationOptionsFromRecipe, generationRecipeFromOptions, normalizeGenerationRecipe, type WorldScale } from "../lib/generation-recipe.ts";
import { ARCHETYPE_PROFILES, applyWorldArchetype, compatibleArchetypes } from "../lib/world-archetype.ts";
import { createExcogitareProject, parseExcogitareProject, serializeExcogitareProject } from "../lib/excogitare-project.ts";
import { applyProtectionState, emptyProtectionState, protectSemanticObject, protectTiles } from "../lib/map-protection.ts";
import { buildArchetypeRefinementCandidate } from "../lib/map-design.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { WORLD_SCALE_PROFILES } from "../lib/world-scale.ts";

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

test("pass invalidation follows declared dependencies without invalidating independent ancestors", () => {
  const definitions: GenerationPassDefinition[] = [
    { id: "ROOT", version: 1, dependencies: [], ownedOutputs: ["root"] },
    { id: "LEFT", version: 1, dependencies: ["ROOT"], ownedOutputs: ["left"] },
    { id: "RIGHT", version: 1, dependencies: ["ROOT"], ownedOutputs: ["right"] },
    { id: "JOIN", version: 1, dependencies: ["LEFT", "RIGHT"], ownedOutputs: ["join"] },
  ];
  assert.deepEqual([...dependentPassIds(definitions, ["LEFT"])], ["LEFT", "JOIN"]);
  const evidence = definitions.map((definition) => ({ passId: definition.id, passVersion: definition.version, inputHash: "one", state: "CURRENT" as const }));
  const invalidated = invalidatePassEvidence(evidence, ["LEFT"], "left changed", definitions);
  assert.deepEqual(invalidated.filter((entry) => entry.state === "STALE").map((entry) => entry.passId), ["LEFT", "JOIN"]);
  assert.equal(invalidated.find((entry) => entry.passId === "RIGHT")?.state, "CURRENT");
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
    assert.equal(first.structure?.provenance?.length, 10);
    const passOrder = first.structure?.provenance?.map((pass) => pass.passId) ?? [];
    assert.deepEqual(new Set(passOrder), new Set(GENERATION_PASS_DEFINITIONS.map((definition) => definition.id)));
    for (const definition of GENERATION_PASS_DEFINITIONS) for (const dependency of definition.dependencies) assert.ok(passOrder.indexOf(dependency) < passOrder.indexOf(definition.id), `${dependency} must complete before ${definition.id}`);
    assert.equal(first.structure?.passEvidence?.length, 10);
    assert.ok(first.structure?.passEvidence?.every((entry) => entry.state === "CURRENT"));
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

  const hydrologyOnly = markGenerationStructureStale(map.structure, "river edit", ["HYDROLOGY"]);
  assert.equal(hydrologyOnly?.passEvidence?.find((entry) => entry.passId === "TOPOLOGY")?.state, "CURRENT");
  assert.deepEqual(hydrologyOnly?.passEvidence?.filter((entry) => entry.state === "STALE").map((entry) => entry.passId), ["HYDROLOGY", "LEGALITY", "SEMANTIC_IDENTITY"]);
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

test("all engines materially distinguish five scales while Map Size adds resolution", () => {
  const scales = Object.keys(WORLD_SCALE_PROFILES) as WorldScale[];
  const engines = [["EXCOGITARE", "CONTINENTS"], ["ECCENTRIC", "GREAT_WATERSHEDS"], ["PHYSICAL", "DYNAMIC_EARTH"], ["POLIS", "IMPERIAL_RING"]] as const;
  for (const [engine, mapType] of engines) {
    const signatures = new Set<string>();
    for (const scale of scales) {
      const recipe = generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, engine, preset: mapType, size: "DUEL", players: 4, cityStates: 2, seed: `scale-matrix-${engine.toLowerCase()}` });
      recipe.scale = scale;
      const first = generateMapFromRecipe(recipe);
      const second = generateMapFromRecipe(recipe);
      assert.deepEqual(first.tiles, second.tiles);
      assert.equal(first.recipe?.scale, scale);
      assert.equal(first.structure?.diagnostics.scaleOrdinal, WORLD_SCALE_PROFILES[scale].ordinal);
      assert.equal(first.tiles.filter((tile) => tile.terrain < 2).length, Math.round(first.tiles.length * recipe.settings.waterPercent / 100));
      assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), []);
      signatures.add(first.tiles.map((tile) => `${tile.terrain}${tile.elevation}${tile.feature}${tile.river}`).join(""));
    }
    assert.equal(signatures.size, scales.length, `${engine} did not materially distinguish every scale`);

    const maps = (["DUEL", "STANDARD"] as const).map((size) => {
      const recipe = generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, engine, preset: mapType, size, players: 4, cityStates: 2, seed: `scale-resolution-${engine.toLowerCase()}` });
      recipe.scale = "REGIONAL";
      return generateMapFromRecipe(recipe);
    });
    assert.equal(maps[0].recipe?.scale, maps[1].recipe?.scale);
    assert.ok(maps[1].tiles.length > maps[0].tiles.length);
    if (engine === "EXCOGITARE") assert.equal(maps[0].structure?.diagnostics.scaleExcogitareCenters, maps[1].structure?.diagnostics.scaleExcogitareCenters);
    if (engine === "ECCENTRIC") assert.equal(maps[0].structure?.diagnostics.scaleEccentricPolygonTarget, maps[1].structure?.diagnostics.scaleEccentricPolygonTarget);
    if (engine === "PHYSICAL") assert.equal(maps[0].structure?.diagnostics.plates, maps[1].structure?.diagnostics.plates);
    if (engine === "POLIS") assert.equal(maps[0].structure?.diagnostics.fronts, maps[1].structure?.diagnostics.fronts);
  }
});

test("Archetype intensities are nested, ecological, deterministic and topology preserving", () => {
  const source = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 1, seed: "archetype-intensity" });
  for (const profile of Object.values(ARCHETYPE_PROFILES)) {
    assert.ok(profile.climateEnvelope.temperature[0] <= profile.climateEnvelope.temperature[1]);
    assert.ok(profile.climateEnvelope.moisture[0] <= profile.climateEnvelope.moisture[1]);
    assert.ok(profile.resourceEcology.length > 0);
    assert.ok(profile.wonderTendencies.length > 0);
    const coats = (["HINT", "STRONG", "TRANSFORMATIVE"] as const).map((intensity) => applyWorldArchetype(source, profile.id, intensity));
    const changed = coats.map((coat) => coat.tiles.filter((tile, index) => tile.terrain !== source.tiles[index].terrain || tile.feature !== source.tiles[index].feature).length);
    assert.ok(changed[0] <= changed[1] && changed[1] <= changed[2], `${profile.id} intensity was not nested: ${changed.join(",")}`);
    assert.ok(changed[2] > 0);
    for (const coat of coats) {
      assert.deepEqual(coat.startLocations, source.startLocations);
      for (let index = 0; index < source.tiles.length; index += 1) {
        assert.equal(coat.tiles[index].terrain < 2, source.tiles[index].terrain < 2);
        assert.equal(coat.tiles[index].elevation, source.tiles[index].elevation);
        assert.equal(coat.tiles[index].river, source.tiles[index].river);
        assert.equal(coat.tiles[index].owner, source.tiles[index].owner);
      }
    }
  }
});

test("Archetype refinement previews are atomic, protected and preserve imported scenario fields", () => {
  const generated = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 1, seed: "archetype-preview" });
  const authoredIndex = generated.tiles.findIndex((tile) => tile.terrain >= 2 && tile.elevation < 2);
  const source: Civ5Map = { ...generated, source: "file", tiles: generated.tiles.map((tile, index) => index === authoredIndex ? { ...tile, route: "ROUTE_ROAD", improvement: "IMPROVEMENT_CITY_RUINS", owner: 3 } : { ...tile }) };
  const recipe = { ...generated.recipe!, archetype: "SUNSCOURGED" as const, archetypeIntensity: "TRANSFORMATIVE" as const };
  const candidate = buildArchetypeRefinementCandidate(source, generationOptionsFromRecipe(recipe), recipe, 1);
  assert.notDeepEqual(candidate.tiles, source.tiles);
  assert.deepEqual(candidate.startLocations, source.startLocations);
  assert.deepEqual(candidate.cities, source.cities);
  for (let index = 0; index < source.tiles.length; index += 1) {
    assert.equal(candidate.tiles[index].terrain < 2, source.tiles[index].terrain < 2);
    assert.equal(candidate.tiles[index].elevation, source.tiles[index].elevation);
    assert.equal(candidate.tiles[index].river, source.tiles[index].river);
    assert.equal(candidate.tiles[index].owner, source.tiles[index].owner);
    assert.equal(candidate.tiles[index].route, source.tiles[index].route);
    assert.equal(candidate.tiles[index].improvement, source.tiles[index].improvement);
  }
  assert.deepEqual(buildRepairIssues(candidate).filter((issue) => issue.id !== "clean" && issue.severity !== "INFO"), []);
  assert.ok(candidate.tiles.some((tile) => tile.resource !== 255 && ["RESOURCE_WHEAT", "RESOURCE_SHEEP", "RESOURCE_OIL", "RESOURCE_GOLD"].includes(candidate.resources[tile.resource])));
  assert.ok(candidate.tiles.some((tile) => tile.wonder !== 255 && ["FEATURE_ULURU", "FEATURE_GRAND_MESA"].includes(candidate.wonders[tile.wonder])));
  const protectedState = protectTiles(emptyProtectionState(), source.width, source.height, [authoredIndex], ["CLIMATE", "FEATURES", "CONTENT"], "Protected authored tile");
  const protectedResult = applyProtectionState(source, candidate, protectedState);
  assert.equal(protectedResult.blocked, false);
  assert.deepEqual(protectedResult.map.tiles[authoredIndex], source.tiles[authoredIndex]);
  const existing = buildArchetypeRefinementCandidate(source, generationOptionsFromRecipe({ ...recipe, archetype: "EXISTING" }), { ...recipe, archetype: "EXISTING" }, 2);
  assert.deepEqual(existing.tiles, source.tiles);
});

test("Randomise selects compatible non-transformative Scale and Archetype recipes", () => {
  let state = 0x12345678;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (let index = 0; index < 80; index += 1) {
    const recipe = randomGenerationRecipe(random, false);
    assert.ok(recipe.scale in WORLD_SCALE_PROFILES);
    assert.notEqual(recipe.archetypeIntensity, "TRANSFORMATIVE");
    if (recipe.archetype !== "EXISTING" && recipe.archetype !== "NARRATIVE_DEFAULT") assert.ok(compatibleArchetypes({ style: recipe.character }).some((profile) => profile.id === recipe.archetype));
    assert.ok(!["EXTREME", "COLOSSAL"].includes(recipe.settings.size));
    assert.ok(!["NEEDLE", "RIBBON", "PIN", "STRING"].includes(recipe.settings.geometry));
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
  assert.match(first.structure?.provenance?.find((entry) => entry.passId === "TOPOLOGY")?.relaxations[0] ?? "", /Selected deterministic candidate/);
});

test("resource estimates expose deterministic candidate and oversized-memory costs", () => {
  const standard = estimateGenerationResources({ ...DEFAULT_GENERATION_OPTIONS, size: "STANDARD", geometry: "STANDARD", engine: "EXCOGITARE" }, "STANDARD");
  const colossal = estimateGenerationResources({ ...DEFAULT_GENERATION_OPTIONS, size: "COLOSSAL", geometry: "STANDARD", engine: "PHYSICAL" }, "EXHAUSTIVE");
  assert.equal(standard.candidates, 1);
  assert.equal(colossal.candidates, 12);
  assert.ok(colossal.estimatedPeakBytes > standard.estimatedPeakBytes);
  assert.match(colossal.warning ?? "", /evaluates 12 candidates/);
});

test("cooperative cancellation stops a candidate run without mutating an installed map", () => {
  const installed = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "installed-before-cancel" });
  const installedTiles = installed.tiles.map((tile) => ({ ...tile }));
  const recipe = { ...generationRecipeFromOptions({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 0, seed: "cancel-candidates" }), effort: "EXHAUSTIVE" as const };
  let progressEvents = 0;
  assert.throws(() => generateMapFromRecipe(recipe, () => { progressEvents += 1; }, { isCancelled: () => progressEvents >= 2 }), GenerationCancelledError);
  assert.deepEqual(installed.tiles, installedTiles);
});

test("downloaded Excogitare projects round-trip complete authored state and reject corruption", () => {
  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, size: "DUEL", players: 2, cityStates: 1, seed: "project-round-trip" });
  const recipe = { ...map.recipe!, scale: "REGIONAL" as const, archetype: "SUNSCOURGED" as const };
  const history = { schemaVersion: 1 as const, activeEntryId: "2", entries: [
    { id: "2", parentId: "1", operation: "SELECTIVE_CLIMATE", createdAt: "2026-07-17T00:02:00.000Z", recipe, map: { ...map, recipe }, provenance: map.structure?.provenance ?? [] },
    { id: "1", operation: "GENERATE", createdAt: "2026-07-17T00:01:00.000Z", recipe, map: { ...map, recipe }, provenance: map.structure?.provenance ?? [] },
  ] };
  const editorState = { schemaVersion: 1 as const, workspace: "CREATE" as const, stage: "ITERATE", view: { zoom: 1.75, x: 18, y: -7 }, expandedSections: ["REFINE:climate-group", "ITERATE:generation-history"], stageScrollPositions: { GENERATE: 120, REFINE: 360, ITERATE: 84, EDIT: 210, ANALYZE: 40 } };
  const project = createExcogitareProject({ projectName: "A downloaded project", map: { ...map, recipe }, recipe, history, editorState, excogitareVersion: "test", now: "2026-07-17T00:00:00.000Z", projectId: "project-fixture" });
  const serialized = serializeExcogitareProject(project);
  const restored = parseExcogitareProject(serialized);
  assert.equal(restored.manifest.projectName, "A downloaded project");
  assert.equal(restored.recipe.scale, "REGIONAL");
  assert.equal(restored.recipe.archetype, "SUNSCOURGED");
  assert.equal(restored.recipe.archetypeIntensity, "STRONG");
  assert.deepEqual(restored.map.tiles, map.tiles);
  assert.deepEqual(restored.map.structure, JSON.parse(JSON.stringify(map.structure)));
  assert.equal(restored.scenario.factions.length, map.startLocations.length);
  assert.equal(restored.history.activeEntryId, "2");
  assert.equal(restored.history.entries[0].parentId, "1");
  assert.equal(restored.history.entries[0].operation, "SELECTIVE_CLIMATE");
  assert.equal(restored.history.entries[0].createdAt, "2026-07-17T00:02:00.000Z");
  assert.equal(restored.editorState?.stage, "ITERATE");
  assert.deepEqual(restored.editorState?.expandedSections, editorState.expandedSections);
  assert.deepEqual(restored.editorState?.stageScrollPositions, editorState.stageScrollPositions);
  assert.deepEqual(restored.editorState?.view, editorState.view);

  const legacyRecipe = JSON.parse(JSON.stringify(recipe));
  delete legacyRecipe.archetypeIntensity;
  assert.equal(normalizeGenerationRecipe(legacyRecipe, DEFAULT_GENERATION_OPTIONS).archetypeIntensity, "STRONG");

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
