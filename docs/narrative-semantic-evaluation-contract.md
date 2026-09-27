# Narrative Semantic Evaluation — Contract 2B

## Status

The pure Phase 2 extractor, evaluator, nearest-confusion comparison and hand-built fixtures are implemented. Its original authorization excluded candidate selection, engine adaptation and persistence; later approved phases now call the same pure evaluator from bounded candidate negotiation and retain its result. The evaluator itself still cannot select a candidate, mutate a map, repair geography or fabricate missing evidence.

## Evaluation boundary

The authoritative semantic input is a complete legal-normalized candidate. Raw engine output remains separate engine-causality evidence and cannot prove that the final narrative survived.

## Canonical semantics

The common model may extract:

- landmasses, edge-connected oceans, enclosed seas, lakes and navigation basins;
- straits, canal-capable isthmuses, peninsulas and strategic corridors;
- mountain systems, broken ranges, saddles, passes, basins and plateaus;
- watersheds, sources, tributaries, trunks, outlets, deltas and endorheic systems;
- climate regions, transitions, rain shadows, refuges and hostile frontiers;
- start realms, city-state regions, route redundancy, centrality and population capacity;
- resource concentrations, value gradients, barren marches and contested objectives.

Measurements are topological and gameplay-relevant. Hex adjacency and the selected wrap model are authoritative. Counts and distances are normalized for area, Scale and population where the program requests it.

## Evidence

Every extracted object and metric records:

- a deterministic identifier;
- the supporting tiles or related objects;
- a confidence value;
- whether it was measured directly, inferred from tiles or corroborated by retained engine structure;
- a concise explanation.

Unavailable evidence remains unavailable. Retained engine labels cannot fabricate a semantic feature absent from the map.

## Evaluation

Every constraint is reported as `MET`, `WEAK`, `FAILED` or `UNAVAILABLE`, with its measured value, target, confidence, object references and explanation.

The whole program is reported as:

- `SATISFIED`;
- `WEAKENED`;
- `FAILED`; or
- `UNEVALUABLE`.

Essential and prohibited constraints form an identity floor. Preferred scores cannot compensate for a failed essential relationship or a present anti-motif.

Nearest-confusion risk is measured by evaluating the same extracted model against the intended program and its approved alternatives. A small score margin is ambiguous even when both scores are high.

## Purity and determinism

Extraction and evaluation:

- make no random calls;
- never mutate maps or retained structures;
- return defensive worker-safe data;
- produce deterministic input hashes;
- perform no repair or candidate selection;
- expose uncertainty rather than rounding it into success.

## Fixtures

The foundation requires hand-built hex fixtures for enclosed and edge-connected water, true and false straits, canal isthmuses, peninsulas, ranges and passes, valid and endorheic watersheds, strategic corridors, rain shadows, value gradients and wrap-boundary equivalence.

## Verification and limitations

- At the original Phase 2 checkpoint, TypeScript and targeted lint passed, hand-built fixtures covered the required topology, relief, hydrology, climate, gameplay, value and wrap cases, and generated Duel maps from all four engines extracted deterministically without mutation.
- Current reconstruction fixtures establish deterministic, non-mutating extraction and the essential-failure floor; the complete regression and lint matrix passes in the reconstruction record.
- Essential failure cannot be hidden by preferred scores; approved relaxation is explicit and is applied by the separate negotiation orchestrator rather than the evaluator.
- Nearest-confusion comparison evaluates the same model for every program, but remains structural evidence rather than human recognition.
- The former unchanged-baseline claim was specific to Phase 2. Runtime generation now imports the semantic module for read-only candidate assessment, and the deliberate native-grammar output changes were accepted only after the reviewed final baseline refresh whose digest begins `e6dae37…`.
- Climate and value semantics are necessarily inferred from final Civ V terrain and content.
- Runtime extraction is included in deterministic effort estimates and runs in the generation worker. Expensive structural detectors remain part of the generation budget, particularly on Huge maps; performance regressions must be measured rather than hidden behind elapsed-time cutoffs.
