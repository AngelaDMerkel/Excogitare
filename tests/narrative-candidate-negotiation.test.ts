import assert from "node:assert/strict";
import test from "node:test";
import { validateCiv5Map } from "../lib/map-analysis.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap, MAP_PRESETS, type MapGenerationOptions } from "../lib/map-generator.ts";
import { narrativeNativeContract } from "../lib/narrative-native-contracts.ts";

function optionsFor(presetId: MapGenerationOptions["preset"], overrides: Partial<MapGenerationOptions> = {}): MapGenerationOptions {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === presetId)!;
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    ...preset,
    engine: preset.engine,
    preset: preset.id,
    size: "DUEL",
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    ...overrides,
  };
}

test("REDUCE_POPULATION rebuilds population-shaped native grammar and honors its minimum", () => {
  const prefix = narrativeNativeContract("LONELY_OCEANS").relaxationPolicy.slice(0, 3).map((step) => step.id);
  const options = optionsFor("LONELY_OCEANS", {
    players: 3,
    cityStates: 4,
    seed: "candidate-population-minimum",
  });
  const first = generateMap(options, undefined, { narrativeRelaxationIds: prefix });
  const second = generateMap(options, undefined, { narrativeRelaxationIds: prefix });

  assert.equal(first.players, 2);
  assert.equal(first.startLocations.filter((start) => !start.cityState).length, 2);
  assert.equal(first.structure?.narrativeSkeleton?.targets.principalRealms, 2, "the old three-player realm grammar survived the population relaxation");
  assert.deepEqual(first.structure?.narrativeNativePlan?.appliedRelaxations.map((step) => step.id), prefix);
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.startLocations, second.startLocations);
  assert.ok(first.structure?.narrativeAdapter?.relaxations.some((message) => /retained 2 of 3 requested major civilizations/.test(message)));
  assert.ok(first.structure?.narrativeNativeEvidence?.findings.every((finding) => finding.status === "PROVEN"));
});

test("ACCEPT_ANTI_MOTIF_RISK changes disclosure only, not seed or native geography", () => {
  const policy = narrativeNativeContract("IMPERIAL_RING").relaxationPolicy;
  const nativePrefix = policy.slice(0, -1).map((step) => step.id);
  const disclosedPrefix = policy.map((step) => step.id);
  assert.equal(policy.at(-1)?.mode, "ACCEPT_ANTI_MOTIF_RISK");
  const options = optionsFor("IMPERIAL_RING", {
    players: 4,
    cityStates: 1,
    seed: "candidate-anti-motif-disclosure",
  });

  const native = generateMap(options, undefined, { narrativeRelaxationIds: nativePrefix });
  const disclosed = generateMap(options, undefined, { narrativeRelaxationIds: disclosedPrefix });
  assert.deepEqual(disclosed.tiles, native.tiles);
  assert.deepEqual(disclosed.startLocations, native.startLocations);
  assert.deepEqual(disclosed.structure?.strategicGraph, native.structure?.strategicGraph);
  assert.deepEqual(disclosed.structure?.narrativeNativePlan?.appliedRelaxations.map((step) => step.id), nativePrefix);
  assert.deepEqual(disclosed.structure?.narrativeEvaluation?.appliedRelaxations, disclosedPrefix);
  assert.ok(disclosed.structure?.reviewEvidence?.relaxations.some((message) => /requires explicit Review and Identity Lab scrutiny/.test(message)));
  assert.ok(disclosed.structure?.narrativeNativeEvidence?.findings.every((finding) => finding.status === "PROVEN"));
});

test("policy-authorized city-state capacity loss is deterministic and disclosed", () => {
  const options = optionsFor("THALASSIC_LEAGUE", {
    players: 6,
    cityStates: 41,
    waterPercent: 80,
    seed: "candidate-authorized-city-state-capacity",
  });
  const progress: string[] = [];
  const first = generateMap(options, (stage) => progress.push(stage));
  const second = generateMap(options);
  const cityStates = first.startLocations.filter((start) => start.cityState).length;

  assert.ok(cityStates < 41);
  assert.equal(first.generation?.cityStates, cityStates);
  assert.ok(first.structure?.narrativeAdapter?.relaxations.some((message) => /City-state capacity: retained .* of 41 requested city states under reduce city states/.test(message)));
  assert.ok(first.structure?.narrativeNativePlan?.appliedRelaxations.length, "the selected retry does not retain its native relaxation prefix");
  assert.ok(progress.some((stage) => /Retrying native grammar/.test(stage)));
  assert.deepEqual(first.tiles, second.tiles);
  assert.deepEqual(first.startLocations, second.startLocations);
  assert.deepEqual(validateCiv5Map(first).filter((issue) => issue.severity === "ERROR"), []);
  assert.ok(first.structure?.narrativeNativeEvidence?.findings.every((finding) => finding.status === "PROVEN"));
});

test("terminal selection rejects unauthorized capacity loss instead of hiding it in a score", () => {
  const options = optionsFor("IMPERIAL_RING", {
    players: 4,
    cityStates: 41,
    // Keep the topology inside Imperial Ring's lawful native envelope so this
    // fixture isolates unauthorized population loss rather than also testing a
    // deliberately impossible 90%-water circuit.
    waterPercent: 45,
    seed: "candidate-unauthorized-capacity-terminal",
  });
  const capture = () => {
    try {
      generateMap(options);
      assert.fail("generation unexpectedly installed a population-deficient map");
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const first = capture();
  const second = capture();
  assert.equal(first, second);
  assert.match(first, /could not install a lawful IMPERIAL_RING candidate/);
  assert.match(first, /unauthorized capacity deficit/);
  assert.match(first, /0 legality error/);
  assert.match(first, /0 unproven preserved invariant/);
});

test("candidate generation reports truthful Physical engine stages without completing rejected provenance", () => {
  const progress: Array<{ stage: string; passId: string }> = [];
  const map = generateMap(optionsFor("DYNAMIC_EARTH", {
    players: 2,
    cityStates: 0,
    seed: "candidate-physical-progress",
  }), (stage, event) => progress.push({ stage, passId: event.passId }));
  assert.ok(progress.some((event) => event.stage === "Simulating plates, circulation, climate, and watersheds"));
  assert.equal(new Set(map.structure?.provenance?.map((entry) => entry.passId)).size, map.structure?.provenance?.length);
});
