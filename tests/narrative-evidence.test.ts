import assert from "node:assert/strict";
import test from "node:test";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, type GenerationEngine, type MapPresetId } from "../lib/map-generator.ts";
import { compileNarrativeConstraintProgram, type NarrativeProgramDefinition } from "../lib/narrative-constraints.ts";
import {
  createNarrativeEvidence,
  markNarrativeEvidenceStale,
  narrativeEvidenceMatchesMap,
  validateNarrativeEvidence,
} from "../lib/narrative-evidence.ts";
import { narrativeProfile } from "../lib/narrative-map-types.ts";
import { evaluateNarrativeConstraintProgram, extractNarrativeSemantics } from "../lib/narrative-semantics.ts";
import { createExcogitareProject, parseExcogitareProject, projectDerivedEvidenceForMap, serializeExcogitareProject, serializeLegacyExcogitareProjectV1 } from "../lib/excogitare-project.ts";
import { parseCiv5Map, serializeCiv5Map } from "../lib/civ5-map.ts";
import { markGenerationStructureStale } from "../lib/generation-structure.ts";
import { narrativeNativeContract } from "../lib/narrative-native-contracts.ts";

function evidenceDefinition(profileId: MapPresetId, engine: GenerationEngine): NarrativeProgramDefinition {
  return {
    schemaVersion: 1,
    profileId,
    engine,
    essential: [{
      id: "substantial-land",
      label: "Substantial land",
      semanticKey: "land",
      scope: "MAP",
      roles: ["landmass"],
      weight: 1,
      tolerance: 0.1,
      scaleLaw: "AREA",
      relaxable: true,
    }],
    preferred: [],
    prohibited: [],
    relaxationOrder: [{
      id: "weaken-land",
      label: "Weaken land",
      constraintIds: ["substantial-land"],
      consequence: "The world may contain less land.",
    }],
    requiredEvidence: [{
      id: "substantial-land-share",
      constraintId: "substantial-land",
      measureKey: "land-share",
      operator: "AT_LEAST",
      target: 0.1,
      minimumConfidence: 0.9,
    }],
  };
}

function fixture(engine: GenerationEngine = "EXCOGITARE", preset: MapPresetId = "CONTINENTS") {
  const map = generateMap({ ...DEFAULT_GENERATION_OPTIONS, engine, preset, size: "DUEL", players: 2, cityStates: 1, seed: `contract-two-c-${engine.toLowerCase()}` });
  const recipe = generationRecipeFromOptions(map.generation!);
  const program = compileNarrativeConstraintProgram(evidenceDefinition(preset, engine), narrativeProfile(preset), recipe, { width: map.width, height: map.height, wraps: map.wraps });
  const model = extractNarrativeSemantics(map);
  const evaluation = evaluateNarrativeConstraintProgram(program, model);
  return { map, recipe, evidence: createNarrativeEvidence(map, program, model, evaluation) };
}

test("Contract 2C evidence is alias-safe, metadata-insensitive, and explicitly stale after semantic edits", () => {
  const { map, evidence } = fixture();
  assert.equal(narrativeEvidenceMatchesMap(evidence, map), true);
  assert.equal(narrativeEvidenceMatchesMap(evidence, { ...map, name: "Renamed", description: "Metadata only" }), true);

  const changed = structuredClone(map);
  changed.tiles[0].terrain = changed.tiles[0].terrain < 2 ? 2 : 0;
  assert.equal(narrativeEvidenceMatchesMap(evidence, changed), false);
  assert.throws(() => validateNarrativeEvidence(evidence, changed), /does not match its authored map/);

  const stale = markNarrativeEvidenceStale(evidence, "Topology changed.");
  assert.equal(stale?.state, "STALE");
  assert.equal(stale?.staleReason, "Topology changed.");
  assert.doesNotThrow(() => validateNarrativeEvidence(stale, changed));
  stale!.model.objects[0].tileIndices.length = 0;
  assert.notDeepEqual(stale, evidence);
  assert.ok(evidence.model.objects[0].tileIndices.length > 0);
});

test("Contract 2C persists exact current, history, and checkpoint evidence with an optional capability", () => {
  const { map, recipe, evidence } = fixture();
  const derived = {
    inputHash: map.structure!.inputHash!,
    generatorVersion: map.structure!.generatorVersion!,
    passVersions: Object.fromEntries((map.structure?.provenance ?? []).map((entry) => [entry.passId, entry.passVersion])),
    narrativeSemantics: evidence,
  };
  const history = {
    schemaVersion: 1 as const,
    activeEntryId: "1",
    entries: [{ id: "1", operation: "GENERATE", recipe, map, provenance: map.structure?.provenance ?? [], derived }],
    checkpoints: [{ id: "checkpoint", name: "Recognized continents", createdAt: 1, recipe, map, provenance: map.structure?.provenance ?? [], derived }],
  };
  const project = createExcogitareProject({ projectName: "Narrative evidence", map, recipe, history, derived, excogitareVersion: "test", now: "2026-07-28T00:00:00.000Z" });
  const restored = parseExcogitareProject(serializeExcogitareProject(project, { now: "2026-07-28T00:01:00.000Z" }));

  assert.ok(restored.manifest.requiredCapabilities.includes("narrative-semantic-evidence-v1"));
  assert.deepEqual(restored.derived?.narrativeSemantics, evidence);
  assert.deepEqual(restored.history.entries[0].derived?.narrativeSemantics, evidence);
  assert.deepEqual(restored.history.checkpoints?.[0].derived?.narrativeSemantics, evidence);
  assert.deepEqual(restored.history.entries[0].map.structure?.narrativeNativePlan, map.structure?.narrativeNativePlan);
  assert.deepEqual(restored.history.checkpoints?.[0].map.structure?.narrativeNativeEvidence, map.structure?.narrativeNativeEvidence);
  restored.history.entries[0].derived!.narrativeSemantics!.model.objects[0].tileIndices.length = 0;
  restored.history.entries[0].map.structure!.narrativeNativePlan!.appliedRelaxations.push({ id: "history-alias-sentinel", operations: [], consequence: "Test only." });
  assert.ok(restored.derived!.narrativeSemantics!.model.objects[0].tileIndices.length > 0);
  assert.notDeepEqual(restored.history.entries[0].map.structure?.narrativeNativePlan, restored.map.structure?.narrativeNativePlan);

  const compact = parseExcogitareProject(serializeExcogitareProject({
    ...project,
    derived: undefined,
    history: { ...history, checkpoints: [] },
  }, { historyPolicy: "CURRENT_AND_CHECKPOINTS", now: "2026-07-28T00:02:00.000Z" }));
  assert.equal(compact.history.entries.length, 0);
  assert.equal(compact.manifest.requiredCapabilities.includes("narrative-semantic-evidence-v1"), false);
});

test("the selected effective native contract and relaxation prefix persist only in alias-safe project snapshots", () => {
  const preset = "ARCHIPELAGO" as const;
  const sourceContract = narrativeNativeContract(preset);
  const requestedRelaxationId = sourceContract.relaxationPolicy[0].id;
  const selectedRelaxationIds = sourceContract.relaxationPolicy.slice(0, 2).map((step) => step.id);
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: "EXCOGITARE",
    preset,
    size: "DUEL",
    players: 2,
    cityStates: 1,
    waterPercent: 70,
    seed: "effective-native-project-boundary",
  }, undefined, { narrativeRelaxationIds: [requestedRelaxationId] });
  const selected = map.structure?.narrativeNativePlan;
  assert.ok(selected);
  assert.deepEqual(selected.appliedRelaxations.map((step) => step.id), selectedRelaxationIds, "the authored first step is a starting prefix; negotiation must add the minimum second step needed to prove every viable shelf anchor");
  assert.notDeepEqual(selected.contract, sourceContract, "the installed plan must retain the effective negotiated contract rather than the catalogue source");
  assert.notEqual(selected.contract.topology.fragmentation, sourceContract.topology.fragmentation, "the selected plan must carry the relaxed effective value, not merely the original catalogue contract");
  assert.notDeepEqual(selected.contract.topology.primarySystems, sourceContract.topology.primarySystems, "the selected second step must alter the effective shelf-system count");

  const derived = projectDerivedEvidenceForMap(undefined, map)!;
  const recipe = map.recipe!;
  const history = {
    schemaVersion: 1 as const,
    activeEntryId: "effective",
    entries: [{ id: "effective", operation: "GENERATE", recipe, map, provenance: map.structure?.provenance ?? [], derived }],
    checkpoints: [{ id: "effective-checkpoint", name: "Effective contract", createdAt: 1, recipe, map, provenance: map.structure?.provenance ?? [], derived }],
  };
  const restored = parseExcogitareProject(serializeExcogitareProject(createExcogitareProject({
    projectName: "Effective native contract",
    map,
    recipe,
    history,
    derived,
    excogitareVersion: "test",
    now: "2026-07-28T00:00:00.000Z",
  })));
  const plans = [
    restored.map.structure?.narrativeNativePlan,
    restored.history.entries[0].map.structure?.narrativeNativePlan,
    restored.history.checkpoints?.[0].map.structure?.narrativeNativePlan,
  ];
  for (const plan of plans) {
    assert.deepEqual(plan?.contract, selected.contract);
    assert.deepEqual(plan?.appliedRelaxations, selected.appliedRelaxations);
    assert.deepEqual(plan?.appliedRelaxations.map((step) => step.id), selectedRelaxationIds);
  }
  (restored.history.entries[0].map.structure!.narrativeNativePlan!.contract.topology as { fragmentation: number }).fragmentation = 0.987;
  restored.history.entries[0].map.structure!.narrativeNativePlan!.appliedRelaxations[0].operations = [];
  assert.equal(restored.map.structure?.narrativeNativePlan?.contract.topology.fragmentation, selected.contract.topology.fragmentation);
  assert.deepEqual(restored.map.structure?.narrativeNativePlan?.appliedRelaxations[0].operations, selected.appliedRelaxations[0].operations);
  assert.deepEqual(restored.history.checkpoints?.[0].map.structure?.narrativeNativePlan, selected);

  const cleanBytes = new Uint8Array(serializeCiv5Map(map));
  const projectOnlyMutation = structuredClone(map);
  (projectOnlyMutation.structure!.narrativeNativePlan!.contract.topology as { fragmentation: number }).fragmentation = 0.123;
  projectOnlyMutation.structure!.narrativeNativePlan!.appliedRelaxations.push({ id: "project-only-prefix", operations: [], consequence: "Must not enter the game payload." });
  assert.deepEqual(new Uint8Array(serializeCiv5Map(projectOnlyMutation)), cleanBytes);
  const cleanMap = parseCiv5Map(serializeCiv5Map(projectOnlyMutation), "effective-contract-clean.Civ5Map");
  assert.equal(cleanMap.structure, undefined);
});

test("Contract 2C source fingerprints round-trip retained structures from every generation engine", () => {
  for (const [engine, preset] of [["EXCOGITARE", "CONTINENTS"], ["ECCENTRIC", "GREAT_WATERSHEDS"], ["PHYSICAL", "DYNAMIC_EARTH"], ["POLIS", "IMPERIAL_RING"]] as const) {
    const { map, recipe, evidence } = fixture(engine, preset);
    const project = createExcogitareProject({
      projectName: `${engine} evidence`,
      map,
      recipe,
      derived: {
        inputHash: map.structure!.inputHash!,
        generatorVersion: map.structure!.generatorVersion!,
        passVersions: {},
        narrativeSemantics: evidence,
      },
      excogitareVersion: "test",
      now: "2026-07-28T00:00:00.000Z",
    });
    const restored = parseExcogitareProject(serializeExcogitareProject(project));
    assert.equal(narrativeEvidenceMatchesMap(restored.derived?.narrativeSemantics, restored.map), true, engine);
    assert.ok(restored.manifest.requiredCapabilities.includes("narrative-native-plan-v1"), `${engine} project did not declare its retained native-plan contract`);
    assert.deepEqual(restored.map.structure?.narrativeNativePlan, map.structure?.narrativeNativePlan, `${engine} project lost the selected native plan`);
    assert.deepEqual(restored.map.structure?.narrativeNativeEvidence, map.structure?.narrativeNativeEvidence, `${engine} project lost native invariant evidence`);
    assert.deepEqual(restored.map.structure?.narrativeContentEvidence, map.structure?.narrativeContentEvidence, `${engine} project lost content evidence`);
  }
});

test("project reconciliation replaces obsolete derived structures and marks edited evidence stale", () => {
  const first = fixture("EXCOGITARE", "CONTINENTS");
  const firstDerived = projectDerivedEvidenceForMap(undefined, first.map)!;
  const second = fixture("EXCOGITARE", "PANGAEA");
  const reconciled = projectDerivedEvidenceForMap(firstDerived, second.map)!;
  assert.equal(reconciled.inputHash, second.map.structure?.inputHash);
  assert.deepEqual(reconciled.structure?.narrativeNativePlan, second.map.structure?.narrativeNativePlan);
  assert.notDeepEqual(reconciled.structure?.narrativeNativePlan, first.map.structure?.narrativeNativePlan);
  assert.equal(reconciled.narrativeSemantics?.state, "CURRENT");
  assert.equal(narrativeEvidenceMatchesMap(reconciled.narrativeSemantics, second.map), true);

  const edited = structuredClone(second.map);
  edited.tiles[0].terrain = edited.tiles[0].terrain < 2 ? 2 : 0;
  edited.structure = markGenerationStructureStale(edited.structure, "Authored topology edit.", ["TOPOLOGY"]);
  const stale = projectDerivedEvidenceForMap(reconciled, edited)!;
  assert.equal(stale.structure?.evidenceState, "STALE");
  assert.equal(stale.narrativeSemantics?.state, "STALE");
  assert.match(stale.narrativeSemantics?.staleReason ?? "", /Authored topology edit/);

  const forced = createExcogitareProject({ projectName: "Reconciled", map: second.map, recipe: second.recipe, derived: firstDerived, excogitareVersion: "test" });
  assert.deepEqual(forced.derived?.structure?.narrativeNativePlan, second.map.structure?.narrativeNativePlan);
});

test("generated projects retain current evidence while imported Civ5Maps remain evidence-absent and game payloads stay clean", () => {
  const { map, recipe, evidence } = fixture();
  const cleanGameBytes = serializeCiv5Map(map);
  const project = createExcogitareProject({ projectName: "Generated project", map, recipe, excogitareVersion: "test", now: "2026-07-28T00:00:00.000Z" });
  const current = parseExcogitareProject(serializeExcogitareProject(project));
  assert.equal(current.derived?.narrativeSemantics?.state, "CURRENT");
  assert.equal(current.manifest.requiredCapabilities.includes("narrative-semantic-evidence-v1"), true);

  const importedMap = parseCiv5Map(cleanGameBytes, "legacy-import.Civ5Map");
  const importedProject = createExcogitareProject({ projectName: "Imported geography", map: importedMap, recipe, excogitareVersion: "test", now: "2026-07-28T00:00:00.000Z" });
  const evidenceAbsent = parseExcogitareProject(serializeExcogitareProject(importedProject));
  assert.equal(evidenceAbsent.derived?.narrativeSemantics, undefined);
  assert.equal(evidenceAbsent.manifest.requiredCapabilities.includes("narrative-semantic-evidence-v1"), false);
  const legacyEvidenceAbsent = parseExcogitareProject(serializeLegacyExcogitareProjectV1(importedProject));
  assert.equal(legacyEvidenceAbsent.derived?.narrativeSemantics, undefined);
  assert.equal(legacyEvidenceAbsent.map.structure, undefined);
  assert.equal(legacyEvidenceAbsent.manifest.requiredCapabilities.includes("narrative-semantic-evidence-v1"), false);

  project.derived!.narrativeSemantics = { ...structuredClone(evidence), state: "RECOMPUTED" };
  const recomputed = parseExcogitareProject(serializeExcogitareProject(project));
  assert.equal(recomputed.derived?.narrativeSemantics?.state, "RECOMPUTED");
  assert.deepEqual(new Uint8Array(serializeCiv5Map(recomputed.map)), new Uint8Array(cleanGameBytes));
  const decorated = structuredClone(recomputed.map);
  decorated.structure!.diagnostics.persistenceSentinel = 771;
  decorated.structure!.narrativeNativePlan!.appliedRelaxations.push({ id: "project-only-sentinel", operations: [], consequence: "Must not enter Civ5Map bytes." });
  decorated.recipe = { ...decorated.recipe!, effort: "EXHAUSTIVE" };
  assert.deepEqual(new Uint8Array(serializeCiv5Map(decorated)), new Uint8Array(cleanGameBytes));
  const clean = parseCiv5Map(serializeCiv5Map(decorated), "clean.Civ5Map");
  assert.equal(clean.structure, undefined);
  assert.equal(clean.recipe, undefined);
  assert.equal(clean.startLocations.length, 0, "ordinary Civ5Map output must remain geography-only rather than carrying project start plans");
});

test("Contract 2C rejects corrupt hashes, future versions, dangling references, and current-map mismatches", () => {
  const { map, recipe, evidence } = fixture();
  const project = createExcogitareProject({ projectName: "Invalid evidence", map, recipe, derived: {
    inputHash: map.structure!.inputHash!,
    generatorVersion: map.structure!.generatorVersion!,
    passVersions: {},
    narrativeSemantics: evidence,
  }, excogitareVersion: "test", now: "2026-07-28T00:00:00.000Z" });

  const corruptProgram = structuredClone(project);
  corruptProgram.derived!.narrativeSemantics!.program = { ...corruptProgram.derived!.narrativeSemantics!.program, verb: "tampered" };
  assert.throws(() => serializeExcogitareProject(corruptProgram), /program hash does not match/);

  const future = structuredClone(project);
  (future.derived!.narrativeSemantics as { schemaVersion: number }).schemaVersion = 2;
  assert.throws(() => serializeExcogitareProject(future), /Unsupported persisted narrative evidence schema version: 2/);

  const dangling = structuredClone(project);
  dangling.derived!.narrativeSemantics!.evaluation.findings[0].objectIds = ["missing-object"];
  assert.throws(() => serializeExcogitareProject(dangling), /references unknown or duplicate evidence/);

  const mismatched = structuredClone(project);
  mismatched.map.tiles[0].terrain = mismatched.map.tiles[0].terrain < 2 ? 2 : 0;
  const immediatelyStale = createExcogitareProject({ projectName: "Edited map", map: mismatched.map, recipe, excogitareVersion: "test" });
  assert.equal(immediatelyStale.map.structure?.evidenceState, "STALE");
  assert.equal(immediatelyStale.derived?.structure?.evidenceState, "STALE");
  assert.notEqual(immediatelyStale.derived?.narrativeSemantics?.state, "CURRENT");
  const safelyStale = parseExcogitareProject(serializeExcogitareProject(mismatched));
  assert.equal(safelyStale.map.structure?.evidenceState, "STALE");
  assert.equal(safelyStale.derived?.narrativeSemantics?.state, "STALE");
  assert.match(safelyStale.derived?.narrativeSemantics?.staleReason ?? "", /no longer matches|changed after narrative evaluation/);
});
