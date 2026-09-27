# Narrative Rewrite Phase 0 Evidence

- **Captured:** 2026-07-17
- **Purpose:** Establish the pre-rewrite behavioral boundary at the time of capture. This is historical evidence, not a claim about current reconstructed behavior or proof that the approved rewrite is complete.
- **Exact fixture:** [`rewrite-baseline.json`](rewrite-baseline.json)
- **Manual game matrix:** [`manual-civ5-load-matrix.md`](manual-civ5-load-matrix.md)

## Fixture classes

- **Invariant:** established correctness that later phases must preserve.
- **Characterization:** exact current behavior that may change only through deliberate fixture review.
- **Improvement:** a repeatable weak narrative baseline expected to change as its approved identity is implemented.

The exact corpus contains one deterministic Duel result for each engine, Standard recognition baselines for Lonely Oceans, Broken Island Chains, Great Watersheds and Glacial World, safe/Game-Breaking boundary definitions, and a project-side Scenario-intent characterization. The Scenario case records that starts, ownership, improvements and routes remain in authored project state while the ordinary Civ5Map export contains geography only.

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

Every result in this table belongs to the dated Phase 0 checkpoint. It must not be reused as a current reconstruction test or packaging result.

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

The Phase 1 completion pass deliberately updated those same nine structure digests a second time when the coarse Engine record was divided into Topology, Relief and Climate dependencies and per-pass evidence state was added. Normalized recipes, serialized Civ5Map bytes, tile digests and every boundary digest again remained unchanged. This update records more precise provenance and invalidation only; it does not recast an unchanged map as a narrative improvement.

## Phase 3 reviewed fixture update

The fixture was deliberately regenerated after Scale became generative rather than declarative. The default recipe remains Global, so every characterization now records the Global engine profile and its retained diagnostics. Excogitare consequently samples more independent field systems; Eccentric retains its approved dense mesh while compiling more major systems; Physical samples a global plate and climate window; and Polis adjusts strategic travel before terrain. Tile, structure and serialized Civ5Map digests therefore change by design, while dimensions, requested water, start legality, scenario round trip and validation boundaries remain intact. The four recognition cases are still improvement baselines rather than claims that their Phase 4 narrative identities are complete.

## Phase 4 reviewed fixture update

The four Improvement cases now use their approved narrative defaults instead of inheriting the global `55%` water and `16%` mountain defaults. Lonely Oceans is `89/7`; Broken Island Chains is `78/16`; Great Watersheds is `35/15` with Dense rivers; Glacial World is `40/15` with Cool climate and Extreme seasonality. Their retained structures and tiles change deliberately because generation now compiles a narrative skeleton before starts and content rather than merely attaching a label afterward.

Review found exact water targets, zero validation errors and retained narrative scores of 98, 88, 100 and 96 respectively. Lonely Oceans contains eight isolated continents for eight major starts and deliberately reduces city states to zero. Broken Island Chains retains seven parent paths and its anchor regions. Great Watersheds retains twelve trunk/tributary paths, 98 river tiles and 17 water basins. Glacial World retains two ice sheets, six refuges and valuable cold-region resources. Characterization cases retain identical tile and Civ5Map digests; their structure digests alone change because Profile-only skeletons and honest `UNASSESSED` assessments are now retained. The Scenario fixture changes only in retained structure for the same reason.

## Phase 5 reviewed fixture update

The Excogitare, Eccentric and Physical characterization cases and the Pangaea Scenario case deliberately change because those formerly Profile-only Map Types now compile authoritative narrative terrain before starts and content. Their tile, structure and serialized Civ5Map digests therefore change together. The Polis characterization remains Profile-only; its structure changes only through the shared exact-mountain and protected-route accessibility pass. The four Phase 4 Improvement cases retain their approved identities and exact water levels, while some structure digests change because the shared realizer now preserves the owning engine's complete geographic-object catalogue.

Review confirmed that all nine cases retain exact dimensions, requested water, requested major and city-state counts except Lonely Oceans' intentional zero city states, parse/serialize start records and zero validation errors. The three newly compiled characterization cases score 86, 96 and 98; the Scenario Pangaea scores 98. Existing benchmark scores remain 98, 88, 100 and 96. This is a deliberate identity improvement, not a hash-only refresh.

## Phase 6 reviewed fixture update

The Polis characterization deliberately changes because Imperial Ring is no longer Profile-only. Its graph now retains the Map Type, normalized Match Intent, realm roles, route redundancy, route width, city-state contestability and five victory-feasibility findings. Its two-player Duel fixture has the maximum possible one-edge capital graph, two contested regions, exact requested water and population, no validation errors and a narrative score of 82 (B). One resource tile moves under the newly active objective-value narrative pass, so the tile and serialized Civ5Map digests change together; no writer format or scenario contract changed. All nine retained-structure digests change because every engine now records the same five-part Match Intent assessment boundary; the eight non-Polis tile and Civ5Map digests remain unchanged. This is the reviewed evidence footprint of Phase 6 rather than a hash-only refresh.

## Geography-only writer correction

The fixture is deliberately regenerated after representative Excogitare exports failed to load in Civilization V. Comparison with installed Firaxis-authored maps showed that the compact generated scenario envelope lacked required type dictionaries and opaque game-option payloads; its successful self-parse was not compatibility evidence. Generated Civ5Map hashes therefore change because ordinary exports now end after the geography grid, and all reparsed Scenario-only counts become zero. In-memory and `.excogitare` project intent remains unchanged. A separate regression recognizes the exact legacy Excogitare 1.3.2 envelope and removes it on re-export while excluding unrelated authored scenarios.

## Reviewed native engine–narrative reconstruction update — 2026-08-16

The fixture was deliberately regenerated after all thirty-three Narrative Map Types moved from the shared post-generation topology realizer into strict owner-engine grammars. Excogitare now compiles semantic requests into continuous fields, Eccentric reserves graph regions and relationships, Physical installs causal initial and boundary conditions, and Polis builds roster-aware strategic graphs before geographic disguise. The old `realizeNarrativeGeography`, exact-mask and topology-rebuild runtime definitions remain deleted.

Review regenerated the complete nine-case candidate twice and obtained the same normalized capture digest, `e6dae37f1762960faadd94b0d8064e1cb9cbbaaa1c2212ef38464363e7868044`, both times. Every normalized recipe and requested land/water/start boundary remained unchanged relative to the provisional fixture. All nine tile, Civ5Map and retained-structure digests changed because final native cause realization, exact binding, hydrology, content and strategic-route hardening altered game geography rather than merely adding metadata. The most material recorded corrections include eliminating Lonely Oceans' prior validation error, increasing Great Watersheds' encoded river coverage from 73 to 132 owner plots, and retaining the final field, graph, physical and strategic causal inventories in structure diagnostics. The final Tectonic Continents correction binds every rift to one continuous route between its exact historical shores and removes the previously needed active-margin relaxation.

Every case has `PROVEN` native evidence, no essential or prohibited semantic failure, clean Repair output and `SATISFIED` content evidence wherever content applies. Lonely Oceans, Broken Island Chains and Glacial World select explicit authored relaxation prefixes; those consequences remain retained rather than being hidden behind an aggregate score. The other six cases require no authored relaxation. This review accepts the new deterministic bytes as the reconstruction baseline; it does not claim human blind recognition, multiplayer balance or successful loading in Civilization V.

The prior Phase 0 statement that game-output hashes were unchanged described the observation-only architecture at that time and is historical. Native generation intentionally supersedes those bytes.

## Review rule

Run `node --experimental-strip-types scripts/print-rewrite-baseline.ts` to inspect a candidate baseline. Updating the committed fixture with `--write` is permitted only after reviewing which invariant, characterization or improvement changed and recording the reason in the active feature record. A changed hash alone is neither a failure nor an improvement; the associated structural and validation evidence determines that.
