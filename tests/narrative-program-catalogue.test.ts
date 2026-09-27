import assert from "node:assert/strict";
import test from "node:test";
import { generationRecipeFromOptions } from "../lib/generation-recipe.ts";
import { DEFAULT_GENERATION_OPTIONS, generateMap } from "../lib/map-generator.ts";
import { narrativeProfile } from "../lib/narrative-map-types.ts";
import {
  auditNarrativeProgramCatalogue,
  compileCatalogueNarrativeProgram,
  narrativeProgramDefinition,
  NARRATIVE_CATALOGUE_IDS,
} from "../lib/narrative-program-catalogue.ts";
import { evaluateNarrativeConstraintProgram, extractNarrativeSemantics } from "../lib/narrative-semantics.ts";

function recipeFor(profileId: (typeof NARRATIVE_CATALOGUE_IDS)[number], seed = "catalogue") {
  const profile = narrativeProfile(profileId);
  return generationRecipeFromOptions({
    ...DEFAULT_GENERATION_OPTIONS,
    engine: profile.engine,
    preset: profileId,
    size: "DUEL",
    players: profile.engine === "POLIS" ? 6 : 2,
    cityStates: 1,
    seed,
  });
}

test("Contract 2D exhaustively encodes all thirty-three accepted narrative identities", () => {
  assert.equal(NARRATIVE_CATALOGUE_IDS.length, 33);
  assert.equal(new Set(NARRATIVE_CATALOGUE_IDS).size, 33);
  assert.deepEqual(auditNarrativeProgramCatalogue().filter((entry) => !entry.complete), []);
  for (const profileId of NARRATIVE_CATALOGUE_IDS) {
    const profile = narrativeProfile(profileId);
    const definition = narrativeProgramDefinition(recipeFor(profileId), { width: 40, height: 24, wraps: profileId !== "INLAND_SEAS" && profileId !== "LABYRINTH" && profileId !== "SHATTERED_BASINS" });
    assert.equal(definition.profileId, profileId);
    assert.equal(definition.engine, profile.engine);
    assert.equal(definition.essential.length, profile.requiredMotifs.length);
    assert.equal(definition.prohibited.length, profile.forbiddenMotifs.length);
    assert.ok(definition.preferred.length > 0);
    for (const constraint of [...definition.essential, ...definition.preferred, ...definition.prohibited]) assert.ok(definition.requiredEvidence.some((evidence) => evidence.constraintId === constraint.id), `${profileId}/${constraint.id} lacks evidence`);
    for (const constraint of [...definition.essential, ...definition.prohibited]) assert.ok(definition.relaxationOrder.some((relaxation) => relaxation.constraintIds.includes(constraint.id)), `${profileId}/${constraint.id} lacks an explicit failure relaxation`);
  }
});

test("Contract 2D programmes are immutable, deterministic, seed-independent, and distinct", () => {
  const hashes = new Set<string>();
  for (const profileId of NARRATIVE_CATALOGUE_IDS) {
    const first = compileCatalogueNarrativeProgram(recipeFor(profileId, "first-seed"), { width: 80, height: 52, wraps: true });
    const second = compileCatalogueNarrativeProgram(recipeFor(profileId, "second-seed"), { width: 80, height: 52, wraps: true });
    assert.deepEqual(first, second, profileId);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.constraints.essential), true);
    hashes.add(first.inputHash);
  }
  assert.equal(hashes.size, 33);
});

test("Contract 2D applies count and population laws without changing explicit controls", () => {
  const lonely = recipeFor("LONELY_OCEANS");
  lonely.matchIntent = { ...lonely.matchIntent, humanPlayers: 2, aiPlayers: 4, flexiblePlayers: 0 };
  const duel = compileCatalogueNarrativeProgram(lonely, { width: 40, height: 24, wraps: true });
  const huge = compileCatalogueNarrativeProgram({ ...lonely, settings: { ...lonely.settings, waterPercent: 91 } }, { width: 128, height: 80, wraps: true });
  const realmEvidence = duel.requiredEvidence.find((evidence) => evidence.constraintId === "one-major-per-realm")!;
  const componentEvidence = huge.requiredEvidence.find((evidence) => evidence.constraintId === "avoid-ordinary-archipelago")!;
  assert.equal(realmEvidence.target, 6);
  assert.equal(componentEvidence.target, 12);
  assert.equal(huge.explicitInputs.waterPercent, 91);
  assert.ok(huge.conflicts.some((conflict) => conflict.control === "WATER_PERCENT") === false);
});

test("Contract 2D evaluators accept legal-normalized output from every catalogue entry", () => {
  for (const profileId of NARRATIVE_CATALOGUE_IDS) {
    const recipe = recipeFor(profileId, `contract-two-d-${profileId.toLowerCase()}`);
    const map = generateMap({ ...mapOptions(recipe), size: "DUEL" });
    const program = compileCatalogueNarrativeProgram(recipe, { width: map.width, height: map.height, wraps: map.wraps });
    const model = extractNarrativeSemantics(map);
    const evaluation = evaluateNarrativeConstraintProgram(program, model);
    assert.equal(evaluation.profileId, profileId);
    assert.equal(evaluation.programHash, program.inputHash);
    assert.equal(evaluation.modelHash, model.inputHash);
    assert.equal(evaluation.findings.length, program.constraints.essential.length + program.constraints.preferred.length + program.constraints.prohibited.length);
  }
});

function mapOptions(recipe: ReturnType<typeof generationRecipeFromOptions>) {
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    ...recipe.settings,
    engine: recipe.engine,
    preset: recipe.mapType,
    style: recipe.character,
    modifier: recipe.modifier,
    players: recipe.matchIntent.humanPlayers + recipe.matchIntent.aiPlayers + recipe.matchIntent.flexiblePlayers,
    cityStates: recipe.cityStates,
  };
}
