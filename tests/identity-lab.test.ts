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
