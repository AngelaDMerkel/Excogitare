# Extended tile budgets

## Contract

- Status: Verified
- User outcome: Generate two community-derived non-stock tile budgets without mistaking them for universally safe Civ V dimensions.
- Scope: Size registry, Create and Lua selectors, Randomise, deterministic worker generation, history/settings, `.Civ5Map` round trip, warnings, tests and documentation.
- Exclusions: No Civ V XML/DLL/WorldBuilder patching and no stability guarantee for Civ V, hardware or mod stacks.
- Risks: Civ V or WorldBuilder may reject/crash on non-stock dimensions; browser and late-game resource use increases.

## Requirements and evidence

| ID | Requirement | Verification | Status |
|---|---|---|---|
| SIZE-01 | Extreme is exactly 180×94 / 16,920 tiles. | Dimension/budget and round-trip assertions. | Verified |
| SIZE-02 | Colossal is exactly 170×110 / 18,700 tiles. | Dimension/budget and round-trip assertions. | Verified |
| SIZE-03 | Both are hidden until the existing Game Breaking checkbox and second modal are confirmed. | Rendered-interface and live-browser assertions. | Verified |
| SIZE-04 | Safe Randomise excludes both; confirmed unsafe Randomise can select both. | Deterministic pool-coverage tests. | Verified |
| SIZE-05 | Disabling permission normalizes unsafe size/geometry to Huge/Standard. | State/source and live-browser assertions. | Verified |
| SIZE-06 | Fixed settings remain deterministic and serialize/parse exactly. | Complete-output and binary round-trip tests. | Verified |
| SIZE-07 | Create and Lua use the same filtered registry. | Rendered-interface and production tests. | Verified |
| SIZE-08 | UI/README clearly state experimental community dimensions and risks. | Copy/documentation review. | Verified |

## Completion gates

- [x] Contract
- [x] Architecture and data lifecycle
- [x] Domain behavior
- [x] Interface and interaction
- [x] Rendering/history/import/export integration
- [x] Feature-specific verification, type checking, lint, builds and Alpine runtime
- [x] Full regression suite
- [x] Documentation and claims
- [x] Final reconciliation

## Decisions

- Gate both budgets behind the existing double-confirmed Game Breaking permission.
- Use exact community dimensions rather than inventing intermediate budgets.
- Keep recommended city states at roughly one per major.

## Verification evidence

- Exact dimension, tile-count, deterministic generation and binary round-trip tests pass for Extreme and Colossal; generating and round-tripping both budgets together takes under one second on the local test runtime.
- Randomise pool tests prove safe mode excludes both budgets and confirmed unsafe mode can reach both.
- Rendered-interface tests cover the shared Create/Lua filter, warning copy and normalization paths.
- A live production-container interaction verified that the budgets begin hidden, appear only after the second crash-risk confirmation, and disappear again when permission is disabled; an active Extreme choice normalizes to Huge and no browser errors are emitted.
- `tsc --noEmit`, ESLint, the production Vinext build, the GitHub Pages build/verification and rendered-interface tests pass.
- The Node 24 Alpine image rebuilt and serves HTTP 200 from the replacement container on port 3001.
- The complete regression run now passes 66 of 66 tests, including Eccentric Pin/String inland-water retention.
