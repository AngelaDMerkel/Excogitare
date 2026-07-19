# Identity Lab

## Contract

- Status: Verified. The continuous four-choice schema-v2 workflow is implemented and runtime-verified; the original finite schema-v1 evidence remains importable as a read-only archive.
- User outcome: A reviewer can conduct a genuinely blind, continuous Map Type recognition session across the complete narrative catalogue, advance without intermediate correctness feedback, end when they choose, and export reproducible evidence that can guide later generator work.
- Scope: All thirty-three accepted Narrative Map Types. Target order is balanced in deterministic shuffled batches; distractors privilege the target's named nearest confusions.
- Workspace: A fifth top-level **Lab** workspace with a blue **Development** badge. Development means the evidence format and workflow may evolve; it must not imply that human recognizability has already been proved.
- Persistence: The current session is device-local. A versioned JSON export is the durable handoff between the Lab, the narrative guide and a later implementation task.
- Failure behavior: Invalid or future JSON must be rejected without replacing the current session. Current-map or prefetch generation failure must remain visible and retryable without losing the answer in progress. Correctness is unavailable until the reviewer ends the session.
- Exclusions: The Lab does not automatically rewrite generators, upload evidence, claim scientific validity, identify maps with AI, or prove that a Map Type is implemented. Human evidence informs a separate reviewed code change.

## JSON evidence contract

Every schema-v2 export must record:

- schema identifier and version;
- narrative-guide version and path;
- creation and update timestamps;
- continuous configuration and deterministic target schedule;
- exactly four unique choices, the correct position and one intended Map Type per trial;
- exact complete generation options, recipe and seed for each trial;
- selected answer, selected position, presentation and answer timestamps, and bounded response time;
- generation error, retained structural diagnostics and narrative assessment when available;
- aggregate accuracy, response time, answer-position, per-identity and confusion summaries derivable from the trials.

The intended identity is compared with the single selected answer. Diagnostics and the generator's own narrative assessment are supporting evidence, not substitutes for blind human judgment. Prior rendered maps and Civ5Map binaries are not retained in JSON. Schema-v1 imports remain read-only finite archives and are never reinterpreted as timed four-choice evidence.

## Evidence-to-implementation loop

1. The narrative guide defines the intended premise, motifs and anti-motifs.
2. The Lab schedules deterministic targets and plausible choices while hiding identifying metadata.
3. A reviewer answers successive trials without correctness feedback.
4. End and export freezes the session and exposes confusion pairs, structural evidence and difficult seeds.
5. A later implementation changes narrative rules or an engine—not individual favorable seeds.
6. The retained recipes are regenerated for comparison.
7. Changes are accepted only when recognition improves without harming Civ V legality, accessibility, determinism or World Character variation.

## Continuous schema-v2 behavior

The rewrite retains Blind Recognition and excludes Learning Mode. A session repeatedly generates one unlabeled target and exactly four deterministic choices: one correct Narrative Map Type and three plausible nearest confusions. Selecting an answer records it and automatically advances to an already prefetched candidate. Correctness is not revealed between trials because immediate teaching would contaminate later evidence.

The session continues until **End and export**. Memory remains bounded to the current map, one prefetched map and compact prior trial records. Schema v2 records target, choices, position, answer, response time, exact recipe, diagnostics and aggregate confusion evidence. Schema v1 remains importable as an archived finite session; v1 judgments are never reinterpreted as v2 timing or four-choice evidence.

Generation failure remains visible and retryable without losing the current trial. Invalid or future JSON rejects without replacing the session. Device-local session recovery may remain a convenience, but downloaded JSON is the durable evidence handoff.

## Completion gates

- [x] Contract, all-type scope, failure behavior and exclusions recorded.
- [x] The legacy finite workflow's side-effect-free model, exact deck data and schema-v1 parser remain covered for archival compatibility.
- [x] Schema-v1 import is read-only in the current interface; old guesses are not reinterpreted as timings or four-choice answers.
- [x] Interface and README explain how both JSON versions relate to the narrative guide.
- [x] Schema v2 and safe schema-v1 archive migration implemented.
- [x] Exactly four deterministic choices use one target and three narrative-proximate confusions.
- [x] Automatic next generation and bounded current-plus-one prefetch memory implemented.
- [x] Blind sessions continue indefinitely until End and export.
- [x] No correctness feedback or Learning Mode contaminates active v2 evidence.
- [x] v2 export/import, summaries, failures and deterministic stream behavior have direct model coverage.
- [x] Responsive and keyboard-accessible controls verified by source, type, lint, rendered-shell and live-runtime tests.
- [x] All 153 regressions, production, Pages and Alpine checks pass.
- [x] Updated README, register, phase record, Pages build and Alpine runtime reconciled.

## Verification evidence

- Direct model tests cover deterministic target batches, exactly four unique choices, named-confusion preference, exact recipe reconstruction, more than two complete catalogue cycles, constant two-trial pending metadata, retry evidence, response timing, explicit end, v2 round trip, v1 archival import and invalid/future rejection.
- Rendered-shell tests cover the Development badge, locked Results stage, four-choice controls, no-feedback copy, schema guide and migration affordances.
- The production Alpine container was rebuilt as `excogitare:1.3.0` and exercised live on port 3001: a Small trial generated, reported **Next ready**, accepted one of four answers, advanced immediately to trial 2 without revealing correctness, then **End and export** unlocked the aggregate Results view.
- This verifies the Lab feature, not the recognizability of any Map Type. Human sessions still need to be collected before the narrative catalogue can graduate from Implemented to Verified.
