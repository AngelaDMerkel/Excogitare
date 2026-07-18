# Narrative Rewrite Phase 0 Evidence

- **Captured:** 2026-07-17
- **Purpose:** Establish the pre-rewrite behavioral boundary. This is evidence of current behavior, not a claim that the approved rewrite is implemented.
- **Exact fixture:** [`rewrite-baseline.json`](rewrite-baseline.json)
- **Manual game matrix:** [`manual-civ5-load-matrix.md`](manual-civ5-load-matrix.md)

## Fixture classes

- **Invariant:** established correctness that later phases must preserve.
- **Characterization:** exact current behavior that may change only through deliberate fixture review.
- **Improvement:** a repeatable weak narrative baseline expected to change as its approved identity is implemented.

The exact corpus contains one deterministic Duel result for each engine, Standard recognition baselines for Lonely Oceans, Broken Island Chains, Great Watersheds and Glacial World, safe/Game-Breaking boundary definitions, and a generated Scenario characterization. The Scenario case intentionally records that current generated exports retain slots, starts, ownership, improvements and routes but do not yet provide the approved full city-record round trip.

## Existing synthetic regression coverage

The existing suite supplies the malformed and behavioral fixtures rather than storing private user maps:

- truncated geography recovery;
- corrupt scenario-marker normalization;
- missing, duplicate, impassable, overcrowded and unreachable starts;
- illegal resources and features;
- invalid, water-edge and dead-end rivers;
- safe and Game-Breaking geometry/tile-budget boundaries;
- history immutability and selective-regeneration isolation;
- viewport persistence and extreme-map fitting;
- mobile three-action rendering; and
- Civ5Map metadata, Scenario-start and tile round trips.

## Captured automated evidence

| Check | Result |
| --- | --- |
| Exact Phase 0 baseline | 1 passed; approximately 1.8 seconds |
| Rendered-shell suite | 16 passed |
| TypeScript suites, including baseline | 85 passed |
| Total automated tests | 101 passed |
| ESLint | Passed |
| TypeScript `--noEmit` | Passed |
| vinext production build | Passed |
| GitHub Pages static build/verification | Passed; 4 public files and 24 JavaScript bundles |

No new manual Civ V load was performed during Phase 0. Prior feature evidence remains recorded in its individual feature records, and the manual matrix must be rerun when writer behavior changes. Alpine is not recertified here because Phase 0 changed planning and test artifacts rather than application runtime behavior.

## Phase 1 reviewed fixture update

The fixture was deliberately regenerated after the generation substrate began retaining schema version, semantic IDs and lineage, input hashes, pass provenance, generator version and visible evidence state inside `GenerationStructure`. Review confirmed that all nine existing normalized-recipe, Civ5Map, tile and boundary digests remained unchanged; only the nine retained-structure digests changed. This is the intended evidence footprint of the substrate and does not claim a narrative-geography improvement.

## Review rule

Run `node --experimental-strip-types scripts/print-rewrite-baseline.ts` to inspect a candidate baseline. Updating the committed fixture with `--write` is permitted only after reviewing which invariant, characterization or improvement changed and recording the reason in the active feature record. A changed hash alone is neither a failure nor an improvement; the associated structural and validation evidence determines that.
