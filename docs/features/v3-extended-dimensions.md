# V3 extended dimensions

Status: **Implemented**. Automated and browser checks below are verified; Alpine is unavailable locally.

## Contract

The user requests the extreme aspect ratios and extended sizes already introduced in V1. Both Standard and Advanced must offer Duel, Tiny, Small, Standard, Large, Huge, Extreme and Colossal; Geometry must offer Standard, Wide, Tall, Square, Needle, Ribbon, Pin and String. Use the existing native dimensions: Extreme 180×94 and Colossal 170×110 at Standard geometry; aspect ratios preserve the tile budget subject to native integer rounding/minimum dimensions. Needle/Ribbon are 1:12/12:1 and Pin/String are 1:40/40:1 in grid dimensions.

Share the catalogue between worker validation and browser selectors. Explicit selections must reach the engine unchanged, retain their provenance/history and serialize/parse at the same dimensions. The V1 Game Breaking UI remains unchanged. V3 exposes the requested choices directly in its existing dropdowns; mark the non-stock options Experimental and report the existing Civ V compatibility boundary in Map details without introducing another sidebar mode or confirmation workflow. Defaults remain Standard. Mobile retains its compact generation policy. The optional Randomise preference received no answer during implementation, so extended dimensions require explicit selection. Desktop Randomise retains Tiny–Huge and the four existing geometries; mobile retains Tiny–Standard and those geometries. This keeps prior random seeds stable.

## Acceptance and applicable gates

- Validate all native size/geometry IDs in Standard and Advanced; reject unknown values without silently coercing explicit choices.
- Keep seeded requests deterministic and preserve existing non-experimental Randomise behavior; verify any newly opted-in pool explicitly.
- Exercise all four added geometries, both extended sizes, a combined Colossal/Ribbon request, and the four native engines. Check actual finished dimensions, population/placement/shape acceptance and binary geography round trips.
- Verify browser selection, independent drafts, generation worker, history provenance and responsive sidebar. Retain cancellation/failure handling and the accepted map on rejection.
- V3 Refine/import do not need new dimension conversion; they continue to retain native map grids. Existing legality and game-export boundaries remain unchanged. No new claim about in-game support or fixed starts.
- Run the V3 regression suite, relevant dimension/round-trip checks, types/lint and production/Pages packaging. Alpine applies only if the daemon is available. Reconcile register, README, record and code; preserve unrelated changes, no commits/pushes.


## Delivered implementation

- `lib/v3/dimensions.ts` provides the shared catalogue, using the native size registry. `request.ts` validates the full catalogue in both modes. The existing dimension solver realizes every explicit selection; no clamping or geometry substitution is added.
- `scripts/build-v3.mjs` derives a 1.1KB browser catalogue from the same module. Both sets of dropdowns consume it, grouping the two large sizes and four extreme geometries under **Experimental**. Standard also gains Duel. The selected preview aliases and production bundle include the catalogue.
- Final assessment reports the non-stock Civ V/WorldBuilder compatibility limitation. This informational warning alone does not cause extra generation attempts; existing opportunity/water warnings still do. No new sidebar mode or consent dialog is introduced. The original V1 permission mechanism remains untouched.

## Verification evidence

- **28/28 V3 regression tests pass.** The four added tests cover all **128** size/geometry/mode combinations through normalization/planning, invalid values, preserved desktop/mobile random pools, deterministic Ribbon replay, and **23** generated-map binary round trips. These include Standard's four added geometries and two larger sizes, all four extreme geometries across all four native engines in Advanced, and Colossal Ribbon at **474×39**. Tests assert finished-map acceptance and four major starts as well as exact dimensions and terrain/resource preservation.
- The initial [23-case probe](../verification/v3-extended-dimensions-probe.json) produced 22 accepted maps. Tiny/String with the default four-player Standard plan rejected its seed because it could not provide enough viable starting land. The rejected request was not silently changed. Standard-sized String and Advanced Tiny/String are covered by passing acceptance/round-trip tests. Narrow maps can still require more land, a larger size or fewer players.
- The actual browser lists all eight sizes and eight geometries in both editors. Colossal/Ribbon selections survive switching between Standard and Advanced; all eleven Standard dropdowns remain visible at the current narrow desktop size.
- The browser worker generated the Colossal Ribbon request using seed `extended-dimensions-22`, Excogitare/Crooked Continents, four majors and two city states. The 100-entry history retained the accepted map and its seed through reload. Map details shows the compatibility note and measured starting-opportunity difference. No browser errors or warnings were observed. [Preview](../../mockups/v3/extended-dimensions-preview.jpg).
- Repository TypeScript and ESLint, JavaScript syntax, production build, **23/23** rendered-interface tests, Pages build and the Pages asset verifier pass. Docker's daemon socket is unavailable, so Alpine was not run.

## Final gate reconciliation and limits

Data defaults, preserved drafts, worker requests, seed replay and clone/serialization boundaries are covered above. Rendering and history were checked in the live app. Refine, imports, selected regeneration and legality rules receive no new behavior; existing grids are not resized or migrated. V3's current accepted-only history and cancellation/failure contract remains active. The README, feature register, controls, validator, planner, assessment and build output were compared against this contract. No commits or pushes; unrelated V2 work is preserved.

The binary checks prove geography preservation, not Civ V stability or fixed starting positions. Colossal and the extreme aspect ratios remain experimental in the game, as in V1. This implementation does not promise that every tiny/narrow/high-water combination can support every population. Existing snapshots are unchanged; new extended maps use the same version-2 landform pipeline.
