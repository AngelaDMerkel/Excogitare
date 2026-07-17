# Start-location correctness

## Contract

- Status: Verified
- User outcome: Generated and imported maps disclose missing major starts, while generated or automatically rebalanced starts never begin fewer than five hexes apart.
- Scope: Create, Polis, validation, imported-map Repair, Competitive whole-layout balancing, Randomise, ordinary size recommendations, generated scenario export, export capability checks, tests and documentation.
- Exclusions: Do not replace an existing binary scenario section when it exposes no writable player slots. A geography-only file may receive a new scenario section. Do not alter engine geography, climate, rivers, resources or terrain.
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
| START-09 | Repair can select and apply missing-start reconstruction to generated and geography-only maps, while imported maps with existing slotless scenario data remain immutable. | Geography-only Repair/export regression plus existing-scenario zero-slot negative case. | Verified |
| START-10 | Exporting a generated map writes major and city-state scenario slots and coordinates so the exported file retains the generated start layout when reopened or loaded by Civ V. | Generate/export/reparse regression using Colossal and the attached Great Peninsulas failure case. | Verified |
| START-11 | Every generated and repaired major/city-state pair remains at least five hexes apart, including after binary export and reimport. | Pairwise major/minor spacing assertions before and after export. | Verified |
| START-12 | Fresh and repaired exports use Civ V's WorldBuilder scenario/version marker rather than a parser-only synthetic marker; geography-only exports do not falsely declare scenario content. | Raw header assertions for `0x8C` scenario and `0x0C` geography-only exports, plus comparison with installed Firaxis/WorldBuilder version 11 and 12 files. | Verified |

## Completion gates

- [x] Contract
- [x] Architecture and data lifecycle
- [x] Domain behavior
- [x] Interface and interaction
- [n/a] New rendering/layers — existing start markers are reused.
- [x] Editing/import/export round trip
- [x] Repair and validation
- [x] Feature-specific verification, type checking, lint, builds and Alpine runtime
- [x] Full regression suite
- [x] Documentation and claims
- [x] Final reconciliation

## Decisions

- Five hexes is a hard global minimum.
- Duel through Huge city-state recommendations become 2, 4, 6, 8, 10 and 12.
- Missing starts in imported maps with an existing but slotless scenario section remain a blocking error. Generated and geography-only maps are writable and must not be subjected to that limitation.

## Verification evidence

- Repair fixtures verify missing-start errors, writable-slot reconstruction, zero-slot refusal, overcrowding correction and Competitive whole-layout movement.
- Engine tests cover Excogitare, Eccentric, Physical and Polis, including sparse geography and stored actual population counts.
- Export/reimport tests verify generated and reconstructed scenario starts survive the `.Civ5Map` binary round trip.
- The attached `peninsula-realm-1t4c9pc-18g28ve.Civ5Map` was reproduced as a geography-only 137×137 export with six header players and zero scenario slots; Repair now proposes and round-trips six legal major plus six city-state records.
- The invalid repaired sample declared scenario/version byte `0x1C`. Installed Firaxis and WorldBuilder files use `0x8C` for version 12 scenario maps (`0x8B` for version 11), while the working geography-only Great Peninsulas source uses `0x0C`. Repair now identifies the malformed marker as a Safe structural correction and the writer derives the marker from the actual presence of scenario data.
- `tsc --noEmit`, ESLint, the production Vinext build, the GitHub Pages build/verification and rendered-interface tests pass.
- The Node 24 Alpine image rebuilt and serves HTTP 200 from the replacement container on port 3001.
- The complete application regression run passes 76 of 76 tests, including all-engine Colossal placement, generated-scenario export, geography-only headers, and malformed-marker Repair.
