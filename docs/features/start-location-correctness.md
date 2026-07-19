# Start-location correctness

## Contract

- Status: Partial. In-memory generation and imported-scenario correction are verified; ordinary Create exports deliberately leave start assignment to Civ V.
- User outcome: Generated project plans and imported scenarios disclose missing major starts, while generated or automatically rebalanced starts never begin fewer than five hexes apart. Ordinary geography maps use Civ V's runtime assignment and are not misdiagnosed as broken scenarios.
- Scope: Create, Polis, validation, imported-map Repair, Competitive whole-layout balancing, Randomise, ordinary size recommendations, project persistence, imported-scenario export capability checks, tests and documentation.
- Exclusions: Ordinary Create `.Civ5Map` files do not retain generated starts. Do not fabricate a scenario section for geography-only files or replace an existing scenario section when it exposes no writable player slots.
- Risks: Sparse geography may not fit every requested minor power. Fewer city states are preferable to illegal spacing.

## Requirements and evidence

| ID | Requirement | Verification | Status |
|---|---|---|---|
| START-01 | Zero major starts is always a validation error. | Empty-start regression. | Verified |
| START-02 | Repair rebuilds missing starts only when writable scenario player slots exist. | Repair/export/reimport fixture and zero-slot negative case. | Verified |
| START-03 | Every major/city-state pair is at least five hexes apart. | All-engine matrix plus deliberately broken layouts. | Verified |
| START-04 | Competitive Repair performs a visible whole-layout rebalance. | Coordinates change while flags, legality and spacing remain valid. | Verified |
| START-05 | Ordinary defaults use roughly one city state per major and Randomise is capacity-conscious. | Default and randomized-option assertions. | Verified |
| START-06 | Polis and ordinary generation reduce impossible populations rather than crowding starts. | Sparse-map capacity regressions and stored actual counts. | Verified |
| START-07 | Repair claims match export capability. | Parsed slot metadata and round-trip assertions. | Verified |
| START-08 | Every generated Colossal map either contains the requested legal major starts or explicitly reduces an impossible request; zero major starts is never a successful generation. | All-engine Colossal regression with ordinary player counts. | Verified |
| START-09 | Repair can reconstruct missing starts for design review and project persistence, but only existing imported scenario slots may retain them in a Civ5Map export. | Geography-only non-persistence and existing-slot round-trip regressions. | Verified |
| START-10 | Ordinary generated map export omits synthetic scenario slots and explicitly discloses that Civ V will assign runtime starts. | Geography-only marker, EOF and reparse regression. | Verified |
| START-11 | Every generated and repaired major/city-state pair remains at least five hexes apart inside Excogitare and downloaded projects. | Pairwise major/minor spacing assertions before project export. | Verified |
| START-12 | Fresh Create exports use a geography-only version marker. Existing imported scenarios retain their original valid marker and opaque payload. | Raw header and byte-preservation assertions. | Verified |
| START-13 | Applying any selected Repair profile is transactional: the final corrected terrain, cities and complete start layout are revalidated together, and no major, city-state or city may remain on water, a mountain, a natural wonder, an occupied city tile or another start. | Synthetic conflicting terrain/start repair, Competitive whole-layout repair, binary export/reimport and post-Repair validation regressions. | Verified |

## Completion gates

- [x] Contract
- [x] Architecture and data lifecycle
- [x] Domain behavior
- [x] Interface and interaction
- [n/a] New rendering/layers — existing start markers are reused.
- [x] Editing/import/export round trip
- [x] Repair and validation — final-state replanning and atomic failure covered.
- [x] Feature-specific verification, type checking, lint, builds and Alpine runtime
- [x] Full regression suite
- [x] Documentation and claims
- [x] Final reconciliation

## Decisions

- Five hexes is a hard global minimum.
- Duel through Huge city-state recommendations become 2, 4, 6, 8, 10 and 12.
- Missing starts in imported maps with an existing but slotless scenario section remain a blocking fixed-Scenario error. Generated maps retain their designed starts in project state; geography-only imports rely on Civ V runtime placement and are not converted into scenarios.
- A complete-layout mutation must be planned against the terrain state that will actually be exported, not against a pre-repair snapshot that another selected mutation invalidates.

## Verification evidence

- Repair fixtures verify missing-start errors, writable-slot reconstruction, zero-slot refusal, overcrowding correction and Competitive whole-layout movement.
- Engine tests cover Excogitare, Eccentric, Physical and Polis, including sparse geography and stored actual population counts.
- Generated starts survive `.excogitare` project round trips. Ordinary `.Civ5Map` exports intentionally omit them and rely on Civ V's normal runtime placement.
- The attached `peninsula-realm-1t4c9pc-18g28ve.Civ5Map` is a geography-only 137×137 map with no scenario slots. Repair now identifies that as normal runtime start assignment rather than offering an unsafe scenario conversion.
- The invalid repaired sample declared scenario/version byte `0x1C`. Installed Firaxis and WorldBuilder files use `0x8C` for version 12 scenario maps (`0x8B` for version 11), while the working geography-only Great Peninsulas source uses `0x0C`. Repair now identifies the malformed marker as a Safe structural correction and the writer derives the marker from the actual presence of scenario data.
- Applying Competitive start replacement alongside a terrain correction now discards the stale proposal and plans again against the final tile grid. If the requested population cannot be placed legally, the complete transaction leaves the original map unchanged.
- The supplied failed exports demonstrated that a compact marker-8 section with bounded coordinates is not enough to make a valid Scenario. The generated writer has therefore been removed from ordinary and Repair export paths.
- `tsc --noEmit`, ESLint, the production Vinext build, the GitHub Pages build/verification and rendered-interface tests pass.
- The Node 24 Alpine image rebuilt and serves HTTP 200 from the replacement container on port 3001.
- The former generated-scenario export evidence was invalid because it tested Excogitare's parser against Excogitare's writer. Representative Civ V loads rejected the output; the regression boundary is being replaced with geography-only export and imported-scenario preservation tests.
