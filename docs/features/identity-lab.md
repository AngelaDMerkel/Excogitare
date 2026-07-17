# Identity Lab

## Contract

- Status: Verified
- User outcome: A reviewer can conduct a genuinely blind Map Type recognition session inside Excogitare, retain guesses and observations, reveal the intended identity only after submitting a review, revisit candidates, and export evidence that can guide later generator work.
- Initial scope: Lonely Oceans, Shattered Archipelago, Great Watersheds and Icehouse Earth. These test isolation, correlated island chains, hierarchical hydrology and planetary climate respectively.
- Workspace: A fifth top-level **Lab** workspace with a blue **Development** badge. Development means the evidence format and workflow may evolve; it must not imply that the four narrative identities are already implemented.
- Persistence: The current session is device-local. A versioned JSON export is the durable handoff between the Lab, the narrative guide and a later implementation task.
- Failure behavior: Invalid JSON must be rejected without replacing the current session. A generation failure must remain visible and retryable. Revealing an answer before a guess is not allowed by the normal workflow.
- Exclusions: The Lab does not automatically rewrite generators, upload evidence, claim scientific validity, identify maps with AI, or prove that a Map Type is implemented. Human evidence informs a separate reviewed code change.

## JSON evidence contract

Every export must record:

- schema identifier and version;
- narrative-guide version and path;
- creation and update timestamps;
- deck configuration and shuffled candidate order;
- exact complete generation options and seed for each candidate;
- intended Map Type and owning engine;
- reviewer first and second guesses, confidence, cue tags, verdict and notes;
- reveal state and retained structural diagnostics;
- aggregate recognition and confusion summaries derivable from the reviews.

The intended identity is compared with `guessPrimary` for first-choice recognition and with both guesses for top-two recognition. Cue tags explain which narrative motifs the reviewer perceived. Verdict distinguishes recognizable, ambiguous, attractive-but-wrong and failed results. Diagnostics are supporting evidence, not a substitute for the blind human judgment.

## Evidence-to-implementation loop

1. The narrative guide defines the intended premise, motifs and anti-motifs.
2. The Lab generates a stable deck and hides identifying metadata.
3. A reviewer submits guesses before reveal.
4. Exported JSON exposes confusion pairs, absent cues and difficult seeds.
5. A later implementation changes narrative rules or an engine—not individual favorable seeds.
6. The same seed deck is imported and regenerated for comparison.
7. Changes are accepted only when recognition improves without harming Civ V legality, accessibility, determinism or World Character variation.

## Completion gates

- [x] Contract, initial types, failure behavior and exclusions recorded.
- [x] Versioned side-effect-free session model implemented in `lib/identity-lab.ts`.
- [x] Deterministic shuffled deck and exact options retained and covered by feature tests.
- [x] Blind review, reveal, previous/next and replay workflow implemented.
- [x] Local persistence and rejecting JSON import/export implemented.
- [x] Aggregate recognition and confusion summary implemented.
- [x] Interface explains how JSON relates to the narrative guide.
- [x] Responsive and keyboard-accessible controls verified by source, type, lint and rendered-shell tests.
- [x] Feature tests, 83 regressions, lint, types, production and Pages builds pass.
- [x] Node 24 Alpine image built; its production server and rendered Lab shell were verified locally.
- [x] Register, feature record, README, request, diff and current code reconciled.
