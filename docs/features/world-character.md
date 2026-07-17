# World Character

## Contract

- Status: Verified
- User outcome: World Character predictably changes how the selected generation engine expresses its own architecture. It must do more than perturb the seed, change descriptive text or rename a map.
- Scope: Realistic, Fantastical, Mundane and Brutal profiles; Excogitare, Eccentric, Physical and Polis integration; shared hydrology; deterministic seed behavior; Randomise; workers; history; selective regeneration; concise engine-specific interface explanations; README; legality and performance regressions.
- Failure behavior: Every character must preserve exact tile and water budgets, complete tile grids, accessible land, legal placements, continuous drainage, valid starts and deterministic output. If an engine cannot express a character-specific tendency without violating its hard contract, the hard contract wins.
- Exclusions: World Character does not replace Map Type, advanced engine controls, World Modifier, explicit climate/rainfall choices, resource settings or multiplayer settings. It biases internal composition and topology; it must not silently rewrite advanced selections. Brutal retains its already-disclosed Tournament, Balanced-start and minimum-mountain UI defaults.
- Compatibility: Existing stored `style` values remain authoritative and require no migration. The character remains part of the deterministic seed.

## Character semantics

| Character | Shared intent | Excogitare | Eccentric | Physical | Polis |
|---|---|---|---|---|---|
| Realistic | Coherent causality, connected systems and comparatively abundant drainage. | Refined fields, plate-led relief, altitude cooling and west-to-east rain shadows. | More latitude influence, fewer contradictory palettes, smoother regions and boundary ranges tied to plausible climate/coastal contrasts. | Stronger plate causality, moderate erosion, maritime continuity and restrained local variance. | Organic but legible terrain around the strategic graph, broader corridors and climate-led biomes. |
| Fantastical | Strong regional contrast, fragmentation and dramatic geographic transitions. | Maximum coordinate warp, fine coastline detail, regional climate variance and polygonal relief. | More irregular cells, additional biome collections, permitted contradictions, rugged boundary relief and fragmented realms. | More heterogeneous crust and relief, amplified but still causal climate extremes and stronger local variance. | Crooked fronts, narrower routes, irregular contested regions and more dramatic barriers around protected paths. |
| Mundane | Familiar, restrained, low-drama geography. | Minimal warp and detail, subdued relief and moderate climate variation. | Regularized cells, fewer collections, blended climates and shorter subdued boundary ranges. | Quieter relief, stronger erosion, weaker climate variance and broad conventional biomes. | Broad readable routes, lower barrier pressure, generous safe margins and low terrain noise. |
| Brutal | Hostile competitive geography with scarce easy movement but no inaccessible land. | Contested ridges, aridity, harsh terrain and an 18% mountain floor. | Rugged ranges, dry high-contrast realms and narrow deliberate passes. | Violent relief, weak moisture retention, strong continental extremes and an 18% mountain floor. | Narrow fronts, immediate contested pressure, high corridor barriers, exposed objectives and an 18% mountain floor from the normal UI workflow. |

## Requirements and evidence

| ID | Requirement | Evidence target | Status |
|---|---|---|---|
| CHAR-01 | One authoritative profile defines shared and engine-specific coefficients and copy for every character. | Exhaustive profile/type assertions. | Verified |
| CHAR-02 | Excogitare retains and centralizes its existing meaningful character behavior. | Directional warp, relief, climate, biome and river tests. | Verified |
| CHAR-03 | Eccentric applies character to subregion irregularity, climate collection count/dissonance, regional relief and boundary ranges while retaining its selected grammar and advanced controls. | Same-seed structure and composition matrix. | Verified |
| CHAR-04 | Physical applies character to plate activity, erosion, relief contrast, continentality, climate variance and atmospheric moisture while retaining its nine-pass causal model. | Same-seed tectonic/climate diagnostic matrix. | Verified |
| CHAR-05 | Polis applies character to route width, land-score texture, contested relief, barrier pressure and safe-territory character while preserving every required strategic route. | Same-seed graph/topology matrix and protected-route assertions. | Verified |
| CHAR-06 | Shared river generation uses the profile rather than an isolated style switch. | River source-count comparison and legality tests. | Verified |
| CHAR-07 | The Create interface explains the selected engine-specific consequences without adding another nested control panel. | Rendered-source assertion and copy review. | Verified |
| CHAR-08 | Character remains deterministic and survives options, Randomise, workers, history, export and selective regeneration. | Workflow and round-trip assertions. | Verified |
| CHAR-09 | Every engine/character combination remains accessible, start-correct, placement-legal and Repair-clean on representative seeds. | Sixteen-combination legality matrix. | Verified |
| CHAR-10 | README, feature register, types, lint, builds, tests, Pages and Alpine runtime agree with the shipped behavior. | Final reconciliation and verification log. | Verified |

## Completion gates

- [x] Contract, semantics, failure behavior and exclusions recorded.
- [x] Authoritative profile, defaults, Randomise, workers and cloning covered.
- [x] All sixteen engine/character domain behaviors implemented.
- [x] Interface explanation and safe reset behavior implemented.
- [x] Rendering consequences verified.
- [x] History and selective-regeneration consequences verified.
- [x] Export and round-trip consequences verified; Excogitare recipe metadata is intentionally not added to the Civ V binary, while the resulting tile data round-trips exactly.
- [x] Validation and Repair matrix passes.
- [x] Feature tests, regressions, lint, types and builds pass.
- [x] README/help wording reconciled.
- [x] Request, feature record, diff and code reconciled.

## Implementation sequence

1. Add a side-effect-free profile module with exhaustive character records, engine-specific coefficients and interface descriptions.
2. Replace the shared river style switch and Excogitare literals with profile values.
3. Layer profile coefficients into Eccentric without overwriting Fantasticality, Climate Logic, Region Contrast or World Extreme.
4. Layer profile coefficients into Physical without bypassing its preset, plate, erosion, rotation, seasonality or ocean-influence controls.
5. Layer profile coefficients into Polis while keeping its protected safe territories and strategic routes immutable.
6. Present the selected engine/character interpretation directly beneath the character choices.
7. Add profile, directional, deterministic, legality, selective-regeneration and rendered-interface tests.
8. Reconcile documentation and run all build/runtime gates.

## Verification evidence

- `pnpm exec tsc --noEmit` and `pnpm run lint` pass.
- `pnpm test` passes the production build, 15 interface assertions and 80 application tests. The focused feature coverage includes exhaustive profile copy, four distinct deterministic characters per engine, engine-specific directional diagnostics, sixteen Repair-clean engine/character combinations, exact water budgets, passability, start spacing, Civ5Map tile round-trips, Randomise coverage, history retention and layer-selective regeneration.
- `pnpm run test:pages` produces and verifies the independent static export: 4 public files and 24 JavaScript bundles.
- `node:24-alpine` image `excogitare:0.4.8` builds successfully, runs as container `excogitare`, and returns HTTP 200 on local port 3001.
