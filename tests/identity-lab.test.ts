import assert from "node:assert/strict";
import test from "node:test";
import { generateMap } from "../lib/map-generator.ts";
import {
  createIdentityLabSession,
  exportIdentityLabSession,
  identityLabChoices,
  identityLabFileName,
  importIdentityLabSession,
  recordIdentityLabGeneration,
  selectIdentityLabCandidate,
  setIdentityLabVerdict,
  submitIdentityLabReview,
} from "../lib/identity-lab.ts";
import {
  CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION,
  createContinuousIdentityLabSession,
  currentContinuousIdentityLabTrial,
  endContinuousIdentityLabSession,
  exportIdentityLabEvidence,
  importIdentityLabEvidence,
  isContinuousIdentityLabSession,
  prefetchedContinuousIdentityLabTrial,
  presentContinuousIdentityLabTrial,
  recordContinuousIdentityLabGeneration,
  recordContinuousIdentityLabGenerationError,
  submitContinuousIdentityLabAnswer,
} from "../lib/identity-lab-continuous.ts";
import { MAP_PRESETS } from "../lib/map-generator.ts";
import { NARRATIVE_PROFILES } from "../lib/narrative-map-types.ts";
import { generationOptionsFromRecipe } from "../lib/generation-recipe.ts";

const now = "2026-07-16T14:00:00.000Z";

test("Identity Lab creates a deterministic shuffled prototype deck with exact generation options", () => {
  const configuration = { sessionSeed: "blind-baseline", samplesPerType: 2, size: "DUEL" as const, style: "MUNDANE" as const };
  const first = createIdentityLabSession(configuration, now);
  const second = createIdentityLabSession(configuration, now);
  assert.deepEqual(first, second);
  assert.equal(first.candidates.length, 8);
  assert.deepEqual(new Set(first.candidates.map((candidate) => candidate.intendedPreset)), new Set(["LONELY_OCEANS", "SHATTERED_ARCHIPELAGO", "GREAT_WATERSHEDS", "ICEHOUSE_EARTH"]));
  for (const candidate of first.candidates) {
    assert.equal(candidate.options.preset, candidate.intendedPreset);
    assert.equal(candidate.options.engine, candidate.engine);
    assert.equal(candidate.options.style, "MUNDANE");
    assert.equal(candidate.options.modifier, "NONE");
    assert.equal(candidate.options.size, "DUEL");
  }
  assert.notDeepEqual(createIdentityLabSession({ ...configuration, sessionSeed: "different-deck" }, now).candidates.map((candidate) => candidate.id), first.candidates.map((candidate) => candidate.id));
});

test("Identity Lab records blind guesses, reveal state, verdicts, diagnostics, and confusion summaries", () => {
  let session = createIdentityLabSession({ sessionSeed: "evidence", samplesPerType: 1, size: "DUEL", style: "MUNDANE" }, now);
  const candidate = session.candidates[0];
  const map = generateMap(candidate.options);
  session = recordIdentityLabGeneration(session, candidate.id, map, "2026-07-16T14:01:00.000Z");
  const generated = session.candidates[0];
  assert.ok(generated.generatedAt);
  assert.equal(generated.diagnostics?.tiles, map.tiles.length);
  assert.equal(generated.revealedAt, undefined);

  const wrongChoice = identityLabChoices(candidate.engine).find((choice) => choice.id !== candidate.intendedPreset)!;
  session = submitIdentityLabReview(session, candidate.id, {
    guessPrimary: wrongChoice.id,
    guessSecondary: candidate.intendedPreset,
    confidence: 4,
    cues: ["GENERIC_OR_UNCLEAR", "EMPTY_OCEAN"],
    notes: "Attractive, but the intended relationship was not visually dominant.",
  }, "2026-07-16T14:02:00.000Z");
  assert.ok(session.candidates[0].revealedAt);
  assert.equal(session.summary.reviewed, 1);
  assert.equal(session.summary.firstChoiceCorrect, 0);
  assert.equal(session.summary.topTwoCorrect, 1);
  assert.deepEqual(session.summary.confusions, [{ intendedPreset: candidate.intendedPreset, guessedPreset: wrongChoice.id, count: 1 }]);

  session = setIdentityLabVerdict(session, candidate.id, "ATTRACTIVE_WRONG", "2026-07-16T14:03:00.000Z");
  assert.equal(session.candidates[0].review?.verdict, "ATTRACTIVE_WRONG");
  session = selectIdentityLabCandidate(session, 99, "2026-07-16T14:04:00.000Z");
  assert.equal(session.currentIndex, session.candidates.length - 1);
});

test("Identity Lab JSON round-trips exact evidence and rejects incompatible files", () => {
  const session = createIdentityLabSession({ sessionSeed: "round-trip", samplesPerType: 1, size: "DUEL", style: "REALISTIC" }, now);
  const exported = exportIdentityLabSession(session);
  assert.equal(exportIdentityLabSession(importIdentityLabSession(exported)), exported);
  assert.match(exported, /docs\/features\/map-type-narrative-identities\.md/);
  assert.match(identityLabFileName(session), /^excogitare-identity-lab-2026-07-16-lab-/);
  assert.throws(() => importIdentityLabSession("not json"), /could not be parsed/);
  assert.throws(() => importIdentityLabSession(JSON.stringify({ ...session, schemaVersion: 99 })), /schema version 1/);
  assert.throws(() => importIdentityLabSession(JSON.stringify({ ...session, candidates: [] })), /valid candidate deck/);
});

test("continuous Identity Lab creates deterministic four-choice trials from narrative confusions", () => {
  const configuration = { sessionSeed: "continuous-baseline", size: "SMALL" as const, style: "MUNDANE" as const };
  const first = createContinuousIdentityLabSession(configuration, now);
  const second = createContinuousIdentityLabSession(configuration, now);
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, CONTINUOUS_IDENTITY_LAB_SCHEMA_VERSION);
  assert.equal(first.trials.length, 2);
  assert.equal(first.trials.filter((trial) => !trial.answeredAt).length, 2);
  for (const trial of first.trials) {
    assert.equal(trial.choices.length, 4);
    assert.equal(new Set(trial.choices).size, 4);
    assert.equal(trial.choices.filter((choice) => choice === trial.targetPreset).length, 1);
    assert.equal(trial.choices[trial.correctPosition], trial.targetPreset);
    assert.equal(trial.recipe.mapType, trial.targetPreset);
    assert.deepEqual(generationOptionsFromRecipe(trial.recipe), trial.options);
    const nearest = NARRATIVE_PROFILES[trial.targetPreset].nearestConfusions;
    assert.ok(nearest.some((confusion) => trial.choices.includes(confusion as typeof trial.targetPreset)));
  }
});

test("continuous trials grow indefinitely while retaining only current and prefetched pending metadata", () => {
  let session = createContinuousIdentityLabSession({ sessionSeed: "endless", size: "SMALL", style: "MUNDANE" }, now);
  for (let index = 0; index < MAP_PRESETS.length * 2 + 5; index += 1) {
    const current = currentContinuousIdentityLabTrial(session)!;
    session = presentContinuousIdentityLabTrial(session, current.id, `2026-07-16T14:${String(index % 60).padStart(2, "0")}:00.000Z`);
    session = submitContinuousIdentityLabAnswer(session, current.id, current.choices[index % 4], `2026-07-16T14:${String(index % 60).padStart(2, "0")}:05.000Z`);
    assert.equal(session.trials.filter((trial) => !trial.answeredAt).length, 2);
    assert.equal(prefetchedContinuousIdentityLabTrial(session)?.sequence, current.sequence + 2);
  }
  assert.equal(session.summary.trialsAnswered, MAP_PRESETS.length * 2 + 5);
  assert.equal(session.trials.length, session.summary.trialsAnswered + 2);
  assert.ok(new Set(session.trials.filter((trial) => trial.answeredAt).map((trial) => trial.targetPreset)).size === MAP_PRESETS.length);
  assert.doesNotMatch(exportIdentityLabEvidence(session), /"tiles"\s*:/);
});

test("continuous Lab records generation evidence, response time and retry without intermediate feedback", () => {
  let session = createContinuousIdentityLabSession({ sessionSeed: "continuous-evidence", size: "SMALL", style: "MUNDANE", targetTypes: ["LONELY_OCEANS", "SHATTERED_ARCHIPELAGO", "GREAT_WATERSHEDS", "ICEHOUSE_EARTH"] }, now);
  let trial = currentContinuousIdentityLabTrial(session)!;
  session = recordContinuousIdentityLabGenerationError(session, trial.id, "temporary worker failure", "2026-07-16T14:00:01.000Z");
  assert.equal(currentContinuousIdentityLabTrial(session)?.generationError, "temporary worker failure");
  const map = generateMap(trial.options);
  session = recordContinuousIdentityLabGeneration(session, trial.id, map, "2026-07-16T14:00:02.000Z");
  session = presentContinuousIdentityLabTrial(session, trial.id, "2026-07-16T14:00:03.000Z");
  trial = currentContinuousIdentityLabTrial(session)!;
  assert.equal(trial.generationError, undefined);
  assert.equal(trial.diagnostics?.tiles, map.tiles.length);
  assert.equal(trial.narrativeEvidence?.profileId, trial.targetPreset);
  session = submitContinuousIdentityLabAnswer(session, trial.id, trial.choices[1], "2026-07-16T14:00:08.000Z");
  const answered = session.trials.find((candidate) => candidate.id === trial.id)!;
  assert.equal(answered.responseTimeMs, 5000);
  assert.equal(answered.selectedPosition, 1);
  assert.equal("revealedAt" in answered, false);
  assert.equal(session.status, "ACTIVE");
  assert.notEqual(session.currentTrialId, trial.id);
});

test("v2 evidence round-trips, ends explicitly, rejects future data, and imports v1 as an archive", () => {
  let session = createContinuousIdentityLabSession({ sessionSeed: "v2-round-trip", size: "SMALL", style: "REALISTIC" }, now);
  const activeRestored = importIdentityLabEvidence(exportIdentityLabEvidence(session));
  assert.equal(isContinuousIdentityLabSession(activeRestored) && activeRestored.status, "ACTIVE");
  session = endContinuousIdentityLabSession(session, "2026-07-16T14:10:00.000Z");
  const exported = exportIdentityLabEvidence(session);
  const restored = importIdentityLabEvidence(exported);
  assert.equal(isContinuousIdentityLabSession(restored), true);
  assert.deepEqual(JSON.parse(exportIdentityLabEvidence(restored)), JSON.parse(exported));
  assert.equal(isContinuousIdentityLabSession(restored) && restored.status, "ENDED");
  assert.throws(() => importIdentityLabEvidence(JSON.stringify({ ...session, schemaVersion: 99 })), /not supported/);
  const malformed = JSON.parse(exported);
  malformed.trials[0].choices = malformed.trials[0].choices.slice(0, 3);
  assert.throws(() => importIdentityLabEvidence(JSON.stringify(malformed)), /exactly four/);
  const mismatchedRecipe = JSON.parse(exported);
  const otherPreset = MAP_PRESETS.find((preset) => preset.id !== mismatchedRecipe.trials[0].targetPreset)!;
  mismatchedRecipe.trials[0].recipe.mapType = otherPreset.id;
  mismatchedRecipe.trials[0].recipe.engine = otherPreset.engine;
  assert.throws(() => importIdentityLabEvidence(JSON.stringify(mismatchedRecipe)), /recipe does not match/);

  const legacy = createIdentityLabSession({ sessionSeed: "legacy-archive", samplesPerType: 1, size: "DUEL", style: "MUNDANE" }, now);
  const importedLegacy = importIdentityLabEvidence(exportIdentityLabSession(legacy));
  assert.equal(importedLegacy.schemaVersion, 1);
  assert.equal(isContinuousIdentityLabSession(importedLegacy), false);
  assert.equal(exportIdentityLabEvidence(importedLegacy), exportIdentityLabSession(legacy));
});
