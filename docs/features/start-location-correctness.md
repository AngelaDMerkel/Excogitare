# Start-location correctness

## Contract

- Status: Verified
- User outcome: Generated and imported maps disclose missing major starts, while generated or automatically rebalanced starts never begin fewer than five hexes apart.
- Scope: Create, Polis, validation, imported-map Repair, Competitive whole-layout balancing, Randomise, ordinary size recommendations, export capability checks, tests and documentation.
- Exclusions: Do not invent binary scenario-player records when an imported file exposes no writable slots. Do not alter engine geography, climate, rivers, resources or terrain.
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
- Missing starts without writable scenario slots remain a blocking error.

## Verification evidence

- Repair fixtures verify missing-start errors, writable-slot reconstruction, zero-slot refusal, overcrowding correction and Competitive whole-layout movement.
- Engine tests cover Excogitare, Eccentric, Physical and Polis, including sparse geography and stored actual population counts.
- Export/reimport tests verify reconstructed scenario starts survive the `.Civ5Map` binary round trip.
- `tsc --noEmit`, ESLint, the production Vinext build, the GitHub Pages build/verification and rendered-interface tests pass.
- The Node 24 Alpine image rebuilt and serves HTTP 200 from the replacement container on port 3001.
- The complete regression run now passes 66 of 66 tests, including Eccentric Pin/String inland-water retention.
