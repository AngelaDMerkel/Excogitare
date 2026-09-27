import assert from "node:assert/strict";
import test from "node:test";
import { inspectCiv5MapStructure, serializeCiv5Map } from "../lib/civ5-map.ts";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, MAP_PRESETS } from "../lib/map-generator.ts";
import { compileNarrativeAdapterPlan, narrativeAdapterConsumedFingerprint } from "../lib/narrative-engine-adapters.ts";
import { compileNarrativeSkeleton } from "../lib/narrative-map-types.ts";
import { evaluateNarrativeNativeEvidence } from "../lib/narrative-native-evidence.ts";
import { compileCatalogueNarrativeProgram } from "../lib/narrative-program-catalogue.ts";

test("all thirty-three Map Types compile deterministic owner-engine adapter plans", () => {
  for (const preset of MAP_PRESETS) {
    const options = {
      ...DEFAULT_GENERATION_OPTIONS,
      ...preset,
      engine: preset.engine,
      preset: preset.id,
      size: "DUEL" as const,
      players: 2,
      cityStates: 1,
      waterPercent: preset.water,
      mountainPercent: preset.mountains,
      seed: `adapter-${preset.id.toLowerCase()}`,
    };
    const recipe = generationRecipeFromOptions(options);
    const wraps = options.wrapType === "EAST_WEST" || options.wrapType === "PRESET" && !["INLAND_SEAS", "LABYRINTH", "SHATTERED_BASINS"].includes(preset.id);
    const context = { width: 40, height: 24, wraps };
    const program = compileCatalogueNarrativeProgram(recipe, context);
    const skeleton = compileNarrativeSkeleton(options, recipe, context.width, context.height, context.wraps);
    const first = compileNarrativeAdapterPlan(program, skeleton);
    const second = compileNarrativeAdapterPlan(program, skeleton);
    assert.deepEqual(first, second, `${preset.id} adapter is not deterministic`);
    assert.equal(first.evidence.profileId, preset.id);
    assert.equal(first.evidence.engine, preset.engine);
    assert.ok(first.evidence.causalObjects.length >= skeleton.regions.length);
    assert.equal(first.topology.length, context.width * context.height);
  }
});

test("an authored relaxation mutates native grammar before retry and remains disclosed", () => {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === "ARCHIPELAGO")!;
  const options = {
    ...DEFAULT_GENERATION_OPTIONS,
    ...preset,
    engine: preset.engine,
    preset: preset.id,
    size: "DUEL" as const,
    players: 2,
    cityStates: 1,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    seed: "native-relaxation-retry",
  };
  const recipe = generationRecipeFromOptions(options);
  const context = { width: 40, height: 24, wraps: true };
  const program = compileCatalogueNarrativeProgram(recipe, context);
  const skeleton = compileNarrativeSkeleton(options, recipe, context.width, context.height, context.wraps);
  const relaxationId = program.relaxationOrder[0].id;
  const unrelaxed = compileNarrativeAdapterPlan(program, skeleton);
  const relaxed = compileNarrativeAdapterPlan(program, skeleton, [relaxationId]);
  assert.ok(relaxed.native.contract.topology.fragmentation < unrelaxed.native.contract.topology.fragmentation);
  assert.deepEqual(relaxed.native.appliedRelaxations.map((step) => step.id), [relaxationId]);

  const generated = generateMap(options, undefined, { narrativeRelaxationIds: [relaxationId] });
  assert.equal(generated.structure?.narrativeNativePlan?.appliedRelaxations[0]?.id, relaxationId);
  assert.equal(generated.structure?.narrativeEvaluation?.appliedRelaxations[0], relaxationId);
  assert.ok(generated.structure?.reviewEvidence?.relaxations.some((message) => message.includes(program.relaxationOrder[0].consequence)));
  assert.equal(generated.structure?.narrativeNativeEvidence?.status, "PROVEN");
});

test("Continents hierarchy relaxation changes field sources without relying on a retry seed", () => {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === "CONTINENTS")!;
  const options = {
    ...DEFAULT_GENERATION_OPTIONS,
    ...preset,
    engine: preset.engine,
    preset: preset.id,
    size: "DUEL" as const,
    players: 2,
    cityStates: 1,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    seed: "continents-hierarchy-relaxation",
  };
  const recipe = generationRecipeFromOptions(options);
  const context = { width: 40, height: 24, wraps: true };
  const program = compileCatalogueNarrativeProgram(recipe, context);
  const skeleton = compileNarrativeSkeleton(options, recipe, context.width, context.height, context.wraps);
  const step = program.generative!.relaxationPolicy[0];
  assert.deepEqual(step.operations.map((operation) => operation.kind), ["REDUCE_HIERARCHY"]);
  const unrelaxed = compileNarrativeAdapterPlan(program, skeleton);
  const relaxed = compileNarrativeAdapterPlan(program, skeleton, [step.id]);
  assert.equal(unrelaxed.native.kind, "FIELD_PLAN");
  assert.equal(relaxed.native.kind, "FIELD_PLAN");
  if (unrelaxed.native.kind !== "FIELD_PLAN" || relaxed.native.kind !== "FIELD_PLAN") throw new Error("Continents did not compile a field plan.");
  assert.notDeepEqual(relaxed.native.sources, unrelaxed.native.sources);
  assert.notEqual(narrativeAdapterConsumedFingerprint(relaxed), narrativeAdapterConsumedFingerprint(unrelaxed));
});

test("every authored relaxation prefix changes same-seed consumed primitives while disclosure-only risk does not", () => {
  for (const preset of MAP_PRESETS) {
    const options = {
      ...DEFAULT_GENERATION_OPTIONS,
      ...preset,
      engine: preset.engine,
      preset: preset.id,
      size: "DUEL" as const,
      players: preset.engine === "POLIS" ? 6 : 2,
      cityStates: 2,
      waterPercent: preset.water,
      mountainPercent: preset.mountains,
      seed: `relaxation-prefix-${preset.id.toLowerCase()}`,
    };
    const recipe = generationRecipeFromOptions(options);
    const context = { width: 40, height: 24, wraps: true };
    const program = compileCatalogueNarrativeProgram(recipe, context);
    const skeleton = compileNarrativeSkeleton(options, recipe, context.width, context.height, context.wraps);
    const prefix: string[] = [];
    let previousFingerprint = narrativeAdapterConsumedFingerprint(compileNarrativeAdapterPlan(program, skeleton));

    for (const [stepIndex, step] of program.generative!.relaxationPolicy.entries()) {
      prefix.push(step.id);
      const current = compileNarrativeAdapterPlan(program, skeleton, prefix);
      const repeated = compileNarrativeAdapterPlan(program, skeleton, prefix);
      const currentFingerprint = narrativeAdapterConsumedFingerprint(current);
      assert.equal(currentFingerprint, narrativeAdapterConsumedFingerprint(repeated), `${preset.id}/${step.id} consumed fingerprint is not deterministic`);
      assert.deepEqual(current.native.appliedRelaxations.map((entry) => entry.id), prefix, `${preset.id}/${step.id} did not retain the authored ordered prefix`);
      if (step.mode === "ACCEPT_ANTI_MOTIF_RISK") {
        assert.equal(currentFingerprint, previousFingerprint, `${preset.id}/${step.id} disclosure-only risk changed generation inputs`);
      } else {
        assert.notEqual(currentFingerprint, previousFingerprint, `${preset.id}/${step.id} changed only metadata`);
      }

      for (const [operationIndex, operation] of step.operations.entries()) {
        const isolatedProgram = structuredClone(program);
        Object.assign(isolatedProgram.generative!, { relaxationPolicy: [{ ...step, operations: [operation] }] });
        const isolated = compileNarrativeAdapterPlan(isolatedProgram, skeleton, [step.id]);
        const isolatedFingerprint = narrativeAdapterConsumedFingerprint(isolated);
        if (operation.kind === "ACCEPT_ANTI_MOTIF_RISK") {
          assert.equal(isolatedFingerprint, narrativeAdapterConsumedFingerprint(compileNarrativeAdapterPlan(isolatedProgram, skeleton)), `${preset.id}/${step.id}/${operationIndex} risk disclosure changed a consumed primitive`);
        } else {
          assert.notEqual(isolatedFingerprint, narrativeAdapterConsumedFingerprint(compileNarrativeAdapterPlan(isolatedProgram, skeleton)), `${preset.id}/${step.id}/${operation.kind} has no consumed owner-engine effect`);
        }
      }

      if (stepIndex > 0) assert.throws(() => compileNarrativeAdapterPlan(program, skeleton, [step.id]), /authored ordered prefix/, `${preset.id}/${step.id} can bypass earlier authored relaxations`);
      previousFingerprint = currentFingerprint;
    }
  }
});

test("all owner-engine Map Types retain native causes, five-axis evidence, and clean game output", () => {
  for (const preset of MAP_PRESETS) {
    const players = preset.id === "THREE_REALMS" || preset.id === "THALASSIC_LEAGUE" ? 3 : preset.id === "UNEQUAL_REALMS" ? 4 : 2;
    const map = generateMap({
      ...DEFAULT_GENERATION_OPTIONS,
      ...preset,
      engine: preset.engine,
      preset: preset.id,
      size: "DUEL",
      players,
      cityStates: 1,
      waterPercent: preset.water,
      mountainPercent: preset.mountains,
      seed: `native-${preset.id.toLowerCase()}`,
    });
    assert.equal(map.structure?.narrativeProgram?.profileId, preset.id);
    assert.equal(map.structure?.narrativeNativePlan?.profileId, preset.id);
    assert.equal(map.structure?.narrativeNativePlan?.grammarFamily, map.structure?.narrativeAdapter?.grammarFamily);
    assert.equal(map.structure?.narrativeNativePlan?.engine, preset.engine);
    assert.equal(map.structure?.narrativeAdapter?.profileId, preset.id);
    assert.ok((map.structure?.narrativeAdapter?.causalObjects.length ?? 0) > 0);
    assert.ok(map.structure?.narrativeSemanticModel);
    assert.ok(map.structure?.narrativeEvaluation);
    assert.ok(!["FAILED", "UNEVALUABLE"].includes(map.structure!.narrativeEvaluation!.status), `${preset.id} installed an undisclosed hard semantic failure`);
    assert.equal(map.structure?.narrativeNativeEvidence?.status, "PROVEN", `${preset.id} did not prove its defining native invariant`);
    assert.ok(map.structure?.narrativeNativeEvidence?.findings.every((finding) => finding.status === "PROVEN"), `${preset.id} retained an unproven native invariant`);
    assert.ok(map.structure?.narrativeNativeEvidence?.findings.every((finding) => finding.objectIds.length > 0), `${preset.id} invariant evidence lacks final semantic or native object references`);
    assert.ok(map.structure?.narrativeNativeEvidence?.findings.every((finding) => finding.evidence.some((line) => line.startsWith("Required native bindings:") || line.startsWith("Strategic graph:"))), `${preset.id} invariant evidence does not name its type-specific native bindings`);
    assert.ok(map.structure?.narrativeNativeEvidence?.findings.every((finding) => finding.evidence.every((line) => !line.startsWith("The native engine retained "))), `${preset.id} fell back to the removed generic bound-object proof`);
    if (preset.id === "CONTINENTS") {
      const unregisteredProgram = structuredClone(map.structure!.narrativeProgram!);
      (unregisteredProgram.generative!.invariants[0] as unknown as { id: string }).id = "unregistered-invariant";
      assert.throws(
        () => evaluateNarrativeNativeEvidence(map, unregisteredProgram, map.structure!.narrativeAdapter!),
        /has no explicit verifier/,
        "Unknown invariants must fail closed rather than silently using a category fallback.",
      );
    }
    assert.notEqual(map.structure?.narrativeContentEvidence?.status, "FAILED", `${preset.id} failed its applicable content obligation`);
    assert.ok(map.structure?.reviewEvidence);
    assert.deepEqual(
      map.structure?.engineNarrativeEvidence?.comparisons
        .filter((comparison) => comparison.from === "RAW_NATIVE" && comparison.to === "NARRATIVE_REALIZED")
        .map((comparison) => comparison.topologyChanged),
      [0],
      `${preset.id} still rewrites completed native topology`,
    );
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${preset.id} is not Repair-clean`);
    assert.deepEqual(inspectCiv5MapStructure(serializeCiv5Map(map)).filter((issue) => issue.severity === "ERROR"), [], `${preset.id} exports an invalid Civ5Map`);
  }
});

test("the revised Inland Supercontinent is enclosed, inward-draining, and not the superseded dry default", () => {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === "SUPERCONTINENT_INTERIOR")!;
  assert.equal(preset.water, 30);
  const map = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    ...preset,
    engine: "PHYSICAL",
    preset: "SUPERCONTINENT_INTERIOR",
    size: "STANDARD",
    players: 8,
    cityStates: 6,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    seed: "inland-supercontinent-native-contract",
  });
  const metrics = map.structure!.narrativeSemanticModel!.metrics;
  assert.ok((metrics["enclosed-sea-count"]?.value ?? 0) >= 1);
  assert.ok((metrics["edge-ocean-share"]?.value ?? 1) <= 0.15);
  assert.ok((metrics["watershed-count"]?.value ?? 0) >= 1);
  assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * 0.3));
});
