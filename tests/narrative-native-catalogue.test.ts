import assert from "node:assert/strict";
import test from "node:test";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { DEFAULT_GENERATION_OPTIONS } from "../lib/map-generator.ts";
import { narrativeProfile } from "../lib/narrative-map-types.ts";
import {
  NARRATIVE_NATIVE_CONTRACTS,
  narrativeNativeContract,
  validateNarrativeNativeContract,
  type NarrativeGenerativeContract,
} from "../lib/narrative-native-contracts.ts";
import { NARRATIVE_NATIVE_INVARIANT_VERIFIER_IDS } from "../lib/narrative-native-evidence.ts";
import {
  narrativeProgramDefinition,
  NARRATIVE_CATALOGUE_IDS,
} from "../lib/narrative-program-catalogue.ts";

function recipeFor(profileId: (typeof NARRATIVE_CATALOGUE_IDS)[number]) {
  const profile = narrativeProfile(profileId);
  return generationRecipeFromOptions({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: profile.engine,
    preset: profileId,
    size: "DUEL",
    players: profile.engine === "POLIS" ? 6 : 2,
    cityStates: 1,
    seed: "native-catalogue-contract",
  });
}

function evidenceSignature(definition: ReturnType<typeof narrativeProgramDefinition>, constraintId: string) {
  return JSON.stringify(definition.requiredEvidence
    .filter((evidence) => evidence.constraintId === constraintId)
    .map(({ measureKey, operator, target, minimumConfidence }) => ({ measureKey, operator, target, minimumConfidence }))
    .sort((one, two) => JSON.stringify(one).localeCompare(JSON.stringify(two))));
}

test("native catalogue owns exactly thirty-three explicit engine grammars", () => {
  assert.equal(NARRATIVE_CATALOGUE_IDS.length, 33);
  assert.deepEqual(new Set(Object.keys(NARRATIVE_NATIVE_CONTRACTS)), new Set(NARRATIVE_CATALOGUE_IDS));
  const families = new Set<string>();
  const engines = new Map<string, number>();
  for (const profileId of NARRATIVE_CATALOGUE_IDS) {
    const profile = narrativeProfile(profileId);
    const contract = narrativeNativeContract(profileId);
    validateNarrativeNativeContract(contract, profileId, profile.engine);
    families.add(contract.family);
    engines.set(contract.engine, (engines.get(contract.engine) ?? 0) + 1);
    assert.equal(contract.profileId, profileId);
    assert.equal(contract.engine, profile.engine);
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.invariants), true);
    assert.equal(Object.isFrozen(contract.relaxationPolicy), true);
    assert.ok(contract.causalRequirements.length >= 3, `${profileId} lacks an authored causal chain`);
    assert.ok(contract.softPreferences.length >= 3, `${profileId} lacks authored supporting geography`);
    assert.ok(contract.gameplay.minimumStartDistance >= 5);
  }
  assert.equal(families.size, 33, "Every Map Type must own a grammar family rather than aliasing another type.");
  assert.deepEqual(Object.fromEntries(engines), { EXCOGITARE: 8, ECCENTRIC: 11, PHYSICAL: 7, POLIS: 7 });
});

test("native invariant verifier registry exhaustively owns the contract catalogue", () => {
  const invariantIds = Object.values(NARRATIVE_NATIVE_CONTRACTS).flatMap((contract) => contract.invariants.map((invariant) => invariant.id));
  assert.equal(new Set(invariantIds).size, invariantIds.length, "Invariant identifiers must remain globally unique for exhaustive dispatch.");
  assert.deepEqual(new Set(NARRATIVE_NATIVE_INVARIANT_VERIFIER_IDS), new Set(invariantIds));
});

test("every owner grammar has a non-relaxable invariant and an operational authored policy", () => {
  for (const profileId of NARRATIVE_CATALOGUE_IDS) {
    const contract = narrativeNativeContract(profileId);
    const invariantIds = new Set(contract.invariants.map((invariant) => invariant.id));
    assert.ok(invariantIds.size > 0, `${profileId} lacks a native invariant`);
    for (const invariant of contract.invariants) {
      assert.ok(invariant.requirement.length >= 45, `${profileId}/${invariant.id} is not a meaningful invariant statement`);
    }
    const relaxed = new Set<string>();
    for (const step of contract.relaxationPolicy) {
      assert.ok(step.operations.length > 0, `${profileId}/${step.id} is evidence-only`);
      assert.deepEqual(new Set(step.preserves), invariantIds, `${profileId}/${step.id} does not preserve its identity invariant`);
      for (const constraintId of step.constraintIds) {
        assert.equal(relaxed.has(constraintId), false, `${profileId}/${constraintId} is relaxed twice`);
        relaxed.add(constraintId);
      }
      if (step.mode === "ACCEPT_ANTI_MOTIF_RISK") {
        assert.deepEqual(step.operations.map((operation) => operation.kind), ["ACCEPT_ANTI_MOTIF_RISK"]);
      } else {
        assert.equal(step.operations.some((operation) => operation.kind === "ACCEPT_ANTI_MOTIF_RISK"), false);
      }
    }
    assert.ok(contract.relaxationPolicy.some((step) => step.mode !== "ACCEPT_ANTI_MOTIF_RISK"), `${profileId} lacks a native grammar retry or weakening operation`);
  }
});

test("catalogue preferences are authored relationships and policy order comes from the owner grammar", () => {
  for (const profileId of NARRATIVE_CATALOGUE_IDS) {
    const definition = narrativeProgramDefinition(recipeFor(profileId), { width: 80, height: 52, wraps: true });
    const contract = narrativeNativeContract(profileId);
    assert.deepEqual(definition.relaxationOrder, contract.relaxationPolicy.map((step) => ({
      id: step.id,
      label: step.label,
      constraintIds: [...step.constraintIds],
      consequence: step.consequence,
    })));
    const essentialEvidence = new Set(definition.essential.map((constraint) => evidenceSignature(definition, constraint.id)));
    for (const preference of definition.preferred) {
      assert.equal(preference.relaxable, false, `${profileId}/${preference.id} is a hidden identity floor`);
      assert.equal(preference.semanticKey, preference.id);
      assert.ok(preference.roles.length > 0);
      assert.equal(preference.id.endsWith("-richness"), false, `${profileId}/${preference.id} is an autogenerated stronger copy`);
      assert.equal(/^strong(?:er)?\b/i.test(preference.label), false, `${profileId}/${preference.id} still uses generated stronger-copy wording`);
      assert.equal(essentialEvidence.has(evidenceSignature(definition, preference.id)), false, `${profileId}/${preference.id} duplicates an essential target`);
    }
    const relaxableFloor = new Set([...definition.essential, ...definition.prohibited].filter((constraint) => constraint.relaxable).map((constraint) => constraint.id));
    assert.deepEqual(new Set(contract.relaxationPolicy.flatMap((step) => step.constraintIds)), relaxableFloor);
  }
});

test("native contract validation rejects grammar, invariant and relaxation corruption", () => {
  const profile = narrativeProfile("CONTINENTS");
  const original = narrativeNativeContract(profile.id);
  const corrupted = () => structuredClone(original) as NarrativeGenerativeContract & Record<string, unknown>;

  const wrongFamily = corrupted();
  (wrongFamily as { family: string }).family = "GRAPH_PLATE_ATLAS";
  assert.throws(() => validateNarrativeNativeContract(wrongFamily, profile.id, profile.engine), /not a native EXCOGITARE grammar/);

  const noInvariant = corrupted();
  (noInvariant as unknown as { invariants: unknown[] }).invariants = [];
  assert.throws(() => validateNarrativeNativeContract(noInvariant, profile.id, profile.engine), /at least one non-relaxable native invariant/);

  const evidenceOnly = corrupted();
  (evidenceOnly.relaxationPolicy[0] as unknown as { operations: unknown[] }).operations = [];
  assert.throws(() => validateNarrativeNativeContract(evidenceOnly, profile.id, profile.engine), /change the native grammar/);

  const unknownMode = corrupted();
  (unknownMode.relaxationPolicy[0] as unknown as { mode: string }).mode = "SILENT_DOWNGRADE";
  assert.throws(() => validateNarrativeNativeContract(unknownMode, profile.id, profile.engine), /mode is unsupported/);

  const dropsInvariant = corrupted();
  (dropsInvariant.relaxationPolicy[0] as unknown as { preserves: string[] }).preserves = [];
  assert.throws(() => validateNarrativeNativeContract(dropsInvariant, profile.id, profile.engine), /preserve every non-relaxable invariant/);
});
